import { createAdminClient } from "@/lib/supabase/admin";
import { authorizeWithSuperAdminOverride, FINANCE_CAPABILITIES } from "@/lib/organization/authority";
import { logActivity } from "@/lib/admin/activityLog";
import {
  calculateCorporateEstimate,
  type CorporateProductSlug,
  type CorporateHeadshotRate,
  type CorporateTeamTierRate,
  type CorporateEstimateResult,
} from "./corporateHeadshotEstimate";

// Ordift Corporate & Headshots Pricing V1 (2026-09-06) — server-only
// DB-reading/writing functions. Pure calculation logic and shared types
// live in corporateHeadshotEstimate.ts (zero imports) and are
// re-exported below — this file itself must never be imported from a
// Client Component, since it pulls in createAdminClient/
// next-headers-dependent server code that cannot be bundled for the
// browser. The public estimator's client component imports directly
// from corporateHeadshotEstimate.ts instead, never from here — same
// established split as the Personal Portrait family.
//
// Reads use the admin/service-role client deliberately: this reference
// data must be visible on the public site to anonymous visitors,
// matching every other pricing read in this codebase. RLS is
// staff-only because the write path is admin-only, not because reads
// should be gated.

export type { CorporateProductSlug, CorporateHeadshotRate, CorporateTeamTierRate, CorporateEstimateResult };
export { calculateCorporateEstimate };

type CorporateTeamTierSlug = "2-5" | "6-10" | "11-25" | "26-50";

async function getMarketId(admin: ReturnType<typeof createAdminClient>, marketSlug: string): Promise<string | null> {
  const { data } = await admin.from("pricing_markets").select("id").eq("slug", marketSlug).eq("active", true).maybeSingle();
  return data?.id ?? null;
}

export async function getActiveCorporateHeadshotRates(marketSlug: string): Promise<CorporateHeadshotRate[]> {
  const admin = createAdminClient();
  const marketId = await getMarketId(admin, marketSlug);
  if (!marketId) return [];

  const now = new Date().toISOString();
  const { data, error } = await admin
    .from("corporate_headshot_rates")
    .select("market_id, product_slug, price_usd, signature_retouched_images, effective_from")
    .eq("market_id", marketId)
    .eq("active", true)
    .lte("effective_from", now)
    .or(`effective_to.is.null,effective_to.gt.${now}`)
    .order("effective_from", { ascending: false });
  if (error) {
    console.error("[pricing] failed to load corporate headshot rates", error.message);
    return [];
  }

  const seenProducts = new Set<string>();
  const rates: CorporateHeadshotRate[] = [];
  for (const row of data ?? []) {
    if (seenProducts.has(row.product_slug)) continue;
    seenProducts.add(row.product_slug);
    rates.push({
      marketId: row.market_id,
      productSlug: row.product_slug as "individual_headshot" | "executive_portrait",
      priceUsd: Number(row.price_usd),
      signatureRetouchedImages: row.signature_retouched_images,
    });
  }
  return rates;
}

export async function getActiveCorporateTeamTierRates(marketSlug: string): Promise<CorporateTeamTierRate[]> {
  const admin = createAdminClient();
  const marketId = await getMarketId(admin, marketSlug);
  if (!marketId) return [];

  const now = new Date().toISOString();
  const { data, error } = await admin
    .from("corporate_team_tier_rates")
    .select("market_id, tier_slug, min_people, max_people, price_per_person_usd, effective_from")
    .eq("market_id", marketId)
    .eq("active", true)
    .lte("effective_from", now)
    .or(`effective_to.is.null,effective_to.gt.${now}`)
    .order("effective_from", { ascending: false });
  if (error) {
    console.error("[pricing] failed to load corporate team tier rates", error.message);
    return [];
  }

  const seenTiers = new Set<string>();
  const rates: CorporateTeamTierRate[] = [];
  for (const row of data ?? []) {
    if (seenTiers.has(row.tier_slug)) continue;
    seenTiers.add(row.tier_slug);
    rates.push({
      marketId: row.market_id,
      tierSlug: row.tier_slug,
      minPeople: row.min_people,
      maxPeople: row.max_people,
      pricePerPersonUsd: Number(row.price_per_person_usd),
    });
  }
  return rates;
}

