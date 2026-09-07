"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { computeDropdownPosition, computeNextMenuItemIndex, MENU_WIDTH } from "./adminNavDropdownMath";

// Admin Portal grouped-navigation dropdown (2026-09-07) — replaces the
// previous native <details>/<summary> dropdown, which rendered its
// submenu INSIDE the header's `overflow-x-auto` nav bar. Root cause:
// setting overflow-x to anything but `visible` forces the OTHER axis
// (overflow-y) to compute to `auto` too (CSS Overflow spec) — so that
// container was ALSO vertically clipping/scrollable, even though
// nothing asked it to be. The submenu (an absolutely-positioned child
// extending below the bar) was being clipped by that accidental
// overflow-y:auto box, not rendered "behind" the page by z-index — a
// user could partially reveal it by touch-scrolling that tiny clipped
// region, matching the exact reported symptom ("touch and hold...
// pushing or dragging upward"). No z-index value fixes a clipping
// container; only rendering outside it does. This component renders
// its menu through a React portal into document.body, positioned via
// the trigger's live bounding rect — completely outside the nav bar's
// clipping/stacking context, at z-40 (below the codebase's established
// z-50 for confirmation dialogs/modals — see ProfileQuickCard.tsx/
// TeamMemberModal.tsx — so a modal always wins if both are ever open).
//
// Server-side authorization is untouched by this component: AdminLayout
// (a Server Component) computes which groups/items this viewer may see
// via the exact same capability checks as before, and only passes the
// already-filtered list down as props — this component is pure
// presentation/interaction, never a permission decision.
export type AdminNavGroupItem = { label: string; href: string };

export default function AdminNavDropdown({ label, items }: { label: string; items: AdminNavGroupItem[] }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<{ top: number; left: number; openUpward: boolean } | null>(null);
  // "Adjusting state when a prop changes" pattern (React's own
  // recommendation) rather than an effect keyed on pathname — avoids
  // the extra render pass an effect-triggered setState would cause,
  // and satisfies the react-hooks/set-state-in-effect rule.
  const [lastPathname, setLastPathname] = useState(pathname);
  if (pathname !== lastPathname) {
    setLastPathname(pathname);
    if (open) {
      setOpen(false);
      setPosition(null);
    }
  }
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const buttonId = useId();
  const menuId = useId();

  const isActiveGroup = items.some((item) => pathname === item.href || pathname.startsWith(`${item.href}/`));

  const computePosition = useCallback(() => {
    const btn = buttonRef.current;
    if (!btn) return;
    const rect = btn.getBoundingClientRect();
    setPosition(computeDropdownPosition(rect, window.innerWidth, window.innerHeight, items.length));
  }, [items.length]);

  const close = useCallback(() => {
    setOpen(false);
    setPosition(null);
  }, []);

  const toggle = useCallback(() => {
    setOpen((prev) => {
      const next = !prev;
      if (next) computePosition();
      return next;
    });
  }, [computePosition]);

  // Outside click/tap and Escape close the menu — works identically for
  // mouse and touch (pointerdown fires for both), never relies on hover.
  useEffect(() => {
    if (!open) return;
    function handlePointerDown(e: PointerEvent) {
      const target = e.target as Node;
      if (buttonRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      close();
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        close();
        buttonRef.current?.focus();
      }
    }
    function handleReposition() {
      computePosition();
    }
    document.addEventListener("pointerdown", handlePointerDown, true);
    document.addEventListener("keydown", handleKeyDown);
    window.addEventListener("resize", handleReposition);
    window.addEventListener("scroll", handleReposition, true);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown, true);
      document.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("resize", handleReposition);
      window.removeEventListener("scroll", handleReposition, true);
    };
  }, [open, close, computePosition]);

  // Standard menu-button pattern: focus moves to the first item the
  // moment the menu opens, so arrow-key navigation works immediately —
  // without this, ArrowDown/ArrowUp would have nothing focused to act on.
  useEffect(() => {
    if (open && position) {
      const first = menuRef.current?.querySelector<HTMLAnchorElement>("[role='menuitem']");
      first?.focus();
    }
  }, [open, position]);

  function handleItemKeyDown(e: React.KeyboardEvent) {
    const itemEls = menuRef.current ? Array.from(menuRef.current.querySelectorAll<HTMLAnchorElement>("[role='menuitem']")) : [];
    if (itemEls.length === 0) return;
    const currentIndex = itemEls.indexOf(document.activeElement as HTMLAnchorElement);
    const directionByKey: Record<string, "down" | "up" | "home" | "end"> = {
      ArrowDown: "down",
      ArrowUp: "up",
      Home: "home",
      End: "end",
    };
    const direction = directionByKey[e.key];
    if (!direction) return;
    e.preventDefault();
    itemEls[computeNextMenuItemIndex(currentIndex, itemEls.length, direction)]?.focus();
  }

  return (
    <>
      <button
        ref={buttonRef}
        id={buttonId}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={toggle}
        className={`font-sans text-body-small px-2 py-3 whitespace-nowrap ${isActiveGroup ? "text-white" : "text-white/70 hover:text-white"}`}
      >
        {label} <span className={`inline-block text-white/40 transition-transform duration-150 ${open ? "rotate-180" : ""}`} aria-hidden="true">▾</span>
      </button>
      {open && position && typeof document !== "undefined"
        ? createPortal(
            <div
              ref={menuRef}
              id={menuId}
              role="menu"
              aria-labelledby={buttonId}
              style={{
                position: "fixed",
                top: position.openUpward ? undefined : position.top,
                bottom: position.openUpward ? window.innerHeight - position.top : undefined,
                left: position.left,
                width: MENU_WIDTH,
                maxHeight: "min(70vh, 24rem)",
              }}
              // z-40: above ordinary page content/cards/tables (those
              // have no elevated z-index of their own), below the
              // codebase's established z-50 confirmation-dialog/modal
              // layer, so a destructive-action modal always wins.
              className="z-40 overflow-y-auto rounded-lg border border-black/10 bg-white shadow-lg py-1.5"
            >
              {items.map((item) => {
                const isCurrent = pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    role="menuitem"
                    tabIndex={-1}
                    aria-current={isCurrent ? "page" : undefined}
                    onKeyDown={handleItemKeyDown}
                    className={`block font-sans text-body-small px-4 py-2 whitespace-nowrap hover:bg-ordift-offwhite focus:bg-ordift-offwhite focus:outline-none ${
                      isCurrent ? "text-ordift-gold-pressed font-semibold" : "text-ordift-ink"
                    }`}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </div>,
            document.body
          )
        : null}
    </>
  );
}
