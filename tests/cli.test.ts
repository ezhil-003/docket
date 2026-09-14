import { describe, it, expect } from "vitest";
import { getHelpText, parseCliArgs } from "../src/cli";
import { CliUsageError } from "../src/core/errors";

describe("CLI Engine (cli.ts)", () => {
  it("should generate help text containing Docket usage, flags, and theme options", () => {
    const help = getHelpText();
    expect(help).toContain("Docket - Production-Grade Executive Markdown → PDF Engine");
    expect(help).toContain("Launch interactive TUI workspace");
    expect(help).toContain("-t, --theme <theme>");
    expect(help).toContain("-o, --output <file.pdf>");
    expect(help).toContain("--title <name>");
    expect(help).toContain("--css <file.css>");
    expect(help).toContain("-w, --watch");
    expect(help).toContain("-p, --paste");
    expect(help).toContain("--dry-run <out.html>");
    expect(help).toContain("-v, --version");
    expect(help).toContain("executive");
    expect(help).toContain("technical");
    expect(help).toContain("legal");
    expect(help).toContain("boardroom");
    expect(help).toContain("minimal");
  });

  it("parses empty arguments into default options", () => {
    expect(parseCliArgs([])).toEqual({
      themeId: "executive",
      outputPath: undefined,
      inputPath: undefined,
      title: undefined,
      customCssPath: undefined,
      watch: false,
      paste: false,
      forceLint: false,
      dryRunHtmlPath: undefined,
    });
  });

  it("handles version flag correctly", () => {
    expect(parseCliArgs(["-v"])).toBe("version");
    expect(parseCliArgs(["--version"])).toBe("version");
  });

  it("parses a complete command without exiting the process", () => {
    expect(parseCliArgs([
      "report.md",
      "--theme", "modern",
      "--output", "out.pdf",
      "--title", "Quarterly Report",
      "--css", "custom.css",
      "--watch",
      "--force",
    ])).toEqual({
      inputPath: "report.md",
      themeId: "modern",
      outputPath: "out.pdf",
      title: "Quarterly Report",
      customCssPath: "custom.css",
      watch: true,
      paste: false,
      forceLint: true,
      dryRunHtmlPath: undefined,
    });
  });

  it("rejects unknown options, missing values, and conflicting sources", () => {
    expect(() => parseCliArgs(["--unknown"])).toThrow(CliUsageError);
    expect(() => parseCliArgs(["--theme"])).toThrow(CliUsageError);
    expect(() => parseCliArgs(["--title"])).toThrow(CliUsageError);
    expect(() => parseCliArgs(["--css"])).toThrow(CliUsageError);
    expect(() => parseCliArgs(["--paste", "report.md"])).toThrow(CliUsageError);
    expect(() => parseCliArgs(["--watch", "--paste"])).toThrow(CliUsageError);
  });
});
