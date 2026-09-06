import { createAdminClient } from "@/lib/supabase/admin";
import { authorizeWithSuperAdminOverride, FINANCE_CAPABILITIES } from "@/lib/organization/authority";
import { logActivity } from "@/lib/admin/activityLog";
import {
  calculateWeddingEstimate,
  calculateEventEstimate,
  calculateRawFileGuidance,
  type WeddingEventCategory,
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
  type WeddingEventEstimateResult,
  type RawFileGuidanceResult,
} from "./weddingEventEstimate";

// Ordift Weddings & Events Pricing V1 (2026-09-06) — server-only
// DB-reading/writing functions. Pure calculation logic and shared types
// live in weddingEventEstimate.ts (zero imports) and are re-exported
// below — this file must never be imported from a Client Component.
// Reads use the admin/service-role client deliberately (public
// reference data, staff-only RLS on the write path) — same established
// pattern as personalSessionPricing.ts / corporateHeadshotPricing.ts.

export type {
  WeddingEventCategory,
  ServiceMode,
  WeddingTierSlug,
  EventTierSlug,
  LivestreamTier,
  AddonSlug,
  PercentageSlug,
  AlbumSlug,
  FrameSlug,
  WeddingEventTierRate,
  WeddingEventTierDeliverable,
  WeddingEventPriorityDeliveryRate,
  WeddingEventEstimateResult,
  RawFileGuidanceResult,
};
export { calculateWeddingEstimate, calculateEventEstimate, calculateRawFileGuidance };

const WEDDING_TIERS: WeddingTierSlug[] = ["chapter", "narrative", "chronicle", "archive"];
const EVENT_TIERS: EventTierSlug[] = ["focused", "half_day", "full_day", "extended"];
const SERVICE_MODES: ServiceMode[] = ["photography", "film", "photography_film"];

async function getMarketId(admin: ReturnType<typeof createAdminClient>, marketSlug: string): Promise<string | null> {
  const { data } = await admin.from("pricing_markets").select("id").eq("slug", marketSlug).eq("active", true).maybeSingle();
  return data?.id ?? null;
}

// ---- Reads ----

export async function getActiveTierRates(category: WeddingEventCategory, marketSlug: string): Promise<WeddingEventTierRate[]> {
  const admin = createAdminClient();
  const marketId = await getMarketId(admin, marketSlug);
  if (!marketId) return [];

  const now = new Date().toISOString();
  const { data, error } = await admin
    .from("wedding_event_tier_rates")
    .select("market_id, category, service_mode, tier_slug, price_usd, effective_from")
    .eq("market_id", marketId)
    .eq("category", category)
    .eq("active", true)
    .lte("effective_from", now)
    .or(`effective_to.is.null,effective_to.gt.${now}`)
    .order("effective_from", { ascending: false });
  if (error) {
    console.error("[pricing] failed to load wedding/event tier rates", error.message);
    return [];
  }

  const seen = new Set<string>();
  const rates: WeddingEventTierRate[] = [];
  for (const row of data ?? []) {
    const key = `${row.service_mode}:${row.tier_slug}`;
    if (seen.has(key)) continue;
    seen.add(key);
    rates.push({ marketId: row.market_id, category: row.category as WeddingEventCategory, serviceMode: row.service_mode as ServiceMode, tierSlug: row.tier_slug, priceUsd: Number(row.price_usd) });
  }
  return rates;
}

export async function getTierDeliverables(category: WeddingEventCategory): Promise<WeddingEventTierDeliverable[]> {
  const admin = createAdminClient();
  const now = new Date().toISOString();
  const { data, error } = await admin
    .from("wedding_event_tier_deliverables")
    .select(
      "category, tier_slug, event_days, coverage_hours, photographers, filmmakers, professionally_edited_images_min, signature_retouched_images, highlight_film_min_minutes, highlight_film_max_minutes, includes_documentary, online_gallery, planning_consultation, priority_sneak_peek, effective_from"
    )
    .eq("category", category)
    .eq("active", true)
    .lte("effective_from", now)
    .or(`effective_to.is.null,effective_to.gt.${now}`)
    .order("effective_from", { ascending: false });
  if (error) {
    console.error("[pricing] failed to load wedding/event deliverables", error.message);
    return [];
  }

  const seen = new Set<string>();
  const rows: WeddingEventTierDeliverable[] = [];
  for (const row of data ?? []) {
    if (seen.has(row.tier_slug)) continue;
    seen.add(row.tier_slug);
    rows.push({
      category: row.category as WeddingEventCategory,
      tierSlug: row.tier_slug,
      eventDays: row.event_days,
      coverageHours: row.coverage_hours,
      photographers: row.photographers,
      filmmakers: row.filmmakers,
      professionallyEditedImagesMin: row.professionally_edited_images_min,
      signatureRetouchedImages: row.signature_retouched_images,
      highlightFilmMinMinutes: row.highlight_film_min_minutes === null ? null : Number(row.highlight_film_min_minutes),
      highlightFilmMaxMinutes: row.highlight_film_max_minutes === null ? null : Number(row.highlight_film_max_minutes),
      includesDocumentary: row.includes_documentary,
      onlineGallery: row.online_gallery,
      planningConsultation: row.planning_consultation,
      prioritySneakPeek: row.priority_sneak_peek,
    });
  }
  return rows;
}

