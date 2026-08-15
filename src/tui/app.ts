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

async function runTuiApp() {
  const renderer = await createCliRenderer({ exitOnCtrlC: true });

  // Paste/Text Mode is default per UX setup specification
  let currentMode: "PASTE" | "FILE" = "PASTE";
  let isGenerating = false;

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
    content: " Docket — Executive Markdown to PDF Engine ",
    fg: "#ffffff",
    bg: "#2563eb",
    attributes: TextAttributes.BOLD,
  });

  // Input Mode Selector Bar
  const modeText = new TextRenderable(renderer, {
    content: "Input Mode: ★ [Ctrl+P] TEXT / PASTE (Default)    [Ctrl+F] FILE PATH",
    fg: "#38bdf8",
    marginTop: 1,
    marginBottom: 1,
  });

  // Output Path Setup Component (Prominent on initial setup)
  const outputPathLabel = new TextRenderable(renderer, {
    content: "Output PDF Destination Path:",
    fg: "#94a3b8",
  });

  const outputPathInput = new InputRenderable(renderer, {
    placeholder: "./docket-output.pdf",
    value: "./docket-output.pdf",
    width: 65,
  });

  // Paste Textarea Mode Components (Default)
  const textareaLabel = new TextRenderable(renderer, {
    content: "Markdown Source Text:",
    fg: "#94a3b8",
    marginTop: 1,
  });

  const markdownTextarea = new TextareaRenderable(renderer, {
    placeholder: "# Executive Summary\n\n- Q3 Growth: +24%\n- Infrastructure: 99.99% Uptime\n- Roadmap: Docket PDF Engine Deployed",
    width: 70,
    height: 9,
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

  // Action Hint Bar
  const actionHint = new TextRenderable(renderer, {
    content: "[Ctrl+G] Generate PDF    [Tab] Cycle Focus    [Ctrl+P/Ctrl+F] Mode    [Ctrl+C] Exit",
    fg: "#f59e0b",
    attributes: TextAttributes.BOLD,
    marginTop: 1,
  });

  // Status Line
  const statusText = new TextRenderable(renderer, {
    content: "Status: Ready. Type/paste Markdown or set file path, then press [Ctrl+G] to generate.",
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

  rootBox.add(themeLabel);
  rootBox.add(themeSelect);

  rootBox.add(actionHint);
  rootBox.add(statusText);

  renderer.root.add(rootBox);

  // Toggle visible elements according to mode
  function updateModeVisibility() {
    if (currentMode === "PASTE") {
      textareaLabel.visible = true;
      markdownTextarea.visible = true;
      filePathLabel.visible = false;
      filePathInput.visible = false;
      modeText.content = "Input Mode: ★ [Ctrl+P] TEXT / PASTE (Active)    [Ctrl+F] FILE PATH";
      markdownTextarea.focus();
    } else {
      textareaLabel.visible = false;
      markdownTextarea.visible = false;
      filePathLabel.visible = true;
      filePathInput.visible = true;
      modeText.content = "Input Mode:    [Ctrl+P] TEXT / PASTE      ★ [Ctrl+F] FILE PATH (Active)";
      filePathInput.focus();
    }
  }

  updateModeVisibility();

  // PDF Generation Trigger
  async function generatePdf() {
    if (isGenerating) return;
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
        markdownSource = markdownTextarea.plainText || "";
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
      statusText.content = `Status: ✗ Error: ${err?.message || err}`;
      statusText.fg = "#f87171";
    } finally {
      isGenerating = false;
    }
  }

  // Keyboard Shortcuts Handler
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
    }
  });
}

runTuiApp().catch((err) => {
  console.error("[Docket] TUI application error:", err);
  process.exit(1);
});
