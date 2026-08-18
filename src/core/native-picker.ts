import { exec } from "node:child_process";
import { promisify } from "node:util";

const execAsync = promisify(exec);

/** Opens native macOS Finder dialog to choose a folder. */
export async function pickFolderNative(): Promise<string | null> {
  if (process.platform !== "darwin") return null;
  try {
    const { stdout } = await execAsync(
      `osascript -e 'POSIX path of (choose folder with prompt "Select Output Folder for PDF:")'`
    );
    const selected = stdout.trim();
    return selected.length > 0 ? selected : null;
  } catch {
    return null; // User clicked Cancel or closed dialog
  }
}

/** Opens native macOS Finder dialog to choose a Markdown file. */
export async function pickFileNative(): Promise<string | null> {
  if (process.platform !== "darwin") return null;
  try {
    const { stdout } = await execAsync(
      `osascript -e 'POSIX path of (choose file of type {"md", "markdown", "txt"} with prompt "Select Markdown Document:")'`
    );
    const selected = stdout.trim();
    return selected.length > 0 ? selected : null;
  } catch {
    return null; // User clicked Cancel or closed dialog
  }
}
