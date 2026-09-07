import { createAdminClient } from "@/lib/supabase/admin";
import { authorizeWithSuperAdminOverride, FINANCE_CAPABILITIES } from "@/lib/organization/authority";
import { logActivity } from "@/lib/admin/activityLog";
import {
  calculateContentCreationEstimate,
  calculateContentCreationRetainerEstimate,
  type ContentCreationPackageSlug,
  type ContentCreationRetainerSlug,
  type ContentCreationAddonSlug,
  type ContentCreationPercentageSlug,
  type ContentCreationTurnaround,
  type ContentCreationPackageRate,
  type ContentCreationRetainerRate,
  type ContentCreationEstimateResult,
  type ContentCreationRetainerEstimateResult,
} from "./contentCreationEstimate";

// Ordift Content Creation Pricing V1 (2026-09-07) — server-only DB-
// reading/writing functions. Pure calculation logic and shared types
// live in contentCreationEstimate.ts (zero imports) and are re-exported
// below — this file must never be imported from a Client Component.

export type {
  ContentCreationPackageSlug,
  ContentCreationRetainerSlug,
  ContentCreationAddonSlug,
  ContentCreationPercentageSlug,
  ContentCreationTurnaround,
  ContentCreationPackageRate,
  ContentCreationRetainerRate,
  ContentCreationEstimateResult,
  ContentCreationRetainerEstimateResult,
};
export { calculateContentCreationEstimate, calculateContentCreationRetainerEstimate };

const PACKAGE_SLUGS: ContentCreationPackageSlug[] = [
  "short_form_single",
  "short_form_pack_3",
  "short_form_pack_5",
  "content_day_half",
  "content_day_full",
  "event_content_4h",
  "personal_brand_2h",
];
const RETAINER_SLUGS: ContentCreationRetainerSlug[] = ["retainer_essential", "retainer_growth", "retainer_momentum"];
const ADDON_SLUGS: ContentCreationAddonSlug[] = [
  "additional_short_form_video",
  "additional_10_edited_photos",
  "additional_content_capture_hour",
  "same_next_day_edit_per_video",
  "additional_aspect_ratio_adaptation",
  "captioned_subtitled_master",
  "additional_revision_minimum",
];
const PERCENTAGE_SLUGS: ContentCreationPercentageSlug[] = ["priority", "additional_revision"];

async function getMarketId(admin: ReturnType<typeof createAdminClient>, marketSlug: string): Promise<string | null> {
  const { data } = await admin.from("pricing_markets").select("id").eq("slug", marketSlug).eq("active", true).maybeSingle();
  return data?.id ?? null;
}

// ---- Reads ----

export async function getActivePackageRates(marketSlug: string): Promise<ContentCreationPackageRate[]> {
  const admin = createAdminClient();
  const marketId = await getMarketId(admin, marketSlug);
  if (!marketId) return [];
  const now = new Date().toISOString();
  const { data, error } = await admin
    .from("content_creation_package_rates")
    .select("market_id, package_slug, price_usd, effective_from")
    .eq("market_id", marketId)
    .eq("active", true)
    .lte("effective_from", now)
    .or(`effective_to.is.null,effective_to.gt.${now}`)
    .order("effective_from", { ascending: false });
  if (error) {
    console.error("[pricing] failed to load content creation package rates", error.message);
    return [];
  }
  const seen = new Set<string>();
  const rates: ContentCreationPackageRate[] = [];
  for (const row of data ?? []) {
    if (seen.has(row.package_slug)) continue;
    seen.add(row.package_slug);
    rates.push({ marketId: row.market_id, packageSlug: row.package_slug as ContentCreationPackageSlug, priceUsd: Number(row.price_usd) });
  }
  return rates;
}

export async function getActiveRetainerRates(marketSlug: string): Promise<ContentCreationRetainerRate[]> {
  const admin = createAdminClient();
  const marketId = await getMarketId(admin, marketSlug);
  if (!marketId) return [];
  const now = new Date().toISOString();
  const { data, error } = await admin
    .from("content_creation_retainer_rates")
    .select("market_id, retainer_slug, price_usd, effective_from")
    .eq("market_id", marketId)
    .eq("active", true)
    .lte("effective_from", now)
    .or(`effective_to.is.null,effective_to.gt.${now}`)
    .order("effective_from", { ascending: false });
  if (error) {
    console.error("[pricing] failed to load content creation retainer rates", error.message);
    return [];
  }
  const seen = new Set<string>();
  const rates: ContentCreationRetainerRate[] = [];
  for (const row of data ?? []) {
    if (seen.has(row.retainer_slug)) continue;
    seen.add(row.retainer_slug);
    rates.push({ marketId: row.market_id, retainerSlug: row.retainer_slug as ContentCreationRetainerSlug, priceUsd: Number(row.price_usd) });
  }
  return rates;
}

