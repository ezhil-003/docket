import MarkdownIt from "markdown-it";

const md = new MarkdownIt({
  html: true,
  linkify: true,
  typographer: true,
  breaks: false,
});

/**
 * Keep the supported raw-HTML workflow (for example, class-based callouts)
 * while removing browser-executable content from untrusted Markdown.
 */
function sanitizeRenderedHtml(html: string): string {
  let sanitized = html
    .replace(/<(script|iframe|object|embed|applet)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, "")
    .replace(/<(script|iframe|object|embed|applet)\b[^>]*\/?>/gi, "")
    .replace(/<(base|meta|link)\b[^>]*\/?>/gi, "")
    .replace(/\s+on[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/\s+(href|src|action|formaction|xlink:href)\s*=\s*("|')\s*javascript:[\s\S]*?\2/gi, " $1=\"#\"")
    .replace(/\s+(href|src|action|formaction|xlink:href)\s*=\s*javascript:[^\s>]+/gi, " $1=\"#\"");

  // Inline styles are not required by Docket's class-based themes. Removing
  // them avoids CSS expression/url tricks while preserving safe raw elements.
  sanitized = sanitized.replace(/\s+style\s*=\s*("|')[\s\S]*?\1/gi, "");
  return sanitized;
}

/**
 * Parses Markdown raw text string into sanitized HTML body content.
 */
export function parseMarkdown(source: string): string {
  if (!source || source.trim().length === 0) {
    return "<p><em>[Empty Document]</em></p>";
  }
  return sanitizeRenderedHtml(md.render(source));
}
