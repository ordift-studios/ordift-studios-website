import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/portal/roles";
import { authorizeWithSuperAdminOverride, FINANCE_CAPABILITIES } from "@/lib/organization/authority";
import { listAllPricingMarketsForAdmin, getActivePersonalSessionRates, listAllSubjectCategories } from "@/lib/pricing/personalSessionPricing";
import { listAllDiscountCodesForAdmin } from "@/lib/pricing/discounts";
import { createPersonalSessionRateVersionAction, setPricingMarketActiveAction, createDiscountCodeAction, setDiscountCodeActiveAction } from "./actions";

export const metadata: Metadata = {
  title: "Pricing — Ordift Studios Admin",
  robots: { index: false, follow: false },
};

const DURATIONS = [1, 2, 3, 4] as const;

export default async function AdminPricingPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/admin/overview");
  const auth = await authorizeWithSuperAdminOverride(user.id, FINANCE_CAPABILITIES.pricingAdminister);
  if (!auth.ok) redirect("/admin/overview");

  const markets = await listAllPricingMarketsForAdmin();
  const [ratesByMarket, subjectCategories, discountCodes] = await Promise.all([
    Promise.all(markets.filter((m) => m.active).map(async (m) => [m.slug, await getActivePersonalSessionRates(m.slug)] as const)),
    listAllSubjectCategories(),
    listAllDiscountCodesForAdmin(user.id),
  ]);
  const ratesBySlug = new Map(ratesByMarket);

  return (
    <div className="space-y-12">
      <div>
        <p className="font-sans font-semibold uppercase tracking-[0.2em] text-eyebrow text-ordift-gold-pressed mb-2">Admin</p>
        <h1 className="font-serif font-medium text-section-heading lg:text-section-heading-desktop text-ordift-ink">Pricing</h1>
        <p className="font-sans text-body-small text-ordift-ink-muted mt-2">
          Personal Portrait session rates are market-based — determined by where the shoot takes place, never by customer nationality or location. Corporate, Wedding/Event, and Commercial pricing remain architecturally reserved but inactive until their own rates are approved.
        </p>
      </div>

      <section className="rounded-xl border border-black/10 bg-white p-6 space-y-4">
        <h2 className="font-serif font-medium text-body text-ordift-ink">Pricing Markets</h2>
        <ul className="divide-y divide-black/5">
          {markets.map((m) => (
            <li key={m.id} className="flex items-center justify-between py-2.5">
              <span className={`font-sans text-body-small ${m.active ? "text-ordift-ink" : "text-ordift-ink-muted"}`}>
                {m.name} {!m.active && <span className="text-caption">(inactive — no approved rates)</span>}
              </span>
              <form action={setPricingMarketActiveAction}>
                <input type="hidden" name="marketSlug" value={m.slug} />
                <input type="hidden" name="active" value={String(m.active)} />
                <button type="submit" className="font-sans text-caption text-ordift-gold-pressed underline underline-offset-4">
                  {m.active ? "Deactivate" : "Activate"}
                </button>
              </form>
            </li>
          ))}
        </ul>
      </section>

      {markets.filter((m) => m.active).map((market) => {
        const rates = ratesBySlug.get(market.slug) ?? [];
        return (
          <section key={market.id} className="rounded-xl border border-black/10 bg-white p-6 space-y-4">
            <h2 className="font-serif font-medium text-body text-ordift-ink">{market.name} — Personal Session Rates</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="font-sans text-caption uppercase tracking-wide text-ordift-ink-muted">
                    <th className="pb-2">Duration</th>
                    <th className="pb-2">Price (USD)</th>
                    <th className="pb-2">Signature Retouched</th>
                    <th className="pb-2">Professionally Edited</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-black/5">
                  {DURATIONS.map((d) => {
                    const rate = rates.find((r) => r.durationHours === d);
                    return (
                      <tr key={d} className="font-sans text-body-small text-ordift-ink">
                        <td className="py-2">{d} hour{d > 1 ? "s" : ""}</td>
                        <td className="py-2">{rate ? `$${rate.priceUsd.toFixed(2)}` : "— not set —"}</td>
                        <td className="py-2">{rate?.signatureRetouchedImages ?? "—"}</td>
                        <td className="py-2">{rate?.professionallyEditedImages ?? "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <form action={createPersonalSessionRateVersionAction} className="grid grid-cols-2 sm:grid-cols-5 gap-3 pt-3 border-t border-black/5">
              <input type="hidden" name="marketSlug" value={market.slug} />
              <select name="durationHours" required className="rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small">
                {DURATIONS.map((d) => (
                  <option key={d} value={d}>{d}h</option>
                ))}
              </select>
              <input name="priceUsd" type="number" step="0.01" min="0.01" required placeholder="Price USD" className="rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small" />
              <input name="signatureRetouchedImages" type="number" min="0" required placeholder="Signature Retouched" className="rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small" />
              <input name="professionallyEditedImages" type="number" min="0" required placeholder="Professionally Edited" className="rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small" />
              <button type="submit" className="rounded-lg bg-ordift-ink text-white px-4 py-2 font-sans text-body-small">Save new rate</button>
            </form>
            <p className="font-sans text-caption text-ordift-ink-muted">Saving records a new versioned rate (effective now) — it never overwrites the row above, matching this platform&rsquo;s existing exchange-rate history pattern.</p>
          </section>
        );
      })}

      <section className="rounded-xl border border-black/10 bg-white p-6 space-y-4">
        <h2 className="font-serif font-medium text-body text-ordift-ink">Subject / Group Categories</h2>
        <ul className="divide-y divide-black/5">
          {subjectCategories.map((c) => (
            <li key={c.id} className="flex items-center justify-between py-2.5">
              <span className="font-sans text-body-small text-ordift-ink">{c.name}</span>
              <span className="font-sans text-caption text-ordift-ink-muted">
                {c.active && c.supplementUsd !== null ? `+$${c.supplementUsd.toFixed(2)}` : "Custom quote — not yet approved"}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-xl border border-black/10 bg-white p-6 space-y-4">
        <h2 className="font-serif font-medium text-body text-ordift-ink">Discount Codes</h2>
        {discountCodes.length === 0 ? (
          <p className="font-sans text-body-small text-ordift-ink-muted">None created yet.</p>
        ) : (
          <ul className="divide-y divide-black/5">
            {discountCodes.map((d) => (
              <li key={d.id} className="flex items-center justify-between py-2.5">
                <span className={`font-sans text-body-small ${d.active ? "text-ordift-ink" : "text-ordift-ink-muted line-through"}`}>
                  {d.code} — {d.value}% off
                </span>
                <form action={setDiscountCodeActiveAction}>
                  <input type="hidden" name="discountCodeId" value={d.id} />
                  <input type="hidden" name="active" value={String(d.active)} />
                  <button type="submit" className="font-sans text-caption text-ordift-gold-pressed underline underline-offset-4">
                    {d.active ? "Deactivate" : "Activate"}
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
        <form action={createDiscountCodeAction} className="grid grid-cols-1 sm:grid-cols-4 gap-3 pt-3 border-t border-black/5">
          <input name="code" required placeholder="Code, e.g. WELCOME10" className="rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small" />
          <input name="value" type="number" step="0.01" min="0.01" max="100" required placeholder="Percent off" className="rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small" />
          <input name="reason" required placeholder="Reason" className="rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small sm:col-span-1" />
          <button type="submit" className="rounded-lg bg-ordift-ink text-white px-4 py-2 font-sans text-body-small">Create (inactive)</button>
        </form>
        <p className="font-sans text-caption text-ordift-ink-muted">New codes are created inactive by default — activate deliberately once ready.</p>
      </section>
    </div>
  );
}
