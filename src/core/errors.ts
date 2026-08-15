/**
 * Docket Custom Error Architecture & Error Formatters
 */

export class DocketError extends Error {
  public readonly code: string;
  public readonly userHint?: string;
  public readonly fatal: boolean;

  constructor(message: string, code = "ERR_DOCKET_GENERAL", userHint?: string, fatal = true) {
    super(message);
    this.name = "DocketError";
    this.code = code;
    this.userHint = userHint;
    this.fatal = fatal;

    // Restore prototype chain
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class MarkdownLintError extends DocketError {
  constructor(message: string, userHint = "Fix highlighted Markdown syntax errors before converting to PDF.") {
    super(message, "ERR_MARKDOWN_LINT", userHint, false);
    this.name = "MarkdownLintError";
  }
}

export class ThemeNotFoundError extends DocketError {
  constructor(themeId: string, availableThemes: string[]) {
    super(
      `Theme preset '${themeId}' was not found.`,
      "ERR_THEME_NOT_FOUND",
      `Available themes: ${availableThemes.join(", ")}`,
      false
    );
    this.name = "ThemeNotFoundError";
  }
}

export class PuppeteerRenderError extends DocketError {
  constructor(message: string, userHint = "Ensure Chromium/Chrome is installed or set PUPPETEER_EXECUTABLE_PATH.") {
    super(message, "ERR_PUPPETEER_RENDER", userHint, true);
    this.name = "PuppeteerRenderError";
  }
}

export class FileAccessError extends DocketError {
  constructor(filePath: string, reason: string) {
    super(
      `Cannot access file '${filePath}': ${reason}`,
      "ERR_FILE_ACCESS",
      "Check file path spelling, existence, and permissions.",
      false
    );
    this.name = "FileAccessError";
  }
}

/**
 * Formats any caught error into a clean, human-readable Docket diagnostic message.
 */
export function formatDocketError(err: unknown): string {
  if (err instanceof DocketError) {
    let output = `[Docket Error] (${err.code}): ${err.message}`;
    if (err.userHint) {
      output += `\n  ↳ Hint: ${err.userHint}`;
    }
    return output;
  }

  if (err instanceof Error) {
    return `[Docket Error]: ${err.message}`;
  }

  return `[Docket Error]: ${String(err)}`;
}
