import { createAdminClient } from "@/lib/supabase/admin";
import { logActivity } from "@/lib/admin/activityLog";
import { authorizeWithSuperAdminOverride, FINANCE_CAPABILITIES } from "@/lib/organization/authority";
import type { GovernedRate } from "./quotePricing";

// Governed Crew Support SELLING rates (empty until the Founder configures
// them). Append-only: a change inserts a new row with a later
// effective_from; reads take the most recent active row per key. These
// are never cost rates.

export type RateUnit = "hour" | "half_day" | "full_day";
export const RATE_UNITS: { value: RateUnit; label: string }[] = [
  { value: "hour", label: "Per hour" },
  { value: "half_day", label: "Half day" },
  { value: "full_day", label: "Full day" },
];
export type ModifierSlug = "urgent_uplift_percent" | "overtime_uplift_percent";
export const MODIFIER_LABELS: Record<ModifierSlug, string> = { urgent_uplift_percent: "Urgent request uplift (%)", overtime_uplift_percent: "Overtime uplift (%)" };

async function marketId(slug: string): Promise<string | null> {
  const { data } = await createAdminClient().from("pricing_markets").select("id").eq("slug", slug).eq("active", true).maybeSingle();
  return (data?.id as string | undefined) ?? null;
}

export async function getActiveCrewSupportRates(marketSlug: string): Promise<GovernedRate[]> {
  const admin = createAdminClient();
  const id = await marketId(marketSlug);
  if (!id) return [];
  const now = new Date().toISOString();
  const { data, error } = await admin
    .from("crew_support_rates")
    .select("operational_title_id, unit_basis, price_usd, effective_from")
    .eq("market_id", id)
    .eq("active", true)
    .lte("effective_from", now)
    .or(`effective_to.is.null,effective_to.gt.${now}`)
    .order("effective_from", { ascending: false });
  if (error) {
    console.error("[crew-support] failed to load rates", error.message);
    return [];
  }
  const seen = new Set<string>();
  const rates: GovernedRate[] = [];
  for (const r of data ?? []) {
    const key = `${r.operational_title_id}:${r.unit_basis}`;
    if (seen.has(key)) continue;
    seen.add(key);
    rates.push({ titleId: r.operational_title_id as string, unitBasis: r.unit_basis as RateUnit, priceUsd: Number(r.price_usd) });
  }
  return rates;
}

export async function getActiveModifierPercent(slug: ModifierSlug, marketSlug: string): Promise<number | null> {
  const admin = createAdminClient();
  const id = await marketId(marketSlug);
  const now = new Date().toISOString();
  const { data } = await admin
    .from("crew_support_rate_modifiers")
    .select("market_id, percentage, effective_from")
    .eq("modifier_slug", slug)
    .eq("active", true)
    .lte("effective_from", now)
    .or(`effective_to.is.null,effective_to.gt.${now}`)
    .order("effective_from", { ascending: false });
  const rows = data ?? [];
  const specific = rows.find((r) => r.market_id === id);
  const global = rows.find((r) => r.market_id === null);
  const row = specific ?? global;
  return row ? Number(row.percentage) : null;
}

export async function createCrewSupportRateVersion(params: { marketSlug: string; titleId: string; unitBasis: RateUnit; priceUsd: number; actorUserId: string }): Promise<{ ok: true; unchanged?: boolean } | { ok: false; error: string }> {
  const auth = await authorizeWithSuperAdminOverride(params.actorUserId, FINANCE_CAPABILITIES.pricingAdminister);
  if (!auth.ok) return { ok: false, error: "Not authorized to manage pricing." };
  if (!RATE_UNITS.some((u) => u.value === params.unitBasis)) return { ok: false, error: "Invalid unit." };
  if (!(params.priceUsd > 0)) return { ok: false, error: "Price must be greater than zero." };
  const id = await marketId(params.marketSlug);
  if (!id) return { ok: false, error: "Unknown pricing market." };

  const current = (await getActiveCrewSupportRates(params.marketSlug)).find((r) => r.titleId === params.titleId && r.unitBasis === params.unitBasis);
  if (current && current.priceUsd === params.priceUsd) return { ok: true, unchanged: true };

  const { error } = await createAdminClient().from("crew_support_rates").insert({ market_id: id, operational_title_id: params.titleId, unit_basis: params.unitBasis, price_usd: params.priceUsd, created_by: params.actorUserId });
  if (error) {
    console.error("[crew-support] failed to create rate version", error.message);
    return { ok: false, error: "Failed to save the new rate." };
  }
  await logActivity({ actorUserId: params.actorUserId, action: "pricing.crew_support_rate.created", entityType: "pricing_market", entityId: id, metadata: { titleId: params.titleId, unitBasis: params.unitBasis, priceUsd: params.priceUsd, previousPriceUsd: current?.priceUsd ?? null } });
  return { ok: true };
}

export async function createCrewSupportModifierVersion(params: { slug: ModifierSlug; marketSlug: string | null; percentage: number; actorUserId: string }): Promise<{ ok: true; unchanged?: boolean } | { ok: false; error: string }> {
  const auth = await authorizeWithSuperAdminOverride(params.actorUserId, FINANCE_CAPABILITIES.pricingAdminister);
  if (!auth.ok) return { ok: false, error: "Not authorized to manage pricing." };
  if (!(params.percentage > 0) || params.percentage > 500) return { ok: false, error: "Enter a percentage between 0 and 500." };
  const id = params.marketSlug ? await marketId(params.marketSlug) : null;
  if (params.marketSlug && !id) return { ok: false, error: "Unknown pricing market." };

  const current = await getActiveModifierPercent(params.slug, params.marketSlug ?? "");
  if (current !== null && current === params.percentage && params.marketSlug) return { ok: true, unchanged: true };

  const { error } = await createAdminClient().from("crew_support_rate_modifiers").insert({ market_id: id, modifier_slug: params.slug, percentage: params.percentage, created_by: params.actorUserId });
  if (error) {
    console.error("[crew-support] failed to create modifier version", error.message);
    return { ok: false, error: "Failed to save the new modifier." };
  }
  await logActivity({ actorUserId: params.actorUserId, action: "pricing.crew_support_modifier.created", entityType: "pricing_market", entityId: id ?? undefined, metadata: { slug: params.slug, percentage: params.percentage, market: params.marketSlug ?? "all" } });
  return { ok: true };
}
