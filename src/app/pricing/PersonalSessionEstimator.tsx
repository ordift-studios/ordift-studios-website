"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { calculatePersonalSessionEstimate, type PersonalSessionRate, type SubjectCategory, type PricingMarket } from "@/lib/pricing/personalSessionEstimate";

// Ordift Pricing Engine V1 (2026-09-06) — client-side estimator. All
// data (markets/rates/subject categories) is fetched server-side and
// passed in as props; this component only runs the existing PURE
// calculatePersonalSessionEstimate() logic against the visitor's own
// explicit selections. No IP/geolocation/nationality signal of any
// kind is read here — the "where will this take place" market choice
// is a plain, deliberate dropdown, nothing pre-selected from the
// visitor's browser/location.
export default function PersonalSessionEstimator({
  markets,
  ratesByMarket,
  subjectCategories,
}: {
  markets: PricingMarket[];
  ratesByMarket: Record<string, PersonalSessionRate[]>;
  subjectCategories: SubjectCategory[];
}) {
  const [marketSlug, setMarketSlug] = useState(markets[0]?.slug ?? "");
  const [durationHours, setDurationHours] = useState(1);
  const [subjectSlug, setSubjectSlug] = useState(subjectCategories.find((c) => c.active)?.slug ?? "");

  const estimate = useMemo(() => {
    const rates = ratesByMarket[marketSlug] ?? [];
    const subjectCategory = subjectCategories.find((c) => c.slug === subjectSlug) ?? null;
    return calculatePersonalSessionEstimate({ rates, durationHours, subjectCategory });
  }, [marketSlug, durationHours, subjectSlug, ratesByMarket, subjectCategories]);

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
      </div>

      <div className="rounded-xl bg-ordift-offwhite p-6">
        {estimate.ok ? (
          <>
            <p className="font-serif font-medium text-section-heading text-ordift-ink">From ${estimate.priceUsd.toFixed(0)} USD</p>
            <p className="font-sans text-body-small text-ordift-ink-muted mt-2">
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
        href={`/book?service=photography`}
        className="block text-center rounded-lg bg-ordift-ink text-white px-6 py-3 font-sans text-body-small hover:opacity-90 transition-opacity"
      >
        {estimate.ok ? "Start Your Booking" : "Request a Custom Quote"}
      </Link>
    </div>
  );
}
