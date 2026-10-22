import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser, isStaffOrAdmin } from "@/lib/portal/roles";
import PricingEstimatorPanel, { PRICING_FAMILIES, normalizePricingFamily } from "@/app/pricing/PricingEstimatorPanel";
import ClientSummaryBuilder from "./ClientSummaryBuilder";

export const metadata: Metadata = { title: "Enquiries & Quick Pricing — Ordift Studios Admin", robots: { index: false, follow: false } };

// Enquiries & Quick Pricing (Priority 1). A staff-only, read-only calculator for a live conversation: it reuses the SAME active rate cards,
// markets and governed formulas as the public /pricing page (one shared loader), so an estimate here equals what the customer would see. An
// estimate is NOT a quotation: nothing here creates an enquiry, quotation, booking, payment or payable, and nothing is sent to anyone.
export default async function QuickPricePage({ searchParams }: { searchParams: Promise<{ family?: string }> }) {
  const user = await getCurrentUser();
  if (!user || !isStaffOrAdmin(user)) redirect("/admin/overview");
  const { family: familyParam } = await searchParams;
  const family = normalizePricingFamily(familyParam);

  return (
    <div className="space-y-8 max-w-3xl">
      <div>
        <Link href="/admin/enquiries" className="font-sans text-body-small text-ordift-gold-pressed underline">← All Enquiries</Link>
        <h1 className="mt-3 font-serif font-medium text-section-heading text-ordift-ink">Enquiries &amp; Quick Pricing</h1>
        <p className="mt-2 font-sans text-body-small text-ordift-ink-muted">
          Use this during a call or chat. <strong>Nothing here is saved or sent</strong>, and an estimate is not a quotation. Work down the page: choose the service, calculate and revise the options, copy a summary, then record the enquiry if the client wants to continue.
        </p>
      </div>

      <section aria-labelledby="step1" className="space-y-3">
        <h2 id="step1" className="font-serif font-medium text-body text-ordift-ink">1. Choose the service</h2>
        <div className="flex flex-wrap gap-2">
          {PRICING_FAMILIES.map((f) => (
            <Link key={f.key} href={`/admin/enquiries/quick-price?family=${f.key}`} className={`rounded-full border px-4 py-2 font-sans text-body-small ${family === f.key ? "border-ordift-gold-pressed bg-ordift-gold-pressed/10 text-ordift-ink" : "border-black/15 text-ordift-ink-muted"}`}>
              {f.label}
            </Link>
          ))}
        </div>
        <p className="font-sans text-caption text-ordift-ink-muted">Crew Support is priced from its own rate card (Pricing → Crew Support rates) and booked through the Crew Support request workflow, not here. Qatar and Ghana prices come from each market&apos;s own approved rate card; choose the market inside the calculator. A rate that is not published is shown as unavailable, never as zero.</p>
      </section>

      <section aria-labelledby="step2" className="space-y-3">
        <h2 id="step2" className="font-serif font-medium text-body text-ordift-ink">2. Calculate and revise</h2>
        <p className="font-sans text-caption text-ordift-ink-muted">Change the scope in the calculator to compare options (for example fewer outfits or a shorter session) and note each figure. Discounts are applied only through the governed quotation step, not here.</p>
        <div className="rounded-xl border border-black/10 bg-white p-4 sm:p-6">
          <PricingEstimatorPanel family={family} />
        </div>
      </section>

      <section aria-labelledby="step3" className="space-y-3">
        <h2 id="step3" className="sr-only">3. Summary</h2>
        <ClientSummaryBuilder />
      </section>

      <section aria-labelledby="step4" className="space-y-3 rounded-xl border border-black/10 bg-white p-5">
        <h2 id="step4" className="font-serif font-medium text-body text-ordift-ink">4. If the client wants to continue</h2>
        <ul className="list-disc pl-5 font-sans text-body-small text-ordift-ink-muted space-y-1">
          <li><Link href="/admin/enquiries/new" className="underline text-ordift-ink">Record this as an enquiry</Link> (channel, contact, notes). It creates the ordinary enquiry only; no email, quotation or booking.</li>
          <li><Link href="/admin/enquiries" className="underline text-ordift-ink">Open the enquiries register</Link> to follow up, then raise the formal quotation and booking from the enquiry.</li>
          <li><Link href="/admin/portfolio" className="underline text-ordift-ink">Portfolio</Link> for examples of previous work.</li>
        </ul>
      </section>
    </div>
  );
}
