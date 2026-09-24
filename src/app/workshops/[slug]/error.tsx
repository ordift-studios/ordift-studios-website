"use client";

import { useEffect } from "react";
import Link from "next/link";
import NavBar from "@/components/NavBar";

// Navigation-latency fix (2026-09-24) — Production QA: "a failed
// request must resolve to an explicit recoverable error state rather
// than an indefinite loading state." No error.tsx existed for this
// route segment, so a genuine failure (a transient Sanity/Postgres
// timeout in the data-fetch chain this page depends on) would have
// bubbled to the nearest ancestor error boundary instead of this
// page's own recoverable state — never literally "hung," but never
// explicit or scoped to what the visitor was actually trying to do
// either. Client Component per Next.js's own error.tsx convention —
// the only mechanism for this.
export default function WorkshopDetailError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("[workshops/[slug]] page error", error);
  }, [error]);

  return (
    <main>
      <NavBar />
      <section className="bg-white px-4 sm:px-8 py-20 sm:py-28 text-center">
        <div className="max-w-md mx-auto">
          <p className="font-sans font-semibold uppercase tracking-[0.2em] text-eyebrow text-ordift-gold-pressed mb-4">
            Workshop
          </p>
          <h1 className="font-serif font-medium text-section-heading text-ordift-ink mb-3">
            This workshop couldn&rsquo;t load
          </h1>
          <p className="font-sans text-body-small text-ordift-ink-muted mb-8">
            Something went wrong loading this page. Your connection or our systems may have had a brief issue — this
            didn&rsquo;t affect any registration or payment.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <button
              type="button"
              onClick={reset}
              className="font-sans text-body-small font-semibold px-5 py-2.5 rounded-full bg-ordift-navy-950 text-white"
            >
              Try again
            </button>
            <Link href="/workshops" className="font-sans text-body-small font-medium px-5 py-2.5 rounded-full border border-black/15 text-ordift-ink">
              Back to Workshops
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
