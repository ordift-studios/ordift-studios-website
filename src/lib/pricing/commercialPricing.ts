import { createAdminClient } from "@/lib/supabase/admin";
import { authorizeWithSuperAdminOverride, FINANCE_CAPABILITIES } from "@/lib/organization/authority";
import { logActivity } from "@/lib/admin/activityLog";
import {
  calculateCommercialProductionEstimate,
  calculateCatalogueEstimate,
  type CommercialServiceMode,
  type CommercialScopeSlug,
  type CommercialCreativeFeeRate,
  type CatalogueComplexity,
  type CommercialCatalogueVolumeFactor,
  type CommercialCatalogueComplexityFactor,
  type CommercialPostProductionItemSlug,
  type CommercialPostProductionRate,
  type CommercialUsageFactorSlug,
  type CommercialDurationFactorSlug,
  type CommercialTerritoryFactorSlug,
  type CommercialExclusivitySlug,
  type CommercialLicensingFactors,
  type CommercialReviewThreshold,
  type CommercialEstimateResult,
} from "./commercialEstimate";

// Ordift Commercial / Advertising Pricing V1 (2026-09-07) — server-only
// DB-reading/writing functions. Pure calculation logic and shared types
// live in commercialEstimate.ts (zero imports) and are re-exported
// below — this file must never be imported from a Client Component.
// Reads use the admin/service-role client deliberately (public
// reference data, staff-only RLS on the write path) — same established
// pattern as every other pricing family.

export type {
  CommercialServiceMode,
  CommercialScopeSlug,
  CommercialCreativeFeeRate,
  CatalogueComplexity,
  CommercialCatalogueVolumeFactor,
  CommercialCatalogueComplexityFactor,
  CommercialPostProductionItemSlug,
  CommercialPostProductionRate,
  CommercialUsageFactorSlug,
  CommercialDurationFactorSlug,
  CommercialTerritoryFactorSlug,
  CommercialExclusivitySlug,
  CommercialLicensingFactors,
  CommercialReviewThreshold,
  CommercialEstimateResult,
};
export { calculateCommercialProductionEstimate, calculateCatalogueEstimate };

const SERVICE_MODES: CommercialServiceMode[] = ["photography", "film", "photography_film"];
const SCOPE_SLUGS: CommercialScopeSlug[] = ["focused", "full_day", "extended"];
const POSTPRODUCTION_SLUGS: CommercialPostProductionItemSlug[] = [
  "additional_finished_image", "advanced_retouch", "high_end_retouch", "creative_composite",
  "cutdown_15s", "cutdown_30s", "alternate_edit_60s", "vertical_adaptation",
  "aspect_ratio_adaptation", "caption_master", "motion_graphics_basic", "revision_round",
];
const PERCENTAGE_SLUGS = ["priority_postproduction", "licensing_floor"] as const;
type CommercialPercentageSlug = (typeof PERCENTAGE_SLUGS)[number];

async function getMarketId(admin: ReturnType<typeof createAdminClient>, marketSlug: string): Promise<string | null> {
  const { data } = await admin.from("pricing_markets").select("id").eq("slug", marketSlug).eq("active", true).maybeSingle();
  return data?.id ?? null;
}

// ---- Reads ----

export async function getActiveCreativeFeeRates(marketSlug: string): Promise<CommercialCreativeFeeRate[]> {
  const admin = createAdminClient();
  const marketId = await getMarketId(admin, marketSlug);
  if (!marketId) return [];
  const now = new Date().toISOString();
  const { data, error } = await admin
    .from("commercial_creative_fee_rates")
    .select("market_id, service_mode, scope_slug, price_usd, effective_from")
    .eq("market_id", marketId)
    .eq("active", true)
    .lte("effective_from", now)
    .or(`effective_to.is.null,effective_to.gt.${now}`)
    .order("effective_from", { ascending: false });
  if (error) {
    console.error("[pricing] failed to load commercial creative fee rates", error.message);
    return [];
  }
  const seen = new Set<string>();
  const rates: CommercialCreativeFeeRate[] = [];
  for (const row of data ?? []) {
    const key = `${row.service_mode}:${row.scope_slug}`;
    if (seen.has(key)) continue;
    seen.add(key);
    rates.push({ marketId: row.market_id, serviceMode: row.service_mode as CommercialServiceMode, scopeSlug: row.scope_slug as CommercialScopeSlug, priceUsd: Number(row.price_usd) });
  }
  return rates;
}

