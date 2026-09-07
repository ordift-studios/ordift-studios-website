"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  calculateProductionServicesEstimate,
  type ProductionServicesRate,
  type ProductionServicesPercentageSlug,
  type ProductionPlanningTier,
  type ProductionScaleSignal,
} from "@/lib/pricing/productionServicesEstimate";
import { encodePricingHandoff } from "@/lib/enquiry/pricingHandoff";
import { getRecommendationsFor, recommendationHref } from "@/lib/services/crossServiceRecommendations";

type SupportType = "full_management" | "standalone" | "unsure";

const PLANNING_OPTIONS: { slug: ProductionPlanningTier; label: string }[] = [
  { slug: "none", label: "Not needed" },
  { slug: "half_day", label: "Half-Day Planning" },
  { slug: "full_day", label: "Full-Day Planning" },
];

const SCALE_SIGNAL_OPTIONS: { slug: ProductionScaleSignal; label: string }[] = [
  { slug: "regulated_activity", label: "Drone, pyrotechnics, weapons/replica props, stunts, animals, children, or a restricted/hazardous location" },
  { slug: "international_logistics", label: "Cross-border travel, permits, or customs" },
  { slug: "many_locations_or_days", label: "Many locations or production days" },
  { slug: "complex_crew_or_equipment_scope", label: "A large or highly specialised crew/equipment scope" },
];

