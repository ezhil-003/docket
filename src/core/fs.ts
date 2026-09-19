import fs from "node:fs/promises";
import path from "node:path";
import type { FileSystemPort } from "./contracts";
import { FileAccessError } from "./errors";
import { expandHomeDir } from "./paths";

export class BunFileSystem implements FileSystemPort {
  async readText(filePath: string): Promise<string> {
    const resolvedPath = expandHomeDir(filePath);
    try {
      const file = Bun.file(resolvedPath);
      if (!(await file.exists())) {
        throw new Error("File does not exist");
      }
      return await file.text();
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
      return await Bun.file(resolvedPath).exists();
    } catch {
      return false;
    }
  }

  async writeTextAtomic(filePath: string, content: string): Promise<void> {
    const resolvedPath = expandHomeDir(filePath);
    const directory = path.dirname(resolvedPath);
    const temporaryPath = `${resolvedPath}.tmp-${process.pid}-${Bun.randomUUIDv7()}`;
    try {
      await this.ensureDirectory(directory);
      await Bun.write(temporaryPath, content);
      await fs.rename(temporaryPath, resolvedPath);
    } catch (error) {
      try {
        await Bun.file(temporaryPath).delete();
      } catch {
        // Best-effort cleanup only.
      }
      throw new FileAccessError(resolvedPath, error instanceof Error ? error.message : String(error), { cause: error });
    }
  }
}

export const NodeFileSystem = BunFileSystem;