export async function getActiveCatalogueBaseRate(marketSlug: string): Promise<number | null> {
  const admin = createAdminClient();
  const marketId = await getMarketId(admin, marketSlug);
  if (!marketId) return null;
  const now = new Date().toISOString();
  const { data, error } = await admin
    .from("commercial_catalogue_base_rates")
    .select("price_usd, effective_from")
    .eq("market_id", marketId)
    .eq("active", true)
    .lte("effective_from", now)
    .or(`effective_to.is.null,effective_to.gt.${now}`)
    .order("effective_from", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    console.error("[pricing] failed to load commercial catalogue base rate", error.message);
    return null;
  }
  return data ? Number(data.price_usd) : null;
}

export async function getActiveCatalogueMinimum(marketSlug: string): Promise<number | null> {
  const admin = createAdminClient();
  const marketId = await getMarketId(admin, marketSlug);
  if (!marketId) return null;
  const now = new Date().toISOString();
  const { data, error } = await admin
    .from("commercial_catalogue_minimum_rates")
    .select("minimum_usd, effective_from")
    .eq("market_id", marketId)
    .eq("active", true)
    .lte("effective_from", now)
    .or(`effective_to.is.null,effective_to.gt.${now}`)
    .order("effective_from", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    console.error("[pricing] failed to load commercial catalogue minimum", error.message);
    return null;
  }
  return data ? Number(data.minimum_usd) : null;
}

export async function getActiveCatalogueVolumeFactors(): Promise<CommercialCatalogueVolumeFactor[]> {
  const admin = createAdminClient();
  const now = new Date().toISOString();
  const { data, error } = await admin
    .from("commercial_catalogue_volume_factors")
    .select("tier_slug, min_quantity, max_quantity, factor, effective_from")
    .eq("active", true)
    .lte("effective_from", now)
    .or(`effective_to.is.null,effective_to.gt.${now}`)
    .order("effective_from", { ascending: false });
  if (error) {
    console.error("[pricing] failed to load commercial catalogue volume factors", error.message);
    return [];
  }
  const seen = new Set<string>();
  const rows: CommercialCatalogueVolumeFactor[] = [];
  for (const row of data ?? []) {
    if (seen.has(row.tier_slug)) continue;
    seen.add(row.tier_slug);
    rows.push({ tierSlug: row.tier_slug, minQuantity: row.min_quantity, maxQuantity: row.max_quantity, factor: Number(row.factor) });
  }
  return rows;
}

export async function getActiveCatalogueComplexityFactors(): Promise<CommercialCatalogueComplexityFactor[]> {
  const admin = createAdminClient();
  const now = new Date().toISOString();
  const { data, error } = await admin
    .from("commercial_catalogue_complexity_factors")
    .select("complexity, factor, effective_from")
    .eq("active", true)
    .lte("effective_from", now)
    .or(`effective_to.is.null,effective_to.gt.${now}`)
    .order("effective_from", { ascending: false });
  if (error) {
    console.error("[pricing] failed to load commercial catalogue complexity factors", error.message);
    return [];
  }
  const seen = new Set<string>();
  const rows: CommercialCatalogueComplexityFactor[] = [];
  for (const row of data ?? []) {
    if (seen.has(row.complexity)) continue;
    seen.add(row.complexity);
    rows.push({ complexity: row.complexity as CatalogueComplexity, factor: Number(row.factor) });
  }
  return rows;
}

export async function getActivePostProductionRates(): Promise<CommercialPostProductionRate[]> {
  const admin = createAdminClient();
  const now = new Date().toISOString();
  const { data, error } = await admin
    .from("commercial_postproduction_rates")
    .select("item_slug, price_usd, is_from_price, effective_from")
    .eq("active", true)
    .lte("effective_from", now)
    .or(`effective_to.is.null,effective_to.gt.${now}`)
    .order("effective_from", { ascending: false });
  if (error) {
    console.error("[pricing] failed to load commercial post-production rates", error.message);
    return [];
  }
  const seen = new Set<string>();
  const rows: CommercialPostProductionRate[] = [];
  for (const row of data ?? []) {
    if (seen.has(row.item_slug)) continue;
    seen.add(row.item_slug);
    rows.push({ itemSlug: row.item_slug as CommercialPostProductionItemSlug, priceUsd: Number(row.price_usd), isFromPrice: row.is_from_price });
  }
  return rows;
}

