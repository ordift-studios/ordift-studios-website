import Link from "next/link";

// The two areas of the administrative Pricing workspace. "Service Pricing" is this page (the existing selling-rate tables and their editing controls, unchanged below).
// "Rate Card" opens the existing rate card builder — the single source of truth for rate card drafts, previews, approval and editions; nothing of it is duplicated here.
// The Rate Card card is shown only to Super Admin (the builder itself is Super Admin-only and re-checks the role on every request); it contains no data and reads nothing.
export const RATE_CARD_HREF = "/admin/pricing/rate-card";

export default function PricingAreas({ showRateCard }: { showRateCard: boolean }) {
  if (!showRateCard) return null;
  return (
    <section aria-label="Pricing areas" className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <div aria-current="page" className="rounded-xl border-2 border-ordift-gold bg-white p-5 space-y-1.5">
        <p className="font-sans text-caption font-semibold uppercase tracking-wide text-ordift-gold-pressed">You are here</p>
        <h2 className="font-serif font-medium text-body text-ordift-ink">Service Pricing</h2>
        <p className="font-sans text-body-small text-ordift-ink-muted">Manage the existing selling rates: markets, categories, durations, packages and their editing controls (below).</p>
      </div>
      <Link href={RATE_CARD_HREF} className="group rounded-xl border border-black/10 bg-white p-5 space-y-1.5 hover:border-ordift-gold focus-visible:outline focus-visible:outline-2 focus-visible:outline-ordift-gold">
        <p className="font-sans text-caption font-semibold uppercase tracking-wide text-ordift-gold-pressed">Branded PDF</p>
        <h2 className="font-serif font-medium text-body text-ordift-ink">Rate Card</h2>
        <p className="font-sans text-body-small text-ordift-ink-muted">Create a rate card draft, open saved drafts, preview and download draft PDFs, and review approval status and approved editions.</p>
        <span className="inline-block font-sans text-caption font-semibold text-ordift-gold-pressed underline underline-offset-4 group-hover:text-ordift-ink">Open the Rate Card Builder →</span>
      </Link>
    </section>
  );
}
