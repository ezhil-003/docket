import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export type UserDirectoryKind = "downloads" | "documents" | "desktop" | "home";

/**
 * Expands a leading tilde (`~`, `~/`, or `~\`) into the user's authentic home directory.
 * If the path does not start with a tilde, it is returned untouched.
 */
export function expandHomeDir(filepath: string): string {
  const trimmed = filepath.trim();
  if (trimmed === "~") {
    return os.homedir();
  }
  if (trimmed.startsWith("~/") || trimmed.startsWith("~\\")) {
    return path.join(os.homedir(), trimmed.slice(2));
  }
  return trimmed;
}

/**
 * Parses Linux XDG user directories configuration file (~/.config/user-dirs.dirs).
 */
function getLinuxXdgUserDir(kind: "DOWNLOAD" | "DOCUMENTS" | "DESKTOP"): string | null {
  const home = os.homedir();
  const configHome = process.env.XDG_CONFIG_HOME || path.join(home, ".config");
  const userDirsPath = path.join(configHome, "user-dirs.dirs");

  try {
    if (!fs.existsSync(userDirsPath)) return null;
    const content = fs.readFileSync(userDirsPath, "utf8");
    const key = `XDG_${kind}_DIR`;
    const match = content.match(new RegExp(`^\\s*${key}="?([^"\\r\\n]+)"?`, "m"));
    if (match && match[1]) {
      const rawPath = match[1];
      // Replace $HOME or ${HOME}
      const expanded = rawPath.replace(/\$HOME|\$\{HOME\}/g, home);
      return expanded;
    }
  } catch {
    // Graceful fallback to default convention
  }
  return null;
}

/**
 * Resolves standard user directories (Downloads, Documents, Desktop, Home)
 * cross-platform for macOS, Linux, and Windows.
 */
export function getStandardUserDir(kind: UserDirectoryKind): string {
  const home = os.homedir();
  if (kind === "home") return home;

  const platform = process.platform;

  if (platform === "darwin") {
    switch (kind) {
      case "downloads": return path.join(home, "Downloads");
      case "documents": return path.join(home, "Documents");
      case "desktop": return path.join(home, "Desktop");
    }
  }

  if (platform === "win32") {
    const userProfile = process.env.USERPROFILE || home;
    switch (kind) {
      case "downloads": return path.join(userProfile, "Downloads");
      case "documents": return path.join(userProfile, "Documents");
      case "desktop": return path.join(userProfile, "Desktop");
    }
  }

  // Linux / Unix
  const xdgKindMap: Record<"downloads" | "documents" | "desktop", "DOWNLOAD" | "DOCUMENTS" | "DESKTOP"> = {
    downloads: "DOWNLOAD",
    documents: "DOCUMENTS",
    desktop: "DESKTOP",
  };
  const xdgPath = getLinuxXdgUserDir(xdgKindMap[kind]);
  if (xdgPath) return xdgPath;

  switch (kind) {
    case "downloads": return path.join(home, "Downloads");
    case "documents": return path.join(home, "Documents");
    case "desktop": return path.join(home, "Desktop");
  }
}
