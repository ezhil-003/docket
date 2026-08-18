#!/usr/bin/env bun
import {
  createCliRenderer,
  BoxRenderable,
  ScrollBoxRenderable,
  TextRenderable,
  InputRenderable,
  TextareaRenderable,
  LineNumberRenderable,
  SyntaxStyle,
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
import { resolvePdfOutputPath, derivePdfFilename } from "../core/output";
import { pickFolderNative, pickFileNative } from "../core/native-picker";
import { initialTuiState, reduceTuiState, type TuiEvent } from "./state";
import type { DocketState } from "../core/contracts";
import { getTuiLayout, shortenPath } from "./layout";
import { TUI_THEME, THEME_PALETTES, getTuiTheme, createSyntaxStyle, type TuiColorPalette } from "./theme";

const VERSION = process.env.npm_package_version ?? "1.3.0";
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
    alignItems: "center",
    justifyContent: "center",
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

function makeMiniButton(renderer: Renderer, label: string, action: () => void): { box: BoxRenderable; text: TextRenderable } {
  const text = new TextRenderable(renderer, { content: label, fg: TUI_THEME.accent });
  const box = new BoxRenderable(renderer, {
    paddingX: 1,
    height: 1,
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

export async function runTuiApp(): Promise<void> {
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
    syntaxStyle: createSyntaxStyle(getTuiTheme(state.themeId)),
    onContentChange: () => {
      if (!syncingEditor) dispatch({ type: "set-source", source: startupEditor.plainText });
      applySyntaxHighlightsToEditor(startupEditor, getTuiTheme(state.themeId));
    },
  });
  startupEditorFrame.add(startupEditor);
  const startupActions = new BoxRenderable(renderer, { flexDirection: "row", flexWrap: "wrap", gap: 1, width: "100%" });
  const startButton = makeButton(renderer, " ⚡ Start (Ctrl+Enter) ", () => startWorkspace("text"));
  const openButton = makeButton(renderer, " 📁 Open File (Ctrl+O) ", async () => {
    if (process.platform === "darwin") {
      const file = await pickFileNative();
      if (file) {
        startWorkspace("file");
        filePath.value = file;
        dispatch({ type: "set-input-path", path: file });
        void loadFile();
        return;
      }
    }
    startWorkspace("file");
  });
  const startupThemeButton = makeButton(renderer, ` 🎨 ${THEME_PALETTES[state.themeId].name} `, () => cycleTheme());
  const quitStartupButton = makeButton(renderer, " ✕ Quit (Esc) ", () => renderer.destroy());
  startupActions.add(startButton.box);
  startupActions.add(openButton.box);
  startupActions.add(startupThemeButton.box);
  startupActions.add(quitStartupButton.box);
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
  startupPanel.add(startupMeta);
  startupScreen.add(startupPanel);

  // Workspace screen
  const workspaceScreen = new BoxRenderable(renderer, {
    flexDirection: "column",
    width: "100%",
    height: "100%",
    gap: 1,
    visible: false,
  });

  const header = new BoxRenderable(renderer, {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    width: "100%",
    height: 1,
    paddingX: 1,
    flexShrink: 0,
    backgroundColor: TUI_THEME.panel,
  });
  const headerTitle = new TextRenderable(renderer, {
    content: "▛▀ DOCKET  •  Executive Markdown Workspace [Editor Mode]",
    fg: TUI_THEME.text,
    attributes: TextAttributes.BOLD,
  });
  const headerStatus = new TextRenderable(renderer, { content: "● Ready", fg: TUI_THEME.success });
  header.add(headerTitle);
  header.add(headerStatus);

  const main = new BoxRenderable(renderer, {
    flexDirection: "row",
    width: "100%",
    height: "100%",
    flexGrow: 1,
    gap: 1,
  });

  // Left Column: Maximized Editor Panel (74% width, 100% height)
  const editorPanel = new BoxRenderable(renderer, {
    flexDirection: "column",
    width: "74%",
    height: "100%",
    minWidth: 0,
    padding: 0,
    backgroundColor: TUI_THEME.panelElevated,
  });

  const editorFrame = new BoxRenderable(renderer, {
    flexDirection: "row",
    width: "100%",
    height: "100%",
    flexGrow: 1,
    border: ["left"],
    borderColor: TUI_THEME.focus,
    backgroundColor: TUI_THEME.panelElevated,
  });

  const markdownSyntaxStyle = SyntaxStyle.fromStyles({
    "heading": { fg: "#4ec9b0", bold: true },
    "string": { fg: "#ce9178" },
    "code": { fg: "#9cdcfe" },
    "keyword": { fg: "#569cd6", bold: true },
    "comment": { fg: "#6a9955", italic: true },
    "list": { fg: "#dcdcaa" },
    "quote": { fg: "#c586c0", italic: true },
    "link": { fg: "#569cd6", underline: true },
  });

  let userEditedFilename = false;

  const editor = new TextareaRenderable(renderer, {
    placeholder: "Type or paste Markdown here…",
    initialValue: state.source,
    width: "100%",
    height: "100%",
    flexGrow: 1,
    wrapMode: "word",
    backgroundColor: TUI_THEME.panelElevated,
    focusedBackgroundColor: TUI_THEME.panelElevated,
    textColor: TUI_THEME.text,
    syntaxStyle: markdownSyntaxStyle,
    onContentChange: () => {
      if (!syncingEditor) {
        const text = editor.plainText;
        dispatch({ type: "set-source", source: text });
        if (!userEditedFilename) {
          const autoName = derivePdfFilename(text);
          dispatch({ type: "set-output-filename", filename: autoName });
          outputFilename.value = autoName;
        }
      }
      applySyntaxHighlights();
      scheduleLint();
    },
  });

  const lineNumberGutter = new LineNumberRenderable(renderer, {
    target: editor,
    fg: TUI_THEME.dim,
    bg: TUI_THEME.panelElevated,
    width: "100%",
    height: "100%",
    flexGrow: 1,
    minWidth: 3,
    paddingRight: 1,
  });
  lineNumberGutter.add(editor);
  editorFrame.add(lineNumberGutter);
  editorPanel.add(editorFrame);

  // Right Column: Scrollable Control Sidebar (26% width)
  const sidebarPanel = new ScrollBoxRenderable(renderer, {
    width: "26%",
    height: "100%",
    minWidth: 0,
    gap: 1,
  });

  // 1. Primary Actions Card
  const actionsCard = new BoxRenderable(renderer, {
    flexDirection: "column",
    width: "100%",
    gap: 1,
    padding: 1,
    flexShrink: 0,
    backgroundColor: TUI_THEME.panel,
  });
  const generateButton = makeButton(renderer, " Generate PDF ", () => void generatePdf());
  generateButton.box.width = "100%";
  const subActionsRow = new BoxRenderable(renderer, { flexDirection: "row", width: "100%", gap: 1, flexShrink: 0 });
  const themeButton = makeButton(renderer, ` ${THEMES[state.themeId].name.split(" ")[0]} `, () => cycleTheme());
  themeButton.box.width = "56%";
  themeButton.box.flexShrink = 0;
  const modeButton = makeButton(renderer, state.mode === "text" ? " Editor " : " File ", () => toggleMode());
  modeButton.box.width = "42%";
  modeButton.box.flexShrink = 0;
  subActionsRow.add(themeButton.box);
  subActionsRow.add(modeButton.box);
  const cancelButton = makeButton(renderer, " Cancel Render ", () => renderAbortController?.abort());
  cancelButton.box.width = "100%";
  cancelButton.box.visible = false;
  actionsCard.add(generateButton.box);
  actionsCard.add(subActionsRow);
  actionsCard.add(cancelButton.box);

  // 2. Output Settings Card
  const outputCard = new BoxRenderable(renderer, {
    flexDirection: "column",
    width: "100%",
    gap: 1,
    padding: 1,
    flexShrink: 0,
    backgroundColor: TUI_THEME.panel,
  });
  const outputCardTitle = new TextRenderable(renderer, { content: "OUTPUT TARGET", fg: TUI_THEME.muted, attributes: TextAttributes.BOLD });

  const filePath = new InputRenderable(renderer, {
    placeholder: "File (e.g. ./docs/report.md)",
    value: state.inputPath,
    width: "100%",
    backgroundColor: TUI_THEME.panelElevated,
    focusedBackgroundColor: TUI_THEME.panelElevated,
    textColor: TUI_THEME.text,
  });
  const filePathFrame = new BoxRenderable(renderer, {
    width: "100%",
    height: 3,
    paddingX: 1,
    borderStyle: "rounded",
    borderColor: TUI_THEME.border,
    focusedBorderColor: TUI_THEME.focus,
    backgroundColor: TUI_THEME.panelElevated,
  });
  filePathFrame.add(filePath);

  const filePathHeader = new BoxRenderable(renderer, { flexDirection: "row", justifyContent: "space-between", alignItems: "center", width: "100%" });
  filePathHeader.add(new TextRenderable(renderer, { content: "Source File", fg: TUI_THEME.muted }));
  const btnBrowseFile = makeMiniButton(renderer, " 🔍 Choose… ", async () => {
    const file = await pickFileNative();
    if (file) {
      filePath.value = file;
      dispatch({ type: "set-input-path", path: file });
      void loadFile();
    }
  });
  filePathHeader.add(btnBrowseFile.box);

  const filePathGroup = new BoxRenderable(renderer, { flexDirection: "column", width: "100%", gap: 0, visible: state.mode === "file" });
  filePathGroup.add(filePathHeader);
  filePathGroup.add(filePathFrame);

  function setFolderPreset(dir: string): void {
    outputDirectory.value = dir;
    dispatch({ type: "set-output-directory", path: dir });
  }

  const outputDirectory = new InputRenderable(renderer, {
    placeholder: "Folder (e.g. . or ./dist)",
    value: state.outputDirectory,
    width: "100%",
    backgroundColor: TUI_THEME.panelElevated,
    focusedBackgroundColor: TUI_THEME.panelElevated,
    textColor: TUI_THEME.text,
  });
  const outputDirectoryFrame = new BoxRenderable(renderer, {
    width: "100%",
    height: 3,
    paddingX: 1,
    borderStyle: "rounded",
    borderColor: TUI_THEME.border,
    focusedBorderColor: TUI_THEME.focus,
    backgroundColor: TUI_THEME.panelElevated,
  });
  outputDirectoryFrame.add(outputDirectory);

  const outputDirGroup = new BoxRenderable(renderer, { flexDirection: "column", width: "100%", gap: 1, flexShrink: 0 });
  const outputDirHeader = new BoxRenderable(renderer, { flexDirection: "row", justifyContent: "space-between", alignItems: "center", width: "100%" });
  outputDirHeader.add(new TextRenderable(renderer, { content: "Folder", fg: TUI_THEME.muted }));
  const btnBrowseFolder = makeMiniButton(renderer, " 🔍 Choose… ", async () => {
    const folder = await pickFolderNative();
    if (folder) {
      outputDirectory.value = folder;
      dispatch({ type: "set-output-directory", path: folder });
      addMessage(`Selected folder: ${shortenPath(folder, 48)}`);
    }
  });
  outputDirHeader.add(btnBrowseFolder.box);

  const folderPresetsRow = new BoxRenderable(renderer, { flexDirection: "row", gap: 1, width: "100%", flexWrap: "wrap" });
  const presetCwd = makeMiniButton(renderer, " . ", () => setFolderPreset("."));
  const presetDownloads = makeMiniButton(renderer, " ~/Downloads ", () => setFolderPreset("~/Downloads"));
  const presetDocs = makeMiniButton(renderer, " ~/Docs ", () => setFolderPreset("~/Documents"));
  const presetDist = makeMiniButton(renderer, " ./dist ", () => setFolderPreset("./dist"));
  folderPresetsRow.add(presetCwd.box);
  folderPresetsRow.add(presetDownloads.box);
  folderPresetsRow.add(presetDocs.box);
  folderPresetsRow.add(presetDist.box);

  outputDirGroup.add(outputDirHeader);
  outputDirGroup.add(outputDirectoryFrame);
  outputDirGroup.add(folderPresetsRow);

  const outputFilename = new InputRenderable(renderer, {
    placeholder: "File (e.g. report.pdf)",
    value: state.outputFilename,
    width: "100%",
    backgroundColor: TUI_THEME.panelElevated,
    focusedBackgroundColor: TUI_THEME.panelElevated,
    textColor: TUI_THEME.text,
  });
  const outputFilenameFrame = new BoxRenderable(renderer, {
    width: "100%",
    height: 3,
    paddingX: 1,
    borderStyle: "rounded",
    borderColor: TUI_THEME.border,
    focusedBorderColor: TUI_THEME.focus,
    backgroundColor: TUI_THEME.panelElevated,
  });
  outputFilenameFrame.add(outputFilename);

  const outputFilenameGroup = new BoxRenderable(renderer, { flexDirection: "column", width: "100%", gap: 0 });
  outputFilenameGroup.add(new TextRenderable(renderer, { content: "PDF Filename", fg: TUI_THEME.muted }));
  outputFilenameGroup.add(outputFilenameFrame);

  const resolvedOutput = new TextRenderable(renderer, {
    content: `Save target: ${resolvePdfOutputPath(state.outputDirectory, state.outputFilename)}`,
    fg: TUI_THEME.dim,
  });

  outputCard.add(outputCardTitle);
  outputCard.add(filePathGroup);
  outputCard.add(outputDirGroup);
  outputCard.add(outputFilenameGroup);
  outputCard.add(resolvedOutput);

  // 3. Diagnostics Card (Zero text bleeding)
  const diagnosticsCard = new BoxRenderable(renderer, {
    flexDirection: "column",
    width: "100%",
    minHeight: 5,
    padding: 1,
    flexShrink: 0,
    backgroundColor: TUI_THEME.panel,
  });
  const diagnosticsTitle = new TextRenderable(renderer, { content: "DIAGNOSTICS", fg: TUI_THEME.muted, attributes: TextAttributes.BOLD });
  const diagnostics = new TextRenderable(renderer, { content: "● Clean\n0 errors • 0 warnings\n\nNo issues detected.", fg: TUI_THEME.success });
  diagnosticsCard.add(diagnosticsTitle);
  diagnosticsCard.add(diagnostics);

  // 4. Activity Messages Card
  const messagesCard = new BoxRenderable(renderer, {
    flexDirection: "column",
    width: "100%",
    flexGrow: 1,
    minHeight: 4,
    padding: 1,
    backgroundColor: TUI_THEME.panel,
  });
  const messagesTitle = new TextRenderable(renderer, { content: "ACTIVITY LOG", fg: TUI_THEME.muted, attributes: TextAttributes.BOLD });
  const messages = new TextRenderable(renderer, { content: "Workspace ready", fg: TUI_THEME.text });
  messagesCard.add(messagesTitle);
  messagesCard.add(messages);

  sidebarPanel.add(actionsCard);
  sidebarPanel.add(outputCard);
  sidebarPanel.add(diagnosticsCard);
  sidebarPanel.add(messagesCard);

  main.add(editorPanel);
  main.add(sidebarPanel);

  const footer = new BoxRenderable(renderer, {
    flexDirection: "row",
    gap: 1,
    width: "100%",
    height: 1,
    flexShrink: 0,
    flexWrap: "wrap",
  });
  const btnGenerate = makeMiniButton(renderer, "⚡ Generate (Ctrl+Enter)", () => void generatePdf());
  const btnOpenFile = makeMiniButton(renderer, "📁 Open File (Ctrl+O)", () => {
    dispatch({ type: "set-mode", mode: "file" });
    filePath.focus();
  });
  const btnTheme = makeMiniButton(renderer, "🎨 Theme", () => cycleTheme());
  const btnMode = makeMiniButton(renderer, "✏ Mode", () => toggleMode());
  const btnQuit = makeMiniButton(renderer, "✕ Quit (Ctrl+Q)", () => {
    renderer.destroy();
    void shutdownRenderer();
  });
  footer.add(btnGenerate.box);
  footer.add(btnOpenFile.box);
  footer.add(btnTheme.box);
  footer.add(btnMode.box);
  footer.add(btnQuit.box);
  workspaceScreen.add(header);
  workspaceScreen.add(main);
  workspaceScreen.add(footer);

  root.add(startupScreen);
  root.add(workspaceScreen);
  renderer.root.add(root);

  function addMessage(message: string): void {
    dispatch({ type: "add-message", message });
    messages.content = state.messages.join("\n");
  }

  function updateDiagnostics(result: LintResult): void {
    lineNumberGutter.clearAllLineColors();
    lineNumberGutter.clearAllLineSigns();

    for (const err of result.errors) {
      lineNumberGutter.setLineColor(err.line, { gutter: TUI_THEME.error });
      lineNumberGutter.setLineSign(err.line, { before: "✖ ", beforeColor: TUI_THEME.error });
    }
    for (const warn of result.warnings) {
      if (!result.errors.some((e) => e.line === warn.line)) {
        lineNumberGutter.setLineColor(warn.line, { gutter: TUI_THEME.warning });
        lineNumberGutter.setLineSign(warn.line, { before: "▲ ", beforeColor: TUI_THEME.warning });
      }
    }

    const first = result.errors[0] ?? result.warnings[0];
    if (!first) {
      diagnostics.content = "● Clean\n0 errors • 0 warnings\n\nNo issues detected.";
      diagnostics.fg = TUI_THEME.success;
      return;
    }
    diagnostics.content = `${first.severity === "error" ? "■" : "▲"} ${result.errors.length} error(s) • ${result.warnings.length} warning(s)\n\n${first.ruleId} • Line ${first.line}\n${first.message}\n\nHint: ${first.suggestion ?? "Review this section."}`;
    diagnostics.fg = first.severity === "error" ? TUI_THEME.error : TUI_THEME.warning;
  }

  function updateLayout(): void {
    const layout = getTuiLayout(renderer.width, renderer.height);
    main.flexDirection = layout.sidebar ? "row" : "column";
    editorPanel.width = layout.sidebar ? "74%" : "100%";
    sidebarPanel.width = layout.sidebar ? "26%" : "100%";
    startupPanel.width = layout.compact ? "98%" : "92%";
    startupDescription.visible = !layout.compact;
    logoSubtitle.visible = !layout.compact;
    logo.content = layout.compact
      ? "D O C K E T"
      : "▛▀▖▞▀▖▞▀▖▌ ▌▛▀▘▀▛▘\n▌ ▌▌ ▌▌  ▙▞ ▙▄  ▌ \n▌ ▌▌ ▌▌ ▖▌▝▖▌   ▌ \n▀▀ ▝▀ ▝▀ ▘ ▘▀▀▘ ▘ ";
    startupEditorFrame.height = layout.compact ? 7 : 9;
    startupEditor.height = "100%";
    generateButton.text.content = " Generate PDF ";
    themeButton.text.content = ` ${THEMES[state.themeId].name.split(" ")[0]} `;
    modeButton.text.content = state.mode === "text" ? " Editor " : " File ";
  }

  function dispatch(event: TuiEvent): DocketState {
    state = reduceTuiState(state, event);
    startupScreen.visible = state.screen === "startup";
    workspaceScreen.visible = state.screen === "workspace";
    filePathGroup.visible = state.screen === "workspace" && state.mode === "file";
    headerTitle.content = `DOCKET  •  ${state.mode === "file" ? "File Mode" : "Editor Mode"}  •  ${state.outputFilename}`;
    headerStatus.content = state.renderStatus === "rendering" ? "◌ Rendering" : state.renderStatus === "error" ? "✕ Error" : state.renderStatus === "success" ? "✓ Complete" : "● Ready";
    headerStatus.fg = state.renderStatus === "error" ? TUI_THEME.error : state.renderStatus === "rendering" ? TUI_THEME.accent : TUI_THEME.success;
    modeButton.text.content = state.mode === "text" ? " Editor " : " File ";
    cancelButton.box.visible = state.renderStatus === "rendering";
    if (event.type === "set-output-directory" || event.type === "set-output-filename") {
      try {
        const fullPath = resolvePdfOutputPath(state.outputDirectory, state.outputFilename);
        resolvedOutput.content = `Save target: ${fullPath}`;
        resolvedOutput.fg = TUI_THEME.dim;
      } catch (error) {
        const message = error instanceof DocketError ? error.message : "Invalid output path or filename.";
        resolvedOutput.content = `⚠ ${message}`;
        resolvedOutput.fg = TUI_THEME.error;
      }
    }
    updateLayout();
    return state;
  }

  function toggleMode(): void {
    const nextMode = state.mode === "text" ? "file" : "text";
    dispatch({ type: "set-mode", mode: nextMode });
    if (nextMode === "file") {
      filePath.focus();
      addMessage("Switched to File mode — enter path or press Enter to load");
    } else {
      editor.focus();
      addMessage("Switched to Editor mode — edit directly in panel");
    }
    scheduleLint();
  }

  function applySyntaxHighlightsToEditor(targetEditor: TextareaRenderable, palette: TuiColorPalette): void {
    try {
      const style = createSyntaxStyle(palette);
      targetEditor.syntaxStyle = style;
      targetEditor.clearAllHighlights();

      const headingId = style.resolveStyleId("heading") ?? 1;
      const quoteId = style.resolveStyleId("quote") ?? 1;
      const listId = style.resolveStyleId("list") ?? 1;
      const codeId = style.resolveStyleId("code") ?? 1;
      const keywordId = style.resolveStyleId("keyword") ?? 1;
      const stringId = style.resolveStyleId("string") ?? 1;

      const text = targetEditor.plainText || "";
      const lines = text.split("\n");
      let inCodeBlock = false;

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]!;
        const trimmed = line.trimStart();

        // Code fence
        if (trimmed.startsWith("```")) {
          targetEditor.addHighlight(i, { start: 0, end: line.length, styleId: keywordId });
          inCodeBlock = !inCodeBlock;
          continue;
        }

        if (inCodeBlock) {
          targetEditor.addHighlight(i, { start: 0, end: line.length, styleId: codeId });
          continue;
        }

        // Heading (#, ##, ###)
        if (/^#{1,6}\s+/.test(trimmed)) {
          targetEditor.addHighlight(i, { start: 0, end: line.length, styleId: headingId });
          continue;
        }

        // Blockquote (> Quote)
        if (trimmed.startsWith(">")) {
          targetEditor.addHighlight(i, { start: 0, end: line.length, styleId: quoteId });
          continue;
        }

        // List item bullet
        if (/^([-*+]|\d+\.)\s+/.test(trimmed)) {
          const match = trimmed.match(/^([-*+]|\d+\.)\s+/);
          const bulletLen = match ? match[0].length : 2;
          const indent = line.length - trimmed.length;
          targetEditor.addHighlight(i, { start: indent, end: indent + bulletLen, styleId: listId });
        }

        // Table headers or horizontal rules
        if (/^(\|?[\s-:]+\|[\s-:]+\|?|---)$/.test(trimmed)) {
          targetEditor.addHighlight(i, { start: 0, end: line.length, styleId: keywordId });
        }

        // Inline code `code`
        let codeMatch: RegExpExecArray | null;
        const codeRegex = /`([^`]+)`/g;
        while ((codeMatch = codeRegex.exec(line)) !== null) {
          targetEditor.addHighlight(i, {
            start: codeMatch.index,
            end: codeMatch.index + codeMatch[0].length,
            styleId: codeId,
          });
        }

        // Markdown Links [text](url)
        let linkMatch: RegExpExecArray | null;
        const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
        while ((linkMatch = linkRegex.exec(line)) !== null) {
          targetEditor.addHighlight(i, {
            start: linkMatch.index,
            end: linkMatch.index + linkMatch[0].length,
            styleId: stringId,
          });
        }
      }
    } catch {
      // Ignore if editor is not yet mounted
    }
  }

  function applyCurrentThemeColors(themeId: ThemeId): void {
    const palette = getTuiTheme(themeId);
    
    startupEditor.backgroundColor = palette.panelElevated;
    startupEditor.focusedBackgroundColor = palette.panelElevated;
    startupEditor.textColor = palette.text;
    
    editor.backgroundColor = palette.panelElevated;
    editor.focusedBackgroundColor = palette.panelElevated;
    editor.textColor = palette.text;
    editorPanel.backgroundColor = palette.panelElevated;
    editorFrame.backgroundColor = palette.panelElevated;
    editorFrame.borderColor = palette.focus;
    lineNumberGutter.bg = palette.panelElevated;
    lineNumberGutter.fg = palette.dim;

    applySyntaxHighlightsToEditor(startupEditor, palette);
    applySyntaxHighlightsToEditor(editor, palette);
  }

  function applySyntaxHighlights(): void {
    applySyntaxHighlightsToEditor(editor, getTuiTheme(state.themeId));
  }

  function startWorkspace(mode: "text" | "file"): void {
    const initialText = startupEditor.plainText || state.source;
    state = dispatch({ type: "set-source", source: initialText });
    syncingEditor = true;
    editor.setText(initialText);
    syncingEditor = false;
    const initialFilename = derivePdfFilename(initialText);
    userEditedFilename = false;
    dispatch({ type: "set-output-filename", filename: initialFilename });
    outputFilename.value = initialFilename;
    dispatch({ type: "set-mode", mode });
    dispatch({ type: "enter-workspace" });
    addMessage(mode === "file" ? "Workspace opened — choose a Markdown file." : "Markdown document loaded into editor");
    if (mode === "file") filePath.focus();
    else editor.focus();
    applySyntaxHighlights();
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
      const fileDerivedName = `${path.basename(file, path.extname(file))}.pdf`;
      userEditedFilename = false;
      dispatch({ type: "set-output-filename", filename: fileDerivedName });
      outputFilename.value = fileDerivedName;
      addMessage(`Loaded ${shortenPath(file, 48)}`);
      applySyntaxHighlights();
      scheduleLint();
    } catch (error) {
      const errorMsg = error instanceof DocketError ? error.message : "File access error";
      status.content = errorMsg;
      status.fg = TUI_THEME.error;
      addMessage(errorMsg);
    }
  }

  async function readCurrentSource(): Promise<string> {
    if (state.mode === "text") {
      const text = editor.plainText;
      return (text && text.trim().length > 0) ? text : (state.source || "");
    }
    const file = filePath.value.trim();
    if (file) {
      try {
        return await fileSystem.readText(file);
      } catch (err) {
        if (editor.plainText && editor.plainText.trim().length > 0) {
          return editor.plainText;
        }
        throw err;
      }
    }
    return editor.plainText || state.source || "";
  }

  function scheduleLint(): void {
    if (lintTimer) clearTimeout(lintTimer);
    const generation = ++lintGeneration;
    dispatch({ type: "lint-started" });
    lintTimer = setTimeout(() => {
      void (async () => {
        try {
          applySyntaxHighlights();
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
    themeButton.text.content = ` ${THEME_PALETTES[themeId].name.split(" ")[0]} `;
    startupThemeButton.text.content = ` 🎨 ${THEME_PALETTES[themeId].name} `;
    applyCurrentThemeColors(themeId);
    addMessage(`Theme changed to ${THEME_PALETTES[themeId].name}`);
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
      let docTitle = "Docket Document";
      if (state.mode === "file" && filePath.value.trim()) {
        docTitle = path.basename(filePath.value, path.extname(filePath.value));
      } else {
        const firstHeading = source.match(/^#\s+(.+)$/m);
        if (firstHeading && firstHeading[1]) {
          docTitle = firstHeading[1].trim();
        } else {
          docTitle = "Executive Document";
        }
      }

      const result = await renderPdf({
        markdownSource: source,
        outputPath: resolvePdfOutputPath(outputDirectory.value, outputFilename.value),
        title: docTitle,
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
  startupEditor.onContentChange = () => {
    if (!syncingEditor) dispatch({ type: "set-source", source: startupEditor.plainText });
  };
  filePath.onSubmit = () => void loadFile();
  filePath.onContentChange = () => dispatch({ type: "set-input-path", path: filePath.value });
  outputDirectory.onContentChange = () => dispatch({ type: "set-output-directory", path: outputDirectory.value });
  outputFilename.onContentChange = () => {
    userEditedFilename = true;
    dispatch({ type: "set-output-filename", filename: outputFilename.value });
  };
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
      return;
    }
    if (key.name === "tab" && state.screen === "workspace") {
      const focusList = state.mode === "file"
        ? [filePath, editor, outputDirectory, outputFilename, generateButton.box, themeButton.box, modeButton.box]
        : [editor, outputDirectory, outputFilename, generateButton.box, themeButton.box, modeButton.box];

      const currentIdx = focusList.findIndex((item) => (item as any).focused || (item as any).isFocused?.() || (item as any).hasSelection?.());
      const nextIdx = key.shift
        ? (currentIdx <= 0 ? focusList.length - 1 : currentIdx - 1)
        : ((currentIdx + 1) % focusList.length);

      focusList[nextIdx]?.focus();
      return;
    }
  });
  dispatch({ type: "set-output-directory", path: outputDirectory.value });
  dispatch({ type: "set-output-filename", filename: outputFilename.value });
  applyCurrentThemeColors(state.themeId);
  updateLayout();
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith("app.ts")) {
  void runTuiApp().catch(async (error) => {
    console.error(formatDocketError(error));
    await shutdownRenderer();
    process.exitCode = 1;
  });
}
