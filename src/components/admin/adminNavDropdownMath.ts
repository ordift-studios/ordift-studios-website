// Admin Portal grouped-navigation dropdown (2026-09-07) — pure,
// zero-import positioning/keyboard-navigation math, extracted out of
// AdminNavDropdown.tsx so it's directly unit-testable without a DOM
// (this codebase has no React component-testing infrastructure
// installed — see AdminNavDropdown.test.ts's header comment — so the
// interactive component itself is verified live in the browser, and
// only this pure layer gets real .test.ts coverage, matching the
// pure/impure split convention used throughout this codebase).

export const MENU_WIDTH = 224; // 14rem, matches the prior dropdown's min-width
export const MENU_MARGIN = 8;

export type TriggerRect = { top: number; bottom: number; left: number };

export type DropdownPosition = { top: number; left: number; openUpward: boolean };

// Viewport-collision-aware placement: opens upward when there isn't
// enough room below (and there IS enough room above), and clamps the
// left edge so the menu never overflows the right edge of the viewport.
export function computeDropdownPosition(
  trigger: TriggerRect,
  viewportWidth: number,
  viewportHeight: number,
  itemCount: number
): DropdownPosition {
  const estimatedMenuHeight = Math.min(itemCount * 40 + 16, 320);
  const spaceBelow = viewportHeight - trigger.bottom;
  const openUpward = spaceBelow < estimatedMenuHeight && trigger.top > estimatedMenuHeight;

  let left = trigger.left;
  if (left + MENU_WIDTH > viewportWidth - MENU_MARGIN) {
    left = Math.max(MENU_MARGIN, viewportWidth - MENU_WIDTH - MENU_MARGIN);
  }

  return { top: openUpward ? trigger.top : trigger.bottom, left, openUpward };
}

export type ArrowDirection = "down" | "up" | "home" | "end";

// Wraps around at both ends (ArrowDown from the last item goes to the
// first, ArrowUp from the first goes to the last) — standard menu
// keyboard-navigation behavior. currentIndex of -1 (nothing focused
// yet) is treated as "before the first item".
export function computeNextMenuItemIndex(currentIndex: number, itemCount: number, direction: ArrowDirection): number {
  if (itemCount === 0) return -1;
  switch (direction) {
    case "down":
      return (currentIndex + 1 + itemCount) % itemCount;
    case "up":
      return (currentIndex - 1 + itemCount) % itemCount;
    case "home":
      return 0;
    case "end":
      return itemCount - 1;
  }
}
