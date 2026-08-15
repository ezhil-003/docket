# Executive Summary & Technical Specification

> **Notice**: This document demonstrates the high-fidelity rendering capabilities of **md2pdf** — an executive Markdown-to-PDF conversion engine built with OpenTUI, TypeScript, and Bun.

---

## 1. Key Performance Highlights

- **Margin Safety**: Zero page clipping guarantee with internal padding wrappers.
- **Typography**: Responsive typographic scales featuring *Plus Jakarta Sans*, *Inter*, *Source Serif 4*, and *JetBrains Mono*.
- **Theme Versatility**: 5 preset colorways (`executive`, `technical`, `legal`, `boardroom`, `minimal`).

```typescript
// Core conversion contract
import { renderPdf } from "./core/render";

const result = await renderPdf({
  markdownSource: "# Boardroom Update\n...",
  themeId: "executive",
  outputPath: "./report.pdf",
});
console.log(`Generated ${result.bytes} bytes in ${result.durationMs}ms`);
```

---

## 2. Infrastructure Comparison Table

| Metric | Legacy Engine | md2pdf Engine | Improvement |
| :--- | :--- | :--- | :--- |
| **Page Margin Contract** | Puppeteer Padding | Zero Outer @page Margin | 100% Margin Safe |
| **Font Loading** | Unchecked / FOUT | `document.fonts.ready` | Zero FOUT |
| **Execution Overhead** | Node.js Heavy | Bun Runtime + Native TUI | 3.5x Speedup |
| **Page Break Safety** | Partial Clipping | `break-inside: avoid` | Clean Break Points |

---

## 3. Financial Projections & Quarterly Roadmap

### Q1 Objectives
1. Multi-theme design tokens integration.
2. OpenTUI interactive terminal frontend support.
3. CI/CD headless execution pipeline validation.

### Q2 Objectives
1. Dynamic header and footer page numbering.
2. Custom user-provided CSS theme overrides.
3. Standalone compiled binary distribution (`bun build --compile`).

---

## 4. Policy & Governance Notes

> Compliance with international design standards ensures that document geometry remains strictly bound within print printable bounds. All table rows, callout containers, and code syntax blocks are guarded against unwanted splitting across page breaks.

*Document generated automatically by md2pdf.*
