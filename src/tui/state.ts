import type { DocketState } from "../core/contracts";
import type { DocketError } from "../core/errors";
import type { LintResult } from "../core/lint";
import type { ThemeId } from "../core/themes";

export type TuiEvent =
  | { type: "enter-workspace" }
  | { type: "show-startup" }
  | { type: "set-mode"; mode: DocketState["mode"] }
  | { type: "set-source"; source: string }
  | { type: "set-input-path"; path: string }
  | { type: "set-output-directory"; path: string }
  | { type: "set-output-filename"; filename: string }
  | { type: "set-theme"; themeId: ThemeId }
  | { type: "set-pdf-theme"; themeId: ThemeId }
  | { type: "set-tui-theme"; themeId: ThemeId }
  | { type: "toggle-diagnostics" }
  | { type: "add-message"; message: string }
  | { type: "lint-started" }
  | { type: "lint-completed"; diagnostics: LintResult }
  | { type: "render-started" }
  | { type: "render-succeeded" }
  | { type: "render-failed"; error: DocketError };

export const initialTuiState: DocketState = {
  screen: "startup",
  mode: "text",
  source: "",
  inputPath: "",
  outputPath: "./docket-output.pdf",
  outputDirectory: ".",
  outputFilename: "docket-output.pdf",
  themeId: "executive",
  pdfTheme: "executive",
  tuiTheme: "executive",
  diagnosticsVisible: false,
  messages: [],
  renderStatus: "idle",
};

export function reduceTuiState(state: DocketState, event: TuiEvent): DocketState {
  switch (event.type) {
    case "enter-workspace": return { ...state, screen: "workspace" };
    case "show-startup": return { ...state, screen: "startup" };
    case "set-mode": return { ...state, mode: event.mode };
    case "set-source": return { ...state, source: event.source };
    case "set-input-path": return { ...state, inputPath: event.path };
    case "set-output-directory": return { ...state, outputDirectory: event.path };
    case "set-output-filename": return { ...state, outputFilename: event.filename };
    case "set-theme": return { ...state, themeId: event.themeId, pdfTheme: event.themeId, tuiTheme: event.themeId };
    case "set-pdf-theme": return { ...state, pdfTheme: event.themeId, themeId: event.themeId };
    case "set-tui-theme": return { ...state, tuiTheme: event.themeId };
    case "toggle-diagnostics": return { ...state, diagnosticsVisible: !state.diagnosticsVisible };
    case "add-message": return { ...state, messages: [...state.messages, event.message].slice(-8) };
    case "lint-started": return { ...state, renderStatus: "linting", error: undefined };
    case "lint-completed": return { ...state, diagnostics: event.diagnostics, renderStatus: "idle" };
    case "render-started": return { ...state, renderStatus: "rendering", error: undefined };
    case "render-succeeded": return { ...state, renderStatus: "success" };
    case "render-failed": return { ...state, renderStatus: "error", error: event.error };
  }
}
