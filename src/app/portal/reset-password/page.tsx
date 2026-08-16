import type { Metadata } from "next";
import Logo from "@/components/Logo";
import ResetPasswordForm from "./ResetPasswordForm";

export const metadata: Metadata = {
  title: "Set a New Password — Ordift Studios Portal",
  robots: { index: false, follow: false },
};

// Deliberately no <NavBar />/<Footer /> here (2026-08-16) — this is the
// one page meant to be reached by a not-yet-authenticated visitor
// arriving from a real recovery email. Those shared components render
// next/link <Link> elements, which Next.js automatically prefetches in
// the background; on staging, those prefetch requests target other
// Basic-Auth-gated routes and can pop a native auth challenge mid-flow
// (see TECHNICAL_DEBT_REGISTER.md / the staging Basic-Auth investigation).
// This layout is intentionally link-free — no <Link>, <a>, or
// router.prefetch() — so there is nothing for the prefetch scheduler to
// queue while a recovery session is in progress.
export default function ResetPasswordPage() {
  return (
    <main>
      <header className="bg-ordift-navy-950 px-4 sm:px-8 py-8">
        <div className="max-w-6xl mx-auto">
          <Logo variant="nav" color="gold" height={28} />
        </div>
      </header>
      <section className="bg-ordift-navy-950 text-white px-4 sm:px-8 py-16 sm:py-20">
        <div className="max-w-6xl mx-auto">
          <p className="font-sans font-semibold uppercase tracking-[0.2em] text-eyebrow lg:text-eyebrow-desktop text-ordift-gold mb-4">
            Client Portal
          </p>
          <h1 className="font-serif font-medium text-page-title sm:text-page-title-tablet lg:text-page-title-desktop max-w-2xl">
            Set a new password.
          </h1>
        </div>
      </section>
      <section className="bg-white px-4 sm:px-8 py-14 sm:py-20">
        <ResetPasswordForm />
      </section>
      <footer className="px-4 sm:px-8 py-8">
        <div className="max-w-6xl mx-auto">
          <p className="font-sans text-caption text-ordift-ink-muted">
            &copy; {new Date().getFullYear()} Ordift Studios. All rights reserved.
          </p>
        </div>
      </footer>
    </main>
  );
}
