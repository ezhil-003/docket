import puppeteer, { type Browser, type Page } from "puppeteer";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { assembleHtmlAsync } from "./assemble";
import { lintMarkdown } from "./lint";
import { DocketError, MarkdownLintError, PuppeteerRenderError, FileAccessError } from "./errors";
import type { ThemeId } from "./themes";
import { normalizePdfOutputPath } from "./output";

export interface RenderOptions {
  markdownSource: string;
  themeId?: ThemeId;
  outputPath: string;
  title?: string;
  dryRunHtmlPath?: string;
  dryRunOnly?: boolean;
  skipLinting?: boolean;
  signal?: AbortSignal;
  timeoutMs?: number;
}

export interface RenderResult {
  outputPath: string;
  bytes: number;
  durationMs: number;
}

export interface BrowserFactory {
  launch(): Promise<Browser>;
}

class PuppeteerBrowserFactory implements BrowserFactory {
  async launch(): Promise<Browser> {
    return puppeteer.launch({
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--no-first-run",
        "--disable-gpu",
      ],
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
    });
  }
}

/** Owns Chromium lifetime; callers own individual pages. */
export class BrowserManager {
  private browser: Browser | null = null;
  private launchPromise: Promise<Browser> | null = null;

  constructor(private readonly factory: BrowserFactory = new PuppeteerBrowserFactory()) {}

  async acquirePage(): Promise<Page> {
    const browser = await this.acquireBrowser();
    try {
      return await browser.newPage();
    } catch (error) {
      throw new PuppeteerRenderError(
        `Failed to create Chromium page: ${error instanceof Error ? error.message : String(error)}`,
        "Check the Chromium installation and available system resources.",
      );
    }
  }

  async close(): Promise<void> {
    const browser = this.browser;
    this.browser = null;
    this.launchPromise = null;
    if (browser) {
      try {
        await browser.close();
      } catch {
        // Shutdown is best effort and must remain idempotent.
      }
    }
  }

  private async acquireBrowser(): Promise<Browser> {
    // Puppeteer keeps the Browser object around after Chromium disconnects.
    // Do not hand that stale object to the next render.
    if (this.browser?.connected) return this.browser;
    if (this.browser && !this.browser.connected) {
      await this.close();
    }
    if (!this.launchPromise) {
      this.launchPromise = this.factory.launch().catch((error) => {
        this.launchPromise = null;
        throw new PuppeteerRenderError(
          `Failed to launch headless Chromium browser: ${error instanceof Error ? error.message : String(error)}`,
          "Install Chrome/Chromium or set PUPPETEER_EXECUTABLE_PATH.",
        );
      });
    }
    this.browser = await this.launchPromise;
    this.launchPromise = null;
    return this.browser;
  }
}

const defaultBrowserManager = new BrowserManager();

export function getDefaultBrowserManager(): BrowserManager {
  return defaultBrowserManager;
}

export async function shutdownRenderer(): Promise<void> {
  await defaultBrowserManager.close();
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new PuppeteerRenderError("Rendering was cancelled.", "Start the conversion again when ready.");
  }
}

async function waitForFonts(page: Page, timeoutMs: number): Promise<void> {
  await page.evaluate(async (timeout) => {
    if (!("fonts" in document)) return;
    await Promise.race([
      document.fonts.ready,
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("Font loading timed out")), timeout)),
    ]);
  }, timeoutMs);
}

import { NodeFileSystem } from "./fs";

const defaultFileSystem = new NodeFileSystem();

/** Executes the conversion pipeline and publishes only complete output files. */
export async function renderPdf(
  options: RenderOptions,
  browserManager: BrowserManager = defaultBrowserManager,
): Promise<RenderResult> {
  const startTime = Date.now();
  const timeoutMs = options.timeoutMs ?? 30_000;
  throwIfAborted(options.signal);

  if (!options.skipLinting) {
    const lintResult = lintMarkdown(options.markdownSource);
    if (!lintResult.isValid) {
      const firstError = lintResult.errors[0];
      if (firstError) {
        throw new MarkdownLintError(
          `Critical syntax error on line ${firstError.line}: ${firstError.message}`,
          firstError.suggestion,
        );
      }
    }
  }

  const themeId = options.themeId ?? "executive";
  const outputPath = await normalizePdfOutputPath(options.outputPath);
  const title = options.title ?? (path.basename(outputPath, ".pdf") || "Docket Document");
  const html = await assembleHtmlAsync(options.markdownSource, themeId, title);

  if (options.dryRunHtmlPath) {
    await defaultFileSystem.writeTextAtomic(options.dryRunHtmlPath, html);
    if (options.dryRunOnly) {
      const stats = await fs.stat(options.dryRunHtmlPath);
      return {
        outputPath: options.dryRunHtmlPath,
        bytes: stats.size,
        durationMs: Date.now() - startTime,
      };
    }
  }
  await defaultFileSystem.ensureDirectory(path.dirname(outputPath));

  throwIfAborted(options.signal);
  let page: Page | null = null;
  const temporaryPdfPath = `${outputPath}.tmp-${randomUUID()}`;
  try {
    page = await browserManager.acquirePage();
    // Markdown is rendered as static HTML. Disabling page scripts prevents raw
    // HTML from executing code if an untrusted document reaches this pipeline.
    await page.setJavaScriptEnabled(false);
    await page.setContent(html, { waitUntil: "domcontentloaded", timeout: timeoutMs });
    try {
      await page.waitForNetworkIdle({ idleTime: 100, timeout: Math.min(timeoutMs, 5_000) });
    } catch {
      // Graceful fallback for offline or restricted network environments
    }
    throwIfAborted(options.signal);
    await waitForFonts(page, timeoutMs);
    await page.evaluate(() => document.body.offsetHeight);
    throwIfAborted(options.signal);

    await page.pdf({
      path: temporaryPdfPath,
      format: "A4",
      printBackground: true,
      preferCSSPageSize: true,
      margin: { top: "0", right: "0", bottom: "0", left: "0" },
    });
    await fs.rename(temporaryPdfPath, outputPath);
    const stats = await fs.stat(outputPath);
    return { outputPath, bytes: stats.size, durationMs: Date.now() - startTime };
  } catch (error) {
    try { await fs.unlink(temporaryPdfPath); } catch { /* best effort */ }
    if (error instanceof DocketError) {
      throw error;
    }
    throw new PuppeteerRenderError(
      `PDF conversion failed: ${error instanceof Error ? error.message : String(error)}`,
      "Verify Chromium, fonts, output permissions, and available disk space.",
    );
  } finally {
    if (page) {
      try { await page.close(); } catch { /* browser manager remains reusable */ }
    }
  }
}
