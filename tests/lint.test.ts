import { describe, it, expect } from "vitest";
import { lintMarkdown } from "../src/core/lint";

describe("Markdown Real-Time Linter Engine (lint.ts)", () => {
  it("should return isValid = true for clean Markdown content", () => {
    const cleanMd = `# Executive Summary

> Important notice

| Col 1 | Col 2 |
| --- | --- |
| Val 1 | Val 2 |

\`\`\`typescript
const x = 42;
\`\`\`
`;
    const result = lintMarkdown(cleanMd);
    expect(result.isValid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("should detect unclosed fenced code blocks (MD001) with exact line number", () => {
    const md = `# Title\n\n\`\`\`js\nconst x = 10;\nconsole.log(x);`;
    const result = lintMarkdown(md);
    expect(result.isValid).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]!.ruleId).toBe("MD001/unclosed-code-fence");
    expect(result.errors[0]!.line).toBe(3);
    expect(result.errors[0]!.severity).toBe("error");
  });

  it("should detect malformed YAML frontmatter (MD002)", () => {
    const md = `---\ntitle: Document\nauthor: Docket\n\n# Heading`;
    const result = lintMarkdown(md);
    expect(result.isValid).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]!.ruleId).toBe("MD002/malformed-frontmatter");
    expect(result.errors[0]!.line).toBe(1);
  });

  it("should detect mismatched table column counts (MD003)", () => {
    const md = `
| Header 1 | Header 2 |
| --- | --- |
| Row 1 Col 1 | Row 1 Col 2 |
| Row 2 Col 1 | Row 2 Col 2 | Row 2 Col 3 |
`;
    const result = lintMarkdown(md);
    expect(result.isValid).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]!.ruleId).toBe("MD003/mismatched-table-columns");
    expect(result.errors[0]!.line).toBe(5);
  });

  it("should detect unclosed Markdown links (MD004)", () => {
    const md = `Check out [Docket link(https://docket.dev`;
    const result = lintMarkdown(md);
    expect(result.isValid).toBe(false);
    expect(result.errors.some((e) => e.ruleId === "MD004/unclosed-markdown-link")).toBe(true);
  });

  it("accepts link text that spans multiple lines", () => {
    const result = lintMarkdown("[A link that\nspans two lines](https://example.com)");
    expect(result.errors.filter((message) => message.ruleId === "MD004/unclosed-markdown-link")).toHaveLength(0);
  });

  it("ignores link-like brackets inside inline code", () => {
    const result = lintMarkdown("Use the inline code `[not a link]` here.");
    expect(result.errors.filter((message) => message.ruleId === "MD004/unclosed-markdown-link")).toHaveLength(0);
  });

  it("should detect unclosed HTML tags as warnings (MD005)", () => {
    const md = `<div>Some HTML content without closing tag`;
    const result = lintMarkdown(md);
    expect(result.isValid).toBe(true); // Warnings do not invalidate PDF creation
    expect(result.hasWarnings).toBe(true);
    expect(result.warnings.some((w) => w.ruleId === "MD005/unclosed-html-tag")).toBe(true);
  });

  it("ignores HTML-like tags inside inline code and HTML comments", () => {
    const inlineResult = lintMarkdown("Use the `<div>` element in Markdown.");
    expect(inlineResult.warnings.filter((w) => w.ruleId === "MD005/unclosed-html-tag")).toHaveLength(0);

    const commentResult = lintMarkdown("<!-- <div> note -->\n\n# Document Title");
    expect(commentResult.warnings.filter((w) => w.ruleId === "MD005/unclosed-html-tag")).toHaveLength(0);
  });

  it("should handle empty or whitespace-only documents with warning (MD007)", () => {
    const result = lintMarkdown("   \n\t  ");
    expect(result.isValid).toBe(true);
    expect(result.hasWarnings).toBe(true);
    expect(result.warnings[0]!.ruleId).toBe("MD007/empty-document");
  });

  it("does not lint valid Markdown-looking content inside a closed fence", () => {
    const result = lintMarkdown("```text\n[not a link(https://example.test\n| one | two |\n```\n\n# Real heading");
    expect(result.isValid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("handles tilde-fenced code blocks and ignores content inside them", () => {
    const result = lintMarkdown("~~~python\n[not a link\n| not a table\n~~~\n\n# Main Title");
    expect(result.isValid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("handles a 1000-line document without quadratic diagnostic duplication", () => {
    const source = Array.from({ length: 1000 }, (_, index) => `Line ${index + 1}`).join("\n");
    const result = lintMarkdown(source);
    expect(result.isValid).toBe(true);
    expect(result.all).toHaveLength(0);
  });
});
