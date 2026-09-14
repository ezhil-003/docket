import MarkdownIt from "markdown-it";
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

function escapeCodeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

type MarkdownItInstance = ReturnType<typeof MarkdownIt>;
const parserCache = new Map<ThemeId, MarkdownItInstance>();

function getMarkdownParser(themeId: ThemeId = "executive"): MarkdownItInstance {
  const currentThemeId = (themeId in SHIKI_THEME_MAP) ? themeId : "executive";
  const cached = parserCache.get(currentThemeId);
  if (cached) return cached;

  const shikiTheme = SHIKI_THEME_MAP[currentThemeId] ?? "dark-plus";
  const parser = new MarkdownIt({
    html: true,
    linkify: true,
    typographer: true,
    breaks: false,
    highlight: (code, lang) => {
      if (!code || code.trim().length === 0) {
        return "";
      }
      if (syncHighlighter) {
        try {
          const loadedLangs = syncHighlighter.getLoadedLanguages();
          const cleanLang = lang?.trim().toLowerCase();
          const validLang = cleanLang && loadedLangs.includes(cleanLang) ? cleanLang : "text";
          const highlighted = syncHighlighter.codeToHtml(code, {
            lang: validLang,
            theme: shikiTheme,
          });
          if (cleanLang && cleanLang !== "text") {
            return highlighted.replace(/^<pre\b/, `<pre data-lang="${escapeCodeHtml(cleanLang)}"`);
          }
          return highlighted;
        } catch {
          // fallback
        }
      }
      return `<pre class="shiki ${shikiTheme}"><code>${escapeCodeHtml(code)}</code></pre>`;
    },
  });

  const defaultFence = parser.renderer.rules.fence;
  parser.renderer.rules.fence = (tokens, idx, options, env, self) => {
    const token = tokens[idx];
    if (!token?.content || token.content.trim().length === 0) {
      return "";
    }
    if (defaultFence) {
      return defaultFence(tokens, idx, options, env, self);
    }
    return self.renderToken(tokens, idx, options);
  };

  parserCache.set(currentThemeId, parser);
  return parser;
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
 * Parses Markdown raw text string into sanitized HTML body content.
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
  const md = getMarkdownParser(themeId);
  const rendered = md.render(processed);
  const withCallouts = processCallouts(rendered);
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
