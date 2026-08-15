import { describe, it, expect, afterAll } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { renderPdf } from "../src/core/render";

describe("PDF Renderer Integration Tests (render.ts)", () => {
  const tempOutputDir = path.join(__dirname, "../temp-test-output");

  afterAll(() => {
    if (fs.existsSync(tempOutputDir)) {
      fs.rmSync(tempOutputDir, { recursive: true, force: true });
    }
  });

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
