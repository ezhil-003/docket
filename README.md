# Docket

> Production-Grade Executive Markdown → PDF Engine powered by Bun, TypeScript, OpenTUI, and Puppeteer.

---

## Key Features

- **Strict Margin Safety Contract**:
  - Zero outer `@page { margin: 0; }` prevents content from clipping under margins.
  - Safe internal container padding (`padding: 18mm 16mm 20mm 16mm`).
  - Page break guards (`break-inside: avoid`) on tables, code blocks, blockquotes, and callouts.
  - Font load guarantee (`document.fonts.ready`) before capture.
- **6 Selectable Executive Theme Presets**:
  - `modern`: Modern Indigo theme with indigo/purple gradient headings, pill accents, and rounded tables.
  - `executive`: Boardroom navy & royal blue accent with Jakarta/Inter fonts.
  - `technical`: Cyan slate layout with JetBrains Mono highlights.
  - `legal`: Formal serif body (*Source Serif 4*) and traditional navy headers.
  - `boardroom`: Warm charcoal with amber & bronze accents.
  - `minimal`: Clean monochrome layout with restrained typography.
- **Dual Input Interface**:
  - Interactive OpenTUI terminal frontend (Text mode as default setup + File path mode switcher).
  - Fast, non-interactive CLI for CI/CD automation & STDIN piping.

---

## Installation & Setup

```bash
bun install
```

---

## Quick Usage

### 1. Run Interactive OpenTUI App
```bash
bun run start
# or
bun run tui
```

### 2. Run Non-Interactive CLI
```bash
# Convert a Markdown file
bun run cli document.md -t modern -o report.pdf

# Pipe STDIN input
echo "# Hello Docket" | bun run cli --paste -t modern -o hello.pdf
```

### 3. Run Test Suite (Vitest)
```bash
bun test
```

---

## CLI Options

| Flag | Description | Default |
| :--- | :--- | :--- |
| `-t, --theme <theme>` | Preset (`modern`, `executive`, `technical`, `legal`, `boardroom`, `minimal`) | `executive` |
| `-o, --output <file>` | Destination output PDF path | `<input>.pdf` or `docket-output.pdf` |
| `-p, --paste` | Read Markdown content from STDIN pipe | `false` |
| `--dry-run <out.html>`| Export intermediate HTML document without browser render | `undefined` |
| `-h, --help` | Display usage instructions | — |

---

## Community & Governance

- [AGENTS.md](AGENTS.md) – Guidelines & architecture rules for AI coding assistants.
- [CONTRIBUTING.md](CONTRIBUTING.md) – Development setup and contribution guidelines.
- [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) – Community standards & Contributor Covenant guidelines.
- [SECURITY.md](SECURITY.md) – Security policy and vulnerability disclosure process.

---

## License

Released under the [MIT License](LICENSE) © Docket.

