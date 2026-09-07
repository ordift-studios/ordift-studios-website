import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/portal/roles";
import { authorizeWithSuperAdminOverride, FINANCE_CAPABILITIES } from "@/lib/organization/authority";
import {
  listAllPricingMarketsForAdmin,
  getActivePersonalSessionRates,
  listAllSubjectCategories,
  getActiveAdditionalRetouchRate,
} from "@/lib/pricing/personalSessionPricing";
import { listAllDiscountCodesForAdmin } from "@/lib/pricing/discounts";
import {
  getActiveCorporateHeadshotRates,
  getActiveCorporateTeamTierRates,
  getActiveCorporateMinimumBooking,
  getActiveCorporateRetouchRate,
  getAllActiveCorporatePriorityDeliveryPercentages,
  type CorporatePriorityDeliveryScopeSlug,
} from "@/lib/pricing/corporateHeadshotPricing";
import {
  getActiveTierRates,
  getTierDeliverables,
  getPriorityDeliveryRates,
  getAddonRates,
  getPercentageRates,
  type ServiceMode,
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
  type CommercialServiceMode,
  type CommercialPostProductionItemSlug,
} from "@/lib/pricing/commercialPricing";
import {
  getActiveDeliverableRates,
  getActiveComplexityFactors,
  getActiveAddonRates as getActiveGraphicDesignAddonRates,
  getActivePercentageRates as getActiveGraphicDesignPercentageRates,
  type GraphicDesignDeliverableSlug,
} from "@/lib/pricing/graphicDesignPricing";
import {
  getActivePackageRates,
  getActiveRetainerRates,
  getActiveAddonRates as getActiveContentCreationAddonRates,
  getActivePercentageRates as getActiveContentCreationPercentageRates,
  type ContentCreationPackageSlug,
  type ContentCreationRetainerSlug,
} from "@/lib/pricing/contentCreationPricing";
import {
  getActiveTierRates as getActiveBrandingTierRates,
  getActiveRevisionMinimum as getActiveBrandingRevisionMinimum,
  getActivePercentageRates as getActiveBrandingPercentageRates,
  type BrandingTierSlug,
} from "@/lib/pricing/brandingPricing";
import {
  getActiveRates as getActiveProductionRates,
  getActivePercentageRates as getActiveProductionPercentageRates,
  type ProductionServicesRateSlug,
} from "@/lib/pricing/productionServicesPricing";
import {
  createPersonalSessionRateVersionAction,
  setPricingMarketActiveAction,
  createDiscountCodeAction,
  setDiscountCodeActiveAction,
  createSubjectCategoryMultiplierVersionAction,
  createAdditionalRetouchRateVersionAction,
  applyManualDiscountAction,
  createCorporateHeadshotRateVersionAction,
  createCorporateTeamTierRateVersionAction,
  createCorporateMinimumBookingVersionAction,
  createCorporateRetouchRateVersionAction,
  createCorporatePriorityDeliveryVersionAction,
  createWeddingEventTierRateVersionAction,
  createWeddingEventPriorityDeliveryVersionAction,
  createWeddingEventAddonRateVersionAction,
  createWeddingEventPercentageRateVersionAction,
  createCommercialCreativeFeeRateVersionAction,
  createCommercialCatalogueBaseRateVersionAction,
  createCommercialCatalogueMinimumVersionAction,
  createCommercialPostProductionRateVersionAction,
  createCommercialPercentageVersionAction,
  createCommercialLicensingFactorVersionAction,
  createCommercialReviewThresholdVersionAction,
  createGraphicDesignDeliverableRateVersionAction,
  createGraphicDesignComplexityFactorVersionAction,
  createGraphicDesignAddonRateVersionAction,
  createGraphicDesignPercentageVersionAction,
  createContentCreationPackageRateVersionAction,
  createContentCreationRetainerRateVersionAction,
  createContentCreationAddonRateVersionAction,
  createContentCreationPercentageVersionAction,
  createBrandingTierRateVersionAction,
  createBrandingRevisionMinimumVersionAction,
  createBrandingPercentageVersionAction,
  createProductionRateVersionAction,
  createProductionPercentageVersionAction,
} from "./actions";
import ManualDiscountForm from "./ManualDiscountForm";
import DeleteDiscountButton from "./DeleteDiscountButton";
import { TABS, TAB_GROUPS } from "./tabsConfig";

export const metadata: Metadata = {
  title: "Pricing — Ordift Studios Admin",
  robots: { index: false, follow: false },
};

const DURATIONS = [1, 2, 3, 4] as const;

// Ordift Admin Pricing navigation order (2026-09-07) — the four
// implemented pricing/service families appear together first, in the
// order they were built, followed by supporting/shared controls.
// Navigation/display order only: every tab key, and every value/
// calculation behind it, is unchanged. This is NOT the deferred
// final all-family Admin Pricing redesign.
// Final Admin Pricing navigation consolidation (2026-09-07) — now that
// all eight pricing/service engines exist, the tab list is split into
// two visually grouped, restrained sections (SERVICE PRICING / SHARED
// CONFIGURATION) purely for navigation clarity. This is presentation
// only: route keys, calculator behavior, and query-param/deep-link
// behavior are all unchanged. TABS/TAB_GROUPS live in tabsConfig.ts
// (pure, zero-import) so the exact order is directly unit-tested —
// see tabsConfig.test.ts.

const GRAPHIC_DESIGN_SUBS = [
  { key: "deliverables", label: "Deliverables" },
  { key: "complexity", label: "Complexity" },
  { key: "addons", label: "Add-Ons" },
] as const;

const GRAPHIC_DESIGN_DELIVERABLE_OPTIONS: { slug: GraphicDesignDeliverableSlug; label: string }[] = [
  { slug: "flyer_poster", label: "Flyer / Poster" },
  { slug: "digital_ad", label: "Digital Ad / Promotional Artwork" },
  { slug: "social_single", label: "Social Media — Single Design" },
  { slug: "social_set_5", label: "Social Media Set — 5 Designs" },
  { slug: "social_set_10", label: "Social Media Set — 10 Designs" },
  { slug: "presentation", label: "Presentation — Up to 10 Slides" },
  { slug: "brochure", label: "Brochure / Company Profile — Up to 8 Pages" },
];

const GRAPHIC_DESIGN_ADDON_OPTIONS = [
  { slug: "additional_brochure_page", label: "Additional Brochure Page" },
  { slug: "additional_presentation_slide", label: "Additional Presentation Slide" },
  { slug: "additional_revision_minimum", label: "Additional Revision — Minimum" },
  { slug: "editable_source_file_minimum", label: "Editable Source File — Minimum" },
] as const;

const GRAPHIC_DESIGN_PERCENTAGE_OPTIONS = [
  { slug: "priority", label: "Priority Turnaround" },
  { slug: "urgent", label: "Urgent Turnaround (<48h)" },
  { slug: "additional_revision", label: "Additional Revision Round" },
  { slug: "editable_source_file", label: "Editable Source File" },
] as const;

const CONTENT_CREATION_SUBS = [
  { key: "packages", label: "Packages" },
  { key: "retainers", label: "Retainers" },
  { key: "addons", label: "Add-Ons" },
] as const;

const CONTENT_CREATION_PACKAGE_OPTIONS: { slug: ContentCreationPackageSlug; label: string }[] = [
  { slug: "short_form_single", label: "Single Short-Form Video" },
  { slug: "short_form_pack_3", label: "3 Short-Form Videos" },
  { slug: "short_form_pack_5", label: "5 Short-Form Videos" },
  { slug: "content_day_half", label: "Half Content Day — up to 4h" },
  { slug: "content_day_full", label: "Full Content Day — up to 8h" },
  { slug: "event_content_4h", label: "Event Social Coverage — up to 4h" },
  { slug: "personal_brand_2h", label: "Personal Brand Session — up to 2h" },
];

const CONTENT_CREATION_RETAINER_OPTIONS: { slug: ContentCreationRetainerSlug; label: string }[] = [
  { slug: "retainer_essential", label: "Essential — 1 Half Content Day / month" },
  { slug: "retainer_growth", label: "Growth — 1 Full Content Day / month" },
  { slug: "retainer_momentum", label: "Momentum — 2 Full Content Days / month" },
];

const CONTENT_CREATION_ADDON_OPTIONS = [
  { slug: "additional_short_form_video", label: "Additional Short-Form Video" },
  { slug: "additional_10_edited_photos", label: "Additional 10 Edited Social Photos" },
  { slug: "additional_content_capture_hour", label: "Additional Content-Capture Hour" },
  { slug: "same_next_day_edit_per_video", label: "Same/Next-Day Social Edit — Per Video" },
  { slug: "additional_aspect_ratio_adaptation", label: "Additional Aspect-Ratio / Platform Adaptation" },
  { slug: "captioned_subtitled_master", label: "Captioned / Subtitled Master" },
  { slug: "additional_revision_minimum", label: "Additional Revision — Minimum" },
] as const;

const CONTENT_CREATION_PERCENTAGE_OPTIONS = [
  { slug: "priority", label: "Priority Post-Production" },
  { slug: "additional_revision", label: "Additional Revision Round" },
] as const;

const BRANDING_SUBS = [
  { key: "tiers", label: "Service Levels" },
  { key: "formulas", label: "Revisions & Formulas" },
] as const;

const BRANDING_TIER_OPTIONS: { slug: BrandingTierSlug; label: string }[] = [
  { slug: "logo_development", label: "Logo Development" },
  { slug: "brand_foundations", label: "Brand Foundations / Strategy" },
  { slug: "essential_identity", label: "Essential Identity" },
  { slug: "complete_identity", label: "Complete Identity System" },
  { slug: "strategy_complete_identity", label: "Strategy + Complete Identity" },
  { slug: "strategic_rebrand", label: "Strategic Rebrand" },
];

const BRANDING_PERCENTAGE_OPTIONS = [
  { slug: "priority", label: "Priority Scheduling" },
  { slug: "additional_revision", label: "Additional Revision Round" },
] as const;

const PRODUCTION_SUBS = [
  { key: "management", label: "Management & Planning" },
  { key: "coordination", label: "Standalone Coordination" },
] as const;

const PRODUCTION_MANAGEMENT_RATE_OPTIONS: { slug: ProductionServicesRateSlug; label: string }[] = [
  { slug: "management_minimum", label: "Production Management — Market Minimum" },
  { slug: "half_day_planning", label: "Half-Day Planning" },
  { slug: "full_day_planning", label: "Full-Day Planning" },
];

const PRODUCTION_COORDINATION_RATE_OPTIONS: { slug: ProductionServicesRateSlug; label: string }[] = [
  { slug: "location_coordination", label: "Location / Studio Coordination — Per Confirmed Location" },
  { slug: "equipment_coordination_minimum", label: "Equipment Coordination — Market Minimum" },
  { slug: "crew_coordination_minimum", label: "Crew Coordination — Market Minimum" },
];

const PRODUCTION_PERCENTAGE_OPTIONS = [
  { slug: "management_fee", label: "Production Management Fee" },
  { slug: "management_overtime", label: "Ordift Management Overtime" },
  { slug: "equipment_coordination", label: "Standalone Equipment Coordination" },
  { slug: "crew_coordination", label: "Standalone Crew Coordination" },
] as const;

const COMMERCIAL_SUBS = [
  { key: "creative_fees", label: "Creative Fees" },
  { key: "catalogue", label: "Product / E-Commerce" },
  { key: "postproduction", label: "Post-Production" },
  { key: "licensing", label: "Licensing" },
  { key: "review", label: "Review Rules" },
] as const;

const COMMERCIAL_SCOPE_OPTIONS = [
  { slug: "focused", label: "Focused (≤4h)" },
  { slug: "full_day", label: "Full Day (≤8h)" },
  { slug: "extended", label: "Extended (≤12h)" },
] as const;