export async function getActiveCommercialPercentages(): Promise<Partial<Record<CommercialPercentageSlug, number>>> {
  const admin = createAdminClient();
  const now = new Date().toISOString();
  const { data, error } = await admin
    .from("commercial_percentage_rates")
    .select("percentage_slug, percentage, effective_from")
    .eq("active", true)
    .lte("effective_from", now)
    .or(`effective_to.is.null,effective_to.gt.${now}`)
    .order("effective_from", { ascending: false });
  if (error) {
    console.error("[pricing] failed to load commercial percentage rates", error.message);
    return {};
  }
  const result: Partial<Record<CommercialPercentageSlug, number>> = {};
  for (const row of data ?? []) {
    const slug = row.percentage_slug as CommercialPercentageSlug;
    if (slug in result) continue;
    result[slug] = Number(row.percentage);
  }
  return result;
}

export async function getActiveLicensingFactors(): Promise<CommercialLicensingFactors> {
  const admin = createAdminClient();
  const now = new Date().toISOString();
  const { data, error } = await admin
    .from("commercial_licensing_factors")
    .select("factor_type, factor_slug, factor_value, effective_from")
    .eq("active", true)
    .lte("effective_from", now)
    .or(`effective_to.is.null,effective_to.gt.${now}`)
    .order("effective_from", { ascending: false });
  if (error) {
    console.error("[pricing] failed to load commercial licensing factors", error.message);
    return { usage: {}, duration: {}, territory: {}, exclusivity: {} };
  }
  const result: CommercialLicensingFactors = { usage: {}, duration: {}, territory: {}, exclusivity: {} };
  const seen = new Set<string>();
  for (const row of data ?? []) {
    const key = `${row.factor_type}:${row.factor_slug}`;
    if (seen.has(key)) continue;
    seen.add(key);
    (result[row.factor_type as keyof CommercialLicensingFactors] as Record<string, number>)[row.factor_slug] = Number(row.factor_value);
  }
  return result;
}

export async function getActiveReviewThreshold(marketSlug: string): Promise<CommercialReviewThreshold | null> {
  const admin = createAdminClient();
  const marketId = await getMarketId(admin, marketSlug);
  if (!marketId) return null;
  const now = new Date().toISOString();
  const { data, error } = await admin
    .from("commercial_review_thresholds")
    .select("review_threshold_usd, mandatory_threshold_usd, effective_from")
    .eq("market_id", marketId)
    .eq("active", true)
    .lte("effective_from", now)
    .or(`effective_to.is.null,effective_to.gt.${now}`)
    .order("effective_from", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    console.error("[pricing] failed to load commercial review threshold", error.message);
    return null;
  }
  return data ? { reviewUsd: Number(data.review_threshold_usd), mandatoryUsd: Number(data.mandatory_threshold_usd) } : null;
}

// ============================================================
// Admin management (finance.pricing.administer) — same append-only
// versioning + unchanged-value-skip pattern as every other family.
// ============================================================

export async function createCommercialCreativeFeeRateVersion(params: {
  marketSlug: string;
  serviceMode: CommercialServiceMode;
  scopeSlug: CommercialScopeSlug;
  priceUsd: number;
  actorUserId: string;
}): Promise<{ ok: true; unchanged?: boolean } | { ok: false; error: string }> {
  const auth = await authorizeWithSuperAdminOverride(params.actorUserId, FINANCE_CAPABILITIES.pricingAdminister);
  if (!auth.ok) return { ok: false, error: "Not authorized to manage pricing." };
  if (!SERVICE_MODES.includes(params.serviceMode) || !SCOPE_SLUGS.includes(params.scopeSlug)) return { ok: false, error: "Invalid service mode or scope." };
  if (params.priceUsd <= 0) return { ok: false, error: "Price must be greater than zero." };

  const current = (await getActiveCreativeFeeRates(params.marketSlug)).find((r) => r.serviceMode === params.serviceMode && r.scopeSlug === params.scopeSlug);
  if (current && current.priceUsd === params.priceUsd) return { ok: true, unchanged: true };

  const admin = createAdminClient();
  const marketId = await getMarketId(admin, params.marketSlug);
  if (!marketId) return { ok: false, error: "Unknown pricing market." };

  const { error } = await admin.from("commercial_creative_fee_rates").insert({
    market_id: marketId,
    service_mode: params.serviceMode,
    scope_slug: params.scopeSlug,
    price_usd: params.priceUsd,
    created_by: params.actorUserId,
  });
  if (error) {
    console.error("[pricing] failed to create commercial creative fee rate version", error.message);
    return { ok: false, error: "Failed to save the new rate." };
  }
  await logActivity({
    actorUserId: params.actorUserId,
    action: "pricing.commercial_creative_fee_rate.created",
    entityType: "pricing_market",
    entityId: marketId,
    metadata: { serviceMode: params.serviceMode, scopeSlug: params.scopeSlug, priceUsd: params.priceUsd },
  });
  return { ok: true };
}

