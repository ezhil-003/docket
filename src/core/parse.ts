import MarkdownIt from "markdown-it";

const md = new MarkdownIt({
  html: true,
  linkify: true,
  typographer: true,
  breaks: false,
});

/**
 * Parses Markdown raw text string into sanitized HTML body content.
 */
export function parseMarkdown(source: string): string {
  if (!source || source.trim().length === 0) {
    return "<p><em>[Empty Document]</em></p>";
  }
  return md.render(source);
}
