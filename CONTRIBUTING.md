# Contributing to Docket

Thank you for your interest in contributing to **Docket**! We welcome bug reports, feature requests, documentation updates, theme proposals, and pull requests.

---

## Code of Conduct

By participating in this project, you agree to abide by our [Code of Conduct](CODE_OF_CONDUCT.md). Please read it to understand expected behaviors and community guidelines.

---

## Getting Started

### Prerequisites

- [Bun](https://bun.sh) (v1.0 or later) installed on your system.
- Node.js 24 or later for the release/tooling environment.

### Setting Up Development Environment

1. **Fork and Clone the Repository**:
   ```bash
   git clone https://github.com/your-username/docket.git
   cd docket
   ```

2. **Install Dependencies**:
   ```bash
   bun install
   ```

3. **Verify the Installation & Run Tests**:
   ```bash
   bun test
   ```

---

## Development Workflow

### Project Architecture

- `src/core/parse.ts`: Converts Markdown to HTML using `markdown-it`.
- `src/core/assemble.ts`: Wraps HTML into a standalone document with CSS styles, font imports, and page structures.
- `src/core/render.ts`: Uses Puppeteer to load assembled HTML and export high-quality PDF files.
- `src/core/themes.ts` & `src/themes/`: CSS presets (`modern`, `executive`, `technical`, `legal`, `boardroom`, `minimal`).
- `src/cli.ts`: Non-interactive CLI binary entry point.
- `src/tui/app.ts`: Interactive OpenTUI terminal interface.

### Adding a New Theme

1. Create a new CSS file in `src/themes/<theme-name>.css`.
2. Inherit styles from `_base.css` and customize color tokens, typography, and element accents.
3. Register the theme in `src/core/themes.ts`.
4. Add theme test assertions in `tests/themes.test.ts`.

---

## Submitting Pull Requests

1. **Create a Feature Branch**:
   ```bash
   git checkout -b feature/my-amazing-feature
   ```

2. **Make Your Changes**:
   - Ensure all code is strictly typed with TypeScript.
   - Run tests locally to ensure no regressions (`bun test`).

3. **Commit Your Changes**:
   Use concise, descriptive commit messages:
   ```bash
   git commit -m "feat(theme): add corporate-dark PDF preset"
   ```

4. **Push & Open Pull Request**:
   Push your branch to GitHub and submit a Pull Request targeting the `main` branch. Provide a clear description of your changes and motivation.

---

## Reporting Issues & Feature Requests

Please search existing issues before opening a new issue to avoid duplicates.
When submitting an issue, include:
- Operating system and Bun version
- Steps to reproduce the issue
- Expected vs actual behavior
- Relevant code snippets or sample Markdown input
