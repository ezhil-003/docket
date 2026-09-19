import fs from "node:fs/promises";
import path from "node:path";
import { assembleHtmlAsync } from "./assemble";
import { lintMarkdown } from "./lint";
import { DocketError, MarkdownLintError, RenderError, PuppeteerRenderError } from "./errors";
import type { ThemeId } from "./themes";
import { normalizePdfOutputPath } from "./output";
import { extractFrontmatter } from "./frontmatter";
import { launchCdpBrowser, CdpBrowser, CdpPage } from "./cdp";
import { NodeFileSystem } from "./fs";

export type { CdpBrowser as Browser, CdpPage as Page };

export interface RenderOptions {
  markdownSource: string;
  outputPath: string;
  themeId?: ThemeId;
  customCssPath?: string;
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
  title?: string;
}

export interface BrowserLike {
  connected: boolean;
  newPage(): Promise<CdpPage>;
  close(): Promise<void>;
}

export interface BrowserFactory {
  launch(): Promise<BrowserLike>;
}

class CdpBrowserFactory implements BrowserFactory {
  async launch(): Promise<BrowserLike> {
    return launchCdpBrowser();
  }
}

/** Owns Chromium lifetime; callers own individual pages. */
export class BrowserManager {
  private browser: BrowserLike | null = null;
  private launchPromise: Promise<BrowserLike> | null = null;

  constructor(private readonly factory: BrowserFactory = new CdpBrowserFactory()) {}

  async acquirePage(): Promise<CdpPage> {
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

  private async acquireBrowser(): Promise<BrowserLike> {
    if (this.browser?.connected) return this.browser;
    if (this.browser && !this.browser.connected) {
      await this.close();
    }
    if (!this.launchPromise) {
      this.launchPromise = this.factory.launch().catch((error) => {
        this.launchPromise = null;
        throw new PuppeteerRenderError(
          `Failed to launch headless Chromium browser: ${error instanceof Error ? error.message : String(error)}`,
          "Install Chrome/Chromium or set DOCKET_CHROME_PATH.",
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

  const frontmatter = extractFrontmatter(options.markdownSource);
  const themeId = options.themeId ?? frontmatter.theme ?? "executive";
  const customCssPath = options.customCssPath ?? (typeof frontmatter.metadata.customCss === "string" ? frontmatter.metadata.customCss : undefined);
  const outputPath = await normalizePdfOutputPath(options.outputPath);
  const title = options.title ?? frontmatter.title ?? (path.basename(outputPath, ".pdf") || "Docket Document");
  const html = await assembleHtmlAsync(options.markdownSource, themeId, title, customCssPath);

  if (options.dryRunHtmlPath) {
    await defaultFileSystem.writeTextAtomic(options.dryRunHtmlPath, html);
    if (options.dryRunOnly) {
      const stats = await fs.stat(options.dryRunHtmlPath);
      return {
        outputPath: options.dryRunHtmlPath,
        bytes: stats.size,
        durationMs: Date.now() - startTime,
        title,
      };
    }
  }
  await defaultFileSystem.ensureDirectory(path.dirname(outputPath));

  throwIfAborted(options.signal);
  let page: CdpPage | null = null;
  const temporaryPdfPath = `${outputPath}.tmp-${Bun.randomUUIDv7()}`;
  try {
    page = await browserManager.acquirePage();
    throwIfAborted(options.signal);

    await page.setDocumentContent(html);
    throwIfAborted(options.signal);

    await page.waitForFonts(Math.min(timeoutMs, 10_000));
    await page.evaluate("document.body.offsetHeight");
    throwIfAborted(options.signal);

    const pdfBuffer = await page.printToPdf({
      printBackground: true,
      preferCSSPageSize: true,
      paperWidth: 8.27,
      paperHeight: 11.69,
      marginTop: 0,
      marginBottom: 0,
      marginLeft: 0,
      marginRight: 0,
    });

    await Bun.write(temporaryPdfPath, pdfBuffer);
    await fs.rename(temporaryPdfPath, outputPath);

    return { outputPath, bytes: pdfBuffer.length, durationMs: Date.now() - startTime, title };
  } catch (error) {
    try { await Bun.file(temporaryPdfPath).delete(); } catch { /* best effort */ }
    if (error instanceof DocketError) {
      throw error;
    }
    throw new PuppeteerRenderError(
      `PDF conversion failed: ${error instanceof Error ? error.message : String(error)}`,
      "Verify Chromium, fonts, output permissions, and available disk space.",
      { cause: error },
    );
  } finally {
    if (page) {
      try { await page.close(); } catch { /* browser manager remains reusable */ }
    }
  }
}
