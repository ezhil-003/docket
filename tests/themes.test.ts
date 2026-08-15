import { describe, it, expect } from "vitest";
import { loadThemeCss, loadThemeCssAsync, isValidThemeId, THEME_IDS, THEMES } from "../src/core/themes";

describe("Theme Registry & CSS Loader (themes.ts)", () => {
  it("should validate all 6 official theme IDs including modern", () => {
    expect(THEME_IDS.length).toBe(6);
    for (const themeId of THEME_IDS) {
      expect(isValidThemeId(themeId)).toBe(true);
      expect(THEMES[themeId]).toBeDefined();
      expect(THEMES[themeId].name).toBeTypeOf("string");
      expect(THEMES[themeId].description).toBeTypeOf("string");
    }
  });

  it("should reject invalid theme IDs", () => {
    expect(isValidThemeId("invalid-theme")).toBe(false);
    expect(isValidThemeId("")).toBe(false);
  });

  it("should fallback to 'executive' theme if an invalid theme ID is requested in loadThemeCss", () => {
    const css = loadThemeCss("non-existent-theme" as any);
    expect(css).toContain("Theme Preset: executive");
  });

  it("should strictly enforce the Margin Safety Contract in CSS output", () => {
    const css = loadThemeCss("modern");
    expect(css).toContain("@page");
    expect(css).toContain("margin: 0;");
    expect(css).toContain(".page-content");
    expect(css).toContain("padding: 18mm 16mm 20mm 16mm;");
  });

  it("should concatenate base CSS rules with specific theme token overrides", () => {
    const modernCss = loadThemeCss("modern");
    expect(modernCss).toContain("Modern Indigo Theme Preset");
    expect(modernCss).toContain("--color-accent: #4f46e5;");
    expect(modernCss).toContain("linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)");
  });

  it("loads theme CSS asynchronously for the render pipeline", async () => {
    const css = await loadThemeCssAsync("technical");
    expect(css).toContain("Theme Preset: technical");
    expect(css).toContain("@page");
  });
});
