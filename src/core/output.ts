import fs from "node:fs/promises";
import path from "node:path";
import { OutputPathError } from "./errors";
import { extractFrontmatter } from "./frontmatter";

export function resolvePdfOutputPath(directory: string, filename: string): string {
  const cleanDirectory = directory.trim() || ".";
  const cleanFilename = filename.trim();
  if (!cleanFilename) throw new OutputPathError("PDF filename cannot be empty.");
  if (cleanFilename !== path.basename(cleanFilename) || cleanFilename === "." || cleanFilename === "..") {
    throw new OutputPathError("PDF filename must contain a filename only, not a directory path.");
  }
  const normalizedFilename = cleanFilename.toLowerCase().endsWith(".pdf") ? cleanFilename : `${cleanFilename}.pdf`;
  return path.resolve(cleanDirectory, normalizedFilename);
}

/** Accepts either a PDF filename or an existing directory for CLI/API callers. */
export async function normalizePdfOutputPath(outputPath: string, defaultFilename = "docket-output.pdf"): Promise<string> {
  const cleanPath = outputPath.trim();
  if (!cleanPath) throw new OutputPathError("PDF output path cannot be empty.");
  const resolved = path.resolve(cleanPath);
  try {
    const stats = await fs.stat(resolved);
    if (stats.isDirectory()) return resolvePdfOutputPath(resolved, defaultFilename);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== "ENOENT") {
      throw new OutputPathError(`Cannot inspect output path '${outputPath}'.`, { cause: error });
    }
  }
  const directory = path.dirname(resolved);
  const filename = path.basename(resolved);
  return resolvePdfOutputPath(directory, filename);
}

function slugify(text: string): string {
  return text
    .replace(/[#*`~_\[\]()!<>|]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

/** Extracts a clean PDF filename slug from frontmatter title, or first Markdown heading or subheading. */
export function derivePdfFilename(source: string, defaultName = "docket-output.pdf"): string {
  if (!source) return defaultName;

  const { title, body } = extractFrontmatter(source);
  if (title && title.trim().length > 0) {
    const slug = slugify(title);
    if (slug.length > 0) return `${slug}.pdf`;
  }

  const h1Match = body.match(/^#\s+(.+)$/m);
  const target = h1Match?.[1] ?? body.match(/^##\s+(.+)$/m)?.[1];
  if (!target) return defaultName;

  const slug = slugify(target);
  return slug.length > 0 ? `${slug}.pdf` : defaultName;
}
