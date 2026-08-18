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

export function shortenPath(value: string, maxLength: number): string {
  const home = process.env.HOME;
  const normalized = home && value.startsWith(home) ? `~${value.slice(home.length)}` : value;
  if (normalized.length <= maxLength) return normalized;
  const filename = normalized.split(/[\\/]/).at(-1) ?? normalized;
  if (filename.length + 2 <= maxLength) return `…/${filename}`;
  return `…${normalized.slice(-(maxLength - 1))}`;
}
