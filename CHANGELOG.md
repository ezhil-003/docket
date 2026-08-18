# Changelog

All notable changes to Docket are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and releases follow [Semantic Versioning](https://semver.org/).

## [Unreleased]

No changes yet.

## [1.3.0] — 2026-08-19

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
