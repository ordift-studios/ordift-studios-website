"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  calculateWeddingEstimate,
  calculateEventEstimate,
  type ServiceMode,
  type WeddingTierSlug,
  type EventTierSlug,
  type LivestreamTier,
  type AddonSlug,
  type PercentageSlug,
  type AlbumSlug,
  type FrameSlug,
  type WeddingEventTierRate,
  type WeddingEventTierDeliverable,
  type WeddingEventPriorityDeliveryRate,
} from "@/lib/pricing/weddingEventEstimate";
import { encodePricingHandoff } from "@/lib/enquiry/pricingHandoff";

type Category = "wedding" | "event";

const SERVICE_MODES: { slug: ServiceMode; label: string }[] = [
  { slug: "photography", label: "Photography" },
  { slug: "film", label: "Film" },
  { slug: "photography_film", label: "Photography + Film" },
];

const WEDDING_TIERS: { slug: WeddingTierSlug; label: string }[] = [
  { slug: "chapter", label: "The Chapter" },
  { slug: "narrative", label: "The Narrative" },
  { slug: "chronicle", label: "The Chronicle" },
  { slug: "archive", label: "The Archive" },
];

const EVENT_TIERS: { slug: EventTierSlug; label: string }[] = [
  { slug: "focused", label: "Focused" },
  { slug: "half_day", label: "Half Day" },
  { slug: "full_day", label: "Full Day" },
  { slug: "extended", label: "Extended" },
];

const ALBUM_OPTIONS: { slug: AlbumSlug; label: string }[] = [
  { slug: "keepsake_album", label: "Keepsake Album" },
  { slug: "signature_album", label: "Signature Album" },
  { slug: "archive_album", label: "Archive Album" },
  { slug: "companion_album", label: "Parent / Companion Album" },
];

const FRAME_OPTIONS: { slug: FrameSlug; label: string }[] = [
  { slug: "frame_small", label: "Small / Desk Frame" },
  { slug: "frame_medium", label: "Medium Frame" },
  { slug: "frame_large", label: "Large Frame" },
  { slug: "frame_statement", label: "Statement Frame" },
];

