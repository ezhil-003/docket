import { describe, it, expect, afterAll } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { BrowserManager, renderPdf } from "../src/core/render";
import type { BrowserLike as Browser, Page } from "../src/core/render";

const tempOutputDir = path.join(__dirname, "../temp-test-output");

describe("PDF Renderer HTML pipeline (render.ts)", () => {
  afterAll(() => {
    if (fs.existsSync(tempOutputDir)) {
      fs.rmSync(tempOutputDir, { recursive: true, force: true });
    }
  });

  it("should export dry-run HTML without starting Chromium", async () => {
    const htmlPath = path.join(tempOutputDir, "only.html");
    const result = await renderPdf({
      markdownSource: "# HTML only\n\nThis does not require a browser.",
      themeId: "executive",
      outputPath: path.join(tempOutputDir, "never-created.pdf"),
      dryRunHtmlPath: htmlPath,
      dryRunOnly: true,
    });
    expect(result.outputPath).toBe(htmlPath);
    expect(fs.existsSync(htmlPath)).toBe(true);
    expect(fs.existsSync(path.join(tempOutputDir, "never-created.pdf"))).toBe(false);
  });

  it("accepts a directory as the output target and resolves a safe PDF filename", async () => {
    const htmlPath = path.join(tempOutputDir, "directory-target.html");
    const result = await renderPdf({
      markdownSource: "# Directory target",
      outputPath: tempOutputDir,
      dryRunHtmlPath: htmlPath,
      dryRunOnly: true,
    });
    expect(result.outputPath).toBe(htmlPath);
    expect(fs.existsSync(path.join(tempOutputDir, "docket-output.pdf"))).toBe(false);
  });

  it("rejects an already-cancelled render before starting Chromium", async () => {
    const controller = new AbortController();
    controller.abort();
    let thrownError: any;
    try {
      await renderPdf({
        markdownSource: "# Cancelled",
        outputPath: path.join(tempOutputDir, "cancelled.pdf"),
        signal: controller.signal,
      });
    } catch (err) {
      thrownError = err;
    }
    expect(thrownError).toBeDefined();
    expect(thrownError.code).toBe("ERR_PUPPETEER_RENDER");
  });

  it("relaunches Chromium after the managed browser disconnects", async () => {
    let launches = 0;
    let firstBrowser: { connected: boolean; close: () => Promise<void>; newPage: () => Promise<Page> } | undefined;
    const secondBrowser = {
      connected: true,
      close: async () => undefined,
      newPage: async () => ({}) as Page,
    };
    const manager = new BrowserManager({
      launch: async () => {
        launches++;
        if (launches === 1) {
          firstBrowser = {
            connected: true,
            close: async () => undefined,
            newPage: async () => ({}) as Page,
          };
          return firstBrowser as unknown as Browser;
        }
        return secondBrowser as unknown as Browser;
      },
    });

    await manager.acquirePage();
    if (!firstBrowser) throw new Error("Test browser was not launched");
    firstBrowser.connected = false;
    await manager.acquirePage();

    expect(launches).toBe(2);
    await manager.close();
  });
});

describe.skipIf(!process.env.DOCKET_RUN_BROWSER_TESTS)("PDF Renderer Chromium integration tests (render.ts)", () => {

  it("should generate a dry-run HTML export without errors", async () => {
    const htmlPath = path.join(tempOutputDir, "dry-run.html");
    const pdfPath = path.join(tempOutputDir, "test-render.pdf");

    const result = await renderPdf({
      markdownSource: "# Dry Run Test\n\n- Bullet item",
      themeId: "executive",
      outputPath: pdfPath,
      dryRunHtmlPath: htmlPath,
    });

    expect(fs.existsSync(htmlPath)).toBe(true);
    expect(fs.existsSync(pdfPath)).toBe(true);
    expect(result.bytes).toBeGreaterThan(1000);
    expect(result.durationMs).toBeGreaterThan(0);

    const htmlContent = fs.readFileSync(htmlPath, "utf-8");
    expect(htmlContent).toContain("Dry Run Test");
    expect(htmlContent).toContain('<div class="page-content">');
  }, 20000);

  it("should create non-existent nested output directories automatically", async () => {
    const nestedPdfPath = path.join(tempOutputDir, "nested/folder/output.pdf");

    const result = await renderPdf({
      markdownSource: "# Nested Output Test",
      themeId: "technical",
      outputPath: nestedPdfPath,
    });

    expect(fs.existsSync(nestedPdfPath)).toBe(true);
    expect(result.bytes).toBeGreaterThan(1000);
  }, 20000);
});
