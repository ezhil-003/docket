import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { normalizePdfOutputPath, resolvePdfOutputPath } from "../src/core/output";

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
});
