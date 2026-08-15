# Changelog

All notable changes to Docket are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and releases follow [Semantic Versioning](https://semver.org/).

## [Unreleased]

No changes yet.

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

[Unreleased]: https://github.com/ezhilsivaraj/docket/compare/v1.2.2...HEAD
[1.2.2]: https://github.com/ezhilsivaraj/docket/releases/tag/v1.2.2
[1.2.1]: https://github.com/ezhilsivaraj/docket/releases/tag/v1.2.1
[1.2.0]: https://github.com/ezhilsivaraj/docket/releases/tag/v1.2.0
[1.1.0]: https://github.com/ezhilsivaraj/docket/releases/tag/v1.1.0
[1.0.0]: https://github.com/ezhilsivaraj/docket/releases/tag/v1.0.0
