import type { Metadata } from "next";
import Link from "next/link";
import NavBar from "@/components/NavBar";
import Footer from "@/components/Footer";
import { listActivePricingMarkets, getActivePersonalSessionRates, listAllSubjectCategories, getActiveAdditionalRetouchRate, type PersonalSessionRate } from "@/lib/pricing/personalSessionPricing";
import {
  getActiveCorporateHeadshotRates,
  getActiveCorporateTeamTierRates,
  getActiveCorporateMinimumBooking,
  getActiveCorporateRetouchRate,
  getAllActiveCorporatePriorityDeliveryPercentages,
  type CorporateHeadshotRate,
  type CorporateTeamTierRate,
} from "@/lib/pricing/corporateHeadshotPricing";
import {
  getActiveTierRates,
  getTierDeliverables,
  getPriorityDeliveryRates,
  getAddonRates,
  getPercentageRates,
  type WeddingEventTierRate,
  type WeddingEventTierDeliverable,
  type WeddingEventPriorityDeliveryRate,
  type AddonSlug,
  type PercentageSlug,
} from "@/lib/pricing/weddingEventPricing";
import {
  getActiveCreativeFeeRates,
  getActiveCatalogueBaseRate,
  getActiveCatalogueMinimum,
  getActiveCatalogueVolumeFactors,
  getActiveCatalogueComplexityFactors,
  getActivePostProductionRates,
  getActiveCommercialPercentages,
  getActiveLicensingFactors,
  getActiveReviewThreshold,
  type CommercialCreativeFeeRate,
  type CommercialCatalogueVolumeFactor,
  type CommercialCatalogueComplexityFactor,
  type CommercialPostProductionRate,
  type CommercialLicensingFactors,
  type CommercialReviewThreshold,
} from "@/lib/pricing/commercialPricing";
import {
  getActiveDeliverableRates,
  getActiveComplexityFactors,
  getActiveAddonRates,
  getActivePercentageRates as getActiveGraphicDesignPercentageRates,
  type GraphicDesignDeliverableRate,
  type GraphicDesignComplexityFactor,
  type GraphicDesignAddonSlug,
  type GraphicDesignPercentageSlug,
} from "@/lib/pricing/graphicDesignPricing";
import PersonalSessionEstimator from "./PersonalSessionEstimator";
import CorporateHeadshotEstimator from "./CorporateHeadshotEstimator";
import WeddingEventEstimator from "./WeddingEventEstimator";
import CommercialEstimator from "./CommercialEstimator";
import GraphicDesignEstimator from "./GraphicDesignEstimator";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://ordiftstudios.com";
const TITLE = "Pricing — Ordift Studios";
const DESCRIPTION = "Build your session and see an estimate for Ordift Studios' Personal Portrait, Corporate & Headshots, Weddings & Events, Commercial & Advertising, or Graphic Design work, based on where your project takes place.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: `${SITE_URL}/pricing` },
  openGraph: { title: TITLE, description: DESCRIPTION, url: `${SITE_URL}/pricing`, type: "website" },
};

const FAMILIES = [
  { key: "personal", label: "Personal Portrait" },
  { key: "corporate", label: "Corporate & Headshots" },
  { key: "wedding_event", label: "Weddings & Events" },
  { key: "commercial", label: "Commercial / Advertising" },
  { key: "graphic_design", label: "Graphic Design" },
] as const;

