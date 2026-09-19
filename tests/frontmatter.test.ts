import { describe, it, expect } from "bun:test";
import { extractFrontmatter } from "../src/core/frontmatter";
import { parseMarkdown } from "../src/core/parse";
import { derivePdfFilename } from "../src/core/output";

describe("Frontmatter Extraction Engine (frontmatter.ts)", () => {
  it("passes through markdown without frontmatter untouched", () => {
    const markdown = "# Hello World\n\nThis is standard text.";
    const result = extractFrontmatter(markdown);
    expect(result.hasFrontmatter).toBe(false);
    expect(result.body).toBe(markdown);
    expect(result.title).toBeUndefined();
    expect(result.theme).toBeUndefined();
  });

  it("extracts YAML frontmatter metadata and strips it from body", () => {
    const markdown = `---
title: Executive Quarterly Briefing
author: Jane Doe
theme: modern
date: 2026-09-14
css: ./corporate.css
---
# First Section

Content begins here.`;

    const result = extractFrontmatter(markdown);
    expect(result.hasFrontmatter).toBe(true);
    expect(result.title).toBe("Executive Quarterly Briefing");
    expect(result.theme).toBe("modern");
    expect(result.metadata.author).toBe("Jane Doe");
    expect(result.metadata.date).toBe("2026-09-14");
    expect(result.metadata.customCss).toBe("./corporate.css");

    expect(result.body).not.toContain("Executive Quarterly Briefing");
    expect(result.body).not.toContain("---");
    expect(result.body).toContain("# First Section");
    expect(result.body).toContain("Content begins here.");
  });

  it("handles quoted values properly", () => {
    const markdown = `---
title: "Quoted Title: With Subtitle"
author: 'Dr. John Smith'
---
# Document`;

    const result = extractFrontmatter(markdown);
    expect(result.title).toBe("Quoted Title: With Subtitle");
    expect(result.metadata.author).toBe("Dr. John Smith");
  });

  it("treats unclosed frontmatter as plain content for linter to catch", () => {
    const markdown = `---
title: Unclosed
# Heading`;
    const result = extractFrontmatter(markdown);
    expect(result.hasFrontmatter).toBe(false);
    expect(result.body).toBe(markdown);
  });

  it("ensures parseMarkdown does not render frontmatter as h2 or hr tags", () => {
    const markdown = `---
title: Secret Metadata
author: Nobody
---
# Real Heading

Paragraph text.`;

    const html = parseMarkdown(markdown);
    expect(html).not.toContain("Secret Metadata");
    expect(html).not.toContain("Nobody");
    expect(html).toContain('id="real-heading"');
    expect(html).toContain("Real Heading</h1>");
    expect(html).toContain("<p>Paragraph text.</p>");
  });

  it("uses frontmatter title to derive clean PDF filename in derivePdfFilename", () => {
    const markdown = `---
title: Annual Financial Report 2026
---
# Introduction`;

    const filename = derivePdfFilename(markdown);
    expect(filename).toBe("annual-financial-report-2026.pdf");
  });
});
