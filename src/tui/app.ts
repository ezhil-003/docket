#!/usr/bin/env bun
import {
  createCliRenderer,
  BoxRenderable,
  TextRenderable,
  InputRenderable,
  TextareaRenderable,
  TextAttributes,
  CliRenderEvents,
  type KeyEvent,
} from "@opentui/core";
import path from "node:path";
import { renderPdf, shutdownRenderer } from "../core/render";
import { THEME_IDS, THEMES, type ThemeId } from "../core/themes";
import { lintMarkdown, type LintResult } from "../core/lint";
import { DocketError, formatDocketError } from "../core/errors";
import { NodeFileSystem } from "../core/fs";
import { resolvePdfOutputPath } from "../core/output";
import { initialTuiState, reduceTuiState, type TuiEvent } from "./state";
import type { DocketState } from "../core/contracts";
import { getTuiLayout, shortenPath } from "./layout";
import { TUI_THEME } from "./theme";

const VERSION = process.env.npm_package_version ?? "1.2.1";
const defaultSampleMarkdown = `# Executive Briefing

> **Status**: Docket Markdown Engine Deployed

## Quarterly Metrics

| Metric | Target | Actual |
| :--- | :--- | :--- |
| Uptime | 99.9% | 99.99% |
| Conversion Speed | < 3s | 1.8s |

\`\`\`typescript
const result = await renderPdf({ themeId: "modern" });
\`\`\`
`;

type Renderer = Awaited<ReturnType<typeof createCliRenderer>>;

function makeButton(renderer: Renderer, label: string, action: () => void): { box: BoxRenderable; text: TextRenderable } {
  const text = new TextRenderable(renderer, { content: label, fg: TUI_THEME.text, attributes: TextAttributes.BOLD });
  const box = new BoxRenderable(renderer, {
    width: "auto",
    height: 3,
    paddingX: 1,
    borderStyle: "rounded",
    borderColor: TUI_THEME.border,
    focusedBorderColor: TUI_THEME.focus,
    backgroundColor: TUI_THEME.panelElevated,
    focusable: true,
    onMouseDown: () => action(),
    onKeyDown: (key: KeyEvent) => {
      if (key.name === "enter" || key.name === "space") action();
    },
  });
  box.add(text);
  return { box, text };
}

