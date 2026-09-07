import { createAdminClient } from "@/lib/supabase/admin";
import { authorizeWithSuperAdminOverride, FINANCE_CAPABILITIES } from "@/lib/organization/authority";
import { logActivity } from "@/lib/admin/activityLog";
import {
  calculateBrandingEstimate,
  type BrandingTierSlug,
  type BrandingTurnaround,
  type BrandingPercentageSlug,
  type BrandingScaleSignal,
  type BrandingTierRate,
  type BrandingEstimateResult,
} from "./brandingEstimate";

// Ordift Branding & Creative Strategy Pricing V1 (2026-09-07) —
// server-only DB-reading/writing functions. Pure calculation logic and
// shared types live in brandingEstimate.ts (zero imports) and are
// re-exported below — this file must never be imported from a Client
// Component.

export type { BrandingTierSlug, BrandingTurnaround, BrandingPercentageSlug, BrandingScaleSignal, BrandingTierRate, BrandingEstimateResult };
export { calculateBrandingEstimate };

const TIER_SLUGS: BrandingTierSlug[] = ["logo_development", "brand_foundations", "essential_identity", "complete_identity", "strategy_complete_identity", "strategic_rebrand"];
const PERCENTAGE_SLUGS: BrandingPercentageSlug[] = ["priority", "additional_revision"];

async function getMarketId(admin: ReturnType<typeof createAdminClient>, marketSlug: string): Promise<string | null> {
  const { data } = await admin.from("pricing_markets").select("id").eq("slug", marketSlug).eq("active", true).maybeSingle();
  return data?.id ?? null;
}

// ---- Reads ----

export async function getActiveTierRates(marketSlug: string): Promise<BrandingTierRate[]> {
  const admin = createAdminClient();
  const marketId = await getMarketId(admin, marketSlug);
  if (!marketId) return [];
  const now = new Date().toISOString();
  const { data, error } = await admin
    .from("branding_tier_rates")
    .select("market_id, tier_slug, price_usd, effective_from")
    .eq("market_id", marketId)
    .eq("active", true)
    .lte("effective_from", now)
    .or(`effective_to.is.null,effective_to.gt.${now}`)
    .order("effective_from", { ascending: false });
  if (error) {
    console.error("[pricing] failed to load branding tier rates", error.message);
    return [];
  }
  const seen = new Set<string>();
  const rates: BrandingTierRate[] = [];
  for (const row of data ?? []) {
    if (seen.has(row.tier_slug)) continue;
    seen.add(row.tier_slug);
    rates.push({ marketId: row.market_id, tierSlug: row.tier_slug as BrandingTierSlug, priceUsd: Number(row.price_usd) });
  }
  return rates;
}

export async function getActiveRevisionMinimum(marketSlug: string): Promise<number | null> {
  const admin = createAdminClient();
  const marketId = await getMarketId(admin, marketSlug);
  if (!marketId) return null;
  const now = new Date().toISOString();
  const { data, error } = await admin
    .from("branding_revision_minimums")
    .select("minimum_usd, effective_from")
    .eq("market_id", marketId)
    .eq("active", true)
    .lte("effective_from", now)
    .or(`effective_to.is.null,effective_to.gt.${now}`)
    .order("effective_from", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    console.error("[pricing] failed to load branding revision minimum", error.message);
    return null;
  }
  return data ? Number(data.minimum_usd) : null;
}

export async function getActivePercentageRates(): Promise<Partial<Record<BrandingPercentageSlug, number>>> {
  const admin = createAdminClient();
  const now = new Date().toISOString();
  const { data, error } = await admin
    .from("branding_percentage_rates")
    .select("percentage_slug, percentage, effective_from")
    .eq("active", true)
    .lte("effective_from", now)
    .or(`effective_to.is.null,effective_to.gt.${now}`)
    .order("effective_from", { ascending: false });
  if (error) {
    console.error("[pricing] failed to load branding percentage rates", error.message);
    return {};
  }
  const result: Partial<Record<BrandingPercentageSlug, number>> = {};
  for (const row of data ?? []) {
    const slug = row.percentage_slug as BrandingPercentageSlug;
    if (slug in result) continue;
    result[slug] = Number(row.percentage);
  }
  return result;
}

// ---- Full orchestration ----

