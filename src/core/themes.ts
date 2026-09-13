import fs from "node:fs";
import fsp from "node:fs/promises";
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

const cssCache = new Map<ThemeId, string>();
const asyncCssLoads = new Map<ThemeId, Promise<string>>();

import { EMBEDDED_BASE_CSS, EMBEDDED_THEME_CSS } from "../themes/embedded";

export function isValidThemeId(theme: string): theme is ThemeId {
  return THEME_IDS.includes(theme as ThemeId);
}

export function loadThemeCss(themeId: ThemeId = "executive"): string {
  const currentThemeId = isValidThemeId(themeId) ? themeId : "executive";

  const cached = cssCache.get(currentThemeId);
  if (cached) return cached;

  const themesDir = path.resolve(import.meta.dirname ?? __dirname, "../themes");
  const basePath = path.join(themesDir, "_base.css");
  const themePath = path.join(themesDir, `${currentThemeId}.css`);

  let baseCss = "";
  let themeCss = "";

  if (fs.existsSync(basePath) && fs.existsSync(themePath)) {
    try {
      baseCss = fs.readFileSync(basePath, "utf-8");
      themeCss = fs.readFileSync(themePath, "utf-8");
    } catch {
      baseCss = EMBEDDED_BASE_CSS;
      themeCss = EMBEDDED_THEME_CSS[currentThemeId] ?? EMBEDDED_THEME_CSS.executive;
    }
  } else {
    baseCss = EMBEDDED_BASE_CSS;
    themeCss = EMBEDDED_THEME_CSS[currentThemeId] ?? EMBEDDED_THEME_CSS.executive;
  }

  const css = `${baseCss}\n\n/* Theme Preset: ${currentThemeId} */\n${themeCss}`;
  cssCache.set(currentThemeId, css);
  return css;
}

/**
 * Async counterpart used by the PDF render pipeline so a cold theme load does
 * not block the event loop. The synchronous API above remains available for
 * callers that already depend on assembleHtml being synchronous.
 */
export async function loadThemeCssAsync(themeId: ThemeId = "executive"): Promise<string> {
  const currentThemeId = isValidThemeId(themeId) ? themeId : "executive";
  const cached = cssCache.get(currentThemeId);
  if (cached) return cached;

  const pending = asyncCssLoads.get(currentThemeId);
  if (pending) return pending;

  const themesDir = path.resolve(import.meta.dirname ?? __dirname, "../themes");
  const basePath = path.join(themesDir, "_base.css");
  const themePath = path.join(themesDir, `${currentThemeId}.css`);
  const load = (async () => {
    let baseCss = "";
    let themeCss = "";

    try {
      baseCss = await fsp.readFile(basePath, "utf-8");
      themeCss = await fsp.readFile(themePath, "utf-8");
    } catch {
      baseCss = EMBEDDED_BASE_CSS;
      themeCss = EMBEDDED_THEME_CSS[currentThemeId] ?? EMBEDDED_THEME_CSS.executive;
    }

    const css = `${baseCss}\n\n/* Theme Preset: ${currentThemeId} */\n${themeCss}`;
    cssCache.set(currentThemeId, css);
    return css;
  })();

  asyncCssLoads.set(currentThemeId, load);
  try {
    return await load;
  } finally {
    asyncCssLoads.delete(currentThemeId);
  }
}

export function clearThemeCssCache(): void {
  cssCache.clear();
  asyncCssLoads.clear();
}
