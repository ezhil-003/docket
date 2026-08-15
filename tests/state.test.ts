import { describe, expect, it } from "vitest";
import { initialTuiState, reduceTuiState } from "../src/tui/state";
import { lintMarkdown } from "../src/core/lint";

describe("TUI reducer state", () => {
  it("keeps UI transitions pure and preserves unrelated state", () => {
    const next = reduceTuiState(initialTuiState, { type: "set-theme", themeId: "modern" });
    expect(next.themeId).toBe("modern");
    expect(next.outputPath).toBe(initialTuiState.outputPath);
    expect(initialTuiState.themeId).toBe("executive");
  });

  it("represents render lifecycle transitions", () => {
    const rendering = reduceTuiState(initialTuiState, { type: "render-started" });
    expect(rendering.renderStatus).toBe("rendering");
    const diagnostics = lintMarkdown("# Ready");
    const idle = reduceTuiState(rendering, { type: "lint-completed", diagnostics });
    expect(idle.renderStatus).toBe("idle");
    expect(idle.diagnostics).toBe(diagnostics);
  });
});