export async function estimateBrandingProject(params: {
  marketSlug: string;
  tierSlug: BrandingTierSlug;
  additionalRevisionRounds?: number;
  scaleSignals?: BrandingScaleSignal[];
  turnaround?: BrandingTurnaround;
}): Promise<BrandingEstimateResult> {
  const [tierRates, revisionMinimumUsd, percentages] = await Promise.all([
    getActiveTierRates(params.marketSlug),
    getActiveRevisionMinimum(params.marketSlug),
    getActivePercentageRates(),
  ]);
  return calculateBrandingEstimate({ ...params, tierRates, revisionMinimumUsd: revisionMinimumUsd ?? undefined, percentages });
}

// ============================================================
// Admin management (finance.pricing.administer) — same append-only
// versioning + unchanged-value-skip pattern as every other family.
// ============================================================

export async function createBrandingTierRateVersion(params: {
  marketSlug: string;
  tierSlug: BrandingTierSlug;
  priceUsd: number;
  actorUserId: string;
}): Promise<{ ok: true; unchanged?: boolean } | { ok: false; error: string }> {
  const auth = await authorizeWithSuperAdminOverride(params.actorUserId, FINANCE_CAPABILITIES.pricingAdminister);
  if (!auth.ok) return { ok: false, error: "Not authorized to manage pricing." };
  if (!TIER_SLUGS.includes(params.tierSlug)) return { ok: false, error: "Unknown service level." };
  if (params.priceUsd <= 0) return { ok: false, error: "Price must be greater than zero." };

  const current = (await getActiveTierRates(params.marketSlug)).find((r) => r.tierSlug === params.tierSlug);
  if (current && current.priceUsd === params.priceUsd) return { ok: true, unchanged: true };

  const admin = createAdminClient();
  const marketId = await getMarketId(admin, params.marketSlug);
  if (!marketId) return { ok: false, error: "Unknown pricing market." };

  const { error } = await admin.from("branding_tier_rates").insert({
    market_id: marketId,
    tier_slug: params.tierSlug,
    price_usd: params.priceUsd,
    created_by: params.actorUserId,
  });
  if (error) {
    console.error("[pricing] failed to create branding tier rate version", error.message);
    return { ok: false, error: "Failed to save the new rate." };
  }
  await logActivity({
    actorUserId: params.actorUserId,
    action: "pricing.branding_tier_rate.created",
    entityType: "pricing_market",
    entityId: marketId,
    metadata: { tierSlug: params.tierSlug, priceUsd: params.priceUsd },
  });
  return { ok: true };
}

export async function createBrandingRevisionMinimumVersion(params: {
  marketSlug: string;
  minimumUsd: number;
  actorUserId: string;
}): Promise<{ ok: true; unchanged?: boolean } | { ok: false; error: string }> {
  const auth = await authorizeWithSuperAdminOverride(params.actorUserId, FINANCE_CAPABILITIES.pricingAdminister);
  if (!auth.ok) return { ok: false, error: "Not authorized to manage pricing." };
  if (params.minimumUsd <= 0) return { ok: false, error: "Minimum must be greater than zero." };

  const current = await getActiveRevisionMinimum(params.marketSlug);
  if (current !== null && current === params.minimumUsd) return { ok: true, unchanged: true };

  const admin = createAdminClient();
  const marketId = await getMarketId(admin, params.marketSlug);
  if (!marketId) return { ok: false, error: "Unknown pricing market." };

  const { error } = await admin.from("branding_revision_minimums").insert({ market_id: marketId, minimum_usd: params.minimumUsd, created_by: params.actorUserId });
  if (error) {
    console.error("[pricing] failed to create branding revision minimum version", error.message);
    return { ok: false, error: "Failed to save the new minimum." };
  }
  await logActivity({ actorUserId: params.actorUserId, action: "pricing.branding_revision_minimum.created", entityType: "pricing_market", entityId: marketId, metadata: { minimumUsd: params.minimumUsd } });
  return { ok: true };
}

export async function createBrandingPercentageVersion(params: {
  percentageSlug: BrandingPercentageSlug;
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
  const { error } = await admin.from("branding_percentage_rates").insert({ percentage_slug: params.percentageSlug, percentage: params.percentage, created_by: params.actorUserId });
  if (error) {
    console.error("[pricing] failed to create branding percentage version", error.message);
    return { ok: false, error: "Failed to save the new percentage." };
  }
  await logActivity({ actorUserId: params.actorUserId, action: "pricing.branding_percentage.created", entityType: "pricing_market", metadata: { percentageSlug: params.percentageSlug, percentage: params.percentage } });
  return { ok: true };
}
