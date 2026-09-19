import os from "node:os";

export interface TuiLayout {
  width: number;
  height: number;
  sidebar: boolean;
  compact: boolean;
  diagnosticsHeight: number | `${number}%`;
  editorHeight: number | `${number}%` | "auto";
}

export function getTuiLayout(width: number, height: number): TuiLayout {
  const compact = width < 100 || height < 28;
  const sidebar = width >= 88;
  return {
    width,
    height,
    sidebar,
    compact,
    diagnosticsHeight: compact ? "32%" : "38%",
    editorHeight: "100%",
  };
}

/**
 * Shortens a file path to fit within maxLength terminal columns using Bun.stringWidth.
 */
export function shortenPath(value: string, maxLength: number): string {
  const home = os.homedir();
  const normalized = home && value.startsWith(home) ? `~${value.slice(home.length)}` : value;
  const currentWidth = Bun.stringWidth(normalized);
  if (currentWidth <= maxLength) return normalized;

  const filename = normalized.split(/[\\/]/).at(-1) ?? normalized;
  const filenameWidth = Bun.stringWidth(filename);
  if (filenameWidth + 2 <= maxLength) return `…/${filename}`;

  return `…${normalized.slice(-(maxLength - 1))}`;
}
