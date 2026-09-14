import type { ThemeId } from "./themes";
import type { LintResult } from "./lint";
import type { DocketState } from "../tui/state";

export type { DocketState };

export interface FileSystemPort {
  readText(filePath: string): Promise<string>;
  writeTextAtomic(filePath: string, content: string): Promise<void>;
  ensureDirectory(directoryPath: string): Promise<void>;
  exists(filePath: string): Promise<boolean>;
}

export interface DocumentMetadata {
  title?: string;
  theme?: ThemeId;
  author?: string;
  date?: string;
  customCss?: string;
  [key: string]: unknown;
}

export interface DocumentInspection {
  title: string;
  metadata: DocumentMetadata;
  cleanMarkdown: string;
  diagnostics: LintResult;
}

export interface RenderOptions {
  markdownSource: string;
  outputPath: string;
  themeId?: ThemeId;
  customCssPath?: string;
  title?: string;
  dryRunHtmlPath?: string;
  dryRunOnly?: boolean;
  skipLinting?: boolean;
  signal?: AbortSignal;
  timeoutMs?: number;
}

export interface RenderResult {
  outputPath: string;
  bytes: number;
  durationMs: number;
  title?: string;
}
