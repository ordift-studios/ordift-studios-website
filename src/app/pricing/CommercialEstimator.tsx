"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  calculateCommercialProductionEstimate,
  calculateCatalogueEstimate,
  type CommercialServiceMode,
  type CommercialScopeSlug,
  type CommercialCreativeFeeRate,
  type CatalogueComplexity,
  type CommercialCatalogueVolumeFactor,
  type CommercialCatalogueComplexityFactor,
  type CommercialPostProductionItemSlug,
  type CommercialPostProductionRate,
  type CommercialUsageFactorSlug,
  type CommercialDurationFactorSlug,
  type CommercialTerritoryFactorSlug,
  type CommercialExclusivitySlug,
  type CommercialLicensingFactors,
  type CommercialReviewThreshold,
} from "@/lib/pricing/commercialEstimate";

type ProjectType = "product_ecommerce" | "food_beverage" | "fashion_beauty" | "brand_lifestyle" | "advertising_campaign" | "custom_commercial";
type CatalogueMode = "clean" | "premium" | "styled" | null;

const PROJECT_TYPES: { slug: ProjectType; label: string }[] = [
  { slug: "product_ecommerce", label: "Product / E-Commerce" },
  { slug: "food_beverage", label: "Food & Beverage" },
  { slug: "fashion_beauty", label: "Fashion / Beauty" },
  { slug: "brand_lifestyle", label: "Brand / Lifestyle" },
  { slug: "advertising_campaign", label: "Advertising Campaign" },
  { slug: "custom_commercial", label: "Custom Commercial Production" },
];

const SERVICE_MODES: { slug: CommercialServiceMode; label: string }[] = [
  { slug: "photography", label: "Photography" },
  { slug: "film", label: "Film" },
  { slug: "photography_film", label: "Photography + Film" },
];

const SCOPES: { slug: CommercialScopeSlug; label: string }[] = [
  { slug: "focused", label: "Focused (≤4h)" },
  { slug: "full_day", label: "Full Production Day (≤8h)" },
  { slug: "extended", label: "Extended (≤12h)" },
];

const USAGE_OPTIONS: { slug: CommercialUsageFactorSlug; label: string }[] = [
  { slug: "internal_trade_presentation", label: "Internal / Trade / Presentation" },
  { slug: "website_organic_social", label: "Website + Organic Social" },
  { slug: "pr_editorial_earned_media", label: "PR / Editorial / Earned Media" },
  { slug: "paid_digital_advertising", label: "Paid Digital Advertising" },
  { slug: "print_advertising", label: "Print Advertising" },
  { slug: "paid_digital_print_campaign", label: "Paid Digital + Print Campaign" },
  { slug: "packaging_pos", label: "Packaging / POS" },
  { slug: "ooh_billboard", label: "OOH / Billboard" },
  { slug: "broadcast_streaming_advertising", label: "Broadcast / Streaming Advertising" },
  { slug: "integrated_multimedia_campaign", label: "Integrated Multi-Media Campaign" },
];

const DURATION_OPTIONS: { slug: CommercialDurationFactorSlug | "perpetual"; label: string }[] = [
  { slug: "3_months", label: "3 months" },
  { slug: "6_months", label: "6 months" },
  { slug: "12_months", label: "12 months" },
  { slug: "24_months", label: "24 months" },
  { slug: "36_months", label: "36 months" },
  { slug: "5_years", label: "5 years" },
  { slug: "perpetual", label: "Perpetual (Custom Proposal)" },
];

const TERRITORY_OPTIONS: { slug: CommercialTerritoryFactorSlug; label: string }[] = [
  { slug: "local_city", label: "Local / City" },
  { slug: "national", label: "National" },
  { slug: "regional_multicountry", label: "Regional / Multi-country" },
  { slug: "international", label: "International" },
  { slug: "worldwide", label: "Worldwide" },
];

