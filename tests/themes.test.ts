import path from "node:path";
import { describe, it, expect } from "vitest";
import {
  loadThemeCss,
  loadThemeCssAsync,
  resolveThemeCss,
  resolveThemeCssSync,
  isValidThemeId,
  THEME_IDS,
  THEMES,
} from "../src/core/themes";

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
    expect(css).toContain("margin: 18mm 16mm 20mm 16mm;");
    expect(css).toContain(".page-content");
    expect(css).toContain("thead");
    expect(css).toContain("table-header-group");
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

  it("strictly guarantees zero WebKit text-clip gradient hazards across all themes", () => {
    for (const themeId of THEME_IDS) {
      const css = loadThemeCss(themeId);
      expect(css).not.toContain("-webkit-background-clip: text");
      expect(css).not.toContain("-webkit-text-fill-color: transparent");
      expect(css).toContain(".page-break");
    }
  });

  it("resolves and appends custom CSS stylesheets cleanly", async () => {
    const fixturePath = path.join(__dirname, "fixtures/custom.css");
    const mergedCss = await resolveThemeCss("modern", fixturePath);
    expect(mergedCss).toContain("Theme Preset: modern");
    expect(mergedCss).toContain("Test Corporate Custom Theme");
    expect(mergedCss).toContain("--color-accent: #ff6600;");
    expect(mergedCss).toContain(".custom-watermark");

    const syncMerged = resolveThemeCssSync("modern", fixturePath);
    expect(syncMerged).toContain("--color-accent: #ff6600;");
  });

  it("throws FileAccessError when custom CSS path cannot be found", async () => {
    await expect(resolveThemeCss("executive", "non-existent-style.css")).rejects.toThrow();
  });
});
