import { afterEach, describe, expect, it } from "bun:test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { NodeFileSystem } from "../src/core/fs";

describe("filesystem adapter", () => {
  const directories: string[] = [];

  afterEach(async () => {
    await Promise.all(directories.splice(0).map((directory) => fs.rm(directory, { recursive: true, force: true })));
  });

  it("creates parent directories and atomically publishes text", async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), "docket-fs-"));
    directories.push(directory);
    const filePath = path.join(directory, "nested", "document.md");
    const adapter = new NodeFileSystem();

    await adapter.writeTextAtomic(filePath, "# Stable output");

    expect(await adapter.exists(filePath)).toBe(true);
    expect(await adapter.readText(filePath)).toBe("# Stable output");
  });
});

