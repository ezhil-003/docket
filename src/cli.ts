import fs from "node:fs";
import path from "node:path";
import { renderPdf } from "./core/render";
import { THEME_IDS, THEMES, isValidThemeId, type ThemeId } from "./core/themes";

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
  -h, --help               Show this help message

THEMES:
${Object.values(THEMES)
  .map((t) => `  * ${t.id.padEnd(12)} : ${t.description}`)
  .join("\n")}

EXAMPLES:
  $ docket document.md -t executive -o executive_report.pdf
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
  let dryRunHtmlPath: string | undefined = undefined;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg) continue;

    if (arg === "-t" || arg === "--theme") {
      const val = argv[++i];
      if (!val || !isValidThemeId(val)) {
        console.error(`[docket] Error: Invalid theme '${val}'. Valid choices: ${THEME_IDS.join(", ")}`);
        process.exit(1);
      }
      themeId = val;
    } else if (arg === "-o" || arg === "--output") {
      outputPath = argv[++i] ?? null;
    } else if (arg === "-p" || arg === "--paste") {
      isPaste = true;
    } else if (arg === "--dry-run") {
      dryRunHtmlPath = argv[++i];
    } else if (!arg.startsWith("-")) {
      inputPath = arg;
    }
  }

  let markdownSource = "";
  let title = "Docket Document";

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

  console.log(`[docket] Converting using theme: '${themeId}'...`);

  try {
    const result = await renderPdf({
      markdownSource,
      themeId,
      outputPath,
      title,
      dryRunHtmlPath,
    });

    console.log(`✓ [docket] PDF generated successfully!`);
    console.log(`  File:     ${result.outputPath}`);
    console.log(`  Size:     ${(result.bytes / 1024).toFixed(1)} KB`);
    console.log(`  Time:     ${(result.durationMs / 1000).toFixed(2)}s`);
  } catch (err: any) {
    console.error(`✗ [docket] Conversion failed:`, err?.message || err);
    process.exit(1);
  }
}

// Only execute main if directly invoked via CLI
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith("cli.ts")) {
  main();
}
