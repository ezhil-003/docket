#!/usr/bin/env bun
import fs from "node:fs";
import path from "node:path";
import { renderPdf, shutdownRenderer } from "./core/render";
import { THEME_IDS, THEMES, isValidThemeId, type ThemeId } from "./core/themes";
import { lintMarkdown } from "./core/lint";
import { CliUsageError, formatDocketError } from "./core/errors";
import { NodeFileSystem } from "./core/fs";
import { expandHomeDir } from "./core/paths";

const VERSION = "1.4.2";
const fileSystem = new NodeFileSystem();

export interface CliOptions {
  themeId: ThemeId;
  outputPath?: string;
  inputPath?: string;
  title?: string;
  customCssPath?: string;
  watch: boolean;
  paste: boolean;
  forceLint: boolean;
  dryRunHtmlPath?: string;
}

export function getHelpText(): string {
  return `
Docket - Production-Grade Executive Markdown → PDF Engine (v${VERSION})

USAGE:
  $ docket                     Launch interactive TUI workspace
  $ docket <input.md> [options] Convert Markdown file via CLI
  $ cat input.md | docket      Convert Markdown from STDIN via CLI

OPTIONS:
  -t, --theme <theme>      Select theme preset (default: executive)
                           Available themes: ${THEME_IDS.join(", ")}
  -o, --output <file.pdf>  Output PDF file path (default: <input>.pdf or docket-output.pdf)
  --title <name>           Override document title in PDF metadata
  --css <file.css>         Apply custom CSS stylesheet or corporate tokens
  -w, --watch              Watch input file and auto-recompile PDF on change
  -p, --paste              Read Markdown content directly from STDIN
  --dry-run <out.html>     Export intermediate HTML document without starting Chromium
  --force                  Bypass pre-conversion linting error gates
  -v, --version            Display Docket version
  -h, --help               Show this help message

THEMES:
${Object.values(THEMES).map((theme) => `  * ${theme.id.padEnd(12)} : ${theme.description}`).join("\n")}

EXAMPLES:
  $ docket document.md -t modern -o modern_report.pdf
  $ docket report.md --css brand.css --title "Executive Review" -w
  $ cat changelog.md | docket --paste -t technical -o release.pdf
`;
}

export function parseCliArgs(argv: readonly string[]): CliOptions | "help" | "version" {
  if (argv.includes("-h") || argv.includes("--help")) return "help";
  if (argv.includes("-v") || argv.includes("--version")) return "version";

  let themeId: ThemeId = "executive";
  let outputPath: string | undefined;
  let inputPath: string | undefined;
  let title: string | undefined;
  let customCssPath: string | undefined;
  let watch = false;
  let paste = false;
  let forceLint = false;
  let dryRunHtmlPath: string | undefined;

  const requireValue = (index: number, flag: string): string => {
    const value = argv[index + 1];
    if (!value || value.startsWith("-")) throw new CliUsageError(`Missing value for '${flag}'.`);
    return value;
  };

  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (!arg) continue;
    if (arg === "-t" || arg === "--theme") {
      const value = requireValue(index++, arg);
      if (!isValidThemeId(value)) throw new CliUsageError(`Invalid theme '${value}'. Valid choices: ${THEME_IDS.join(", ")}`);
      themeId = value;
    } else if (arg === "-o" || arg === "--output") {
      outputPath = requireValue(index++, arg);
    } else if (arg === "--title") {
      title = requireValue(index++, arg);
    } else if (arg === "--css") {
      customCssPath = requireValue(index++, arg);
    } else if (arg === "-w" || arg === "--watch") {
      watch = true;
    } else if (arg === "--dry-run") {
      dryRunHtmlPath = requireValue(index++, arg);
    } else if (arg === "-p" || arg === "--paste") {
      paste = true;
    } else if (arg === "--force") {
      forceLint = true;
    } else if (arg.startsWith("-")) {
      throw new CliUsageError(`Unknown option '${arg}'.`);
    } else if (inputPath) {
      throw new CliUsageError(`Only one input file may be specified; received '${inputPath}' and '${arg}'.`);
    } else {
      inputPath = arg;
    }
  }

  if (paste && inputPath) throw new CliUsageError("Use either an input file or --paste, not both.");
  if (watch && paste) throw new CliUsageError("Watch mode requires an input file and cannot be used with STDIN --paste.");

  return {
    themeId,
    outputPath,
    inputPath,
    title,
    customCssPath,
    watch,
    paste,
    forceLint,
    dryRunHtmlPath,
  };
}

