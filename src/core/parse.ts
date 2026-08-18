import MarkdownIt from "markdown-it";
import { createHighlighter, type Highlighter } from "shiki";

let highlighterPromise: Promise<Highlighter> | undefined;
let syncHighlighter: Highlighter | undefined;

export function getHighlighterInstance(): Promise<Highlighter> {
  if (!highlighterPromise) {
    highlighterPromise = createHighlighter({
      themes: ["dark-plus"],
      langs: [
        "typescript",
        "javascript",
        "json",
        "bash",
        "sh",
        "html",
        "css",
        "yaml",
        "yml",
        "python",
        "go",
        "rust",
        "sql",
        "markdown",
        "md",
      ],
    }).then((h) => {
      syncHighlighter = h;
      return h;
    });
  }
  return highlighterPromise;
}

// Background pre-warm
void getHighlighterInstance();

function escapeCodeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

const md = new MarkdownIt({
  html: true,
  linkify: true,
  typographer: true,
  breaks: false,
  highlight: (code, lang) => {
    if (syncHighlighter) {
      try {
        const loadedLangs = syncHighlighter.getLoadedLanguages();
        const validLang = lang && loadedLangs.includes(lang.toLowerCase()) ? lang.toLowerCase() : "text";
        if (validLang !== "text") {
          return syncHighlighter.codeToHtml(code, {
            lang: validLang,
            theme: "dark-plus",
          });
        }
      } catch {
        // fallback
      }
    }
    return `<pre class="shiki dark-plus"><code>${escapeCodeHtml(code)}</code></pre>`;
  },
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

  // Inline styles are not required by Docket's class-based themes.
  // We preserve styles injected by Shiki while removing untrusted raw styles elsewhere.
  sanitized = sanitized.replace(/(<[^>]+)\sstyle="([^"]*expression\([^)]*\)[^"]*)"/gi, "$1");
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

/**
 * Asynchronous variant ensuring Shiki highlighter is fully loaded before rendering.
 */
export async function parseMarkdownAsync(source: string): Promise<string> {
  if (!syncHighlighter) {
    syncHighlighter = await getHighlighterInstance();
  }
  return parseMarkdown(source);
}
