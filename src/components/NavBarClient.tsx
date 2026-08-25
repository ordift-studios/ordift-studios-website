"use client";

import { useState } from "react";
import Link from "next/link";
import Logo from "./Logo";
import Button from "./Button";
import type { CtaButton, NavLink } from "@/lib/content/types";

export default function NavBarClient({
  links,
  primaryCta,
  accountHref,
  transparent = false,
}: {
  links: NavLink[];
  primaryCta: CtaButton;
  // Precomputed server-side via primaryPortalPath() — null means the
  // visitor isn't authenticated. This component never derives a
  // destination from role data itself, so there's only one place
  // role-based routing logic lives.
  accountHref: string | null;
  // Homepage-only overlay mode (2026-08-23) — the photograph beneath
  // extends behind the nav instead of a solid navy bar pushing it down.
  // Every other page keeps the exact existing solid-bar behavior
  // (transparent defaults to false, unchanged from before this mode
  // existed). Only the closed state is transparent — once the mobile
  // menu is open, a solid backdrop returns so its links stay legible
  // over whatever photograph is behind it.
  transparent?: boolean;
}) {
  const [open, setOpen] = useState(false);

  // Transparent-mode desktop nav treatment (2026-08-23, revised): one
  // continuous translucent strip behind the whole link group, not
  // per-item pills — individual links keep their own spacing/click area
  // via the flex gap below, but no longer carry their own background.
  // Literal rgba()/hex values throughout, deliberately not a Tailwind
  // custom-color opacity modifier or a `var(--color-*)` reference — both
  // were confirmed live to fail to render while a CSS transition was
  // active on the same property (see the nav-background fix above);
  // plain literal color functions don't hit that issue.
  const navGroupStripClass = transparent
    ? "rounded-full px-5 py-2.5 bg-[rgba(10,14,24,0.28)] backdrop-blur-sm"
    : "";
  const hamburgerChipClass = transparent
    ? "rounded-full bg-[rgba(10,14,24,0.4)] backdrop-blur-sm"
    : "";
  const ctaChipClass = transparent
    ? "!bg-[rgba(191,161,74,0.85)] hover:!bg-[rgba(191,161,74,0.95)] backdrop-blur-sm"
    : "";

  return (
    <nav
      className={`text-white ${transparent ? "absolute top-0 inset-x-0 z-20" : "relative bg-ordift-navy-950"}`}
      // Inline style, not a Tailwind utility class, for the transparent-mode
      // background specifically — a `bg-ordift-navy-950` utility applied
      // here was silently failing to render regardless of which background
      // utility was present in the className (confirmed live via computed
      // style + CSSOM inspection on the deployed page), and even an inline
      // `var(--color-navy-950)` style still failed to render while a CSS
      // `transition-colors` was active on this element — pointing at a
      // background-color transition/var() interpolation issue, not a
      // cascade/specificity one. Removing the (non-essential, purely
      // decorative) animated transition on this property and setting the
      // value directly resolved it — confirmed live. No transition existed
      // here before this homepage-overlay mode was added, so this is a
      // net-zero change against the previously approved nav, not a loss.
      style={transparent ? { backgroundColor: open ? "var(--color-navy-950)" : "transparent" } : undefined}
    >
      {transparent && !open && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-black/35 to-transparent"
        />
      )}
      {/* Closure refinement (2026-08-25) — the full inline nav switches
          on at `lg:` (1024px), not `md:` (768px): at 768px the logo +
          6 links + "Log in"/"Create account" + CTA button didn't fit
          on one line, wrapping "Log in" and the CTA button awkwardly
          onto two lines. Tablet-width viewports now use the hamburger
          menu (already correct on mobile) instead — same links, same
          button, same behavior, just a wider hamburger range. */}
      <div className="relative max-w-6xl mx-auto px-4 sm:px-8 py-5 flex items-center justify-between">
        <Link href="/" aria-label="Ordift Studios home" className="shrink-0">
          <Logo variant="nav" color="white" height={28} priority />
        </Link>

        <div className={`hidden lg:flex items-center gap-5 font-sans text-nav text-white/80 ${navGroupStripClass}`}>
          {links.map((link) => (
            <Link key={link.href} href={link.href} className="hover:text-white transition-colors">
              {link.label}
            </Link>
          ))}
          {accountHref ? (
            <Link href={accountHref} className="hover:text-white transition-colors">
              My Account
            </Link>
          ) : (
            <>
              <Link href="/portal/login" className="hover:text-white transition-colors">
                Log in
              </Link>
              <Link href="/portal/signup" className="hover:text-white transition-colors">
                Create account
              </Link>
            </>
          )}
        </div>

        <div className="hidden lg:block">
          <Button href={primaryCta.href} variant="primary" className={ctaChipClass}>
            {primaryCta.label}
          </Button>
        </div>

        <button
          type="button"
          className={`lg:hidden min-h-11 min-w-11 flex items-center justify-center ${hamburgerChipClass}`}
          aria-expanded={open}
          aria-controls="mobile-nav"
          aria-label={open ? "Close menu" : "Open menu"}
          onClick={() => setOpen((v) => !v)}
        >
          <span className="relative block w-6 h-4" aria-hidden="true">
            <span
              className={`absolute left-0 top-0 h-0.5 w-6 rounded-full bg-white transition-all duration-300 ease-in-out motion-reduce:transition-none ${
                open ? "top-1.5 rotate-45" : ""
              }`}
            />
            <span
              className={`absolute left-0 top-1.5 h-0.5 w-6 rounded-full bg-white transition-opacity duration-300 ease-in-out motion-reduce:transition-none ${
                open ? "opacity-0" : "opacity-100"
              }`}
            />
            <span
              className={`absolute left-0 top-3 h-0.5 w-6 rounded-full bg-white transition-all duration-300 ease-in-out motion-reduce:transition-none ${
                open ? "top-1.5 -rotate-45" : ""
              }`}
            />
          </span>
        </button>
      </div>

      {/* Always mounted (not conditionally rendered) so the open/close
          transition can animate smoothly via CSS grid-template-rows —
          0fr -> 1fr is the standard modern technique for animating to
          "auto" height without JS measuring. `inert` when closed removes
          the hidden links from the tab order and the accessibility tree
          natively, so nothing here is reachable by keyboard while shut. */}
      <div
        id="mobile-nav"
        className={`lg:hidden grid overflow-hidden transition-[grid-template-rows] duration-300 ease-in-out motion-reduce:transition-none ${
          open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
        }`}
        aria-hidden={!open}
        inert={!open}
      >
        <div className="overflow-hidden">
          <div className="border-t border-white/10 px-4 py-4 flex flex-col gap-4">
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="font-sans text-nav text-white/80 hover:text-white transition-colors"
                onClick={() => setOpen(false)}
              >
                {link.label}
              </Link>
            ))}
            {accountHref ? (
              <Link
                href={accountHref}
                className="font-sans text-nav text-white/80 hover:text-white transition-colors"
                onClick={() => setOpen(false)}
              >
                My Account
              </Link>
            ) : (
              <>
                <Link
                  href="/portal/login"
                  className="font-sans text-nav text-white/80 hover:text-white transition-colors"
                  onClick={() => setOpen(false)}
                >
                  Log in
                </Link>
                <Link
                  href="/portal/signup"
                  className="font-sans text-nav text-white/80 hover:text-white transition-colors"
                  onClick={() => setOpen(false)}
                >
                  Create account
                </Link>
              </>
            )}
            <Button href={primaryCta.href} variant="primary" className="w-full">
              {primaryCta.label}
            </Button>
          </div>
        </div>
      </div>
    </nav>
  );
}