export async function readStdin(maxBytes = 25 * 1024 * 1024): Promise<string> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of process.stdin) {
    const buffer = typeof chunk === "string" ? Buffer.from(chunk) : chunk;
    total += buffer.byteLength;
    if (total > maxBytes) throw new CliUsageError(`STDIN input exceeds the ${maxBytes} byte limit.`);
    chunks.push(buffer);
  }
  return Buffer.concat(chunks).toString("utf8");
}

async function runWatchMode(parsed: CliOptions): Promise<void> {
  if (!parsed.inputPath) {
    throw new CliUsageError("Watch mode requires an input file path.");
  }
  const resolvedInput = path.resolve(expandHomeDir(parsed.inputPath));
  console.log(`[docket] Watching '${parsed.inputPath}' for changes... (Press Ctrl+C to exit)`);

  let isRendering = false;
  let reRenderPending = false;

  const executeRender = async () => {
    if (isRendering) {
      reRenderPending = true;
      return;
    }
    isRendering = true;
    try {
      const markdownSource = await fileSystem.readText(resolvedInput);
      const docTitle = parsed.title ?? path.basename(resolvedInput, path.extname(resolvedInput));
      const outPath = parsed.outputPath ?? `${docTitle}.pdf`;

      const lintResult = lintMarkdown(markdownSource);
      if (!lintResult.isValid && !parsed.forceLint) {
        console.error(`\n[docket] Pre-conversion linting failed with ${lintResult.errors.length} error(s):`);
        for (const error of lintResult.errors) {
          console.error(`  🔴 Line ${error.line} [${error.ruleId}]: ${error.message}`);
        }
        return;
      }

      const result = await renderPdf({
        markdownSource,
        themeId: parsed.themeId,
        outputPath: outPath,
        title: parsed.title,
        customCssPath: parsed.customCssPath,
        dryRunHtmlPath: parsed.dryRunHtmlPath,
        dryRunOnly: Boolean(parsed.dryRunHtmlPath),
        skipLinting: parsed.forceLint,
      });

      const timestamp = new Date().toLocaleTimeString();
      console.log(`[${timestamp}] ✓ Re-rendered ${result.outputPath} (${(result.bytes / 1024).toFixed(1)} KB, ${(result.durationMs / 1000).toFixed(2)}s)`);
    } catch (error) {
      console.error(`[docket] Re-render error:`, formatDocketError(error));
    } finally {
      isRendering = false;
      if (reRenderPending) {
        reRenderPending = false;
        void executeRender();
      }
    }
  };

  // Run initial render
  await executeRender();

  let debounceTimer: ReturnType<typeof setTimeout> | undefined;
  const triggerDebounced = () => {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      void executeRender();
    }, 200);
  };

  const watcher = fs.watch(resolvedInput, (eventType) => {
    if (eventType === "change" || eventType === "rename") {
      triggerDebounced();
    }
  });

  let cssWatcher: fs.FSWatcher | undefined;
  if (parsed.customCssPath) {
    const resolvedCss = path.resolve(expandHomeDir(parsed.customCssPath));
    if (fs.existsSync(resolvedCss)) {
      cssWatcher = fs.watch(resolvedCss, (eventType) => {
        if (eventType === "change" || eventType === "rename") {
          triggerDebounced();
        }
      });
    }
  }

  // Await SIGINT/SIGTERM
  await new Promise<void>((resolve) => {
    process.once("SIGINT", () => {
      watcher.close();
      cssWatcher?.close();
      resolve();
    });
    process.once("SIGTERM", () => {
      watcher.close();
      cssWatcher?.close();
      resolve();
    });
  });
}