export async function getActiveAddonRates(marketSlug: string): Promise<Partial<Record<ContentCreationAddonSlug, number>>> {
  const admin = createAdminClient();
  const marketId = await getMarketId(admin, marketSlug);
  if (!marketId) return {};
  const now = new Date().toISOString();
  const { data, error } = await admin
    .from("content_creation_addon_rates")
    .select("addon_slug, price_usd, effective_from")
    .eq("market_id", marketId)
    .eq("active", true)
    .lte("effective_from", now)
    .or(`effective_to.is.null,effective_to.gt.${now}`)
    .order("effective_from", { ascending: false });
  if (error) {
    console.error("[pricing] failed to load content creation addon rates", error.message);
    return {};
  }
  const result: Partial<Record<ContentCreationAddonSlug, number>> = {};
  for (const row of data ?? []) {
    const slug = row.addon_slug as ContentCreationAddonSlug;
    if (slug in result) continue;
    result[slug] = Number(row.price_usd);
  }
  return result;
}

export async function getActivePercentageRates(): Promise<Partial<Record<ContentCreationPercentageSlug, number>>> {
  const admin = createAdminClient();
  const now = new Date().toISOString();
  const { data, error } = await admin
    .from("content_creation_percentage_rates")
    .select("percentage_slug, percentage, effective_from")
    .eq("active", true)
    .lte("effective_from", now)
    .or(`effective_to.is.null,effective_to.gt.${now}`)
    .order("effective_from", { ascending: false });
  if (error) {
    console.error("[pricing] failed to load content creation percentage rates", error.message);
    return {};
  }
  const result: Partial<Record<ContentCreationPercentageSlug, number>> = {};
  for (const row of data ?? []) {
    const slug = row.percentage_slug as ContentCreationPercentageSlug;
    if (slug in result) continue;
    result[slug] = Number(row.percentage);
  }
  return result;
}

// ---- Full orchestration ----

export async function estimateContentCreationProject(params: {
  marketSlug: string;
  packageSlug: ContentCreationPackageSlug;
  additionalVideos?: number;
  additionalPhotoSets?: number;
  additionalCaptureHours?: number;
  aspectRatioAdaptationCount?: number;
  captionedMasterCount?: number;
  sameNextDayEditVideoCount?: number;
  additionalRevisionRounds?: number;
  turnaround?: ContentCreationTurnaround;
}): Promise<ContentCreationEstimateResult> {
  const [packageRates, addonRates, percentages] = await Promise.all([
    getActivePackageRates(params.marketSlug),
    getActiveAddonRates(params.marketSlug),
    getActivePercentageRates(),
  ]);
  return calculateContentCreationEstimate({ ...params, packageRates, addonRates, percentages });
}

export async function estimateContentCreationRetainer(params: { marketSlug: string; retainerSlug: ContentCreationRetainerSlug }): Promise<ContentCreationRetainerEstimateResult> {
  const retainerRates = await getActiveRetainerRates(params.marketSlug);
  return calculateContentCreationRetainerEstimate({ retainerSlug: params.retainerSlug, retainerRates });
}

// ============================================================
// Admin management (finance.pricing.administer) — same append-only
// versioning + unchanged-value-skip pattern as every other family.
// ============================================================

export async function createContentCreationPackageRateVersion(params: {
  marketSlug: string;
  packageSlug: ContentCreationPackageSlug;
  priceUsd: number;
  actorUserId: string;
}): Promise<{ ok: true; unchanged?: boolean } | { ok: false; error: string }> {
  const auth = await authorizeWithSuperAdminOverride(params.actorUserId, FINANCE_CAPABILITIES.pricingAdminister);
  if (!auth.ok) return { ok: false, error: "Not authorized to manage pricing." };
  if (!PACKAGE_SLUGS.includes(params.packageSlug)) return { ok: false, error: "Unknown package." };
  if (params.priceUsd <= 0) return { ok: false, error: "Price must be greater than zero." };

  const current = (await getActivePackageRates(params.marketSlug)).find((r) => r.packageSlug === params.packageSlug);
  if (current && current.priceUsd === params.priceUsd) return { ok: true, unchanged: true };

  const admin = createAdminClient();
  const marketId = await getMarketId(admin, params.marketSlug);
  if (!marketId) return { ok: false, error: "Unknown pricing market." };

  const { error } = await admin.from("content_creation_package_rates").insert({
    market_id: marketId,
    package_slug: params.packageSlug,
    price_usd: params.priceUsd,
    created_by: params.actorUserId,
  });
  if (error) {
    console.error("[pricing] failed to create content creation package rate version", error.message);
    return { ok: false, error: "Failed to save the new rate." };
  }
  await logActivity({
    actorUserId: params.actorUserId,
    action: "pricing.content_creation_package_rate.created",
    entityType: "pricing_market",
    entityId: marketId,
    metadata: { packageSlug: params.packageSlug, priceUsd: params.priceUsd },
  });
  return { ok: true };
}

