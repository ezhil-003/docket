import fs from "node:fs";
import path from "node:path";

export const THEME_IDS = [
  "executive",
  "technical",
  "legal",
  "boardroom",
  "minimal",
  "modern",
] as const;

export type ThemeId = (typeof THEME_IDS)[number];

export interface ThemeMeta {
  id: ThemeId;
  name: string;
  description: string;
  accentHex: string;
}

export const THEMES: Record<ThemeId, ThemeMeta> = {
  executive: {
    id: "executive",
    name: "Executive Boardroom",
    description: "Deep navy primary with royal blue accents & Jakarta/Inter typography.",
    accentHex: "#2563eb",
  },
  technical: {
    id: "technical",
    name: "Technical Slate",
    description: "Cyan accents, compact layout, crisp code block highlights.",
    accentHex: "#0891b2",
  },
  legal: {
    id: "legal",
    name: "Formal Legal",
    description: "Classic serif body (Source Serif 4), deep navy headers, formal spacing.",
    accentHex: "#312e81",
  },
  boardroom: {
    id: "boardroom",
    name: "Warm Boardroom",
    description: "Warm charcoal with amber/bronze highlights & rich typography.",
    accentHex: "#d97706",
  },
  minimal: {
    id: "minimal",
    name: "Clean Minimal",
    description: "Monochrome high-legibility layout with subtle borders.",
    accentHex: "#171717",
  },
  modern: {
    id: "modern",
    name: "Modern Indigo",
    description: "Indigo gradient headings, accent pills & sleek rounded tables.",
    accentHex: "#4f46e5",
  },
};

export function isValidThemeId(theme: string): theme is ThemeId {
  return THEME_IDS.includes(theme as ThemeId);
}

export function loadThemeCss(themeId: ThemeId = "executive"): string {
  const currentThemeId = isValidThemeId(themeId) ? themeId : "executive";

  const themesDir = path.resolve(import.meta.dirname ?? __dirname, "../themes");

  const basePath = path.join(themesDir, "_base.css");
  const themePath = path.join(themesDir, `${currentThemeId}.css`);

  let baseCss = "";
  let themeCss = "";

  try {
    baseCss = fs.readFileSync(basePath, "utf-8");
  } catch (err) {
    throw new Error(`Failed to load base theme CSS from ${basePath}: ${err}`);
  }

  try {
    themeCss = fs.readFileSync(themePath, "utf-8");
  } catch (err) {
    throw new Error(`Failed to load theme CSS for '${currentThemeId}' from ${themePath}: ${err}`);
  }

  return `${baseCss}\n\n/* Theme Preset: ${currentThemeId} */\n${themeCss}`;
}