export async function getActiveCorporateMinimumBooking(marketSlug: string): Promise<number | null> {
  const admin = createAdminClient();
  const marketId = await getMarketId(admin, marketSlug);
  if (!marketId) return null;

  const now = new Date().toISOString();
  const { data, error } = await admin
    .from("corporate_minimum_booking_rates")
    .select("minimum_amount_usd, effective_from")
    .eq("market_id", marketId)
    .eq("active", true)
    .lte("effective_from", now)
    .or(`effective_to.is.null,effective_to.gt.${now}`)
    .order("effective_from", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    console.error("[pricing] failed to load corporate minimum booking rate", error.message);
    return null;
  }
  return data ? Number(data.minimum_amount_usd) : null;
}

export async function getActiveCorporateRetouchRate(marketSlug: string): Promise<number | null> {
  const admin = createAdminClient();
  const marketId = await getMarketId(admin, marketSlug);
  if (!marketId) return null;

  const now = new Date().toISOString();
  const { data, error } = await admin
    .from("corporate_retouch_rates")
    .select("price_per_image_usd, effective_from")
    .eq("market_id", marketId)
    .eq("active", true)
    .lte("effective_from", now)
    .or(`effective_to.is.null,effective_to.gt.${now}`)
    .order("effective_from", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    console.error("[pricing] failed to load corporate retouch rate", error.message);
    return null;
  }
  return data ? Number(data.price_per_image_usd) : null;
}

// Global, not market-scoped — see migration 0055's comment.
export async function getActiveCorporatePriorityDeliveryPercentage(): Promise<number | null> {
  const admin = createAdminClient();
  const now = new Date().toISOString();
  const { data, error } = await admin
    .from("corporate_priority_delivery_rates")
    .select("multiplier_percentage, effective_from")
    .eq("active", true)
    .lte("effective_from", now)
    .or(`effective_to.is.null,effective_to.gt.${now}`)
    .order("effective_from", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    console.error("[pricing] failed to load corporate priority delivery rate", error.message);
    return null;
  }
  return data ? Number(data.multiplier_percentage) : null;
}

// Full orchestration — the one function a page/action actually calls.
// marketSlug must come from an explicit user selection, never derived
// from the request itself.
export async function estimateCorporateSession(params: {
  marketSlug: string;
  product: CorporateProductSlug;
  numberOfPeople?: number;
  additionalRetouchImages?: number;
  priorityDeliveryRequested?: boolean;
}): Promise<CorporateEstimateResult> {
  const [headshotRates, teamTierRates, minimumBookingUsd, retouchRate, priorityPercentage] = await Promise.all([
    getActiveCorporateHeadshotRates(params.marketSlug),
    getActiveCorporateTeamTierRates(params.marketSlug),
    getActiveCorporateMinimumBooking(params.marketSlug),
    getActiveCorporateRetouchRate(params.marketSlug),
    getActiveCorporatePriorityDeliveryPercentage(),
  ]);
  return calculateCorporateEstimate({
    product: params.product,
    headshotRates,
    teamTierRates,
    minimumBookingUsd,
    numberOfPeople: params.numberOfPeople,
    additionalRetouchImages: params.additionalRetouchImages,
    additionalRetouchRatePerImage: retouchRate,
    priorityDeliveryRequested: params.priorityDeliveryRequested,
    priorityDeliveryPercentage: priorityPercentage,
  });
}

// ============================================================
// Admin management (finance.pricing.administer) — same append-only
// versioning + unchanged-value-skip pattern as the Personal Portrait
// family's admin functions.
// ============================================================

