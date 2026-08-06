import type { Metadata } from "next";
import Link from "next/link";
import NavBar from "@/components/NavBar";
import Footer from "@/components/Footer";
import Button from "@/components/Button";
import Logo from "@/components/Logo";

export const metadata: Metadata = {
  title: "Page Not Found — Ordift Studios",
  description: "The page you're looking for doesn't exist.",
  robots: { index: false, follow: false },
};

// Handles both notFound() calls thrown from any route segment (e.g. an
// unmatched /work/[slug], /journal/[slug] slug) and genuinely unmatched
// URLs site-wide (Next.js routes any URL matching no real route here
// automatically, per app/not-found's own file-convention behavior — no
// experimental global-not-found flag needed for that). Found missing
// entirely during the 2026-08-05 independent audit (A-10): every
// notFound() call previously fell through to Next's bare default 404.
export default function NotFound() {
  return (
    <main>
      <NavBar />

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
            404
          </p>
          <h1 className="font-serif font-medium text-page-title sm:text-page-title-tablet mb-4">
            We couldn&apos;t find that page.
          </h1>
          <p className="font-sans text-body text-white/70 mb-10 max-w-md">
            The link may be broken, or the page may have moved. Here&apos;s where you can go instead.
          </p>
          <div className="flex flex-wrap gap-3 justify-center">
            <Button href="/" variant="primary">
              Back to Home
            </Button>
            <Button href="/work" variant="secondary" className="border-white/30 text-white hover:border-white/60">
              View Our Work
            </Button>
          </div>
          <p className="font-sans text-body-small text-white/50 mt-10">
            Or{" "}
            <Link
              href="/book"
              className="text-ordift-gold hover:text-ordift-gold-hover underline underline-offset-4"
            >
              get in touch
            </Link>{" "}
            if you were looking for something specific.
          </p>
        </div>
      </section>

      <Footer />
    </main>
  );
}
