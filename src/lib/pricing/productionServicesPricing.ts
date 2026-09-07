import { createAdminClient } from "@/lib/supabase/admin";
import { authorizeWithSuperAdminOverride, FINANCE_CAPABILITIES } from "@/lib/organization/authority";
import { logActivity } from "@/lib/admin/activityLog";
import {
  calculateProductionServicesEstimate,
  applyMinimumOrPercentage,
  type ProductionServicesRateSlug,
  type ProductionServicesPercentageSlug,
  type ProductionServicesRate,
  type ProductionServicesEstimateResult,
  type ProductionPlanningTier,
  type ProductionScaleSignal,
} from "./productionServicesEstimate";

// Ordift Production Services Pricing V1 (2026-09-07) — server-only
// DB-reading/writing functions for Ordift's OWN versioned rates
// (Production Management minimum/percentage, Planning, standalone
// Location/Equipment/Crew Coordination). Pure calculation logic and
// shared types live in productionServicesEstimate.ts (zero imports)
// and are re-exported below — this file must never be imported from a
// Client Component.
//
// External supplier data (production_suppliers, production_supplier_quotes,
// production_budgets, production_budget_changes) is deliberately NOT
// here — those are internal procurement/project records, never
// universal pricing rows, and live in their own modules
// (productionSuppliers.ts, productionSupplierQuotes.ts,
// productionBudgets.ts) under a different capability
// (operations.coordinate, not finance.pricing.administer) — see each
// module's own doc comment.

export type { ProductionServicesRateSlug, ProductionServicesPercentageSlug, ProductionServicesRate, ProductionServicesEstimateResult, ProductionPlanningTier, ProductionScaleSignal };
export { calculateProductionServicesEstimate };

const RATE_SLUGS: ProductionServicesRateSlug[] = ["management_minimum", "half_day_planning", "full_day_planning", "location_coordination", "equipment_coordination_minimum", "crew_coordination_minimum"];
const PERCENTAGE_SLUGS: ProductionServicesPercentageSlug[] = ["management_fee", "equipment_coordination", "crew_coordination", "management_overtime"];

async function getMarketId(admin: ReturnType<typeof createAdminClient>, marketSlug: string): Promise<string | null> {
  const { data } = await admin.from("pricing_markets").select("id").eq("slug", marketSlug).eq("active", true).maybeSingle();
  return data?.id ?? null;
}

// ---- Reads ----

export async function getActiveRates(marketSlug: string): Promise<ProductionServicesRate[]> {
  const admin = createAdminClient();
  const marketId = await getMarketId(admin, marketSlug);
  if (!marketId) return [];
  const now = new Date().toISOString();
  const { data, error } = await admin
    .from("production_market_rates")
    .select("market_id, rate_slug, price_usd, effective_from")
    .eq("market_id", marketId)
    .eq("active", true)
    .lte("effective_from", now)
    .or(`effective_to.is.null,effective_to.gt.${now}`)
    .order("effective_from", { ascending: false });
  if (error) {
    console.error("[pricing] failed to load production services rates", error.message);
    return [];
  }
  const seen = new Set<string>();
  const rates: ProductionServicesRate[] = [];
  for (const row of data ?? []) {
    if (seen.has(row.rate_slug)) continue;
    seen.add(row.rate_slug);
    rates.push({ marketId: row.market_id, rateSlug: row.rate_slug as ProductionServicesRateSlug, priceUsd: Number(row.price_usd) });
  }
  return rates;
}

export async function getActivePercentageRates(): Promise<Partial<Record<ProductionServicesPercentageSlug, number>>> {
  const admin = createAdminClient();
  const now = new Date().toISOString();
  const { data, error } = await admin
    .from("production_percentage_rates")
    .select("percentage_slug, percentage, effective_from")
    .eq("active", true)
    .lte("effective_from", now)
    .or(`effective_to.is.null,effective_to.gt.${now}`)
    .order("effective_from", { ascending: false });
  if (error) {
    console.error("[pricing] failed to load production services percentage rates", error.message);
    return {};
  }
  const result: Partial<Record<ProductionServicesPercentageSlug, number>> = {};
  for (const row of data ?? []) {
    const slug = row.percentage_slug as ProductionServicesPercentageSlug;
    if (slug in result) continue;
    result[slug] = Number(row.percentage);
  }
  return result;
}

