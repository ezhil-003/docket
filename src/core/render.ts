import puppeteer, { type Browser } from "puppeteer";
import { assembleHtml } from "./assemble";
import type { ThemeId } from "./themes";
import fs from "node:fs";
import path from "node:path";

export interface RenderOptions {
  markdownSource: string;
  themeId?: ThemeId;
  outputPath: string;
  title?: string;
  dryRunHtmlPath?: string;
}

export interface RenderResult {
  outputPath: string;
  bytes: number;
  durationMs: number;
}

/**
 * Renders Markdown source into a margin-safe Executive A4 PDF file using Puppeteer.
 */
export async function renderPdf(options: RenderOptions): Promise<RenderResult> {
  const startTime = Date.now();

  const themeId = options.themeId ?? "executive";
  const title = options.title ?? path.basename(options.outputPath, ".pdf") ?? "Document";

  // 1. Assemble HTML
  const html = assembleHtml(options.markdownSource, themeId, title);

  // If dry-run HTML export requested
  if (options.dryRunHtmlPath) {
    const htmlDir = path.dirname(options.dryRunHtmlPath);
    if (!fs.existsSync(htmlDir)) {
      fs.mkdirSync(htmlDir, { recursive: true });
    }
    fs.writeFileSync(options.dryRunHtmlPath, html, "utf-8");
  }

  // Ensure output directory exists
  const outputDir = path.dirname(options.outputPath);
  if (outputDir && !fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // 2. Launch Puppeteer Browser
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
    browser = await puppeteer.launch({
      headless: true,
      args: launchArgs,
      executablePath,
    });

    const page = await browser.newPage();

    // 3. Set content & wait for fonts/reflow
    await page.setContent(html, { waitUntil: "domcontentloaded", timeout: 30000 });

    // Wait for web fonts (Google Fonts) to finish loading
    await page.evaluate(async () => {
      if ("fonts" in document) {
        await document.fonts.ready;
      }
    });

    // Force DOM layout reflow
    await page.evaluate(() => document.body.offsetHeight);

    // 4. Generate PDF adhering strictly to the Margin Safety Contract
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

    const stats = fs.statSync(options.outputPath);

    return {
      outputPath: options.outputPath,
      bytes: stats.size,
      durationMs: Date.now() - startTime,
    };
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}