export async function createCorporateHeadshotRateVersion(params: {
  marketSlug: string;
  productSlug: "individual_headshot" | "executive_portrait";
  priceUsd: number;
  signatureRetouchedImages: number;
  actorUserId: string;
}): Promise<{ ok: true; unchanged?: boolean } | { ok: false; error: string }> {
  const auth = await authorizeWithSuperAdminOverride(params.actorUserId, FINANCE_CAPABILITIES.pricingAdminister);
  if (!auth.ok) return { ok: false, error: "Not authorized to manage pricing." };
  if (params.priceUsd <= 0) return { ok: false, error: "Price must be greater than zero." };

  const current = (await getActiveCorporateHeadshotRates(params.marketSlug)).find((r) => r.productSlug === params.productSlug);
  if (current && current.priceUsd === params.priceUsd && current.signatureRetouchedImages === params.signatureRetouchedImages) {
    return { ok: true, unchanged: true };
  }

  const admin = createAdminClient();
  const marketId = await getMarketId(admin, params.marketSlug);
  if (!marketId) return { ok: false, error: "Unknown pricing market." };

  const { error } = await admin.from("corporate_headshot_rates").insert({
    market_id: marketId,
    product_slug: params.productSlug,
    price_usd: params.priceUsd,
    signature_retouched_images: params.signatureRetouchedImages,
    created_by: params.actorUserId,
  });
  if (error) {
    console.error("[pricing] failed to create corporate headshot rate version", error.message);
    return { ok: false, error: "Failed to save the new rate." };
  }

  await logActivity({
    actorUserId: params.actorUserId,
    action: "pricing.corporate_headshot_rate.created",
    entityType: "pricing_market",
    entityId: marketId,
    metadata: { productSlug: params.productSlug, priceUsd: params.priceUsd },
  });
  return { ok: true };
}

export async function createCorporateTeamTierRateVersion(params: {
  marketSlug: string;
  tierSlug: CorporateTeamTierSlug;
  pricePerPersonUsd: number;
  actorUserId: string;
}): Promise<{ ok: true; unchanged?: boolean } | { ok: false; error: string }> {
  const auth = await authorizeWithSuperAdminOverride(params.actorUserId, FINANCE_CAPABILITIES.pricingAdminister);
  if (!auth.ok) return { ok: false, error: "Not authorized to manage pricing." };
  if (params.pricePerPersonUsd <= 0) return { ok: false, error: "Rate must be greater than zero." };

  const current = (await getActiveCorporateTeamTierRates(params.marketSlug)).find((t) => t.tierSlug === params.tierSlug);
  if (current && current.pricePerPersonUsd === params.pricePerPersonUsd) {
    return { ok: true, unchanged: true };
  }

  const admin = createAdminClient();
  const marketId = await getMarketId(admin, params.marketSlug);
  if (!marketId) return { ok: false, error: "Unknown pricing market." };

  const [minPeople, maxPeople] = params.tierSlug.split("-").map(Number);
  const { error } = await admin.from("corporate_team_tier_rates").insert({
    market_id: marketId,
    tier_slug: params.tierSlug,
    min_people: minPeople,
    max_people: maxPeople,
    price_per_person_usd: params.pricePerPersonUsd,
    created_by: params.actorUserId,
  });
  if (error) {
    console.error("[pricing] failed to create corporate team tier rate version", error.message);
    return { ok: false, error: "Failed to save the new rate." };
  }

  await logActivity({
    actorUserId: params.actorUserId,
    action: "pricing.corporate_team_tier_rate.created",
    entityType: "pricing_market",
    entityId: marketId,
    metadata: { tierSlug: params.tierSlug, pricePerPersonUsd: params.pricePerPersonUsd },
  });
  return { ok: true };
}