export async function getPriorityDeliveryRates(category: WeddingEventCategory): Promise<WeddingEventPriorityDeliveryRate[]> {
  const admin = createAdminClient();
  const now = new Date().toISOString();
  const { data, error } = await admin
    .from("wedding_event_priority_delivery_rates")
    .select("category, tier_slug, multiplier_percentage, effective_from")
    .eq("category", category)
    .eq("active", true)
    .lte("effective_from", now)
    .or(`effective_to.is.null,effective_to.gt.${now}`)
    .order("effective_from", { ascending: false });
  if (error) {
    console.error("[pricing] failed to load wedding/event priority delivery rates", error.message);
    return [];
  }
  const seen = new Set<string>();
  const rows: WeddingEventPriorityDeliveryRate[] = [];
  for (const row of data ?? []) {
    if (seen.has(row.tier_slug)) continue;
    seen.add(row.tier_slug);
    rows.push({ category: row.category as WeddingEventCategory, tierSlug: row.tier_slug, multiplierPercentage: Number(row.multiplier_percentage) });
  }
  return rows;
}

export async function getAddonRates(marketSlug: string): Promise<Partial<Record<AddonSlug, number>>> {
  const admin = createAdminClient();
  const marketId = await getMarketId(admin, marketSlug);
  if (!marketId) return {};

  const now = new Date().toISOString();
  const { data, error } = await admin
    .from("wedding_event_addon_rates")
    .select("addon_slug, price_usd, effective_from")
    .eq("market_id", marketId)
    .eq("active", true)
    .lte("effective_from", now)
    .or(`effective_to.is.null,effective_to.gt.${now}`)
    .order("effective_from", { ascending: false });
  if (error) {
    console.error("[pricing] failed to load wedding/event addon rates", error.message);
    return {};
  }
  const result: Partial<Record<AddonSlug, number>> = {};
  for (const row of data ?? []) {
    const slug = row.addon_slug as AddonSlug;
    if (slug in result) continue;
    result[slug] = Number(row.price_usd);
  }
  return result;
}

export async function getPercentageRates(): Promise<Partial<Record<PercentageSlug, number>>> {
  const admin = createAdminClient();
  const now = new Date().toISOString();
  const { data, error } = await admin
    .from("wedding_event_percentage_rates")
    .select("percentage_slug, percentage, effective_from")
    .eq("active", true)
    .lte("effective_from", now)
    .or(`effective_to.is.null,effective_to.gt.${now}`)
    .order("effective_from", { ascending: false });
  if (error) {
    console.error("[pricing] failed to load wedding/event percentage rates", error.message);
    return {};
  }
  const result: Partial<Record<PercentageSlug, number>> = {};
  for (const row of data ?? []) {
    const slug = row.percentage_slug as PercentageSlug;
    if (slug in result) continue;
    result[slug] = Number(row.percentage);
  }
  return result;
}

// ---- Full orchestration ----

export async function estimateWeddingSession(params: {
  marketSlug: string;
  serviceMode: ServiceMode;
  tierSlug: WeddingTierSlug;
  additionalHours?: number;
  additionalPhotographerDays?: number;
  additionalFilmmakerDays?: number;
  preWeddingSessionRequested?: boolean;
  droneRequested?: boolean;
  sameDayPhotoPackRequested?: boolean;
  sameDayHighlightFilmRequested?: boolean;
  documentaryRecordingRequested?: boolean;
  albumQuantities?: Partial<Record<AlbumSlug, number>>;
  frameQuantities?: Partial<Record<FrameSlug, number>>;
  presentationDriveQuantity?: number;
  priorityDeliveryRequested?: boolean;
}): Promise<WeddingEventEstimateResult> {
  const [tierRates, tierDeliverables, priorityDeliveryRates, addonRates, percentageRates, filmRates] = await Promise.all([
    getActiveTierRates("wedding", params.marketSlug),
    getTierDeliverables("wedding"),
    getPriorityDeliveryRates("wedding"),
    getAddonRates(params.marketSlug),
    getPercentageRates(),
    getActiveTierRates("wedding", params.marketSlug),
  ]);
  const filmTierRate = filmRates.find((r) => r.serviceMode === "film" && r.tierSlug === params.tierSlug)?.priceUsd ?? null;

  return calculateWeddingEstimate({
    ...params,
    tierRates,
    tierDeliverables,
    priorityDeliveryRates,
    addonRates,
    documentaryPercentage: percentageRates.documentary_recording ?? null,
    filmTierRateForDocumentaryUsd: filmTierRate,
  });
}

