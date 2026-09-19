# AGENTS.md

Welcome! This document provides operational guidelines, architecture layout, and core constraints for AI agents working on **Docket** (Executive Markdown to PDF Engine).

---

## 1. Project Overview

**Docket** is a production-grade executive Markdown-to-PDF generation engine built using 100% Bun-native primitives:
- **Runtime**: [Bun](https://bun.sh) (>= v1.4.2)
- **Language**: TypeScript (`type: module`, ES2022/ESNext target)
- **Markdown Parsing**: `Bun.markdown` (native Zig/Rust GFM compiler, ~20x faster than markdown-it)
- **PDF Rendering**: Native Bun CDP Client (`src/core/cdp.ts`) + Automated `chrome-headless-shell` Cache (`src/core/browser-cache.ts`)
- **Interactive TUI**: `@opentui/core` with SIMD-accelerated `Bun.stringWidth()`, `Bun.wrapAnsi()`, and `Bun.openInEditor()`
- **Testing**: `bun:test` native test runner (~300ms execution, zero test dependencies)

---

## 2. Codebase Structure

```
.
├── LICENSE                 # MIT License
├── README.md               # User documentation & feature overview
├── CHANGELOG.md            # Release history and changelogs
├── package.json            # Scripts & dependencies (v1.4.2)
├── tsconfig.json           # TypeScript configuration
├── sample.md               # Sample Markdown document for testing
├── src/
│   ├── cli.ts              # Non-interactive CLI entry point (arg parsing, STDIN piping, watch mode, --open, --preview)
│   ├── core/
│   │   ├── assemble.ts     # Markdown to HTML document assembly wrapper with Bun.escapeHTML
│   │   ├── browser-cache.ts# Cross-platform system Chrome discovery & automated headless shell downloader
│   │   ├── cdp.ts          # Pure Bun Chrome DevTools Protocol driver (Bun.spawn + native WebSocket)
│   │   ├── contracts.ts    # Core TypeScript types & document contracts
│   │   ├── errors.ts       # Structured error hierarchy with cause preservation
│   │   ├── frontmatter.ts  # Native YAML frontmatter metadata extraction & stripping
│   │   ├── fs.ts           # Bun-native atomic file system adapter (Bun.file, Bun.write)
│   │   ├── lint.ts         # Real-time Markdown linter engine
│   │   ├── native-picker.ts# Cross-platform native folder/file dialogs powered by Bun Shell ($)
│   │   ├── output.ts       # Output path resolution & heading-derived filenames
│   │   ├── parse.ts        # Native Bun Markdown compiler, Shiki highlighting, callouts & pagebreaks
│   │   ├── paths.ts        # Cross-platform home expansion & standard user directory discovery
│   │   ├── render.ts       # CDP page rendering & PDF output logic
│   │   └── themes.ts       # Theme registry, custom CSS resolution, Bun.file loader & Bun.peek
│   ├── themes/             # CSS styling presets
│   │   ├── _base.css       # Core design system tokens, container padding & layout resets
│   │   ├── modern.css      # Modern Indigo / Catppuccin Mocha styling
│   │   ├── executive.css   # Navy & royal blue / VS Code Dark+ executive styling
│   │   ├── technical.css   # Slate/cyan / One Dark developer theme
│   │   ├── legal.css       # Formal serif body (Source Serif 4) & GitHub Dark
│   │   ├── boardroom.css   # Warm charcoal & amber / Dracula typography
│   │   └── minimal.css     # Clean monochrome / Tokyo Night layout
│   └── tui/
│       ├── app.ts          # Interactive OpenTUI terminal UI frontend (Ctrl+E editor, Bun.wrapAnsi)
│       ├── layout.ts       # Responsive layout metrics with Bun.stringWidth
│       ├── state.ts        # Pure reducer state machine & DocketState
│       └── theme.ts        # Multi-theme palettes & SyntaxStyle builder
└── tests/                  # bun:test native test suite (80+ tests)
```

---

## 3. Essential Commands

| Action | Command |
| :--- | :--- |
| **Install Dependencies** | `bun install` |
| **Run Unit Tests** | `bun test` or `bun run test` |
| **Run Tests in Watch Mode** | `bun test:watch` |
| **Launch TUI Frontend** | `bun run start` (or `bun run tui`) |
| **Run CLI** | `bun run cli -- [args]` (e.g. `bun run cli sample.md -t modern -o sample.pdf -O`) |
| **Preview in Terminal** | `bun run cli -- sample.md --preview` |
| **Compile Binary** | `bun run build` |

---

## 4. Key Architectural Contracts & Safeguards

When modifying rendering logic or themes, AI agents **MUST** maintain the following core guarantees:

1. **Margin Safety & Pagination Contract**:
   - Universal CSS Paged Media `@page { margin: 18mm 16mm 20mm 16mm; }` to ensure consistent top, bottom, left, and right margins across all pages in multi-page documents.
   - Repeating table headers (`thead { display: table-header-group }`) and row integrity guards (`tr { break-inside: avoid }`).
   - Essential page-break guards (`break-after: avoid-page`, `break-inside: avoid`) on headers, code blocks, blockquotes, and callouts with orphan/widow controls.
2. **Font Readiness Guarantee**:
   - CDP session MUST wait for `document.fonts.ready` before calling `Page.printToPDF` to ensure custom web fonts render properly.
3. **Dual Execution Modes**:
   - **CLI Mode (`src/cli.ts`)**: Fast, non-interactive, suitable for CI/CD automation & STDIN piping with `-O, --open` and `--preview`.
   - **TUI Mode (`src/tui/app.ts`)**: Rich terminal interface with text mode, file path switcher, and `Ctrl+E` external editor jumper.

---

## 5. Development & Testing Workflow

- **Type Safety**: Maintain strict TypeScript typing across `src/core/` and `src/tui/`.
- **Testing**: Whenever adding features or themes, add corresponding unit tests in `tests/`. Verify test execution with `bun test`.
- **CSS Modularity**: When adding new themes, define variables and theme overrides in `src/themes/<theme_name>.css` while preserving shared rules in `src/themes/_base.css`.
