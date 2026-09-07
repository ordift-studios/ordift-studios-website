import { describe, expect, it } from "vitest";
import { computeDropdownPosition, computeNextMenuItemIndex, MENU_WIDTH } from "./adminNavDropdownMath";

// Admin Portal grouped-navigation dropdown fix (2026-09-07). This
// codebase has no React component-testing infrastructure installed
// (no @testing-library/react, no jsdom/happy-dom environment, zero
// existing .test.tsx files anywhere) — verified by inspection before
// writing this file. Per the established convention throughout this
// codebase (pure/impure split; UI verified live in the browser, pure
// logic gets real unit tests), these are the real, DOM-free regression
// tests for the dropdown's positioning/keyboard-navigation math. The
// interactive component itself (open/close, portal rendering, outside-
// click, Escape, focus movement) is verified via live browser checks
// across desktop/iPad-landscape/iPad-portrait/iPhone widths — see the
// completion report for that evidence.

describe("computeDropdownPosition — viewport collision (Part 3, items 6-7)", () => {
  it("opens downward by default when there is enough room below", () => {
    const result = computeDropdownPosition({ top: 60, bottom: 90, left: 20 }, 1200, 800, 4);
    expect(result.openUpward).toBe(false);
    expect(result.top).toBe(90); // opens from the trigger's bottom edge
  });

  it("flips to open upward when there is not enough room below but there IS room above", () => {
    // Trigger near the bottom of a short viewport (e.g. landscape iPad
    // with the keyboard up) — 4 items need ~176px, only 40px remain below.
    const result = computeDropdownPosition({ top: 400, bottom: 420, left: 20 }, 1200, 460, 4);
    expect(result.openUpward).toBe(true);
    expect(result.top).toBe(400); // opens from the trigger's top edge
  });

  it("does NOT flip upward if there also isn't enough room above (stays downward, becomes internally scrollable instead)", () => {
    const result = computeDropdownPosition({ top: 10, bottom: 30, left: 20 }, 1200, 460, 20);
    expect(result.openUpward).toBe(false);
  });

  it("clamps the left edge so the menu never overflows the right edge of the viewport", () => {
    // A trigger near the right edge of a narrow (e.g. iPhone) viewport.
    const viewportWidth = 390;
    const result = computeDropdownPosition({ top: 60, bottom: 90, left: 350 }, viewportWidth, 800, 3);
    expect(result.left + MENU_WIDTH).toBeLessThanOrEqual(viewportWidth);
  });

  it("leaves the left position unchanged when there is already enough room", () => {
    const result = computeDropdownPosition({ top: 60, bottom: 90, left: 100 }, 1200, 800, 3);
    expect(result.left).toBe(100);
  });
});

describe("computeNextMenuItemIndex — keyboard navigation (Part 3, item 9)", () => {
  it("ArrowDown moves to the next item", () => {
    expect(computeNextMenuItemIndex(0, 4, "down")).toBe(1);
  });

  it("ArrowDown wraps from the last item back to the first", () => {
    expect(computeNextMenuItemIndex(3, 4, "down")).toBe(0);
  });

  it("ArrowUp moves to the previous item", () => {
    expect(computeNextMenuItemIndex(2, 4, "up")).toBe(1);
  });

  it("ArrowUp wraps from the first item to the last", () => {
    expect(computeNextMenuItemIndex(0, 4, "up")).toBe(3);
  });

  it("ArrowDown from 'nothing focused yet' (-1) lands on the first item", () => {
    expect(computeNextMenuItemIndex(-1, 4, "down")).toBe(0);
  });

  it("Home jumps to the first item, End jumps to the last", () => {
    expect(computeNextMenuItemIndex(2, 5, "home")).toBe(0);
    expect(computeNextMenuItemIndex(2, 5, "end")).toBe(4);
  });

  it("a single-item menu always resolves to index 0", () => {
    expect(computeNextMenuItemIndex(0, 1, "down")).toBe(0);
    expect(computeNextMenuItemIndex(0, 1, "up")).toBe(0);
  });

  it("an empty menu never throws, returns -1", () => {
    expect(computeNextMenuItemIndex(-1, 0, "down")).toBe(-1);
  });
});