// Ordift Production Services Pricing V1 (2026-09-07) — client-side
// estimator. This calculator ONLY ever shows Ordift's own management/
// coordination fee — it never guesses an external supplier cost.
// "Manage my whole production" and "Specific sourcing/coordination
// help" are mutually exclusive branches (matching
// calculateProductionServicesEstimate's engagementType), so the UI
// itself cannot accidentally request both a Management fee and
// standalone coordination fees on the same estimate.
export default function ProductionServicesEstimator({
  markets,
  ratesByMarket,
  percentages,
}: {
  markets: { id: string; slug: string; name: string }[];
  ratesByMarket: Record<string, ProductionServicesRate[]>;
  percentages: Partial<Record<ProductionServicesPercentageSlug, number>>;
}) {
  const [marketSlug, setMarketSlug] = useState(markets[0]?.slug ?? "");
  const [supportType, setSupportType] = useState<SupportType>("unsure");
  const [managedExternalCostUsd, setManagedExternalCostUsd] = useState<number | "">("");
  const [managementOvertimeRequested, setManagementOvertimeRequested] = useState(false);
  const [locationCount, setLocationCount] = useState(0);
  const [equipmentRentalCostUsd, setEquipmentRentalCostUsd] = useState<number | "">("");
  const [crewCostUsd, setCrewCostUsd] = useState<number | "">("");
  const [planningTier, setPlanningTier] = useState<ProductionPlanningTier>("none");
  const [scaleSignals, setScaleSignals] = useState<Set<ProductionScaleSignal>>(new Set());

  const rates = useMemo(() => ratesByMarket[marketSlug] ?? [], [ratesByMarket, marketSlug]);

  const estimate = useMemo(() => {
    if (supportType === "unsure") return null;
    if (supportType === "full_management") {
      if (managedExternalCostUsd === "" || managedExternalCostUsd <= 0) return null;
      return calculateProductionServicesEstimate({
        engagementType: "full_production_management",
        rates,
        percentages,
        eligibleManagedExternalCostUsd: managedExternalCostUsd,
        planningTier,
        managementOvertimeRequested,
        scaleSignals: Array.from(scaleSignals),
      });
    }
    const hasAnyStandaloneInput = locationCount > 0 || (equipmentRentalCostUsd !== "" && equipmentRentalCostUsd > 0) || (crewCostUsd !== "" && crewCostUsd > 0) || planningTier !== "none";
    if (!hasAnyStandaloneInput) return null;
    return calculateProductionServicesEstimate({
      engagementType: "standalone_coordination",
      rates,
      percentages,
      standaloneLocationCount: locationCount,
      standaloneEquipmentRentalCostUsd: equipmentRentalCostUsd === "" ? undefined : equipmentRentalCostUsd,
      standaloneCrewCostUsd: crewCostUsd === "" ? undefined : crewCostUsd,
      planningTier,
      scaleSignals: Array.from(scaleSignals),
    });
  }, [supportType, rates, percentages, managedExternalCostUsd, planningTier, managementOvertimeRequested, locationCount, equipmentRentalCostUsd, crewCostUsd, scaleSignals]);

  const bookingHref = useMemo(() => {
    const marketName = markets.find((m) => m.slug === marketSlug)?.name ?? marketSlug;
    const summaryTitle = supportType === "full_management" ? "Production Services — Full Production Management" : supportType === "standalone" ? "Production Services — Coordination Support" : "Production Services — Recommend My Setup";
    const summaryLines = [`Market: ${marketName}`, `Support requested: ${supportType === "full_management" ? "Full Production Management" : supportType === "standalone" ? "Specific coordination support" : "Not sure — recommend the setup"}`];
    if (estimate?.ok) summaryLines.push(`Ordift Fee (indicative): $${estimate.ordiftFeeSubtotalUsd.toFixed(2)}`);
    summaryLines.push("External supplier/production costs remain To Be Quoted.");
    const encoded = encodePricingHandoff({ family: "production_services", pathway: "production", summaryTitle, summaryLines });
    return encoded ? `/book?service=production&pricing=${encoded}` : "/book?service=production";
  }, [markets, marketSlug, supportType, estimate]);

  const recommendations = getRecommendationsFor("production_services");
  const [dismissedRecommendations, setDismissedRecommendations] = useState<Set<string>>(new Set());

  function toggleScaleSignal(signal: ProductionScaleSignal) {
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
        Production Services coordinates the crew, equipment, studio/location and logistics behind a Photography, Videography, Commercial, Content Creation or Branding project — it doesn&rsquo;t replace those departments.
      </p>

      <div>
        <label className="block font-sans text-body-small font-medium text-ordift-ink mb-2">Where will production take place?</label>
        <select value={marketSlug} onChange={(e) => setMarketSlug(e.target.value)} className="w-full rounded-lg border border-black/15 px-4 py-2.5 font-sans text-body text-ordift-ink">
          {markets.map((m) => (
            <option key={m.slug} value={m.slug}>{m.name}</option>
          ))}
        </select>
      </div>

      <div>
        <label className="block font-sans text-body-small font-medium text-ordift-ink mb-2">What support do you need?</label>
        <div className="space-y-2">
          <button type="button" onClick={() => setSupportType("full_management")} className={`w-full text-left rounded-lg border px-3 py-2 font-sans text-body-small ${supportType === "full_management" ? "border-ordift-gold-pressed bg-ordift-gold-pressed/10 text-ordift-ink" : "border-black/15 text-ordift-ink-muted"}`}>
            <span className="block font-medium text-ordift-ink">Manage my whole production</span>
            <span className="block text-caption mt-0.5">Ordift coordinates crew, equipment and location together as one managed scope.</span>
          </button>
          <button type="button" onClick={() => setSupportType("standalone")} className={`w-full text-left rounded-lg border px-3 py-2 font-sans text-body-small ${supportType === "standalone" ? "border-ordift-gold-pressed bg-ordift-gold-pressed/10 text-ordift-ink" : "border-black/15 text-ordift-ink-muted"}`}>
            <span className="block font-medium text-ordift-ink">Specific sourcing/coordination help</span>
            <span className="block text-caption mt-0.5">Just a location, just equipment, or just crew sourced/coordinated — without wider production management.</span>
          </button>
          <button type="button" onClick={() => setSupportType("unsure")} className={`w-full text-left rounded-lg border px-3 py-2 font-sans text-body-small ${supportType === "unsure" ? "border-ordift-gold-pressed bg-ordift-gold-pressed/10 text-ordift-ink" : "border-black/15 text-ordift-ink-muted"}`}>
            <span className="block font-medium text-ordift-ink">I&rsquo;m not sure — recommend the setup</span>
            <span className="block text-caption mt-0.5">Tell us what you&rsquo;re producing and Ordift will recommend the right support.</span>
          </button>
        </div>
      </div>

      {supportType === "unsure" ? (
        <div className="rounded-xl bg-ordift-offwhite p-6">
          <p className="font-sans text-body-small text-ordift-ink">No problem — you don&rsquo;t need to know terms like &ldquo;DIT&rdquo; or &ldquo;gaffer&rdquo; to get started. Tell Ordift what you&rsquo;re producing in your enquiry and the right crew/equipment/location setup will be recommended for you.</p>
          <p className="font-sans text-caption text-ordift-ink-muted mt-2">Production Review — no automatic price is generated until Ordift understands the scope.</p>
        </div>
      ) : (
        <>
          {supportType === "full_management" && (
            <div>
              <label className="block font-sans text-body-small font-medium text-ordift-ink mb-2">Approximate external production cost to manage (crew + equipment + studio/location combined)</label>
              <input
                type="number"
                min={0}
                value={managedExternalCostUsd}
                onChange={(e) => setManagedExternalCostUsd(e.target.value === "" ? "" : Math.max(0, Number(e.target.value)))}
                placeholder="e.g. 5000"
                className="w-full rounded-lg border border-black/15 px-4 py-2.5 font-sans text-body text-ordift-ink"
              />
              <p className="font-sans text-caption text-ordift-ink-muted mt-1">This is your rough estimate of the total external cost — Ordift will confirm the real figure via supplier quotes. The Production Management fee is calculated on this eligible managed cost, floored at the market minimum.</p>
              <label className="flex items-center gap-2 font-sans text-body-small text-ordift-ink mt-3">
                <input type="checkbox" checked={managementOvertimeRequested} onChange={(e) => setManagementOvertimeRequested(e.target.checked)} className="w-4 h-4" />
                Anticipated overtime on Ordift&rsquo;s management scope
              </label>
            </div>
          )}

          {supportType === "standalone" && (
            <div className="space-y-4">
              <div>
                <label className="block font-sans text-body-small font-medium text-ordift-ink mb-2">Locations/studios to source (Ordift coordination only — rental billed separately)</label>
                <input type="number" min={0} value={locationCount} onChange={(e) => setLocationCount(Math.max(0, Number(e.target.value)))} className="w-full rounded-lg border border-black/15 px-4 py-2.5 font-sans text-body text-ordift-ink" />
              </div>
              <div>
                <label className="block font-sans text-body-small font-medium text-ordift-ink mb-2">Approximate external equipment rental cost</label>
                <input type="number" min={0} value={equipmentRentalCostUsd} onChange={(e) => setEquipmentRentalCostUsd(e.target.value === "" ? "" : Math.max(0, Number(e.target.value)))} placeholder="Leave blank if none" className="w-full rounded-lg border border-black/15 px-4 py-2.5 font-sans text-body text-ordift-ink" />
              </div>
              <div>
                <label className="block font-sans text-body-small font-medium text-ordift-ink mb-2">Approximate crew cost to source</label>
                <input type="number" min={0} value={crewCostUsd} onChange={(e) => setCrewCostUsd(e.target.value === "" ? "" : Math.max(0, Number(e.target.value)))} placeholder="Leave blank if none" className="w-full rounded-lg border border-black/15 px-4 py-2.5 font-sans text-body text-ordift-ink" />
              </div>
            </div>
          )}

          <div>
            <label className="block font-sans text-body-small font-medium text-ordift-ink mb-2">Planning support</label>
            <select value={planningTier} onChange={(e) => setPlanningTier(e.target.value as ProductionPlanningTier)} className="w-full rounded-lg border border-black/15 px-4 py-2.5 font-sans text-body text-ordift-ink">
              {PLANNING_OPTIONS.map((p) => (
                <option key={p.slug} value={p.slug}>{p.label}</option>
              ))}
            </select>
          </div>

          <details className="rounded-lg border border-black/10 px-4 py-3">
            <summary className="cursor-pointer font-sans text-body-small font-medium text-ordift-ink select-none">Does any of this apply to your project?</summary>
            <div className="mt-3 space-y-2">
              {SCALE_SIGNAL_OPTIONS.map((s) => (
                <label key={s.slug} className="flex items-start gap-2 font-sans text-body-small text-ordift-ink">
                  <input type="checkbox" checked={scaleSignals.has(s.slug)} onChange={() => toggleScaleSignal(s.slug)} className="w-4 h-4 mt-0.5" />
                  <span>{s.label}</span>
                </label>
              ))}
            </div>
          </details>

          <div className="rounded-xl bg-ordift-offwhite p-6">
            {estimate?.ok ? (
              <>
                {estimate.lineItems.map((item, i) => (
                  <div key={i} className="flex items-baseline justify-between mt-1 first:mt-0">
                    <span className="font-sans text-body-small text-ordift-ink-muted">{item.label}</span>
                    <span className="font-sans text-body text-ordift-ink">${item.amountUsd.toFixed(2)}</span>
                  </div>
                ))}
                <div className="flex items-baseline justify-between mt-3 pt-3 border-t border-black/10">
                  <span className="font-serif font-medium text-body text-ordift-ink">Ordift Fee (indicative)</span>
                  <span className="font-serif font-medium text-section-heading text-ordift-ink">${estimate.ordiftFeeSubtotalUsd.toFixed(2)} USD</span>
                </div>
                {estimate.requiresProductionReview && (
                  <ul className="mt-3 space-y-1">
                    {estimate.productionReviewReasons.map((reason, i) => (
                      <li key={i} className="font-sans text-body-small text-ordift-ink">{reason}</li>
                    ))}
                  </ul>
                )}
              </>
            ) : (
              <p className="font-sans text-body-small text-ordift-ink">Add a scope above to see Ordift&rsquo;s indicative management/coordination fee.</p>
            )}
            <p className="font-sans text-caption text-ordift-ink-muted mt-4 font-medium">
              This is Ordift&rsquo;s own fee only. Supplier and external production costs — crew, equipment rental, studio/location rental, permits, travel, insurance, catering, and any specialist/regulated activity — are not included above and remain To Be Quoted / Supplier Quote Required until Ordift confirms them through a real supplier quote. No enquiry or calculator interaction here financially commits Ordift, and receiving a client deposit never automatically pays a supplier.
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
        {estimate?.ok ? "Start Your Enquiry" : "Request Production Review"}
      </Link>
    </div>
  );
}
