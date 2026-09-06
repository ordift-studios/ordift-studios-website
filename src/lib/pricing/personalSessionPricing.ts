import { createAdminClient } from "@/lib/supabase/admin";
import { authorizeWithSuperAdminOverride, FINANCE_CAPABILITIES } from "@/lib/organization/authority";
import { logActivity } from "@/lib/admin/activityLog";
import { calculatePersonalSessionEstimate, type PricingMarket, type PersonalSessionRate, type SubjectCategory, type SessionEstimateResult } from "./personalSessionEstimate";

// Ordift Pricing Engine V1 (2026-09-06) — Personal Portrait session
// pricing: server-only DB-reading/writing functions. The pure
// calculation logic and shared types live in personalSessionEstimate.ts
// (zero imports of any kind) and are re-exported below — this file
// itself must never be imported from a Client Component, since it pulls
// in createAdminClient/next-headers-dependent server code that cannot
// be bundled for the browser. PersonalSessionEstimator.tsx (the client
// estimator UI) imports directly from personalSessionEstimate.ts
// instead, never from here.
//
// Reads use the admin/service-role client deliberately: pricing
// markets/rates/subject-category reference data must be visible on the
// public site to anonymous visitors, matching the established pattern
// for other public content (e.g. contentRepository's Sanity-backed
// functions) — RLS on these tables is staff-only (see migration 0053)
// because the *write* path is admin-only, not because reads should be
// gated; the public-facing functions below explicitly filter to
// active=true rows only and never expose an unapproved/null price.

export type { PricingMarket, PersonalSessionRate, SubjectCategory, SessionEstimateResult };
export { calculatePersonalSessionEstimate };

export async function listActivePricingMarkets(): Promise<PricingMarket[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("pricing_markets")
    .select("id, slug, name")
    .eq("active", true)
    .order("sort_order");
  if (error) {
    console.error("[pricing] failed to load active pricing markets", error.message);
    return [];
  }
  return (data ?? []).map((m) => ({ id: m.id, slug: m.slug, name: m.name }));
}

// Every pricing_markets row (active or not) — for admin display only,
// so staff can see the full architecture, including markets awaiting
// approved rates. Never used by any public-facing function above.
export type PricingMarketAdmin = PricingMarket & { active: boolean; sortOrder: number };

export async function listAllPricingMarketsForAdmin(): Promise<PricingMarketAdmin[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("pricing_markets")
    .select("id, slug, name, active, sort_order")
    .order("sort_order");
  if (error) {
    console.error("[pricing] failed to load pricing markets for admin", error.message);
    return [];
  }
  return (data ?? []).map((m) => ({ id: m.id, slug: m.slug, name: m.name, active: m.active, sortOrder: m.sort_order }));
}

// Current (most recent effective, still active) personal-session rates
// for an ACTIVE market only — returns [] for an inactive/unknown market
// slug, never a guessed or extrapolated price. Append-only versioning:
// the most recent effective_from row per duration wins, mirroring
// currency.ts's exchange-rate history pattern.
export async function getActivePersonalSessionRates(marketSlug: string): Promise<PersonalSessionRate[]> {
  const admin = createAdminClient();
  const { data: market } = await admin.from("pricing_markets").select("id").eq("slug", marketSlug).eq("active", true).maybeSingle();
  if (!market) return [];

  const now = new Date().toISOString();
  const { data, error } = await admin
    .from("personal_session_rates")
    .select("market_id, duration_hours, price_usd, signature_retouched_images, professionally_edited_images, effective_from")
    .eq("market_id", market.id)
    .eq("active", true)
    .lte("effective_from", now)
    .or(`effective_to.is.null,effective_to.gt.${now}`)
    .order("effective_from", { ascending: false });
  if (error) {
    console.error("[pricing] failed to load personal session rates", error.message);
    return [];
  }

  // Keep only the most recent row per duration_hours (already ordered
  // newest-first above).
  const seenDurations = new Set<number>();
  const rates: PersonalSessionRate[] = [];
  for (const row of data ?? []) {
    if (seenDurations.has(row.duration_hours)) continue;
    seenDurations.add(row.duration_hours);
    rates.push({
      marketId: row.market_id,
      durationHours: row.duration_hours,
      priceUsd: Number(row.price_usd),
      signatureRetouchedImages: row.signature_retouched_images,
      professionallyEditedImages: row.professionally_edited_images,
    });
  }
  return rates.sort((a, b) => a.durationHours - b.durationHours);
}