const EXCLUSIVITY_OPTIONS: { slug: CommercialExclusivitySlug; label: string }[] = [
  { slug: "non_exclusive", label: "Non-exclusive" },
  { slug: "category_exclusive", label: "Category-exclusive" },
  { slug: "full_exclusive", label: "Full-exclusive" },
];

const POSTPRODUCTION_OPTIONS: { slug: CommercialPostProductionItemSlug; label: string }[] = [
  { slug: "additional_finished_image", label: "Additional Finished Image" },
  { slug: "advanced_retouch", label: "Advanced Retouch" },
  { slug: "high_end_retouch", label: "High-End Beauty / Product Retouch" },
  { slug: "creative_composite", label: "Creative Composite" },
  { slug: "cutdown_15s", label: "Additional 15-sec Cutdown" },
  { slug: "cutdown_30s", label: "Additional 30-sec Cutdown" },
  { slug: "alternate_edit_60s", label: "Additional 60-sec Alternate Edit" },
  { slug: "vertical_adaptation", label: "Vertical / Social Adaptation" },
  { slug: "aspect_ratio_adaptation", label: "Aspect-Ratio Adaptation Only" },
  { slug: "caption_master", label: "Subtitle / Caption Master" },
  { slug: "motion_graphics_basic", label: "Basic Motion Graphics Package" },
  { slug: "revision_round", label: "Additional Revision Round" },
];

const REVIEW_STATE_COPY: Record<string, { label: string; className: string }> = {
  normal: { label: "Indicative Estimate", className: "text-ordift-ink-muted" },
  commercial_review: { label: "Subject to Commercial Review", className: "text-ordift-gold-pressed" },
  custom_proposal_required: { label: "Custom Commercial Proposal Required", className: "text-ordift-ink font-medium" },
};

