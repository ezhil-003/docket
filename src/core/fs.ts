import fs from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
import type { FileSystemPort } from "./contracts";
import { FileAccessError } from "./errors";

export class NodeFileSystem implements FileSystemPort {
  async readText(filePath: string): Promise<string> {
    try {
      return await fs.readFile(filePath, "utf8");
    } catch (error) {
      throw new FileAccessError(filePath, error instanceof Error ? error.message : String(error));
    }
  }

  async ensureDirectory(directoryPath: string): Promise<void> {
    try {
      await fs.mkdir(directoryPath, { recursive: true });
    } catch (error) {
      throw new FileAccessError(directoryPath, error instanceof Error ? error.message : String(error));
    }
  }

  async exists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  async writeTextAtomic(filePath: string, content: string): Promise<void> {
    const directory = path.dirname(filePath);
    const temporaryPath = `${filePath}.tmp-${process.pid}-${randomUUID()}`;
    try {
      await this.ensureDirectory(directory);
      await fs.writeFile(temporaryPath, content, "utf8");
      await fs.rename(temporaryPath, filePath);
    } catch (error) {
      try {
        await fs.unlink(temporaryPath);
      } catch {
        // Best-effort cleanup only.
      }
      throw new FileAccessError(filePath, error instanceof Error ? error.message : String(error));
    }
  }
}
