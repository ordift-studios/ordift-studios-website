"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  calculateGraphicDesignEstimate,
  type GraphicDesignDeliverableSlug,
  type GraphicDesignComplexity,
  type GraphicDesignTurnaround,
  type GraphicDesignDeliverableRate,
  type GraphicDesignComplexityFactor,
  type GraphicDesignAddonSlug,
  type GraphicDesignPercentageSlug,
} from "@/lib/pricing/graphicDesignEstimate";
import { encodePricingHandoff } from "@/lib/enquiry/pricingHandoff";
import { getRecommendationsFor, recommendationHref } from "@/lib/services/crossServiceRecommendations";

type Category = "marketing" | "social" | "print" | "presentation" | "packaging" | "custom";

const CATEGORIES: { slug: Category; label: string }[] = [
  { slug: "marketing", label: "Marketing & Promotional Design" },
  { slug: "social", label: "Social & Digital Design" },
  { slug: "print", label: "Print & Editorial Design" },
  { slug: "presentation", label: "Presentation Design" },
  { slug: "packaging", label: "Packaging & Product Graphics" },
  { slug: "custom", label: "Custom / Complex Design" },
];

const DELIVERABLES_BY_CATEGORY: Record<"marketing" | "social" | "print" | "presentation", { slug: GraphicDesignDeliverableSlug; label: string }[]> = {
  marketing: [
    { slug: "flyer_poster", label: "Flyer / Poster" },
    { slug: "digital_ad", label: "Digital Ad / Promotional Artwork" },
  ],
  social: [
    { slug: "social_single", label: "Social Media — Single Design" },
    { slug: "social_set_5", label: "Social Media Set — 5 Designs" },
    { slug: "social_set_10", label: "Social Media Set — 10 Designs" },
  ],
  print: [{ slug: "brochure", label: "Brochure / Company Profile" }],
  presentation: [{ slug: "presentation", label: "Presentation" }],
};

const COMPLEXITY_OPTIONS: { slug: GraphicDesignComplexity; label: string }[] = [
  { slug: "standard", label: "Standard" },
  { slug: "enhanced", label: "Enhanced" },
  { slug: "bespoke", label: "Bespoke / Art-Directed" },
];

const TURNAROUND_OPTIONS: { slug: GraphicDesignTurnaround; label: string }[] = [
  { slug: "standard", label: "Standard (included)" },
  { slug: "priority", label: "Priority (+30%)" },
  { slug: "urgent", label: "Urgent — under 48h (+40%, subject to availability)" },
  { slug: "same_day", label: "Same-Day / Emergency (Custom Confirmation)" },
];

