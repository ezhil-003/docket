import { describe, it, expect } from "vitest";
import { assembleHtml } from "../src/core/assemble";

describe("HTML Document Assembler (assemble.ts)", () => {
  it("should wrap markdown HTML in full document boilerplate with page-content container", () => {
    const html = assembleHtml("# Test Document", "executive", "Test Title");
    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain("<html lang=\"en\">");
    expect(html).toContain("<title>Test Title</title>");
    expect(html).toContain('<div class="page-content">');
    expect(html).toContain("<h1>Test Document</h1>");
    expect(html).toContain("</div>");
    expect(html).toContain("</html>");
  });

  it("should safely escape HTML entities in the document title", () => {
    const html = assembleHtml("# Content", "executive", "Report & Analysis <Q3>");
    expect(html).toContain("<title>Report &amp; Analysis &lt;Q3&gt;</title>");
  });

  it("should inject theme CSS within <style> tag", () => {
    const html = assembleHtml("# Content", "technical");
    expect(html).toContain("<style>");
    expect(html).toContain("Theme Preset: technical");
    expect(html).toContain("</style>");
  });
});
