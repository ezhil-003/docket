import {
  createCliRenderer,
  BoxRenderable,
  TextRenderable,
  InputRenderable,
  TextareaRenderable,
  SelectRenderable,
  TextAttributes,
} from "@opentui/core";
import fs from "node:fs";
import path from "node:path";
import { renderPdf } from "../core/render";
import { THEME_IDS, THEMES, type ThemeId } from "../core/themes";
import { lintMarkdown, type LintResult } from "../core/lint";
import { formatDocketError } from "../core/errors";

async function runTuiApp() {
  const renderer = await createCliRenderer({ exitOnCtrlC: true });

  // Default mode: PASTE / TEXT EDITOR
  let currentMode: "PASTE" | "FILE" = "PASTE";
  let isGenerating = false;
  let currentLintResult: LintResult = lintMarkdown("");

  // Root Box Container
  const rootBox = new BoxRenderable(renderer, {
    flexDirection: "column",
    width: "100%",
    height: "100%",
    padding: 1,
    borderStyle: "rounded",
    borderColor: "#2563eb",
  });

  // Header Bar
  const headerText = new TextRenderable(renderer, {
    content: " Docket — Executive Markdown Engine & Live Diagnostic Editor ",
    fg: "#ffffff",
    bg: "#2563eb",
    attributes: TextAttributes.BOLD,
  });

  // Mode Indicator
  const modeText = new TextRenderable(renderer, {
    content: "Input Mode: ★ [Ctrl+P] TEXT EDITOR (Default)    [Ctrl+F] FILE PATH",
    fg: "#38bdf8",
    marginTop: 1,
    marginBottom: 1,
  });

  // Output PDF Path Setup (Prominent)
  const outputPathLabel = new TextRenderable(renderer, {
    content: "Output PDF Destination Path:",
    fg: "#94a3b8",
  });

  const outputPathInput = new InputRenderable(renderer, {
    placeholder: "./docket-output.pdf",
    value: "./docket-output.pdf",
    width: 65,
  });

  // Markdown Editor Textarea
  const textareaLabel = new TextRenderable(renderer, {
    content: "Markdown Source Editor (Live Linting Active):",
    fg: "#94a3b8",
    marginTop: 1,
  });

  const defaultSampleMarkdown = `# Executive Briefing

> **Status**: Docket Markdown Engine Deployed

## 1. Quarterly Metrics

| Metric | Target | Actual |
| :--- | :--- | :--- |
| Uptime | 99.9% | 99.99% |
| Conversion Speed | < 3s | 1.8s |

\`\`\`typescript
const result = await renderPdf({ themeId: "modern" });
\`\`\`
`;

  const markdownTextarea = new TextareaRenderable(renderer, {
    placeholder: "# Type or Paste Markdown source here...",
    value: defaultSampleMarkdown,
    width: 72,
    height: 9,
  });

  // Editor Diagnostic Panel Box
  const diagnosticHeader = new TextRenderable(renderer, {
    content: "Live Editor Diagnostics: 🟢 Clean — Ready to Render",
    fg: "#4ade80",
    attributes: TextAttributes.BOLD,
    marginTop: 1,
  });

  const diagnosticDetail = new TextRenderable(renderer, {
    content: "No syntax errors detected.",
    fg: "#94a3b8",
    marginBottom: 1,
  });

  // File Path Mode Components
  const filePathLabel = new TextRenderable(renderer, {
    content: "Markdown Input File Path (.md):",
    fg: "#94a3b8",
    marginTop: 1,
  });

  const filePathInput = new InputRenderable(renderer, {
    placeholder: "document.md",
    value: "document.md",
    width: 65,
  });

  // Theme Select Component
  const themeLabel = new TextRenderable(renderer, {
    content: "Select Executive Theme Preset:",
    fg: "#94a3b8",
    marginTop: 1,
  });

  const themeOptions = THEME_IDS.map((id) => ({
    name: THEMES[id].name,
    description: THEMES[id].description,
    value: id,
  }));

  const themeSelect = new SelectRenderable(renderer, {
    options: themeOptions,
    selectedIndex: 0,
    showDescription: true,
    height: 7,
  });

  // Action Bar
  const actionHint = new TextRenderable(renderer, {
    content: "[Ctrl+G] Generate PDF    [Tab] Cycle Focus    [Ctrl+P/Ctrl+F] Mode    [Ctrl+C] Exit",
    fg: "#f59e0b",
    attributes: TextAttributes.BOLD,
    marginTop: 1,
  });

  // Status Line
  const statusText = new TextRenderable(renderer, {
    content: "Status: Ready. Edit text above and press [Ctrl+G] to render.",
    fg: "#a3e635",
    marginTop: 1,
  });

  // Assemble Component Tree
  rootBox.add(headerText);
  rootBox.add(modeText);

  rootBox.add(outputPathLabel);
  rootBox.add(outputPathInput);

  rootBox.add(textareaLabel);
  rootBox.add(markdownTextarea);

  rootBox.add(filePathLabel);
  rootBox.add(filePathInput);

  rootBox.add(diagnosticHeader);
  rootBox.add(diagnosticDetail);

  rootBox.add(themeLabel);
  rootBox.add(themeSelect);

  rootBox.add(actionHint);
  rootBox.add(statusText);

  renderer.root.add(rootBox);

  // Live Lint Evaluator Function
  function runLiveLint() {
    let source = "";

    if (currentMode === "PASTE") {
      source = markdownTextarea.plainText || markdownTextarea.value || "";
    } else {
      const file = filePathInput.value?.trim();
      if (file && fs.existsSync(file)) {
        try {
          source = fs.readFileSync(file, "utf-8");
        } catch {
          source = "";
        }
      }
    }

    currentLintResult = lintMarkdown(source);

    if (!currentLintResult.isValid) {
      diagnosticHeader.content = `Live Editor Diagnostics: 🔴 ${currentLintResult.errors.length} Error(s) Detected`;
      diagnosticHeader.fg = "#f87171";

      const err = currentLintResult.errors[0];
      diagnosticDetail.content = `Line ${err.line} [${err.ruleId}]: ${err.message} (Hint: ${err.suggestion || "Fix syntax"})`;
      diagnosticDetail.fg = "#fca5a5";
    } else if (currentLintResult.hasWarnings) {
      diagnosticHeader.content = `Live Editor Diagnostics: ⚠️ ${currentLintResult.warnings.length} Warning(s)`;
      diagnosticHeader.fg = "#f59e0b";

      const warn = currentLintResult.warnings[0];
      diagnosticDetail.content = `Line ${warn.line} [${warn.ruleId}]: ${warn.message}`;
      diagnosticDetail.fg = "#fde047";
    } else {
      diagnosticHeader.content = "Live Editor Diagnostics: 🟢 Clean — Ready to Render";
      diagnosticHeader.fg = "#4ade80";
      diagnosticDetail.content = "All syntax rules passed cleanly.";
      diagnosticDetail.fg = "#94a3b8";
    }
  }

  // Toggle visible elements according to mode
  function updateModeVisibility() {
    if (currentMode === "PASTE") {
      textareaLabel.visible = true;
      markdownTextarea.visible = true;
      filePathLabel.visible = false;
      filePathInput.visible = false;
      modeText.content = "Input Mode: ★ [Ctrl+P] TEXT EDITOR (Active)    [Ctrl+F] FILE PATH";
      markdownTextarea.focus();
    } else {
      textareaLabel.visible = false;
      markdownTextarea.visible = false;
      filePathLabel.visible = true;
      filePathInput.visible = true;
      modeText.content = "Input Mode:    [Ctrl+P] TEXT EDITOR      ★ [Ctrl+F] FILE PATH (Active)";
      filePathInput.focus();
    }
    runLiveLint();
  }

  updateModeVisibility();

  // PDF Generation Trigger with Pre-Render Safeguard Gate & Graceful Error Recovery
  async function generatePdf() {
    if (isGenerating) return;

    // Run mandatory pre-conversion check
    runLiveLint();

    if (!currentLintResult.isValid) {
      const err = currentLintResult.errors[0];
      statusText.content = `Status: ⛔ [Docket Safeguard] Cannot generate PDF: Critical syntax error on line ${err.line}. Fix highlighted error to proceed.`;
      statusText.fg = "#f87171";
      return;
    }

    isGenerating = true;
    statusText.content = "Status: ⏳ [Docket] Launching Puppeteer & rendering margin-safe PDF...";
    statusText.fg = "#38bdf8";

    try {
      let markdownSource = "";
      let title = "Docket Document";

      const selIndex = themeSelect.selectedIndex ?? 0;
      const themeId = THEME_IDS[selIndex] ?? "executive";
      const outPath = outputPathInput.value?.trim() || "docket-output.pdf";

      if (currentMode === "FILE") {
        const file = filePathInput.value?.trim();
        if (!file || !fs.existsSync(file)) {
          throw new Error(`Input file '${file}' does not exist on disk.`);
        }
        markdownSource = fs.readFileSync(file, "utf-8");
        title = path.basename(file, path.extname(file));
      } else {
        markdownSource = markdownTextarea.plainText || markdownTextarea.value || "";
        if (!markdownSource.trim()) {
          throw new Error("Textarea source is empty! Please type or paste Markdown content.");
        }
        title = "Pasted Executive Document";
      }

      const result = await renderPdf({
        markdownSource,
        themeId,
        outputPath: outPath,
        title,
      });

      statusText.content = `Status: ✓ [Docket] Created ${result.outputPath} (${(result.bytes / 1024).toFixed(1)} KB in ${(result.durationMs / 1000).toFixed(2)}s) [Theme: ${themeId}]`;
      statusText.fg = "#4ade80";
    } catch (err: any) {
      statusText.content = `Status: ✗ ${formatDocketError(err)}`;
      statusText.fg = "#f87171";
    } finally {
      isGenerating = false;
    }
  }

  // Keyboard Shortcuts & Input Listener
  renderer.keyInput.on("keypress", (key: any) => {
    if (key.ctrl && key.name === "c") {
      renderer.destroy();
      process.exit(0);
    }

    if (key.ctrl && key.name === "g") {
      generatePdf();
      return;
    }

    if (key.ctrl && key.name === "p") {
      currentMode = "PASTE";
      updateModeVisibility();
      return;
    }

    if (key.ctrl && key.name === "f") {
      currentMode = "FILE";
      updateModeVisibility();
      return;
    }

    if (key.name === "tab") {
      if (outputPathInput.focused) {
        if (currentMode === "PASTE") {
          markdownTextarea.focus();
        } else {
          filePathInput.focus();
        }
      } else if (markdownTextarea.focused || filePathInput.focused) {
        themeSelect.focus();
      } else if (themeSelect.focused) {
        outputPathInput.focus();
      } else {
        outputPathInput.focus();
      }
      return;
    }

    // Run live lint update on key events
    setImmediate(runLiveLint);
  });
}

runTuiApp().catch((err) => {
  console.error(formatDocketError(err));
  process.exit(1);
});
