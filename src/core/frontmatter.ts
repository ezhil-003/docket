import type { DocumentMetadata } from "./contracts";
import { isValidThemeId, type ThemeId } from "./themes";

export interface ParsedFrontmatter {
  metadata: DocumentMetadata;
  body: string;
  title?: string;
  theme?: ThemeId;
  hasFrontmatter: boolean;
}

/**
 * Parses simple YAML frontmatter key-value pairs without adding heavy dependencies.
 */
function parseYamlBlock(yamlText: string): DocumentMetadata {
  const metadata: DocumentMetadata = {};
  const lines = yamlText.split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const colonIndex = trimmed.indexOf(":");
    if (colonIndex === -1) continue;

    const rawKey = trimmed.slice(0, colonIndex).trim();
    let rawVal = trimmed.slice(colonIndex + 1).trim();

    // Strip surrounding quotes
    if (
      (rawVal.startsWith('"') && rawVal.endsWith('"')) ||
      (rawVal.startsWith("'") && rawVal.endsWith("'"))
    ) {
      rawVal = rawVal.slice(1, -1);
    }

    if (rawKey === "title") {
      metadata.title = rawVal;
    } else if (rawKey === "theme") {
      if (isValidThemeId(rawVal)) {
        metadata.theme = rawVal;
      }
    } else if (rawKey === "author") {
      metadata.author = rawVal;
    } else if (rawKey === "date") {
      metadata.date = rawVal;
    } else if (rawKey === "css" || rawKey === "customCss") {
      metadata.customCss = rawVal;
    } else {
      metadata[rawKey] = rawVal;
    }
  }

  return metadata;
}

/**
 * Extracts YAML frontmatter, extracts metadata keys (title, theme, author, etc.),
 * and cleanly strips the frontmatter block from the Markdown body.
 */
export function extractFrontmatter(source: string): ParsedFrontmatter {
  if (!source || !source.startsWith("---")) {
    return {
      metadata: {},
      body: source,
      hasFrontmatter: false,
    };
  }

  // Find the closing delimiter
  const lines = source.split(/\r?\n/);
  if (lines[0]?.trim() !== "---") {
    return {
      metadata: {},
      body: source,
      hasFrontmatter: false,
    };
  }

  let closingIndex = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i]?.trim() === "---") {
      closingIndex = i;
      break;
    }
  }

  if (closingIndex === -1) {
    // Frontmatter is unclosed (linter will report MD002)
    return {
      metadata: {},
      body: source,
      hasFrontmatter: false,
    };
  }

  const yamlLines = lines.slice(1, closingIndex);
  const bodyLines = lines.slice(closingIndex + 1);

  const yamlText = yamlLines.join("\n");
  const metadata = parseYamlBlock(yamlText);
  const body = bodyLines.join("\n");

  return {
    metadata,
    body,
    title: metadata.title,
    theme: metadata.theme,
    hasFrontmatter: true,
  };
}