export async function estimateEventSession(params: {
  marketSlug: string;
  serviceMode: ServiceMode;
  tierSlug: EventTierSlug;
  additionalHours?: number;
  additionalPhotographerDays?: number;
  additionalFilmmakerDays?: number;
  droneRequested?: boolean;
  sameDayPhotoPackRequested?: boolean;
  sameDayHighlightFilmRequested?: boolean;
  documentaryRecordingRequested?: boolean;
  livestreamTier?: LivestreamTier | null;
  corporateOrganisationalScopeRequested?: boolean;
  albumQuantities?: Partial<Record<AlbumSlug, number>>;
  frameQuantities?: Partial<Record<FrameSlug, number>>;
  presentationDriveQuantity?: number;
  priorityDeliveryRequested?: boolean;
}): Promise<WeddingEventEstimateResult> {
  const [tierRates, tierDeliverables, priorityDeliveryRates, addonRates, percentageRates] = await Promise.all([
    getActiveTierRates("event", params.marketSlug),
    getTierDeliverables("event"),
    getPriorityDeliveryRates("event"),
    getAddonRates(params.marketSlug),
    getPercentageRates(),
  ]);
  const filmTierRate = tierRates.find((r) => r.serviceMode === "film" && r.tierSlug === params.tierSlug)?.priceUsd ?? null;

  return calculateEventEstimate({
    ...params,
    tierRates,
    tierDeliverables,
    priorityDeliveryRates,
    addonRates,
    documentaryPercentage: percentageRates.documentary_recording ?? null,
    filmTierRateForDocumentaryUsd: filmTierRate,
    corporateOrganisationalScopePercentage: percentageRates.corporate_organisational_scope ?? null,
  });
}

// ============================================================
// Admin management (finance.pricing.administer) — same append-only
// versioning + unchanged-value-skip pattern as Personal/Corporate.
// ============================================================

export async function createWeddingEventTierRateVersion(params: {
  marketSlug: string;
  category: WeddingEventCategory;
  serviceMode: ServiceMode;
  tierSlug: string;
  priceUsd: number;
  actorUserId: string;
}): Promise<{ ok: true; unchanged?: boolean } | { ok: false; error: string }> {
  const auth = await authorizeWithSuperAdminOverride(params.actorUserId, FINANCE_CAPABILITIES.pricingAdminister);
  if (!auth.ok) return { ok: false, error: "Not authorized to manage pricing." };
  const validTiers = params.category === "wedding" ? WEDDING_TIERS : EVENT_TIERS;
  if (!SERVICE_MODES.includes(params.serviceMode) || !(validTiers as string[]).includes(params.tierSlug)) return { ok: false, error: "Invalid service mode or tier for this category." };
  if (params.priceUsd <= 0) return { ok: false, error: "Price must be greater than zero." };

  const current = (await getActiveTierRates(params.category, params.marketSlug)).find((r) => r.serviceMode === params.serviceMode && r.tierSlug === params.tierSlug);
  if (current && current.priceUsd === params.priceUsd) return { ok: true, unchanged: true };

  const admin = createAdminClient();
  const marketId = await getMarketId(admin, params.marketSlug);
  if (!marketId) return { ok: false, error: "Unknown pricing market." };

  const { error } = await admin.from("wedding_event_tier_rates").insert({
    market_id: marketId,
    category: params.category,
    service_mode: params.serviceMode,
    tier_slug: params.tierSlug,
    price_usd: params.priceUsd,
    created_by: params.actorUserId,
  });
  if (error) {
    console.error("[pricing] failed to create wedding/event tier rate version", error.message);
    return { ok: false, error: "Failed to save the new rate." };
  }

  await logActivity({
    actorUserId: params.actorUserId,
    action: "pricing.wedding_event_tier_rate.created",
    entityType: "pricing_market",
    entityId: marketId,
    metadata: { category: params.category, serviceMode: params.serviceMode, tierSlug: params.tierSlug, priceUsd: params.priceUsd },
  });
  return { ok: true };
}