export async function listAllSubjectCategories(): Promise<SubjectCategory[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("subject_categories")
    .select("id, slug, name, min_subjects, max_subjects, supplement_usd, active, requires_custom_quote")
    .order("min_subjects");
  if (error) {
    console.error("[pricing] failed to load subject categories", error.message);
    return [];
  }
  return (data ?? []).map((c) => ({
    id: c.id,
    slug: c.slug,
    name: c.name,
    minSubjects: c.min_subjects,
    maxSubjects: c.max_subjects,
    supplementUsd: c.supplement_usd === null ? null : Number(c.supplement_usd),
    active: c.active,
    requiresCustomQuote: c.requires_custom_quote,
  }));
}

// Full orchestration — the one function a page/action actually calls.
// marketSlug must come from an explicit user selection (a "where will
// this take place" control), never derived from the request itself.
export async function estimatePersonalSession(params: {
  marketSlug: string;
  durationHours: number;
  subjectCategorySlug: string;
}): Promise<SessionEstimateResult> {
  const [rates, subjectCategories] = await Promise.all([
    getActivePersonalSessionRates(params.marketSlug),
    listAllSubjectCategories(),
  ]);
  if (rates.length === 0) {
    return { ok: false, requiresCustomQuote: true, reason: "Pricing for this location isn't published yet — request a custom quote." };
  }
  const subjectCategory = subjectCategories.find((c) => c.slug === params.subjectCategorySlug) ?? null;
  return calculatePersonalSessionEstimate({ rates, durationHours: params.durationHours, subjectCategory });
}

// ============================================================
// Admin management (finance.pricing.administer)
// ============================================================

// Append-only versioning — mirrors insertExchangeRate()'s exact
// pattern (src/lib/payments/currency.ts): always a new INSERT with a
// later effective_from, never an UPDATE. getActivePersonalSessionRates()
// above already reads "most recent effective_from row per duration,"
// so a new row automatically supersedes the prior one in every read —
// no separate effective_to close-out step is needed, same as the
// proven currency-rate precedent this mirrors.
export async function createPersonalSessionRateVersion(params: {
  marketSlug: string;
  durationHours: 1 | 2 | 3 | 4;
  priceUsd: number;
  signatureRetouchedImages: number;
  professionallyEditedImages: number;
  actorUserId: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const auth = await authorizeWithSuperAdminOverride(params.actorUserId, FINANCE_CAPABILITIES.pricingAdminister);
  if (!auth.ok) return { ok: false, error: "Not authorized to manage pricing." };
  if (params.priceUsd <= 0) return { ok: false, error: "Price must be greater than zero." };

  const admin = createAdminClient();
  const { data: market } = await admin.from("pricing_markets").select("id").eq("slug", params.marketSlug).maybeSingle();
  if (!market) return { ok: false, error: "Unknown pricing market." };

  const { error } = await admin.from("personal_session_rates").insert({
    market_id: market.id,
    duration_hours: params.durationHours,
    price_usd: params.priceUsd,
    signature_retouched_images: params.signatureRetouchedImages,
    professionally_edited_images: params.professionallyEditedImages,
    created_by: params.actorUserId,
  });
  if (error) {
    console.error("[pricing] failed to create personal session rate version", error.message);
    return { ok: false, error: "Failed to save the new rate." };
  }

  await logActivity({
    actorUserId: params.actorUserId,
    action: "pricing.personal_session_rate.created",
    entityType: "pricing_market",
    entityId: market.id,
    metadata: { durationHours: params.durationHours, priceUsd: params.priceUsd },
  });
  return { ok: true };
}

export async function setPricingMarketActive(params: { marketSlug: string; active: boolean; actorUserId: string }): Promise<{ ok: true } | { ok: false; error: string }> {
  const auth = await authorizeWithSuperAdminOverride(params.actorUserId, FINANCE_CAPABILITIES.pricingAdminister);
  if (!auth.ok) return { ok: false, error: "Not authorized to manage pricing." };

  const admin = createAdminClient();
  const { data, error } = await admin.from("pricing_markets").update({ active: params.active }).eq("slug", params.marketSlug).select("id");
  if (error) {
    console.error("[pricing] failed to update pricing market active state", error.message);
    return { ok: false, error: "Failed to update the market." };
  }
  if (!data || data.length === 0) return { ok: false, error: "Unknown pricing market." };

  await logActivity({
    actorUserId: params.actorUserId,
    action: "pricing.market.active_changed",
    entityType: "pricing_market",
    entityId: data[0].id,
    metadata: { marketSlug: params.marketSlug, active: params.active },
  });
  return { ok: true };
}
