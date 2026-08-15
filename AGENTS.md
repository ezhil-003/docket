# AGENTS.md

Welcome! This document provides operational guidelines, architecture layout, and core constraints for AI agents working on **Docket** (Executive Markdown to PDF Engine).

---

## 1. Project Overview

**Docket** is a production-grade executive Markdown-to-PDF generation engine built using:
- **Runtime**: [Bun](https://bun.sh)
- **Language**: TypeScript (`type: module`, ES2022/ESNext target)
- **Markdown Parsing**: `markdown-it`
- **PDF Rendering**: `puppeteer` (headless Chromium print-to-PDF)
- **Interactive TUI**: `@opentui/core`
- **Testing**: `vitest`

---

## 2. Codebase Structure

```
.
├── LICENSE                 # MIT License
├── README.md               # User documentation & feature overview
├── package.json            # Scripts & dependencies
├── tsconfig.json           # TypeScript configuration
├── sample.md               # Sample Markdown document for testing
├── src/
│   ├── cli.ts              # Non-interactive CLI entry point (arg parsing, STDIN piping)
│   ├── core/
│   │   ├── assemble.ts     # Markdown to HTML document assembly wrapper
│   │   ├── parse.ts        # Markdown-it instance & HTML parsing logic
│   │   ├── render.ts       # Puppeteer page rendering & PDF output logic
│   │   └── themes.ts       # Theme registry & theme resolution helpers
│   ├── themes/             # CSS styling presets
│   │   ├── _base.css       # Core design system tokens, container padding & layout resets
│   │   ├── modern.css      # Indigo/purple gradient headers & rounded elements
│   │   ├── executive.css   # Navy & royal blue executive styling
│   │   ├── technical.css   # Slate/cyan developer theme with JetBrains Mono font
│   │   ├── legal.css       # Formal serif body (Source Serif 4) & navy accents
│   │   ├── boardroom.css   # Warm charcoal & amber/bronze typography
│   │   └── minimal.css     # Clean monochrome layout
│   └── tui/
│       └── app.ts          # Interactive OpenTUI terminal UI frontend
└── tests/                  # Vitest test suite
    ├── parse.test.ts
    ├── assemble.test.ts
    ├── render.test.ts
    ├── themes.test.ts
    └── cli.test.ts
```

---

## 3. Essential Commands

| Action | Command |
| :--- | :--- |
| **Install Dependencies** | `bun install` |
| **Run Unit Tests** | `bun test` or `bun run test` |
| **Run Tests in Watch Mode** | `bun test:watch` |
| **Launch TUI Frontend** | `bun run start` (or `bun run tui`) |
| **Run CLI** | `bun run cli -- [args]` (e.g. `bun run cli sample.md -t modern -o sample.pdf`) |
| **Compile Binary** | `bun run build` |

---

## 4. Key Architectural Contracts & Safeguards

When modifying rendering logic or themes, AI agents **MUST** maintain the following core guarantees:

1. **Margin Safety Contract**:
   - Zero outer `@page { margin: 0; }` to avoid default browser margin clipping.
   - Internal document container padding (`padding: 18mm 16mm 20mm 16mm`).
   - Essential page-break guards (`break-inside: avoid`) on headers, tables, code blocks, blockquotes, and callouts.
2. **Font Readiness Guarantee**:
   - `puppeteer` MUST wait for `document.fonts.ready` before taking a screenshot or generating PDF to ensure custom web fonts render properly.
3. **Dual Execution Modes**:
   - **CLI Mode (`src/cli.ts`)**: Fast, non-interactive, suitable for CI/CD automation & STDIN piping.
   - **TUI Mode (`src/tui/app.ts`)**: Rich terminal interface with text mode and file path mode switcher.

---

## 5. Development & Testing Workflow

- **Type Safety**: Maintain strict TypeScript typing across `src/core/` and `src/tui/`.
- **Testing**: Whenever adding features or themes, add corresponding unit tests in `tests/`. Verify test execution with `bun test`.
- **CSS Modularity**: When adding new themes, define variables and theme overrides in `src/themes/<theme_name>.css` while preserving shared rules in `src/themes/_base.css`.
