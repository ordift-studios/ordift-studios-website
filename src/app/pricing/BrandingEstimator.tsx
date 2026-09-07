"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  calculateBrandingEstimate,
  type BrandingTierSlug,
  type BrandingTurnaround,
  type BrandingPercentageSlug,
  type BrandingScaleSignal,
  type BrandingTierRate,
} from "@/lib/pricing/brandingEstimate";
import { encodePricingHandoff } from "@/lib/enquiry/pricingHandoff";
import { getRecommendationsFor, recommendationHref } from "@/lib/services/crossServiceRecommendations";

type BrandStage = "new" | "existing";

const NEW_BRAND_TIERS: { slug: BrandingTierSlug; label: string; description: string }[] = [
  { slug: "logo_development", label: "Logo", description: "A primary logo, ready to use — the mark itself, not the full system." },
  { slug: "brand_foundations", label: "Strategy", description: "The thinking behind the brand — positioning, personality and messaging direction. Does not include new visuals." },
  { slug: "essential_identity", label: "Essential Identity", description: "A logo plus the essential system: colour palette, typography, and concise guidelines." },
  { slug: "complete_identity", label: "Complete Identity", description: "A full, richly-developed identity: complete logo suite, visual language, key applications, and substantial guidelines." },
  { slug: "strategy_complete_identity", label: "Strategy + Complete Identity", description: "Strategy and Complete Identity together, as one integrated engagement — not the two standalone prices added up." },
];

const EXISTING_BRAND_TIERS: { slug: BrandingTierSlug; label: string; description: string }[] = [
  { slug: "strategic_rebrand", label: "Strategic Rebrand", description: "For an existing brand that needs reassessment — audit, positioning review, and a refreshed or rebuilt identity." },
  { slug: "essential_identity", label: "Essential Identity Refresh", description: "A lighter refresh: logo plus the essential system." },
  { slug: "complete_identity", label: "Complete Identity Refresh", description: "A full identity refresh: complete logo suite, visual language, applications and guidelines." },
];

const TURNAROUND_OPTIONS: { slug: BrandingTurnaround; label: string }[] = [
  { slug: "standard", label: "Standard (included)" },
  { slug: "priority", label: "Priority Scheduling (+25%, subject to availability)" },
  { slug: "custom_confirmation", label: "Extremely Compressed Timeline (Custom Confirmation)" },
];

const SCALE_SIGNAL_OPTIONS: { slug: BrandingScaleSignal; label: string }[] = [
  { slug: "many_stakeholder_groups", label: "Many stakeholder groups need to be involved" },
  { slug: "multiple_business_units", label: "Multiple business units or subsidiaries" },
  { slug: "many_markets", label: "Operates across many markets/territories" },
  { slug: "regulated_high_risk_industry", label: "Regulated or high-risk industry" },
  { slug: "extensive_research_required", label: "Extensive research beyond standard discovery" },
  { slug: "numerous_applications_required", label: "A large number of brand applications" },
  { slug: "complex_brand_architecture", label: "Multiple brands or a house-of-brands system" },
  { slug: "multilingual_complexity", label: "Multilingual identity (e.g. Arabic/English)" },
];

