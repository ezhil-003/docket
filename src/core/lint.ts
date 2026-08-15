import MarkdownIt from "markdown-it";

export interface LintMessage {
  line: number;
  column?: number;
  ruleId: string;
  severity: "error" | "warning";
  message: string;
  suggestion?: string;
}

export interface LintResult {
  isValid: boolean; // false if any 'error' severity messages exist
  hasWarnings: boolean;
  errors: LintMessage[];
  warnings: LintMessage[];
  all: LintMessage[];
}

const mdInstance = new MarkdownIt({ html: true });

/**
 * Fast, synchronous, real-time Markdown Linter evaluating Markdown text line-by-line & via AST tokens.
 * Completes in <1ms on typical documents to support live on-the-fly typing in editors.
 */
export function lintMarkdown(source: string): LintResult {
  const messages: LintMessage[] = [];

  if (!source || source.trim().length === 0) {
    messages.push({
      line: 1,
      ruleId: "MD007/empty-document",
      severity: "warning",
      message: "Document is empty or contains only whitespace.",
      suggestion: "Add Markdown content to generate a PDF.",
    });

    return {
      isValid: true,
      hasWarnings: true,
      errors: [],
      warnings: messages,
      all: messages,
    };
  }

  const lines = source.split(/\r?\n/);

  // 1. Check YAML Frontmatter (MD002)
  if (lines[0]?.trim() === "---") {
    let closedFrontmatter = false;
    for (let i = 1; i < lines.length; i++) {
      if (lines[i].trim() === "---") {
        closedFrontmatter = true;
        break;
      }
    }
    if (!closedFrontmatter) {
      messages.push({
        line: 1,
        ruleId: "MD002/malformed-frontmatter",
        severity: "error",
        message: "YAML frontmatter block '---' was opened on line 1 but never closed.",
        suggestion: "Add a closing '---' line to seal frontmatter.",
      });
    }
  }

  // 2. Check Fenced Code Blocks (MD001)
  let inCodeBlock = false;
  let codeBlockStartLine = -1;
  let fenceChar = "";

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const match = line.match(/^(\s*)(```|~~~)/);

    if (match) {
      const matchFence = match[2];
      if (!inCodeBlock) {
        inCodeBlock = true;
        codeBlockStartLine = i + 1;
        fenceChar = matchFence;
      } else if (matchFence === fenceChar) {
        inCodeBlock = false;
        codeBlockStartLine = -1;
        fenceChar = "";
      }
    }
  }

  if (inCodeBlock && codeBlockStartLine !== -1) {
    messages.push({
      line: codeBlockStartLine,
      ruleId: "MD001/unclosed-code-fence",
      severity: "error",
      message: `Unclosed code block fence (${fenceChar}) opened on line ${codeBlockStartLine}.`,
      suggestion: `Add a closing ${fenceChar} line to complete the code block.`,
    });
  }

  // 3. Line-by-line inspection (Links MD004, Emphasis MD006, HTML Tags MD005, Tables MD003)
  let inTable = false;
  let tableHeaderCols = 0;
  let tableStartLine = -1;
  let lastHeadingLevel = 0;

  for (let i = 0; i < lines.length; i++) {
    const lineNum = i + 1;
    const line = lines[i];

    // Skip checking inside code blocks
    if (inCodeBlock && lineNum >= codeBlockStartLine) {
      continue;
    }

    // Heading Increment Check (MD008)
    const headingMatch = line.match(/^(#{1,6})\s+/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      if (lastHeadingLevel > 0 && level > lastHeadingLevel + 1) {
        messages.push({
          line: lineNum,
          ruleId: "MD008/heading-increment",
          severity: "warning",
          message: `Heading level jumped from H${lastHeadingLevel} to H${level} on line ${lineNum}.`,
          suggestion: `Consider using H${lastHeadingLevel + 1} to maintain strict visual hierarchy.`,
        });
      }
      lastHeadingLevel = level;
    }

    // Markdown Link Syntax Check (MD004)
    // Unclosed bracket/paren: e.g. [text](url or [text without ]
    const openBrackets = (line.match(/\[/g) || []).length;
    const closeBrackets = (line.match(/\]/g) || []).length;
    if (openBrackets > closeBrackets) {
      messages.push({
        line: lineNum,
        ruleId: "MD004/unclosed-markdown-link",
        severity: "error",
        message: `Unclosed square bracket '[' in link on line ${lineNum}.`,
        suggestion: "Ensure link text is closed with ']'.",
      });
    }

    const openParensInLink = (line.match(/\]\([^)\n]*$/g) || []).length;
    if (openParensInLink > 0) {
      messages.push({
        line: lineNum,
        ruleId: "MD004/unclosed-markdown-link",
        severity: "error",
        message: `Unclosed URL parenthesis '(' in Markdown link on line ${lineNum}.`,
        suggestion: "Add closing ')' after target URL.",
      });
    }

    // Table Column Count Check (MD003)
    const isTableRow = line.trim().startsWith("|") && line.trim().endsWith("|");
    if (isTableRow) {
      const cols = line.split("|").filter((_, idx, arr) => idx > 0 && idx < arr.length - 1).length;
      if (!inTable) {
        inTable = true;
        tableHeaderCols = cols;
        tableStartLine = lineNum;
      } else {
        // Divider row e.g. | --- | --- |
        const isDivider = line.includes("---") || line.includes(":-");
        if (!isDivider && cols !== tableHeaderCols) {
          messages.push({
            line: lineNum,
            ruleId: "MD003/mismatched-table-columns",
            severity: "error",
            message: `Table row has ${cols} columns, but header on line ${tableStartLine} defined ${tableHeaderCols} columns.`,
            suggestion: `Match column count with header (${tableHeaderCols} columns).`,
          });
        }
      }
    } else {
      inTable = false;
    }

    // Unclosed HTML Tag Check (MD005)
    const openTags = (line.match(/<(div|span|table|tr|td|th|b|i|strong|em)(?:\s+[^>]*)?>/gi) || []);
    const closeTags = (line.match(/<\/(div|span|table|tr|td|th|b|i|strong|em)>/gi) || []);
    if (openTags.length > closeTags.length) {
      // Check if self-closing or inline
      const tagNames = openTags.map((t) => t.replace(/<([a-z0-9]+).*/i, "$1"));
      const closeTagNames = closeTags.map((t) => t.replace(/<\/([a-z0-9]+)>/i, "$1"));
      const unclosed = tagNames.filter((t) => !closeTagNames.includes(t));
      if (unclosed.length > 0) {
        messages.push({
          line: lineNum,
          ruleId: "MD005/unclosed-html-tag",
          severity: "warning",
          message: `Unclosed HTML tag <${unclosed[0]}> on line ${lineNum}.`,
          suggestion: `Add closing </${unclosed[0]}> tag to prevent layout distortion.`,
        });
      }
    }
  }

  // 4. Token Parsing AST Validation (Double-check markdown-it token tree)
  try {
    const tokens = mdInstance.parse(source, {});
    // Verify AST tokens for any orphan tags
    const stack: string[] = [];
    for (const token of tokens) {
      if (token.type.endsWith("_open")) {
        stack.push(token.type);
      } else if (token.type.endsWith("_close")) {
        const expected = token.type.replace("_close", "_open");
        const last = stack.pop();
        if (last && last !== expected) {
          messages.push({
            line: token.map ? token.map[0] + 1 : 1,
            ruleId: "MD009/mismatched-token",
            severity: "warning",
            message: `Mismatched Markdown block structure (${token.type}).`,
            suggestion: "Check nested lists, blockquotes, or tables.",
          });
        }
      }
    }
  } catch (err: any) {
    messages.push({
      line: 1,
      ruleId: "MD010/parser-failure",
      severity: "error",
      message: `Markdown parsing engine error: ${err?.message || err}`,
      suggestion: "Inspect Markdown source for severe syntax corruption.",
    });
  }

  const errors = messages.filter((m) => m.severity === "error");
  const warnings = messages.filter((m) => m.severity === "warning");

  return {
    isValid: errors.length === 0,
    hasWarnings: warnings.length > 0,
    errors,
    warnings,
    all: messages,
  };
}
