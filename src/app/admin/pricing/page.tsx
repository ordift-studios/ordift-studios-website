import type { Metadata } from "next";
import Link from "next/link";
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
  getActiveCorporateHeadshotRates,
  getActiveCorporateTeamTierRates,
  getActiveCorporateMinimumBooking,
  getActiveCorporateRetouchRate,
  getActiveCorporatePriorityDeliveryPercentage,
} from "@/lib/pricing/corporateHeadshotPricing";
import {
  createPersonalSessionRateVersionAction,
  setPricingMarketActiveAction,
  createDiscountCodeAction,
  setDiscountCodeActiveAction,
  createSubjectCategoryMultiplierVersionAction,
  createAdditionalRetouchRateVersionAction,
  applyManualDiscountAction,
  createCorporateHeadshotRateVersionAction,
  createCorporateTeamTierRateVersionAction,
  createCorporateMinimumBookingVersionAction,
  createCorporateRetouchRateVersionAction,
  createCorporatePriorityDeliveryVersionAction,
} from "./actions";
import ManualDiscountForm from "./ManualDiscountForm";

export const metadata: Metadata = {
  title: "Pricing — Ordift Studios Admin",
  robots: { index: false, follow: false },
};

const DURATIONS = [1, 2, 3, 4] as const;

const TABS = [
  { key: "personal-sessions", label: "Personal Sessions" },
  { key: "subjects", label: "Subjects / Groups" },
  { key: "addons", label: "Add-Ons" },
  { key: "corporate", label: "Corporate & Headshots" },
  { key: "discounts", label: "Discounts" },
  { key: "markets", label: "Markets / Overrides" },
] as const;

const CORPORATE_SUBS = [
  { key: "individual", label: "Individual" },
  { key: "executive", label: "Executive" },
  { key: "team", label: "Team Volume" },
  { key: "addons", label: "Add-Ons" },
] as const;

const TEAM_TIERS = [
  { slug: "2-5", label: "2–5 people" },
  { slug: "6-10", label: "6–10 people" },
  { slug: "11-25", label: "11–25 people" },
  { slug: "26-50", label: "26–50 people" },
] as const;

function TabNav({ active }: { active: string }) {
  return (
    <div className="flex flex-wrap gap-2 border-b border-black/10 pb-3">
      {TABS.map((t) => (
        <Link
          key={t.key}
          href={`/admin/pricing?tab=${t.key}`}
          className={`rounded-lg px-4 py-2 font-sans text-body-small ${active === t.key ? "bg-ordift-ink text-white" : "text-ordift-ink-muted hover:text-ordift-ink"}`}
        >
          {t.label}
        </Link>
      ))}
    </div>
  );
}

function CorporateSubNav({ active, market }: { active: string; market?: string }) {
  return (
    <div className="flex flex-wrap gap-2">
      {CORPORATE_SUBS.map((s) => (
        <Link
          key={s.key}
          href={`/admin/pricing?tab=corporate&corpSub=${s.key}${market ? `&market=${market}` : ""}`}
          className={`rounded-lg px-3 py-1.5 font-sans text-caption ${active === s.key ? "bg-ordift-ink text-white" : "border border-black/15 text-ordift-ink-muted"}`}
        >
          {s.label}
        </Link>
      ))}
    </div>
  );
}

function MarketPills({ tab, markets, active, extraQuery }: { tab: string; markets: { slug: string; name: string }[]; active: string; extraQuery?: string }) {
  return (
    <div className="flex flex-wrap gap-2">
      {markets.map((m) => (
        <Link
          key={m.slug}
          href={`/admin/pricing?tab=${tab}${extraQuery ?? ""}&market=${m.slug}`}
          className={`rounded-full border px-4 py-1.5 font-sans text-caption ${active === m.slug ? "border-ordift-gold-pressed bg-ordift-gold-pressed/10 text-ordift-ink" : "border-black/15 text-ordift-ink-muted"}`}
        >
          {m.name}
        </Link>
      ))}
    </div>
  );
}

