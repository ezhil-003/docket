import { describe, it, expect } from "vitest";
import { parseMarkdown, parseMarkdownAsync } from "../src/core/parse";

describe("Markdown Parser (parse.ts)", () => {
  it("should handle empty or whitespace-only markdown source gracefully", () => {
    expect(parseMarkdown("")).toContain("[Empty Document]");
    expect(parseMarkdown("   \n\t  ")).toContain("[Empty Document]");
  });

  it("should parse standard headings and paragraphs", () => {
    const md = "# Title\n\nParagraph text goes here.";
    const html = parseMarkdown(md);
    expect(html).toContain("<h1>Title</h1>");
    expect(html).toContain("<p>Paragraph text goes here.</p>");
  });

  it("should parse GFM tables cleanly", () => {
    const md = `
| Header 1 | Header 2 |
| --- | --- |
| Row 1 | Val 1 |
| Row 2 | Val 2 |
`;
    const html = parseMarkdown(md);
    expect(html).toContain("<table>");
    expect(html).toContain("<th>Header 1</th>");
    expect(html).toContain("<td>Val 1</td>");
  });

  it("should parse code blocks and inline code with Shiki syntax highlighting", async () => {
    const md = "Use `bun run cli` or code block:\n\n```js\nconsole.log('hello');\n```";
    const html = await parseMarkdownAsync(md);
    expect(html).toContain("<code>bun run cli</code>");
    expect(html).toContain("shiki dark-plus");
    expect(html).toContain("hello");

    const modernHtml = await parseMarkdownAsync(md, "modern");
    expect(modernHtml).toContain("shiki catppuccin-mocha");

    const techHtml = await parseMarkdownAsync(md, "technical");
    expect(techHtml).toContain("shiki one-dark-pro");
  });

  it("should preserve blockquotes and lists", () => {
    const md = "> Executive callout\n\n- Item 1\n- Item 2";
    const html = parseMarkdown(md);
    expect(html).toContain("blockquote");
    expect(html).toContain("Executive callout");
    expect(html).toContain("ul");
    expect(html).toContain("Item 1");
  });

  it("should allow raw HTML tags when specified", () => {
    const md = '<div class="custom-badge">Badge</div>';
    const html = parseMarkdown(md);
    expect(html).toContain('<div class="custom-badge">Badge</div>');
  });

  it("should format unannotated and custom language code blocks consistently with Shiki theme", async () => {
    const unannotatedMd = "```\nconst x = 42;\n```";
    const html = await parseMarkdownAsync(unannotatedMd, "modern");
    expect(html).toContain("shiki catppuccin-mocha");
    expect(html).toContain("const x = 42;");

    const taggedMd = "```json\n{\"foo\": 1}\n```";
    const taggedHtml = await parseMarkdownAsync(taggedMd, "modern");
    expect(taggedHtml).toContain('data-lang="json"');
    expect(taggedHtml).toContain("shiki catppuccin-mocha");
  });

  it("should suppress empty code fences without generating empty pre blocks", async () => {
    const emptyMd = "Before\n\n```\n```\n\nAfter";
    const html = await parseMarkdownAsync(emptyMd, "modern");
    expect(html).not.toContain("<pre");
    expect(html).toContain("Before");
    expect(html).toContain("After");
  });

  it("transforms manual page break markers into page-break containers", () => {
    const variants = [
      "\\newpage",
      "/newpage",
      "\\pagebreak",
      "/pagebreak",
      "<!-- pagebreak -->",
      "<!-- page-break -->",
      "<!-- newpage -->",
      "<!-- new-page -->",
      "[pagebreak]",
      "[newpage]",
      "{pagebreak}",
      "{newpage}",
    ];

    for (const marker of variants) {
      const md = `First Section\n\n${marker}\n\nSecond Section`;
      const html = parseMarkdown(md);
      expect(html).toContain('<div class="page-break"></div>');
      expect(html).not.toContain(marker);
    }
  });

  it("strictly preserves page break markers inside fenced code blocks", () => {
    const md = "```latex\n\\begin{document}\n\\newpage\n\\end{document}\n```";
    const html = parseMarkdown(md);
    expect(html).toContain("\\newpage");
    expect(html).not.toContain('<div class="page-break"></div>');
  });

  it("removes executable raw HTML while preserving safe content", () => {
    const html = parseMarkdown(
      '<div class="callout" onclick="alert(1)">Safe label</div><script>alert(2)</script><a href="javascript:alert(3)">Link</a>',
    );
    expect(html).toContain('<div class="callout">Safe label</div>');
    expect(html).not.toContain("<script");
    expect(html).not.toContain("onclick");
    expect(html).toContain('href="#"');
  });

  it("transforms GitHub-style alerts into executive callout boxes", () => {
    const md = "> [!NOTE]\n> This is an important note.\n\n> [!WARNING]\n> Critical system warning.";
    const html = parseMarkdown(md);
    expect(html).toContain('class="callout callout-note"');
    expect(html).toContain("NOTE");
    expect(html).toContain("This is an important note.");
    expect(html).toContain('class="callout callout-warning"');
    expect(html).toContain("WARNING");
    expect(html).toContain("Critical system warning.");
  });
});
