export interface LintMessage {
  line: number;
  column?: number;
  ruleId: string;
  severity: "error" | "warning";
  message: string;
  suggestion?: string;
}

export interface LintResult {
  isValid: boolean;
  hasWarnings: boolean;
  errors: LintMessage[];
  warnings: LintMessage[];
  all: LintMessage[];
}

function result(messages: LintMessage[]): LintResult {
  const errors = messages.filter((message) => message.severity === "error");
  const warnings = messages.filter((message) => message.severity === "warning");
  return { isValid: errors.length === 0, hasWarnings: warnings.length > 0, errors, warnings, all: messages };
}

function countTableColumns(line: string): number {
  const value = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  let escaped = false;
  let columns = 1;
  for (const character of value) {
    if (escaped) {
      escaped = false;
    } else if (character === "\\") {
      escaped = true;
    } else if (character === "|") {
      columns++;
    }
  }
  return columns;
}

function maskInlineCode(line: string): string {
  return line.replace(/(`+)([\s\S]*?)\1/g, (match) => " ".repeat(match.length));
}

/**
 * Runs deterministic, token-aware structural diagnostics. It intentionally does
 * not reject valid Markdown merely because it is stylistically unusual.
 */
export function lintMarkdown(source: string): LintResult {
  if (!source || source.trim().length === 0) {
    return result([{
      line: 1,
      ruleId: "MD007/empty-document",
      severity: "warning",
      message: "Document is empty or contains only whitespace.",
      suggestion: "Add Markdown content to generate a PDF.",
    }]);
  }

  const messages: LintMessage[] = [];
  const lines = source.split(/\r?\n/);
  let fence: { marker: "```" | "~~~"; length: number; startLine: number } | null = null;
  let frontmatterClosed = lines[0]?.trim() !== "---";
  let inTable = false;
  let tableColumns = 0;
  let tableStartLine = 0;
  let lastHeadingLevel = 0;
  const htmlStack: Array<{ tag: string; line: number }> = [];
  let openLinkBracket: { line: number } | null = null;
  let linkParenthesisDepth = 0;
  let linkParenthesisLine = 0;

  for (let index = 0; index < lines.length; index++) {
    const line = lines[index] ?? "";
    const lineNumber = index + 1;

    if (!frontmatterClosed && lineNumber > 1 && line.trim() === "---") {
      frontmatterClosed = true;
      continue;
    }

    const fenceMatch = line.match(/^\s*(`{3,}|~{3,})(.*)$/);
    if (fenceMatch) {
      const marker = fenceMatch[1]?.startsWith("~") ? "~~~" : "```";
      const length = fenceMatch[1]?.length ?? 3;
      if (!fence) {
        fence = { marker, length, startLine: lineNumber };
      } else if (fence.marker === marker && length >= fence.length && !(fenceMatch[2] ?? "").trim()) {
        fence = null;
      }
      inTable = false;
      continue;
    }

    // Never apply ordinary Markdown rules to fenced code content.
    if (fence) continue;

    const headingMatch = line.match(/^(#{1,6})\s+/);
    if (headingMatch) {
      const level = headingMatch[1]?.length ?? 1;
      if (lastHeadingLevel > 0 && level > lastHeadingLevel + 1) {
        messages.push({
          line: lineNumber,
          ruleId: "MD008/heading-increment",
          severity: "warning",
          message: `Heading level jumped from H${lastHeadingLevel} to H${level} on line ${lineNumber}.`,
          suggestion: `Consider using H${lastHeadingLevel + 1} to maintain strict visual hierarchy.`,
        });
      }
      lastHeadingLevel = level;
    }

    // Track link structure across lines and ignore brackets inside inline code.
    // The previous per-line counts rejected valid multiline link text.
    const linkLine = maskInlineCode(line);
    for (let characterIndex = 0; characterIndex < linkLine.length; characterIndex++) {
      const character = linkLine[characterIndex];
      if (character === "\\") {
        characterIndex++;
        continue;
      }
      if (linkParenthesisDepth > 0) {
        if (character === "(") linkParenthesisDepth++;
        if (character === ")") linkParenthesisDepth--;
        continue;
      }
      if (character === "[" && !openLinkBracket) {
        openLinkBracket = { line: lineNumber };
        continue;
      }
      if (character === "]" && openLinkBracket) {
        openLinkBracket = null;
        if (linkLine[characterIndex + 1] === "(") {
          linkParenthesisDepth = 1;
          linkParenthesisLine = lineNumber;
          characterIndex++;
        }
      }
    }

    const isTableRow = line.trim().startsWith("|") && line.trim().endsWith("|");
    if (isTableRow) {
      const columns = countTableColumns(line);
      const isDivider = /^\s*\|?(?:\s*:?-{3,}:?\s*\|)+\s*$/.test(line);
      if (!inTable) {
        inTable = true;
        tableColumns = columns;
        tableStartLine = lineNumber;
      } else if (!isDivider && columns !== tableColumns) {
        messages.push({
          line: lineNumber,
          ruleId: "MD003/mismatched-table-columns",
          severity: "error",
          message: `Table row has ${columns} columns, but header on line ${tableStartLine} defined ${tableColumns} columns.`,
          suggestion: `Match column count with header (${tableColumns} columns).`,
        });
      }
    } else {
      inTable = false;
    }

    const maskedLine = maskInlineCode(line);
    const lineWithoutComments = maskedLine.replace(/<!--[\s\S]*?-->/g, "");
    const tagPattern = /<\/?(div|span|table|tr|td|th|b|i|strong|em)(?:\s[^>]*)?>/gi;
    for (const match of lineWithoutComments.matchAll(tagPattern)) {
      const fullTag = match[0] ?? "";
      const tag = match[1]?.toLowerCase();
      if (!tag || fullTag.endsWith("/>") || ["br", "img", "hr"].includes(tag)) continue;
      if (fullTag.startsWith("</")) {
        const previous = htmlStack.at(-1);
        if (previous?.tag === tag) htmlStack.pop();
      } else {
        htmlStack.push({ tag, line: lineNumber });
      }
    }
  }

  if (!frontmatterClosed) {
    messages.push({
      line: 1,
      ruleId: "MD002/malformed-frontmatter",
      severity: "error",
      message: "YAML frontmatter block '---' was opened on line 1 but never closed.",
      suggestion: "Add a closing '---' line to seal frontmatter.",
    });
  }
  if (fence) {
    messages.push({
      line: fence.startLine,
      ruleId: "MD001/unclosed-code-fence",
      severity: "error",
      message: `Unclosed code block fence (${fence.marker}) opened on line ${fence.startLine}.`,
      suggestion: `Add a closing ${fence.marker} line to complete the code block.`,
    });
  }
  if (openLinkBracket) {
    messages.push({
      line: openLinkBracket.line,
      ruleId: "MD004/unclosed-markdown-link",
      severity: "error",
      message: `Unclosed square bracket '[' in link on line ${openLinkBracket.line}.`,
      suggestion: "Ensure link text is closed with ']'.",
    });
  }
  if (linkParenthesisDepth > 0) {
    messages.push({
      line: linkParenthesisLine,
      ruleId: "MD004/unclosed-markdown-link",
      severity: "error",
      message: `Unclosed URL parenthesis '(' in Markdown link on line ${linkParenthesisLine}.`,
      suggestion: "Add closing ')' after target URL.",
    });
  }
  for (const tag of htmlStack) {
    messages.push({
      line: tag.line,
      ruleId: "MD005/unclosed-html-tag",
      severity: "warning",
      message: `Unclosed HTML tag <${tag.tag}> on line ${tag.line}.`,
      suggestion: `Add closing </${tag.tag}> tag to prevent layout distortion.`,
    });
  }

  try {
    Bun.markdown.html(source);
  } catch (error) {
    messages.push({
      line: 1,
      ruleId: "MD010/parser-failure",
      severity: "error",
      message: `Markdown parsing engine error: ${error instanceof Error ? error.message : String(error)}`,
      suggestion: "Inspect Markdown source for severe syntax corruption.",
    });
  }

  return result(messages);
}
