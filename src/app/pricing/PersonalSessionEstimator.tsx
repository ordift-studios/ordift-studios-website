"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { calculatePersonalSessionEstimate, type PersonalSessionRate, type SubjectCategory, type PricingMarket } from "@/lib/pricing/personalSessionEstimate";
import { encodePricingHandoff } from "@/lib/enquiry/pricingHandoff";

// Ordift Pricing Engine V1 / V1.1 (2026-09-06) — client-side estimator.
// All data (markets/rates/subject categories/retouch rates) is fetched
// server-side and passed in as props; this component only runs the
// existing PURE calculatePersonalSessionEstimate() logic against the
// visitor's own explicit selections. No IP/geolocation/nationality
// signal of any kind is read here — the "where will this take place"
// market choice is a plain, deliberate dropdown, nothing pre-selected
// from the visitor's browser/location.
export default function PersonalSessionEstimator({
  markets,
  ratesByMarket,
  subjectCategories,
  retouchRateByMarket,
}: {
  markets: PricingMarket[];
  ratesByMarket: Record<string, PersonalSessionRate[]>;
  subjectCategories: SubjectCategory[];
  retouchRateByMarket: Record<string, number | null>;
}) {
  const [marketSlug, setMarketSlug] = useState(markets[0]?.slug ?? "");
  const [durationHours, setDurationHours] = useState(1);
  const [subjectSlug, setSubjectSlug] = useState(subjectCategories.find((c) => c.active)?.slug ?? "");
  const [additionalRetouchImages, setAdditionalRetouchImages] = useState(0);
  // Planning/scope input only (2026-09-07) — communicates intended
  // outfit/look count so Ordift can plan the session; deliberately NOT
  // passed into calculatePersonalSessionEstimate() and has zero effect
  // on price or deliverable entitlement. See the approved Personal
  // Portrait pricing matrix, which this must never alter.
  const [numberOfOutfits, setNumberOfOutfits] = useState(1);

  const estimate = useMemo(() => {
    const rates = ratesByMarket[marketSlug] ?? [];
    const subjectCategory = subjectCategories.find((c) => c.slug === subjectSlug) ?? null;
    return calculatePersonalSessionEstimate({
      rates,
      durationHours,
      subjectCategory,
      additionalRetouchImages,
      additionalRetouchRatePerImage: retouchRateByMarket[marketSlug] ?? null,
    });
  }, [marketSlug, durationHours, subjectSlug, additionalRetouchImages, ratesByMarket, subjectCategories, retouchRateByMarket]);

  const bookingHref = useMemo(() => {
    if (!estimate.ok) return "/book?service=photography";
    const marketName = markets.find((m) => m.slug === marketSlug)?.name ?? marketSlug;
    const subjectName = subjectCategories.find((c) => c.slug === subjectSlug)?.name ?? subjectSlug;
    const encoded = encodePricingHandoff({
      family: "personal",
      pathway: "photography",
      summaryTitle: `Personal Portrait — ${durationHours}h, ${subjectName}`,
      summaryLines: [
        `Market: ${marketName}`,
        `Session length: ${durationHours}h`,
        `Subject: ${subjectName}`,
        `Outfits/looks: ${numberOfOutfits}`,
        ...(estimate.additionalRetouchImages > 0 ? [`Additional retouch: ${estimate.additionalRetouchImages}`] : []),
        `Total: $${estimate.totalPriceUsd.toFixed(2)}`,
      ],
    });
    return encoded ? `/book?service=photography&pricing=${encoded}` : "/book?service=photography";
  }, [estimate, markets, marketSlug, subjectCategories, subjectSlug, durationHours, numberOfOutfits]);

  const retouchRate = retouchRateByMarket[marketSlug] ?? null;

  return (
    <div className="rounded-2xl border border-black/10 bg-white p-6 sm:p-8 space-y-6">
      <div>
        <label className="block font-sans text-body-small font-medium text-ordift-ink mb-2">Where will the session take place?</label>
        <select
          value={marketSlug}
          onChange={(e) => setMarketSlug(e.target.value)}
          className="w-full rounded-lg border border-black/15 px-4 py-2.5 font-sans text-body text-ordift-ink"
        >
          {markets.map((m) => (
            <option key={m.slug} value={m.slug}>{m.name}</option>
          ))}
        </select>
        <p className="font-sans text-caption text-ordift-ink-muted mt-1">
          Pricing follows the market the shoot takes place in, not where you live.
        </p>
      </div>

      <div>
        <label className="block font-sans text-body-small font-medium text-ordift-ink mb-2">Session length</label>
        <div className="grid grid-cols-4 gap-2">
          {[1, 2, 3, 4].map((h) => (
            <button
              key={h}
              type="button"
              onClick={() => setDurationHours(h)}
              className={`rounded-lg border px-3 py-2 font-sans text-body-small ${durationHours === h ? "border-ordift-gold-pressed bg-ordift-gold-pressed/10 text-ordift-ink" : "border-black/15 text-ordift-ink-muted"}`}
            >
              {h}h
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="block font-sans text-body-small font-medium text-ordift-ink mb-2">Who&rsquo;s being photographed?</label>
        <select
          value={subjectSlug}
          onChange={(e) => setSubjectSlug(e.target.value)}
          className="w-full rounded-lg border border-black/15 px-4 py-2.5 font-sans text-body text-ordift-ink"
        >
          {subjectCategories.map((c) => (
            <option key={c.slug} value={c.slug}>{c.name}</option>
          ))}
        </select>
        {subjectSlug === "limited_guest_appearance" && (
          <p className="font-sans text-caption text-ordift-ink-muted mt-1">
            One guest may join for a small portion of the session and a few shared photographs. If your guest needs their own full coverage, choose Couple or Family / Small Group instead.
          </p>
        )}
      </div>

      <div>
        <label className="block font-sans text-body-small font-medium text-ordift-ink mb-2">How many outfits or looks?</label>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setNumberOfOutfits((n) => Math.max(1, n - 1))}
            className="w-9 h-9 rounded-lg border border-black/15 font-sans text-body text-ordift-ink"
            aria-label="Decrease number of outfits or looks"
          >
            −
          </button>
          <span className="font-sans text-body text-ordift-ink w-8 text-center">{numberOfOutfits}</span>
          <button
            type="button"
            onClick={() => setNumberOfOutfits((n) => n + 1)}
            className="w-9 h-9 rounded-lg border border-black/15 font-sans text-body text-ordift-ink"
            aria-label="Increase number of outfits or looks"
          >
            +
          </button>
        </div>
        <p className="font-sans text-caption text-ordift-ink-muted mt-1">
          For planning only — helps Ordift prepare for your session. This doesn&rsquo;t change the price shown below.
        </p>
      </div>

      <div>
        <label className="block font-sans text-body-small font-medium text-ordift-ink mb-2">Additional Signature Retouched Images</label>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setAdditionalRetouchImages((n) => Math.max(0, n - 1))}
            className="w-9 h-9 rounded-lg border border-black/15 font-sans text-body text-ordift-ink"
            aria-label="Decrease additional retouched images"
          >
            −
          </button>
          <span className="font-sans text-body text-ordift-ink w-8 text-center">{additionalRetouchImages}</span>
          <button
            type="button"
            onClick={() => setAdditionalRetouchImages((n) => n + 1)}
            className="w-9 h-9 rounded-lg border border-black/15 font-sans text-body text-ordift-ink"
            aria-label="Increase additional retouched images"
          >
            +
          </button>
          {retouchRate !== null && (
            <span className="font-sans text-caption text-ordift-ink-muted">${retouchRate.toFixed(0)} each</span>
          )}
        </div>
      </div>

      <div className="rounded-xl bg-ordift-offwhite p-6">
        {estimate.ok ? (
          <>
            <div className="flex items-baseline justify-between">
              <span className="font-sans text-body-small text-ordift-ink-muted">Session</span>
              <span className="font-sans text-body text-ordift-ink">${estimate.sessionPriceUsd.toFixed(2)}</span>
            </div>
            {estimate.additionalRetouchImages > 0 && (
              <div className="flex items-baseline justify-between mt-1">
                <span className="font-sans text-body-small text-ordift-ink-muted">
                  Additional retouch × {estimate.additionalRetouchImages}
                </span>
                <span className="font-sans text-body text-ordift-ink">${estimate.additionalRetouchAmountUsd.toFixed(2)}</span>
              </div>
            )}
            <div className="flex items-baseline justify-between mt-3 pt-3 border-t border-black/10">
              <span className="font-serif font-medium text-body text-ordift-ink">Total</span>
              <span className="font-serif font-medium text-section-heading text-ordift-ink">${estimate.totalPriceUsd.toFixed(0)} USD</span>
            </div>
            <p className="font-sans text-body-small text-ordift-ink-muted mt-3">
              Includes {estimate.signatureRetouchedImages} Signature Retouched Images and {estimate.professionallyEditedImages} Professionally Edited Images.
            </p>
          </>
        ) : (
          <p className="font-sans text-body-small text-ordift-ink">{estimate.reason}</p>
        )}
        <p className="font-sans text-caption text-ordift-ink-muted mt-4">
          This estimate reflects the selected parameters only. Production or location requirements may affect final pricing, and complex assignments may require a full proposal.
        </p>
      </div>

      <Link
        href={bookingHref}
        className="block text-center rounded-lg bg-ordift-ink text-white px-6 py-3 font-sans text-body-small hover:opacity-90 transition-opacity"
      >
        {estimate.ok ? "Start Your Booking" : "Request a Custom Quote"}
      </Link>
    </div>
  );
}