async function runTuiApp(): Promise<void> {
  const renderer = await createCliRenderer({
    exitOnCtrlC: false,
    useMouse: true,
    enableMouseMovement: false,
    clearOnShutdown: true,
    backgroundColor: TUI_THEME.background,
  });
  let state: DocketState = { ...initialTuiState, source: defaultSampleMarkdown, messages: ["Workspace ready"] };
  let lintTimer: ReturnType<typeof setTimeout> | undefined;
  let lintGeneration = 0;
  let renderAbortController: AbortController | undefined;
  let syncingEditor = false;
  const fileSystem = new NodeFileSystem();

  const root = new BoxRenderable(renderer, {
    flexDirection: "column",
    width: "100%",
    height: "100%",
    padding: 1,
    backgroundColor: TUI_THEME.background,
  });

  // Startup screen
  const startupScreen = new BoxRenderable(renderer, {
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    width: "100%",
    height: "100%",
    gap: 2,
  });
  const startupPanel = new BoxRenderable(renderer, {
    flexDirection: "column",
    width: "78%",
    maxWidth: 104,
    gap: 1,
    backgroundColor: TUI_THEME.background,
  });
  const logoWrap = new BoxRenderable(renderer, { width: "100%", alignItems: "center" });
  const logo = new TextRenderable(renderer, {
    content: "▛▀▖▞▀▖▞▀▖▌ ▌▛▀▘▀▛▘\n▌ ▌▌ ▌▌  ▙▞ ▙▄  ▌ \n▌ ▌▌ ▌▌ ▖▌▝▖▌   ▌ \n▀▀ ▝▀ ▝▀ ▘ ▘▀▀▘ ▘ ",
    fg: TUI_THEME.accent,
    attributes: TextAttributes.BOLD,
  });
  logoWrap.add(logo);
  const startupEditorFrame = new BoxRenderable(renderer, {
    width: "100%",
    height: 9,
    paddingX: 2,
    paddingY:1,
    border: ["left"],
    borderColor: TUI_THEME.focus,
    backgroundColor: TUI_THEME.panelElevated,
  });
  const logoSubtitle = new TextRenderable(renderer, {
    content: "Markdown  →  Executive PDF Engine",
    fg: TUI_THEME.muted,
  });
  const startupDescription = new TextRenderable(renderer, {
    content: "Create polished, margin-safe PDFs from Markdown.",
    fg: TUI_THEME.text,
  });
  const startupLabel = new TextRenderable(renderer, { content: "Markdown input", fg: TUI_THEME.muted });
  const startupEditor = new TextareaRenderable(renderer, {
    placeholder: "# Start writing or paste your Markdown here…",
    initialValue: state.source,
    width: "100%",
    height: "100%",
    wrapMode: "word",
    backgroundColor: TUI_THEME.panelElevated,
    focusedBackgroundColor: TUI_THEME.panelElevated,
    textColor: TUI_THEME.text,
    onContentChange: () => {
      if (!syncingEditor) dispatch({ type: "set-source", source: startupEditor.plainText });
    },
  });
  startupEditorFrame.add(startupEditor);
  const startupActions = new BoxRenderable(renderer, { flexDirection: "row", flexWrap: "wrap", gap: 1, width: "100%" });
  const startButton = makeButton(renderer, " Start Workspace ", () => startWorkspace("text"));
  const openButton = makeButton(renderer, " Open File ", () => startWorkspace("file"));
  const quitStartupButton = makeButton(renderer, " Quit ", () => renderer.destroy());
  startupActions.add(startButton.box);
  startupActions.add(openButton.box);
  startupActions.add(quitStartupButton.box);
  const startupHints = new TextRenderable(renderer, { content: "Ctrl+Enter Start   Ctrl+O Open File   Esc Quit", fg: TUI_THEME.dim });
  const startupMeta = new BoxRenderable(renderer, { flexDirection: "row", justifyContent: "space-between", width: "100%" });
  const startupVersion = new TextRenderable(renderer, { content: `v${VERSION}`, fg: TUI_THEME.dim });
  const startupCwd = new TextRenderable(renderer, { content: shortenPath(process.cwd(), 54), fg: TUI_THEME.dim });
  startupMeta.add(startupVersion);
  startupMeta.add(startupCwd);
  startupPanel.add(logoWrap);
  startupPanel.add(logoSubtitle);
  startupPanel.add(startupDescription);
  startupPanel.add(startupLabel);
  startupPanel.add(startupEditorFrame);
  startupPanel.add(startupActions);
  startupPanel.add(startupHints);
  startupPanel.add(startupMeta);
  startupScreen.add(startupPanel);

  // Workspace screen
  const workspaceScreen = new BoxRenderable(renderer, {
    flexDirection: "column",
    width: "100%",
    height: "100%",
    gap: 1,
    overflow: "scroll",
    visible: false,
  });
  const header = new BoxRenderable(renderer, {
    flexDirection: "row",
    justifyContent: "space-between",
    width: "100%",
    height: 3,
    paddingX: 1,
    paddingY: 1,
    backgroundColor: TUI_THEME.panel,
  });
  const headerTitle = new TextRenderable(renderer, { content: " DOCKET  •  Markdown workspace", fg: TUI_THEME.text, attributes: TextAttributes.BOLD });
  const headerStatus = new TextRenderable(renderer, { content: "● Ready", fg: TUI_THEME.success });
  header.add(headerTitle);
  header.add(headerStatus);

  const main = new BoxRenderable(renderer, { flexDirection: "row", width: "100%", flexGrow: 1, gap: 1 });
  const editorPanel = new BoxRenderable(renderer, {
    flexDirection: "column",
    width: "68%",
    minWidth: 0,
    gap: 1,
    padding: 2,
    backgroundColor: TUI_THEME.panel,
  });
  const documentTitle = new TextRenderable(renderer, { content: "Markdown document loaded", fg: TUI_THEME.accent, attributes: TextAttributes.BOLD });
  const documentMeta = new TextRenderable(renderer, { content: "Text mode  •  Edit directly in this panel", fg: TUI_THEME.dim });
  const filePath = new InputRenderable(renderer, { placeholder: "Markdown file path", value: state.inputPath, width: "100%", visible: false });
  const outputDirectory = new InputRenderable(renderer, { placeholder: "Output folder", value: state.outputDirectory, width: "100%" });
  const outputFilename = new InputRenderable(renderer, { placeholder: "PDF filename", value: state.outputFilename, width: "100%" });
  const resolvedOutput = new TextRenderable(renderer, { content: "Will save to: (enter a PDF filename)", fg: TUI_THEME.dim });
  const editorFrame = new BoxRenderable(renderer, {
    flexDirection: "column",
    width: "100%",
    flexGrow: 1,
    minHeight: 8,
    padding: 1,
    border: ["left"],
    borderColor: TUI_THEME.focus,
    backgroundColor: TUI_THEME.panelElevated,
  });
  const editor = new TextareaRenderable(renderer, {
    placeholder: "Type or edit Markdown…",
    initialValue: state.source,
    width: "100%",
    height: "auto",
    flexGrow: 1,
    wrapMode: "word",
    backgroundColor: TUI_THEME.panelElevated,
    padding: 1,
    focusedBackgroundColor: TUI_THEME.panelElevated,
    textColor: TUI_THEME.text,
    onContentChange: () => {
      if (!syncingEditor) dispatch({ type: "set-source", source: editor.plainText });
      scheduleLint();
    },
  });
  editorFrame.add(editor);
  const outputSettings = new BoxRenderable(renderer, { flexDirection: "row", width: "100%", gap: 1 });
  const outputDirectoryGroup = new BoxRenderable(renderer, { flexDirection: "column", width: "58%", gap: 1 });
  const outputFilenameGroup = new BoxRenderable(renderer, { flexDirection: "column", width: "42%", gap: 1 });
  outputDirectoryGroup.add(new TextRenderable(renderer, { content: "Output folder", fg: TUI_THEME.muted }));
  outputDirectoryGroup.add(outputDirectory);
  outputFilenameGroup.add(new TextRenderable(renderer, { content: "PDF filename", fg: TUI_THEME.muted }));
  outputFilenameGroup.add(outputFilename);
  outputSettings.add(outputDirectoryGroup);
  outputSettings.add(outputFilenameGroup);
  editorPanel.add(documentTitle);
  editorPanel.add(documentMeta);
  editorPanel.add(filePath);
  editorPanel.add(editorFrame);
  editorPanel.add(outputSettings);
  editorPanel.add(resolvedOutput);

  const diagnosticsPanel = new BoxRenderable(renderer, {
    flexDirection: "column",
    width: "32%",
    minWidth: 0,
    gap: 1,
    padding: 1,
    backgroundColor: TUI_THEME.panel,
  });
  const diagnosticsBox = new BoxRenderable(renderer, {
    flexDirection: "column",
    height: "38%",
    minHeight: 5,
    padding: 2,
    backgroundColor: TUI_THEME.panel,
  });
  const diagnosticsTitle = new TextRenderable(renderer, { content: "DIAGNOSTICS", fg: TUI_THEME.muted, attributes: TextAttributes.BOLD });
  const diagnostics = new TextRenderable(renderer, { content: "🟢 Clean\n0 errors · 0 warnings\n\nNo issues detected.", fg: TUI_THEME.success });
  diagnosticsBox.add(diagnosticsTitle);
  diagnosticsBox.add(diagnostics);
  const messagesBox = new BoxRenderable(renderer, {
    flexDirection: "column",
    flexGrow: 1,
    minHeight: 5,
    padding: 2,
    backgroundColor: TUI_THEME.panel,
  });
  const messagesTitle = new TextRenderable(renderer, { content: "MESSAGES", fg: TUI_THEME.muted, attributes: TextAttributes.BOLD });
  const messages = new TextRenderable(renderer, { content: "Workspace ready", fg: TUI_THEME.text });
  messagesBox.add(messagesTitle);
  messagesBox.add(messages);
  diagnosticsPanel.add(diagnosticsBox);
  diagnosticsPanel.add(messagesBox);
  main.add(editorPanel);
  main.add(diagnosticsPanel);

  const actionBar = new BoxRenderable(renderer, { flexDirection: "row", flexWrap: "wrap", gap: 1, width: "100%", height: 3, flexShrink: 0 });
  const generateButton = makeButton(renderer, " Generate PDF ", () => void generatePdf());
  const themeButton = makeButton(renderer, ` Theme: ${THEMES[state.themeId].name} `, () => cycleTheme());
  const fileButton = makeButton(renderer, " File ", () => { dispatch({ type: "set-mode", mode: "file" }); filePath.focus(); });
  const diagnosticsButton = makeButton(renderer, " Diagnostics ", () => dispatch({ type: "toggle-diagnostics" }));
  const cancelButton = makeButton(renderer, " Cancel ", () => renderAbortController?.abort());
  actionBar.add(generateButton.box);
  actionBar.add(themeButton.box);
  actionBar.add(fileButton.box);
  actionBar.add(diagnosticsButton.box);
  actionBar.add(cancelButton.box);

  const statusBox = new BoxRenderable(renderer, {
    flexDirection: "row",
    alignItems: "center",
    width: "100%",
    height: 1,
    paddingX: 1,
    flexShrink: 0,
  });
  const statusLabel = new TextRenderable(renderer, { content: "Status: ", fg: TUI_THEME.muted, attributes: TextAttributes.BOLD });
  const status = new TextRenderable(renderer, { content: "Ready", fg: TUI_THEME.success });
  statusBox.add(statusLabel);
  statusBox.add(status);

  const footer = new TextRenderable(renderer, { content: "Ctrl+Enter Generate   Esc Interrupt   Tab Navigate   Ctrl+Q Quit", fg: TUI_THEME.dim });
  workspaceScreen.add(header);
  workspaceScreen.add(main);
  workspaceScreen.add(actionBar);
  workspaceScreen.add(statusBox);
  workspaceScreen.add(footer);

  root.add(startupScreen);
  root.add(workspaceScreen);
  renderer.root.add(root);

  function addMessage(message: string): void {
    dispatch({ type: "add-message", message });
    messages.content = state.messages.join("\n");
  }

  function updateDiagnostics(result: LintResult): void {
    const first = result.errors[0] ?? result.warnings[0];
    if (!first) {
      diagnostics.content = "🟢 Clean\n0 errors · 0 warnings\n\nNo issues detected.";
      diagnostics.fg = TUI_THEME.success;
      return;
    }
    diagnostics.content = `${first.severity === "error" ? "🔴" : "⚠️"} ${result.errors.length} errors · ${result.warnings.length} warnings\n\n${first.ruleId} · Line ${first.line}\n${first.message}\n\nHint: ${first.suggestion ?? "Review this section."}`;
    diagnostics.fg = first.severity === "error" ? TUI_THEME.error : TUI_THEME.warning;
  }

  function updateLayout(): void {
    const layout = getTuiLayout(renderer.width, renderer.height);
    main.flexDirection = layout.sidebar ? "row" : "column";
    editorPanel.width = layout.sidebar ? "68%" : "100%";
    diagnosticsPanel.width = layout.sidebar ? "32%" : "100%";
    diagnosticsPanel.visible = layout.sidebar || state.diagnosticsVisible;
    diagnosticsBox.height = layout.sidebar ? layout.diagnosticsHeight : 8;
    diagnosticsButton.box.visible = !layout.sidebar;
    editor.height = layout.editorHeight;
    startupPanel.width = layout.compact ? "98%" : "92%";
    startupDescription.visible = !layout.compact;
    logoSubtitle.visible = !layout.compact;
    logo.content = layout.compact
      ? "D O C K E T"
      : "▛▀▖▞▀▖▞▀▖▌ ▌▛▀▘▀▛▘\n▌ ▌▌ ▌▌  ▙▞ ▙▄  ▌ \n▌ ▌▌ ▌▌ ▖▌▝▖▌   ▌ \n▀▀ ▝▀ ▝▀ ▘ ▘▀▀▘ ▘ ";
    startupEditorFrame.height = layout.compact ? 7 : 9;
    startupEditor.height = "100%";
    startupHints.content = layout.compact ? "Ctrl+Enter Start   Ctrl+O File   Esc Quit" : "Ctrl+Enter Start   Ctrl+O Open File   Esc Quit";
    startupCwd.content = shortenPath(process.cwd(), layout.compact ? 28 : 54);
    generateButton.text.content = layout.compact ? " Generate " : " Generate PDF ";
    themeButton.text.content = layout.compact ? ` ${THEMES[state.themeId].name} ` : ` Theme: ${THEMES[state.themeId].name} `;
    diagnosticsButton.text.content = layout.compact ? " Diagnostics " : " Diagnostics ";
    cancelButton.text.content = layout.compact ? " Cancel " : " Cancel ";
    footer.content = layout.compact ? "Ctrl+Enter Generate   Esc Interrupt   Ctrl+D Diagnostics   Ctrl+Q Quit" : "Ctrl+Enter Generate   Esc Interrupt   Tab Navigate   Ctrl+Q Quit";
  }

  function dispatch(event: TuiEvent): DocketState {
    state = reduceTuiState(state, event);
    startupScreen.visible = state.screen === "startup";
    workspaceScreen.visible = state.screen === "workspace";
    filePath.visible = state.screen === "workspace" && state.mode === "file";
    headerStatus.content = state.renderStatus === "rendering" ? "◌ Rendering" : state.renderStatus === "error" ? "✕ Error" : state.renderStatus === "success" ? "✓ Complete" : "● Ready";
    headerStatus.fg = state.renderStatus === "error" ? TUI_THEME.error : state.renderStatus === "rendering" ? TUI_THEME.accent : TUI_THEME.success;
    documentMeta.content = `${state.mode === "file" ? "File mode" : "Text mode"}  •  Edit directly in this panel`;
    cancelButton.box.visible = state.renderStatus === "rendering";
    if (event.type === "set-output-directory" || event.type === "set-output-filename") {
      try {
        resolvedOutput.content = `Will save to: ${resolvePdfOutputPath(state.outputDirectory, state.outputFilename)}`;
        resolvedOutput.fg = TUI_THEME.dim;
      } catch (error) {
        resolvedOutput.content = formatDocketError(error);
        resolvedOutput.fg = TUI_THEME.error;
      }
    }
    updateLayout();
    return state;
  }

  function startWorkspace(mode: "text" | "file"): void {
    if (mode === "text") {
      state = dispatch({ type: "set-source", source: startupEditor.plainText });
      syncingEditor = true;
      editor.setText(startupEditor.plainText);
      syncingEditor = false;
    }
    dispatch({ type: "set-mode", mode });
    dispatch({ type: "enter-workspace" });
    addMessage(mode === "file" ? "Workspace opened — choose a Markdown file." : "Markdown document loaded");
    if (mode === "file") filePath.focus();
    else editor.focus();
    scheduleLint();
  }

  async function loadFile(): Promise<void> {
    const file = filePath.value.trim();
    if (!file) return;
    try {
      const content = await fileSystem.readText(file);
      syncingEditor = true;
      editor.setText(content);
      syncingEditor = false;
      dispatch({ type: "set-source", source: content });
      addMessage(`Loaded ${shortenPath(file, 48)}`);
      scheduleLint();
    } catch (error) {
      status.content = error instanceof DocketError ? error.message : formatDocketError(error).split("\n")[0] ?? "File access error";
      status.fg = TUI_THEME.error;
      addMessage(formatDocketError(error));
    }
  }

  async function readCurrentSource(): Promise<string> {
    if (state.mode === "text") return editor.plainText;
    try { return await fileSystem.readText(filePath.value.trim()); } catch { return ""; }
  }

  function scheduleLint(): void {
    if (lintTimer) clearTimeout(lintTimer);
    const generation = ++lintGeneration;
    dispatch({ type: "lint-started" });
    lintTimer = setTimeout(() => {
      void (async () => {
        try {
          const result = lintMarkdown(await readCurrentSource());
          if (generation !== lintGeneration) return;
          dispatch({ type: "lint-completed", diagnostics: result });
          updateDiagnostics(result);
          addMessage(result.isValid ? "Lint completed — ready to render" : `Lint found ${result.errors.length} error(s)`);
        } catch (error) {
          if (generation !== lintGeneration) return;
          const message = error instanceof Error ? error.message : String(error);
          status.content = `Lint failed: ${message}`;
          status.fg = TUI_THEME.error;
          addMessage(`Lint failed: ${message}`);
        }
      })();
    }, 160);
  }

  function cycleTheme(): void {
    const current = THEME_IDS.indexOf(state.themeId);
    const themeId = THEME_IDS[(current + 1) % THEME_IDS.length] ?? "executive";
    dispatch({ type: "set-theme", themeId });
    themeButton.text.content = ` Theme: ${THEMES[themeId].name} `;
    addMessage(`Theme changed to ${THEMES[themeId].name}`);
  }

  async function generatePdf(): Promise<void> {
    if (state.renderStatus === "rendering") return;
    const source = await readCurrentSource();
    const lint = lintMarkdown(source);
    updateDiagnostics(lint);
    if (!lint.isValid) {
      status.content = "Cannot render until Markdown errors are fixed.";
      status.fg = TUI_THEME.error;
      addMessage("Render blocked by lint errors");
      return;
    }
    renderAbortController = new AbortController();
    dispatch({ type: "render-started" });
    status.content = "Rendering… Chromium is preparing the PDF.";
    status.fg = TUI_THEME.accent;
    addMessage("Rendering started");
    try {
      const result = await renderPdf({
        markdownSource: source,
        outputPath: resolvePdfOutputPath(outputDirectory.value, outputFilename.value),
        title: state.mode === "file" ? path.basename(filePath.value, path.extname(filePath.value)) : "Pasted Executive Document",
        themeId: state.themeId,
        signal: renderAbortController.signal,
      });
      dispatch({ type: "render-succeeded" });
      status.content = `✓ Created ${shortenPath(result.outputPath, 48)} (${(result.bytes / 1024).toFixed(1)} KB, ${(result.durationMs / 1000).toFixed(2)}s)`;
      status.fg = TUI_THEME.success;
      addMessage(`Render completed — ${shortenPath(result.outputPath, 58)}`);
    } catch (error) {
      const docketError = error instanceof DocketError ? error : new DocketError(error instanceof Error ? error.message : String(error));
      dispatch({ type: "render-failed", error: docketError });
      status.content = docketError.message;
      status.fg = TUI_THEME.error;
      addMessage(docketError.message);
    } finally {
      renderAbortController = undefined;
    }
  }

  startupEditor.focus();
  startupEditor.onContentChange = () => dispatch({ type: "set-source", source: startupEditor.plainText });
  filePath.onSubmit = () => void loadFile();
  filePath.onContentChange = () => dispatch({ type: "set-input-path", path: filePath.value });
  outputDirectory.onContentChange = () => dispatch({ type: "set-output-directory", path: outputDirectory.value });
  outputFilename.onContentChange = () => dispatch({ type: "set-output-filename", filename: outputFilename.value });
  renderer.on(CliRenderEvents.RESIZE, updateLayout);
  renderer.keyInput.on("keypress", (key: KeyEvent) => {
    if (key.ctrl && key.name === "c") {
      renderer.destroy();
      void shutdownRenderer();
      return;
    }
    if (key.ctrl && key.name === "q") {
      renderer.destroy();
      void shutdownRenderer();
      return;
    }
    if (key.ctrl && key.name === "o") {
      if (state.screen === "startup") startWorkspace("file");
      else dispatch({ type: "set-mode", mode: "file" });
      filePath.focus();
      return;
    }
    if (key.ctrl && key.name === "d" && state.screen === "workspace") {
      dispatch({ type: "toggle-diagnostics" });
      return;
    }
    if (key.ctrl && key.name === "enter") {
      if (state.screen === "workspace") void generatePdf();
      else startWorkspace("text");
      return;
    }
    if (key.name === "escape") {
      if (state.screen === "startup") renderer.destroy();
      else if (state.renderStatus === "rendering") renderAbortController?.abort();
    }
  });
  dispatch({ type: "set-output-directory", path: outputDirectory.value });
  dispatch({ type: "set-output-filename", filename: outputFilename.value });
  updateLayout();
}

void runTuiApp().catch(async (error) => {
  console.error(formatDocketError(error));
  await shutdownRenderer();
  process.exitCode = 1;
});
