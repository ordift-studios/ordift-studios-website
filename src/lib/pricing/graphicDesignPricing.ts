import { createAdminClient } from "@/lib/supabase/admin";
import { authorizeWithSuperAdminOverride, FINANCE_CAPABILITIES } from "@/lib/organization/authority";
import { logActivity } from "@/lib/admin/activityLog";
import {
  calculateGraphicDesignEstimate,
  type GraphicDesignDeliverableSlug,
  type GraphicDesignComplexity,
  type GraphicDesignTurnaround,
  type GraphicDesignDeliverableRate,
  type GraphicDesignComplexityFactor,
  type GraphicDesignAddonSlug,
  type GraphicDesignPercentageSlug,
  type GraphicDesignEstimateResult,
} from "./graphicDesignEstimate";

// Ordift Graphic Design Pricing V1 (2026-09-07) — server-only DB-
// reading/writing functions. Pure calculation logic and shared types
// live in graphicDesignEstimate.ts (zero imports) and are re-exported
// below — this file must never be imported from a Client Component.

export type {
  GraphicDesignDeliverableSlug,
  GraphicDesignComplexity,
  GraphicDesignTurnaround,
  GraphicDesignDeliverableRate,
  GraphicDesignComplexityFactor,
  GraphicDesignAddonSlug,
  GraphicDesignPercentageSlug,
  GraphicDesignEstimateResult,
};
export { calculateGraphicDesignEstimate };

const DELIVERABLE_SLUGS: GraphicDesignDeliverableSlug[] = ["flyer_poster", "digital_ad", "social_single", "social_set_5", "social_set_10", "presentation", "brochure"];
const ADDON_SLUGS: GraphicDesignAddonSlug[] = ["additional_brochure_page", "additional_presentation_slide", "additional_revision_minimum", "editable_source_file_minimum"];
const PERCENTAGE_SLUGS: GraphicDesignPercentageSlug[] = ["priority", "urgent", "additional_revision", "editable_source_file"];

async function getMarketId(admin: ReturnType<typeof createAdminClient>, marketSlug: string): Promise<string | null> {
  const { data } = await admin.from("pricing_markets").select("id").eq("slug", marketSlug).eq("active", true).maybeSingle();
  return data?.id ?? null;
}

// ---- Reads ----

export async function getActiveDeliverableRates(marketSlug: string): Promise<GraphicDesignDeliverableRate[]> {
  const admin = createAdminClient();
  const marketId = await getMarketId(admin, marketSlug);
  if (!marketId) return [];
  const now = new Date().toISOString();
  const { data, error } = await admin
    .from("graphic_design_deliverable_rates")
    .select("market_id, deliverable_slug, price_usd, effective_from")
    .eq("market_id", marketId)
    .eq("active", true)
    .lte("effective_from", now)
    .or(`effective_to.is.null,effective_to.gt.${now}`)
    .order("effective_from", { ascending: false });
  if (error) {
    console.error("[pricing] failed to load graphic design deliverable rates", error.message);
    return [];
  }
  const seen = new Set<string>();
  const rates: GraphicDesignDeliverableRate[] = [];
  for (const row of data ?? []) {
    if (seen.has(row.deliverable_slug)) continue;
    seen.add(row.deliverable_slug);
    rates.push({ marketId: row.market_id, deliverableSlug: row.deliverable_slug as GraphicDesignDeliverableSlug, priceUsd: Number(row.price_usd) });
  }
  return rates;
}

export async function getActiveComplexityFactors(): Promise<GraphicDesignComplexityFactor[]> {
  const admin = createAdminClient();
  const now = new Date().toISOString();
  const { data, error } = await admin
    .from("graphic_design_complexity_factors")
    .select("complexity, factor, effective_from")
    .eq("active", true)
    .lte("effective_from", now)
    .or(`effective_to.is.null,effective_to.gt.${now}`)
    .order("effective_from", { ascending: false });
  if (error) {
    console.error("[pricing] failed to load graphic design complexity factors", error.message);
    return [];
  }
  const seen = new Set<string>();
  const rows: GraphicDesignComplexityFactor[] = [];
  for (const row of data ?? []) {
    if (seen.has(row.complexity)) continue;
    seen.add(row.complexity);
    rows.push({ complexity: row.complexity as GraphicDesignComplexity, factor: Number(row.factor) });
  }
  return rows;
}