// Ordift Graphic Design Pricing V1 (2026-09-07) — client-side
// estimator, read-only props / pure-calculation shape identical to the
// other four families. Packaging & Product Graphics and Custom /
// Complex Design deliberately never call the calculator at all — no
// invented automatic pricing for either, per the approved spec.
export default function GraphicDesignEstimator({
  markets,
  deliverableRatesByMarket,
  complexityFactors,
  addonRatesByMarket,
  percentages,
}: {
  markets: { id: string; slug: string; name: string }[];
  deliverableRatesByMarket: Record<string, GraphicDesignDeliverableRate[]>;
  complexityFactors: GraphicDesignComplexityFactor[];
  addonRatesByMarket: Record<string, Partial<Record<GraphicDesignAddonSlug, number>>>;
  percentages: Partial<Record<GraphicDesignPercentageSlug, number>>;
}) {
  const [category, setCategory] = useState<Category>("marketing");
  const [marketSlug, setMarketSlug] = useState(markets[0]?.slug ?? "");
  const [deliverableSlug, setDeliverableSlug] = useState<GraphicDesignDeliverableSlug>("flyer_poster");
  const [additionalPages, setAdditionalPages] = useState(0);
  const [additionalSlides, setAdditionalSlides] = useState(0);
  const [complexity, setComplexity] = useState<GraphicDesignComplexity>("standard");
  const [additionalRevisionRounds, setAdditionalRevisionRounds] = useState(0);
  const [radicalReConceptRequested, setRadicalReConceptRequested] = useState(false);
  const [editableSourceFileRequested, setEditableSourceFileRequested] = useState(false);
  const [turnaround, setTurnaround] = useState<GraphicDesignTurnaround>("standard");

  const isPriced = category === "marketing" || category === "social" || category === "print" || category === "presentation";
  const addonRates = useMemo(() => addonRatesByMarket[marketSlug] ?? {}, [addonRatesByMarket, marketSlug]);

  const estimate = useMemo(() => {
    if (!isPriced) return null;
    return calculateGraphicDesignEstimate({
      deliverableSlug,
      deliverableRates: deliverableRatesByMarket[marketSlug] ?? [],
      complexity,
      complexityFactors,
      additionalPages: deliverableSlug === "brochure" ? additionalPages : undefined,
      additionalSlides: deliverableSlug === "presentation" ? additionalSlides : undefined,
      addonRates,
      additionalRevisionRounds,
      radicalReConceptRequested,
      editableSourceFileRequested,
      turnaround,
      percentages,
    });
  }, [isPriced, deliverableSlug, deliverableRatesByMarket, marketSlug, complexity, complexityFactors, additionalPages, additionalSlides, addonRates, additionalRevisionRounds, radicalReConceptRequested, editableSourceFileRequested, turnaround, percentages]);

  const bookingHref = useMemo(() => {
    if (!estimate || !estimate.ok) return "/book?service=graphic-design";
    const marketName = markets.find((m) => m.slug === marketSlug)?.name ?? marketSlug;
    const deliverableLabel = (DELIVERABLES_BY_CATEGORY[category as keyof typeof DELIVERABLES_BY_CATEGORY] ?? []).find((d) => d.slug === deliverableSlug)?.label ?? deliverableSlug;
    const encoded = encodePricingHandoff({
      family: "graphic_design",
      pathway: "graphic-design",
      summaryTitle: `Graphic Design — ${deliverableLabel}`,
      summaryLines: [
        `Market: ${marketName}`,
        `Deliverable: ${deliverableLabel}`,
        `Complexity: ${COMPLEXITY_OPTIONS.find((c) => c.slug === complexity)?.label}`,
        ...(turnaround !== "standard" ? [`Turnaround: ${TURNAROUND_OPTIONS.find((t) => t.slug === turnaround)?.label}`] : []),
        `Estimated Total: $${estimate.estimatedTotalUsd.toFixed(2)}`,
      ],
    });
    return encoded ? `/book?service=graphic-design&pricing=${encoded}` : "/book?service=graphic-design";
  }, [estimate, markets, marketSlug, category, deliverableSlug, complexity, turnaround]);

  const recommendations = getRecommendationsFor("graphic_design");
  const [dismissedRecommendations, setDismissedRecommendations] = useState<Set<string>>(new Set());

  return (
    <div className="rounded-2xl border border-black/10 bg-white p-6 sm:p-8 space-y-6">
      <div>
        <label className="block font-sans text-body-small font-medium text-ordift-ink mb-2">Where will this project be delivered from?</label>
        <select value={marketSlug} onChange={(e) => setMarketSlug(e.target.value)} className="w-full rounded-lg border border-black/15 px-4 py-2.5 font-sans text-body text-ordift-ink">
          {markets.map((m) => (
            <option key={m.slug} value={m.slug}>{m.name}</option>
          ))}
        </select>
      </div>

      <div>
        <label className="block font-sans text-body-small font-medium text-ordift-ink mb-2">Design category</label>
        <select
          value={category}
          onChange={(e) => {
            const next = e.target.value as Category;
            setCategory(next);
            if (next in DELIVERABLES_BY_CATEGORY) setDeliverableSlug(DELIVERABLES_BY_CATEGORY[next as keyof typeof DELIVERABLES_BY_CATEGORY][0].slug);
          }}
          className="w-full rounded-lg border border-black/15 px-4 py-2.5 font-sans text-body text-ordift-ink"
        >
          {CATEGORIES.map((c) => (
            <option key={c.slug} value={c.slug}>{c.label}</option>
          ))}
        </select>
      </div>

      {!isPriced ? (
        <div className="rounded-xl bg-ordift-offwhite p-6">
          <p className="font-sans text-body-small text-ordift-ink">
            {category === "packaging"
              ? "Packaging & Product Graphics design execution is scoped individually — simple label/artwork adaptation and complex structural packaging price very differently."
              : "Custom / Complex Design work is scoped individually rather than estimated automatically."}
          </p>
          <p className="font-sans text-caption text-ordift-ink-muted mt-2">Request Estimate / Creative Review — no automatic price is generated for this category.</p>
        </div>
      ) : (
        <>
          <div>
            <label className="block font-sans text-body-small font-medium text-ordift-ink mb-2">Deliverable</label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {DELIVERABLES_BY_CATEGORY[category as keyof typeof DELIVERABLES_BY_CATEGORY].map((d) => (
                <button key={d.slug} type="button" onClick={() => setDeliverableSlug(d.slug)} className={`rounded-lg border px-3 py-2 font-sans text-body-small ${deliverableSlug === d.slug ? "border-ordift-gold-pressed bg-ordift-gold-pressed/10 text-ordift-ink" : "border-black/15 text-ordift-ink-muted"}`}>
                  {d.label}
                </button>
              ))}
            </div>
          </div>

          {deliverableSlug === "brochure" && (
            <div>
              <label className="block font-sans text-body-small font-medium text-ordift-ink mb-2">Additional pages (base includes up to 8)</label>
              <input type="number" min={0} value={additionalPages} onChange={(e) => setAdditionalPages(Math.max(0, Number(e.target.value)))} className="w-full rounded-lg border border-black/15 px-4 py-2.5 font-sans text-body text-ordift-ink" />
            </div>
          )}
          {deliverableSlug === "presentation" && (
            <div>
              <label className="block font-sans text-body-small font-medium text-ordift-ink mb-2">Additional slides (base includes up to 10)</label>
              <input type="number" min={0} value={additionalSlides} onChange={(e) => setAdditionalSlides(Math.max(0, Number(e.target.value)))} className="w-full rounded-lg border border-black/15 px-4 py-2.5 font-sans text-body text-ordift-ink" />
            </div>
          )}

          <div>
            <label className="block font-sans text-body-small font-medium text-ordift-ink mb-2">Complexity</label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {COMPLEXITY_OPTIONS.map((c) => (
                <button key={c.slug} type="button" onClick={() => setComplexity(c.slug)} className={`rounded-lg border px-3 py-2 font-sans text-body-small ${complexity === c.slug ? "border-ordift-gold-pressed bg-ordift-gold-pressed/10 text-ordift-ink" : "border-black/15 text-ordift-ink-muted"}`}>
                  {c.label}
                </button>
              ))}
            </div>
            {complexity === "bespoke" && <p className="font-sans text-caption text-ordift-ink-muted mt-1">Bespoke / Art-Directed work may require Creative Review before a final price is confirmed.</p>}
          </div>

          <details className="rounded-lg border border-black/10 px-4 py-3">
            <summary className="cursor-pointer font-sans text-body-small font-medium text-ordift-ink select-none">Revisions &amp; source files</summary>
            <div className="mt-3 space-y-3">
              <p className="font-sans text-caption text-ordift-ink-muted">Every project includes 2 revision rounds.</p>
              <label className="block font-sans text-caption text-ordift-ink-muted">Additional revision rounds (beyond the 2 included)
                <input type="number" min={0} value={additionalRevisionRounds} onChange={(e) => setAdditionalRevisionRounds(Math.max(0, Number(e.target.value)))} className="mt-1 w-full rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small" />
              </label>
              <label className="flex items-start gap-2 font-sans text-body-small text-ordift-ink">
                <input type="checkbox" checked={radicalReConceptRequested} onChange={(e) => setRadicalReConceptRequested(e.target.checked)} className="w-4 h-4 mt-0.5" />
                <span>This involves a completely new creative direction after approval (a re-scope, not a revision — surfaced for reassessment rather than priced automatically)</span>
              </label>
              <label className="flex items-center gap-2 font-sans text-body-small text-ordift-ink">
                <input type="checkbox" checked={editableSourceFileRequested} onChange={(e) => setEditableSourceFileRequested(e.target.checked)} className="w-4 h-4" />
                Editable Source File — Available by Request
              </label>
              <p className="font-sans text-caption text-ordift-ink-muted">Source-file release doesn&rsquo;t automatically transfer copyright, font licences, stock licences, or other restricted assets — this remains Admin-assessed.</p>
            </div>
          </details>

          <div>
            <label className="block font-sans text-body-small font-medium text-ordift-ink mb-2">Turnaround</label>
            <select value={turnaround} onChange={(e) => setTurnaround(e.target.value as GraphicDesignTurnaround)} className="w-full rounded-lg border border-black/15 px-4 py-2.5 font-sans text-body text-ordift-ink">
              {TURNAROUND_OPTIONS.map((t) => (
                <option key={t.slug} value={t.slug}>{t.label}</option>
              ))}
            </select>
            <p className="font-sans text-caption text-ordift-ink-muted mt-1">Priority/Urgent turnaround is never guaranteed automatically — subject to Ordift&rsquo;s confirmation.</p>
          </div>

          <div className="rounded-xl bg-ordift-offwhite p-6">
            {estimate?.ok ? (
              <>
                <div className="flex items-baseline justify-between">
                  <span className="font-sans text-body-small text-ordift-ink-muted">Base deliverable</span>
                  <span className="font-sans text-body text-ordift-ink">${estimate.baseDeliverableUsd.toFixed(2)}</span>
                </div>
                {estimate.lineItems.map((item, i) => (
                  <div key={i} className="flex items-baseline justify-between mt-1">
                    <span className="font-sans text-body-small text-ordift-ink-muted">{item.label}</span>
                    <span className="font-sans text-body text-ordift-ink">${item.amountUsd.toFixed(2)}</span>
                  </div>
                ))}
                <div className="flex items-baseline justify-between mt-3 pt-3 border-t border-black/10">
                  <span className="font-serif font-medium text-body text-ordift-ink">Estimated Total</span>
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
              This is an indicative estimate. Printing/physical production, editable source files, and highly complex/packaging work are quoted separately. Final delivery formats (PDF/JPG/PNG) are agreed per project.
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
        {isPriced && estimate?.ok ? "Start Your Enquiry" : "Request Estimate"}
      </Link>
    </div>
  );
}
