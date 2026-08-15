import fs from "node:fs";
import path from "node:path";
import { renderPdf } from "./core/render";
import { THEME_IDS, THEMES, isValidThemeId, type ThemeId } from "./core/themes";
import { lintMarkdown } from "./core/lint";
import { formatDocketError } from "./core/errors";

export function getHelpText(): string {
  return `
Docket - Production-Grade Executive Markdown → PDF Engine

USAGE:
  $ docket <input.md> [options]
  $ cat input.md | docket --paste [options]

OPTIONS:
  -t, --theme <theme>      Select theme preset (default: executive)
                           Available themes: ${THEME_IDS.join(", ")}
  -o, --output <file.pdf>  Output PDF file path (default: <input>.pdf or docket-output.pdf)
  -p, --paste              Read Markdown content directly from STDIN
  --dry-run <out.html>     Export intermediate HTML document without browser render
  --force                  Bypass pre-conversion linting error gates
  -h, --help               Show this help message

THEMES:
${Object.values(THEMES)
  .map((t) => `  * ${t.id.padEnd(12)} : ${t.description}`)
  .join("\n")}

EXAMPLES:
  $ docket document.md -t modern -o modern_report.pdf
  $ cat changelog.md | docket --paste -t technical -o release.pdf
`;
}

export async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks).toString("utf-8");
}

export async function main(argv = process.argv.slice(2)) {
  if (argv.includes("-h") || argv.includes("--help")) {
    console.log(getHelpText());
    return;
  }

  let themeId: ThemeId = "executive";
  let outputPath: string | null = null;
  let inputPath: string | null = null;
  let isPaste = false;
  let forceLint = false;
  let dryRunHtmlPath: string | undefined = undefined;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];

    if (arg === "-t" || arg === "--theme") {
      const val = argv[++i];
      if (!val || !isValidThemeId(val)) {
        console.error(`[docket] Error: Invalid theme '${val}'. Valid choices: ${THEME_IDS.join(", ")}`);
        process.exit(1);
      }
      themeId = val;
    } else if (arg === "-o" || arg === "--output") {
      outputPath = argv[++i];
    } else if (arg === "-p" || arg === "--paste") {
      isPaste = true;
    } else if (arg === "--force") {
      forceLint = true;
    } else if (arg === "--dry-run") {
      dryRunHtmlPath = argv[++i];
    } else if (!arg.startsWith("-")) {
      inputPath = arg;
    }
  }

  let markdownSource = "";
  let title = "Docket Document";

  try {
    if (isPaste || !inputPath) {
      if (process.stdin.isTTY && !isPaste && !inputPath) {
        console.log(getHelpText());
        process.exit(1);
      }
      console.log("[docket] Reading Markdown from STDIN...");
      markdownSource = await readStdin();
      if (!outputPath) {
        outputPath = "docket-output.pdf";
      }
    } else {
      if (!fs.existsSync(inputPath)) {
        console.error(`[docket] Error: Input file '${inputPath}' not found.`);
        process.exit(1);
      }
      markdownSource = fs.readFileSync(inputPath, "utf-8");
      const base = path.basename(inputPath, path.extname(inputPath));
      title = base;
      if (!outputPath) {
        outputPath = `${base}.pdf`;
      }
    }

    // Pre-conversion Lint Diagnostics in CLI
    const lintResult = lintMarkdown(markdownSource);
    if (!lintResult.isValid && !forceLint) {
      console.error(`\n[docket Safeguard] Pre-conversion linting failed with ${lintResult.errors.length} error(s):`);
      for (const err of lintResult.errors) {
        console.error(`  🔴 Line ${err.line} [${err.ruleId}]: ${err.message}`);
        if (err.suggestion) {
          console.error(`     ↳ Hint: ${err.suggestion}`);
        }
      }
      console.error(`\nPDF conversion aborted to prevent generating a corrupted output file.`);
      console.error(`Fix the errors above or re-run with '--force' to bypass lint checks.\n`);
      process.exit(1);
    } else if (lintResult.hasWarnings) {
      for (const warn of lintResult.warnings) {
        console.warn(`  ⚠️ Line ${warn.line} [${warn.ruleId}]: ${warn.message}`);
      }
    }

    console.log(`[docket] Converting using theme: '${themeId}'...`);

    const result = await renderPdf({
      markdownSource,
      themeId,
      outputPath,
      title,
      dryRunHtmlPath,
      skipLinting: forceLint,
    });

    console.log(`✓ [docket] PDF generated successfully!`);
    console.log(`  File:     ${result.outputPath}`);
    console.log(`  Size:     ${(result.bytes / 1024).toFixed(1)} KB`);
    console.log(`  Time:     ${(result.durationMs / 1000).toFixed(2)}s`);
  } catch (err: any) {
    console.error(formatDocketError(err));
    process.exit(1);
  }
}

// Only execute main if directly invoked via CLI
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith("cli.ts")) {
  main();
}
