import type { ThemeId } from "../core/themes";
import { SyntaxStyle } from "@opentui/core";

export interface TuiColorPalette {
  id: ThemeId;
  name: string;
  background: string;
  panel: string;
  panelElevated: string;
  border: string;
  focus: string;
  text: string;
  muted: string;
  dim: string;
  accent: string;
  success: string;
  warning: string;
  error: string;
  syntax: {
    heading: string;
    string: string;
    code: string;
    keyword: string;
    comment: string;
    list: string;
    quote: string;
    link: string;
  };
}

export const THEME_PALETTES: Record<ThemeId, TuiColorPalette> = {
  // 1. VS Code Dark+
  executive: {
    id: "executive",
    name: "VS Code Dark+",
    background: "#1e1e1e",
    panel: "#252526",
    panelElevated: "#181818",
    border: "#3c3c3c",
    focus: "#007acc",
    text: "#d4d4d4",
    muted: "#969696",
    dim: "#6e6e6e",
    accent: "#569cd6",
    success: "#4ec9b0",
    warning: "#dcdcaa",
    error: "#f44747",
    syntax: {
      heading: "#4ec9b0",
      string: "#ce9178",
      code: "#9cdcfe",
      keyword: "#569cd6",
      comment: "#6a9955",
      list: "#dcdcaa",
      quote: "#c586c0",
      link: "#569cd6",
    },
  },
  // 2. Catppuccin Mocha
  modern: {
    id: "modern",
    name: "Catppuccin Mocha",
    background: "#1e1e2e",
    panel: "#181825",
    panelElevated: "#11111b",
    border: "#313244",
    focus: "#cba6f7",
    text: "#cdd6f4",
    muted: "#a6adc8",
    dim: "#6c7086",
    accent: "#cba6f7",
    success: "#a6e3a1",
    warning: "#f9e2af",
    error: "#f38ba8",
    syntax: {
      heading: "#89dceb",
      string: "#a6e3a1",
      code: "#89b4fa",
      keyword: "#cba6f7",
      comment: "#6c7086",
      list: "#f9e2af",
      quote: "#f5c2e7",
      link: "#89b4fa",
    },
  },
  // 3. Atom / One Dark
  technical: {
    id: "technical",
    name: "One Dark",
    background: "#282c34",
    panel: "#21252b",
    panelElevated: "#1b1d23",
    border: "#3b4048",
    focus: "#61afef",
    text: "#abb2bf",
    muted: "#828997",
    dim: "#5c6370",
    accent: "#61afef",
    success: "#98c379",
    warning: "#e5c07b",
    error: "#e06c75",
    syntax: {
      heading: "#61afef",
      string: "#98c379",
      code: "#56b6c2",
      keyword: "#c678dd",
      comment: "#5c6370",
      list: "#e5c07b",
      quote: "#e06c75",
      link: "#61afef",
    },
  },
  // 4. GitHub Dark
  legal: {
    id: "legal",
    name: "GitHub Dark",
    background: "#0d1117",
    panel: "#161b22",
    panelElevated: "#090d13",
    border: "#30363d",
    focus: "#58a6ff",
    text: "#c9d1d9",
    muted: "#8b949e",
    dim: "#6e7681",
    accent: "#58a6ff",
    success: "#7ee787",
    warning: "#ffa657",
    error: "#ff7b72",
    syntax: {
      heading: "#79c0ff",
      string: "#a5d6ff",
      code: "#7ee787",
      keyword: "#ff7b72",
      comment: "#8b949e",
      list: "#ffa657",
      quote: "#d2a8ff",
      link: "#58a6ff",
    },
  },
  // 5. Dracula
  boardroom: {
    id: "boardroom",
    name: "Dracula",
    background: "#282a36",
    panel: "#21222c",
    panelElevated: "#191a21",
    border: "#44475a",
    focus: "#bd93f9",
    text: "#f8f8f2",
    muted: "#9fa8c7",
    dim: "#6272a4",
    accent: "#bd93f9",
    success: "#50fa7b",
    warning: "#f1fa8c",
    error: "#ff5555",
    syntax: {
      heading: "#8be9fd",
      string: "#f1fa8c",
      code: "#50fa7b",
      keyword: "#ff79c6",
      comment: "#6272a4",
      list: "#ffb86c",
      quote: "#bd93f9",
      link: "#8be9fd",
    },
  },
  // 6. Tokyo Night
  minimal: {
    id: "minimal",
    name: "Tokyo Night",
    background: "#1a1b26",
    panel: "#16161e",
    panelElevated: "#13141c",
    border: "#292e42",
    focus: "#7aa2f7",
    text: "#c0caf5",
    muted: "#7982a9",
    dim: "#565f89",
    accent: "#7aa2f7",
    success: "#9ece6a",
    warning: "#e0af68",
    error: "#f7768e",
    syntax: {
      heading: "#7aa2f7",
      string: "#9ece6a",
      code: "#7dcfff",
      keyword: "#bb9af7",
      comment: "#565f89",
      list: "#e0af68",
      quote: "#f7768e",
      link: "#7aa2f7",
    },
  },
};

export const TUI_THEME = THEME_PALETTES.executive;

export function getTuiTheme(themeId: ThemeId): TuiColorPalette {
  return THEME_PALETTES[themeId] ?? THEME_PALETTES.executive;
}

export function createSyntaxStyle(palette: TuiColorPalette): SyntaxStyle {
  return SyntaxStyle.fromStyles({
    heading: { fg: palette.syntax.heading, bold: true },
    string: { fg: palette.syntax.string },
    code: { fg: palette.syntax.code },
    keyword: { fg: palette.syntax.keyword, bold: true },
    comment: { fg: palette.syntax.comment, italic: true },
    list: { fg: palette.syntax.list },
    quote: { fg: palette.syntax.quote, italic: true },
    link: { fg: palette.syntax.link, underline: true },
  });
}
