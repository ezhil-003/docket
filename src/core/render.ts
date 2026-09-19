import fs from "node:fs/promises";
import path from "node:path";
import { assembleHtmlAsync } from "./assemble";
import { lintMarkdown } from "./lint";
import { DocketError, MarkdownLintError, PuppeteerRenderError } from "./errors";
import type { ThemeId } from "./themes";
import { normalizePdfOutputPath } from "./output";
import { extractFrontmatter } from "./frontmatter";
import { launchCdpBrowser, CdpBrowser, CdpPage } from "./cdp";
import { BunFileSystem } from "./fs";
import { tracer } from "./telemetry";
import { logger } from "./logger";

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

const defaultFileSystem = new BunFileSystem();

/** Executes the conversion pipeline and publishes only complete output files. */
export async function renderPdf(
  options: RenderOptions,
  browserManager: BrowserManager = defaultBrowserManager,
): Promise<RenderResult> {
  return tracer.withSpan("docket.render", async (rootSpan) => {
    const startTime = Date.now();
    const timeoutMs = options.timeoutMs ?? 30_000;
    throwIfAborted(options.signal);

    rootSpan.setAttributes({
      "docket.output_target": options.outputPath,
      "docket.theme": options.themeId ?? "executive",
      "docket.skip_linting": Boolean(options.skipLinting),
      "docket.dry_run": Boolean(options.dryRunHtmlPath),
    });

    logger.debug("Initiating render pipeline", {
      outputPath: options.outputPath,
      themeId: options.themeId,
    });

    if (!options.skipLinting) {
      await tracer.withSpan("docket.lint", (lintSpan) => {
        const lintResult = lintMarkdown(options.markdownSource);
        lintSpan.setAttributes({
          "lint.valid": lintResult.isValid,
          "lint.errors_count": lintResult.errors.length,
          "lint.warnings_count": lintResult.warnings.length,
        });

        if (!lintResult.isValid) {
          const firstError = lintResult.errors[0];
          if (firstError) {
            throw new MarkdownLintError(
              `Critical syntax error on line ${firstError.line}: ${firstError.message}`,
              firstError.suggestion,
            );
          }
        }
      });
    }

    const frontmatter = extractFrontmatter(options.markdownSource);
    const themeId = options.themeId ?? frontmatter.theme ?? "executive";
    const customCssPath = options.customCssPath ?? (typeof frontmatter.metadata.customCss === "string" ? frontmatter.metadata.customCss : undefined);
    const outputPath = await normalizePdfOutputPath(options.outputPath);
    const title = options.title ?? frontmatter.title ?? (path.basename(outputPath, ".pdf") || "Docket Document");

    rootSpan.setAttribute("docket.document_title", title);

    const html = await tracer.withSpan("docket.assemble_html", async (assembleSpan) => {
      const resultHtml = await assembleHtmlAsync(options.markdownSource, themeId, title, customCssPath);
      assembleSpan.setAttribute("html.byte_length", Buffer.byteLength(resultHtml));
      return resultHtml;
    });

    if (options.dryRunHtmlPath) {
      await defaultFileSystem.writeTextAtomic(options.dryRunHtmlPath, html);
      if (options.dryRunOnly) {
        const stats = await fs.stat(options.dryRunHtmlPath);
        const durationMs = Date.now() - startTime;
        logger.info("Dry-run HTML export completed", {
          htmlPath: options.dryRunHtmlPath,
          bytes: stats.size,
          durationMs,
        });
        return {
          outputPath: options.dryRunHtmlPath,
          bytes: stats.size,
          durationMs,
          title,
        };
      }
    }
    await defaultFileSystem.ensureDirectory(path.dirname(outputPath));

    throwIfAborted(options.signal);
    let page: CdpPage | null = null;
    const temporaryPdfPath = `${outputPath}.tmp-${Bun.randomUUIDv7()}`;

    try {
      page = await tracer.withSpan("docket.cdp.acquire_page", async () => {
        return browserManager.acquirePage();
      });
      throwIfAborted(options.signal);

      await tracer.withSpan("docket.cdp.set_content", async () => {
        await page!.setDocumentContent(html);
      });
      throwIfAborted(options.signal);

      await tracer.withSpan("docket.cdp.wait_for_fonts", async () => {
        await page!.waitForFonts(Math.min(timeoutMs, 10_000));
        await page!.evaluate("document.body.offsetHeight");
      });
      throwIfAborted(options.signal);

      const pdfBuffer = await tracer.withSpan("docket.cdp.print_to_pdf", async (printSpan) => {
        const buffer = await page!.printToPdf({
          printBackground: true,
          preferCSSPageSize: true,
          paperWidth: 8.27,
          paperHeight: 11.69,
          marginTop: 0,
          marginBottom: 0,
          marginLeft: 0,
          marginRight: 0,
        });
        printSpan.setAttribute("pdf.byte_length", buffer.length);
        return buffer;
      });

      await tracer.withSpan("docket.fs.atomic_publish", async () => {
        await Bun.write(temporaryPdfPath, pdfBuffer);
        await fs.rename(temporaryPdfPath, outputPath);
      });

      const durationMs = Date.now() - startTime;
      rootSpan.setAttributes({
        "pdf.output_path": outputPath,
        "pdf.bytes": pdfBuffer.length,
        "pdf.duration_ms": durationMs,
      });

      logger.info("PDF render pipeline completed successfully", {
        outputPath,
        bytes: pdfBuffer.length,
        durationMs,
      });

      return { outputPath, bytes: pdfBuffer.length, durationMs, title };
    } catch (error) {
      try { await Bun.file(temporaryPdfPath).delete(); } catch { /* best effort */ }
      if (error instanceof DocketError) {
        logger.error("Render pipeline aborted with Docket error", error, { code: error.code });
        throw error;
      }
      const renderError = new PuppeteerRenderError(
        `PDF conversion failed: ${error instanceof Error ? error.message : String(error)}`,
        "Verify Chromium, fonts, output permissions, and available disk space.",
        { cause: error },
      );
      logger.error("Render pipeline failed unexpectedly", renderError);
      throw renderError;
    } finally {
      if (page) {
        try { await page.close(); } catch { /* browser manager remains reusable */ }
      }
    }
  });
}
