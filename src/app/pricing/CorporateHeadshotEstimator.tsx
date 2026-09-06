"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  calculateCorporateEstimate,
  type CorporateProductSlug,
  type CorporateHeadshotRate,
  type CorporateTeamTierRate,
} from "@/lib/pricing/corporateHeadshotEstimate";

const PRODUCTS: { slug: CorporateProductSlug; label: string }[] = [
  { slug: "individual_headshot", label: "Professional Headshot" },
  { slug: "executive_portrait", label: "Executive Portrait" },
  { slug: "team_headshots", label: "Team Headshots" },
];

// Ordift Corporate & Headshots Pricing V1 (2026-09-06) — client-side
// estimator, same read-only-props / pure-calculation shape as
// PersonalSessionEstimator.tsx. No IP/geolocation/nationality signal of
// any kind is read here.
export default function CorporateHeadshotEstimator({
  markets,
  headshotRatesByMarket,
  teamTierRatesByMarket,
  minimumBookingByMarket,
  retouchRateByMarket,
  priorityDeliveryPercentage,
}: {
  markets: { id: string; slug: string; name: string }[];
  headshotRatesByMarket: Record<string, CorporateHeadshotRate[]>;
  teamTierRatesByMarket: Record<string, CorporateTeamTierRate[]>;
  minimumBookingByMarket: Record<string, number | null>;
  retouchRateByMarket: Record<string, number | null>;
  priorityDeliveryPercentage: number | null;
}) {
  const [marketSlug, setMarketSlug] = useState(markets[0]?.slug ?? "");
  const [product, setProduct] = useState<CorporateProductSlug>("individual_headshot");
  const [numberOfPeople, setNumberOfPeople] = useState(5);
  const [additionalRetouchImages, setAdditionalRetouchImages] = useState(0);
  const [priorityDeliveryRequested, setPriorityDeliveryRequested] = useState(false);

  const estimate = useMemo(() => {
    return calculateCorporateEstimate({
      product,
      headshotRates: headshotRatesByMarket[marketSlug] ?? [],
      teamTierRates: teamTierRatesByMarket[marketSlug] ?? [],
      minimumBookingUsd: minimumBookingByMarket[marketSlug] ?? null,
      numberOfPeople: product === "team_headshots" ? numberOfPeople : undefined,
      additionalRetouchImages,
      additionalRetouchRatePerImage: retouchRateByMarket[marketSlug] ?? null,
      priorityDeliveryRequested,
      priorityDeliveryPercentage,
    });
  }, [marketSlug, product, numberOfPeople, additionalRetouchImages, priorityDeliveryRequested, headshotRatesByMarket, teamTierRatesByMarket, minimumBookingByMarket, retouchRateByMarket, priorityDeliveryPercentage]);

  const retouchRate = retouchRateByMarket[marketSlug] ?? null;

  return (
    <div className="rounded-2xl border border-black/10 bg-white p-6 sm:p-8 space-y-6">
      <div>
        <label className="block font-sans text-body-small font-medium text-ordift-ink mb-2">Where will the session take place?</label>
        <select value={marketSlug} onChange={(e) => setMarketSlug(e.target.value)} className="w-full rounded-lg border border-black/15 px-4 py-2.5 font-sans text-body text-ordift-ink">
          {markets.map((m) => (
            <option key={m.slug} value={m.slug}>{m.name}</option>
          ))}
        </select>
      </div>

      <div>
        <label className="block font-sans text-body-small font-medium text-ordift-ink mb-2">Which service?</label>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          {PRODUCTS.map((p) => (
            <button
              key={p.slug}
              type="button"
              onClick={() => setProduct(p.slug)}
              className={`rounded-lg border px-3 py-2 font-sans text-body-small ${product === p.slug ? "border-ordift-gold-pressed bg-ordift-gold-pressed/10 text-ordift-ink" : "border-black/15 text-ordift-ink-muted"}`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {product === "team_headshots" && (
        <div>
          <label className="block font-sans text-body-small font-medium text-ordift-ink mb-2">How many people?</label>
          <input
            type="number"
            min={2}
            value={numberOfPeople}
            onChange={(e) => setNumberOfPeople(Math.max(0, Number(e.target.value)))}
            className="w-full rounded-lg border border-black/15 px-4 py-2.5 font-sans text-body text-ordift-ink"
          />
          <p className="font-sans text-caption text-ordift-ink-muted mt-1">50 or fewer calculates automatically. 51 or more requires a Custom Corporate Proposal.</p>
        </div>
      )}

      <div>
        <label className="block font-sans text-body-small font-medium text-ordift-ink mb-2">Additional Signature Retouched Images</label>
        <div className="flex items-center gap-3">
          <button type="button" onClick={() => setAdditionalRetouchImages((n) => Math.max(0, n - 1))} className="w-9 h-9 rounded-lg border border-black/15 font-sans text-body text-ordift-ink" aria-label="Decrease additional retouched images">−</button>
          <span className="font-sans text-body text-ordift-ink w-8 text-center">{additionalRetouchImages}</span>
          <button type="button" onClick={() => setAdditionalRetouchImages((n) => n + 1)} className="w-9 h-9 rounded-lg border border-black/15 font-sans text-body text-ordift-ink" aria-label="Increase additional retouched images">+</button>
          {retouchRate !== null && <span className="font-sans text-caption text-ordift-ink-muted">${retouchRate.toFixed(0)} each</span>}
        </div>
      </div>

      <div>
        <label className="flex items-center gap-2 font-sans text-body-small text-ordift-ink">
          <input type="checkbox" checked={priorityDeliveryRequested} onChange={(e) => setPriorityDeliveryRequested(e.target.checked)} className="w-4 h-4" />
          Request Priority Delivery {priorityDeliveryPercentage != null ? `(+${priorityDeliveryPercentage}%)` : ""}
        </label>
        <p className="font-sans text-caption text-ordift-ink-muted mt-1">Accelerated delivery, subject to Ordift&rsquo;s availability and confirmation — not a guaranteed turnaround for every job.</p>
      </div>

      <div className="rounded-xl bg-ordift-offwhite p-6">
        {estimate.ok ? (
          <>
            {estimate.teamSubtotalUsd !== null && (
              <div className="flex items-baseline justify-between">
                <span className="font-sans text-body-small text-ordift-ink-muted">Team subtotal ({numberOfPeople} × rate)</span>
                <span className="font-sans text-body text-ordift-ink">${estimate.teamSubtotalUsd.toFixed(2)}</span>
              </div>
            )}
            <div className="flex items-baseline justify-between mt-1">
              <span className="font-sans text-body-small text-ordift-ink-muted">{estimate.minimumApplied ? "Minimum corporate booking applied" : "Base price"}</span>
              <span className="font-sans text-body text-ordift-ink">${estimate.basePriceUsd.toFixed(2)}</span>
            </div>
            {estimate.additionalRetouchImages > 0 && (
              <div className="flex items-baseline justify-between mt-1">
                <span className="font-sans text-body-small text-ordift-ink-muted">Additional retouch × {estimate.additionalRetouchImages}</span>
                <span className="font-sans text-body text-ordift-ink">${estimate.additionalRetouchAmountUsd.toFixed(2)}</span>
              </div>
            )}
            {estimate.priorityDeliveryRequested && (
              <div className="flex items-baseline justify-between mt-1">
                <span className="font-sans text-body-small text-ordift-ink-muted">Priority Delivery (+{estimate.priorityDeliveryPercentage}%)</span>
                <span className="font-sans text-body text-ordift-ink">${estimate.priorityDeliveryAmountUsd.toFixed(2)}</span>
              </div>
            )}
            <div className="flex items-baseline justify-between mt-3 pt-3 border-t border-black/10">
              <span className="font-serif font-medium text-body text-ordift-ink">Estimated Total</span>
              <span className="font-serif font-medium text-section-heading text-ordift-ink">${estimate.totalPriceUsd.toFixed(2)} USD</span>
            </div>
            <p className="font-sans text-body-small text-ordift-ink-muted mt-3">Includes {estimate.signatureRetouchedImages} Signature Retouched Image{estimate.signatureRetouchedImages === 1 ? "" : "s"}.</p>
          </>
        ) : (
          <p className="font-sans text-body-small text-ordift-ink">{estimate.reason}</p>
        )}
        <p className="font-sans text-caption text-ordift-ink-muted mt-4">
          Standard corporate usage (company website, staff profiles, LinkedIn, internal communications) is included. Paid advertising or broader campaign use requires Commercial / Advertising pricing. Hair, makeup, specialist crew, and unusual location costs remain custom-quoted.
        </p>
      </div>

      <Link href="/book?service=general" className="block text-center rounded-lg bg-ordift-ink text-white px-6 py-3 font-sans text-body-small hover:opacity-90 transition-opacity">
        {estimate.ok ? "Start Your Enquiry" : "Request a Custom Proposal"}
      </Link>
    </div>
  );
}
