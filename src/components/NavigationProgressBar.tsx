"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";

// Thin gold progress bar at the top of the viewport, giving visible
// feedback the moment an internal navigation starts (public site,
// Client Portal, Admin Portal). Purely observational — it never calls
// preventDefault()/stopPropagation(), so Next's own <Link> handling is
// completely untouched; this only decides when to show/hide a bar.
//
// Start signal: a capturing click listener on document, using the same
// criteria Next's <Link> itself uses to decide whether a click is an
// internal, unmodified, same-tab navigation (see
// node_modules/next/dist/docs/01-app/01-getting-started/04-linking-and-navigating.md).
// Also listens for popstate (back/forward).
//
// Finish signal: usePathname()/useSearchParams() changing means the
// route has actually resolved. A fixed failsafe timeout guarantees the
// bar can never get stuck if a click doesn't end in a route change
// (e.g. the target page redirects elsewhere, or navigation is
// cancelled) — required so the exact FAILSAFE_MS value doesn't need to
// be "right", just an upper bound.
const START_DELAY_MS = 100; // avoids a flash on fast/prefetched navigations
const FAILSAFE_MS = 6000;

function isInternalNavigationClick(event: MouseEvent): string | null {
  if (event.defaultPrevented) return null;
  if (event.button !== 0) return null; // left-click only
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return null;

  const anchor = (event.target as HTMLElement | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
  if (!anchor) return null;
  if (anchor.target && anchor.target !== "_self") return null; // new tab/window
  if (anchor.hasAttribute("download")) return null;
  if (anchor.origin !== window.location.origin) return null;

  const currentUrl = `${window.location.pathname}${window.location.search}`;
  const targetUrl = `${anchor.pathname}${anchor.search}`;
  if (targetUrl === currentUrl) return null; // same route (incl. hash-only changes)

  return targetUrl;
}

export default function NavigationProgressBar() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [active, setActive] = useState(false);
  const startTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const failsafeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimers = () => {
    if (startTimer.current) clearTimeout(startTimer.current);
    if (failsafeTimer.current) clearTimeout(failsafeTimer.current);
    startTimer.current = null;
    failsafeTimer.current = null;
  };

  const begin = () => {
    clearTimers();
    startTimer.current = setTimeout(() => setActive(true), START_DELAY_MS);
    failsafeTimer.current = setTimeout(() => {
      setActive(false);
      clearTimers();
    }, FAILSAFE_MS);
  };

  // Route actually changed — the navigation this bar was tracking is done.
  // The `active` reset is derived during render (React's documented
  // "adjusting state when a prop changes" pattern — see LoginForm.tsx's
  // prevState comment for the same technique already used elsewhere in
  // this codebase): no ref access happens here, only comparing/setting
  // React state, which render is allowed to do.
  const routeKey = `${pathname}?${searchParams.toString()}`;
  const [prevRouteKey, setPrevRouteKey] = useState(routeKey);
  if (routeKey !== prevRouteKey) {
    setPrevRouteKey(routeKey);
    if (active) setActive(false);
  }

  // Cancelling the pending timers is a ref mutation, not React state, so
  // it belongs in an effect rather than the render body above. This runs
  // after commit — always before a `setTimeout`-scheduled callback could
  // possibly fire — so the stale start/failsafe timers from the
  // just-finished navigation never resurrect the bar afterward.
  useEffect(() => {
    clearTimers();
  }, [routeKey]);

  useEffect(() => {
    const handleClick = (event: MouseEvent) => {
      if (isInternalNavigationClick(event)) begin();
    };
    const handlePopState = () => begin();

    document.addEventListener("click", handleClick, true);
    window.addEventListener("popstate", handlePopState);
    return () => {
      document.removeEventListener("click", handleClick, true);
      window.removeEventListener("popstate", handlePopState);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => clearTimers, []);

  return (
    <div
      aria-hidden
      className={`fixed top-0 left-0 right-0 z-[9999] h-[3px] pointer-events-none transition-opacity duration-200 ${
        active ? "opacity-100" : "opacity-0"
      }`}
    >
      <div
        className={`h-full bg-gradient-to-r from-ordift-gold-hover via-ordift-gold to-ordift-gold-hover transition-[width] ease-out ${
          active ? "w-[85%] duration-[5000ms]" : "w-0 duration-150"
        }`}
      />
    </div>
  );
}