export async function createContentCreationRetainerRateVersion(params: {
  marketSlug: string;
  retainerSlug: ContentCreationRetainerSlug;
  priceUsd: number;
  actorUserId: string;
}): Promise<{ ok: true; unchanged?: boolean } | { ok: false; error: string }> {
  const auth = await authorizeWithSuperAdminOverride(params.actorUserId, FINANCE_CAPABILITIES.pricingAdminister);
  if (!auth.ok) return { ok: false, error: "Not authorized to manage pricing." };
  if (!RETAINER_SLUGS.includes(params.retainerSlug)) return { ok: false, error: "Unknown retainer." };
  if (params.priceUsd <= 0) return { ok: false, error: "Price must be greater than zero." };

  const current = (await getActiveRetainerRates(params.marketSlug)).find((r) => r.retainerSlug === params.retainerSlug);
  if (current && current.priceUsd === params.priceUsd) return { ok: true, unchanged: true };

  const admin = createAdminClient();
  const marketId = await getMarketId(admin, params.marketSlug);
  if (!marketId) return { ok: false, error: "Unknown pricing market." };

  const { error } = await admin.from("content_creation_retainer_rates").insert({
    market_id: marketId,
    retainer_slug: params.retainerSlug,
    price_usd: params.priceUsd,
    created_by: params.actorUserId,
  });
  if (error) {
    console.error("[pricing] failed to create content creation retainer rate version", error.message);
    return { ok: false, error: "Failed to save the new rate." };
  }
  await logActivity({
    actorUserId: params.actorUserId,
    action: "pricing.content_creation_retainer_rate.created",
    entityType: "pricing_market",
    entityId: marketId,
    metadata: { retainerSlug: params.retainerSlug, priceUsd: params.priceUsd },
  });
  return { ok: true };
}

export async function createContentCreationAddonRateVersion(params: {
  marketSlug: string;
  addonSlug: ContentCreationAddonSlug;
  priceUsd: number;
  actorUserId: string;
}): Promise<{ ok: true; unchanged?: boolean } | { ok: false; error: string }> {
  const auth = await authorizeWithSuperAdminOverride(params.actorUserId, FINANCE_CAPABILITIES.pricingAdminister);
  if (!auth.ok) return { ok: false, error: "Not authorized to manage pricing." };
  if (!ADDON_SLUGS.includes(params.addonSlug)) return { ok: false, error: "Unknown add-on." };
  if (params.priceUsd <= 0) return { ok: false, error: "Price must be greater than zero." };

  const current = (await getActiveAddonRates(params.marketSlug))[params.addonSlug];
  if (current !== undefined && current === params.priceUsd) return { ok: true, unchanged: true };

  const admin = createAdminClient();
  const marketId = await getMarketId(admin, params.marketSlug);
  if (!marketId) return { ok: false, error: "Unknown pricing market." };

  const { error } = await admin.from("content_creation_addon_rates").insert({ market_id: marketId, addon_slug: params.addonSlug, price_usd: params.priceUsd, created_by: params.actorUserId });
  if (error) {
    console.error("[pricing] failed to create content creation addon rate version", error.message);
    return { ok: false, error: "Failed to save the new rate." };
  }
  await logActivity({ actorUserId: params.actorUserId, action: "pricing.content_creation_addon_rate.created", entityType: "pricing_market", entityId: marketId, metadata: { addonSlug: params.addonSlug, priceUsd: params.priceUsd } });
  return { ok: true };
}

export async function createContentCreationPercentageVersion(params: {
  percentageSlug: ContentCreationPercentageSlug;
  percentage: number;
  actorUserId: string;
}): Promise<{ ok: true; unchanged?: boolean } | { ok: false; error: string }> {
  const auth = await authorizeWithSuperAdminOverride(params.actorUserId, FINANCE_CAPABILITIES.pricingAdminister);
  if (!auth.ok) return { ok: false, error: "Not authorized to manage pricing." };
  if (!PERCENTAGE_SLUGS.includes(params.percentageSlug)) return { ok: false, error: "Unknown percentage." };
  if (params.percentage <= 0) return { ok: false, error: "Percentage must be greater than zero." };

  const current = (await getActivePercentageRates())[params.percentageSlug];
  if (current !== undefined && current === params.percentage) return { ok: true, unchanged: true };

  const admin = createAdminClient();
  const { error } = await admin.from("content_creation_percentage_rates").insert({ percentage_slug: params.percentageSlug, percentage: params.percentage, created_by: params.actorUserId });
  if (error) {
    console.error("[pricing] failed to create content creation percentage version", error.message);
    return { ok: false, error: "Failed to save the new percentage." };
  }
  await logActivity({ actorUserId: params.actorUserId, action: "pricing.content_creation_percentage.created", entityType: "pricing_market", metadata: { percentageSlug: params.percentageSlug, percentage: params.percentage } });
  return { ok: true };
}