export async function createCommercialCatalogueBaseRateVersion(params: {
  marketSlug: string;
  priceUsd: number;
  actorUserId: string;
}): Promise<{ ok: true; unchanged?: boolean } | { ok: false; error: string }> {
  const auth = await authorizeWithSuperAdminOverride(params.actorUserId, FINANCE_CAPABILITIES.pricingAdminister);
  if (!auth.ok) return { ok: false, error: "Not authorized to manage pricing." };
  if (params.priceUsd <= 0) return { ok: false, error: "Price must be greater than zero." };

  const current = await getActiveCatalogueBaseRate(params.marketSlug);
  if (current !== null && current === params.priceUsd) return { ok: true, unchanged: true };

  const admin = createAdminClient();
  const marketId = await getMarketId(admin, params.marketSlug);
  if (!marketId) return { ok: false, error: "Unknown pricing market." };

  const { error } = await admin.from("commercial_catalogue_base_rates").insert({ market_id: marketId, price_usd: params.priceUsd, created_by: params.actorUserId });
  if (error) {
    console.error("[pricing] failed to create commercial catalogue base rate version", error.message);
    return { ok: false, error: "Failed to save the new rate." };
  }
  await logActivity({ actorUserId: params.actorUserId, action: "pricing.commercial_catalogue_base_rate.created", entityType: "pricing_market", entityId: marketId, metadata: { priceUsd: params.priceUsd } });
  return { ok: true };
}

export async function createCommercialCatalogueMinimumVersion(params: {
  marketSlug: string;
  minimumUsd: number;
  actorUserId: string;
}): Promise<{ ok: true; unchanged?: boolean } | { ok: false; error: string }> {
  const auth = await authorizeWithSuperAdminOverride(params.actorUserId, FINANCE_CAPABILITIES.pricingAdminister);
  if (!auth.ok) return { ok: false, error: "Not authorized to manage pricing." };
  if (params.minimumUsd <= 0) return { ok: false, error: "Minimum must be greater than zero." };

  const current = await getActiveCatalogueMinimum(params.marketSlug);
  if (current !== null && current === params.minimumUsd) return { ok: true, unchanged: true };

  const admin = createAdminClient();
  const marketId = await getMarketId(admin, params.marketSlug);
  if (!marketId) return { ok: false, error: "Unknown pricing market." };

  const { error } = await admin.from("commercial_catalogue_minimum_rates").insert({ market_id: marketId, minimum_usd: params.minimumUsd, created_by: params.actorUserId });
  if (error) {
    console.error("[pricing] failed to create commercial catalogue minimum version", error.message);
    return { ok: false, error: "Failed to save the new minimum." };
  }
  await logActivity({ actorUserId: params.actorUserId, action: "pricing.commercial_catalogue_minimum.created", entityType: "pricing_market", entityId: marketId, metadata: { minimumUsd: params.minimumUsd } });
  return { ok: true };
}

export async function createCommercialPostProductionRateVersion(params: {
  itemSlug: CommercialPostProductionItemSlug;
  priceUsd: number;
  isFromPrice: boolean;
  actorUserId: string;
}): Promise<{ ok: true; unchanged?: boolean } | { ok: false; error: string }> {
  const auth = await authorizeWithSuperAdminOverride(params.actorUserId, FINANCE_CAPABILITIES.pricingAdminister);
  if (!auth.ok) return { ok: false, error: "Not authorized to manage pricing." };
  if (!POSTPRODUCTION_SLUGS.includes(params.itemSlug)) return { ok: false, error: "Unknown post-production item." };
  if (params.priceUsd <= 0) return { ok: false, error: "Price must be greater than zero." };

  const current = (await getActivePostProductionRates()).find((r) => r.itemSlug === params.itemSlug);
  if (current && current.priceUsd === params.priceUsd && current.isFromPrice === params.isFromPrice) return { ok: true, unchanged: true };

  const admin = createAdminClient();
  const { error } = await admin.from("commercial_postproduction_rates").insert({ item_slug: params.itemSlug, price_usd: params.priceUsd, is_from_price: params.isFromPrice, created_by: params.actorUserId });
  if (error) {
    console.error("[pricing] failed to create commercial post-production rate version", error.message);
    return { ok: false, error: "Failed to save the new rate." };
  }
  await logActivity({ actorUserId: params.actorUserId, action: "pricing.commercial_postproduction_rate.created", entityType: "pricing_market", metadata: { itemSlug: params.itemSlug, priceUsd: params.priceUsd, isFromPrice: params.isFromPrice } });
  return { ok: true };
}

