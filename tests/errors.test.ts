import { describe, it, expect } from "vitest";
import {
  DocketError,
  MarkdownLintError,
  ThemeNotFoundError,
  PuppeteerRenderError,
  FileAccessError,
  OutputPathError,
  formatDocketError,
} from "../src/core/errors";

describe("Docket Error Architecture & Formatters (errors.ts)", () => {
  it("should construct base DocketError with code and hint", () => {
    const err = new DocketError("Test error", "ERR_TEST", "Try again");
    expect(err.message).toBe("Test error");
    expect(err.code).toBe("ERR_TEST");
    expect(err.userHint).toBe("Try again");
    expect(err.fatal).toBe(true);
  });

  it("should construct MarkdownLintError", () => {
    const err = new MarkdownLintError("Syntax error on line 4");
    expect(err.code).toBe("ERR_MARKDOWN_LINT");
    expect(err.fatal).toBe(false);
  });

  it("should construct ThemeNotFoundError", () => {
    const err = new ThemeNotFoundError("unknown", ["executive", "modern"]);
    expect(err.code).toBe("ERR_THEME_NOT_FOUND");
    expect(err.userHint).toContain("executive, modern");
  });

  it("should construct PuppeteerRenderError and FileAccessError", () => {
    const renderErr = new PuppeteerRenderError("Launch failed");
    expect(renderErr.code).toBe("ERR_PUPPETEER_RENDER");

    const fileErr = new FileAccessError("/missing/file.md", "File not found");
    expect(fileErr.code).toBe("ERR_FILE_ACCESS");
  });

  it("should format DocketError objects with code and user hints cleanly", () => {
    const err = new DocketError("Access denied", "ERR_PERM", "Check permissions");
    const formatted = formatDocketError(err);
    expect(formatted).toContain("[Docket Error] (ERR_PERM): Access denied");
    expect(formatted).toContain("↳ Hint: Check permissions");
  });

  it("should identify invalid output targets separately from renderer failures", () => {
    const err = new OutputPathError("PDF filename cannot be empty.");
    expect(err.code).toBe("ERR_OUTPUT_PATH");
    expect(formatDocketError(err)).toContain("Choose a writable folder");
  });

  it("should preserve error cause and stage across error subclasses", () => {
    const originalError = new Error("Disk full");
    const fileErr = new FileAccessError("/path/to/doc.pdf", "EACCES", { cause: originalError });
    expect(fileErr.cause).toBe(originalError);
    expect(fileErr.stage).toBe("fs");

    const renderErr = new PuppeteerRenderError("Crash", "Reinstall", { cause: originalError });
    expect(renderErr.cause).toBe(originalError);
    expect(renderErr.stage).toBe("render");
  });
});
