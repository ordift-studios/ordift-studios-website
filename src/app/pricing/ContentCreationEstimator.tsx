"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  calculateContentCreationEstimate,
  calculateContentCreationRetainerEstimate,
  type ContentCreationPackageSlug,
  type ContentCreationRetainerSlug,
  type ContentCreationAddonSlug,
  type ContentCreationPercentageSlug,
  type ContentCreationTurnaround,
  type ContentCreationPackageRate,
  type ContentCreationRetainerRate,
} from "@/lib/pricing/contentCreationEstimate";
import { encodePricingHandoff } from "@/lib/enquiry/pricingHandoff";
import { getRecommendationsFor, recommendationHref } from "@/lib/services/crossServiceRecommendations";

type Category = "short_form" | "mixed_social" | "content_days" | "product_food" | "event_content" | "personal_brand" | "retainers" | "custom";

const CATEGORIES: { slug: Category; label: string }[] = [
  { slug: "short_form", label: "Short-Form Video" },
  { slug: "mixed_social", label: "Mixed Social Content" },
  { slug: "content_days", label: "Content Days" },
  { slug: "product_food", label: "Product / Food Social Content" },
  { slug: "event_content", label: "Event Content Creation" },
  { slug: "personal_brand", label: "Creator / Personal Brand Content" },
  { slug: "retainers", label: "Content Production Retainers" },
  { slug: "custom", label: "Custom Content Production" },
];

const PACKAGES_BY_CATEGORY: Partial<Record<Category, { slug: ContentCreationPackageSlug; label: string }[]>> = {
  short_form: [
    { slug: "short_form_single", label: "Single Short-Form Video" },
    { slug: "short_form_pack_3", label: "3 Short-Form Videos" },
    { slug: "short_form_pack_5", label: "5 Short-Form Videos" },
  ],
  mixed_social: [
    { slug: "short_form_single", label: "Single Short-Form Video" },
    { slug: "short_form_pack_3", label: "3 Short-Form Videos" },
    { slug: "short_form_pack_5", label: "5 Short-Form Videos" },
  ],
  content_days: [
    { slug: "content_day_half", label: "Half Content Day (up to 4h)" },
    { slug: "content_day_full", label: "Full Content Day (up to 8h)" },
  ],
  product_food: [
    { slug: "short_form_single", label: "Single Short-Form Video" },
    { slug: "short_form_pack_3", label: "3 Short-Form Videos" },
    { slug: "short_form_pack_5", label: "5 Short-Form Videos" },
    { slug: "content_day_half", label: "Half Content Day (up to 4h)" },
    { slug: "content_day_full", label: "Full Content Day (up to 8h)" },
  ],
  event_content: [{ slug: "event_content_4h", label: "Event Social Coverage (up to 4h)" }],
  personal_brand: [{ slug: "personal_brand_2h", label: "Personal Brand Session (up to 2h)" }],
};

const RETAINER_OPTIONS: { slug: ContentCreationRetainerSlug; label: string; target: string }[] = [
  { slug: "retainer_essential", label: "Essential", target: "1 Half Content Day / month — 4 short-form videos, 15 edited photographs" },
  { slug: "retainer_growth", label: "Growth", target: "1 Full Content Day / month — 8 short-form videos, 30 edited photographs" },
  { slug: "retainer_momentum", label: "Momentum", target: "2 Full Content Days / month — 16 short-form videos, 60 edited photographs" },
];

const TURNAROUND_OPTIONS: { slug: ContentCreationTurnaround; label: string }[] = [
  { slug: "standard", label: "Standard (included)" },
  { slug: "priority", label: "Priority Post-Production (+30%)" },
  { slug: "emergency_custom", label: "Exceptional Emergency (Custom Confirmation)" },
];