// Ordift Pricing Engine (2026-09-06) — public entry point. Server-
// rendered on every request (no ISR/static caching — pricing should
// never be served stale from a build-time snapshot). All markets/
// rates/category data is fetched server-side with the admin/service-
// role client (see personalSessionPricing.ts's own doc comment on why
// that's the correct, established pattern for public reference data)
// and handed to the relevant client estimator as plain props — the
// visitor's browser never queries Supabase directly. Family selection
// (?family=personal|corporate) is a plain Link-based query param, same
// pattern as /admin/payables?status= — no client JS needed for the
// switch itself.
export default async function PricingPage({ searchParams }: { searchParams: Promise<{ family?: string }> }) {
  const { family: familyParam } = await searchParams;
  const family =
    familyParam === "corporate"
      ? "corporate"
      : familyParam === "wedding_event"
        ? "wedding_event"
        : familyParam === "commercial"
          ? "commercial"
          : familyParam === "graphic_design"
            ? "graphic_design"
            : "personal";

  const markets = await listActivePricingMarkets();

  const personalData =
    family === "personal"
      ? await (async () => {
          const [ratesByMarketEntries, subjectCategories, retouchRateEntries] = await Promise.all([
            Promise.all(markets.map(async (m) => [m.slug, await getActivePersonalSessionRates(m.slug)] as const)),
            listAllSubjectCategories(),
            Promise.all(markets.map(async (m) => [m.slug, await getActiveAdditionalRetouchRate(m.slug)] as const)),
          ]);
          return {
            ratesByMarket: Object.fromEntries(ratesByMarketEntries) as Record<string, PersonalSessionRate[]>,
            subjectCategories,
            retouchRateByMarket: Object.fromEntries(retouchRateEntries) as Record<string, number | null>,
          };
        })()
      : null;

  const corporateData =
    family === "corporate"
      ? await (async () => {
          const [headshotEntries, teamTierEntries, minimumEntries, retouchEntries, priorityDeliveryPercentageByScope] = await Promise.all([
            Promise.all(markets.map(async (m) => [m.slug, await getActiveCorporateHeadshotRates(m.slug)] as const)),
            Promise.all(markets.map(async (m) => [m.slug, await getActiveCorporateTeamTierRates(m.slug)] as const)),
            Promise.all(markets.map(async (m) => [m.slug, await getActiveCorporateMinimumBooking(m.slug)] as const)),
            Promise.all(markets.map(async (m) => [m.slug, await getActiveCorporateRetouchRate(m.slug)] as const)),
            getAllActiveCorporatePriorityDeliveryPercentages(),
          ]);
          return {
            headshotRatesByMarket: Object.fromEntries(headshotEntries) as Record<string, CorporateHeadshotRate[]>,
            teamTierRatesByMarket: Object.fromEntries(teamTierEntries) as Record<string, CorporateTeamTierRate[]>,
            minimumBookingByMarket: Object.fromEntries(minimumEntries) as Record<string, number | null>,
            retouchRateByMarket: Object.fromEntries(retouchEntries) as Record<string, number | null>,
            priorityDeliveryPercentageByScope,
          };
        })()
      : null;

  const weddingEventData =
    family === "wedding_event"
      ? await (async () => {
          const [weddingTierEntries, eventTierEntries, weddingDeliverables, eventDeliverables, weddingPriorityRates, eventPriorityRates, addonEntries, percentageRates] = await Promise.all([
            Promise.all(markets.map(async (m) => [m.slug, await getActiveTierRates("wedding", m.slug)] as const)),
            Promise.all(markets.map(async (m) => [m.slug, await getActiveTierRates("event", m.slug)] as const)),
            getTierDeliverables("wedding"),
            getTierDeliverables("event"),
            getPriorityDeliveryRates("wedding"),
            getPriorityDeliveryRates("event"),
            Promise.all(markets.map(async (m) => [m.slug, await getAddonRates(m.slug)] as const)),
            getPercentageRates(),
          ]);
          return {
            weddingTierRatesByMarket: Object.fromEntries(weddingTierEntries) as Record<string, WeddingEventTierRate[]>,
            eventTierRatesByMarket: Object.fromEntries(eventTierEntries) as Record<string, WeddingEventTierRate[]>,
            weddingDeliverables: weddingDeliverables as WeddingEventTierDeliverable[],
            eventDeliverables: eventDeliverables as WeddingEventTierDeliverable[],
            weddingPriorityRates: weddingPriorityRates as WeddingEventPriorityDeliveryRate[],
            eventPriorityRates: eventPriorityRates as WeddingEventPriorityDeliveryRate[],
            addonRatesByMarket: Object.fromEntries(addonEntries) as Record<string, Partial<Record<AddonSlug, number>>>,
            percentageRates: percentageRates as Partial<Record<PercentageSlug, number>>,
          };
        })()
      : null;

  const commercialData =
    family === "commercial"
      ? await (async () => {
          const [creativeFeeEntries, catalogueBaseEntries, catalogueMinimumEntries, volumeFactors, complexityFactors, postProductionRates, percentages, licensingFactors, reviewThresholdEntries] =
            await Promise.all([
              Promise.all(markets.map(async (m) => [m.slug, await getActiveCreativeFeeRates(m.slug)] as const)),
              Promise.all(markets.map(async (m) => [m.slug, await getActiveCatalogueBaseRate(m.slug)] as const)),
              Promise.all(markets.map(async (m) => [m.slug, await getActiveCatalogueMinimum(m.slug)] as const)),
              getActiveCatalogueVolumeFactors(),
              getActiveCatalogueComplexityFactors(),
              getActivePostProductionRates(),
              getActiveCommercialPercentages(),
              getActiveLicensingFactors(),
              Promise.all(markets.map(async (m) => [m.slug, await getActiveReviewThreshold(m.slug)] as const)),
            ]);
          return {
            creativeFeeRatesByMarket: Object.fromEntries(creativeFeeEntries) as Record<string, CommercialCreativeFeeRate[]>,
            catalogueBaseRateByMarket: Object.fromEntries(catalogueBaseEntries) as Record<string, number | null>,
            catalogueMinimumByMarket: Object.fromEntries(catalogueMinimumEntries) as Record<string, number | null>,
            volumeFactors: volumeFactors as CommercialCatalogueVolumeFactor[],
            complexityFactors: complexityFactors as CommercialCatalogueComplexityFactor[],
            postProductionRates: postProductionRates as CommercialPostProductionRate[],
            priorityPercentage: percentages.priority_postproduction ?? null,
            licensingFloorPercentage: percentages.licensing_floor ?? null,
            licensingFactors: licensingFactors as CommercialLicensingFactors,
            reviewThresholdByMarket: Object.fromEntries(reviewThresholdEntries) as Record<string, CommercialReviewThreshold | null>,
          };
        })()
      : null;

  const graphicDesignData =
    family === "graphic_design"
      ? await (async () => {
          const [deliverableEntries, complexityFactors, addonEntries, percentages] = await Promise.all([
            Promise.all(markets.map(async (m) => [m.slug, await getActiveDeliverableRates(m.slug)] as const)),
            getActiveComplexityFactors(),
            Promise.all(markets.map(async (m) => [m.slug, await getActiveAddonRates(m.slug)] as const)),
            getActiveGraphicDesignPercentageRates(),
          ]);
          return {
            deliverableRatesByMarket: Object.fromEntries(deliverableEntries) as Record<string, GraphicDesignDeliverableRate[]>,
            complexityFactors: complexityFactors as GraphicDesignComplexityFactor[],
            addonRatesByMarket: Object.fromEntries(addonEntries) as Record<string, Partial<Record<GraphicDesignAddonSlug, number>>>,
            percentages: percentages as Partial<Record<GraphicDesignPercentageSlug, number>>,
          };
        })()
      : null;

  return (
    <main>
      <NavBar />

      <section className="bg-ordift-navy-950 text-white px-4 sm:px-8 py-16 sm:py-24">
        <div className="max-w-3xl mx-auto text-center">
          <p className="font-sans font-semibold uppercase tracking-[0.2em] text-eyebrow text-ordift-gold-pressed mb-4">Pricing</p>
          <h1 className="font-serif font-medium text-section-heading lg:text-section-heading-desktop">Build your session.</h1>
          <p className="font-sans text-body text-white/80 mt-4">
            Pricing is based on where your shoot takes place — not where you live.
          </p>
        </div>
      </section>

      <section className="px-4 sm:px-8 pt-10">
        <div className="max-w-xl mx-auto flex flex-wrap justify-center gap-2">
          {FAMILIES.map((f) => (
            <Link
              key={f.key}
              href={`/pricing?family=${f.key}`}
              className={`rounded-full border px-5 py-2 font-sans text-body-small ${family === f.key ? "border-ordift-gold-pressed bg-ordift-gold-pressed/10 text-ordift-ink" : "border-black/15 text-ordift-ink-muted"}`}
            >
              {f.label}
            </Link>
          ))}
        </div>
      </section>

      <section className="px-4 sm:px-8 py-16 sm:py-24">
        <div className="max-w-xl mx-auto">
          {markets.length === 0 ? (
            <div className="rounded-2xl border border-black/10 bg-white p-8 text-center">
              <p className="font-sans text-body text-ordift-ink">Pricing isn&rsquo;t published for any market yet — get in touch directly and we&rsquo;ll put together a proposal.</p>
            </div>
          ) : family === "personal" && personalData ? (
            <PersonalSessionEstimator markets={markets} ratesByMarket={personalData.ratesByMarket} subjectCategories={personalData.subjectCategories} retouchRateByMarket={personalData.retouchRateByMarket} />
          ) : family === "corporate" && corporateData ? (
            <CorporateHeadshotEstimator
              markets={markets}
              headshotRatesByMarket={corporateData.headshotRatesByMarket}
              teamTierRatesByMarket={corporateData.teamTierRatesByMarket}
              minimumBookingByMarket={corporateData.minimumBookingByMarket}
              retouchRateByMarket={corporateData.retouchRateByMarket}
              priorityDeliveryPercentageByScope={corporateData.priorityDeliveryPercentageByScope}
            />
          ) : family === "wedding_event" && weddingEventData ? (
            <WeddingEventEstimator
              markets={markets}
              weddingTierRatesByMarket={weddingEventData.weddingTierRatesByMarket}
              eventTierRatesByMarket={weddingEventData.eventTierRatesByMarket}
              weddingDeliverables={weddingEventData.weddingDeliverables}
              eventDeliverables={weddingEventData.eventDeliverables}
              weddingPriorityRates={weddingEventData.weddingPriorityRates}
              eventPriorityRates={weddingEventData.eventPriorityRates}
              addonRatesByMarket={weddingEventData.addonRatesByMarket}
              percentageRates={weddingEventData.percentageRates}
            />
          ) : family === "commercial" && commercialData ? (
            <CommercialEstimator
              markets={markets}
              creativeFeeRatesByMarket={commercialData.creativeFeeRatesByMarket}
              catalogueBaseRateByMarket={commercialData.catalogueBaseRateByMarket}
              catalogueMinimumByMarket={commercialData.catalogueMinimumByMarket}
              volumeFactors={commercialData.volumeFactors}
              complexityFactors={commercialData.complexityFactors}
              postProductionRates={commercialData.postProductionRates}
              priorityPercentage={commercialData.priorityPercentage}
              licensingFloorPercentage={commercialData.licensingFloorPercentage}
              licensingFactors={commercialData.licensingFactors}
              reviewThresholdByMarket={commercialData.reviewThresholdByMarket}
            />
          ) : graphicDesignData ? (
            <GraphicDesignEstimator
              markets={markets}
              deliverableRatesByMarket={graphicDesignData.deliverableRatesByMarket}
              complexityFactors={graphicDesignData.complexityFactors}
              addonRatesByMarket={graphicDesignData.addonRatesByMarket}
              percentages={graphicDesignData.percentages}
            />
          ) : null}
          <p className="font-sans text-caption text-ordift-ink-muted mt-6 text-center">
            Content Creation, Branding &amp; Strategy and Production Services work is proposal-based — <a href="/book?service=general" className="underline">start an enquiry</a> and we&rsquo;ll put together the right quote for your project.
          </p>
        </div>
      </section>

      <Footer />
    </main>
  );
}
