import { describe, it, expect } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { getHelpText, parseCliArgs, main } from "../src/cli";
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
    expect(help).toContain("-O, --open");
    expect(help).toContain("--preview");
    expect(help).toContain("--dry-run <out.html>");
    expect(help).toContain("-V, --verbose");
    expect(help).toContain("-q, --quiet");
    expect(help).toContain("--json-log");
    expect(help).toContain("--trace <file.json>");
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
      preview: false,
      open: false,
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
      "--open",
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
      preview: false,
      open: true,
    });
  });

  it("parses preview flag correctly", () => {
    const parsed = parseCliArgs(["sample.md", "--preview"]);
    if (typeof parsed === "object") {
      expect(parsed.preview).toBe(true);
      expect(parsed.inputPath).toBe("sample.md");
    }
  });

  it("parses observability and logging flags correctly", () => {
    const parsed = parseCliArgs([
      "doc.md",
      "--verbose",
      "--quiet",
      "--json-log",
      "--trace",
      "run-trace.json",
    ]);
    if (typeof parsed === "object") {
      expect(parsed.verbose).toBe(true);
      expect(parsed.quiet).toBe(true);
      expect(parsed.jsonLog).toBe(true);
      expect(parsed.tracePath).toBe("run-trace.json");
    }
  });

  it("exports trace file during CLI execution with --trace", async () => {
    const uniqueId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const traceOut = `/tmp/docket-cli-test-trace-${uniqueId}.json`;
    const dryRunOut = `/tmp/docket-dry-${uniqueId}.html`;
    const samplePath = path.resolve(__dirname, "../sample.md");
    const code = await main([
      samplePath,
      "--dry-run",
      dryRunOut,
      "--trace",
      traceOut,
      "--quiet",
    ]);
    expect(code).toBe(0);

    const traceFile = Bun.file(traceOut);
    expect(await traceFile.exists()).toBe(true);
    const traceJson = await traceFile.json();
    expect(traceJson.resource).toBeDefined();
    expect(traceJson.resource.attributes["service.name"]).toBe("docket");
    expect(traceJson.spans.length).toBeGreaterThan(0);

    // Clean up
    if (fs.existsSync(traceOut)) fs.unlinkSync(traceOut);
    if (fs.existsSync(dryRunOut)) fs.unlinkSync(dryRunOut);
  });

  it("rejects unknown options, missing values, and conflicting sources", () => {
    expect(() => parseCliArgs(["--unknown"])).toThrow(CliUsageError);
    expect(() => parseCliArgs(["--theme"])).toThrow(CliUsageError);
    expect(() => parseCliArgs(["--title"])).toThrow(CliUsageError);
    expect(() => parseCliArgs(["--css"])).toThrow(CliUsageError);
    expect(() => parseCliArgs(["--trace"])).toThrow(CliUsageError);
    expect(() => parseCliArgs(["--paste", "report.md"])).toThrow(CliUsageError);
    expect(() => parseCliArgs(["--watch", "--paste"])).toThrow(CliUsageError);
  });
});