// Ordift Branding & Creative Strategy Pricing V1 (2026-09-07) —
// client-side estimator. New Brand vs Existing Brand is a soft UX
// filter over the same six priced tiers (Custom / Enterprise never
// calls the calculator at all, matching Graphic Design's Packaging/
// Custom pattern). Project-scale questions are pure Creative Review
// signals — they never change the displayed indicative price, only
// whether a review reason is surfaced alongside it.
export default function BrandingEstimator({
  markets,
  tierRatesByMarket,
  revisionMinimumByMarket,
  percentages,
}: {
  markets: { id: string; slug: string; name: string }[];
  tierRatesByMarket: Record<string, BrandingTierRate[]>;
  revisionMinimumByMarket: Record<string, number | null>;
  percentages: Partial<Record<BrandingPercentageSlug, number>>;
}) {
  const [marketSlug, setMarketSlug] = useState(markets[0]?.slug ?? "");
  const [stage, setStage] = useState<BrandStage>("new");
  const [tierSlug, setTierSlug] = useState<BrandingTierSlug>("logo_development");
  const [isCustomEnterprise, setIsCustomEnterprise] = useState(false);
  const [scaleSignals, setScaleSignals] = useState<Set<BrandingScaleSignal>>(new Set());
  const [additionalRevisionRounds, setAdditionalRevisionRounds] = useState(0);
  const [turnaround, setTurnaround] = useState<BrandingTurnaround>("standard");

  const tierOptions = stage === "new" ? NEW_BRAND_TIERS : EXISTING_BRAND_TIERS;
  const tierRates = useMemo(() => tierRatesByMarket[marketSlug] ?? [], [tierRatesByMarket, marketSlug]);
  const revisionMinimumUsd = revisionMinimumByMarket[marketSlug] ?? undefined;

  const estimate = useMemo(() => {
    if (isCustomEnterprise) return null;
    return calculateBrandingEstimate({
      tierSlug,
      tierRates,
      additionalRevisionRounds,
      revisionMinimumUsd,
      scaleSignals: Array.from(scaleSignals),
      turnaround,
      percentages,
    });
  }, [isCustomEnterprise, tierSlug, tierRates, additionalRevisionRounds, revisionMinimumUsd, scaleSignals, turnaround, percentages]);

  const bookingHref = useMemo(() => {
    if (isCustomEnterprise || !estimate || !estimate.ok) return "/book?service=branding";
    const marketName = markets.find((m) => m.slug === marketSlug)?.name ?? marketSlug;
    const tierLabel = tierOptions.find((t) => t.slug === tierSlug)?.label ?? tierSlug;
    const encoded = encodePricingHandoff({
      family: "branding",
      pathway: "branding",
      summaryTitle: `Branding & Creative Strategy — ${tierLabel}`,
      summaryLines: [
        `Market: ${marketName}`,
        `Service level: ${tierLabel}`,
        ...(turnaround !== "standard" ? [`Turnaround: ${TURNAROUND_OPTIONS.find((t) => t.slug === turnaround)?.label}`] : []),
        `Estimated Total: $${estimate.estimatedTotalUsd.toFixed(2)}`,
      ],
    });
    return encoded ? `/book?service=branding&pricing=${encoded}` : "/book?service=branding";
  }, [isCustomEnterprise, estimate, markets, marketSlug, tierOptions, tierSlug, turnaround]);

  const recommendations = getRecommendationsFor("branding");
  const [dismissedRecommendations, setDismissedRecommendations] = useState<Set<string>>(new Set());

  function toggleScaleSignal(signal: BrandingScaleSignal) {
    setScaleSignals((prev) => {
      const next = new Set(prev);
      if (next.has(signal)) next.delete(signal);
      else next.add(signal);
      return next;
    });
  }

  return (
    <div className="rounded-2xl border border-black/10 bg-white p-6 sm:p-8 space-y-6">
      <p className="font-sans text-caption text-ordift-ink-muted">
        Branding is strategic work, not simply Graphic Design — positioning, reusable identity systems, and creative direction that other work builds on.
      </p>

      <div>
        <label className="block font-sans text-body-small font-medium text-ordift-ink mb-2">Where is your brand based?</label>
        <select value={marketSlug} onChange={(e) => setMarketSlug(e.target.value)} className="w-full rounded-lg border border-black/15 px-4 py-2.5 font-sans text-body text-ordift-ink">
          {markets.map((m) => (
            <option key={m.slug} value={m.slug}>{m.name}</option>
          ))}
        </select>
      </div>

      <div>
        <label className="block font-sans text-body-small font-medium text-ordift-ink mb-2">What does your brand need?</label>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => {
              setStage("new");
              setIsCustomEnterprise(false);
              setTierSlug("logo_development");
            }}
            className={`rounded-lg border px-3 py-2 font-sans text-body-small ${stage === "new" && !isCustomEnterprise ? "border-ordift-gold-pressed bg-ordift-gold-pressed/10 text-ordift-ink" : "border-black/15 text-ordift-ink-muted"}`}
          >
            A New Brand
          </button>
          <button
            type="button"
            onClick={() => {
              setStage("existing");
              setIsCustomEnterprise(false);
              setTierSlug("strategic_rebrand");
            }}
            className={`rounded-lg border px-3 py-2 font-sans text-body-small ${stage === "existing" && !isCustomEnterprise ? "border-ordift-gold-pressed bg-ordift-gold-pressed/10 text-ordift-ink" : "border-black/15 text-ordift-ink-muted"}`}
          >
            An Existing Brand
          </button>
        </div>
      </div>

      {!isCustomEnterprise && (
        <div>
          <label className="block font-sans text-body-small font-medium text-ordift-ink mb-2">Service level</label>
          <div className="space-y-2">
            {tierOptions.map((t) => (
              <button key={t.slug} type="button" onClick={() => setTierSlug(t.slug)} className={`w-full text-left rounded-lg border px-3 py-2 font-sans text-body-small ${tierSlug === t.slug ? "border-ordift-gold-pressed bg-ordift-gold-pressed/10 text-ordift-ink" : "border-black/15 text-ordift-ink-muted"}`}>
                <span className="block font-medium text-ordift-ink">{t.label}</span>
                <span className="block text-caption mt-0.5">{t.description}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div>
        <button
          type="button"
          onClick={() => setIsCustomEnterprise((v) => !v)}
          className={`w-full text-left rounded-lg border px-3 py-2 font-sans text-body-small ${isCustomEnterprise ? "border-ordift-gold-pressed bg-ordift-gold-pressed/10 text-ordift-ink" : "border-black/15 text-ordift-ink-muted"}`}
        >
          <span className="block font-medium text-ordift-ink">Custom / Enterprise Brand Programme</span>
          <span className="block text-caption mt-0.5">Enterprise organisation, multiple subsidiaries, brand architecture, naming programme, large-scale rollout, or unusually complex scope — always scoped individually.</span>
        </button>
      </div>

      {isCustomEnterprise ? (
        <div className="rounded-xl bg-ordift-offwhite p-6">
          <p className="font-sans text-body-small text-ordift-ink">Custom / Enterprise Brand Programme work is scoped individually rather than estimated automatically.</p>
          <p className="font-sans text-caption text-ordift-ink-muted mt-2">Request Estimate / Creative Review — no automatic price is generated for this scope.</p>
        </div>
      ) : (
        <>
          <details className="rounded-lg border border-black/10 px-4 py-3">
            <summary className="cursor-pointer font-sans text-body-small font-medium text-ordift-ink select-none">Does any of this apply to your project?</summary>
            <div className="mt-3 space-y-2">
              <p className="font-sans text-caption text-ordift-ink-muted">Any of these may mean this needs Creative Review before a final price is confirmed — the estimate below still shows an indicative figure either way.</p>
              {SCALE_SIGNAL_OPTIONS.map((s) => (
                <label key={s.slug} className="flex items-start gap-2 font-sans text-body-small text-ordift-ink">
                  <input type="checkbox" checked={scaleSignals.has(s.slug)} onChange={() => toggleScaleSignal(s.slug)} className="w-4 h-4 mt-0.5" />
                  <span>{s.label}</span>
                </label>
              ))}
            </div>
          </details>

          <details className="rounded-lg border border-black/10 px-4 py-3">
            <summary className="cursor-pointer font-sans text-body-small font-medium text-ordift-ink select-none">Revisions</summary>
            <div className="mt-3 space-y-3">
              <p className="font-sans text-caption text-ordift-ink-muted">Every project includes 2 revision rounds — refinement of the approved direction, not a restart or a completely new direction.</p>
              <label className="block font-sans text-caption text-ordift-ink-muted">Additional revision rounds (beyond the 2 included)
                <input type="number" min={0} value={additionalRevisionRounds} onChange={(e) => setAdditionalRevisionRounds(Math.max(0, Number(e.target.value)))} className="mt-1 w-full rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small" />
              </label>
            </div>
          </details>

          <div>
            <label className="block font-sans text-body-small font-medium text-ordift-ink mb-2">Timeline</label>
            <select value={turnaround} onChange={(e) => setTurnaround(e.target.value as BrandingTurnaround)} className="w-full rounded-lg border border-black/15 px-4 py-2.5 font-sans text-body text-ordift-ink">
              {TURNAROUND_OPTIONS.map((t) => (
                <option key={t.slug} value={t.slug}>{t.label}</option>
              ))}
            </select>
            <p className="font-sans text-caption text-ordift-ink-muted mt-1">Priority scheduling is never guaranteed automatically — subject to Ordift&rsquo;s actual availability. Ordift does not offer same-day Branding.</p>
          </div>

          <div className="rounded-xl bg-ordift-offwhite p-6">
            {estimate?.ok ? (
              <>
                <div className="flex items-baseline justify-between">
                  <span className="font-sans text-body-small text-ordift-ink-muted">Base service level</span>
                  <span className="font-sans text-body text-ordift-ink">${estimate.baseTierUsd.toFixed(2)}</span>
                </div>
                {estimate.lineItems.map((item, i) => (
                  <div key={i} className="flex items-baseline justify-between mt-1">
                    <span className="font-sans text-body-small text-ordift-ink-muted">{item.label}</span>
                    <span className="font-sans text-body text-ordift-ink">${item.amountUsd.toFixed(2)}</span>
                  </div>
                ))}
                <div className="flex items-baseline justify-between mt-3 pt-3 border-t border-black/10">
                  <span className="font-serif font-medium text-body text-ordift-ink">Estimated Investment</span>
                  <span className="font-serif font-medium text-section-heading text-ordift-ink">${estimate.estimatedTotalUsd.toFixed(2)} USD</span>
                </div>
                {estimate.requiresCreativeReview && (
                  <ul className="mt-3 space-y-1">
                    {estimate.creativeReviewReasons.map((reason, i) => (
                      <li key={i} className="font-sans text-body-small text-ordift-ink">{reason}</li>
                    ))}
                  </ul>
                )}
              </>
            ) : (
              <p className="font-sans text-body-small text-ordift-ink">{estimate && !estimate.ok ? estimate.reason : ""}</p>
            )}
            <p className="font-sans text-caption text-ordift-ink-muted mt-4">
              This is an indicative estimate for the Ordift creative/strategy fee only. Ordift&rsquo;s creative naming research is not legal trademark clearance — formal clearance should be performed by a qualified legal/trademark professional. Additional brand applications, website/digital implementation, original photography or film, extensive copywriting, and physical rollout of an existing identity are scoped separately. Source/working files are not automatically synonymous with copyright assignment.
            </p>
          </div>
        </>
      )}

      {recommendations.filter((r) => !dismissedRecommendations.has(r.label)).length > 0 && (
        <div className="space-y-2">
          <p className="font-sans text-caption uppercase tracking-wide text-ordift-ink-muted">Complete your project</p>
          {recommendations
            .filter((r) => !dismissedRecommendations.has(r.label))
            .map((r) => (
              <div key={r.label} className="flex items-start justify-between gap-3 rounded-lg border border-black/10 px-4 py-3">
                <div>
                  <Link href={recommendationHref(r)} className="font-sans text-body-small text-ordift-ink underline underline-offset-4">{r.label}</Link>
                  <p className="font-sans text-caption text-ordift-ink-muted mt-0.5">{r.description}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setDismissedRecommendations((prev) => new Set(prev).add(r.label))}
                  aria-label="Dismiss recommendation"
                  className="font-sans text-caption text-ordift-ink-muted hover:text-ordift-ink"
                >
                  ✕
                </button>
              </div>
            ))}
        </div>
      )}

      <Link href={bookingHref} className="block text-center rounded-lg bg-ordift-ink text-white px-6 py-3 font-sans text-body-small hover:opacity-90 transition-opacity">
        {!isCustomEnterprise && estimate?.ok ? "Start Your Enquiry" : "Request Estimate"}
      </Link>
    </div>
  );
}
