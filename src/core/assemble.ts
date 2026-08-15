import { parseMarkdown } from "./parse";
import { loadThemeCss, type ThemeId } from "./themes";

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/**
 * Assembles full HTML document ready for Puppeteer rendering.
 * The `<div class="page-content">` wrapper is mandatory to carry visual margins safely.
 */
export function assembleHtml(
  markdownSource: string,
  themeId: ThemeId = "executive",
  title = "Docket Document"
): string {
  const bodyHtml = parseMarkdown(markdownSource);
  const css = loadThemeCss(themeId);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(title)}</title>
  <style>
${css}
  </style>
</head>
<body>
  <div class="page-content">
${bodyHtml}
  </div>
</body>
</html>`;
}
