"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";
import Link from "next/link";
import Footer from "@/components/Footer";
import Button from "@/components/Button";
import Logo from "@/components/Logo";

// Error boundaries must be Client Components (Next.js 16.2 file
// convention). `unstable_retry` (added in 16.2.0) is the current
// recommended recovery action over the older `reset()` — it re-fetches
// and re-renders the boundary's children rather than just clearing
// local error state. Found missing entirely during the 2026-08-05
// independent audit (A-10): an unhandled error anywhere in the tree
// previously fell through to Next's bare default error overlay.
export default function Error({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
    Sentry.captureException(error);
  }, [error]);

  return (
    <main>
      {/* A minimal, static header — not the full NavBar. An error
          boundary must stay a Client Component (Next.js requirement),
          and NavBar is a Server Component that reads cookies (session)
          and fetches CMS content — neither is safe or appropriate to
          pull into client-bundled code, and both are exactly the kind
          of thing that might be failing when this page renders at
          all. */}
      <nav className="bg-ordift-navy-950 px-4 sm:px-8 py-5">
        <div className="max-w-6xl mx-auto">
          <Link href="/" aria-label="Ordift Studios home">
            <Logo variant="nav" color="white" height={28} />
          </Link>
        </div>
      </nav>

      <section className="relative overflow-hidden bg-ordift-navy-950 text-white px-4 sm:px-8 py-24 sm:py-32">
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(ellipse at 50% 40%, var(--color-navy-900) 0%, var(--color-navy-950) 65%)",
          }}
        />
        <div className="relative max-w-2xl mx-auto text-center flex flex-col items-center">
          <Logo variant="icon" color="white" height={40} className="opacity-30 mb-8" />
          <p className="font-sans font-semibold uppercase tracking-[0.2em] text-eyebrow text-ordift-gold mb-4">
            Something went wrong
          </p>
          <h1 className="font-serif font-medium text-page-title sm:text-page-title-tablet mb-4">
            We hit a snag loading this page.
          </h1>
          <p className="font-sans text-body text-white/70 mb-10 max-w-md">
            This is on us, not you. Try again, or head back to the homepage.
          </p>
          <div className="flex flex-wrap gap-3 justify-center">
            <Button onClick={() => unstable_retry()} variant="primary">
              Try Again
            </Button>
            <Button href="/" variant="secondary" className="border-white/30 text-white hover:border-white/60">
              Back to Home
            </Button>
          </div>
          <p className="font-sans text-body-small text-white/50 mt-10">
            If this keeps happening,{" "}
            <Link
              href="/book"
              className="text-ordift-gold hover:text-ordift-gold-hover underline underline-offset-4"
            >
              let us know
            </Link>
            .
          </p>
        </div>
      </section>

      <Footer />
    </main>
  );
}
