/**
 * Docket Custom Error Architecture & Error Formatters
 */

export class DocketError extends Error {
  public override name: string;
  public readonly code: string;
  public readonly userHint?: string;
  public readonly fatal: boolean;
  public readonly stage?: string;
  public override readonly cause?: unknown;

  constructor(
    message: string,
    code = "ERR_DOCKET_GENERAL",
    userHint?: string,
    fatal = true,
    options: { stage?: string; cause?: unknown } = {},
  ) {
    super(message);
    this.name = "DocketError";
    this.code = code;
    this.userHint = userHint;
    this.fatal = fatal;
    this.stage = options.stage;
    this.cause = options.cause;

    // Restore prototype chain
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class MarkdownLintError extends DocketError {
  constructor(
    message: string,
    userHint = "Fix highlighted Markdown syntax errors before converting to PDF.",
    options: { stage?: string; cause?: unknown } = {}
  ) {
    super(message, "ERR_MARKDOWN_LINT", userHint, false, { stage: "lint", ...options });
    this.name = "MarkdownLintError";
  }
}

export class ThemeNotFoundError extends DocketError {
  constructor(
    themeId: string,
    availableThemes: string[],
    options: { stage?: string; cause?: unknown } = {}
  ) {
    super(
      `Theme preset '${themeId}' was not found.`,
      "ERR_THEME_NOT_FOUND",
      `Available themes: ${availableThemes.join(", ")}`,
      false,
      { stage: "theme", ...options }
    );
    this.name = "ThemeNotFoundError";
  }
}

export class RenderError extends DocketError {
  constructor(
    message: string,
    userHint = "Ensure Chromium/Chrome is installed or set DOCKET_CHROME_PATH.",
    options: { stage?: string; cause?: unknown } = {},
    code = "ERR_PUPPETEER_RENDER",
  ) {
    super(message, code, userHint, true, { stage: "render", ...options });
    this.name = "RenderError";
  }
}

export class PuppeteerRenderError extends RenderError {
  constructor(
    message: string,
    userHint = "Ensure Chromium/Chrome is installed or set DOCKET_CHROME_PATH.",
    options: { stage?: string; cause?: unknown } = {}
  ) {
    super(message, userHint, options, "ERR_PUPPETEER_RENDER");
    this.name = "PuppeteerRenderError";
  }
}

export class FileAccessError extends DocketError {
  constructor(
    filePath: string,
    reason: string,
    options: { stage?: string; cause?: unknown } = {}
  ) {
    super(
      `Cannot access file '${filePath}': ${reason}`,
      "ERR_FILE_ACCESS",
      "Check file path spelling, existence, and permissions.",
      false,
      { stage: "fs", ...options }
    );
    this.name = "FileAccessError";
  }
}

export class CliUsageError extends DocketError {
  constructor(
    message: string,
    userHint = "Run 'docket --help' to see valid options.",
    options: { stage?: string; cause?: unknown } = {}
  ) {
    super(message, "ERR_CLI_USAGE", userHint, false, { stage: "cli", ...options });
    this.name = "CliUsageError";
  }
}

export class OutputPathError extends DocketError {
  constructor(
    message: string,
    options: { stage?: string; cause?: unknown } = {}
  ) {
    super(
      message,
      "ERR_OUTPUT_PATH",
      "Choose a writable folder and provide a PDF filename such as report.pdf.",
      false,
      { stage: "output", ...options }
    );
    this.name = "OutputPathError";
  }
}

/**
 * Formats any caught error into a clean, human-readable Docket diagnostic message.
 */
export function formatDocketError(err: unknown): string {
  if (err instanceof DocketError) {
    const stage = err.stage ? ` [${err.stage}]` : "";
    let output = `[Docket Error] (${err.code})${stage}: ${err.message}`;
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
