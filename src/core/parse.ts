import { createHighlighter, type Highlighter } from "shiki";
import type { ThemeId } from "./themes";
import { extractFrontmatter } from "./frontmatter";

export const SHIKI_THEME_MAP: Record<ThemeId, string> = {
  executive: "dark-plus",
  modern: "catppuccin-mocha",
  technical: "one-dark-pro",
  legal: "github-dark",
  boardroom: "dracula",
  minimal: "tokyo-night",
};

let highlighterPromise: Promise<Highlighter> | undefined;
let syncHighlighter: Highlighter | undefined;

export function getHighlighterInstance(): Promise<Highlighter> {
  if (!highlighterPromise) {
    highlighterPromise = createHighlighter({
      themes: [
        "dark-plus",
        "catppuccin-mocha",
        "one-dark-pro",
        "github-dark",
        "dracula",
        "tokyo-night",
      ],
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
        "c",
        "cpp",
        "csharp",
        "java",
        "ruby",
        "php",
        "dockerfile",
        "diff",
        "xml",
        "toml",
        "graphql",
        "swift",
        "kotlin",
        "text",
      ],
    }).then((h) => {
      syncHighlighter = h;
      return h;
    });
  }
  return highlighterPromise;
}

/**
 * Highlights code blocks in Bun.markdown HTML output, adds data-lang badges,
 * and suppresses empty code fence boxes.
 */
function highlightCodeBlocks(html: string, shikiTheme: string): string {
  return html.replace(
    /<pre><code(?:\s+class="language-([^"]*)")?>([\s\S]*?)<\/code><\/pre>/g,
    (_, lang, code) => {
      // Unescape standard HTML entities inserted by md4c into code
      const unescaped = code
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, "\"")
        .replace(/&#39;/g, "'")
        .replace(/&#x27;/g, "'");

      if (!unescaped || unescaped.trim().length === 0) {
        return "";
      }

      const cleanLang = lang?.trim().toLowerCase();

      if (syncHighlighter) {
        try {
          const loadedLangs = syncHighlighter.getLoadedLanguages();
          const validLang = cleanLang && loadedLangs.includes(cleanLang) ? cleanLang : "text";
          const highlighted = syncHighlighter.codeToHtml(unescaped, {
            lang: validLang,
            theme: shikiTheme,
          });
          if (cleanLang && cleanLang !== "text") {
            return highlighted.replace(/^<pre\b/, `<pre data-lang="${Bun.escapeHTML(cleanLang)}"`);
          }
          return highlighted;
        } catch {
          // Fallback to basic formatted pre/code
        }
      }

      const dataLangAttr = cleanLang && cleanLang !== "text" ? ` data-lang="${Bun.escapeHTML(cleanLang)}"` : "";
      return `<pre class="shiki ${shikiTheme}"${dataLangAttr}><code>${Bun.escapeHTML(unescaped)}</code></pre>`;
    }
  );
}

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
  sanitized = sanitized.replace(/(<[^>]+)\sstyle=(?:"[^"]*expression\([^)]*\)[^"]*"|'[^']*expression\([^)]*\)[^']*')/gi, "$1");
  return sanitized;
}

/**
 * Detects standalone page break commands in Markdown outside fenced code blocks and
 * replaces them with a `<div class="page-break"></div>` element.
 *
 * Supported formats (case-insensitive on standalone lines):
 * - LaTeX: \newpage, \pagebreak
 * - User/typo variations: /newpage, /pagebreak
 * - HTML comments: <!-- pagebreak -->, <!-- page-break -->, <!-- newpage -->, <!-- new-page -->
 * - Shortcodes: [pagebreak], [newpage], {pagebreak}, {newpage}
 */
export function preprocessPageBreaks(markdown: string): string {
  const PAGE_BREAK_RE = /^\s*(?:\\newpage|\\pagebreak|\/newpage|\/pagebreak|<!--\s*(?:pagebreak|page-break|newpage|new-page)\s*-->|\[(?:pagebreak|newpage)\]|\{(?:pagebreak|newpage)\})\s*$/i;

  const lines = markdown.split(/\r?\n/);
  let inFence = false;
  let fenceMarker = "";

  const transformed = lines.map((line) => {
    const trimmed = line.trim();
    if (trimmed.startsWith("```") || trimmed.startsWith("~~~")) {
      const marker = trimmed.slice(0, 3);
      if (!inFence) {
        inFence = true;
        fenceMarker = marker;
      } else if (marker === fenceMarker) {
        inFence = false;
        fenceMarker = "";
      }
      return line;
    }
    if (!inFence && PAGE_BREAK_RE.test(line)) {
      return '<div class="page-break"></div>';
    }
    return line;
  });

  return transformed.join("\n");
}

const CALLOUT_ICONS: Record<string, string> = {
  NOTE: "ℹ️",
  TIP: "💡",
  IMPORTANT: "❗",
  WARNING: "⚠️",
  CAUTION: "🛑",
};

export function processCallouts(html: string): string {
  return html.replace(
    /<blockquote>\s*<p>\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\](?:\s*<br\s*\/?>|\s*\n)?([\s\S]*?)<\/blockquote>/gi,
    (_, type: string, rest: string) => {
      const upperType = type.toUpperCase();
      const lowerType = type.toLowerCase();
      const icon = CALLOUT_ICONS[upperType] ?? "ℹ️";
      const cleanRest = rest.trim();
      return `<div class="callout callout-${lowerType}" role="alert">
  <div class="callout-header">
    <span class="callout-icon">${icon}</span>
    <span class="callout-title">${upperType}</span>
  </div>
  <div class="callout-body">
    <p>${cleanRest}
  </div>
</div>`;
    }
  );
}

/**
 * Parses Markdown raw text string into sanitized HTML body content using Bun.markdown.
 */
export function parseMarkdown(source: string, themeId: ThemeId = "executive"): string {
  if (!source || source.trim().length === 0) {
    return "<p><em>[Empty Document]</em></p>";
  }
  const { body } = extractFrontmatter(source);
  if (!body || body.trim().length === 0) {
    return "<p><em>[Empty Document]</em></p>";
  }
  const processed = preprocessPageBreaks(body);

  // Synchronously extract resolved highlighter instance if ready via Bun.peek
  if (highlighterPromise && !syncHighlighter) {
    const peeked = Bun.peek(highlighterPromise);
    if (peeked && !(peeked instanceof Promise)) {
      syncHighlighter = peeked;
    }
  }

  const currentThemeId = (themeId in SHIKI_THEME_MAP) ? themeId : "executive";
  const shikiTheme = SHIKI_THEME_MAP[currentThemeId] ?? "dark-plus";

  // Native Bun Markdown parsing (Zig/Rust md4c, ~20x faster than markdown-it)
  const rawHtml = Bun.markdown.html(processed, {
    tables: true,
    strikethrough: true,
    tasklists: true,
    autolinks: true,
    headings: { ids: true },
  });

  const withHighlightedCode = highlightCodeBlocks(rawHtml, shikiTheme);
  const withCallouts = processCallouts(withHighlightedCode);
  return sanitizeRenderedHtml(withCallouts);
}

/**
 * Asynchronous variant ensuring Shiki highlighter is fully loaded before rendering.
 */
export async function parseMarkdownAsync(source: string, themeId: ThemeId = "executive"): Promise<string> {
  if (!syncHighlighter) {
    syncHighlighter = await getHighlighterInstance();
  }
  return parseMarkdown(source, themeId);
}
