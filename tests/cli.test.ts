import { describe, it, expect } from "vitest";
import { getHelpText, parseCliArgs } from "../src/cli";
import { CliUsageError } from "../src/core/errors";

describe("CLI Engine (cli.ts)", () => {
  it("should generate help text containing Docket usage, flags, and theme options", () => {
    const help = getHelpText();
    expect(help).toContain("Docket - Production-Grade Executive Markdown → PDF Engine");
    expect(help).toContain("-t, --theme <theme>");
    expect(help).toContain("-o, --output <file.pdf>");
    expect(help).toContain("-p, --paste");
    expect(help).toContain("--dry-run <out.html>");
    expect(help).toContain("executive");
    expect(help).toContain("technical");
    expect(help).toContain("legal");
    expect(help).toContain("boardroom");
    expect(help).toContain("minimal");
  });

  it("parses a complete command without exiting the process", () => {
    expect(parseCliArgs(["report.md", "--theme", "modern", "--output", "out.pdf", "--force"]))
      .toEqual({
        inputPath: "report.md",
        themeId: "modern",
        outputPath: "out.pdf",
        paste: false,
        forceLint: true,
      });
  });

  it("rejects unknown options, missing values, and conflicting sources", () => {
    expect(() => parseCliArgs(["--unknown"])).toThrow(CliUsageError);
    expect(() => parseCliArgs(["--theme"])).toThrow(CliUsageError);
    expect(() => parseCliArgs(["--paste", "report.md"])).toThrow(CliUsageError);
  });
});
