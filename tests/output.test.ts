import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { normalizePdfOutputPath, resolvePdfOutputPath, derivePdfFilename } from "../src/core/output";

describe("PDF output target handling", () => {
  const directories: string[] = [];

  afterEach(async () => {
    await Promise.all(directories.splice(0).map((directory) => fs.rm(directory, { recursive: true, force: true })));
  });

  it("turns an existing directory into an explicit default PDF target", async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), "docket-output-"));
    directories.push(directory);
    await expect(normalizePdfOutputPath(directory)).resolves.toBe(path.join(directory, "docket-output.pdf"));
  });

  it("adds the PDF extension and rejects directory-like filenames", () => {
    const directory = path.join(os.tmpdir(), "docket-output-target");
    expect(resolvePdfOutputPath(directory, "ahamed-store")).toBe(path.join(directory, "ahamed-store.pdf"));
    expect(() => resolvePdfOutputPath("/tmp", "nested/report.pdf")).toThrow("filename only");
  });

  it("derives safe PDF filenames from Markdown headings", () => {
    expect(derivePdfFilename("# Executive Briefing\nContent here")).toBe("executive-briefing.pdf");
    expect(derivePdfFilename("## Quarterly Metrics & 2026 Plan\nMore details")).toBe("quarterly-metrics-2026-plan.pdf");
    expect(derivePdfFilename("# **Special** [Report] `v2`!\nText")).toBe("special-report-v2.pdf");
    expect(derivePdfFilename("No headings here")).toBe("docket-output.pdf");
    expect(derivePdfFilename("", "custom.pdf")).toBe("custom.pdf");
  });
});
