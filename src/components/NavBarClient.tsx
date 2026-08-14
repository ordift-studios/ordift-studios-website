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
}: {
  links: NavLink[];
  primaryCta: CtaButton;
  // Precomputed server-side via primaryPortalPath() — null means the
  // visitor isn't authenticated. This component never derives a
  // destination from role data itself, so there's only one place
  // role-based routing logic lives.
  accountHref: string | null;
}) {
  const [open, setOpen] = useState(false);

  return (
    <nav className="bg-ordift-navy-950 text-white relative">
      <div className="max-w-6xl mx-auto px-4 sm:px-8 py-5 flex items-center justify-between">
        <Link href="/" aria-label="Ordift Studios home" className="shrink-0">
          <Logo variant="nav" color="white" height={28} priority />
        </Link>

        <div className="hidden md:flex items-center gap-6 font-sans text-nav text-white/80">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="hover:text-white transition-colors"
            >
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

        <div className="hidden md:block">
          <Button href={primaryCta.href} variant="primary">
            {primaryCta.label}
          </Button>
        </div>

        <button
          type="button"
          className="md:hidden min-h-11 min-w-11 flex items-center justify-center font-sans text-nav text-white"
          aria-expanded={open}
          aria-controls="mobile-nav"
          onClick={() => setOpen((v) => !v)}
        >
          {open ? "Close" : "Menu"}
        </button>
      </div>

      {open && (
        <div
          id="mobile-nav"
          className="md:hidden border-t border-white/10 px-4 py-4 flex flex-col gap-4"
        >
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
      )}
    </nav>
  );
}
