import { describe, it, expect } from "vitest";
import { getHelpText } from "../src/cli";

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
});
