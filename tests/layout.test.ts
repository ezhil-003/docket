import { describe, expect, it } from "vitest";
import { getTuiLayout, shortenPath } from "../src/tui/layout";

describe("responsive TUI layout", () => {
  it("uses a split editor/diagnostics layout on wide terminals", () => {
    expect(getTuiLayout(140, 40).sidebar).toBe(true);
    expect(getTuiLayout(140, 40).compact).toBe(false);
  });

  it("collapses diagnostics on narrow or short terminals", () => {
    expect(getTuiLayout(80, 40).sidebar).toBe(false);
    expect(getTuiLayout(100, 20).compact).toBe(true);
  });

  it("shortens long paths from the left while preserving the useful tail", () => {
    expect(shortenPath("/very/long/path/to/report.pdf", 16)).toBe("…/report.pdf");
  });
});