const COMMERCIAL_POSTPRODUCTION_ITEMS: { slug: CommercialPostProductionItemSlug; label: string }[] = [
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

const COMMERCIAL_LICENSING_GROUPS: { factorType: "usage" | "duration" | "territory" | "exclusivity"; title: string; items: { slug: string; label: string }[] }[] = [
  {
    factorType: "usage",
    title: "Usage",
    items: [
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
    ],
  },
  {
    factorType: "duration",
    title: "Duration (Perpetual has no row — always Custom Proposal)",
    items: [
      { slug: "3_months", label: "3 months" },
      { slug: "6_months", label: "6 months" },
      { slug: "12_months", label: "12 months" },
      { slug: "24_months", label: "24 months" },
      { slug: "36_months", label: "36 months" },
      { slug: "5_years", label: "5 years" },
    ],
  },
  {
    factorType: "territory",
    title: "Territory (independent of production market)",
    items: [
      { slug: "local_city", label: "Local / City" },
      { slug: "national", label: "National" },
      { slug: "regional_multicountry", label: "Regional / Multi-country" },
      { slug: "international", label: "International" },
      { slug: "worldwide", label: "Worldwide" },
    ],
  },
  {
    factorType: "exclusivity",
    title: "Exclusivity",
    items: [
      { slug: "non_exclusive", label: "Non-exclusive" },
      { slug: "category_exclusive", label: "Category-exclusive" },
      { slug: "full_exclusive", label: "Full-exclusive (subject to Custom safeguards)" },
    ],
  },
];

const CORPORATE_SUBS = [
  { key: "individual", label: "Individual" },
  { key: "executive", label: "Executive" },
  { key: "team", label: "Team Volume" },
  { key: "addons", label: "Add-Ons" },
] as const;

const TEAM_TIERS = [
  { slug: "2-5", label: "2–5 people" },
  { slug: "6-10", label: "6–10 people" },
  { slug: "11-25", label: "11–25 people" },
  { slug: "26-50", label: "26–50 people" },
] as const;

const CORPORATE_PRIORITY_SCOPES: { slug: CorporatePriorityDeliveryScopeSlug; label: string }[] = [
  { slug: "individual_headshot", label: "Individual Headshot" },
  { slug: "executive_portrait", label: "Executive Portrait" },
  { slug: "team_2_5", label: "Team 2–5" },
  { slug: "team_6_10", label: "Team 6–10" },
  { slug: "team_11_25", label: "Team 11–25" },
  { slug: "team_26_50", label: "Team 26–50" },
];

const WEDDING_EVENT_SUBS = [
  { key: "wedding", label: "Wedding Celebrations" },
  { key: "event", label: "Events" },
  { key: "addons", label: "Add-Ons" },
] as const;

const SERVICE_MODES: { slug: ServiceMode; label: string }[] = [
  { slug: "photography", label: "Photography" },
  { slug: "film", label: "Film" },
  { slug: "photography_film", label: "Photography + Film" },
];

const WEDDING_TIER_OPTIONS = [
  { slug: "chapter", label: "The Chapter" },
  { slug: "narrative", label: "The Narrative" },
  { slug: "chronicle", label: "The Chronicle" },
  { slug: "archive", label: "The Archive" },
] as const;

const EVENT_TIER_OPTIONS = [
  { slug: "focused", label: "Focused" },
  { slug: "half_day", label: "Half Day" },
  { slug: "full_day", label: "Full Day" },
  { slug: "extended", label: "Extended" },
] as const;

const WEDDING_EVENT_PERCENTAGE_OPTIONS: { slug: PercentageSlug; label: string }[] = [
  { slug: "corporate_organisational_scope", label: "Corporate/Organisational Event Scope" },
  { slug: "documentary_recording", label: "Full Event / Documentary Recording" },
  { slug: "raw_photo_guidance", label: "RAW Photo Guidance" },
  { slug: "raw_video_guidance", label: "RAW Video Guidance" },
];

const ADDON_GROUPS: { title: string; items: { slug: AddonSlug; label: string }[] }[] = [
  {
    title: "Additional Coverage & Crew",
    items: [
      { slug: "additional_photo_hour", label: "Additional Photography Hour" },
      { slug: "additional_film_hour", label: "Additional Film Hour" },
      { slug: "additional_photofilm_hour", label: "Additional Photography + Film Hour" },
      { slug: "additional_photographer_day", label: "Additional Photographer / event day" },
      { slug: "additional_filmmaker_day", label: "Additional Filmmaker / event day" },
    ],
  },
  { title: "Wedding-Only", items: [{ slug: "pre_wedding_session", label: "Pre-Wedding Session" }] },
  {
    title: "Drone & Same-Day Content",
    items: [
      { slug: "drone", label: "Drone Coverage" },
      { slug: "same_day_photo_pack", label: "Same-Day Photo Social Pack" },
      { slug: "same_day_highlight_film", label: "Same-Day Highlight Film" },
    ],
  },
  {
    title: "Documentary & RAW Guidance Minimums",
    items: [
      { slug: "documentary_recording_minimum", label: "Full Event/Documentary Recording — Minimum" },
      { slug: "raw_photo_guidance_minimum", label: "RAW Photo Guidance — Minimum" },
      { slug: "raw_video_guidance_minimum", label: "RAW Video Guidance — Minimum" },
    ],
  },
  {
    title: "Livestreaming",
    items: [
      { slug: "livestream_single_basic", label: "Single-Stream Basic" },
      { slug: "livestream_multicam_standard", label: "Multi-Camera Standard" },
    ],
  },
  {
    title: "Albums, Frames & Presentation",
    items: [
      { slug: "keepsake_album", label: "Keepsake Album" },
      { slug: "signature_album", label: "Signature Album" },
      { slug: "archive_album", label: "Archive Album" },
      { slug: "companion_album", label: "Parent / Companion Album" },
      { slug: "frame_small", label: "Small / Desk Frame" },
      { slug: "frame_medium", label: "Medium Frame" },
      { slug: "frame_large", label: "Large Frame" },
      { slug: "frame_statement", label: "Statement Frame" },
      { slug: "presentation_drive", label: "Presentation Drive" },
    ],
  },
];

// Responsive treatment (2026-09-07) — twelve top-level tabs no longer
// fit comfortably as a single wrapped row on iPad/mobile. Each group's
// row now scrolls horizontally on narrow viewports (no wrapping/
// truncation, same treatment as ProductionSubNav) while staying a
// normal wrapped row at desktop width — restrained visual grouping via
// a small uppercase section label, direct access to every tab
// preserved throughout.
function TabNav({ active }: { active: string }) {
  return (
    <div className="space-y-3 border-b border-black/10 pb-3">
      {TAB_GROUPS.map((group) => (
        <div key={group.title}>
          <p className="font-sans text-caption font-semibold uppercase tracking-wide text-ordift-ink-muted mb-1.5">{group.title}</p>
          <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 sm:flex-wrap sm:overflow-visible">
            {TABS.filter((t) => group.keys.includes(t.key)).map((t) => (
              <Link
                key={t.key}
                href={`/admin/pricing?tab=${t.key}`}
                className={`shrink-0 whitespace-nowrap rounded-lg px-4 py-2 font-sans text-body-small ${active === t.key ? "bg-ordift-ink text-white" : "text-ordift-ink-muted hover:text-ordift-ink"}`}
              >
                {t.label}
              </Link>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function CorporateSubNav({ active, market }: { active: string; market?: string }) {
  return (
    <div className="flex flex-wrap gap-2">
      {CORPORATE_SUBS.map((s) => (
        <Link
          key={s.key}
          href={`/admin/pricing?tab=corporate&corpSub=${s.key}${market ? `&market=${market}` : ""}`}
          className={`rounded-lg px-3 py-1.5 font-sans text-caption ${active === s.key ? "bg-ordift-ink text-white" : "border border-black/15 text-ordift-ink-muted"}`}
        >
          {s.label}
        </Link>
      ))}
    </div>
  );
}

function WeddingEventSubNav({ active, market }: { active: string; market?: string }) {
  return (
    <div className="flex flex-wrap gap-2">
      {WEDDING_EVENT_SUBS.map((s) => (
        <Link
          key={s.key}
          href={`/admin/pricing?tab=wedding_event&weSub=${s.key}${market ? `&market=${market}` : ""}`}
          className={`rounded-lg px-3 py-1.5 font-sans text-caption ${active === s.key ? "bg-ordift-ink text-white" : "border border-black/15 text-ordift-ink-muted"}`}
        >
          {s.label}
        </Link>
      ))}
    </div>
  );
}

function ModePills({ weSub, market, active }: { weSub: string; market: string; active: ServiceMode }) {
  return (
    <div className="flex flex-wrap gap-2">
      {SERVICE_MODES.map((m) => (
        <Link
          key={m.slug}
          href={`/admin/pricing?tab=wedding_event&weSub=${weSub}&market=${market}&mode=${m.slug}`}
          className={`rounded-full border px-4 py-1.5 font-sans text-caption ${active === m.slug ? "border-ordift-gold-pressed bg-ordift-gold-pressed/10 text-ordift-ink" : "border-black/15 text-ordift-ink-muted"}`}
        >
          {m.label}
        </Link>
      ))}
    </div>
  );
}

function CommercialSubNav({ active, market }: { active: string; market?: string }) {
  return (
    <div className="flex flex-wrap gap-2">
      {COMMERCIAL_SUBS.map((s) => (
        <Link
          key={s.key}
          href={`/admin/pricing?tab=commercial&commSub=${s.key}${market ? `&market=${market}` : ""}`}
          className={`rounded-lg px-3 py-1.5 font-sans text-caption ${active === s.key ? "bg-ordift-ink text-white" : "border border-black/15 text-ordift-ink-muted"}`}
        >
          {s.label}
        </Link>
      ))}
    </div>
  );
}

function GraphicDesignSubNav({ active, market }: { active: string; market?: string }) {
  return (
    <div className="flex flex-wrap gap-2">
      {GRAPHIC_DESIGN_SUBS.map((s) => (
        <Link
          key={s.key}
          href={`/admin/pricing?tab=graphic_design&gdSub=${s.key}${market ? `&market=${market}` : ""}`}
          className={`rounded-lg px-3 py-1.5 font-sans text-caption ${active === s.key ? "bg-ordift-ink text-white" : "border border-black/15 text-ordift-ink-muted"}`}
        >
          {s.label}
        </Link>
      ))}
    </div>
  );
}

function ContentCreationSubNav({ active, market }: { active: string; market?: string }) {
  return (
    <div className="flex flex-wrap gap-2">
      {CONTENT_CREATION_SUBS.map((s) => (
        <Link
          key={s.key}
          href={`/admin/pricing?tab=content_creation&ccSub=${s.key}${market ? `&market=${market}` : ""}`}
          className={`rounded-lg px-3 py-1.5 font-sans text-caption ${active === s.key ? "bg-ordift-ink text-white" : "border border-black/15 text-ordift-ink-muted"}`}
        >
          {s.label}
        </Link>
      ))}
    </div>
  );
}

function BrandingSubNav({ active, market }: { active: string; market?: string }) {
  return (
    <div className="flex flex-wrap gap-2">
      {BRANDING_SUBS.map((s) => (
        <Link
          key={s.key}
          href={`/admin/pricing?tab=branding&brSub=${s.key}${market ? `&market=${market}` : ""}`}
          className={`rounded-lg px-3 py-1.5 font-sans text-caption ${active === s.key ? "bg-ordift-ink text-white" : "border border-black/15 text-ordift-ink-muted"}`}
        >
          {s.label}
        </Link>
      ))}
    </div>
  );
}

function ProductionSubNav({ active, market }: { active: string; market?: string }) {
  return (
    <div className="flex flex-wrap gap-2">
      {PRODUCTION_SUBS.map((s) => (
        <Link
          key={s.key}
          href={`/admin/pricing?tab=production_services&prSub=${s.key}${market ? `&market=${market}` : ""}`}
          className={`rounded-lg px-3 py-1.5 font-sans text-caption ${active === s.key ? "bg-ordift-ink text-white" : "border border-black/15 text-ordift-ink-muted"}`}
        >
          {s.label}
        </Link>
      ))}
    </div>
  );
}

function CommercialModePills({ market, active }: { market: string; active: CommercialServiceMode }) {
  return (
    <div className="flex flex-wrap gap-2">
      {SERVICE_MODES.map((m) => (
        <Link
          key={m.slug}
          href={`/admin/pricing?tab=commercial&commSub=creative_fees&market=${market}&mode=${m.slug}`}
          className={`rounded-full border px-4 py-1.5 font-sans text-caption ${active === m.slug ? "border-ordift-gold-pressed bg-ordift-gold-pressed/10 text-ordift-ink" : "border-black/15 text-ordift-ink-muted"}`}
        >
          {m.label}
        </Link>
      ))}
    </div>
  );
}

function MarketPills({ tab, markets, active, extraQuery }: { tab: string; markets: { slug: string; name: string }[]; active: string; extraQuery?: string }) {
  return (
    <div className="flex flex-wrap gap-2">
      {markets.map((m) => (
        <Link
          key={m.slug}
          href={`/admin/pricing?tab=${tab}${extraQuery ?? ""}&market=${m.slug}`}
          className={`rounded-full border px-4 py-1.5 font-sans text-caption ${active === m.slug ? "border-ordift-gold-pressed bg-ordift-gold-pressed/10 text-ordift-ink" : "border-black/15 text-ordift-ink-muted"}`}
        >
          {m.name}
        </Link>
      ))}
    </div>
  );
}

// Ordift Pricing Engine — Admin UX Refinement (2026-09-06). Presentation
// only: no pricing value, formula, RLS policy, or authorization
// requirement changed from V1/V1.1. Reorganized into a compact, tabbed
// reference-first workspace. Every figure shown still traces to a real,
// versioned database row — nothing hard-coded here.
export default async function AdminPricingPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; corpSub?: string; weSub?: string; commSub?: string; gdSub?: string; ccSub?: string; brSub?: string; prSub?: string; market?: string; mode?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/admin/overview");
  const auth = await authorizeWithSuperAdminOverride(user.id, FINANCE_CAPABILITIES.pricingAdminister);
  if (!auth.ok) redirect("/admin/overview");

  const { tab: tabParam, corpSub: corpSubParam, weSub: weSubParam, commSub: commSubParam, gdSub: gdSubParam, ccSub: ccSubParam, brSub: brSubParam, prSub: prSubParam, market: marketParam, mode: modeParam } = await searchParams;
  const tab = TABS.some((t) => t.key === tabParam) ? tabParam! : "personal-sessions";
  const corpSub = CORPORATE_SUBS.some((s) => s.key === corpSubParam) ? corpSubParam! : "individual";
  const weSub = WEDDING_EVENT_SUBS.some((s) => s.key === weSubParam) ? weSubParam! : "wedding";
  const commSub = COMMERCIAL_SUBS.some((s) => s.key === commSubParam) ? commSubParam! : "creative_fees";
  const gdSub = GRAPHIC_DESIGN_SUBS.some((s) => s.key === gdSubParam) ? gdSubParam! : "deliverables";
  const ccSub = CONTENT_CREATION_SUBS.some((s) => s.key === ccSubParam) ? ccSubParam! : "packages";
  const brSub = BRANDING_SUBS.some((s) => s.key === brSubParam) ? brSubParam! : "tiers";
  const prSub = PRODUCTION_SUBS.some((s) => s.key === prSubParam) ? prSubParam! : "management";
  const mode: ServiceMode = SERVICE_MODES.some((m) => m.slug === modeParam) ? (modeParam as ServiceMode) : "photography_film";

  const markets = await listAllPricingMarketsForAdmin();
  const activeMarkets = markets.filter((m) => m.active);
  const selectedMarket = activeMarkets.find((m) => m.slug === marketParam) ?? activeMarkets[0];

  const [rates, subjectCategories, discountCodes, retouchRate] = await Promise.all([
    selectedMarket ? getActivePersonalSessionRates(selectedMarket.slug) : Promise.resolve([]),
    listAllSubjectCategories(),
    listAllDiscountCodesForAdmin(user.id),
    selectedMarket ? getActiveAdditionalRetouchRate(selectedMarket.slug) : Promise.resolve(null),
  ]);

  const [corporateHeadshotRates, corporateTeamTierRates, corporateMinimumBooking, corporateRetouchRate, corporatePriorityDeliveryPercentages] =
    tab === "corporate" && selectedMarket
      ? await Promise.all([
          getActiveCorporateHeadshotRates(selectedMarket.slug),
          getActiveCorporateTeamTierRates(selectedMarket.slug),
          getActiveCorporateMinimumBooking(selectedMarket.slug),
          getActiveCorporateRetouchRate(selectedMarket.slug),
          getAllActiveCorporatePriorityDeliveryPercentages(),
        ])
      : [[], [], null, null, {} as Partial<Record<CorporatePriorityDeliveryScopeSlug, number>>];

  const [weddingTierRates, eventTierRates, weddingDeliverables, eventDeliverables, weddingPriorityRates, eventPriorityRates, weddingEventAddonRates, weddingEventPercentageRates] =
    tab === "wedding_event" && selectedMarket
      ? await Promise.all([
          getActiveTierRates("wedding", selectedMarket.slug),
          getActiveTierRates("event", selectedMarket.slug),
          getTierDeliverables("wedding"),
          getTierDeliverables("event"),
          getPriorityDeliveryRates("wedding"),
          getPriorityDeliveryRates("event"),
          getAddonRates(selectedMarket.slug),
          getPercentageRates(),
        ])
      : [[], [], [], [], [], [], {} as Partial<Record<AddonSlug, number>>, {} as Partial<Record<PercentageSlug, number>>];

  const [
    commercialCreativeFeeRates,
    commercialCatalogueBaseRate,
    commercialCatalogueMinimum,
    commercialVolumeFactors,
    commercialComplexityFactors,
    commercialPostProductionRates,
    commercialPercentages,
    commercialLicensingFactors,
    commercialReviewThreshold,
  ] =
    tab === "commercial" && selectedMarket
      ? await Promise.all([
          getActiveCreativeFeeRates(selectedMarket.slug),
          getActiveCatalogueBaseRate(selectedMarket.slug),
          getActiveCatalogueMinimum(selectedMarket.slug),
          getActiveCatalogueVolumeFactors(),
          getActiveCatalogueComplexityFactors(),
          getActivePostProductionRates(),
          getActiveCommercialPercentages(),
          getActiveLicensingFactors(),
          getActiveReviewThreshold(selectedMarket.slug),
        ])
      : [[], null, null, [], [], [], {} as Partial<Record<"priority_postproduction" | "licensing_floor", number>>, { usage: {}, duration: {}, territory: {}, exclusivity: {} }, null];

  const [graphicDesignDeliverableRates, graphicDesignComplexityFactors, graphicDesignAddonRates, graphicDesignPercentages] =
    tab === "graphic_design" && selectedMarket
      ? await Promise.all([
          getActiveDeliverableRates(selectedMarket.slug),
          getActiveComplexityFactors(),
          getActiveGraphicDesignAddonRates(selectedMarket.slug),
          getActiveGraphicDesignPercentageRates(),
        ])
      : [[], [], {} as Partial<Record<string, number>>, {} as Partial<Record<string, number>>];

  const [contentCreationPackageRates, contentCreationRetainerRates, contentCreationAddonRates, contentCreationPercentages] =
    tab === "content_creation" && selectedMarket
      ? await Promise.all([
          getActivePackageRates(selectedMarket.slug),
          getActiveRetainerRates(selectedMarket.slug),
          getActiveContentCreationAddonRates(selectedMarket.slug),
          getActiveContentCreationPercentageRates(),
        ])
      : [[], [], {} as Partial<Record<string, number>>, {} as Partial<Record<string, number>>];

  const [brandingTierRates, brandingRevisionMinimum, brandingPercentages] =
    tab === "branding" && selectedMarket
      ? await Promise.all([
          getActiveBrandingTierRates(selectedMarket.slug),
          getActiveBrandingRevisionMinimum(selectedMarket.slug),
          getActiveBrandingPercentageRates(),
        ])
      : [[], null, {} as Partial<Record<string, number>>];

  const [productionRates, productionPercentages] =
    tab === "production_services" && selectedMarket
      ? await Promise.all([getActiveProductionRates(selectedMarket.slug), getActiveProductionPercentageRates()])
      : [[], {} as Partial<Record<string, number>>];

  return (
    <div className="space-y-8">
      <div>
        <p className="font-sans font-semibold uppercase tracking-[0.2em] text-eyebrow text-ordift-gold-pressed mb-2">Admin</p>
        <h1 className="font-serif font-medium text-section-heading lg:text-section-heading-desktop text-ordift-ink">Pricing</h1>
        <p className="font-sans text-body-small text-ordift-ink-muted mt-2">
          Market-based pricing — determined by where the shoot takes place, never by customer nationality or location.
        </p>
      </div>

      <TabNav active={tab} />

      {tab === "personal-sessions" && selectedMarket && (
        <div className="space-y-6">
          <MarketPills tab="personal-sessions" markets={activeMarkets} active={selectedMarket.slug} />

          <section className="rounded-xl border border-black/10 bg-white p-6 space-y-4">
            <h2 className="font-serif font-medium text-body text-ordift-ink">{selectedMarket.name}</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="font-sans text-caption uppercase tracking-wide text-ordift-ink-muted">
                    <th className="pb-2">Duration</th>
                    <th className="pb-2">Base Price (Individual)</th>
                    <th className="pb-2">Signature Retouched</th>
                    <th className="pb-2">Professionally Edited</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-black/5">
                  {DURATIONS.map((d) => {
                    const rate = rates.find((r) => r.durationHours === d);
                    return (
                      <tr key={d} className="font-sans text-body-small text-ordift-ink">
                        <td className="py-2">{d} hour{d > 1 ? "s" : ""}</td>
                        <td className="py-2">{rate ? `$${rate.priceUsd.toFixed(2)}` : "— not set —"}</td>
                        <td className="py-2">{rate?.signatureRetouchedImages ?? "—"}</td>
                        <td className="py-2">{rate?.professionallyEditedImages ?? "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="space-y-2 pt-2 border-t border-black/5">
              <p className="font-sans text-caption text-ordift-ink-muted">Edit a duration — current values are prefilled. Saving always creates a new version; it never overwrites the row above, and an unchanged submission saves nothing new.</p>
              {DURATIONS.map((d) => {
                const rate = rates.find((r) => r.durationHours === d);
                return (
                  <details key={d} className="rounded-lg border border-black/10 px-4 py-2">
                    <summary className="cursor-pointer font-sans text-body-small text-ordift-ink select-none">Edit {d}h rate</summary>
                    <form action={createPersonalSessionRateVersionAction} className="grid grid-cols-1 sm:grid-cols-4 gap-3 mt-3">
                      <input type="hidden" name="marketSlug" value={selectedMarket.slug} />
                      <input type="hidden" name="durationHours" value={d} />
                      <input name="priceUsd" type="number" step="0.01" min="0.01" required defaultValue={rate?.priceUsd} placeholder="Base price USD" className="rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small" />
                      <input name="signatureRetouchedImages" type="number" min="0" required defaultValue={rate?.signatureRetouchedImages} placeholder="Signature Retouched" className="rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small" />
                      <input name="professionallyEditedImages" type="number" min="0" required defaultValue={rate?.professionallyEditedImages} placeholder="Professionally Edited" className="rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small" />
                      <button type="submit" className="rounded-lg bg-ordift-ink text-white px-4 py-2 font-sans text-body-small">Save new version</button>
                    </form>
                  </details>
                );
              })}
            </div>
          </section>
        </div>
      )}

      {tab === "subjects" && (
        <section className="rounded-xl border border-black/10 bg-white p-6 space-y-4">
          <h2 className="font-serif font-medium text-body text-ordift-ink">Subject / Group Multipliers</h2>
          <p className="font-sans text-caption text-ordift-ink-muted">Applied against the base duration rate — e.g. Couple = base × 1.20. Not an additional flat fee.</p>
          <ul className="divide-y divide-black/5">
            {subjectCategories.map((c) => (
              <li key={c.id} className="flex items-center justify-between py-2.5">
                <span className="font-sans text-body-small text-ordift-ink">{c.name} <span className="text-ordift-ink-muted text-caption">({c.minSubjects}{c.maxSubjects ? `–${c.maxSubjects}` : "+"} subjects)</span></span>
                <span className="font-sans text-caption text-ordift-ink-muted">
                  {c.active && c.priceMultiplier !== null ? `${c.priceMultiplier.toFixed(2)}×` : "Custom quote — not yet approved"}
                </span>
              </li>
            ))}
          </ul>

          <div className="space-y-2 pt-2 border-t border-black/5">
            <p className="font-sans text-caption text-ordift-ink-muted">Edit a category&rsquo;s multiplier — current value is prefilled. Large Group has no approved multiplier and cannot be edited here; it always routes to a custom quote.</p>
            {subjectCategories.filter((c) => c.slug !== "large_group").map((c) => (
              <details key={c.id} className="rounded-lg border border-black/10 px-4 py-2">
                <summary className="cursor-pointer font-sans text-body-small text-ordift-ink select-none">Edit {c.name} multiplier</summary>
                <form action={createSubjectCategoryMultiplierVersionAction} className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-3">
                  <input type="hidden" name="subjectCategorySlug" value={c.slug} />
                  <input name="priceMultiplier" type="number" step="0.01" min="0.01" required defaultValue={c.priceMultiplier ?? undefined} placeholder="Multiplier, e.g. 1.20" className="rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small" />
                  <button type="submit" className="rounded-lg bg-ordift-ink text-white px-4 py-2 font-sans text-body-small">Save new version</button>
                </form>
              </details>
            ))}
          </div>
        </section>
      )}

      {tab === "addons" && selectedMarket && (
        <div className="space-y-6">
          <MarketPills tab="addons" markets={activeMarkets} active={selectedMarket.slug} />
          <section className="rounded-xl border border-black/10 bg-white p-6 space-y-4">
            <h2 className="font-serif font-medium text-body text-ordift-ink">{selectedMarket.name} — Additional Signature Retouch Rate</h2>
            <p className="font-sans text-caption text-ordift-ink-muted">Per additional Signature Retouched Image beyond a session&rsquo;s included count. Does not apply to Professionally Edited Images — no rate exists for those.</p>
            <p className="font-sans text-body text-ordift-ink">{retouchRate != null ? `$${retouchRate.toFixed(2)} each` : "Not set"}</p>

            <details className="rounded-lg border border-black/10 px-4 py-2">
              <summary className="cursor-pointer font-sans text-body-small text-ordift-ink select-none">Edit rate</summary>
              <form action={createAdditionalRetouchRateVersionAction} className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-3">
                <input type="hidden" name="marketSlug" value={selectedMarket.slug} />
                <input name="pricePerImageUsd" type="number" step="0.01" min="0.01" required defaultValue={retouchRate ?? undefined} placeholder="Price per image USD" className="rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small" />
                <button type="submit" className="rounded-lg bg-ordift-ink text-white px-4 py-2 font-sans text-body-small">Save new version</button>
              </form>
            </details>
          </section>
        </div>
      )}

      {tab === "corporate" && selectedMarket && (
        <div className="space-y-6">
          <CorporateSubNav active={corpSub} market={selectedMarket.slug} />
          <MarketPills tab="corporate" extraQuery={`&corpSub=${corpSub}`} markets={activeMarkets} active={selectedMarket.slug} />

          {(corpSub === "individual" || corpSub === "executive") && (
            <section className="rounded-xl border border-black/10 bg-white p-6 space-y-4">
              {(() => {
                const productSlug = corpSub === "individual" ? "individual_headshot" : "executive_portrait";
                const productLabel = corpSub === "individual" ? "Professional Headshot – Individual" : "Executive Portrait";
                const rate = corporateHeadshotRates.find((r) => r.productSlug === productSlug);
                return (
                  <>
                    <h2 className="font-serif font-medium text-body text-ordift-ink">{selectedMarket.name} — {productLabel}</h2>
                    <div className="flex items-baseline justify-between font-sans text-body-small text-ordift-ink">
                      <span>Current rate</span>
                      <span>{rate ? `$${rate.priceUsd.toFixed(2)}` : "— not set —"}</span>
                    </div>
                    <div className="flex items-baseline justify-between font-sans text-body-small text-ordift-ink">
                      <span>Signature Retouched Images included</span>
                      <span>{rate?.signatureRetouchedImages ?? "—"}</span>
                    </div>
                    <p className="font-sans text-caption text-ordift-ink-muted">
                      {corpSub === "individual" ? "~20–30 min session, 1 look/setup." : "~45–60 min session, up to 2 looks."} High-res + web-ready delivery, private selection workflow where supported.
                    </p>

                    <details className="rounded-lg border border-black/10 px-4 py-2">
                      <summary className="cursor-pointer font-sans text-body-small text-ordift-ink select-none">Edit rate</summary>
                      <form action={createCorporateHeadshotRateVersionAction} className="grid grid-cols-1 sm:grid-cols-4 gap-3 mt-3">
                        <input type="hidden" name="marketSlug" value={selectedMarket.slug} />
                        <input type="hidden" name="productSlug" value={productSlug} />
                        <input name="priceUsd" type="number" step="0.01" min="0.01" required defaultValue={rate?.priceUsd} placeholder="Price USD" className="rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small" />
                        <input name="signatureRetouchedImages" type="number" min="0" required defaultValue={rate?.signatureRetouchedImages} placeholder="Signature Retouched Images" className="rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small" />
                        <button type="submit" className="rounded-lg bg-ordift-ink text-white px-4 py-2 font-sans text-body-small">Save new version</button>
                      </form>
                    </details>
                  </>
                );
              })()}
            </section>
          )}

          {corpSub === "team" && (
            <section className="rounded-xl border border-black/10 bg-white p-6 space-y-4">
              <h2 className="font-serif font-medium text-body text-ordift-ink">{selectedMarket.name} — Team Headshots</h2>
              <p className="font-sans text-caption text-ordift-ink-muted">Per-person rate by team size. 1 Signature Retouched Image per photographed employee. 51+ employees is always a Custom Corporate Proposal — never auto-priced here.</p>
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="font-sans text-caption uppercase tracking-wide text-ordift-ink-muted">
                      <th className="pb-2">Tier</th>
                      <th className="pb-2">Rate per person</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-black/5">
                    {TEAM_TIERS.map((t) => {
                      const tierRate = corporateTeamTierRates.find((r) => r.tierSlug === t.slug);
                      return (
                        <tr key={t.slug} className="font-sans text-body-small text-ordift-ink">
                          <td className="py-2">{t.label}</td>
                          <td className="py-2">{tierRate ? `$${tierRate.pricePerPersonUsd.toFixed(2)}` : "— not set —"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="flex items-baseline justify-between font-sans text-body-small text-ordift-ink pt-2 border-t border-black/5">
                <span>Minimum corporate team booking</span>
                <span>{corporateMinimumBooking != null ? `$${corporateMinimumBooking.toFixed(2)}` : "— not set —"}</span>
              </div>
              <p className="font-sans text-caption text-ordift-ink-muted">Applied when numberOfPeople × per-person rate falls below this amount — the final price is always the greater of the two.</p>

              <div className="space-y-2 pt-2 border-t border-black/5">
                <p className="font-sans text-caption text-ordift-ink-muted">Edit a tier or the minimum — current values are prefilled. Saving always creates a new version.</p>
                {TEAM_TIERS.map((t) => {
                  const tierRate = corporateTeamTierRates.find((r) => r.tierSlug === t.slug);
                  return (
                    <details key={t.slug} className="rounded-lg border border-black/10 px-4 py-2">
                      <summary className="cursor-pointer font-sans text-body-small text-ordift-ink select-none">Edit {t.label} rate</summary>
                      <form action={createCorporateTeamTierRateVersionAction} className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-3">
                        <input type="hidden" name="marketSlug" value={selectedMarket.slug} />
                        <input type="hidden" name="tierSlug" value={t.slug} />
                        <input name="pricePerPersonUsd" type="number" step="0.01" min="0.01" required defaultValue={tierRate?.pricePerPersonUsd} placeholder="Price per person USD" className="rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small" />
                        <button type="submit" className="rounded-lg bg-ordift-ink text-white px-4 py-2 font-sans text-body-small">Save new version</button>
                      </form>
                    </details>
                  );
                })}
                <details className="rounded-lg border border-black/10 px-4 py-2">
                  <summary className="cursor-pointer font-sans text-body-small text-ordift-ink select-none">Edit minimum booking</summary>
                  <form action={createCorporateMinimumBookingVersionAction} className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-3">
                    <input type="hidden" name="marketSlug" value={selectedMarket.slug} />
                    <input name="minimumAmountUsd" type="number" step="0.01" min="0.01" required defaultValue={corporateMinimumBooking ?? undefined} placeholder="Minimum USD" className="rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small" />
                    <button type="submit" className="rounded-lg bg-ordift-ink text-white px-4 py-2 font-sans text-body-small">Save new version</button>
                  </form>
                </details>
              </div>
            </section>
          )}

          {corpSub === "addons" && (
            <div className="space-y-6">
              <section className="rounded-xl border border-black/10 bg-white p-6 space-y-4">
                <h2 className="font-serif font-medium text-body text-ordift-ink">{selectedMarket.name} — Additional Signature Retouch Rate</h2>
                <p className="font-sans text-caption text-ordift-ink-muted">Corporate-specific rate — a separate line item from the Personal Portrait retouch price, by design.</p>
                <p className="font-sans text-body text-ordift-ink">{corporateRetouchRate != null ? `$${corporateRetouchRate.toFixed(2)} each` : "Not set"}</p>

                <details className="rounded-lg border border-black/10 px-4 py-2">
                  <summary className="cursor-pointer font-sans text-body-small text-ordift-ink select-none">Edit rate</summary>
                  <form action={createCorporateRetouchRateVersionAction} className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-3">
                    <input type="hidden" name="marketSlug" value={selectedMarket.slug} />
                    <input name="pricePerImageUsd" type="number" step="0.01" min="0.01" required defaultValue={corporateRetouchRate ?? undefined} placeholder="Price per image USD" className="rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small" />
                    <button type="submit" className="rounded-lg bg-ordift-ink text-white px-4 py-2 font-sans text-body-small">Save new version</button>
                  </form>
                </details>
              </section>

              <section className="rounded-xl border border-black/10 bg-white p-6 space-y-4">
                <h2 className="font-serif font-medium text-body text-ordift-ink">Priority Delivery</h2>
                <p className="font-sans text-caption text-ordift-ink-muted">
                  Global — not market-specific. Accelerated delivery the client must deliberately request; never applied automatically. Approved correction (2026-09-06): the percentage now varies by product/team-tier rather than a single global figure.
                </p>
                <ul className="divide-y divide-black/5">
                  {CORPORATE_PRIORITY_SCOPES.map((s) => (
                    <li key={s.slug} className="py-2.5">
                      <div className="flex items-baseline justify-between font-sans text-body-small text-ordift-ink">
                        <span>{s.label}</span>
                        <span>{corporatePriorityDeliveryPercentages[s.slug] != null ? `+${corporatePriorityDeliveryPercentages[s.slug]}%` : "Not set"}</span>
                      </div>
                      <details className="mt-2 rounded-lg border border-black/10 px-4 py-2">
                        <summary className="cursor-pointer font-sans text-caption text-ordift-ink select-none">Edit</summary>
                        <form action={createCorporatePriorityDeliveryVersionAction} className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-3">
                          <input type="hidden" name="scopeSlug" value={s.slug} />
                          <input name="multiplierPercentage" type="number" step="0.01" min="0.01" required defaultValue={corporatePriorityDeliveryPercentages[s.slug] ?? undefined} placeholder="Percentage" className="rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small" />
                          <button type="submit" className="rounded-lg bg-ordift-ink text-white px-4 py-2 font-sans text-body-small">Save new version</button>
                        </form>
                      </details>
                    </li>
                  ))}
                </ul>
              </section>
            </div>
          )}
        </div>
      )}

      {tab === "wedding_event" && selectedMarket && (
        <div className="space-y-6">
          <WeddingEventSubNav active={weSub} market={selectedMarket.slug} />

          {(weSub === "wedding" || weSub === "event") && (
            <div className="space-y-6">
              <MarketPills tab="wedding_event" extraQuery={`&weSub=${weSub}&mode=${mode}`} markets={activeMarkets} active={selectedMarket.slug} />
              <ModePills weSub={weSub} market={selectedMarket.slug} active={mode} />

              {(() => {
                const category = weSub as "wedding" | "event";
                const tierOptions = category === "wedding" ? WEDDING_TIER_OPTIONS : EVENT_TIER_OPTIONS;
                const tierRates = category === "wedding" ? weddingTierRates : eventTierRates;
                const deliverables = category === "wedding" ? weddingDeliverables : eventDeliverables;
                const priorityRates = category === "wedding" ? weddingPriorityRates : eventPriorityRates;
                return (
                  <>
                    <section className="rounded-xl border border-black/10 bg-white p-6 space-y-4">
                      <h2 className="font-serif font-medium text-body text-ordift-ink">{selectedMarket.name} — {SERVICE_MODES.find((m) => m.slug === mode)?.label}</h2>
                      <div className="overflow-x-auto">
                        <table className="w-full text-left">
                          <thead>
                            <tr className="font-sans text-caption uppercase tracking-wide text-ordift-ink-muted">
                              <th className="pb-2">{category === "wedding" ? "Collection" : "Coverage level"}</th>
                              <th className="pb-2">Rate</th>
                              <th className="pb-2">Deliverables</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-black/5">
                            {tierOptions.map((t) => {
                              const rate = tierRates.find((r) => r.serviceMode === mode && r.tierSlug === t.slug);
                              const deliverable = deliverables.find((d) => d.tierSlug === t.slug);
                              return (
                                <tr key={t.slug} className="font-sans text-body-small text-ordift-ink align-top">
                                  <td className="py-2">{t.label}</td>
                                  <td className="py-2">{rate ? `$${rate.priceUsd.toFixed(2)}` : "— not set —"}</td>
                                  <td className="py-2 text-caption text-ordift-ink-muted">
                                    {deliverable ? `${deliverable.eventDays}d · ${deliverable.coverageHours}h · ${deliverable.photographers}P/${deliverable.filmmakers}F · ${deliverable.professionallyEditedImagesMin}+ edited · ${deliverable.signatureRetouchedImages} retouched${deliverable.highlightFilmMinMinutes != null ? ` · ${deliverable.highlightFilmMinMinutes}-${deliverable.highlightFilmMaxMinutes}min film` : ""}${deliverable.includesDocumentary ? " · documentary included" : ""}` : "—"}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>

                      <div className="space-y-2 pt-2 border-t border-black/5">
                        <p className="font-sans text-caption text-ordift-ink-muted">Edit a rate — current value is prefilled. Saving always creates a new version for this market/service/tier.</p>
                        {tierOptions.map((t) => {
                          const rate = tierRates.find((r) => r.serviceMode === mode && r.tierSlug === t.slug);
                          return (
                            <details key={t.slug} className="rounded-lg border border-black/10 px-4 py-2">
                              <summary className="cursor-pointer font-sans text-body-small text-ordift-ink select-none">Edit {t.label} rate</summary>
                              <form action={createWeddingEventTierRateVersionAction} className="grid grid-cols-1 sm:grid-cols-4 gap-3 mt-3">
                                <input type="hidden" name="marketSlug" value={selectedMarket.slug} />
                                <input type="hidden" name="category" value={category} />
                                <input type="hidden" name="serviceMode" value={mode} />
                                <input type="hidden" name="tierSlug" value={t.slug} />
                                <input name="priceUsd" type="number" step="0.01" min="0.01" required defaultValue={rate?.priceUsd} placeholder="Price USD" className="rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small" />
                                <button type="submit" className="rounded-lg bg-ordift-ink text-white px-4 py-2 font-sans text-body-small">Save new version</button>
                              </form>
                            </details>
                          );
                        })}
                      </div>
                    </section>

                    <section className="rounded-xl border border-black/10 bg-white p-6 space-y-4">
                      <h2 className="font-serif font-medium text-body text-ordift-ink">Priority Delivery — {category === "wedding" ? "Wedding" : "Event"}</h2>
                      <p className="font-sans text-caption text-ordift-ink-muted">Global — not market-specific. Never applied automatically; the client must deliberately request it.</p>
                      <ul className="divide-y divide-black/5">
                        {tierOptions.map((t) => {
                          const priority = priorityRates.find((r) => r.tierSlug === t.slug);
                          return (
                            <li key={t.slug} className="py-2.5">
                              <div className="flex items-baseline justify-between font-sans text-body-small text-ordift-ink">
                                <span>{t.label}</span>
                                <span>{priority ? `+${priority.multiplierPercentage}%` : "Not set"}</span>
                              </div>
                              <details className="mt-2 rounded-lg border border-black/10 px-4 py-2">
                                <summary className="cursor-pointer font-sans text-caption text-ordift-ink select-none">Edit</summary>
                                <form action={createWeddingEventPriorityDeliveryVersionAction} className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-3">
                                  <input type="hidden" name="category" value={category} />
                                  <input type="hidden" name="tierSlug" value={t.slug} />
                                  <input name="multiplierPercentage" type="number" step="0.01" min="0.01" required defaultValue={priority?.multiplierPercentage} placeholder="Percentage" className="rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small" />
                                  <button type="submit" className="rounded-lg bg-ordift-ink text-white px-4 py-2 font-sans text-body-small">Save new version</button>
                                </form>
                              </details>
                            </li>
                          );
                        })}
                      </ul>
                    </section>
                  </>
                );
              })()}
            </div>
          )}

          {weSub === "addons" && (
            <div className="space-y-6">
              <MarketPills tab="wedding_event" extraQuery="&weSub=addons" markets={activeMarkets} active={selectedMarket.slug} />

              {ADDON_GROUPS.map((group) => (
                <section key={group.title} className="rounded-xl border border-black/10 bg-white p-6 space-y-4">
                  <h2 className="font-serif font-medium text-body text-ordift-ink">{selectedMarket.name} — {group.title}</h2>
                  <ul className="divide-y divide-black/5">
                    {group.items.map((item) => (
                      <li key={item.slug} className="py-2.5">
                        <div className="flex items-baseline justify-between font-sans text-body-small text-ordift-ink">
                          <span>{item.label}</span>
                          <span>{weddingEventAddonRates[item.slug] != null ? `$${weddingEventAddonRates[item.slug]!.toFixed(2)}` : "— not set —"}</span>
                        </div>
                        <details className="mt-2 rounded-lg border border-black/10 px-4 py-2">
                          <summary className="cursor-pointer font-sans text-caption text-ordift-ink select-none">Edit</summary>
                          <form action={createWeddingEventAddonRateVersionAction} className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-3">
                            <input type="hidden" name="marketSlug" value={selectedMarket.slug} />
                            <input type="hidden" name="addonSlug" value={item.slug} />
                            <input name="priceUsd" type="number" step="0.01" min="0.01" required defaultValue={weddingEventAddonRates[item.slug] ?? undefined} placeholder="Price USD" className="rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small" />
                            <button type="submit" className="rounded-lg bg-ordift-ink text-white px-4 py-2 font-sans text-body-small">Save new version</button>
                          </form>
                        </details>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}

              <section className="rounded-xl border border-black/10 bg-white p-6 space-y-4">
                <h2 className="font-serif font-medium text-body text-ordift-ink">Formula Percentages (Global)</h2>
                <p className="font-sans text-caption text-ordift-ink-muted">Not market-specific. Corporate/Organisational Scope is applied only when explicitly requested for an Event — never merely because a company is the client.</p>
                <ul className="divide-y divide-black/5">
                  {WEDDING_EVENT_PERCENTAGE_OPTIONS.map((p) => (
                    <li key={p.slug} className="py-2.5">
                      <div className="flex items-baseline justify-between font-sans text-body-small text-ordift-ink">
                        <span>{p.label}</span>
                        <span>{weddingEventPercentageRates[p.slug] != null ? `${weddingEventPercentageRates[p.slug]}%` : "Not set"}</span>
                      </div>
                      <details className="mt-2 rounded-lg border border-black/10 px-4 py-2">
                        <summary className="cursor-pointer font-sans text-caption text-ordift-ink select-none">Edit</summary>
                        <form action={createWeddingEventPercentageRateVersionAction} className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-3">
                          <input type="hidden" name="percentageSlug" value={p.slug} />
                          <input name="percentage" type="number" step="0.01" min="0.01" required defaultValue={weddingEventPercentageRates[p.slug] ?? undefined} placeholder="Percentage" className="rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small" />
                          <button type="submit" className="rounded-lg bg-ordift-ink text-white px-4 py-2 font-sans text-body-small">Save new version</button>
                        </form>
                      </details>
                    </li>
                  ))}
                </ul>
              </section>
            </div>
          )}
        </div>
      )}

      {tab === "commercial" && selectedMarket && (
        <div className="space-y-6">
          <CommercialSubNav active={commSub} market={selectedMarket.slug} />

          {commSub === "creative_fees" && (
            <div className="space-y-6">
              <MarketPills tab="commercial" extraQuery={`&commSub=creative_fees&mode=${mode}`} markets={activeMarkets} active={selectedMarket.slug} />
              <CommercialModePills market={selectedMarket.slug} active={mode as CommercialServiceMode} />

              <section className="rounded-xl border border-black/10 bg-white p-6 space-y-4">
                <h2 className="font-serif font-medium text-body text-ordift-ink">{selectedMarket.name} — {SERVICE_MODES.find((m) => m.slug === mode)?.label}</h2>
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="font-sans text-caption uppercase tracking-wide text-ordift-ink-muted">
                        <th className="pb-2">Production scope</th>
                        <th className="pb-2">Creative fee</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-black/5">
                      {COMMERCIAL_SCOPE_OPTIONS.map((s) => {
                        const rate = commercialCreativeFeeRates.find((r) => r.serviceMode === mode && r.scopeSlug === s.slug);
                        return (
                          <tr key={s.slug} className="font-sans text-body-small text-ordift-ink">
                            <td className="py-2">{s.label}</td>
                            <td className="py-2">{rate ? `$${rate.priceUsd.toFixed(2)}` : "— not set —"}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                <div className="space-y-2 pt-2 border-t border-black/5">
                  <p className="font-sans text-caption text-ordift-ink-muted">This is Ordift&rsquo;s creative/production leadership fee only — it excludes supplier-dependent production expenses and any commercial usage rights. Edit a scope — current value is prefilled.</p>
                  {COMMERCIAL_SCOPE_OPTIONS.map((s) => {
                    const rate = commercialCreativeFeeRates.find((r) => r.serviceMode === mode && r.scopeSlug === s.slug);
                    return (
                      <details key={s.slug} className="rounded-lg border border-black/10 px-4 py-2">
                        <summary className="cursor-pointer font-sans text-body-small text-ordift-ink select-none">Edit {s.label} rate</summary>
                        <form action={createCommercialCreativeFeeRateVersionAction} className="grid grid-cols-1 sm:grid-cols-4 gap-3 mt-3">
                          <input type="hidden" name="marketSlug" value={selectedMarket.slug} />
                          <input type="hidden" name="serviceMode" value={mode} />
                          <input type="hidden" name="scopeSlug" value={s.slug} />
                          <input name="priceUsd" type="number" step="0.01" min="0.01" required defaultValue={rate?.priceUsd} placeholder="Price USD" className="rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small" />
                          <button type="submit" className="rounded-lg bg-ordift-ink text-white px-4 py-2 font-sans text-body-small">Save new version</button>
                        </form>
                      </details>
                    );
                  })}
                </div>
              </section>
            </div>
          )}

          {commSub === "catalogue" && (
            <div className="space-y-6">
              <MarketPills tab="commercial" extraQuery="&commSub=catalogue" markets={activeMarkets} active={selectedMarket.slug} />

              <section className="rounded-xl border border-black/10 bg-white p-6 space-y-4">
                <h2 className="font-serif font-medium text-body text-ordift-ink">{selectedMarket.name} — Catalogue Base Rate &amp; Minimum</h2>
                <p className="font-sans text-caption text-ordift-ink-muted">Per finished image, 1–10 image tier. catalogueSubtotal = quantity × base rate × complexity factor × volume factor, then MAX against the minimum.</p>
                <div className="flex items-baseline justify-between font-sans text-body-small text-ordift-ink">
                  <span>Base rate per image</span>
                  <span>{commercialCatalogueBaseRate != null ? `$${commercialCatalogueBaseRate.toFixed(2)}` : "— not set —"}</span>
                </div>
                <div className="flex items-baseline justify-between font-sans text-body-small text-ordift-ink">
                  <span>Minimum booking</span>
                  <span>{commercialCatalogueMinimum != null ? `$${commercialCatalogueMinimum.toFixed(2)}` : "— not set —"}</span>
                </div>

                <details className="rounded-lg border border-black/10 px-4 py-2">
                  <summary className="cursor-pointer font-sans text-body-small text-ordift-ink select-none">Edit base rate</summary>
                  <form action={createCommercialCatalogueBaseRateVersionAction} className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-3">
                    <input type="hidden" name="marketSlug" value={selectedMarket.slug} />
                    <input name="priceUsd" type="number" step="0.01" min="0.01" required defaultValue={commercialCatalogueBaseRate ?? undefined} placeholder="Price per image USD" className="rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small" />
                    <button type="submit" className="rounded-lg bg-ordift-ink text-white px-4 py-2 font-sans text-body-small">Save new version</button>
                  </form>
                </details>
                <details className="rounded-lg border border-black/10 px-4 py-2">
                  <summary className="cursor-pointer font-sans text-body-small text-ordift-ink select-none">Edit minimum booking</summary>
                  <form action={createCommercialCatalogueMinimumVersionAction} className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-3">
                    <input type="hidden" name="marketSlug" value={selectedMarket.slug} />
                    <input name="minimumUsd" type="number" step="0.01" min="0.01" required defaultValue={commercialCatalogueMinimum ?? undefined} placeholder="Minimum USD" className="rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small" />
                    <button type="submit" className="rounded-lg bg-ordift-ink text-white px-4 py-2 font-sans text-body-small">Save new version</button>
                  </form>
                </details>
              </section>

              <section className="rounded-xl border border-black/10 bg-white p-6 space-y-4">
                <h2 className="font-serif font-medium text-body text-ordift-ink">Volume Factors (Global)</h2>
                <p className="font-sans text-caption text-ordift-ink-muted">Not market-specific. 101+ images has no row by design — always a Custom Volume Proposal.</p>
                <ul className="divide-y divide-black/5">
                  {commercialVolumeFactors.map((v) => (
                    <li key={v.tierSlug} className="py-2.5">
                      <div className="flex items-baseline justify-between font-sans text-body-small text-ordift-ink">
                        <span>{v.tierSlug} images</span>
                        <span>{v.factor.toFixed(2)}×</span>
                      </div>
                    </li>
                  ))}
                </ul>
                <p className="font-sans text-caption text-ordift-ink-muted">Volume tier boundaries are structural (1-10/11-25/26-50/51-100) — only the factor value is edited here, via direct database access if a correction is ever needed. No public edit form is exposed for tier boundaries in V1.</p>
              </section>

              <section className="rounded-xl border border-black/10 bg-white p-6 space-y-4">
                <h2 className="font-serif font-medium text-body text-ordift-ink">Complexity Factors (Global)</h2>
                <p className="font-sans text-caption text-ordift-ink-muted">Styled/Creative Product is not a valid catalogue complexity — it always routes to normal Commercial Production.</p>
                <ul className="divide-y divide-black/5">
                  {commercialComplexityFactors.map((c) => (
                    <li key={c.complexity} className="py-2.5">
                      <div className="flex items-baseline justify-between font-sans text-body-small text-ordift-ink">
                        <span className="capitalize">{c.complexity}</span>
                        <span>{c.factor.toFixed(2)}×</span>
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            </div>
          )}

          {commSub === "postproduction" && (
            <section className="rounded-xl border border-black/10 bg-white p-6 space-y-4">
              <h2 className="font-serif font-medium text-body text-ordift-ink">Post-Production Reference Rates (Global)</h2>
              <p className="font-sans text-caption text-ordift-ink-muted">Not market-specific — the approved spec gives single global figures. Advanced Motion Graphics/VFX has no row and always routes to Custom Proposal. Commercial Priority (+35%) applies only to this subtotal.</p>
              <ul className="divide-y divide-black/5">
                {COMMERCIAL_POSTPRODUCTION_ITEMS.map((item) => {
                  const rate = commercialPostProductionRates.find((r) => r.itemSlug === item.slug);
                  return (
                    <li key={item.slug} className="py-2.5">
                      <div className="flex items-baseline justify-between font-sans text-body-small text-ordift-ink">
                        <span>{item.label}</span>
                        <span>{rate ? `${rate.isFromPrice ? "from " : ""}$${rate.priceUsd.toFixed(2)}` : "— not set —"}</span>
                      </div>
                      <details className="mt-2 rounded-lg border border-black/10 px-4 py-2">
                        <summary className="cursor-pointer font-sans text-caption text-ordift-ink select-none">Edit</summary>
                        <form action={createCommercialPostProductionRateVersionAction} className="grid grid-cols-1 sm:grid-cols-4 gap-3 mt-3">
                          <input type="hidden" name="itemSlug" value={item.slug} />
                          <input name="priceUsd" type="number" step="0.01" min="0.01" required defaultValue={rate?.priceUsd} placeholder="Price USD" className="rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small" />
                          <label className="flex items-center gap-2 font-sans text-caption text-ordift-ink-muted">
                            <input type="checkbox" name="isFromPrice" value="true" defaultChecked={rate?.isFromPrice} className="w-4 h-4" />
                            &ldquo;From&rdquo; indicative minimum only
                          </label>
                          <button type="submit" className="rounded-lg bg-ordift-ink text-white px-4 py-2 font-sans text-body-small">Save new version</button>
                        </form>
                      </details>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          {commSub === "licensing" && (
            <div className="space-y-6">
              {COMMERCIAL_LICENSING_GROUPS.map((group) => (
                <section key={group.factorType} className="rounded-xl border border-black/10 bg-white p-6 space-y-4">
                  <h2 className="font-serif font-medium text-body text-ordift-ink">{group.title}</h2>
                  <ul className="divide-y divide-black/5">
                    {group.items.map((item) => {
                      const value = (commercialLicensingFactors[group.factorType] as Record<string, number>)[item.slug];
                      return (
                        <li key={item.slug} className="py-2.5">
                          <div className="flex items-baseline justify-between font-sans text-body-small text-ordift-ink">
                            <span>{item.label}</span>
                            <span>{value != null ? `${value.toFixed(2)}×` : "— not set —"}</span>
                          </div>
                          <details className="mt-2 rounded-lg border border-black/10 px-4 py-2">
                            <summary className="cursor-pointer font-sans text-caption text-ordift-ink select-none">Edit</summary>
                            <form action={createCommercialLicensingFactorVersionAction} className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-3">
                              <input type="hidden" name="factorType" value={group.factorType} />
                              <input type="hidden" name="factorSlug" value={item.slug} />
                              <input name="factorValue" type="number" step="0.01" min="0.01" required defaultValue={value ?? undefined} placeholder="Factor" className="rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small" />
                              <button type="submit" className="rounded-lg bg-ordift-ink text-white px-4 py-2 font-sans text-body-small">Save new version</button>
                            </form>
                          </details>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              ))}

              <section className="rounded-xl border border-black/10 bg-white p-6 space-y-4">
                <h2 className="font-serif font-medium text-body text-ordift-ink">Formula Percentages (Global)</h2>
                <ul className="divide-y divide-black/5">
                  {(["priority_postproduction", "licensing_floor"] as const).map((slug) => (
                    <li key={slug} className="py-2.5">
                      <div className="flex items-baseline justify-between font-sans text-body-small text-ordift-ink">
                        <span>{slug === "priority_postproduction" ? "Commercial Priority Post-Production" : "Licensing Floor (% of Creative Fee)"}</span>
                        <span>{commercialPercentages[slug] != null ? `${commercialPercentages[slug]}%` : "Not set"}</span>
                      </div>
                      <details className="mt-2 rounded-lg border border-black/10 px-4 py-2">
                        <summary className="cursor-pointer font-sans text-caption text-ordift-ink select-none">Edit</summary>
                        <form action={createCommercialPercentageVersionAction} className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-3">
                          <input type="hidden" name="percentageSlug" value={slug} />
                          <input name="percentage" type="number" step="0.01" min="0.01" required defaultValue={commercialPercentages[slug] ?? undefined} placeholder="Percentage" className="rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small" />
                          <button type="submit" className="rounded-lg bg-ordift-ink text-white px-4 py-2 font-sans text-body-small">Save new version</button>
                        </form>
                      </details>
                    </li>
                  ))}
                </ul>
              </section>
            </div>
          )}

          {commSub === "review" && (
            <div className="space-y-6">
              <MarketPills tab="commercial" extraQuery="&commSub=review" markets={activeMarkets} active={selectedMarket.slug} />
              <section className="rounded-xl border border-black/10 bg-white p-6 space-y-4">
                <h2 className="font-serif font-medium text-body text-ordift-ink">{selectedMarket.name} — Review Thresholds</h2>
                <p className="font-sans text-caption text-ordift-ink-muted">Below Review: normal indicative estimate. At/above Review but below Mandatory: &ldquo;Subject to Commercial Review&rdquo;. At/above Mandatory: &ldquo;Custom Commercial Proposal Required&rdquo;. Always-Custom conditions override these thresholds regardless of dollar total.</p>
                <div className="flex items-baseline justify-between font-sans text-body-small text-ordift-ink">
                  <span>Review threshold</span>
                  <span>{commercialReviewThreshold ? `$${commercialReviewThreshold.reviewUsd.toFixed(2)}` : "— not set —"}</span>
                </div>
                <div className="flex items-baseline justify-between font-sans text-body-small text-ordift-ink">
                  <span>Mandatory Proposal threshold</span>
                  <span>{commercialReviewThreshold ? `$${commercialReviewThreshold.mandatoryUsd.toFixed(2)}` : "— not set —"}</span>
                </div>

                <details className="rounded-lg border border-black/10 px-4 py-2">
                  <summary className="cursor-pointer font-sans text-body-small text-ordift-ink select-none">Edit thresholds</summary>
                  <form action={createCommercialReviewThresholdVersionAction} className="grid grid-cols-1 sm:grid-cols-4 gap-3 mt-3">
                    <input type="hidden" name="marketSlug" value={selectedMarket.slug} />
                    <input name="reviewUsd" type="number" step="0.01" min="0.01" required defaultValue={commercialReviewThreshold?.reviewUsd} placeholder="Review threshold USD" className="rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small" />
                    <input name="mandatoryUsd" type="number" step="0.01" min="0.01" required defaultValue={commercialReviewThreshold?.mandatoryUsd} placeholder="Mandatory threshold USD" className="rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small" />
                    <button type="submit" className="rounded-lg bg-ordift-ink text-white px-4 py-2 font-sans text-body-small">Save new version</button>
                  </form>
                </details>
              </section>
            </div>
          )}
        </div>
      )}

      {tab === "graphic_design" && selectedMarket && (
        <div className="space-y-6">
          <GraphicDesignSubNav active={gdSub} market={selectedMarket.slug} />

          {gdSub === "deliverables" && (
            <div className="space-y-6">
              <MarketPills tab="graphic_design" extraQuery="&gdSub=deliverables" markets={activeMarkets} active={selectedMarket.slug} />
              <section className="rounded-xl border border-black/10 bg-white p-6 space-y-4">
                <h2 className="font-serif font-medium text-body text-ordift-ink">{selectedMarket.name} — Deliverable Rates</h2>
                <p className="font-sans text-caption text-ordift-ink-muted">Brochure includes up to 8 pages; Presentation includes up to 10 slides — additional units are priced under Add-Ons, not a new row per count. Packaging and Custom / Complex Design have no automatic rate by design.</p>
                <ul className="divide-y divide-black/5">
                  {GRAPHIC_DESIGN_DELIVERABLE_OPTIONS.map((d) => {
                    const rate = graphicDesignDeliverableRates.find((r) => r.deliverableSlug === d.slug);
                    return (
                      <li key={d.slug} className="py-2.5">
                        <div className="flex items-baseline justify-between font-sans text-body-small text-ordift-ink">
                          <span>{d.label}</span>
                          <span>{rate ? `$${rate.priceUsd.toFixed(2)}` : "— not set —"}</span>
                        </div>
                        <details className="mt-2 rounded-lg border border-black/10 px-4 py-2">
                          <summary className="cursor-pointer font-sans text-caption text-ordift-ink select-none">Edit</summary>
                          <form action={createGraphicDesignDeliverableRateVersionAction} className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-3">
                            <input type="hidden" name="marketSlug" value={selectedMarket.slug} />
                            <input type="hidden" name="deliverableSlug" value={d.slug} />
                            <input name="priceUsd" type="number" step="0.01" min="0.01" required defaultValue={rate?.priceUsd} placeholder="Price USD" className="rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small" />
                            <button type="submit" className="rounded-lg bg-ordift-ink text-white px-4 py-2 font-sans text-body-small">Save new version</button>
                          </form>
                        </details>
                      </li>
                    );
                  })}
                </ul>
              </section>
            </div>
          )}

          {gdSub === "complexity" && (
            <section className="rounded-xl border border-black/10 bg-white p-6 space-y-4">
              <h2 className="font-serif font-medium text-body text-ordift-ink">Complexity Factors (Global)</h2>
              <p className="font-sans text-caption text-ordift-ink-muted">Not market-specific. Bespoke/Art-Directed always also flags Creative Review in the public calculator, regardless of this factor.</p>
              <ul className="divide-y divide-black/5">
                {(["standard", "enhanced", "bespoke"] as const).map((c) => {
                  const factor = graphicDesignComplexityFactors.find((f) => f.complexity === c);
                  return (
                    <li key={c} className="py-2.5">
                      <div className="flex items-baseline justify-between font-sans text-body-small text-ordift-ink">
                        <span className="capitalize">{c}</span>
                        <span>{factor ? `${factor.factor.toFixed(2)}×` : "— not set —"}</span>
                      </div>
                      <details className="mt-2 rounded-lg border border-black/10 px-4 py-2">
                        <summary className="cursor-pointer font-sans text-caption text-ordift-ink select-none">Edit</summary>
                        <form action={createGraphicDesignComplexityFactorVersionAction} className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-3">
                          <input type="hidden" name="complexity" value={c} />
                          <input name="factor" type="number" step="0.01" min="0.01" required defaultValue={factor?.factor} placeholder="Factor" className="rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small" />
                          <button type="submit" className="rounded-lg bg-ordift-ink text-white px-4 py-2 font-sans text-body-small">Save new version</button>
                        </form>
                      </details>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          {gdSub === "addons" && (
            <div className="space-y-6">
              <MarketPills tab="graphic_design" extraQuery="&gdSub=addons" markets={activeMarkets} active={selectedMarket.slug} />
              <section className="rounded-xl border border-black/10 bg-white p-6 space-y-4">
                <h2 className="font-serif font-medium text-body text-ordift-ink">{selectedMarket.name} — Add-On Rates</h2>
                <ul className="divide-y divide-black/5">
                  {GRAPHIC_DESIGN_ADDON_OPTIONS.map((item) => {
                    const rate = graphicDesignAddonRates[item.slug];
                    return (
                      <li key={item.slug} className="py-2.5">
                        <div className="flex items-baseline justify-between font-sans text-body-small text-ordift-ink">
                          <span>{item.label}</span>
                          <span>{rate != null ? `$${rate.toFixed(2)}` : "— not set —"}</span>
                        </div>
                        <details className="mt-2 rounded-lg border border-black/10 px-4 py-2">
                          <summary className="cursor-pointer font-sans text-caption text-ordift-ink select-none">Edit</summary>
                          <form action={createGraphicDesignAddonRateVersionAction} className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-3">
                            <input type="hidden" name="marketSlug" value={selectedMarket.slug} />
                            <input type="hidden" name="addonSlug" value={item.slug} />
                            <input name="priceUsd" type="number" step="0.01" min="0.01" required defaultValue={rate ?? undefined} placeholder="Price USD" className="rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small" />
                            <button type="submit" className="rounded-lg bg-ordift-ink text-white px-4 py-2 font-sans text-body-small">Save new version</button>
                          </form>
                        </details>
                      </li>
                    );
                  })}
                </ul>
              </section>

              <section className="rounded-xl border border-black/10 bg-white p-6 space-y-4">
                <h2 className="font-serif font-medium text-body text-ordift-ink">Formula Percentages (Global)</h2>
                <ul className="divide-y divide-black/5">
                  {GRAPHIC_DESIGN_PERCENTAGE_OPTIONS.map((p) => {
                    const value = graphicDesignPercentages[p.slug];
                    return (
                      <li key={p.slug} className="py-2.5">
                        <div className="flex items-baseline justify-between font-sans text-body-small text-ordift-ink">
                          <span>{p.label}</span>
                          <span>{value != null ? `${value}%` : "Not set"}</span>
                        </div>
                        <details className="mt-2 rounded-lg border border-black/10 px-4 py-2">
                          <summary className="cursor-pointer font-sans text-caption text-ordift-ink select-none">Edit</summary>
                          <form action={createGraphicDesignPercentageVersionAction} className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-3">
                            <input type="hidden" name="percentageSlug" value={p.slug} />
                            <input name="percentage" type="number" step="0.01" min="0.01" required defaultValue={value ?? undefined} placeholder="Percentage" className="rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small" />
                            <button type="submit" className="rounded-lg bg-ordift-ink text-white px-4 py-2 font-sans text-body-small">Save new version</button>
                          </form>
                        </details>
                      </li>
                    );
                  })}
                </ul>
              </section>
            </div>
          )}
        </div>
      )}

      {tab === "content_creation" && selectedMarket && (
        <div className="space-y-6">
          <ContentCreationSubNav active={ccSub} market={selectedMarket.slug} />

          {ccSub === "packages" && (
            <div className="space-y-6">
              <MarketPills tab="content_creation" extraQuery="&ccSub=packages" markets={activeMarkets} active={selectedMarket.slug} />
              <section className="rounded-xl border border-black/10 bg-white p-6 space-y-4">
                <h2 className="font-serif font-medium text-body text-ordift-ink">{selectedMarket.name} — Package Rates</h2>
                <p className="font-sans text-caption text-ordift-ink-muted">Every rate below is a flat, deliberately non-multiplicative package price. Mixed Social Content and Product/Food Social Content reuse these same rows; Custom Content Production has no automatic rate by design.</p>
                <ul className="divide-y divide-black/5">
                  {CONTENT_CREATION_PACKAGE_OPTIONS.map((d) => {
                    const rate = contentCreationPackageRates.find((r) => r.packageSlug === d.slug);
                    return (
                      <li key={d.slug} className="py-2.5">
                        <div className="flex items-baseline justify-between font-sans text-body-small text-ordift-ink">
                          <span>{d.label}</span>
                          <span>{rate ? `$${rate.priceUsd.toFixed(2)}` : "— not set —"}</span>
                        </div>
                        <details className="mt-2 rounded-lg border border-black/10 px-4 py-2">
                          <summary className="cursor-pointer font-sans text-caption text-ordift-ink select-none">Edit</summary>
                          <form action={createContentCreationPackageRateVersionAction} className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-3">
                            <input type="hidden" name="marketSlug" value={selectedMarket.slug} />
                            <input type="hidden" name="packageSlug" value={d.slug} />
                            <input name="priceUsd" type="number" step="0.01" min="0.01" required defaultValue={rate?.priceUsd} placeholder="Price USD" className="rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small" />
                            <button type="submit" className="rounded-lg bg-ordift-ink text-white px-4 py-2 font-sans text-body-small">Save new version</button>
                          </form>
                        </details>
                      </li>
                    );
                  })}
                </ul>
              </section>
            </div>
          )}

          {ccSub === "retainers" && (
            <div className="space-y-6">
              <MarketPills tab="content_creation" extraQuery="&ccSub=retainers" markets={activeMarkets} active={selectedMarket.slug} />
              <section className="rounded-xl border border-black/10 bg-white p-6 space-y-4">
                <h2 className="font-serif font-medium text-body text-ordift-ink">{selectedMarket.name} — Retainer Rates (Monthly)</h2>
                <p className="font-sans text-caption text-ordift-ink-muted">Content Production retainers only — not Social Media Management. Already-discounted flat monthly figures; no add-ons or automatic bundle discount compose on top of these in this phase.</p>
                <ul className="divide-y divide-black/5">
                  {CONTENT_CREATION_RETAINER_OPTIONS.map((r) => {
                    const rate = contentCreationRetainerRates.find((row) => row.retainerSlug === r.slug);
                    return (
                      <li key={r.slug} className="py-2.5">
                        <div className="flex items-baseline justify-between font-sans text-body-small text-ordift-ink">
                          <span>{r.label}</span>
                          <span>{rate ? `$${rate.priceUsd.toFixed(2)} / month` : "— not set —"}</span>
                        </div>
                        <details className="mt-2 rounded-lg border border-black/10 px-4 py-2">
                          <summary className="cursor-pointer font-sans text-caption text-ordift-ink select-none">Edit</summary>
                          <form action={createContentCreationRetainerRateVersionAction} className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-3">
                            <input type="hidden" name="marketSlug" value={selectedMarket.slug} />
                            <input type="hidden" name="retainerSlug" value={r.slug} />
                            <input name="priceUsd" type="number" step="0.01" min="0.01" required defaultValue={rate?.priceUsd} placeholder="Price USD" className="rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small" />
                            <button type="submit" className="rounded-lg bg-ordift-ink text-white px-4 py-2 font-sans text-body-small">Save new version</button>
                          </form>
                        </details>
                      </li>
                    );
                  })}
                </ul>
              </section>
            </div>
          )}

          {ccSub === "addons" && (
            <div className="space-y-6">
              <MarketPills tab="content_creation" extraQuery="&ccSub=addons" markets={activeMarkets} active={selectedMarket.slug} />
              <section className="rounded-xl border border-black/10 bg-white p-6 space-y-4">
                <h2 className="font-serif font-medium text-body text-ordift-ink">{selectedMarket.name} — Add-On Rates</h2>
                <ul className="divide-y divide-black/5">
                  {CONTENT_CREATION_ADDON_OPTIONS.map((item) => {
                    const rate = contentCreationAddonRates[item.slug];
                    return (
                      <li key={item.slug} className="py-2.5">
                        <div className="flex items-baseline justify-between font-sans text-body-small text-ordift-ink">
                          <span>{item.label}</span>
                          <span>{rate != null ? `$${rate.toFixed(2)}` : "— not set —"}</span>
                        </div>
                        <details className="mt-2 rounded-lg border border-black/10 px-4 py-2">
                          <summary className="cursor-pointer font-sans text-caption text-ordift-ink select-none">Edit</summary>
                          <form action={createContentCreationAddonRateVersionAction} className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-3">
                            <input type="hidden" name="marketSlug" value={selectedMarket.slug} />
                            <input type="hidden" name="addonSlug" value={item.slug} />
                            <input name="priceUsd" type="number" step="0.01" min="0.01" required defaultValue={rate ?? undefined} placeholder="Price USD" className="rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small" />
                            <button type="submit" className="rounded-lg bg-ordift-ink text-white px-4 py-2 font-sans text-body-small">Save new version</button>
                          </form>
                        </details>
                      </li>
                    );
                  })}
                </ul>
              </section>

              <section className="rounded-xl border border-black/10 bg-white p-6 space-y-4">
                <h2 className="font-serif font-medium text-body text-ordift-ink">Formula Percentages (Global)</h2>
                <p className="font-sans text-caption text-ordift-ink-muted">No &ldquo;urgent&rdquo; percentage exists for Content Creation by design — Same/Next-Day Social Edit is a flat per-video add-on above, and Exceptional emergency turnaround always requires Custom Confirmation.</p>
                <ul className="divide-y divide-black/5">
                  {CONTENT_CREATION_PERCENTAGE_OPTIONS.map((p) => {
                    const value = contentCreationPercentages[p.slug];
                    return (
                      <li key={p.slug} className="py-2.5">
                        <div className="flex items-baseline justify-between font-sans text-body-small text-ordift-ink">
                          <span>{p.label}</span>
                          <span>{value != null ? `${value}%` : "Not set"}</span>
                        </div>
                        <details className="mt-2 rounded-lg border border-black/10 px-4 py-2">
                          <summary className="cursor-pointer font-sans text-caption text-ordift-ink select-none">Edit</summary>
                          <form action={createContentCreationPercentageVersionAction} className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-3">
                            <input type="hidden" name="percentageSlug" value={p.slug} />
                            <input name="percentage" type="number" step="0.01" min="0.01" required defaultValue={value ?? undefined} placeholder="Percentage" className="rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small" />
                            <button type="submit" className="rounded-lg bg-ordift-ink text-white px-4 py-2 font-sans text-body-small">Save new version</button>
                          </form>
                        </details>
                      </li>
                    );
                  })}
                </ul>
              </section>
            </div>
          )}
        </div>
      )}

      {tab === "branding" && selectedMarket && (
        <div className="space-y-6">
          <BrandingSubNav active={brSub} market={selectedMarket.slug} />

          {brSub === "tiers" && (
            <div className="space-y-6">
              <MarketPills tab="branding" extraQuery="&brSub=tiers" markets={activeMarkets} active={selectedMarket.slug} />
              <section className="rounded-xl border border-black/10 bg-white p-6 space-y-4">
                <h2 className="font-serif font-medium text-body text-ordift-ink">{selectedMarket.name} — Service Level Rates</h2>
                <p className="font-sans text-caption text-ordift-ink-muted">Strategy + Complete Identity is its own approved package rate — never Brand Foundations&rsquo; rate plus Complete Identity&rsquo;s rate added together. Custom / Enterprise Brand Programme has no automatic rate by design.</p>
                <ul className="divide-y divide-black/5">
                  {BRANDING_TIER_OPTIONS.map((t) => {
                    const rate = brandingTierRates.find((r) => r.tierSlug === t.slug);
                    return (
                      <li key={t.slug} className="py-2.5">
                        <div className="flex items-baseline justify-between font-sans text-body-small text-ordift-ink">
                          <span>{t.label}</span>
                          <span>{rate ? `$${rate.priceUsd.toFixed(2)}` : "— not set —"}</span>
                        </div>
                        <details className="mt-2 rounded-lg border border-black/10 px-4 py-2">
                          <summary className="cursor-pointer font-sans text-caption text-ordift-ink select-none">Edit</summary>
                          <form action={createBrandingTierRateVersionAction} className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-3">
                            <input type="hidden" name="marketSlug" value={selectedMarket.slug} />
                            <input type="hidden" name="tierSlug" value={t.slug} />
                            <input name="priceUsd" type="number" step="0.01" min="0.01" required defaultValue={rate?.priceUsd} placeholder="Price USD" className="rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small" />
                            <button type="submit" className="rounded-lg bg-ordift-ink text-white px-4 py-2 font-sans text-body-small">Save new version</button>
                          </form>
                        </details>
                      </li>
                    );
                  })}
                </ul>
              </section>
            </div>
          )}

          {brSub === "formulas" && (
            <div className="space-y-6">
              <MarketPills tab="branding" extraQuery="&brSub=formulas" markets={activeMarkets} active={selectedMarket.slug} />
              <section className="rounded-xl border border-black/10 bg-white p-6 space-y-4">
                <h2 className="font-serif font-medium text-body text-ordift-ink">{selectedMarket.name} — Additional Revision Minimum</h2>
                <div className="flex items-baseline justify-between font-sans text-body-small text-ordift-ink">
                  <span>Minimum per additional revision round</span>
                  <span>{brandingRevisionMinimum != null ? `$${brandingRevisionMinimum.toFixed(2)}` : "— not set —"}</span>
                </div>
                <details className="mt-2 rounded-lg border border-black/10 px-4 py-2">
                  <summary className="cursor-pointer font-sans text-caption text-ordift-ink select-none">Edit</summary>
                  <form action={createBrandingRevisionMinimumVersionAction} className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-3">
                    <input type="hidden" name="marketSlug" value={selectedMarket.slug} />
                    <input name="minimumUsd" type="number" step="0.01" min="0.01" required defaultValue={brandingRevisionMinimum ?? undefined} placeholder="Minimum USD" className="rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small" />
                    <button type="submit" className="rounded-lg bg-ordift-ink text-white px-4 py-2 font-sans text-body-small">Save new version</button>
                  </form>
                </details>
              </section>

              <section className="rounded-xl border border-black/10 bg-white p-6 space-y-4">
                <h2 className="font-serif font-medium text-body text-ordift-ink">Formula Percentages (Global)</h2>
                <p className="font-sans text-caption text-ordift-ink-muted">No &ldquo;urgent&rdquo; percentage exists for Branding by design — an extremely compressed/unsafe timeline always requires Custom Confirmation, and Ordift does not offer same-day Branding.</p>
                <ul className="divide-y divide-black/5">
                  {BRANDING_PERCENTAGE_OPTIONS.map((p) => {
                    const value = brandingPercentages[p.slug];
                    return (
                      <li key={p.slug} className="py-2.5">
                        <div className="flex items-baseline justify-between font-sans text-body-small text-ordift-ink">
                          <span>{p.label}</span>
                          <span>{value != null ? `${value}%` : "Not set"}</span>
                        </div>
                        <details className="mt-2 rounded-lg border border-black/10 px-4 py-2">
                          <summary className="cursor-pointer font-sans text-caption text-ordift-ink select-none">Edit</summary>
                          <form action={createBrandingPercentageVersionAction} className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-3">
                            <input type="hidden" name="percentageSlug" value={p.slug} />
                            <input name="percentage" type="number" step="0.01" min="0.01" required defaultValue={value ?? undefined} placeholder="Percentage" className="rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small" />
                            <button type="submit" className="rounded-lg bg-ordift-ink text-white px-4 py-2 font-sans text-body-small">Save new version</button>
                          </form>
                        </details>
                      </li>
                    );
                  })}
                </ul>
              </section>
            </div>
          )}
        </div>
      )}

      {tab === "production_services" && selectedMarket && (
        <div className="space-y-6">
          <ProductionSubNav active={prSub} market={selectedMarket.slug} />
          <p className="font-sans text-caption text-ordift-ink-muted">
            External supplier/procurement records (the supplier directory, supplier quotes, and production budget versions) are a governed internal data layer under Operations Coordinate authorization — not shown here, since these rate cards are Ordift&rsquo;s own fee/formula figures only, the same surface every other pricing family exposes.
          </p>

          {prSub === "management" && (
            <div className="space-y-6">
              <MarketPills tab="production_services" extraQuery="&prSub=management" markets={activeMarkets} active={selectedMarket.slug} />
              <section className="rounded-xl border border-black/10 bg-white p-6 space-y-4">
                <h2 className="font-serif font-medium text-body text-ordift-ink">{selectedMarket.name} — Management &amp; Planning Rates</h2>
                <p className="font-sans text-caption text-ordift-ink-muted">Production Management Fee = MAX(market minimum, eligible managed external cost × 15%). Planning fees are flat Ordift labour fees — external expenses remain separate.</p>
                <ul className="divide-y divide-black/5">
                  {PRODUCTION_MANAGEMENT_RATE_OPTIONS.map((r) => {
                    const rate = productionRates.find((row) => row.rateSlug === r.slug);
                    return (
                      <li key={r.slug} className="py-2.5">
                        <div className="flex items-baseline justify-between font-sans text-body-small text-ordift-ink">
                          <span>{r.label}</span>
                          <span>{rate ? `$${rate.priceUsd.toFixed(2)}` : "— not set —"}</span>
                        </div>
                        <details className="mt-2 rounded-lg border border-black/10 px-4 py-2">
                          <summary className="cursor-pointer font-sans text-caption text-ordift-ink select-none">Edit</summary>
                          <form action={createProductionRateVersionAction} className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-3">
                            <input type="hidden" name="marketSlug" value={selectedMarket.slug} />
                            <input type="hidden" name="rateSlug" value={r.slug} />
                            <input name="priceUsd" type="number" step="0.01" min="0.01" required defaultValue={rate?.priceUsd} placeholder="Price USD" className="rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small" />
                            <button type="submit" className="rounded-lg bg-ordift-ink text-white px-4 py-2 font-sans text-body-small">Save new version</button>
                          </form>
                        </details>
                      </li>
                    );
                  })}
                </ul>
              </section>

              <section className="rounded-xl border border-black/10 bg-white p-6 space-y-4">
                <h2 className="font-serif font-medium text-body text-ordift-ink">Formula Percentages (Global)</h2>
                <ul className="divide-y divide-black/5">
                  {PRODUCTION_PERCENTAGE_OPTIONS.map((p) => {
                    const value = productionPercentages[p.slug];
                    return (
                      <li key={p.slug} className="py-2.5">
                        <div className="flex items-baseline justify-between font-sans text-body-small text-ordift-ink">
                          <span>{p.label}</span>
                          <span>{value != null ? `${value}%` : "Not set"}</span>
                        </div>
                        <details className="mt-2 rounded-lg border border-black/10 px-4 py-2">
                          <summary className="cursor-pointer font-sans text-caption text-ordift-ink select-none">Edit</summary>
                          <form action={createProductionPercentageVersionAction} className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-3">
                            <input type="hidden" name="percentageSlug" value={p.slug} />
                            <input name="percentage" type="number" step="0.01" min="0.01" required defaultValue={value ?? undefined} placeholder="Percentage" className="rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small" />
                            <button type="submit" className="rounded-lg bg-ordift-ink text-white px-4 py-2 font-sans text-body-small">Save new version</button>
                          </form>
                        </details>
                      </li>
                    );
                  })}
                </ul>
              </section>
            </div>
          )}

          {prSub === "coordination" && (
            <div className="space-y-6">
              <MarketPills tab="production_services" extraQuery="&prSub=coordination" markets={activeMarkets} active={selectedMarket.slug} />
              <section className="rounded-xl border border-black/10 bg-white p-6 space-y-4">
                <h2 className="font-serif font-medium text-body text-ordift-ink">{selectedMarket.name} — Standalone Coordination Rates</h2>
                <p className="font-sans text-caption text-ordift-ink-muted">These apply only when Ordift is engaged for isolated sourcing/coordination outside a Full Production Management scope — never stacked on the same underlying cost as the Production Management fee.</p>
                <ul className="divide-y divide-black/5">
                  {PRODUCTION_COORDINATION_RATE_OPTIONS.map((r) => {
                    const rate = productionRates.find((row) => row.rateSlug === r.slug);
                    return (
                      <li key={r.slug} className="py-2.5">
                        <div className="flex items-baseline justify-between font-sans text-body-small text-ordift-ink">
                          <span>{r.label}</span>
                          <span>{rate ? `$${rate.priceUsd.toFixed(2)}` : "— not set —"}</span>
                        </div>
                        <details className="mt-2 rounded-lg border border-black/10 px-4 py-2">
                          <summary className="cursor-pointer font-sans text-caption text-ordift-ink select-none">Edit</summary>
                          <form action={createProductionRateVersionAction} className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-3">
                            <input type="hidden" name="marketSlug" value={selectedMarket.slug} />
                            <input type="hidden" name="rateSlug" value={r.slug} />
                            <input name="priceUsd" type="number" step="0.01" min="0.01" required defaultValue={rate?.priceUsd} placeholder="Price USD" className="rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small" />
                            <button type="submit" className="rounded-lg bg-ordift-ink text-white px-4 py-2 font-sans text-body-small">Save new version</button>
                          </form>
                        </details>
                      </li>
                    );
                  })}
                </ul>
              </section>
            </div>
          )}
        </div>
      )}

      {tab === "discounts" && (
        <div className="space-y-6">
          <section className="rounded-xl border border-black/10 bg-white p-6 space-y-4">
            <h2 className="font-serif font-medium text-body text-ordift-ink">Promotional Discount Codes</h2>
            <p className="font-sans text-caption text-ordift-ink-muted">
              Reusable, client-facing codes — a configured percentage off, with a reason/campaign note. Created inactive by default; activate deliberately when ready. <strong>Deactivate</strong> is temporary — a code may be reused/reactivated later (a seasonal promotion, say). <strong>Delete</strong> is for a configuration genuinely no longer wanted, but a code with any redemption history is archived/retired instead of physically deleted, so financial/audit history is never destroyed.
            </p>
            {discountCodes.length === 0 ? (
              <p className="font-sans text-body-small text-ordift-ink-muted">None created yet.</p>
            ) : (
              <ul className="divide-y divide-black/5">
                {discountCodes.map((d) => (
                  <li key={d.id} className="py-2.5 space-y-1">
                    <div className="flex items-center justify-between">
                      <span className={`font-sans text-body-small ${d.archivedAt ? "text-ordift-ink-muted line-through" : d.active ? "text-ordift-ink" : "text-ordift-ink-muted line-through"}`}>
                        {d.code} — {d.value}% off {d.archivedAt && <span className="text-caption">(archived — redemption history protected)</span>}
                      </span>
                      {!d.archivedAt && (
                        <div className="flex items-center gap-3">
                          <form action={setDiscountCodeActiveAction}>
                            <input type="hidden" name="discountCodeId" value={d.id} />
                            <input type="hidden" name="active" value={String(d.active)} />
                            <button type="submit" className="font-sans text-caption text-ordift-gold-pressed underline underline-offset-4">
                              {d.active ? "Deactivate" : "Activate"}
                            </button>
                          </form>
                          <DeleteDiscountButton id={d.id} code={d.code} redemptionCount={d.redemptionCount} />
                        </div>
                      )}
                    </div>
                    <p className="font-sans text-caption text-ordift-ink-muted">
                      {d.archivedAt
                        ? `Retired ${new Date(d.archivedAt).toLocaleDateString()} — ${d.redemptionCount} redemption${d.redemptionCount === 1 ? "" : "s"} on record, cannot be reactivated or permanently deleted.`
                        : `Redeemed ${d.redemptionCount} time${d.redemptionCount === 1 ? "" : "s"}${d.redemptionCount > 0 ? " — permanent deletion is unavailable; Delete will archive/retire it instead." : " — eligible for permanent deletion."}`}
                    </p>
                  </li>
                ))}
              </ul>
            )}
            <form action={createDiscountCodeAction} className="grid grid-cols-1 sm:grid-cols-4 gap-3 pt-3 border-t border-black/5">
              <input name="code" required placeholder="Code, e.g. WELCOME5" className="rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small" />
              <input name="value" type="number" step="0.01" min="0.01" max="100" required placeholder="Percent off" className="rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small" />
              <input name="reason" required placeholder="Reason / campaign" className="rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small sm:col-span-1" />
              <button type="submit" className="rounded-lg bg-ordift-ink text-white px-4 py-2 font-sans text-body-small">Create (inactive)</button>
            </form>
          </section>

          <section className="rounded-xl border border-black/10 bg-white p-6 space-y-4">
            <h2 className="font-serif font-medium text-body text-ordift-ink">Manual Discount</h2>
            <p className="font-sans text-caption text-ordift-ink-muted">
              A one-off authorized adjustment for a specific enquiry/booking — no code, never available to clients directly. Every application is recorded with the original amount, discount, final amount, your account, your reason, and a timestamp.
            </p>
            <ManualDiscountForm action={applyManualDiscountAction} />
          </section>
        </div>
      )}

      {tab === "markets" && (
        <section className="rounded-xl border border-black/10 bg-white p-6 space-y-4">
          <h2 className="font-serif font-medium text-body text-ordift-ink">Pricing Markets</h2>
          <ul className="divide-y divide-black/5">
            {markets.map((m) => (
              <li key={m.id} className="flex items-center justify-between py-2.5">
                <span className={`font-sans text-body-small ${m.active ? "text-ordift-ink" : "text-ordift-ink-muted"}`}>
                  {m.name} {!m.active && <span className="text-caption">(inactive — no approved rates)</span>}
                </span>
                <form action={setPricingMarketActiveAction}>
                  <input type="hidden" name="marketSlug" value={m.slug} />
                  <input type="hidden" name="active" value={String(m.active)} />
                  <button type="submit" className="font-sans text-caption text-ordift-gold-pressed underline underline-offset-4">
                    {m.active ? "Deactivate" : "Activate"}
                  </button>
                </form>
              </li>
            ))}
          </ul>
          <p className="font-sans text-caption text-ordift-ink-muted">Country-specific overrides are not yet configured for any market — the architecture supports mapping a country to its own market later without a code change, but none has been created.</p>
        </section>
      )}
    </div>
  );
}
