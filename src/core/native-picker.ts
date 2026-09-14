import { exec } from "node:child_process";
import { promisify } from "node:util";

const execAsync = promisify(exec);

async function runCommand(command: string): Promise<string | null> {
  try {
    const { stdout } = await execAsync(command);
    const selected = stdout.trim();
    return selected.length > 0 ? selected : null;
  } catch {
    return null; // User clicked Cancel, closed dialog, or binary not found
  }
}

/**
 * Opens native OS dialog to choose a folder cross-platform (macOS, Windows, Linux).
 */
export async function pickFolderNative(): Promise<string | null> {
  const platform = process.platform;

  if (platform === "darwin") {
    return runCommand(
      `osascript -e 'POSIX path of (choose folder with prompt "Select Output Folder for PDF:")'`
    );
  }

  if (platform === "win32") {
    const psScript = `Add-Type -AssemblyName System.Windows.Forms; $f = New-Object System.Windows.Forms.FolderBrowserDialog; $f.Description = 'Select Output Folder for PDF:'; if ($f.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) { [Console]::WriteLine($f.SelectedPath) }`;
    return runCommand(`powershell -NoProfile -NonInteractive -Command "${psScript}"`);
  }

  // Linux: Try zenity (GNOME/GTK), then kdialog (KDE/Qt)
  const zenityResult = await runCommand(
    `zenity --file-selection --directory --title="Select Output Folder for PDF:" 2>/dev/null`
  );
  if (zenityResult) return zenityResult;

  const kdialogResult = await runCommand(
    `kdialog --getexistingdirectory . --title "Select Output Folder for PDF:" 2>/dev/null`
  );
  if (kdialogResult) return kdialogResult;

  return null;
}

/**
 * Opens native OS dialog to choose a Markdown file cross-platform (macOS, Windows, Linux).
 */
export async function pickFileNative(): Promise<string | null> {
  const platform = process.platform;

  if (platform === "darwin") {
    return runCommand(
      `osascript -e 'POSIX path of (choose file of type {"md", "markdown", "txt"} with prompt "Select Markdown Document:")'`
    );
  }

  if (platform === "win32") {
    const psScript = `Add-Type -AssemblyName System.Windows.Forms; $f = New-Object System.Windows.Forms.OpenFileDialog; $f.Filter = 'Markdown Documents (*.md;*.markdown;*.txt)|*.md;*.markdown;*.txt|All Files (*.*)|*.*'; $f.Title = 'Select Markdown Document:'; if ($f.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) { [Console]::WriteLine($f.FileName) }`;
    return runCommand(`powershell -NoProfile -NonInteractive -Command "${psScript}"`);
  }

  // Linux: Try zenity (GNOME/GTK), then kdialog (KDE/Qt)
  const zenityResult = await runCommand(
    `zenity --file-selection --title="Select Markdown Document:" --file-filter="Markdown Files (*.md, *.markdown, *.txt) | *.md *.markdown *.txt" --file-filter="All Files | *" 2>/dev/null`
  );
  if (zenityResult) return zenityResult;

  const kdialogResult = await runCommand(
    `kdialog --getopenfilename . "*.md *.markdown *.txt" --title "Select Markdown Document:" 2>/dev/null`
  );
  if (kdialogResult) return kdialogResult;

  return null;
}