export async function createCommercialPercentageVersion(params: {
  percentageSlug: CommercialPercentageSlug;
  percentage: number;
  actorUserId: string;
}): Promise<{ ok: true; unchanged?: boolean } | { ok: false; error: string }> {
  const auth = await authorizeWithSuperAdminOverride(params.actorUserId, FINANCE_CAPABILITIES.pricingAdminister);
  if (!auth.ok) return { ok: false, error: "Not authorized to manage pricing." };
  if (!PERCENTAGE_SLUGS.includes(params.percentageSlug)) return { ok: false, error: "Unknown percentage." };
  if (params.percentage <= 0) return { ok: false, error: "Percentage must be greater than zero." };

  const current = (await getActiveCommercialPercentages())[params.percentageSlug];
  if (current !== undefined && current === params.percentage) return { ok: true, unchanged: true };

  const admin = createAdminClient();
  const { error } = await admin.from("commercial_percentage_rates").insert({ percentage_slug: params.percentageSlug, percentage: params.percentage, created_by: params.actorUserId });
  if (error) {
    console.error("[pricing] failed to create commercial percentage version", error.message);
    return { ok: false, error: "Failed to save the new percentage." };
  }
  await logActivity({ actorUserId: params.actorUserId, action: "pricing.commercial_percentage.created", entityType: "pricing_market", metadata: { percentageSlug: params.percentageSlug, percentage: params.percentage } });
  return { ok: true };
}

export async function createCommercialLicensingFactorVersion(params: {
  factorType: "usage" | "duration" | "territory" | "exclusivity";
  factorSlug: string;
  factorValue: number;
  actorUserId: string;
}): Promise<{ ok: true; unchanged?: boolean } | { ok: false; error: string }> {
  const auth = await authorizeWithSuperAdminOverride(params.actorUserId, FINANCE_CAPABILITIES.pricingAdminister);
  if (!auth.ok) return { ok: false, error: "Not authorized to manage pricing." };
  if (params.factorValue <= 0) return { ok: false, error: "Factor must be greater than zero." };

  const currentFactors = await getActiveLicensingFactors();
  const current = (currentFactors[params.factorType] as Record<string, number>)[params.factorSlug];
  if (current !== undefined && current === params.factorValue) return { ok: true, unchanged: true };

  const admin = createAdminClient();
  const { error } = await admin.from("commercial_licensing_factors").insert({ factor_type: params.factorType, factor_slug: params.factorSlug, factor_value: params.factorValue, created_by: params.actorUserId });
  if (error) {
    console.error("[pricing] failed to create commercial licensing factor version", error.message);
    return { ok: false, error: "Failed to save the new factor." };
  }
  await logActivity({ actorUserId: params.actorUserId, action: "pricing.commercial_licensing_factor.created", entityType: "pricing_market", metadata: { factorType: params.factorType, factorSlug: params.factorSlug, factorValue: params.factorValue } });
  return { ok: true };
}

export async function createCommercialReviewThresholdVersion(params: {
  marketSlug: string;
  reviewUsd: number;
  mandatoryUsd: number;
  actorUserId: string;
}): Promise<{ ok: true; unchanged?: boolean } | { ok: false; error: string }> {
  const auth = await authorizeWithSuperAdminOverride(params.actorUserId, FINANCE_CAPABILITIES.pricingAdminister);
  if (!auth.ok) return { ok: false, error: "Not authorized to manage pricing." };
  if (params.reviewUsd <= 0 || params.mandatoryUsd <= params.reviewUsd) return { ok: false, error: "Mandatory threshold must be greater than the review threshold, and both must be positive." };

  const current = await getActiveReviewThreshold(params.marketSlug);
  if (current && current.reviewUsd === params.reviewUsd && current.mandatoryUsd === params.mandatoryUsd) return { ok: true, unchanged: true };

  const admin = createAdminClient();
  const marketId = await getMarketId(admin, params.marketSlug);
  if (!marketId) return { ok: false, error: "Unknown pricing market." };

  const { error } = await admin.from("commercial_review_thresholds").insert({ market_id: marketId, review_threshold_usd: params.reviewUsd, mandatory_threshold_usd: params.mandatoryUsd, created_by: params.actorUserId });
  if (error) {
    console.error("[pricing] failed to create commercial review threshold version", error.message);
    return { ok: false, error: "Failed to save the new thresholds." };
  }
  await logActivity({ actorUserId: params.actorUserId, action: "pricing.commercial_review_threshold.created", entityType: "pricing_market", entityId: marketId, metadata: { reviewUsd: params.reviewUsd, mandatoryUsd: params.mandatoryUsd } });
  return { ok: true };
}