// ---- Full orchestration ----

export async function estimateProductionServices(
  params:
    | { marketSlug: string; engagementType: "full_production_management"; eligibleManagedExternalCostUsd: number; planningTier?: ProductionPlanningTier; managementOvertimeRequested?: boolean; scaleSignals?: ProductionScaleSignal[] }
    | { marketSlug: string; engagementType: "standalone_coordination"; standaloneLocationCount?: number; standaloneEquipmentRentalCostUsd?: number; standaloneCrewCostUsd?: number; planningTier?: ProductionPlanningTier; scaleSignals?: ProductionScaleSignal[] }
): Promise<ProductionServicesEstimateResult> {
  const [rates, percentages] = await Promise.all([getActiveRates(params.marketSlug), getActivePercentageRates()]);
  return calculateProductionServicesEstimate({ ...params, rates, percentages } as Parameters<typeof calculateProductionServicesEstimate>[0]);
}

// ============================================================
// Admin management (finance.pricing.administer) — same append-only
// versioning + unchanged-value-skip pattern as every other family.
// ============================================================

export async function createRateVersion(params: { marketSlug: string; rateSlug: ProductionServicesRateSlug; priceUsd: number; actorUserId: string }): Promise<{ ok: true; unchanged?: boolean } | { ok: false; error: string }> {
  const auth = await authorizeWithSuperAdminOverride(params.actorUserId, FINANCE_CAPABILITIES.pricingAdminister);
  if (!auth.ok) return { ok: false, error: "Not authorized to manage pricing." };
  if (!RATE_SLUGS.includes(params.rateSlug)) return { ok: false, error: "Unknown rate." };
  if (params.priceUsd <= 0) return { ok: false, error: "Price must be greater than zero." };

  const current = (await getActiveRates(params.marketSlug)).find((r) => r.rateSlug === params.rateSlug);
  if (current && current.priceUsd === params.priceUsd) return { ok: true, unchanged: true };

  const admin = createAdminClient();
  const marketId = await getMarketId(admin, params.marketSlug);
  if (!marketId) return { ok: false, error: "Unknown pricing market." };

  const { error } = await admin.from("production_market_rates").insert({ market_id: marketId, rate_slug: params.rateSlug, price_usd: params.priceUsd, created_by: params.actorUserId });
  if (error) {
    console.error("[pricing] failed to create production services rate version", error.message);
    return { ok: false, error: "Failed to save the new rate." };
  }
  await logActivity({ actorUserId: params.actorUserId, action: "pricing.production_market_rate.created", entityType: "pricing_market", entityId: marketId, metadata: { rateSlug: params.rateSlug, priceUsd: params.priceUsd } });
  return { ok: true };
}

export async function createPercentageVersion(params: { percentageSlug: ProductionServicesPercentageSlug; percentage: number; actorUserId: string }): Promise<{ ok: true; unchanged?: boolean } | { ok: false; error: string }> {
  const auth = await authorizeWithSuperAdminOverride(params.actorUserId, FINANCE_CAPABILITIES.pricingAdminister);
  if (!auth.ok) return { ok: false, error: "Not authorized to manage pricing." };
  if (!PERCENTAGE_SLUGS.includes(params.percentageSlug)) return { ok: false, error: "Unknown percentage." };
  if (params.percentage <= 0) return { ok: false, error: "Percentage must be greater than zero." };

  const current = (await getActivePercentageRates())[params.percentageSlug];
  if (current !== undefined && current === params.percentage) return { ok: true, unchanged: true };

  const admin = createAdminClient();
  const { error } = await admin.from("production_percentage_rates").insert({ percentage_slug: params.percentageSlug, percentage: params.percentage, created_by: params.actorUserId });
  if (error) {
    console.error("[pricing] failed to create production services percentage version", error.message);
    return { ok: false, error: "Failed to save the new percentage." };
  }
  await logActivity({ actorUserId: params.actorUserId, action: "pricing.production_percentage.created", entityType: "pricing_market", metadata: { percentageSlug: params.percentageSlug, percentage: params.percentage } });
  return { ok: true };
}

export { applyMinimumOrPercentage };