// Ordift Commercial / Advertising Pricing V1 (2026-09-07) — client-side
// estimator, read-only props / pure-calculation shape identical to the
// other three families. Production market and usage territory are
// deliberately independent selections — territory is never derived
// from the shoot market, nationality, IP, or geolocation.
export default function CommercialEstimator({
  markets,
  creativeFeeRatesByMarket,
  catalogueBaseRateByMarket,
  catalogueMinimumByMarket,
  volumeFactors,
  complexityFactors,
  postProductionRates,
  priorityPercentage,
  licensingFloorPercentage,
  licensingFactors,
  reviewThresholdByMarket,
}: {
  markets: { id: string; slug: string; name: string }[];
  creativeFeeRatesByMarket: Record<string, CommercialCreativeFeeRate[]>;
  catalogueBaseRateByMarket: Record<string, number | null>;
  catalogueMinimumByMarket: Record<string, number | null>;
  volumeFactors: CommercialCatalogueVolumeFactor[];
  complexityFactors: CommercialCatalogueComplexityFactor[];
  postProductionRates: CommercialPostProductionRate[];
  priorityPercentage: number | null;
  licensingFloorPercentage: number | null;
  licensingFactors: CommercialLicensingFactors;
  reviewThresholdByMarket: Record<string, CommercialReviewThreshold | null>;
}) {
  const [projectType, setProjectType] = useState<ProjectType>("brand_lifestyle");
  const [catalogueMode, setCatalogueMode] = useState<CatalogueMode>(null);
  const [marketSlug, setMarketSlug] = useState(markets[0]?.slug ?? "");
  const [serviceMode, setServiceMode] = useState<CommercialServiceMode>("photography");
  const [scopeSlug, setScopeSlug] = useState<CommercialScopeSlug>("full_day");
  const [quantity, setQuantity] = useState(10);

  const [productionBudgetUsd, setProductionBudgetUsd] = useState<number | undefined>(undefined);
  const [talentFeeUsd, setTalentFeeUsd] = useState<number | undefined>(undefined);
  const [talentUsageFeeUsd, setTalentUsageFeeUsd] = useState<number | undefined>(undefined);
  const [postProductionSelections, setPostProductionSelections] = useState<Partial<Record<CommercialPostProductionItemSlug, number>>>({});
  const [advancedVfxRequested, setAdvancedVfxRequested] = useState(false);
  const [priorityRequested, setPriorityRequested] = useState(false);

  const [usageSlug, setUsageSlug] = useState<CommercialUsageFactorSlug | "">("");
  const [durationSlug, setDurationSlug] = useState<CommercialDurationFactorSlug | "perpetual" | "">("");
  const [territorySlug, setTerritorySlug] = useState<CommercialTerritoryFactorSlug | "">("");
  const [exclusivitySlug, setExclusivitySlug] = useState<CommercialExclusivitySlug | "">("");
  const [copyrightAssignmentRequested, setCopyrightAssignmentRequested] = useState(false);
  const [requiresBespokeAssessment, setRequiresBespokeAssessment] = useState(false);

  const isCatalogue = projectType === "product_ecommerce" && (catalogueMode === "clean" || catalogueMode === "premium");

  const estimate = useMemo(() => {
    if (isCatalogue && catalogueMode) {
      return calculateCatalogueEstimate({
        quantity,
        complexity: catalogueMode as CatalogueComplexity,
        baseRateUsd: catalogueBaseRateByMarket[marketSlug] ?? null,
        minimumBookingUsd: catalogueMinimumByMarket[marketSlug] ?? null,
        volumeFactors,
        complexityFactors,
        reviewThreshold: reviewThresholdByMarket[marketSlug] ?? null,
      });
    }
    return calculateCommercialProductionEstimate({
      serviceMode,
      scopeSlug,
      creativeFeeRates: creativeFeeRatesByMarket[marketSlug] ?? [],
      postProductionRates,
      postProductionSelections,
      advancedVfxRequested,
      priorityRequested,
      priorityPercentage,
      productionBudgetUsd,
      talentFeeUsd,
      talentUsageFeeUsd,
      usageSlug: usageSlug || undefined,
      durationSlug: durationSlug || undefined,
      territorySlug: territorySlug || undefined,
      exclusivitySlug: exclusivitySlug || undefined,
      copyrightAssignmentRequested,
      licensingFactors,
      licensingFloorPercentage,
      requiresBespokeAssessment,
      reviewThreshold: reviewThresholdByMarket[marketSlug] ?? null,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    isCatalogue, catalogueMode, quantity, marketSlug, serviceMode, scopeSlug, postProductionSelections, advancedVfxRequested, priorityRequested,
    productionBudgetUsd, talentFeeUsd, talentUsageFeeUsd, usageSlug, durationSlug, territorySlug, exclusivitySlug, copyrightAssignmentRequested, requiresBespokeAssessment,
  ]);

  const stateCopy = REVIEW_STATE_COPY[estimate.reviewState];

  return (
    <div className="rounded-2xl border border-black/10 bg-white p-6 sm:p-8 space-y-6">
      <div>
        <label className="block font-sans text-body-small font-medium text-ordift-ink mb-2">Project type</label>
        <select
          value={projectType}
          onChange={(e) => {
            setProjectType(e.target.value as ProjectType);
            setCatalogueMode(null);
          }}
          className="w-full rounded-lg border border-black/15 px-4 py-2.5 font-sans text-body text-ordift-ink"
        >
          {PROJECT_TYPES.map((p) => (
            <option key={p.slug} value={p.slug}>{p.label}</option>
          ))}
        </select>
      </div>

      {projectType === "product_ecommerce" && (
        <div>
          <label className="block font-sans text-body-small font-medium text-ordift-ink mb-2">Product photography type</label>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {(["clean", "premium", "styled"] as const).map((c) => (
              <button key={c} type="button" onClick={() => setCatalogueMode(c)} className={`rounded-lg border px-3 py-2 font-sans text-body-small ${catalogueMode === c ? "border-ordift-gold-pressed bg-ordift-gold-pressed/10 text-ordift-ink" : "border-black/15 text-ordift-ink-muted"}`}>
                {c === "clean" ? "Clean Catalogue" : c === "premium" ? "Premium Product" : "Styled / Creative Product"}
              </button>
            ))}
          </div>
          {catalogueMode === "styled" && <p className="font-sans text-caption text-ordift-ink-muted mt-2">Styled/Creative Product routes to normal Commercial Production below, not the catalogue calculator.</p>}
        </div>
      )}

      <div>
        <label className="block font-sans text-body-small font-medium text-ordift-ink mb-2">Where will the production take place?</label>
        <select value={marketSlug} onChange={(e) => setMarketSlug(e.target.value)} className="w-full rounded-lg border border-black/15 px-4 py-2.5 font-sans text-body text-ordift-ink">
          {markets.map((m) => (
            <option key={m.slug} value={m.slug}>{m.name}</option>
          ))}
        </select>
      </div>

      {isCatalogue ? (
        <div>
          <label className="block font-sans text-body-small font-medium text-ordift-ink mb-2">How many finished images?</label>
          <input type="number" min={1} value={quantity} onChange={(e) => setQuantity(Math.max(0, Number(e.target.value)))} className="w-full rounded-lg border border-black/15 px-4 py-2.5 font-sans text-body text-ordift-ink" />
          <p className="font-sans text-caption text-ordift-ink-muted mt-1">100 or fewer calculates automatically. 101+ requires a Custom Volume Proposal.</p>
        </div>
      ) : (
        <>
          <div>
            <label className="block font-sans text-body-small font-medium text-ordift-ink mb-2">Service</label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {SERVICE_MODES.map((m) => (
                <button key={m.slug} type="button" onClick={() => setServiceMode(m.slug)} className={`rounded-lg border px-3 py-2 font-sans text-body-small ${serviceMode === m.slug ? "border-ordift-gold-pressed bg-ordift-gold-pressed/10 text-ordift-ink" : "border-black/15 text-ordift-ink-muted"}`}>{m.label}</button>
              ))}
            </div>
          </div>

          <div>
            <label className="block font-sans text-body-small font-medium text-ordift-ink mb-2">Production scope</label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {SCOPES.map((s) => (
                <button key={s.slug} type="button" onClick={() => setScopeSlug(s.slug)} className={`rounded-lg border px-3 py-2 font-sans text-body-small ${scopeSlug === s.slug ? "border-ordift-gold-pressed bg-ordift-gold-pressed/10 text-ordift-ink" : "border-black/15 text-ordift-ink-muted"}`}>{s.label}</button>
              ))}
            </div>
          </div>

          <details className="rounded-lg border border-black/10 px-4 py-3">
            <summary className="cursor-pointer font-sans text-body-small font-medium text-ordift-ink select-none">Production &amp; talent (if known)</summary>
            <div className="mt-3 space-y-3">
              <label className="block font-sans text-caption text-ordift-ink-muted">Production budget (studio, crew, styling, location, travel, etc.)
                <input type="number" min={0} value={productionBudgetUsd ?? ""} onChange={(e) => setProductionBudgetUsd(e.target.value === "" ? undefined : Number(e.target.value))} placeholder="Optional — enter if already known" className="mt-1 w-full rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small" />
              </label>
              <label className="block font-sans text-caption text-ordift-ink-muted">Talent fee (if applicable)
                <input type="number" min={0} value={talentFeeUsd ?? ""} onChange={(e) => setTalentFeeUsd(e.target.value === "" ? undefined : Number(e.target.value))} placeholder="Optional" className="mt-1 w-full rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small" />
              </label>
              <label className="block font-sans text-caption text-ordift-ink-muted">Talent usage fee (if applicable)
                <input type="number" min={0} value={talentUsageFeeUsd ?? ""} onChange={(e) => setTalentUsageFeeUsd(e.target.value === "" ? undefined : Number(e.target.value))} placeholder="Optional" className="mt-1 w-full rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small" />
              </label>
              <p className="font-sans text-caption text-ordift-ink-muted">Ordift&rsquo;s creative/production fee does not automatically include supplier-dependent production costs or talent usage rights — these are agreed and confirmed separately.</p>
            </div>
          </details>

          <details className="rounded-lg border border-black/10 px-4 py-3">
            <summary className="cursor-pointer font-sans text-body-small font-medium text-ordift-ink select-none">Post-production add-ons</summary>
            <div className="mt-3 space-y-2">
              {POSTPRODUCTION_OPTIONS.map((item) => {
                const rate = postProductionRates.find((r) => r.itemSlug === item.slug);
                return (
                  <label key={item.slug} className="flex items-center justify-between gap-2 font-sans text-body-small text-ordift-ink">
                    <span>{item.label} {rate ? `(${rate.isFromPrice ? "from " : ""}$${rate.priceUsd.toFixed(0)} each)` : ""}</span>
                    <input
                      type="number"
                      min={0}
                      value={postProductionSelections[item.slug] ?? 0}
                      onChange={(e) => setPostProductionSelections((prev) => ({ ...prev, [item.slug]: Math.max(0, Number(e.target.value)) }))}
                      className="w-20 rounded-lg border border-black/15 px-2 py-1.5 font-sans text-body-small"
                    />
                  </label>
                );
              })}
              <label className="flex items-center gap-2 font-sans text-body-small text-ordift-ink pt-2 border-t border-black/5">
                <input type="checkbox" checked={advancedVfxRequested} onChange={(e) => setAdvancedVfxRequested(e.target.checked)} className="w-4 h-4" />
                Advanced Motion Graphics / VFX (always Custom Proposal)
              </label>
              <label className="flex items-center gap-2 font-sans text-body-small text-ordift-ink">
                <input type="checkbox" checked={priorityRequested} onChange={(e) => setPriorityRequested(e.target.checked)} className="w-4 h-4" />
                Request Priority Post-Production {priorityPercentage != null ? `(+${priorityPercentage}%)` : ""}
              </label>
              <p className="font-sans text-caption text-ordift-ink-muted">Priority applies only to eligible post-production — never to the Creative Fee, licence, or production/talent costs. Subject to availability and confirmation. Emergency/same-day commercial production is always a Custom Proposal.</p>
            </div>
          </details>

          <details className="rounded-lg border border-black/10 px-4 py-3">
            <summary className="cursor-pointer font-sans text-body-small font-medium text-ordift-ink select-none">Usage licence</summary>
            <div className="mt-3 space-y-3">
              <label className="block font-sans text-caption text-ordift-ink-muted">Intended usage
                <select value={usageSlug} onChange={(e) => setUsageSlug(e.target.value as CommercialUsageFactorSlug)} className="mt-1 w-full rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small">
                  <option value="">Select…</option>
                  {USAGE_OPTIONS.map((u) => <option key={u.slug} value={u.slug}>{u.label}</option>)}
                </select>
              </label>
              <label className="block font-sans text-caption text-ordift-ink-muted">Usage duration
                <select value={durationSlug} onChange={(e) => setDurationSlug(e.target.value as CommercialDurationFactorSlug | "perpetual")} className="mt-1 w-full rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small">
                  <option value="">Select…</option>
                  {DURATION_OPTIONS.map((d) => <option key={d.slug} value={d.slug}>{d.label}</option>)}
                </select>
              </label>
              <label className="block font-sans text-caption text-ordift-ink-muted">Usage territory (independent of production market)
                <select value={territorySlug} onChange={(e) => setTerritorySlug(e.target.value as CommercialTerritoryFactorSlug)} className="mt-1 w-full rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small">
                  <option value="">Select…</option>
                  {TERRITORY_OPTIONS.map((t) => <option key={t.slug} value={t.slug}>{t.label}</option>)}
                </select>
              </label>
              <label className="block font-sans text-caption text-ordift-ink-muted">Exclusivity
                <select value={exclusivitySlug} onChange={(e) => setExclusivitySlug(e.target.value as CommercialExclusivitySlug)} className="mt-1 w-full rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small">
                  <option value="">Select…</option>
                  {EXCLUSIVITY_OPTIONS.map((x) => <option key={x.slug} value={x.slug}>{x.label}</option>)}
                </select>
              </label>
              <label className="flex items-center gap-2 font-sans text-body-small text-ordift-ink pt-2 border-t border-black/5">
                <input type="checkbox" checked={copyrightAssignmentRequested} onChange={(e) => setCopyrightAssignmentRequested(e.target.checked)} className="w-4 h-4" />
                This project requires copyright assignment / outright ownership (always Custom Proposal)
              </label>
              <label className="flex items-center gap-2 font-sans text-body-small text-ordift-ink">
                <input type="checkbox" checked={requiresBespokeAssessment} onChange={(e) => setRequiresBespokeAssessment(e.target.checked)} className="w-4 h-4" />
                This project involves celebrity/public-figure talent, a major international campaign, multi-country/complex production, or another factor requiring bespoke assessment
              </label>
            </div>
          </details>
        </>
      )}

      <div className="rounded-xl bg-ordift-offwhite p-6">
        <p className={`font-sans text-caption uppercase tracking-wide mb-2 ${stateCopy.className}`}>{stateCopy.label}</p>
        {estimate.creativeFeeUsd != null && (
          <div className="flex items-baseline justify-between">
            <span className="font-sans text-body-small text-ordift-ink-muted">Creative Fee</span>
            <span className="font-sans text-body text-ordift-ink">${estimate.creativeFeeUsd.toFixed(2)}</span>
          </div>
        )}
        {estimate.catalogueFeeUsd != null && (
          <div className="flex items-baseline justify-between">
            <span className="font-sans text-body-small text-ordift-ink-muted">Catalogue Production</span>
            <span className="font-sans text-body text-ordift-ink">${estimate.catalogueFeeUsd.toFixed(2)}</span>
          </div>
        )}
        {estimate.lineItems.map((item, i) => (
          <div key={i} className="flex items-baseline justify-between mt-1">
            <span className="font-sans text-body-small text-ordift-ink-muted">{item.label}</span>
            <span className="font-sans text-body text-ordift-ink">${item.amountUsd.toFixed(2)}</span>
          </div>
        ))}
        <div className="flex items-baseline justify-between mt-3 pt-3 border-t border-black/10">
          <span className="font-serif font-medium text-body text-ordift-ink">Estimated Commercial Investment</span>
          <span className="font-serif font-medium text-section-heading text-ordift-ink">${estimate.estimatedTotalUsd.toFixed(2)} USD</span>
        </div>
        {estimate.customReasons.length > 0 && (
          <ul className="mt-3 space-y-1">
            {estimate.customReasons.map((reason, i) => (
              <li key={i} className="font-sans text-body-small text-ordift-ink">{reason}</li>
            ))}
          </ul>
        )}
        <p className="font-sans text-caption text-ordift-ink-muted mt-4">
          This is an indicative commercial estimate, not a final contract. Usage rights depend on the agreed media, duration, territory and exclusivity. Supplier-dependent production costs may require confirmation, and talent usage may be priced separately. Source files remain available by request — perpetual rights or copyright transfer always require a Custom Proposal. AI-Assisted Creative Production is available by request; fully synthetic or extensive generative campaign production is assessed individually.
        </p>
      </div>

      <Link href="/book?service=general" className="block text-center rounded-lg bg-ordift-ink text-white px-6 py-3 font-sans text-body-small hover:opacity-90 transition-opacity">
        {estimate.reviewState === "custom_proposal_required" ? "Request a Custom Proposal" : "Start Your Enquiry"}
      </Link>
    </div>
  );
}
