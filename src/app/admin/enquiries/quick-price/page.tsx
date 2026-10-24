import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser, isStaffOrAdmin, isSuperAdmin } from "@/lib/portal/roles";
import PricingEstimatorPanel, { PRICING_FAMILIES, normalizePricingFamily } from "@/app/pricing/PricingEstimatorPanel";
import PriceNegotiationWorkspace from "./PriceNegotiationWorkspace";
import { getExchangeRateHistory } from "@/lib/payments/currency";
import type { FxEntry } from "@/lib/pricing/indicativeLocal";

export const metadata: Metadata = { title: "Enquiries & Quick Pricing — Ordift Studios Admin", robots: { index: false, follow: false } };

// Enquiries & Quick Pricing (Priority 1). A staff-only, read-only calculator for a live conversation: it reuses the SAME active rate cards,
// markets and governed formulas as the public /pricing page (one shared loader), so an estimate here equals what the customer would see. An
// estimate is NOT a quotation: nothing here creates an enquiry, quotation, booking, payment or payable, and nothing is sent to anyone.
export default async function QuickPricePage({ searchParams }: { searchParams: Promise<{ family?: string }> }) {
  const user = await getCurrentUser();
  if (!user || !isStaffOrAdmin(user)) redirect("/admin/overview");
  const { family: familyParam } = await searchParams;
  const family = normalizePricingFamily(familyParam);
  // Latest governed rate per currency that is already in effect (rates are versioned and append-only).
  const latestFx = async (code: string): Promise<FxEntry> => {
    const h = (await getExchangeRateHistory(code)).find((r) => new Date(r.effectiveFrom).getTime() <= Date.now());
    return h ? { rateToUsd: h.rateToUsd, effectiveFrom: h.effectiveFrom } : null;
  };
  const fx = { QAR: await latestFx("QAR"), GHS: await latestFx("GHS") };

  return (
    <div className="space-y-8 max-w-3xl">
      <div>
        <Link href="/admin/enquiries" className="font-sans text-body-small text-ordift-gold-pressed underline">← All Enquiries</Link>
        <h1 className="mt-3 font-serif font-medium text-section-heading text-ordift-ink">Enquiries &amp; Quick Pricing</h1>
        <p className="mt-2 font-sans text-body-small text-ordift-ink-muted">
          Use this during a call or chat. <strong>Nothing here is saved or sent</strong>, and an estimate is not a quotation. Work down the page: choose the service, calculate the original, revise and compare, preview a proposed discount, copy the summary, then record the enquiry if the client wants to continue.
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
        <h2 id="step2" className="font-serif font-medium text-body text-ordift-ink">2. Calculate, revise, compare and copy</h2>
        <p className="font-sans text-caption text-ordift-ink-muted">Calculate the original in Option A, enter the revised scope in Option B, compare, preview a discount if one is being proposed, choose the preferred option and copy the summary. Everything on this page is temporary and in this tab only.</p>
        <PriceNegotiationWorkspace isSuperAdmin={isSuperAdmin(user)} fx={fx} slots={[0, 1, 2].map((i) => <PricingEstimatorPanel key={i} family={family} />)} />
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
