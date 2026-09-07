import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/portal/roles";
import { authorizeWithSuperAdminOverride, STRATEGY_CAPABILITIES } from "@/lib/organization/authority";
import { listOpportunitiesForAdmin, listPartnershipTypes, type PartnershipOpportunityStatus } from "@/lib/partnerships/opportunities";
import { listActivePricingMarkets } from "@/lib/pricing/personalSessionPricing";
import PartnershipsSubNav from "../PartnershipsSubNav";
import { createOpportunityAction } from "../actions";

export const metadata: Metadata = {
  title: "Opportunities — Partnerships — Ordift Studios Admin",
  robots: { index: false, follow: false },
};

export const STATUS_OPTIONS: { slug: PartnershipOpportunityStatus; label: string }[] = [
  { slug: "opportunity", label: "Opportunity" },
  { slug: "qualification", label: "Qualification" },
  { slug: "value_assessment", label: "Value Assessment" },
  { slug: "proposed_terms", label: "Proposed Terms" },
  { slug: "internal_review", label: "Internal Review" },
  { slug: "decision", label: "Decision" },
  { slug: "agreement", label: "Agreement" },
  { slug: "signatures", label: "Signatures" },
  { slug: "active", label: "Active" },
  { slug: "deliverables", label: "Deliverables" },
  { slug: "completion", label: "Completion" },
  { slug: "outcome_review", label: "Outcome Review" },
];

export function statusLabel(slug: string): string {
  return STATUS_OPTIONS.find((s) => s.slug === slug)?.label ?? slug;
}

export default async function PartnershipOpportunitiesPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/admin/overview");
  const auth = await authorizeWithSuperAdminOverride(user.id, STRATEGY_CAPABILITIES.partnershipOpportunityAdminister);
  if (!auth.ok) redirect("/admin/overview");

  const { status: statusParam } = await searchParams;
  const statusFilter = STATUS_OPTIONS.some((s) => s.slug === statusParam) ? (statusParam as PartnershipOpportunityStatus) : undefined;

  const [opportunities, types, markets] = await Promise.all([listOpportunitiesForAdmin(user.id, { status: statusFilter }), listPartnershipTypes(), listActivePricingMarkets()]);
  const typeLabelById = new Map(types.map((t) => [t.id, t.label]));

  return (
    <div className="space-y-8">
      <div>
        <p className="font-sans font-semibold uppercase tracking-[0.2em] text-eyebrow text-ordift-gold-pressed mb-2">Admin · Partnerships</p>
        <h1 className="font-serif font-medium text-section-heading lg:text-section-heading-desktop text-ordift-ink">Opportunities</h1>
      </div>

      <PartnershipsSubNav active="opportunities" />

      <section className="rounded-xl border border-black/10 bg-white p-6 space-y-4">
        <h2 className="font-serif font-medium text-body text-ordift-ink">New Opportunity</h2>
        <form action={createOpportunityAction} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <select name="partnershipTypeId" required defaultValue="" className="rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small">
            <option value="" disabled>Partnership type</option>
            {types.map((t) => (
              <option key={t.id} value={t.id}>{t.label}</option>
            ))}
          </select>
          <input name="counterpartName" required placeholder="Counterpart name" className="rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small" />
          <input name="counterpartOrganisation" placeholder="Organisation / brand (optional)" className="rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small" />
          <select name="marketSlug" defaultValue="" className="rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small">
            <option value="">Market (optional)</option>
            {markets.map((m) => (
              <option key={m.slug} value={m.slug}>{m.name}</option>
            ))}
          </select>
          <input name="counterpartContactEmail" type="email" placeholder="Contact email (optional)" className="rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small" />
          <input name="counterpartContactPhone" placeholder="Contact phone (optional)" className="rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small" />
          <textarea name="summary" placeholder="Collaboration idea / summary" rows={2} className="rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small sm:col-span-2" />
          <textarea name="notes" placeholder="Internal notes (never public)" rows={2} className="rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small sm:col-span-2" />
          <button type="submit" className="rounded-lg bg-ordift-ink text-white px-4 py-2 font-sans text-body-small sm:col-span-2">Create Opportunity</button>
        </form>
      </section>

      <section className="rounded-xl border border-black/10 bg-white p-6 space-y-4">
        <h2 className="font-serif font-medium text-body text-ordift-ink">All Opportunities ({opportunities.length})</h2>
        <div className="flex flex-wrap gap-2">
          <Link href="/admin/partnerships/opportunities" className={`rounded-full border px-3 py-1 font-sans text-caption ${!statusParam ? "border-ordift-gold-pressed bg-ordift-gold-pressed/10 text-ordift-ink" : "border-black/15 text-ordift-ink-muted"}`}>All</Link>
          {STATUS_OPTIONS.map((s) => (
            <Link key={s.slug} href={`/admin/partnerships/opportunities?status=${s.slug}`} className={`rounded-full border px-3 py-1 font-sans text-caption ${statusParam === s.slug ? "border-ordift-gold-pressed bg-ordift-gold-pressed/10 text-ordift-ink" : "border-black/15 text-ordift-ink-muted"}`}>{s.label}</Link>
          ))}
        </div>
        {opportunities.length === 0 ? (
          <p className="font-sans text-body-small text-ordift-ink-muted rounded-lg border border-dashed border-black/15 px-4 py-6 text-center">No partnership opportunities yet — use the form above to create the first one.</p>
        ) : (
          <ul className="divide-y divide-black/5">
            {opportunities.map((o) => (
              <li key={o.id}>
                <Link href={`/admin/partnerships/opportunities/${o.id}`} className="flex items-center justify-between gap-4 py-3 hover:bg-black/[0.02] px-2 -mx-2 rounded">
                  <div>
                    <p className="font-sans text-body-small font-medium text-ordift-ink">{o.counterpartName}{o.counterpartOrganisation ? ` — ${o.counterpartOrganisation}` : ""}</p>
                    <p className="font-sans text-caption text-ordift-ink-muted">{typeLabelById.get(o.partnershipTypeId) ?? "Unknown type"} · {statusLabel(o.status)}</p>
                  </div>
                  <span className="font-sans text-caption text-ordift-ink underline underline-offset-4 shrink-0">View / Manage →</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
