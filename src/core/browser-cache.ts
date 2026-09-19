import { homedir } from "node:os";
import path from "node:path";
import { existsSync, mkdirSync } from "node:fs";
import { $ } from "bun";
import { DocketError } from "./errors";

export const CHROME_HEADLESS_VERSION = "131.0.6778.85";

export interface BrowserPlatformInfo {
  platformKey: string;
  zipFilename: string;
  binaryRelativePath: string;
}

/**
 * Returns platform mapping for Google Chrome for Testing headless shell.
 */
export function getBrowserPlatformInfo(): BrowserPlatformInfo | null {
  const platform = process.platform;
  const arch = process.arch;

  if (platform === "darwin") {
    if (arch === "arm64") {
      return {
        platformKey: "mac-arm64",
        zipFilename: "chrome-headless-shell-mac-arm64.zip",
        binaryRelativePath: path.join("chrome-headless-shell-mac-arm64", "chrome-headless-shell"),
      };
    }
    return {
      platformKey: "mac-x64",
      zipFilename: "chrome-headless-shell-mac-x64.zip",
      binaryRelativePath: path.join("chrome-headless-shell-mac-x64", "chrome-headless-shell"),
    };
  }

  if (platform === "linux") {
    if (arch === "x64") {
      return {
        platformKey: "linux64",
        zipFilename: "chrome-headless-shell-linux64.zip",
        binaryRelativePath: path.join("chrome-headless-shell-linux64", "chrome-headless-shell"),
      };
    }
  }

  if (platform === "win32") {
    return {
      platformKey: "win64",
      zipFilename: "chrome-headless-shell-win64.zip",
      binaryRelativePath: path.join("chrome-headless-shell-win64", "chrome-headless-shell.exe"),
    };
  }

  return null;
}

/**
 * Probes the local machine for any existing Chrome/Chromium executable.
 */
export function findSystemBrowser(): string | null {
  // 1. Explicit environment variable overrides
  const envPath = process.env.DOCKET_CHROME_PATH || process.env.PUPPETEER_EXECUTABLE_PATH;
  if (envPath && existsSync(envPath)) {
    return envPath;
  }

  // 2. PATH resolution via Bun.which
  const binariesToSearch = ["google-chrome", "chromium", "google-chrome-stable", "chrome", "brave", "msedge"];
  for (const bin of binariesToSearch) {
    const resolved = Bun.which(bin);
    if (resolved && existsSync(resolved)) {
      return resolved;
    }
  }

  // 3. Platform-specific standard installation directories
  const platform = process.platform;
  if (platform === "darwin") {
    const macCandidates = [
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      path.join(homedir(), "Applications/Google Chrome.app/Contents/MacOS/Google Chrome"),
      "/Applications/Chromium.app/Contents/MacOS/Chromium",
      path.join(homedir(), "Applications/Chromium.app/Contents/MacOS/Chromium"),
      "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser",
      "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
    ];
    for (const cand of macCandidates) {
      if (existsSync(cand)) return cand;
    }
  } else if (platform === "win32") {
    const programFiles = process.env.PROGRAMFILES || "C:\\Program Files";
    const programFilesX86 = process.env["PROGRAMFILES(X86)"] || "C:\\Program Files (x86)";
    const localAppData = process.env.LOCALAPPDATA || path.join(homedir(), "AppData", "Local");

    const winCandidates = [
      path.join(programFiles, "Google", "Chrome", "Application", "chrome.exe"),
      path.join(programFilesX86, "Google", "Chrome", "Application", "chrome.exe"),
      path.join(localAppData, "Google", "Chrome", "Application", "chrome.exe"),
      path.join(programFiles, "Microsoft", "Edge", "Application", "msedge.exe"),
      path.join(programFilesX86, "Microsoft", "Edge", "Application", "msedge.exe"),
    ];
    for (const cand of winCandidates) {
      if (existsSync(cand)) return cand;
    }
  } else if (platform === "linux") {
    const linuxCandidates = [
      "/usr/bin/google-chrome",
      "/usr/bin/google-chrome-stable",
      "/usr/bin/chromium",
      "/usr/bin/chromium-browser",
      "/snap/bin/chromium",
    ];
    for (const cand of linuxCandidates) {
      if (existsSync(cand)) return cand;
    }
  }

  return null;
}

/**
 * Returns the cached chrome-headless-shell binary path in ~/.cache/docket/chromium/.
 */
export function getCachedBrowserDirectory(): string {
  return path.join(homedir(), ".cache", "docket", "chromium", CHROME_HEADLESS_VERSION);
}

/**
 * Ensures an executable Chromium binary is available, downloading and caching
 * Google chrome-headless-shell (~40MB) automatically if no system browser exists.
 */
export async function ensureChromiumBinary(): Promise<string> {
  // 1. Check if a browser already exists on the system
  const systemBrowser = findSystemBrowser();
  if (systemBrowser) {
    return systemBrowser;
  }

  // 2. Check platform support for automatic downloading
  const platformInfo = getBrowserPlatformInfo();
  if (!platformInfo) {
    throw new DocketError(
      `Unsupported platform (${process.platform}-${process.arch}) for automatic Chromium download.`,
      "ERR_BROWSER_UNSUPPORTED",
      "Install Google Chrome or Chromium manually and set DOCKET_CHROME_PATH.",
      true,
      { stage: "render" }
    );
  }

  const cacheDir = getCachedBrowserDirectory();
  const binaryPath = path.join(cacheDir, platformInfo.binaryRelativePath);

  if (existsSync(binaryPath)) {
    return binaryPath;
  }

  // 3. Download Google's official chrome-headless-shell
  mkdirSync(cacheDir, { recursive: true });
  const downloadUrl = `https://storage.googleapis.com/chrome-for-testing-public/${CHROME_HEADLESS_VERSION}/${platformInfo.platformKey}/${platformInfo.zipFilename}`;
  const tempZip = path.join(cacheDir, `temp-${platformInfo.zipFilename}`);

  try {
    const response = await fetch(downloadUrl);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} ${response.statusText} fetching ${downloadUrl}`);
    }

    const zipBuffer = await response.arrayBuffer();
    await Bun.write(tempZip, zipBuffer);

    // Unpack archive
    if (process.platform === "win32") {
      await $`powershell -NoProfile -NonInteractive -Command "Expand-Archive -Path '${tempZip}' -DestinationPath '${cacheDir}' -Force"`.quiet();
    } else {
      await $`unzip -q -o ${tempZip} -d ${cacheDir}`.quiet();
      await $`chmod +x ${binaryPath}`.quiet();
    }

    // Clean up temporary zip
    try {
      await Bun.file(tempZip).delete();
    } catch {
      // Best-effort cleanup
    }

    if (!existsSync(binaryPath)) {
      throw new Error(`Binary was not found at expected path: ${binaryPath}`);
    }

    return binaryPath;
  } catch (error) {
    try {
      await Bun.file(tempZip).delete();
    } catch {
      // Best-effort cleanup
    }
    throw new DocketError(
      `Failed to download headless Chromium: ${error instanceof Error ? error.message : String(error)}`,
      "ERR_BROWSER_DOWNLOAD_FAILED",
      "Check your internet connection, or install Google Chrome and set DOCKET_CHROME_PATH.",
      true,
      { stage: "render", cause: error }
    );
  }
}