export async function getActiveAddonRates(marketSlug: string): Promise<Partial<Record<GraphicDesignAddonSlug, number>>> {
  const admin = createAdminClient();
  const marketId = await getMarketId(admin, marketSlug);
  if (!marketId) return {};
  const now = new Date().toISOString();
  const { data, error } = await admin
    .from("graphic_design_addon_rates")
    .select("addon_slug, price_usd, effective_from")
    .eq("market_id", marketId)
    .eq("active", true)
    .lte("effective_from", now)
    .or(`effective_to.is.null,effective_to.gt.${now}`)
    .order("effective_from", { ascending: false });
  if (error) {
    console.error("[pricing] failed to load graphic design addon rates", error.message);
    return {};
  }
  const result: Partial<Record<GraphicDesignAddonSlug, number>> = {};
  for (const row of data ?? []) {
    const slug = row.addon_slug as GraphicDesignAddonSlug;
    if (slug in result) continue;
    result[slug] = Number(row.price_usd);
  }
  return result;
}

export async function getActivePercentageRates(): Promise<Partial<Record<GraphicDesignPercentageSlug, number>>> {
  const admin = createAdminClient();
  const now = new Date().toISOString();
  const { data, error } = await admin
    .from("graphic_design_percentage_rates")
    .select("percentage_slug, percentage, effective_from")
    .eq("active", true)
    .lte("effective_from", now)
    .or(`effective_to.is.null,effective_to.gt.${now}`)
    .order("effective_from", { ascending: false });
  if (error) {
    console.error("[pricing] failed to load graphic design percentage rates", error.message);
    return {};
  }
  const result: Partial<Record<GraphicDesignPercentageSlug, number>> = {};
  for (const row of data ?? []) {
    const slug = row.percentage_slug as GraphicDesignPercentageSlug;
    if (slug in result) continue;
    result[slug] = Number(row.percentage);
  }
  return result;
}

// ---- Full orchestration ----

export async function estimateGraphicDesignProject(params: {
  marketSlug: string;
  deliverableSlug: GraphicDesignDeliverableSlug;
  complexity: GraphicDesignComplexity;
  additionalPages?: number;
  additionalSlides?: number;
  additionalRevisionRounds?: number;
  radicalReConceptRequested?: boolean;
  editableSourceFileRequested?: boolean;
  turnaround?: GraphicDesignTurnaround;
}): Promise<GraphicDesignEstimateResult> {
  const [deliverableRates, complexityFactors, addonRates, percentages] = await Promise.all([
    getActiveDeliverableRates(params.marketSlug),
    getActiveComplexityFactors(),
    getActiveAddonRates(params.marketSlug),
    getActivePercentageRates(),
  ]);
  return calculateGraphicDesignEstimate({ ...params, deliverableRates, complexityFactors, addonRates, percentages });
}

// ============================================================
// Admin management (finance.pricing.administer) — same append-only
// versioning + unchanged-value-skip pattern as every other family.
// ============================================================