const CATEGORY_NOTE: Partial<Record<Category, string>> = {
  short_form: "Social-first video up to approximately 60 seconds — Reels, TikTok, Shorts, LinkedIn/social vertical video, organic campaign assets. Long-form narrative film, brand film, documentary, or major advertising production belongs to Videography or Commercial / Advertising instead.",
  mixed_social: "A mix of short-form video and supporting social photography, configured through the same Short-Form Video packages below.",
  product_food: "Lighter, recurring product/food social content, configured through an appropriate Content Day or Short-Form scope. Advertising campaign production, major set builds, sophisticated product photography, food styling, talent, or paid-media assets belong to Commercial / Advertising.",
  event_content: "Fast, social-first event coverage — vertical capture, behind-the-scenes moments, atmosphere/detail coverage, rapid-turnaround social edits. This is not a replacement for formal Wedding/Event Photography or Film coverage.",
  personal_brand: "For entrepreneurs, professionals, artists, creators, speakers and public-facing individuals building a personal brand. If the primary need is formal portraiture or headshots, Personal Portrait or Corporate & Headshots is the better fit.",
};

// Ordift Content Creation Pricing V1 (2026-09-07) — client-side
// estimator. Short-Form Video, Mixed Social Content, Content Days,
// Product/Food Social Content, Event Content Creation and Creator/
// Personal Brand Content all share calculateContentCreationEstimate
// via a package-slug lookup (see that module's doc comment). Content
// Production Retainers use the separate flat, no-addon
// calculateContentCreationRetainerEstimate. Custom Content Production
// never calls a calculator at all — no invented automatic pricing.
export default function ContentCreationEstimator({
  markets,
  packageRatesByMarket,
  retainerRatesByMarket,
  addonRatesByMarket,
  percentages,
}: {
  markets: { id: string; slug: string; name: string }[];
  packageRatesByMarket: Record<string, ContentCreationPackageRate[]>;
  retainerRatesByMarket: Record<string, ContentCreationRetainerRate[]>;
  addonRatesByMarket: Record<string, Partial<Record<ContentCreationAddonSlug, number>>>;
  percentages: Partial<Record<ContentCreationPercentageSlug, number>>;
}) {
  const [category, setCategory] = useState<Category>("short_form");
  const [marketSlug, setMarketSlug] = useState(markets[0]?.slug ?? "");
  const [packageSlug, setPackageSlug] = useState<ContentCreationPackageSlug>("short_form_single");
  const [retainerSlug, setRetainerSlug] = useState<ContentCreationRetainerSlug>("retainer_essential");
  const [additionalVideos, setAdditionalVideos] = useState(0);
  const [additionalPhotoSets, setAdditionalPhotoSets] = useState(0);
  const [additionalCaptureHours, setAdditionalCaptureHours] = useState(0);
  const [aspectRatioAdaptationCount, setAspectRatioAdaptationCount] = useState(0);
  const [captionedMasterCount, setCaptionedMasterCount] = useState(0);
  const [sameNextDayEditVideoCount, setSameNextDayEditVideoCount] = useState(0);
  const [additionalRevisionRounds, setAdditionalRevisionRounds] = useState(0);
  const [turnaround, setTurnaround] = useState<ContentCreationTurnaround>("standard");

  const isRetainer = category === "retainers";
  const isCustom = category === "custom";
  const isPriced = !isRetainer && !isCustom;
  const packageOptions = useMemo(() => PACKAGES_BY_CATEGORY[category] ?? [], [category]);

  const addonRates = useMemo(() => addonRatesByMarket[marketSlug] ?? {}, [addonRatesByMarket, marketSlug]);
  const packageRates = useMemo(() => packageRatesByMarket[marketSlug] ?? [], [packageRatesByMarket, marketSlug]);
  const retainerRates = useMemo(() => retainerRatesByMarket[marketSlug] ?? [], [retainerRatesByMarket, marketSlug]);

  const estimate = useMemo(() => {
    if (!isPriced) return null;
    return calculateContentCreationEstimate({
      packageSlug,
      packageRates,
      addonRates,
      additionalVideos,
      additionalPhotoSets,
      additionalCaptureHours,
      aspectRatioAdaptationCount,
      captionedMasterCount,
      sameNextDayEditVideoCount,
      additionalRevisionRounds,
      turnaround,
      percentages,
    });
  }, [isPriced, packageSlug, packageRates, addonRates, additionalVideos, additionalPhotoSets, additionalCaptureHours, aspectRatioAdaptationCount, captionedMasterCount, sameNextDayEditVideoCount, additionalRevisionRounds, turnaround, percentages]);

  const retainerEstimate = useMemo(() => {
    if (!isRetainer) return null;
    return calculateContentCreationRetainerEstimate({ retainerSlug, retainerRates });
  }, [isRetainer, retainerSlug, retainerRates]);

  const bookingHref = useMemo(() => {
    const marketName = markets.find((m) => m.slug === marketSlug)?.name ?? marketSlug;
    if (isRetainer) {
      if (!retainerEstimate || !retainerEstimate.ok) return "/book?service=content-creation";
      const retainerLabel = RETAINER_OPTIONS.find((r) => r.slug === retainerSlug)?.label ?? retainerSlug;
      const encoded = encodePricingHandoff({
        family: "content_creation",
        pathway: "content-creation",
        summaryTitle: `Content Creation — ${retainerLabel} Retainer`,
        summaryLines: [`Market: ${marketName}`, `Retainer: ${retainerLabel}`, `Monthly Fee: $${retainerEstimate.monthlyFeeUsd.toFixed(2)}`, "Minimum commitment: 3 months"],
      });
      return encoded ? `/book?service=content-creation&pricing=${encoded}` : "/book?service=content-creation";
    }
    if (!estimate || !estimate.ok) return "/book?service=content-creation";
    const packageLabel = packageOptions.find((p) => p.slug === packageSlug)?.label ?? packageSlug;
    const encoded = encodePricingHandoff({
      family: "content_creation",
      pathway: "content-creation",
      summaryTitle: `Content Creation — ${packageLabel}`,
      summaryLines: [
        `Market: ${marketName}`,
        `Package: ${packageLabel}`,
        ...(turnaround !== "standard" ? [`Turnaround: ${TURNAROUND_OPTIONS.find((t) => t.slug === turnaround)?.label}`] : []),
        `Estimated Total: $${estimate.estimatedTotalUsd.toFixed(2)}`,
      ],
    });
    return encoded ? `/book?service=content-creation&pricing=${encoded}` : "/book?service=content-creation";
  }, [isRetainer, retainerEstimate, retainerSlug, estimate, markets, marketSlug, packageOptions, packageSlug, turnaround]);

  const recommendations = getRecommendationsFor("content_creation");
  const [dismissedRecommendations, setDismissedRecommendations] = useState<Set<string>>(new Set());

  return (
    <div className="rounded-2xl border border-black/10 bg-white p-6 sm:p-8 space-y-6">
      <p className="font-sans text-caption text-ordift-ink-muted">
        Content Creation is social-first, repeatable content production — not a cheaper substitute for traditional Photography, long-form Videography, Commercial / Advertising production, Graphic Design, Branding &amp; Creative Strategy, full Social Media Management, or influencer/talent endorsement.
      </p>

      <div>
        <label className="block font-sans text-body-small font-medium text-ordift-ink mb-2">Where will this content be produced?</label>
        <select value={marketSlug} onChange={(e) => setMarketSlug(e.target.value)} className="w-full rounded-lg border border-black/15 px-4 py-2.5 font-sans text-body text-ordift-ink">
          {markets.map((m) => (
            <option key={m.slug} value={m.slug}>{m.name}</option>
          ))}
        </select>
      </div>

      <div>
        <label className="block font-sans text-body-small font-medium text-ordift-ink mb-2">Content type</label>
        <select
          value={category}
          onChange={(e) => {
            const next = e.target.value as Category;
            setCategory(next);
            const opts = PACKAGES_BY_CATEGORY[next];
            if (opts && opts.length > 0) setPackageSlug(opts[0].slug);
          }}
          className="w-full rounded-lg border border-black/15 px-4 py-2.5 font-sans text-body text-ordift-ink"
        >
          {CATEGORIES.map((c) => (
            <option key={c.slug} value={c.slug}>{c.label}</option>
          ))}
        </select>
        {CATEGORY_NOTE[category] && <p className="font-sans text-caption text-ordift-ink-muted mt-1">{CATEGORY_NOTE[category]}</p>}
      </div>

      {isCustom ? (
        <div className="rounded-xl bg-ordift-offwhite p-6">
          <p className="font-sans text-body-small text-ordift-ink">Custom Content Production is scoped individually rather than estimated automatically.</p>
          <p className="font-sans text-caption text-ordift-ink-muted mt-2">Request Estimate — no automatic price is generated for this category.</p>
        </div>
      ) : isRetainer ? (
        <>
          <div>
            <label className="block font-sans text-body-small font-medium text-ordift-ink mb-2">Retainer tier</label>
            <div className="grid grid-cols-1 gap-2">
              {RETAINER_OPTIONS.map((r) => (
                <button key={r.slug} type="button" onClick={() => setRetainerSlug(r.slug)} className={`text-left rounded-lg border px-3 py-2 font-sans text-body-small ${retainerSlug === r.slug ? "border-ordift-gold-pressed bg-ordift-gold-pressed/10 text-ordift-ink" : "border-black/15 text-ordift-ink-muted"}`}>
                  <span className="block font-medium text-ordift-ink">{r.label}</span>
                  <span className="block text-caption mt-0.5">{r.target}</span>
                </button>
              ))}
            </div>
          </div>
          <p className="font-sans text-caption text-ordift-ink-muted">
            Content Production retainers — not Social Media Management (posting, community management, paid-media, analytics, or ongoing channel strategy remain Available by Custom Proposal). 3-month minimum commitment. Defined monthly production allowance, agreed scheduling, rescheduling subject to policy — unused capacity does not automatically accumulate indefinitely, and major scope changes require reassessment. Supplier costs excluded unless specifically contracted.
          </p>
          <div className="rounded-xl bg-ordift-offwhite p-6">
            {retainerEstimate?.ok ? (
              <div className="flex items-baseline justify-between">
                <span className="font-serif font-medium text-body text-ordift-ink">Monthly Fee</span>
                <span className="font-serif font-medium text-section-heading text-ordift-ink">${retainerEstimate.monthlyFeeUsd.toFixed(2)} USD</span>
              </div>
            ) : (
              <p className="font-sans text-body-small text-ordift-ink">{retainerEstimate && !retainerEstimate.ok ? retainerEstimate.reason : ""}</p>
            )}
          </div>
        </>
      ) : (
        <>
          <div>
            <label className="block font-sans text-body-small font-medium text-ordift-ink mb-2">Package / scope</label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {packageOptions.map((p) => (
                <button key={p.slug} type="button" onClick={() => setPackageSlug(p.slug)} className={`rounded-lg border px-3 py-2 font-sans text-body-small ${packageSlug === p.slug ? "border-ordift-gold-pressed bg-ordift-gold-pressed/10 text-ordift-ink" : "border-black/15 text-ordift-ink-muted"}`}>
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          <details className="rounded-lg border border-black/10 px-4 py-3">
            <summary className="cursor-pointer font-sans text-body-small font-medium text-ordift-ink select-none">Additions &amp; turnaround</summary>
            <div className="mt-3 space-y-3">
              <p className="font-sans text-caption text-ordift-ink-muted">Every project includes 2 revision rounds on edited video deliverables.</p>
              <label className="block font-sans text-caption text-ordift-ink-muted">Additional short-form videos
                <input type="number" min={0} value={additionalVideos} onChange={(e) => setAdditionalVideos(Math.max(0, Number(e.target.value)))} className="mt-1 w-full rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small" />
              </label>
              <label className="block font-sans text-caption text-ordift-ink-muted">Additional sets of 10 edited social photos
                <input type="number" min={0} value={additionalPhotoSets} onChange={(e) => setAdditionalPhotoSets(Math.max(0, Number(e.target.value)))} className="mt-1 w-full rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small" />
              </label>
              <label className="block font-sans text-caption text-ordift-ink-muted">Additional content-capture hours
                <input type="number" min={0} value={additionalCaptureHours} onChange={(e) => setAdditionalCaptureHours(Math.max(0, Number(e.target.value)))} className="mt-1 w-full rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small" />
              </label>
              <label className="block font-sans text-caption text-ordift-ink-muted">Additional aspect-ratio / platform adaptations
                <input type="number" min={0} value={aspectRatioAdaptationCount} onChange={(e) => setAspectRatioAdaptationCount(Math.max(0, Number(e.target.value)))} className="mt-1 w-full rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small" />
              </label>
              <label className="block font-sans text-caption text-ordift-ink-muted">Captioned / subtitled masters
                <input type="number" min={0} value={captionedMasterCount} onChange={(e) => setCaptionedMasterCount(Math.max(0, Number(e.target.value)))} className="mt-1 w-full rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small" />
              </label>
              <p className="font-sans text-caption text-ordift-ink-muted">Captions/subtitles are formatting only, not professional translation. Translation, transcreation, and multilingual copywriting are Available by Quote.</p>
              <label className="block font-sans text-caption text-ordift-ink-muted">Same/Next-Day Social Edit — per video
                <input type="number" min={0} value={sameNextDayEditVideoCount} onChange={(e) => setSameNextDayEditVideoCount(Math.max(0, Number(e.target.value)))} className="mt-1 w-full rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small" />
              </label>
              <label className="block font-sans text-caption text-ordift-ink-muted">Additional revision rounds (beyond the 2 included)
                <input type="number" min={0} value={additionalRevisionRounds} onChange={(e) => setAdditionalRevisionRounds(Math.max(0, Number(e.target.value)))} className="mt-1 w-full rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small" />
              </label>
            </div>
          </details>

          <div>
            <label className="block font-sans text-body-small font-medium text-ordift-ink mb-2">Turnaround</label>
            <select value={turnaround} onChange={(e) => setTurnaround(e.target.value as ContentCreationTurnaround)} className="w-full rounded-lg border border-black/15 px-4 py-2.5 font-sans text-body text-ordift-ink">
              {TURNAROUND_OPTIONS.map((t) => (
                <option key={t.slug} value={t.slug}>{t.label}</option>
              ))}
            </select>
            <p className="font-sans text-caption text-ordift-ink-muted mt-1">Priority/Emergency turnaround is never guaranteed automatically — subject to Ordift&rsquo;s confirmation. Priority applies to eligible post-production only, never to production, talent, travel or licensing.</p>
          </div>

          <div className="rounded-xl bg-ordift-offwhite p-6">
            {estimate?.ok ? (
              <>
                <div className="flex items-baseline justify-between">
                  <span className="font-sans text-body-small text-ordift-ink-muted">Base package</span>
                  <span className="font-sans text-body text-ordift-ink">${estimate.basePackageUsd.toFixed(2)}</span>
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
              </>
            ) : (
              <p className="font-sans text-body-small text-ordift-ink">{estimate && !estimate.ok ? estimate.reason : ""}</p>
            )}
            <p className="font-sans text-caption text-ordift-ink-muted mt-4">
              This is an indicative estimate for content production only. Base pricing includes ordinary usage on your own organic social channels, website, and internal communication — paid advertising, whitelisting, or broader commercial usage requires Commercial / Advertising licensing. Social Media Management, RAW/source material, premium third-party assets, and talent/creator appearance or usage fees are Available by Request/Quote and are never included automatically.
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
        {(isPriced && estimate?.ok) || (isRetainer && retainerEstimate?.ok) ? "Start Your Enquiry" : "Request Estimate"}
      </Link>
    </div>
  );
}