export async function createWeddingEventPriorityDeliveryVersion(params: {
  category: WeddingEventCategory;
  tierSlug: string;
  multiplierPercentage: number;
  actorUserId: string;
}): Promise<{ ok: true; unchanged?: boolean } | { ok: false; error: string }> {
  const auth = await authorizeWithSuperAdminOverride(params.actorUserId, FINANCE_CAPABILITIES.pricingAdminister);
  if (!auth.ok) return { ok: false, error: "Not authorized to manage pricing." };
  if (params.multiplierPercentage <= 0) return { ok: false, error: "Percentage must be greater than zero." };

  const current = (await getPriorityDeliveryRates(params.category)).find((r) => r.tierSlug === params.tierSlug);
  if (current && current.multiplierPercentage === params.multiplierPercentage) return { ok: true, unchanged: true };

  const admin = createAdminClient();
  const { error } = await admin.from("wedding_event_priority_delivery_rates").insert({
    category: params.category,
    tier_slug: params.tierSlug,
    multiplier_percentage: params.multiplierPercentage,
    created_by: params.actorUserId,
  });
  if (error) {
    console.error("[pricing] failed to create wedding/event priority delivery version", error.message);
    return { ok: false, error: "Failed to save the new percentage." };
  }

  await logActivity({
    actorUserId: params.actorUserId,
    action: "pricing.wedding_event_priority_delivery.created",
    entityType: "pricing_market",
    metadata: { category: params.category, tierSlug: params.tierSlug, multiplierPercentage: params.multiplierPercentage },
  });
  return { ok: true };
}

export async function createWeddingEventAddonRateVersion(params: {
  marketSlug: string;
  addonSlug: AddonSlug;
  priceUsd: number;
  actorUserId: string;
}): Promise<{ ok: true; unchanged?: boolean } | { ok: false; error: string }> {
  const auth = await authorizeWithSuperAdminOverride(params.actorUserId, FINANCE_CAPABILITIES.pricingAdminister);
  if (!auth.ok) return { ok: false, error: "Not authorized to manage pricing." };
  if (params.priceUsd <= 0) return { ok: false, error: "Price must be greater than zero." };

  const current = (await getAddonRates(params.marketSlug))[params.addonSlug];
  if (current !== undefined && current === params.priceUsd) return { ok: true, unchanged: true };

  const admin = createAdminClient();
  const marketId = await getMarketId(admin, params.marketSlug);
  if (!marketId) return { ok: false, error: "Unknown pricing market." };

  const { error } = await admin.from("wedding_event_addon_rates").insert({
    market_id: marketId,
    addon_slug: params.addonSlug,
    price_usd: params.priceUsd,
    created_by: params.actorUserId,
  });
  if (error) {
    console.error("[pricing] failed to create wedding/event addon rate version", error.message);
    return { ok: false, error: "Failed to save the new rate." };
  }

  await logActivity({
    actorUserId: params.actorUserId,
    action: "pricing.wedding_event_addon_rate.created",
    entityType: "pricing_market",
    entityId: marketId,
    metadata: { addonSlug: params.addonSlug, priceUsd: params.priceUsd },
  });
  return { ok: true };
}

export async function createWeddingEventPercentageRateVersion(params: {
  percentageSlug: PercentageSlug;
  percentage: number;
  actorUserId: string;
}): Promise<{ ok: true; unchanged?: boolean } | { ok: false; error: string }> {
  const auth = await authorizeWithSuperAdminOverride(params.actorUserId, FINANCE_CAPABILITIES.pricingAdminister);
  if (!auth.ok) return { ok: false, error: "Not authorized to manage pricing." };
  if (params.percentage <= 0) return { ok: false, error: "Percentage must be greater than zero." };

  const current = (await getPercentageRates())[params.percentageSlug];
  if (current !== undefined && current === params.percentage) return { ok: true, unchanged: true };

  const admin = createAdminClient();
  const { error } = await admin.from("wedding_event_percentage_rates").insert({
    percentage_slug: params.percentageSlug,
    percentage: params.percentage,
    created_by: params.actorUserId,
  });
  if (error) {
    console.error("[pricing] failed to create wedding/event percentage rate version", error.message);
    return { ok: false, error: "Failed to save the new percentage." };
  }

  await logActivity({
    actorUserId: params.actorUserId,
    action: "pricing.wedding_event_percentage_rate.created",
    entityType: "pricing_market",
    metadata: { percentageSlug: params.percentageSlug, percentage: params.percentage },
  });
  return { ok: true };
}
