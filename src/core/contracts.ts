import type { ThemeId } from "./themes";

export interface FileSystemPort {
  readText(filePath: string): Promise<string>;
  writeTextAtomic(filePath: string, content: string): Promise<void>;
  ensureDirectory(directoryPath: string): Promise<void>;
  exists(filePath: string): Promise<boolean>;
}

export interface SourceProvider {
  load(): Promise<{ source: string; title: string }>;
}

export interface GeneratePdfRequest {
  markdownSource: string;
  outputPath: string;
  themeId: ThemeId;
  title?: string;
  dryRunHtmlPath?: string;
  skipLinting?: boolean;
}

export type DocketCommand =
  | { type: "generate-pdf"; request: GeneratePdfRequest }
  | { type: "lint-document"; source: string }
  | { type: "load-file"; path: string }
  | { type: "set-theme"; themeId: ThemeId }
  | { type: "cancel-operation" };

export interface DocketState {
  screen: "startup" | "workspace";
  mode: "text" | "file";
  source: string;
  inputPath: string;
  outputPath: string;
  outputDirectory: string;
  outputFilename: string;
  themeId: ThemeId;
  diagnosticsVisible: boolean;
  messages: string[];
  renderStatus: "idle" | "linting" | "rendering" | "success" | "error";
  diagnostics?: import("./lint").LintResult;
  error?: import("./errors").DocketError;
}
