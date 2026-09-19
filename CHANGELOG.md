# Changelog

All notable changes to Docket are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and releases follow [Semantic Versioning](https://semver.org/).

## [Unreleased]

No changes yet.

## [1.5.0] — 2026-09-19

### Added

- **Native Chrome DevTools Protocol (CDP) Driver (`src/core/cdp.ts`)**: Built a zero-dependency headless Chromium driver directly using `Bun.spawn` and native Web Standard `WebSocket`. Connects directly to Chromium's DevTools protocol, managing pages, executing evaluate scripts, awaiting `document.fonts.ready`, and rendering pixel-perfect PDFs via `Page.printToPDF`.
- **Automated Chromium Cache Manager (`src/core/browser-cache.ts`)**: Automatically searches for existing Chrome/Chromium binaries via `Bun.which` and standard system paths. On headless servers or CI runners lacking a browser, Docket downloads Google's official, stripped-down `chrome-headless-shell` (~40MB compressed vs ~130MB full browser) and permanently caches it in `~/.cache/docket/chromium/`.
- **Native Rust/Zig Markdown Engine (`Bun.markdown`)**: Replaced `markdown-it` with native `Bun.markdown.html()`, delivering a **20.1x speedup** on Markdown compilation (0.26ms/doc vs 5.23ms/doc on 1,000-line benchmarks). Includes automatic heading IDs (`headings: { ids: true }`) for table-of-contents navigation, full GFM tables, strikethroughs, tasklists, and autolinks.
- **Instant Terminal Markdown Preview (`docket --preview`)**: Added `--preview` CLI flag powered by `Bun.markdown.ansi()` to render formatted ANSI Markdown directly in the terminal without starting Chromium.
- **Automatic PDF Viewer Opening (`-O, --open`)**: Added `-O, --open` CLI flag using native Bun Shell (`open` on macOS, `xdg-open` on Linux, `start` on Windows) to automatically open the generated PDF in the user's default system viewer upon completion.
- **External Editor Jump (`Ctrl+E`) in TUI**: Added `Ctrl+E` and a dedicated footer button in the OpenTUI workspace to open the active file directly in `$EDITOR` or VS Code (`Bun.openInEditor()`) jumped directly to the selected diagnostic error line.
- **SIMD-Accelerated Column Calculations**: Replaced JavaScript string length with `Bun.stringWidth()` in `src/tui/layout.ts`, guaranteeing perfect box and sidebar boundaries with CJK characters, emojis, and ANSI formatting.
- **ANSI-Aware Word Wrapping**: Integrated `Bun.wrapAnsi()` in `src/tui/app.ts` for clean message and diagnostic formatting at sidebar boundaries.
- **Native Zero-Copy HTML Escaping**: Replaced regex-based string replacements across `assemble.ts` and `parse.ts` with `Bun.escapeHTML()`.
- **Microtask-Free Cache Reading (`Bun.peek()`)**: Integrated `Bun.peek()` for zero-microtick synchronous access to prewarmed Shiki highlighter and theme CSS singletons.
- **Zero-Dependency Native Testing (`bun:test`)**: Migrated all 83 unit and integration tests from Vitest to native `bun:test`, cutting test suite runtime from ~1.4s to **~300ms** with zero npm test dependencies.

### Changed

- **Eliminated Puppeteer**: Removed Puppeteer and its ~150 transient npm dependencies entirely from `package.json`, radically slimming the dependency tree and binary compile size.
- **Eliminated markdown-it & Vitest**: Removed `markdown-it`, `@types/markdown-it`, and `vitest` from project dependencies.
- **Native Bun Shell Native Dialogs**: Rewrote `src/core/native-picker.ts` using Bun Shell (`$`) instead of `node:child_process`, eliminating child process spawning overhead and auto-escaping arguments against command injection.
- **File I/O Modernization**: Migrated filesystem operations in `src/core/fs.ts` and `src/core/themes.ts` to `Bun.file()` (zero-copy memory-mapped reads) and `Bun.write()` (kernel-level `clonefile` on APFS and `copy_file_range` on Linux).
- **Target Version**: Upgraded Bun runtime target to `>=1.4.2` across `package.json`, `.bun-version`, and `.github/workflows/release.yml`.

## [1.4.2] — 2026-09-14

### Fixed

- **Authentic OS User Directory Resolution & Tilde Expansion**: Fixed bug where clicking the TUI preset `~/Downloads` or specifying `~` in output paths created a literal folder named `~` in the working directory (`./~/Downloads`). Introduced `src/core/paths.ts` providing runtime discovery of standard OS user directories (macOS `os.homedir() / Downloads`, Windows `%USERPROFILE%\\Downloads`, and Linux Freedesktop XDG user-dirs `~/.config/user-dirs.dirs`).
- **Universal Tilde (`~`) Path Expansion**: Integrated `expandHomeDir` across all filesystem entry points (`NodeFileSystem`, `resolvePdfOutputPath`, `normalizePdfOutputPath`, CLI inputs, CSS watchers, and custom stylesheets), ensuring paths like `~/Documents` resolve to authentic user home directories across macOS, Linux, and Windows.
- **Accidental `./~` Directory Cleanup**: Removed accidental `./~` directory previously generated in the repository root.

### Added

- **Cross-Platform Native Dialogs**: Extended native file and folder pickers (`src/core/native-picker.ts`) beyond macOS `osascript` to Windows (PowerShell `FolderBrowserDialog` and `OpenFileDialog` via Windows Forms) and Linux (`zenity` GTK dialogs with fallback to `kdialog` Qt dialogs). Headless and unsupported environments fall back gracefully to inline text input.
- **Cross-Platform Home Abbreviation**: Updated TUI layout path compressor (`shortenPath`) to use `os.homedir()` so Windows and Linux users also benefit from clean `~` path abbreviation.

## [1.4.1] — 2026-09-14

### Added

- **Native YAML Frontmatter Engine (`src/core/frontmatter.ts`)**: Automatic parsing of document YAML frontmatter (`title`, `author`, `theme`, `date`, `css`). Frontmatter headers are cleanly extracted and stripped from the document body, preventing `markdown-it` from rendering metadata as unintended `<hr>` rules and Setext `<h2>` headings. Extracted titles automatically populate PDF document metadata and file slugs.
- **GitHub-Flavored Executive Callout Boxes**: Support for standard callout alert syntax (`> [!NOTE]`, `> [!TIP]`, `> [!IMPORTANT]`, `> [!WARNING]`, `> [!CAUTION]`) rendered with distinct executive accent colors, typography badges, and icons (`ℹ️`, `💡`, `❗`, `⚠️`, `🛑`). Fully compliant with the CSS Paged Media pagination contract (`break-inside: avoid; page-break-inside: avoid;`).
- **Custom CSS & Brand Token Injection (`--css <file.css>`)**: Ability to inject custom corporate brand stylesheets or override CSS variables via CLI flag or frontmatter `css:` declarations.
- **Document Title Override (`--title <name>`)**: New CLI flag to explicitly set the document title in PDF metadata without altering headings.
- **Live Re-compilation Watch Mode (`-w, --watch`)**: Watch mode for authoring workflows that monitors the input Markdown file and any active custom CSS stylesheet, automatically re-rendering upon saved changes with debouncing.
- **Version Flag (`-v, --version`)**: Standard version CLI option printing `Docket v1.4.1`.

### Changed

- **Core Contracts & Architectural Hardening**: Removed dead phantom interfaces (`SourceProvider`, `GeneratePdfRequest`, `DocketCommand`) from `src/core/contracts.ts`. Relocated UI presentation state (`DocketState`) to `src/tui/state.ts`, decoupling headless PDF generation from the OpenTUI terminal interface.
- **Error Cause & Stage Preservation**: Updated all custom error subclasses (`MarkdownLintError`, `ThemeNotFoundError`, `PuppeteerRenderError`, `FileAccessError`, `OutputPathError`, `CliUsageError`) to preserve original caught error `cause` and assign execution `stage` for clear diagnostics.
- **Lazy Highlighting & TUI Loading**: Removed eager background initialization of Shiki grammars on module import in `src/core/parse.ts` and made OpenTUI dynamically loaded on demand in `src/cli.ts`, accelerating CLI cold starts.
- **Sample Document Modernization**: Updated `sample.md` to demonstrate YAML frontmatter, GitHub-style callouts, and modern syntax.
- Bumped version to `1.4.1` across `package.json`, binary builds, documentation, and TUI status headers.

## [1.4.0] — 2026-09-14

### Added

- **Multi-Syntax Manual Page Break Engine**: Native support for manual page break markers on standalone lines outside code blocks, translating into CSS Paged Media `break-before: page; page-break-before: always;`. Supports LaTeX/Pandoc (`\newpage`, `\pagebreak`), HTML comments (`<!-- pagebreak -->`, `<!-- page-break -->`, `<!-- newpage -->`, `<!-- new-page -->`), shortcodes (`[pagebreak]`, `[newpage]`, `{pagebreak}`, `{newpage}`), and user typo variants (`/newpage`, `/pagebreak`). Fenced code blocks (` ``` ` and `~~~`) are strictly protected from transformation.
- **Decoupled PDF and TUI Theme State**: Dedicated independent selectors for the PDF output theme (`pdfTheme`) and the terminal interface theme (`tuiTheme`), allowing users to style the generated document and the terminal independently.
- **Direct Save Command (`Ctrl+S`)**: Quick-save the current editor buffer directly to the active file path or output directory with instant status notifications.
- **Universal Shiki Syntax Highlighting & Badges**: Every code block—including unannotated fences (defaulting to clean `text`) and 14+ newly supported languages (`c`, `cpp`, `csharp`, `java`, `ruby`, `php`, `dockerfile`, `diff`, `xml`, `toml`, `graphql`, `swift`, `kotlin`)—is highlighted using the document's selected theme with language corner badges (`data-lang`).
- **Suppressed Empty Code Blocks**: Blank or unclosed code fences no longer render as dangling, empty pre boxes in the generated PDF.

### Fixed

- **WebKit / Apple Quartz Heading Render Bug**: Eliminated `-webkit-background-clip: text; -webkit-text-fill-color: transparent;` on `h1` in `modern.css` in favor of high-contrast solid vector typography (`color: var(--color-accent);`) and soft accent borders. Resolves the notorious macOS Preview / Apple PDFKit bug that rendered solid purple rectangles over headings.
- **Web Font Loading Timing**: Enhanced Puppeteer page lifecycle in `src/core/render.ts` to wait for network idle (`page.waitForNetworkIdle`) before font readiness (`document.fonts.ready`), guaranteeing Google WebFonts (`Plus Jakarta Sans`, `Inter`, `JetBrains Mono`, `Source Serif 4`) download and render reliably without falling back to system fonts.
- **Live Editor Buffer Authority**: Ensured that edits typed or modified in the TUI editor take immediate precedence during PDF generation and lint diagnostics without requiring file reload from disk.
- **Gutter Diagnostic Alignment**: Fixed 0-indexed gutter diagnostic marker displacement (`Math.max(0, err.line - 1)`), correctly aligning error and warning markers with their corresponding editor lines.
- **Linter HTML-in-Code False Positives**: Resolved false positive `MD005/unclosed-html-tag` warnings triggered by HTML-like tags inside inline code snippets and HTML comments.
- **Tilde Fenced Blocks**: Added full support for tilde fences (`~~~`) in the markdown linter, preventing false syntax errors inside code blocks.

### Changed

- Bumped version to `1.4.0` across `package.json`, binary builds, documentation, and TUI status headers.
- Re-synchronized embedded CSS fallbacks in `src/themes/embedded.ts` for standalone compiled binaries.


### Added

- **Full-Screen Executive Editor Canvas**: Expanded interactive Markdown editor occupying full vertical height and 74% width with zero clipping.
- **Real-Time Line Number Gutter & Diagnostics Signs**: Gutter line numbering with live error (`✖` in red) and warning (`▲` in yellow) markers mapped directly from markdownlint.
- **VS Code-Grade Live Syntax Highlighting**: Real-time token highlighting in both the startup editor and the workspace editor for headings, code fences, blockquotes, lists, inline code, and links.
- **Famous Developer Color Themes**: Multi-theme palette switching across VS Code Dark+, Catppuccin Mocha, One Dark, GitHub Dark, Dracula, and Tokyo Night, with matching editor background colors and token styles.
- **Shiki PDF Code Highlighting**: Integrated Shiki v4 `dark-plus` syntax highlighting into `markdown-it` parsing for publication-ready code blocks in generated PDFs.
- **Native macOS Finder File & Folder Pickers**: Seamless AppleScript-powered native dialogs for visual folder and `.md` file selection.
- **Scrollable Control Sidebar**: Integrated `ScrollBoxRenderable` for mouse wheel, keyboard, and scrollbar navigation on secondary cards.
- **Automatic Document Heading Slugs**: Auto-derives PDF output filenames from `# Heading` and `## Subheading` with manual override support.
- **Interactive Clickable Buttons**: Centered button labels with keyboard shortcuts integrated directly on action buttons across the startup screen and footer bar.

### Changed

- Updated version across `package.json`, binary builds, and TUI startup badges to `1.3.0`.
- Eliminated contrasting inner box border artifacts for a seamless elevated canvas.

## [1.2.5] — 2026-08-16

### Added

- Dual-mode executable routing: running `docket` without arguments in an interactive terminal opens the OpenTUI workspace, while passing arguments runs the CLI pipeline.

## [1.2.4] — 2026-08-16

### Fixed

- Added `#!/usr/bin/env bun` shebang and executable permissions to CLI/TUI entry points so global `bun install` commands run `docket` without shell import syntax errors.

## [1.2.3] — 2026-08-16

### Fixed

- Updated repository owner reference to `ezhil-003/docket` across installation scripts and documentation to resolve 404 installation errors.

## [1.2.2] — 2026-08-15

### Changed

- Streamlined README installation guide with concise one-line `curl`, PowerShell, and Bun commands.

## [1.2.1] — 2026-08-15

### Fixed

- Made PDF output path tests portable across Windows, macOS, and Linux.
- Hardened native release builds with explicit Node.js 24 and pinned Bun tooling.
- Moved the Intel macOS release job to the current Intel runner image.

## [1.2.0] — 2026-08-15

### Added

- Production-oriented macOS/Linux and Windows installers with atomic installation, platform detection, clear failures, cleanup, and SHA-256 verification.
- Optional Bun global installation path for contributors and Bun-first environments.
- Native release workflow for Linux, macOS Intel, macOS Apple Silicon, and Windows binaries.
- Light and dark terminal-inspired README banners.

### Changed

- Reworked the README around installation, quick start, TUI controls, architecture, themes, and release operations.
- Added a package `bin` entry so Bun can expose `docket` globally.

## [1.1.0] — 2026-08-15

### Added

- Real-time Markdown diagnostics with rule IDs, line numbers, warnings, and actionable suggestions.
- OpenCode-inspired OpenTUI startup and workspace layouts with responsive editor and diagnostics panels.
- Clickable actions blended with keyboard navigation and interrupt controls.
- Structured `DocketError` hierarchy and graceful CLI/TUI lifecycle handling.
- Atomic PDF and HTML publication with safe output-path resolution.
- Browser lifecycle recovery after Chromium disconnects.
- Async theme loading for the render pipeline while retaining the synchronous assembly API.
- Sanitization of executable raw HTML and JavaScript-disabled PDF pages.
- Cross-line Markdown link linting that ignores inline-code brackets.
- Expanded tests for filesystem, output targets, TUI layout/state, browser recovery, sanitization, and large documents.

## [1.0.0]

### Added

- Initial Bun-powered Markdown-to-PDF engine.
- Puppeteer PDF rendering with executive, technical, legal, boardroom, minimal, and modern themes.
- CLI conversion mode and OpenTUI interactive mode.
- Margin-safe page layout and font-readiness guarantees.

[Unreleased]: https://github.com/ezhil-003/docket/compare/v1.2.5...HEAD
[1.2.5]: https://github.com/ezhil-003/docket/releases/tag/v1.2.5
[1.2.4]: https://github.com/ezhil-003/docket/releases/tag/v1.2.4
[1.2.3]: https://github.com/ezhil-003/docket/releases/tag/v1.2.3
[1.2.2]: https://github.com/ezhil-003/docket/releases/tag/v1.2.2
[1.2.1]: https://github.com/ezhil-003/docket/releases/tag/v1.2.1
[1.2.0]: https://github.com/ezhil-003/docket/releases/tag/v1.2.0
[1.1.0]: https://github.com/ezhil-003/docket/releases/tag/v1.1.0
[1.0.0]: https://github.com/ezhil-003/docket/releases/tag/v1.0.0
