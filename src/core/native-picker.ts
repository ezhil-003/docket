import { $ } from "bun";

/**
 * Opens native OS dialog to choose a folder cross-platform (macOS, Windows, Linux)
 * using Bun Shell with zero external subshell dependencies.
 */
export async function pickFolderNative(): Promise<string | null> {
  const platform = process.platform;

  if (platform === "darwin") {
    const out = await $`osascript -e 'POSIX path of (choose folder with prompt "Select Output Folder for PDF:")'`.nothrow().quiet().text();
    const selected = out.trim();
    return selected.length > 0 ? selected : null;
  }

  if (platform === "win32") {
    const psScript = `Add-Type -AssemblyName System.Windows.Forms; $f = New-Object System.Windows.Forms.FolderBrowserDialog; $f.Description = 'Select Output Folder for PDF:'; if ($f.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) { [Console]::WriteLine($f.SelectedPath) }`;
    const out = await $`powershell -NoProfile -NonInteractive -Command ${psScript}`.nothrow().quiet().text();
    const selected = out.trim();
    return selected.length > 0 ? selected : null;
  }

  // Linux: Try zenity (GNOME/GTK), then kdialog (KDE/Qt)
  const zenityResult = await $`zenity --file-selection --directory --title="Select Output Folder for PDF:"`.nothrow().quiet().text();
  if (zenityResult.trim().length > 0) {
    return zenityResult.trim();
  }

  const kdialogResult = await $`kdialog --getexistingdirectory . --title "Select Output Folder for PDF:"`.nothrow().quiet().text();
  if (kdialogResult.trim().length > 0) {
    return kdialogResult.trim();
  }

  return null;
}

/**
 * Opens native OS dialog to choose a Markdown file cross-platform (macOS, Windows, Linux)
 * using Bun Shell with zero external subshell dependencies.
 */
export async function pickFileNative(): Promise<string | null> {
  const platform = process.platform;

  if (platform === "darwin") {
    const out = await $`osascript -e 'POSIX path of (choose file of type {"md", "markdown", "txt"} with prompt "Select Markdown Document:")'`.nothrow().quiet().text();
    const selected = out.trim();
    return selected.length > 0 ? selected : null;
  }

  if (platform === "win32") {
    const psScript = `Add-Type -AssemblyName System.Windows.Forms; $f = New-Object System.Windows.Forms.OpenFileDialog; $f.Filter = 'Markdown Documents (*.md;*.markdown;*.txt)|*.md;*.markdown;*.txt|All Files (*.*)|*.*'; $f.Title = 'Select Markdown Document:'; if ($f.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) { [Console]::WriteLine($f.FileName) }`;
    const out = await $`powershell -NoProfile -NonInteractive -Command ${psScript}`.nothrow().quiet().text();
    const selected = out.trim();
    return selected.length > 0 ? selected : null;
  }

  // Linux: Try zenity (GNOME/GTK), then kdialog (KDE/Qt)
  const zenityResult = await $`zenity --file-selection --title="Select Markdown Document:" --file-filter="Markdown Files (*.md, *.markdown, *.txt) | *.md *.markdown *.txt" --file-filter="All Files | *"`.nothrow().quiet().text();
  if (zenityResult.trim().length > 0) {
    return zenityResult.trim();
  }

  const kdialogResult = await $`kdialog --getopenfilename . "*.md *.markdown *.txt" --title "Select Markdown Document:"`.nothrow().quiet().text();
  if (kdialogResult.trim().length > 0) {
    return kdialogResult.trim();
  }

  return null;
}
