import fs from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
import type { FileSystemPort } from "./contracts";
import { FileAccessError } from "./errors";
import { expandHomeDir } from "./paths";

export class NodeFileSystem implements FileSystemPort {
  async readText(filePath: string): Promise<string> {
    const resolvedPath = expandHomeDir(filePath);
    try {
      return await fs.readFile(resolvedPath, "utf8");
    } catch (error) {
      throw new FileAccessError(resolvedPath, error instanceof Error ? error.message : String(error), { cause: error });
    }
  }

  async ensureDirectory(directoryPath: string): Promise<void> {
    const resolvedPath = expandHomeDir(directoryPath);
    try {
      await fs.mkdir(resolvedPath, { recursive: true });
    } catch (error) {
      throw new FileAccessError(resolvedPath, error instanceof Error ? error.message : String(error), { cause: error });
    }
  }

  async exists(filePath: string): Promise<boolean> {
    const resolvedPath = expandHomeDir(filePath);
    try {
      await fs.access(resolvedPath);
      return true;
    } catch {
      return false;
    }
  }

  async writeTextAtomic(filePath: string, content: string): Promise<void> {
    const resolvedPath = expandHomeDir(filePath);
    const directory = path.dirname(resolvedPath);
    const temporaryPath = `${resolvedPath}.tmp-${process.pid}-${randomUUID()}`;
    try {
      await this.ensureDirectory(directory);
      await fs.writeFile(temporaryPath, content, "utf8");
      await fs.rename(temporaryPath, resolvedPath);
    } catch (error) {
      try {
        await fs.unlink(temporaryPath);
      } catch {
        // Best-effort cleanup only.
      }
      throw new FileAccessError(resolvedPath, error instanceof Error ? error.message : String(error), { cause: error });
    }
  }
}
