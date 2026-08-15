import puppeteer, { type Browser } from "puppeteer";
import { assembleHtml } from "./assemble";
import { lintMarkdown } from "./lint";
import { MarkdownLintError, PuppeteerRenderError, FileAccessError } from "./errors";
import type { ThemeId } from "./themes";
import fs from "node:fs";
import path from "node:path";

export interface RenderOptions {
  markdownSource: string;
  themeId?: ThemeId;
  outputPath: string;
  title?: string;
  dryRunHtmlPath?: string;
  skipLinting?: boolean;
}

export interface RenderResult {
  outputPath: string;
  bytes: number;
  durationMs: number;
}

// Track active browsers to prevent orphan processes on SIGINT/uncaughtException
const activeBrowsers = new Set<Browser>();

function registerCleanupTraps() {
  const cleanup = async () => {
    for (const b of activeBrowsers) {
      try {
        await b.close();
      } catch {}
    }
    activeBrowsers.clear();
  };

  process.once("SIGINT", () => {
    cleanup().then(() => process.exit(130));
  });
  process.once("SIGTERM", () => {
    cleanup().then(() => process.exit(143));
  });
}

registerCleanupTraps();

/**
 * Renders Markdown source into a margin-safe Executive A4 PDF file using Puppeteer.
 * Performs pre-render linting validation to safeguard against generating corrupted PDF files.
 */
export async function renderPdf(options: RenderOptions): Promise<RenderResult> {
  const startTime = Date.now();

  // 1. Pre-conversion Lint Check
  if (!options.skipLinting) {
    const lintResult = lintMarkdown(options.markdownSource);
    if (!lintResult.isValid) {
      const firstError = lintResult.errors[0];
      throw new MarkdownLintError(
        `Critical syntax error on line ${firstError.line}: ${firstError.message}`,
        firstError.suggestion
      );
    }
  }

  const themeId = options.themeId ?? "executive";
  const title = options.title ?? path.basename(options.outputPath, ".pdf") ?? "Docket Document";

  // 2. Assemble HTML
  const html = assembleHtml(options.markdownSource, themeId, title);

  // If dry-run HTML export requested
  if (options.dryRunHtmlPath) {
    try {
      const htmlDir = path.dirname(options.dryRunHtmlPath);
      if (!fs.existsSync(htmlDir)) {
        fs.mkdirSync(htmlDir, { recursive: true });
      }
      fs.writeFileSync(options.dryRunHtmlPath, html, "utf-8");
    } catch (err: any) {
      throw new FileAccessError(options.dryRunHtmlPath, err?.message || String(err));
    }
  }

  // Ensure output directory exists
  const outputDir = path.dirname(options.outputPath);
  if (outputDir && !fs.existsSync(outputDir)) {
    try {
      fs.mkdirSync(outputDir, { recursive: true });
    } catch (err: any) {
      throw new FileAccessError(outputDir, err?.message || String(err));
    }
  }

  // 3. Launch Puppeteer Browser Safely
  const launchArgs = [
    "--no-sandbox",
    "--disable-setuid-sandbox",
    "--disable-dev-shm-usage",
    "--no-first-run",
    "--disable-gpu",
  ];

  const executablePath = process.env.PUPPETEER_EXECUTABLE_PATH || undefined;

  let browser: Browser | null = null;
  try {
    try {
      browser = await puppeteer.launch({
        headless: true,
        args: launchArgs,
        executablePath,
      });
      activeBrowsers.add(browser);
    } catch (err: any) {
      throw new PuppeteerRenderError(
        `Failed to launch headless Chromium browser: ${err?.message || err}`,
        "Install Chrome/Chromium or set PUPPETEER_EXECUTABLE_PATH environment variable."
      );
    }

    const page = await browser.newPage();

    // 4. Set content & wait for fonts/reflow
    try {
      await page.setContent(html, { waitUntil: "domcontentloaded", timeout: 30000 });

      // Wait for web fonts (Google Fonts) to finish loading
      await page.evaluate(async () => {
        if ("fonts" in document) {
          await document.fonts.ready;
        }
      });

      // Force DOM layout reflow
      await page.evaluate(() => document.body.offsetHeight);
    } catch (err: any) {
      throw new PuppeteerRenderError(
        `Failed to populate HTML page content or load fonts: ${err?.message || err}`,
        "Check network connection for Google Fonts or dry-run HTML export."
      );
    }

    // 5. Generate PDF adhering strictly to the Margin Safety Contract
    try {
      await page.pdf({
        path: options.outputPath,
        format: "A4",
        printBackground: true,
        preferCSSPageSize: true,
        margin: {
          top: "0",
          right: "0",
          bottom: "0",
          left: "0",
        },
      });
    } catch (err: any) {
      throw new PuppeteerRenderError(
        `Failed to print PDF document: ${err?.message || err}`,
        "Verify output file permissions and available disk space."
      );
    }

    const stats = fs.statSync(options.outputPath);

    return {
      outputPath: options.outputPath,
      bytes: stats.size,
      durationMs: Date.now() - startTime,
    };
  } finally {
    if (browser) {
      activeBrowsers.delete(browser);
      try {
        await browser.close();
      } catch {}
    }
  }
}