export async function createGraphicDesignDeliverableRateVersion(params: {
  marketSlug: string;
  deliverableSlug: GraphicDesignDeliverableSlug;
  priceUsd: number;
  actorUserId: string;
}): Promise<{ ok: true; unchanged?: boolean } | { ok: false; error: string }> {
  const auth = await authorizeWithSuperAdminOverride(params.actorUserId, FINANCE_CAPABILITIES.pricingAdminister);
  if (!auth.ok) return { ok: false, error: "Not authorized to manage pricing." };
  if (!DELIVERABLE_SLUGS.includes(params.deliverableSlug)) return { ok: false, error: "Unknown deliverable." };
  if (params.priceUsd <= 0) return { ok: false, error: "Price must be greater than zero." };

  const current = (await getActiveDeliverableRates(params.marketSlug)).find((r) => r.deliverableSlug === params.deliverableSlug);
  if (current && current.priceUsd === params.priceUsd) return { ok: true, unchanged: true };

  const admin = createAdminClient();
  const marketId = await getMarketId(admin, params.marketSlug);
  if (!marketId) return { ok: false, error: "Unknown pricing market." };

  const { error } = await admin.from("graphic_design_deliverable_rates").insert({
    market_id: marketId,
    deliverable_slug: params.deliverableSlug,
    price_usd: params.priceUsd,
    created_by: params.actorUserId,
  });
  if (error) {
    console.error("[pricing] failed to create graphic design deliverable rate version", error.message);
    return { ok: false, error: "Failed to save the new rate." };
  }
  await logActivity({
    actorUserId: params.actorUserId,
    action: "pricing.graphic_design_deliverable_rate.created",
    entityType: "pricing_market",
    entityId: marketId,
    metadata: { deliverableSlug: params.deliverableSlug, priceUsd: params.priceUsd },
  });
  return { ok: true };
}

export async function createGraphicDesignComplexityFactorVersion(params: {
  complexity: GraphicDesignComplexity;
  factor: number;
  actorUserId: string;
}): Promise<{ ok: true; unchanged?: boolean } | { ok: false; error: string }> {
  const auth = await authorizeWithSuperAdminOverride(params.actorUserId, FINANCE_CAPABILITIES.pricingAdminister);
  if (!auth.ok) return { ok: false, error: "Not authorized to manage pricing." };
  if (params.factor <= 0) return { ok: false, error: "Factor must be greater than zero." };

  const current = (await getActiveComplexityFactors()).find((c) => c.complexity === params.complexity);
  if (current && current.factor === params.factor) return { ok: true, unchanged: true };

  const admin = createAdminClient();
  const { error } = await admin.from("graphic_design_complexity_factors").insert({ complexity: params.complexity, factor: params.factor, created_by: params.actorUserId });
  if (error) {
    console.error("[pricing] failed to create graphic design complexity factor version", error.message);
    return { ok: false, error: "Failed to save the new factor." };
  }
  await logActivity({ actorUserId: params.actorUserId, action: "pricing.graphic_design_complexity_factor.created", entityType: "pricing_market", metadata: { complexity: params.complexity, factor: params.factor } });
  return { ok: true };
}

export async function createGraphicDesignAddonRateVersion(params: {
  marketSlug: string;
  addonSlug: GraphicDesignAddonSlug;
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

  const { error } = await admin.from("graphic_design_addon_rates").insert({ market_id: marketId, addon_slug: params.addonSlug, price_usd: params.priceUsd, created_by: params.actorUserId });
  if (error) {
    console.error("[pricing] failed to create graphic design addon rate version", error.message);
    return { ok: false, error: "Failed to save the new rate." };
  }
  await logActivity({ actorUserId: params.actorUserId, action: "pricing.graphic_design_addon_rate.created", entityType: "pricing_market", entityId: marketId, metadata: { addonSlug: params.addonSlug, priceUsd: params.priceUsd } });
  return { ok: true };
}

export async function createGraphicDesignPercentageVersion(params: {
  percentageSlug: GraphicDesignPercentageSlug;
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
  const { error } = await admin.from("graphic_design_percentage_rates").insert({ percentage_slug: params.percentageSlug, percentage: params.percentage, created_by: params.actorUserId });
  if (error) {
    console.error("[pricing] failed to create graphic design percentage version", error.message);
    return { ok: false, error: "Failed to save the new percentage." };
  }
  await logActivity({ actorUserId: params.actorUserId, action: "pricing.graphic_design_percentage.created", entityType: "pricing_market", metadata: { percentageSlug: params.percentageSlug, percentage: params.percentage } });
  return { ok: true };
}
