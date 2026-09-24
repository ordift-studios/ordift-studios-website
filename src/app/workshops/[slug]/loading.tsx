import NavBar from "@/components/NavBar";

// Navigation-latency fix (2026-09-24) — Production QA found selecting
// a workshop from the listing felt "stuck": with no loading.tsx for
// this route segment, Next.js showed nothing but the old page and the
// thin top-of-viewport progress bar (easy to miss) while this page's
// server-side data fetches were in flight — genuinely slow on an ISR
// cache miss, worse before the sibling fix that parallelized those
// fetches. This gives an immediate, on-brand "something is happening"
// state the instant navigation starts, matching the page's own hero
// layout so it doesn't flash/jump when the real content arrives.
export default function WorkshopDetailLoading() {
  return (
    <main>
      <NavBar />
      <section className="bg-ordift-navy-950 text-white px-4 sm:px-8 py-16 sm:py-20">
        <div className="max-w-4xl mx-auto">
          <p className="font-sans font-semibold uppercase tracking-[0.2em] text-eyebrow lg:text-eyebrow-desktop text-ordift-gold mb-4">
            Workshop
          </p>
          <div className="h-10 sm:h-12 w-2/3 max-w-md rounded bg-white/10 animate-pulse mb-4" aria-hidden="true" />
          <div className="h-6 w-24 rounded-full bg-white/10 animate-pulse" aria-hidden="true" />
        </div>
      </section>
      <section className="bg-white px-4 sm:px-8 py-14 sm:py-20">
        <div className="max-w-4xl mx-auto space-y-3" role="status" aria-live="polite">
          <span className="sr-only">Loading workshop…</span>
          <div className="h-4 w-full max-w-xl rounded bg-black/5 animate-pulse" aria-hidden="true" />
          <div className="h-4 w-5/6 max-w-xl rounded bg-black/5 animate-pulse" aria-hidden="true" />
          <div className="h-4 w-2/3 max-w-xl rounded bg-black/5 animate-pulse" aria-hidden="true" />
        </div>
      </section>
    </main>
  );
}