// Ordift Weddings & Events Pricing V1 (2026-09-06) — client-side
// estimator, same read-only-props / pure-calculation shape as the
// Personal and Corporate estimators. Progressive disclosure via native
// <details> for the add-on sections keeps the initial screen from
// being overcrowded, per the approved spec. No IP/geolocation/
// nationality/religion/culture signal of any kind is read here —
// pricing is driven only by market, service mode, collection/coverage
// tier, and explicitly selected add-ons.
export default function WeddingEventEstimator({
  markets,
  weddingTierRatesByMarket,
  eventTierRatesByMarket,
  weddingDeliverables,
  eventDeliverables,
  weddingPriorityRates,
  eventPriorityRates,
  addonRatesByMarket,
  percentageRates,
}: {
  markets: { id: string; slug: string; name: string }[];
  weddingTierRatesByMarket: Record<string, WeddingEventTierRate[]>;
  eventTierRatesByMarket: Record<string, WeddingEventTierRate[]>;
  weddingDeliverables: WeddingEventTierDeliverable[];
  eventDeliverables: WeddingEventTierDeliverable[];
  weddingPriorityRates: WeddingEventPriorityDeliveryRate[];
  eventPriorityRates: WeddingEventPriorityDeliveryRate[];
  addonRatesByMarket: Record<string, Partial<Record<AddonSlug, number>>>;
  percentageRates: Partial<Record<PercentageSlug, number>>;
}) {
  const [category, setCategory] = useState<Category>("wedding");
  const [marketSlug, setMarketSlug] = useState(markets[0]?.slug ?? "");
  const [serviceMode, setServiceMode] = useState<ServiceMode>("photography_film");
  const [weddingTier, setWeddingTier] = useState<WeddingTierSlug>("narrative");
  const [eventTier, setEventTier] = useState<EventTierSlug>("half_day");

  const [additionalHours, setAdditionalHours] = useState(0);
  const [additionalPhotographerDays, setAdditionalPhotographerDays] = useState(0);
  const [additionalFilmmakerDays, setAdditionalFilmmakerDays] = useState(0);
  const [preWeddingSessionRequested, setPreWeddingSessionRequested] = useState(false);
  const [droneRequested, setDroneRequested] = useState(false);
  const [sameDayPhotoPackRequested, setSameDayPhotoPackRequested] = useState(false);
  const [sameDayHighlightFilmRequested, setSameDayHighlightFilmRequested] = useState(false);
  const [documentaryRecordingRequested, setDocumentaryRecordingRequested] = useState(false);
  const [livestreamTier, setLivestreamTier] = useState<"none" | LivestreamTier>("none");
  const [corporateOrganisationalScopeRequested, setCorporateOrganisationalScopeRequested] = useState(false);
  const [albumQuantities, setAlbumQuantities] = useState<Partial<Record<AlbumSlug, number>>>({});
  const [frameQuantities, setFrameQuantities] = useState<Partial<Record<FrameSlug, number>>>({});
  const [presentationDriveQuantity, setPresentationDriveQuantity] = useState(0);
  const [priorityDeliveryRequested, setPriorityDeliveryRequested] = useState(false);

  const addonRates = addonRatesByMarket[marketSlug] ?? {};
  const weddingTierRates = weddingTierRatesByMarket[marketSlug] ?? [];
  const eventTierRates = eventTierRatesByMarket[marketSlug] ?? [];
  const filmTierRate = (category === "wedding" ? weddingTierRates : eventTierRates).find((r) => r.serviceMode === "film" && r.tierSlug === (category === "wedding" ? weddingTier : eventTier))?.priceUsd ?? null;

  const estimate = useMemo(() => {
    const shared = {
      serviceMode,
      addonRates,
      documentaryPercentage: percentageRates.documentary_recording ?? null,
      additionalHours,
      additionalPhotographerDays,
      additionalFilmmakerDays,
      droneRequested,
      sameDayPhotoPackRequested,
      sameDayHighlightFilmRequested,
      documentaryRecordingRequested,
      filmTierRateForDocumentaryUsd: filmTierRate,
      albumQuantities,
      frameQuantities,
      presentationDriveQuantity,
      priorityDeliveryRequested,
    };
    if (category === "wedding") {
      return calculateWeddingEstimate({
        ...shared,
        tierSlug: weddingTier,
        tierRates: weddingTierRates,
        tierDeliverables: weddingDeliverables,
        priorityDeliveryRates: weddingPriorityRates,
        preWeddingSessionRequested,
      });
    }
    return calculateEventEstimate({
      ...shared,
      tierSlug: eventTier,
      tierRates: eventTierRates,
      tierDeliverables: eventDeliverables,
      priorityDeliveryRates: eventPriorityRates,
      livestreamTier: livestreamTier === "none" ? null : livestreamTier,
      corporateOrganisationalScopeRequested,
      corporateOrganisationalScopePercentage: percentageRates.corporate_organisational_scope ?? null,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    category, marketSlug, serviceMode, weddingTier, eventTier, additionalHours, additionalPhotographerDays, additionalFilmmakerDays,
    preWeddingSessionRequested, droneRequested, sameDayPhotoPackRequested, sameDayHighlightFilmRequested, documentaryRecordingRequested,
    livestreamTier, corporateOrganisationalScopeRequested, albumQuantities, frameQuantities, presentationDriveQuantity, priorityDeliveryRequested,
  ]);

  const deliverable = estimate.ok ? estimate.deliverables : null;
  const tierOptions = category === "wedding" ? WEDDING_TIERS : EVENT_TIERS;

  // Film-only bookings route to the Videography pathway; Photography
  // and combined Photography+Film both route to Photography, since
  // there's no combined pathway value and a Photo+Film production is
  // led the same way a photography booking is.
  const bookingHref = useMemo(() => {
    if (!estimate.ok) return "/book?service=general";
    const marketName = markets.find((m) => m.slug === marketSlug)?.name ?? marketSlug;
    const tierLabel = tierOptions.find((t) => t.slug === (category === "wedding" ? weddingTier : eventTier))?.label ?? "";
    const modeLabel = SERVICE_MODES.find((m) => m.slug === serviceMode)?.label ?? serviceMode;
    const pathway = serviceMode === "film" ? "videography" : "photography";
    const encoded = encodePricingHandoff({
      family: "wedding_event",
      pathway,
      summaryTitle: `${category === "wedding" ? "Wedding Celebrations" : "Events"} — ${tierLabel}`,
      summaryLines: [
        `Market: ${marketName}`,
        `Service: ${modeLabel}`,
        `${category === "wedding" ? "Collection" : "Coverage level"}: ${tierLabel}`,
        ...(estimate.priorityDeliveryRequested ? [`Priority Delivery requested (+${estimate.priorityDeliveryPercentage}%)`] : []),
        ...(estimate.corporateScopeApplied ? ["Corporate/Organisational Scope requested"] : []),
        `Estimated Total: $${estimate.totalPriceUsd.toFixed(2)}`,
      ],
    });
    return encoded ? `/book?service=${pathway}&pricing=${encoded}` : "/book?service=general";
  }, [estimate, markets, marketSlug, category, weddingTier, eventTier, serviceMode, tierOptions]);

  return (
    <div className="rounded-2xl border border-black/10 bg-white p-6 sm:p-8 space-y-6">
      <div>
        <label className="block font-sans text-body-small font-medium text-ordift-ink mb-2">What are you planning?</label>
        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={() => setCategory("wedding")} className={`rounded-lg border px-3 py-2 font-sans text-body-small ${category === "wedding" ? "border-ordift-gold-pressed bg-ordift-gold-pressed/10 text-ordift-ink" : "border-black/15 text-ordift-ink-muted"}`}>Wedding Celebrations</button>
          <button type="button" onClick={() => setCategory("event")} className={`rounded-lg border px-3 py-2 font-sans text-body-small ${category === "event" ? "border-ordift-gold-pressed bg-ordift-gold-pressed/10 text-ordift-ink" : "border-black/15 text-ordift-ink-muted"}`}>Events</button>
        </div>
      </div>

      <div>
        <label className="block font-sans text-body-small font-medium text-ordift-ink mb-2">Where will the production take place?</label>
        <select value={marketSlug} onChange={(e) => setMarketSlug(e.target.value)} className="w-full rounded-lg border border-black/15 px-4 py-2.5 font-sans text-body text-ordift-ink">
          {markets.map((m) => (
            <option key={m.slug} value={m.slug}>{m.name}</option>
          ))}
        </select>
      </div>

      <div>
        <label className="block font-sans text-body-small font-medium text-ordift-ink mb-2">Service</label>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          {SERVICE_MODES.map((m) => (
            <button key={m.slug} type="button" onClick={() => setServiceMode(m.slug)} className={`rounded-lg border px-3 py-2 font-sans text-body-small ${serviceMode === m.slug ? "border-ordift-gold-pressed bg-ordift-gold-pressed/10 text-ordift-ink" : "border-black/15 text-ordift-ink-muted"}`}>{m.label}</button>
          ))}
        </div>
      </div>

      <div>
        <label className="block font-sans text-body-small font-medium text-ordift-ink mb-2">{category === "wedding" ? "Collection" : "Coverage level"}</label>
        <div className="grid grid-cols-2 gap-2">
          {tierOptions.map((t) => (
            <button
              key={t.slug}
              type="button"
              onClick={() => (category === "wedding" ? setWeddingTier(t.slug as WeddingTierSlug) : setEventTier(t.slug as EventTierSlug))}
              className={`rounded-lg border px-3 py-2 font-sans text-body-small ${(category === "wedding" ? weddingTier : eventTier) === t.slug ? "border-ordift-gold-pressed bg-ordift-gold-pressed/10 text-ordift-ink" : "border-black/15 text-ordift-ink-muted"}`}
            >
              {t.label}
            </button>
          ))}
        </div>
        {deliverable && (
          <p className="font-sans text-caption text-ordift-ink-muted mt-2">
            {deliverable.eventDays} day{deliverable.eventDays > 1 ? "s" : ""} · {deliverable.coverageHours}h coverage · {deliverable.photographers} photographer{deliverable.photographers === 1 ? "" : "s"} · {deliverable.filmmakers} filmmaker{deliverable.filmmakers === 1 ? "" : "s"} · {deliverable.professionallyEditedImagesMin}+ edited images · {deliverable.signatureRetouchedImages} Signature Retouched
            {deliverable.highlightFilmMinMinutes != null && serviceMode !== "photography" ? ` · ${deliverable.highlightFilmMinMinutes}–${deliverable.highlightFilmMaxMinutes} min Highlight Film` : ""}
          </p>
        )}
      </div>

      {/* Progressive disclosure — Add-ons */}
      <details className="rounded-lg border border-black/10 px-4 py-3">
        <summary className="cursor-pointer font-sans text-body-small font-medium text-ordift-ink select-none">Additional coverage &amp; crew</summary>
        <div className="mt-3 space-y-3">
          <label className="block font-sans text-caption text-ordift-ink-muted">Additional hours ({SERVICE_MODES.find((m) => m.slug === serviceMode)?.label})
            <input type="number" min={0} value={additionalHours} onChange={(e) => setAdditionalHours(Math.max(0, Number(e.target.value)))} className="mt-1 w-full rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small" />
          </label>
          <label className="block font-sans text-caption text-ordift-ink-muted">Additional photographer(s), per event day
            <input type="number" min={0} value={additionalPhotographerDays} onChange={(e) => setAdditionalPhotographerDays(Math.max(0, Number(e.target.value)))} className="mt-1 w-full rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small" />
          </label>
          <label className="block font-sans text-caption text-ordift-ink-muted">Additional filmmaker(s), per event day
            <input type="number" min={0} value={additionalFilmmakerDays} onChange={(e) => setAdditionalFilmmakerDays(Math.max(0, Number(e.target.value)))} className="mt-1 w-full rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small" />
          </label>
          <p className="font-sans text-caption text-ordift-ink-muted">Overtime beyond contracted coverage, where Ordift agrees to continue, uses the same additional-hour rate. Additional crew is subject to availability.</p>
        </div>
      </details>

      <details className="rounded-lg border border-black/10 px-4 py-3">
        <summary className="cursor-pointer font-sans text-body-small font-medium text-ordift-ink select-none">Extras</summary>
        <div className="mt-3 space-y-2">
          {category === "wedding" && (
            <label className="flex items-center gap-2 font-sans text-body-small text-ordift-ink">
              <input type="checkbox" checked={preWeddingSessionRequested} onChange={(e) => setPreWeddingSessionRequested(e.target.checked)} className="w-4 h-4" />
              Pre-Wedding Session {addonRates.pre_wedding_session != null ? `($${addonRates.pre_wedding_session.toFixed(0)})` : ""}
            </label>
          )}
          <label className="flex items-center gap-2 font-sans text-body-small text-ordift-ink">
            <input type="checkbox" checked={droneRequested} onChange={(e) => setDroneRequested(e.target.checked)} className="w-4 h-4" />
            Drone coverage {addonRates.drone != null ? `($${addonRates.drone.toFixed(0)})` : ""}
          </label>
          <p className="font-sans text-caption text-ordift-ink-muted pl-6">Subject to local law/regulation, venue permission, weather, safety, and Ordift availability — not an unconditional flight guarantee.</p>

          <label className="flex items-center gap-2 font-sans text-body-small text-ordift-ink">
            <input type="checkbox" checked={sameDayPhotoPackRequested} onChange={(e) => setSameDayPhotoPackRequested(e.target.checked)} className="w-4 h-4" />
            Same-Day Photo Social Pack {addonRates.same_day_photo_pack != null ? `($${addonRates.same_day_photo_pack.toFixed(0)})` : ""}
          </label>
          <label className="flex items-center gap-2 font-sans text-body-small text-ordift-ink">
            <input type="checkbox" checked={sameDayHighlightFilmRequested} onChange={(e) => setSameDayHighlightFilmRequested(e.target.checked)} className="w-4 h-4" />
            Same-Day Highlight Film {addonRates.same_day_highlight_film != null ? `($${addonRates.same_day_highlight_film.toFixed(0)})` : ""}
          </label>
          <p className="font-sans text-caption text-ordift-ink-muted pl-6">Same-Day Content is subject to crew/editor availability — separate from Priority Delivery.</p>

          {serviceMode !== "photography" && (
            <>
              <label className="flex items-center gap-2 font-sans text-body-small text-ordift-ink">
                <input
                  type="checkbox"
                  checked={documentaryRecordingRequested}
                  disabled={!!deliverable?.includesDocumentary}
                  onChange={(e) => setDocumentaryRecordingRequested(e.target.checked)}
                  className="w-4 h-4"
                />
                Full Event / Documentary Recording
              </label>
              <p className="font-sans text-caption text-ordift-ink-muted pl-6">
                {deliverable?.includesDocumentary ? "Already included in this collection — no additional charge." : "20% of the Film base price, subject to each market's minimum."}
              </p>
            </>
          )}

          {category === "event" && (
            <>
              <label className="block font-sans text-caption text-ordift-ink-muted mt-2">Livestreaming
                <select value={livestreamTier} onChange={(e) => setLivestreamTier(e.target.value as "none" | LivestreamTier)} className="mt-1 w-full rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small">
                  <option value="none">None</option>
                  <option value="single_basic">Single-Stream Basic {addonRates.livestream_single_basic != null ? `($${addonRates.livestream_single_basic.toFixed(0)})` : ""}</option>
                  <option value="multicam_standard">Multi-Camera Standard {addonRates.livestream_multicam_standard != null ? `($${addonRates.livestream_multicam_standard.toFixed(0)})` : ""}</option>
                  <option value="advanced_hybrid">Advanced / Hybrid — Custom Proposal</option>
                </select>
              </label>
              <p className="font-sans text-caption text-ordift-ink-muted">Subject to technical assessment, connectivity, platform requirements, venue conditions and production availability.</p>

              <label className="flex items-center gap-2 font-sans text-body-small text-ordift-ink mt-2">
                <input type="checkbox" checked={corporateOrganisationalScopeRequested} onChange={(e) => setCorporateOrganisationalScopeRequested(e.target.checked)} className="w-4 h-4" />
                This is a corporate/organisational event with materially expanded production scope (formal brief, structured shot list, executive coverage, brand/PR deliverables, press/stakeholder requirements)
              </label>
              <p className="font-sans text-caption text-ordift-ink-muted pl-6">Not applied merely because a company is the client — only when production scope is genuinely expanded.</p>
            </>
          )}
        </div>
      </details>

      <details className="rounded-lg border border-black/10 px-4 py-3">
        <summary className="cursor-pointer font-sans text-body-small font-medium text-ordift-ink select-none">Albums, frames &amp; presentation</summary>
        <div className="mt-3 space-y-3">
          {ALBUM_OPTIONS.map((a) => (
            <label key={a.slug} className="flex items-center justify-between gap-2 font-sans text-body-small text-ordift-ink">
              <span>{a.label} {addonRates[a.slug] != null ? `($${addonRates[a.slug]!.toFixed(0)} each)` : ""}</span>
              <input type="number" min={0} value={albumQuantities[a.slug] ?? 0} onChange={(e) => setAlbumQuantities((prev) => ({ ...prev, [a.slug]: Math.max(0, Number(e.target.value)) }))} className="w-20 rounded-lg border border-black/15 px-2 py-1.5 font-sans text-body-small" />
            </label>
          ))}
          {FRAME_OPTIONS.map((f) => (
            <label key={f.slug} className="flex items-center justify-between gap-2 font-sans text-body-small text-ordift-ink">
              <span>{f.label} {addonRates[f.slug] != null ? `($${addonRates[f.slug]!.toFixed(0)} each)` : ""}</span>
              <input type="number" min={0} value={frameQuantities[f.slug] ?? 0} onChange={(e) => setFrameQuantities((prev) => ({ ...prev, [f.slug]: Math.max(0, Number(e.target.value)) }))} className="w-20 rounded-lg border border-black/15 px-2 py-1.5 font-sans text-body-small" />
            </label>
          ))}
          <label className="flex items-center justify-between gap-2 font-sans text-body-small text-ordift-ink">
            <span>Presentation Drive {addonRates.presentation_drive != null ? `($${addonRates.presentation_drive.toFixed(0)} each)` : ""}</span>
            <input type="number" min={0} value={presentationDriveQuantity} onChange={(e) => setPresentationDriveQuantity(Math.max(0, Number(e.target.value)))} className="w-20 rounded-lg border border-black/15 px-2 py-1.5 font-sans text-body-small" />
          </label>
          <p className="font-sans text-caption text-ordift-ink-muted">Special materials, finishes, oversized products, shipping and customs may be separately quoted. Source/RAW files remain available by request — get in touch and we&rsquo;ll advise.</p>
        </div>
      </details>

      <div>
        <label className="flex items-center gap-2 font-sans text-body-small text-ordift-ink">
          <input type="checkbox" checked={priorityDeliveryRequested} onChange={(e) => setPriorityDeliveryRequested(e.target.checked)} className="w-4 h-4" />
          Request Priority Delivery
        </label>
        <p className="font-sans text-caption text-ordift-ink-muted mt-1">Queue priority for finished post-production — not Same-Day Content. Subject to Ordift&rsquo;s availability and confirmation, and never applied unless you request it.</p>
      </div>

      <div className="rounded-xl bg-ordift-offwhite p-6">
        {estimate.ok ? (
          <>
            <div className="flex items-baseline justify-between">
              <span className="font-sans text-body-small text-ordift-ink-muted">Base {category === "wedding" ? "collection" : "coverage"} price</span>
              <span className="font-sans text-body text-ordift-ink">${estimate.baseTierPriceUsd.toFixed(2)}</span>
            </div>
            {estimate.lineItems.map((item, i) => (
              <div key={i} className="flex items-baseline justify-between mt-1">
                <span className="font-sans text-body-small text-ordift-ink-muted">{item.label}</span>
                <span className="font-sans text-body text-ordift-ink">${item.amountUsd.toFixed(2)}</span>
              </div>
            ))}
            {estimate.documentaryAlreadyIncluded && (
              <p className="font-sans text-caption text-ordift-ink-muted mt-1">Documentary component already included in this collection — not charged again.</p>
            )}
            {estimate.corporateScopeApplied && (
              <div className="flex items-baseline justify-between mt-1">
                <span className="font-sans text-body-small text-ordift-ink-muted">Corporate/Organisational Scope (+{percentageRates.corporate_organisational_scope}%)</span>
                <span className="font-sans text-body text-ordift-ink">${estimate.corporateScopeAmountUsd.toFixed(2)}</span>
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
          </>
        ) : (
          <p className="font-sans text-body-small text-ordift-ink">{estimate.reason}</p>
        )}
        <p className="font-sans text-caption text-ordift-ink-muted mt-4">
          This is an estimate, not a final contract. Highly complex multi-day, multi-location, or multi-function productions, unusual licensing, or exceptional turnaround requirements may require a Custom Production Proposal.
        </p>
      </div>

      <Link href={bookingHref} className="block text-center rounded-lg bg-ordift-ink text-white px-6 py-3 font-sans text-body-small hover:opacity-90 transition-opacity">
        {estimate.ok ? "Start Your Enquiry" : "Request a Custom Proposal"}
      </Link>
    </div>
  );
}