export async function main(argv = process.argv.slice(2)): Promise<number> {
  try {
    const parsed = parseCliArgs(argv);
    if (parsed === "help") {
      console.log(getHelpText());
      return 0;
    }
    if (parsed === "version") {
      console.log(`Docket v${VERSION}`);
      return 0;
    }
    if (!parsed.paste && !parsed.inputPath) {
      if (process.stdin.isTTY) {
        const { runTuiApp } = await import("./tui/app");
        await runTuiApp();
        return 0;
      }
      parsed.paste = true;
    }

    if (parsed.watch) {
      await runWatchMode(parsed);
      return 0;
    }

    let markdownSource: string;
    let title = parsed.title ?? "Docket Document";
    let outputPath = parsed.outputPath;
    if (parsed.paste) {
      console.log("[docket] Reading Markdown from STDIN...");
      markdownSource = await readStdin();
      outputPath ??= "docket-output.pdf";
    } else {
      const inputPath = expandHomeDir(parsed.inputPath as string);
      markdownSource = await fileSystem.readText(inputPath);
      title = parsed.title ?? path.basename(inputPath, path.extname(inputPath));
      outputPath ??= `${title}.pdf`;
    }

    const lintResult = lintMarkdown(markdownSource);
    if (!lintResult.isValid && !parsed.forceLint) {
      console.error(`\n[docket] Pre-conversion linting failed with ${lintResult.errors.length} error(s):`);
      for (const error of lintResult.errors) {
        console.error(`  🔴 Line ${error.line} [${error.ruleId}]: ${error.message}`);
        if (error.suggestion) console.error(`     ↳ Hint: ${error.suggestion}`);
      }
      console.error("\nPDF conversion aborted. Fix the errors or use '--force'.\n");
      return 1;
    }
    for (const warning of lintResult.warnings) {
      console.warn(`  ⚠️ Line ${warning.line} [${warning.ruleId}]: ${warning.message}`);
    }

    console.log(`[docket] Converting using theme: '${parsed.themeId}'...`);
    const renderResult = await renderPdf({
      markdownSource,
      themeId: parsed.themeId,
      outputPath: outputPath as string,
      title,
      customCssPath: parsed.customCssPath,
      dryRunHtmlPath: parsed.dryRunHtmlPath,
      dryRunOnly: Boolean(parsed.dryRunHtmlPath),
      skipLinting: parsed.forceLint,
    });
    console.log(parsed.dryRunHtmlPath ? "✓ [docket] HTML exported successfully!" : "✓ [docket] PDF generated successfully!");
    console.log(`  File:     ${renderResult.outputPath}`);
    console.log(`  Size:     ${(renderResult.bytes / 1024).toFixed(1)} KB`);
    console.log(`  Time:     ${(renderResult.durationMs / 1000).toFixed(2)}s`);
    return 0;
  } catch (error) {
    console.error(formatDocketError(error));
    return 1;
  } finally {
    await shutdownRenderer();
  }
}

function installProcessLifecycle(): void {
  let shuttingDown = false;
  const shutdown = async (code: number): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    await shutdownRenderer();
    process.exitCode = code;
  };
  process.once("SIGINT", () => void shutdown(130));
  process.once("SIGTERM", () => void shutdown(143));
  process.on("uncaughtException", (error) => {
    console.error(formatDocketError(error));
    void shutdown(1);
  });
  process.on("unhandledRejection", (error) => {
    console.error(formatDocketError(error));
    void shutdown(1);
  });
}

if (import.meta.main) {
  installProcessLifecycle();
  void main().then((code) => { process.exitCode = code; });
}