export async function createCorporateMinimumBookingVersion(params: {
  marketSlug: string;
  minimumAmountUsd: number;
  actorUserId: string;
}): Promise<{ ok: true; unchanged?: boolean } | { ok: false; error: string }> {
  const auth = await authorizeWithSuperAdminOverride(params.actorUserId, FINANCE_CAPABILITIES.pricingAdminister);
  if (!auth.ok) return { ok: false, error: "Not authorized to manage pricing." };
  if (params.minimumAmountUsd <= 0) return { ok: false, error: "Minimum must be greater than zero." };

  const current = await getActiveCorporateMinimumBooking(params.marketSlug);
  if (current !== null && current === params.minimumAmountUsd) {
    return { ok: true, unchanged: true };
  }

  const admin = createAdminClient();
  const marketId = await getMarketId(admin, params.marketSlug);
  if (!marketId) return { ok: false, error: "Unknown pricing market." };

  const { error } = await admin.from("corporate_minimum_booking_rates").insert({
    market_id: marketId,
    minimum_amount_usd: params.minimumAmountUsd,
    created_by: params.actorUserId,
  });
  if (error) {
    console.error("[pricing] failed to create corporate minimum booking version", error.message);
    return { ok: false, error: "Failed to save the new minimum." };
  }

  await logActivity({
    actorUserId: params.actorUserId,
    action: "pricing.corporate_minimum_booking.created",
    entityType: "pricing_market",
    entityId: marketId,
    metadata: { minimumAmountUsd: params.minimumAmountUsd },
  });
  return { ok: true };
}

export async function createCorporateRetouchRateVersion(params: {
  marketSlug: string;
  pricePerImageUsd: number;
  actorUserId: string;
}): Promise<{ ok: true; unchanged?: boolean } | { ok: false; error: string }> {
  const auth = await authorizeWithSuperAdminOverride(params.actorUserId, FINANCE_CAPABILITIES.pricingAdminister);
  if (!auth.ok) return { ok: false, error: "Not authorized to manage pricing." };
  if (params.pricePerImageUsd <= 0) return { ok: false, error: "Rate must be greater than zero." };

  const current = await getActiveCorporateRetouchRate(params.marketSlug);
  if (current !== null && current === params.pricePerImageUsd) {
    return { ok: true, unchanged: true };
  }

  const admin = createAdminClient();
  const marketId = await getMarketId(admin, params.marketSlug);
  if (!marketId) return { ok: false, error: "Unknown pricing market." };

  const { error } = await admin.from("corporate_retouch_rates").insert({
    market_id: marketId,
    price_per_image_usd: params.pricePerImageUsd,
    created_by: params.actorUserId,
  });
  if (error) {
    console.error("[pricing] failed to create corporate retouch rate version", error.message);
    return { ok: false, error: "Failed to save the new rate." };
  }

  await logActivity({
    actorUserId: params.actorUserId,
    action: "pricing.corporate_retouch_rate.created",
    entityType: "pricing_market",
    entityId: marketId,
    metadata: { pricePerImageUsd: params.pricePerImageUsd },
  });
  return { ok: true };
}

export async function createCorporatePriorityDeliveryVersion(params: {
  multiplierPercentage: number;
  actorUserId: string;
}): Promise<{ ok: true; unchanged?: boolean } | { ok: false; error: string }> {
  const auth = await authorizeWithSuperAdminOverride(params.actorUserId, FINANCE_CAPABILITIES.pricingAdminister);
  if (!auth.ok) return { ok: false, error: "Not authorized to manage pricing." };
  if (params.multiplierPercentage <= 0) return { ok: false, error: "Percentage must be greater than zero." };

  const current = await getActiveCorporatePriorityDeliveryPercentage();
  if (current !== null && current === params.multiplierPercentage) {
    return { ok: true, unchanged: true };
  }

  const admin = createAdminClient();
  const { error } = await admin.from("corporate_priority_delivery_rates").insert({
    multiplier_percentage: params.multiplierPercentage,
    created_by: params.actorUserId,
  });
  if (error) {
    console.error("[pricing] failed to create corporate priority delivery version", error.message);
    return { ok: false, error: "Failed to save the new percentage." };
  }

  await logActivity({
    actorUserId: params.actorUserId,
    action: "pricing.corporate_priority_delivery.created",
    entityType: "pricing_market",
    metadata: { multiplierPercentage: params.multiplierPercentage },
  });
  return { ok: true };
}
