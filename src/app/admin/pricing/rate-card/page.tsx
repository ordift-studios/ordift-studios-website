import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser, isSuperAdmin } from "@/lib/portal/roles";
import { getEdition, listEditions } from "@/lib/pdf/rateCard/editions";
import { listActivePricingMarkets } from "@/lib/pricing/personalSessionPricing";
import { listOrdinaryContractingCandidates } from "@/lib/organization/entityRegistrations";
import RateCardAdmin from "./RateCardAdmin";

export const metadata: Metadata = { title: "Rate card editions — Ordift Studios Admin", robots: { index: false, follow: false } };

// Standalone, general rate card (never a personalised quotation). Super Admin only. Drafts are editable and watermarked; approval freezes an edition; only an approved edition downloads without the watermark.
export default async function RateCardPage({ searchParams }: { searchParams: Promise<{ id?: string }> }) {
  const user = await getCurrentUser();
  if (!user || !isSuperAdmin(user)) redirect("/admin/overview");
  const { id } = await searchParams;
  const today = new Date().toISOString().slice(0, 10);
  const [editions, markets, cands, selected] = await Promise.all([listEditions(user.id), listActivePricingMarkets(), listOrdinaryContractingCandidates(user.id, today), id ? getEdition(user.id, id) : Promise.resolve(null)]);
  return (
    <main style={{ maxWidth: 1180, margin: "24px auto", padding: "0 16px" }}>
      <p style={{ margin: "0 0 8px" }}><Link href="/admin/pricing" style={{ color: "#8e7736", fontWeight: 600 }}>← Pricing</Link></p>
      <RateCardAdmin
        today={today} editions={editions} markets={markets.map((m) => ({ slug: m.slug, name: m.name }))} entities={cands.candidates.map((c) => ({ id: c.entityId, name: c.name, jurisdiction: c.jurisdiction }))}
        selected={selected && selected.ok ? { edition: selected.edition, integrity: selected.integrity } : null} selectedError={selected && !selected.ok ? selected.error : null}
      />
    </main>
  );
}
