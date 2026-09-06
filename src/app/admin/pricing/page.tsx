import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/portal/roles";
import { authorizeWithSuperAdminOverride, FINANCE_CAPABILITIES } from "@/lib/organization/authority";
import {
  listAllPricingMarketsForAdmin,
  getActivePersonalSessionRates,
  listAllSubjectCategories,
  getActiveAdditionalRetouchRate,
} from "@/lib/pricing/personalSessionPricing";
import { listAllDiscountCodesForAdmin } from "@/lib/pricing/discounts";
import {
  createPersonalSessionRateVersionAction,
  setPricingMarketActiveAction,
  createDiscountCodeAction,
  setDiscountCodeActiveAction,
  createSubjectCategoryMultiplierVersionAction,
  createAdditionalRetouchRateVersionAction,
  applyManualDiscountAction,
} from "./actions";

export const metadata: Metadata = {
  title: "Pricing — Ordift Studios Admin",
  robots: { index: false, follow: false },
};

const DURATIONS = [1, 2, 3, 4] as const;

// Ordift Pricing Engine V1 / V1.1 (2026-09-06) — this page is the
// authoritative operational reference for the approved pricing
// structure: an authorized Super Admin should be able to see and
// understand the whole current structure here, without reading source
// code or external notes. Every figure shown traces to a real,
// versioned database row (never a hard-coded frontend value) — see
// src/lib/pricing/personalSessionPricing.ts.
export default async function AdminPricingPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/admin/overview");
  const auth = await authorizeWithSuperAdminOverride(user.id, FINANCE_CAPABILITIES.pricingAdminister);
  if (!auth.ok) redirect("/admin/overview");

  const markets = await listAllPricingMarketsForAdmin();
  const activeMarkets = markets.filter((m) => m.active);
  const [ratesByMarketEntries, subjectCategories, discountCodes, retouchRateEntries] = await Promise.all([
    Promise.all(activeMarkets.map(async (m) => [m.slug, await getActivePersonalSessionRates(m.slug)] as const)),
    listAllSubjectCategories(),
    listAllDiscountCodesForAdmin(user.id),
    Promise.all(activeMarkets.map(async (m) => [m.slug, await getActiveAdditionalRetouchRate(m.slug)] as const)),
  ]);
  const ratesBySlug = new Map(ratesByMarketEntries);
  const retouchRateBySlug = new Map(retouchRateEntries);

  return (
    <div className="space-y-12">
      <div>
        <p className="font-sans font-semibold uppercase tracking-[0.2em] text-eyebrow text-ordift-gold-pressed mb-2">Admin</p>
        <h1 className="font-serif font-medium text-section-heading lg:text-section-heading-desktop text-ordift-ink">Pricing</h1>
        <p className="font-sans text-body-small text-ordift-ink-muted mt-2">
          Personal Portrait session rates are market-based — determined by where the shoot takes place, never by customer nationality or location. Corporate, Wedding/Event, and Commercial pricing remain architecturally reserved but inactive until their own rates are approved.
        </p>
      </div>

      {/* 1. Pricing Markets */}
      <section className="rounded-xl border border-black/10 bg-white p-6 space-y-4">
        <h2 className="font-serif font-medium text-body text-ordift-ink">1. Pricing Markets</h2>
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
        <p className="font-sans text-caption text-ordift-ink-muted">Country-specific overrides are not yet configured for any market — the architecture supports them (a future country can be mapped to its own market without a code change) but none has been created.</p>
      </section>

      {/* 2. Duration Rates + 4. Deliverable Counts, per market */}
      {activeMarkets.map((market) => {
        const rates = ratesBySlug.get(market.slug) ?? [];
        return (
          <section key={market.id} className="rounded-xl border border-black/10 bg-white p-6 space-y-4">
            <h2 className="font-serif font-medium text-body text-ordift-ink">2. {market.name} — Duration Rates &amp; Deliverable Counts</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="font-sans text-caption uppercase tracking-wide text-ordift-ink-muted">
                    <th className="pb-2">Duration</th>
                    <th className="pb-2">Base Price (USD, Individual)</th>
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
            <p className="font-sans text-caption text-ordift-ink-muted">Deliverable counts are duration-based only — they do not change with subject/group category.</p>

            <form action={createPersonalSessionRateVersionAction} className="grid grid-cols-2 sm:grid-cols-5 gap-3 pt-3 border-t border-black/5">
              <input type="hidden" name="marketSlug" value={market.slug} />
              <select name="durationHours" required className="rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small">
                {DURATIONS.map((d) => (
                  <option key={d} value={d}>{d}h</option>
                ))}
              </select>
              <input name="priceUsd" type="number" step="0.01" min="0.01" required placeholder="Base price USD" className="rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small" />
              <input name="signatureRetouchedImages" type="number" min="0" required placeholder="Signature Retouched" className="rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small" />
              <input name="professionallyEditedImages" type="number" min="0" required placeholder="Professionally Edited" className="rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small" />
              <button type="submit" className="rounded-lg bg-ordift-ink text-white px-4 py-2 font-sans text-body-small">Save new rate</button>
            </form>
            <p className="font-sans text-caption text-ordift-ink-muted">Saving records a new versioned rate (effective now) — it never overwrites the row above, preserving the meaning of any historical quote already given at the old rate.</p>
          </section>
        );
      })}

      {/* 3. Subject / Group Multipliers */}
      <section className="rounded-xl border border-black/10 bg-white p-6 space-y-4">
        <h2 className="font-serif font-medium text-body text-ordift-ink">3. Subject / Group Multipliers</h2>
        <p className="font-sans text-caption text-ordift-ink-muted">Applied against the base duration rate above — e.g. Couple = base × 1.20. Not an additional flat fee.</p>
        <ul className="divide-y divide-black/5">
          {subjectCategories.map((c) => (
            <li key={c.id} className="flex items-center justify-between py-2.5">
              <span className="font-sans text-body-small text-ordift-ink">{c.name} <span className="text-ordift-ink-muted text-caption">({c.minSubjects}{c.maxSubjects ? `–${c.maxSubjects}` : "+"} subjects)</span></span>
              <span className="font-sans text-caption text-ordift-ink-muted">
                {c.active && c.priceMultiplier !== null ? `${c.priceMultiplier.toFixed(2)}×` : "Custom quote — not yet approved"}
              </span>
            </li>
          ))}
        </ul>
        <form action={createSubjectCategoryMultiplierVersionAction} className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-3 border-t border-black/5">
          <select name="subjectCategorySlug" required className="rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small">
            {subjectCategories.map((c) => (
              <option key={c.slug} value={c.slug}>{c.name}</option>
            ))}
          </select>
          <input name="priceMultiplier" type="number" step="0.01" min="0.01" required placeholder="Multiplier, e.g. 1.20" className="rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small" />
          <button type="submit" className="rounded-lg bg-ordift-ink text-white px-4 py-2 font-sans text-body-small">Save new multiplier</button>
        </form>
        <p className="font-sans text-caption text-ordift-ink-muted">Limited Guest Appearance has no monetary supplement (multiplier 1.00) — one guest may join briefly for a few shared photographs; if they need their own full coverage, the booking should move to Couple or Family / Small Group instead. Large Group has no approved multiplier and always routes to a custom quote.</p>
      </section>

      {/* 5. Additional Signature Retouch Rates */}
      <section className="rounded-xl border border-black/10 bg-white p-6 space-y-4">
        <h2 className="font-serif font-medium text-body text-ordift-ink">5. Additional Signature Retouch Rates</h2>
        <p className="font-sans text-caption text-ordift-ink-muted">Per additional Signature Retouched Image beyond a session&rsquo;s included count. Does not apply to Professionally Edited Images — no rate exists for those.</p>
        <ul className="divide-y divide-black/5">
          {activeMarkets.map((m) => (
            <li key={m.id} className="flex items-center justify-between py-2.5">
              <span className="font-sans text-body-small text-ordift-ink">{m.name}</span>
              <span className="font-sans text-caption text-ordift-ink-muted">
                {retouchRateBySlug.get(m.slug) != null ? `$${retouchRateBySlug.get(m.slug)!.toFixed(2)} each` : "Not set"}
              </span>
            </li>
          ))}
        </ul>
        <form action={createAdditionalRetouchRateVersionAction} className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-3 border-t border-black/5">
          <select name="marketSlug" required className="rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small">
            {activeMarkets.map((m) => (
              <option key={m.slug} value={m.slug}>{m.name}</option>
            ))}
          </select>
          <input name="pricePerImageUsd" type="number" step="0.01" min="0.01" required placeholder="Price per image USD" className="rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small" />
          <button type="submit" className="rounded-lg bg-ordift-ink text-white px-4 py-2 font-sans text-body-small">Save new rate</button>
        </form>
      </section>

      {/* 6. Discount Codes */}
      <section className="rounded-xl border border-black/10 bg-white p-6 space-y-4">
        <h2 className="font-serif font-medium text-body text-ordift-ink">6. Discount Codes</h2>
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
          <input name="code" required placeholder="Code, e.g. WELCOME5" className="rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small" />
          <input name="value" type="number" step="0.01" min="0.01" max="100" required placeholder="Percent off" className="rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small" />
          <input name="reason" required placeholder="Reason" className="rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small sm:col-span-1" />
          <button type="submit" className="rounded-lg bg-ordift-ink text-white px-4 py-2 font-sans text-body-small">Create (inactive)</button>
        </form>
        <p className="font-sans text-caption text-ordift-ink-muted">New codes are created inactive by default — activate deliberately once ready. No code is ever created automatically.</p>
      </section>

      {/* 7. Manual Discount capability */}
      <section className="rounded-xl border border-black/10 bg-white p-6 space-y-4">
        <h2 className="font-serif font-medium text-body text-ordift-ink">7. Manual Discount</h2>
        <p className="font-sans text-caption text-ordift-ink-muted">
          For an authorized, one-off percentage discount on a specific enquiry/booking — never available to clients directly. Every application is recorded with the original amount, discount, final amount, your account, your reason, and a timestamp.
        </p>
        <form action={applyManualDiscountAction} className="grid grid-cols-1 sm:grid-cols-5 gap-3">
          <input name="originalAmountUsd" type="number" step="0.01" min="0.01" required placeholder="Original amount USD" className="rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small" />
          <input name="value" type="number" step="0.01" min="0.01" max="100" required placeholder="Percent off" className="rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small" />
          <input name="referenceId" placeholder="Enquiry/booking reference" className="rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small" />
          <input name="reason" required placeholder="Reason (required)" className="rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small" />
          <button type="submit" className="rounded-lg bg-ordift-ink text-white px-4 py-2 font-sans text-body-small">Apply &amp; record</button>
          <input type="hidden" name="referenceType" value="enquiry" />
        </form>
      </section>
    </div>
  );
}
