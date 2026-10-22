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
import {
  getActivePackageRates,
  getActiveRetainerRates,
  getActiveAddonRates as getActiveContentCreationAddonRates,
  getActivePercentageRates as getActiveContentCreationPercentageRates,
  type ContentCreationPackageRate,
  type ContentCreationRetainerRate,
  type ContentCreationAddonSlug,
  type ContentCreationPercentageSlug,
} from "@/lib/pricing/contentCreationPricing";
import {
  getActiveTierRates as getActiveBrandingTierRates,
  getActiveRevisionMinimum as getActiveBrandingRevisionMinimum,
  getActivePercentageRates as getActiveBrandingPercentageRates,
  type BrandingTierRate,
  type BrandingPercentageSlug,
} from "@/lib/pricing/brandingPricing";
import {
  getActiveRates as getActiveProductionRates,
  getActivePercentageRates as getActiveProductionPercentageRates,
  type ProductionServicesRate,
  type ProductionServicesPercentageSlug,
} from "@/lib/pricing/productionServicesPricing";
import PersonalSessionEstimator from "./PersonalSessionEstimator";
import CorporateHeadshotEstimator from "./CorporateHeadshotEstimator";
import WeddingEventEstimator from "./WeddingEventEstimator";
import CommercialEstimator from "./CommercialEstimator";
import GraphicDesignEstimator from "./GraphicDesignEstimator";
import ContentCreationEstimator from "./ContentCreationEstimator";
import BrandingEstimator from "./BrandingEstimator";
import ProductionServicesEstimator from "./ProductionServicesEstimator";

export type PricingFamily = "personal" | "corporate" | "wedding_event" | "commercial" | "graphic_design" | "content_creation" | "branding" | "production_services";

export const PRICING_FAMILIES: readonly { key: PricingFamily; label: string }[] = [
  { key: "personal", label: "Personal Portrait" },
  { key: "corporate", label: "Corporate & Headshots" },
  { key: "wedding_event", label: "Weddings & Events" },
  { key: "commercial", label: "Commercial / Advertising" },
  { key: "graphic_design", label: "Graphic Design" },
  { key: "content_creation", label: "Content Creation" },
  { key: "branding", label: "Branding & Creative Strategy" },
  { key: "production_services", label: "Production Services" },
];

export function normalizePricingFamily(param: string | undefined): PricingFamily {
  return PRICING_FAMILIES.find((f) => f.key === param)?.key ?? "personal";
}

// The ONE place that loads the active rate cards for a service family and renders its estimator. Used by the public /pricing page and by the
// internal Enquiries & Quick Pricing workspace, so staff see exactly the same governed rates and formulas customers do. Server-rendered on every
// request (never a cached snapshot); read-only - it creates no record.
export default async function PricingEstimatorPanel({ family }: { family: PricingFamily }) {
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

  const contentCreationData =
    family === "content_creation"
      ? await (async () => {
          const [packageEntries, retainerEntries, addonEntries, percentages] = await Promise.all([
            Promise.all(markets.map(async (m) => [m.slug, await getActivePackageRates(m.slug)] as const)),
            Promise.all(markets.map(async (m) => [m.slug, await getActiveRetainerRates(m.slug)] as const)),
            Promise.all(markets.map(async (m) => [m.slug, await getActiveContentCreationAddonRates(m.slug)] as const)),
            getActiveContentCreationPercentageRates(),
          ]);
          return {
            packageRatesByMarket: Object.fromEntries(packageEntries) as Record<string, ContentCreationPackageRate[]>,
            retainerRatesByMarket: Object.fromEntries(retainerEntries) as Record<string, ContentCreationRetainerRate[]>,
            addonRatesByMarket: Object.fromEntries(addonEntries) as Record<string, Partial<Record<ContentCreationAddonSlug, number>>>,
            percentages: percentages as Partial<Record<ContentCreationPercentageSlug, number>>,
          };
        })()
      : null;

  const brandingData =
    family === "branding"
      ? await (async () => {
          const [tierEntries, revisionMinimumEntries, percentages] = await Promise.all([
            Promise.all(markets.map(async (m) => [m.slug, await getActiveBrandingTierRates(m.slug)] as const)),
            Promise.all(markets.map(async (m) => [m.slug, await getActiveBrandingRevisionMinimum(m.slug)] as const)),
            getActiveBrandingPercentageRates(),
          ]);
          return {
            tierRatesByMarket: Object.fromEntries(tierEntries) as Record<string, BrandingTierRate[]>,
            revisionMinimumByMarket: Object.fromEntries(revisionMinimumEntries) as Record<string, number | null>,
            percentages: percentages as Partial<Record<BrandingPercentageSlug, number>>,
          };
        })()
      : null;

  const productionServicesData =
    family === "production_services"
      ? await (async () => {
          const [rateEntries, percentages] = await Promise.all([
            Promise.all(markets.map(async (m) => [m.slug, await getActiveProductionRates(m.slug)] as const)),
            getActiveProductionPercentageRates(),
          ]);
          return {
            ratesByMarket: Object.fromEntries(rateEntries) as Record<string, ProductionServicesRate[]>,
            percentages: percentages as Partial<Record<ProductionServicesPercentageSlug, number>>,
          };
        })()
      : null;

  return (
    <>
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
    ) : family === "graphic_design" && graphicDesignData ? (
      <GraphicDesignEstimator
        markets={markets}
        deliverableRatesByMarket={graphicDesignData.deliverableRatesByMarket}
        complexityFactors={graphicDesignData.complexityFactors}
        addonRatesByMarket={graphicDesignData.addonRatesByMarket}
        percentages={graphicDesignData.percentages}
      />
    ) : family === "content_creation" && contentCreationData ? (
      <ContentCreationEstimator
        markets={markets}
        packageRatesByMarket={contentCreationData.packageRatesByMarket}
        retainerRatesByMarket={contentCreationData.retainerRatesByMarket}
        addonRatesByMarket={contentCreationData.addonRatesByMarket}
        percentages={contentCreationData.percentages}
      />
    ) : family === "branding" && brandingData ? (
      <BrandingEstimator
        markets={markets}
        tierRatesByMarket={brandingData.tierRatesByMarket}
        revisionMinimumByMarket={brandingData.revisionMinimumByMarket}
        percentages={brandingData.percentages}
      />
    ) : productionServicesData ? (
      <ProductionServicesEstimator markets={markets} ratesByMarket={productionServicesData.ratesByMarket} percentages={productionServicesData.percentages} />
    ) : null}
    </>
  );
}