// Ordift Pricing Engine — Admin UX Refinement (2026-09-06). Presentation
// only: no pricing value, formula, RLS policy, or authorization
// requirement changed from V1/V1.1. Reorganized into a compact, tabbed
// reference-first workspace. Every figure shown still traces to a real,
// versioned database row — nothing hard-coded here.
export default async function AdminPricingPage({ searchParams }: { searchParams: Promise<{ tab?: string; corpSub?: string; market?: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/admin/overview");
  const auth = await authorizeWithSuperAdminOverride(user.id, FINANCE_CAPABILITIES.pricingAdminister);
  if (!auth.ok) redirect("/admin/overview");

  const { tab: tabParam, corpSub: corpSubParam, market: marketParam } = await searchParams;
  const tab = TABS.some((t) => t.key === tabParam) ? tabParam! : "personal-sessions";
  const corpSub = CORPORATE_SUBS.some((s) => s.key === corpSubParam) ? corpSubParam! : "individual";

  const markets = await listAllPricingMarketsForAdmin();
  const activeMarkets = markets.filter((m) => m.active);
  const selectedMarket = activeMarkets.find((m) => m.slug === marketParam) ?? activeMarkets[0];

  const [rates, subjectCategories, discountCodes, retouchRate] = await Promise.all([
    selectedMarket ? getActivePersonalSessionRates(selectedMarket.slug) : Promise.resolve([]),
    listAllSubjectCategories(),
    listAllDiscountCodesForAdmin(user.id),
    selectedMarket ? getActiveAdditionalRetouchRate(selectedMarket.slug) : Promise.resolve(null),
  ]);

  const [corporateHeadshotRates, corporateTeamTierRates, corporateMinimumBooking, corporateRetouchRate, corporatePriorityDeliveryPercentage] =
    tab === "corporate" && selectedMarket
      ? await Promise.all([
          getActiveCorporateHeadshotRates(selectedMarket.slug),
          getActiveCorporateTeamTierRates(selectedMarket.slug),
          getActiveCorporateMinimumBooking(selectedMarket.slug),
          getActiveCorporateRetouchRate(selectedMarket.slug),
          getActiveCorporatePriorityDeliveryPercentage(),
        ])
      : [[], [], null, null, null];

  return (
    <div className="space-y-8">
      <div>
        <p className="font-sans font-semibold uppercase tracking-[0.2em] text-eyebrow text-ordift-gold-pressed mb-2">Admin</p>
        <h1 className="font-serif font-medium text-section-heading lg:text-section-heading-desktop text-ordift-ink">Pricing</h1>
        <p className="font-sans text-body-small text-ordift-ink-muted mt-2">
          Market-based pricing — determined by where the shoot takes place, never by customer nationality or location.
        </p>
      </div>

      <TabNav active={tab} />

      {tab === "personal-sessions" && selectedMarket && (
        <div className="space-y-6">
          <MarketPills tab="personal-sessions" markets={activeMarkets} active={selectedMarket.slug} />

          <section className="rounded-xl border border-black/10 bg-white p-6 space-y-4">
            <h2 className="font-serif font-medium text-body text-ordift-ink">{selectedMarket.name}</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="font-sans text-caption uppercase tracking-wide text-ordift-ink-muted">
                    <th className="pb-2">Duration</th>
                    <th className="pb-2">Base Price (Individual)</th>
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

            <div className="space-y-2 pt-2 border-t border-black/5">
              <p className="font-sans text-caption text-ordift-ink-muted">Edit a duration — current values are prefilled. Saving always creates a new version; it never overwrites the row above, and an unchanged submission saves nothing new.</p>
              {DURATIONS.map((d) => {
                const rate = rates.find((r) => r.durationHours === d);
                return (
                  <details key={d} className="rounded-lg border border-black/10 px-4 py-2">
                    <summary className="cursor-pointer font-sans text-body-small text-ordift-ink select-none">Edit {d}h rate</summary>
                    <form action={createPersonalSessionRateVersionAction} className="grid grid-cols-1 sm:grid-cols-4 gap-3 mt-3">
                      <input type="hidden" name="marketSlug" value={selectedMarket.slug} />
                      <input type="hidden" name="durationHours" value={d} />
                      <input name="priceUsd" type="number" step="0.01" min="0.01" required defaultValue={rate?.priceUsd} placeholder="Base price USD" className="rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small" />
                      <input name="signatureRetouchedImages" type="number" min="0" required defaultValue={rate?.signatureRetouchedImages} placeholder="Signature Retouched" className="rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small" />
                      <input name="professionallyEditedImages" type="number" min="0" required defaultValue={rate?.professionallyEditedImages} placeholder="Professionally Edited" className="rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small" />
                      <button type="submit" className="rounded-lg bg-ordift-ink text-white px-4 py-2 font-sans text-body-small">Save new version</button>
                    </form>
                  </details>
                );
              })}
            </div>
          </section>
        </div>
      )}

      {tab === "subjects" && (
        <section className="rounded-xl border border-black/10 bg-white p-6 space-y-4">
          <h2 className="font-serif font-medium text-body text-ordift-ink">Subject / Group Multipliers</h2>
          <p className="font-sans text-caption text-ordift-ink-muted">Applied against the base duration rate — e.g. Couple = base × 1.20. Not an additional flat fee.</p>
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

          <div className="space-y-2 pt-2 border-t border-black/5">
            <p className="font-sans text-caption text-ordift-ink-muted">Edit a category&rsquo;s multiplier — current value is prefilled. Large Group has no approved multiplier and cannot be edited here; it always routes to a custom quote.</p>
            {subjectCategories.filter((c) => c.slug !== "large_group").map((c) => (
              <details key={c.id} className="rounded-lg border border-black/10 px-4 py-2">
                <summary className="cursor-pointer font-sans text-body-small text-ordift-ink select-none">Edit {c.name} multiplier</summary>
                <form action={createSubjectCategoryMultiplierVersionAction} className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-3">
                  <input type="hidden" name="subjectCategorySlug" value={c.slug} />
                  <input name="priceMultiplier" type="number" step="0.01" min="0.01" required defaultValue={c.priceMultiplier ?? undefined} placeholder="Multiplier, e.g. 1.20" className="rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small" />
                  <button type="submit" className="rounded-lg bg-ordift-ink text-white px-4 py-2 font-sans text-body-small">Save new version</button>
                </form>
              </details>
            ))}
          </div>
        </section>
      )}

      {tab === "addons" && selectedMarket && (
        <div className="space-y-6">
          <MarketPills tab="addons" markets={activeMarkets} active={selectedMarket.slug} />
          <section className="rounded-xl border border-black/10 bg-white p-6 space-y-4">
            <h2 className="font-serif font-medium text-body text-ordift-ink">{selectedMarket.name} — Additional Signature Retouch Rate</h2>
            <p className="font-sans text-caption text-ordift-ink-muted">Per additional Signature Retouched Image beyond a session&rsquo;s included count. Does not apply to Professionally Edited Images — no rate exists for those.</p>
            <p className="font-sans text-body text-ordift-ink">{retouchRate != null ? `$${retouchRate.toFixed(2)} each` : "Not set"}</p>

            <details className="rounded-lg border border-black/10 px-4 py-2">
              <summary className="cursor-pointer font-sans text-body-small text-ordift-ink select-none">Edit rate</summary>
              <form action={createAdditionalRetouchRateVersionAction} className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-3">
                <input type="hidden" name="marketSlug" value={selectedMarket.slug} />
                <input name="pricePerImageUsd" type="number" step="0.01" min="0.01" required defaultValue={retouchRate ?? undefined} placeholder="Price per image USD" className="rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small" />
                <button type="submit" className="rounded-lg bg-ordift-ink text-white px-4 py-2 font-sans text-body-small">Save new version</button>
              </form>
            </details>
          </section>
        </div>
      )}

      {tab === "corporate" && selectedMarket && (
        <div className="space-y-6">
          <CorporateSubNav active={corpSub} market={selectedMarket.slug} />
          <MarketPills tab="corporate" extraQuery={`&corpSub=${corpSub}`} markets={activeMarkets} active={selectedMarket.slug} />

          {(corpSub === "individual" || corpSub === "executive") && (
            <section className="rounded-xl border border-black/10 bg-white p-6 space-y-4">
              {(() => {
                const productSlug = corpSub === "individual" ? "individual_headshot" : "executive_portrait";
                const productLabel = corpSub === "individual" ? "Professional Headshot – Individual" : "Executive Portrait";
                const rate = corporateHeadshotRates.find((r) => r.productSlug === productSlug);
                return (
                  <>
                    <h2 className="font-serif font-medium text-body text-ordift-ink">{selectedMarket.name} — {productLabel}</h2>
                    <div className="flex items-baseline justify-between font-sans text-body-small text-ordift-ink">
                      <span>Current rate</span>
                      <span>{rate ? `$${rate.priceUsd.toFixed(2)}` : "— not set —"}</span>
                    </div>
                    <div className="flex items-baseline justify-between font-sans text-body-small text-ordift-ink">
                      <span>Signature Retouched Images included</span>
                      <span>{rate?.signatureRetouchedImages ?? "—"}</span>
                    </div>
                    <p className="font-sans text-caption text-ordift-ink-muted">
                      {corpSub === "individual" ? "~20–30 min session, 1 look/setup." : "~45–60 min session, up to 2 looks."} High-res + web-ready delivery, private selection workflow where supported.
                    </p>

                    <details className="rounded-lg border border-black/10 px-4 py-2">
                      <summary className="cursor-pointer font-sans text-body-small text-ordift-ink select-none">Edit rate</summary>
                      <form action={createCorporateHeadshotRateVersionAction} className="grid grid-cols-1 sm:grid-cols-4 gap-3 mt-3">
                        <input type="hidden" name="marketSlug" value={selectedMarket.slug} />
                        <input type="hidden" name="productSlug" value={productSlug} />
                        <input name="priceUsd" type="number" step="0.01" min="0.01" required defaultValue={rate?.priceUsd} placeholder="Price USD" className="rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small" />
                        <input name="signatureRetouchedImages" type="number" min="0" required defaultValue={rate?.signatureRetouchedImages} placeholder="Signature Retouched Images" className="rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small" />
                        <button type="submit" className="rounded-lg bg-ordift-ink text-white px-4 py-2 font-sans text-body-small">Save new version</button>
                      </form>
                    </details>
                  </>
                );
              })()}
            </section>
          )}

          {corpSub === "team" && (
            <section className="rounded-xl border border-black/10 bg-white p-6 space-y-4">
              <h2 className="font-serif font-medium text-body text-ordift-ink">{selectedMarket.name} — Team Headshots</h2>
              <p className="font-sans text-caption text-ordift-ink-muted">Per-person rate by team size. 1 Signature Retouched Image per photographed employee. 51+ employees is always a Custom Corporate Proposal — never auto-priced here.</p>
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="font-sans text-caption uppercase tracking-wide text-ordift-ink-muted">
                      <th className="pb-2">Tier</th>
                      <th className="pb-2">Rate per person</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-black/5">
                    {TEAM_TIERS.map((t) => {
                      const tierRate = corporateTeamTierRates.find((r) => r.tierSlug === t.slug);
                      return (
                        <tr key={t.slug} className="font-sans text-body-small text-ordift-ink">
                          <td className="py-2">{t.label}</td>
                          <td className="py-2">{tierRate ? `$${tierRate.pricePerPersonUsd.toFixed(2)}` : "— not set —"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="flex items-baseline justify-between font-sans text-body-small text-ordift-ink pt-2 border-t border-black/5">
                <span>Minimum corporate team booking</span>
                <span>{corporateMinimumBooking != null ? `$${corporateMinimumBooking.toFixed(2)}` : "— not set —"}</span>
              </div>
              <p className="font-sans text-caption text-ordift-ink-muted">Applied when numberOfPeople × per-person rate falls below this amount — the final price is always the greater of the two.</p>

              <div className="space-y-2 pt-2 border-t border-black/5">
                <p className="font-sans text-caption text-ordift-ink-muted">Edit a tier or the minimum — current values are prefilled. Saving always creates a new version.</p>
                {TEAM_TIERS.map((t) => {
                  const tierRate = corporateTeamTierRates.find((r) => r.tierSlug === t.slug);
                  return (
                    <details key={t.slug} className="rounded-lg border border-black/10 px-4 py-2">
                      <summary className="cursor-pointer font-sans text-body-small text-ordift-ink select-none">Edit {t.label} rate</summary>
                      <form action={createCorporateTeamTierRateVersionAction} className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-3">
                        <input type="hidden" name="marketSlug" value={selectedMarket.slug} />
                        <input type="hidden" name="tierSlug" value={t.slug} />
                        <input name="pricePerPersonUsd" type="number" step="0.01" min="0.01" required defaultValue={tierRate?.pricePerPersonUsd} placeholder="Price per person USD" className="rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small" />
                        <button type="submit" className="rounded-lg bg-ordift-ink text-white px-4 py-2 font-sans text-body-small">Save new version</button>
                      </form>
                    </details>
                  );
                })}
                <details className="rounded-lg border border-black/10 px-4 py-2">
                  <summary className="cursor-pointer font-sans text-body-small text-ordift-ink select-none">Edit minimum booking</summary>
                  <form action={createCorporateMinimumBookingVersionAction} className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-3">
                    <input type="hidden" name="marketSlug" value={selectedMarket.slug} />
                    <input name="minimumAmountUsd" type="number" step="0.01" min="0.01" required defaultValue={corporateMinimumBooking ?? undefined} placeholder="Minimum USD" className="rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small" />
                    <button type="submit" className="rounded-lg bg-ordift-ink text-white px-4 py-2 font-sans text-body-small">Save new version</button>
                  </form>
                </details>
              </div>
            </section>
          )}

          {corpSub === "addons" && (
            <div className="space-y-6">
              <section className="rounded-xl border border-black/10 bg-white p-6 space-y-4">
                <h2 className="font-serif font-medium text-body text-ordift-ink">{selectedMarket.name} — Additional Signature Retouch Rate</h2>
                <p className="font-sans text-caption text-ordift-ink-muted">Corporate-specific rate — a separate line item from the Personal Portrait retouch price, by design.</p>
                <p className="font-sans text-body text-ordift-ink">{corporateRetouchRate != null ? `$${corporateRetouchRate.toFixed(2)} each` : "Not set"}</p>

                <details className="rounded-lg border border-black/10 px-4 py-2">
                  <summary className="cursor-pointer font-sans text-body-small text-ordift-ink select-none">Edit rate</summary>
                  <form action={createCorporateRetouchRateVersionAction} className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-3">
                    <input type="hidden" name="marketSlug" value={selectedMarket.slug} />
                    <input name="pricePerImageUsd" type="number" step="0.01" min="0.01" required defaultValue={corporateRetouchRate ?? undefined} placeholder="Price per image USD" className="rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small" />
                    <button type="submit" className="rounded-lg bg-ordift-ink text-white px-4 py-2 font-sans text-body-small">Save new version</button>
                  </form>
                </details>
              </section>

              <section className="rounded-xl border border-black/10 bg-white p-6 space-y-4">
                <h2 className="font-serif font-medium text-body text-ordift-ink">Priority Delivery</h2>
                <p className="font-sans text-caption text-ordift-ink-muted">Global — not market-specific. Accelerated delivery the client must deliberately request; never applied automatically. Locked at 35% of the eligible corporate subtotal (base + additional retouch) per approved policy.</p>
                <p className="font-sans text-body text-ordift-ink">{corporatePriorityDeliveryPercentage != null ? `+${corporatePriorityDeliveryPercentage}%` : "Not set"}</p>

                <details className="rounded-lg border border-black/10 px-4 py-2">
                  <summary className="cursor-pointer font-sans text-body-small text-ordift-ink select-none">Edit percentage</summary>
                  <form action={createCorporatePriorityDeliveryVersionAction} className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-3">
                    <input name="multiplierPercentage" type="number" step="0.01" min="0.01" required defaultValue={corporatePriorityDeliveryPercentage ?? undefined} placeholder="Percentage, e.g. 35" className="rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small" />
                    <button type="submit" className="rounded-lg bg-ordift-ink text-white px-4 py-2 font-sans text-body-small">Save new version</button>
                  </form>
                </details>
              </section>
            </div>
          )}
        </div>
      )}

      {tab === "discounts" && (
        <div className="space-y-6">
          <section className="rounded-xl border border-black/10 bg-white p-6 space-y-4">
            <h2 className="font-serif font-medium text-body text-ordift-ink">Promotional Discount Codes</h2>
            <p className="font-sans text-caption text-ordift-ink-muted">Reusable, client-facing codes — a configured percentage off, with a reason/campaign note. Created inactive by default; activate deliberately when ready.</p>
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
              <input name="reason" required placeholder="Reason / campaign" className="rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small sm:col-span-1" />
              <button type="submit" className="rounded-lg bg-ordift-ink text-white px-4 py-2 font-sans text-body-small">Create (inactive)</button>
            </form>
          </section>

          <section className="rounded-xl border border-black/10 bg-white p-6 space-y-4">
            <h2 className="font-serif font-medium text-body text-ordift-ink">Manual Discount</h2>
            <p className="font-sans text-caption text-ordift-ink-muted">
              A one-off authorized adjustment for a specific enquiry/booking — no code, never available to clients directly. Every application is recorded with the original amount, discount, final amount, your account, your reason, and a timestamp.
            </p>
            <ManualDiscountForm action={applyManualDiscountAction} />
          </section>
        </div>
      )}

      {tab === "markets" && (
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
          <p className="font-sans text-caption text-ordift-ink-muted">Country-specific overrides are not yet configured for any market — the architecture supports mapping a country to its own market later without a code change, but none has been created.</p>
        </section>
      )}
    </div>
  );
}
