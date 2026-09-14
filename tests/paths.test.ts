import { describe, expect, it } from "vitest";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import { expandHomeDir, getStandardUserDir } from "../src/core/paths";
import { shortenPath } from "../src/tui/layout";

describe("paths module", () => {
  describe("expandHomeDir", () => {
    it("expands single tilde to os.homedir()", () => {
      expect(expandHomeDir("~")).toBe(os.homedir());
      expect(expandHomeDir("  ~  ")).toBe(os.homedir());
    });

    it("expands ~/ relative paths to user home directory", () => {
      const expectedDownloads = path.join(os.homedir(), "Downloads");
      expect(expandHomeDir("~/Downloads")).toBe(expectedDownloads);
      expect(expandHomeDir("  ~/Downloads  ")).toBe(expectedDownloads);
      expect(expandHomeDir("~/Documents/Reports/2026.pdf")).toBe(
        path.join(os.homedir(), "Documents", "Reports", "2026.pdf")
      );
    });

    it("leaves relative and absolute paths untouched", () => {
      expect(expandHomeDir("./dist")).toBe("./dist");
      expect(expandHomeDir(".")).toBe(".");
      expect(expandHomeDir("../parent")).toBe("../parent");
      expect(expandHomeDir("/var/log/docket.log")).toBe("/var/log/docket.log");
      expect(expandHomeDir("output.pdf")).toBe("output.pdf");
    });
  });

  describe("getStandardUserDir", () => {
    it("returns authentic home directory for 'home'", () => {
      expect(getStandardUserDir("home")).toBe(os.homedir());
    });

    it("returns authentic Downloads directory for current OS", () => {
      const downloadsDir = getStandardUserDir("downloads");
      expect(path.isAbsolute(downloadsDir)).toBe(true);
      expect(downloadsDir.toLowerCase()).toContain("downloads");
    });

    it("returns authentic Documents directory for current OS", () => {
      const docsDir = getStandardUserDir("documents");
      expect(path.isAbsolute(docsDir)).toBe(true);
      expect(docsDir.toLowerCase()).toContain("documents");
    });

    it("returns authentic Desktop directory for current OS", () => {
      const desktopDir = getStandardUserDir("desktop");
      expect(path.isAbsolute(desktopDir)).toBe(true);
      expect(desktopDir.toLowerCase()).toContain("desktop");
    });
  });

  describe("shortenPath layout helper", () => {
    it("shortens home directory prefix to tilde (~)", () => {
      const homeSubpath = path.join(os.homedir(), "Downloads", "quarterly.pdf");
      const shortened = shortenPath(homeSubpath, 80);
      expect(shortened.startsWith("~")).toBe(true);
      expect(shortened).toBe(`~/Downloads/quarterly.pdf`.replace(/\//g, path.sep));
    });

    it("abbreviates overly long paths with ellipsis", () => {
      const longPath = "/very/deeply/nested/directory/structure/that/exceeds/length/document.pdf";
      const shortened = shortenPath(longPath, 20);
      expect(shortened.length).toBeLessThanOrEqual(20);
      expect(shortened.startsWith("…")).toBe(true);
    });
  });
});
