import { createClient } from "@/lib/supabase/server";
import type { ExchangeRateSource } from "@/lib/payments/types";

// USD-reference / local-settlement currency model (architecture
// proposal §2, revised 2026-08-06 per Part 6 rule 9): Phase 1 uses an
// admin-controlled rate — staff enters/updates the current
// USD->currency rate in the Admin Platform. Rate-setting INSERTs a new
// row into public.exchange_rates (append-only history, per the
// pre-staging architecture review) rather than updating one in place —
// this module reads from the public.current_exchange_rates VIEW
// (always the most recent row per currency), never the raw table, so
// application code never needs to know history exists underneath. No
// automatic FX-data API is called here.

export type LockedRate = {
  currencyCode: string;
  rateToUsd: number;
  convertedAmount: number; // referenceAmountUsd * rateToUsd, rounded to 2dp
  lockedAt: string;
  source: ExchangeRateSource;
};

export async function getCurrentRate(currencyCode: string): Promise<number | null> {
  if (currencyCode === "USD") return 1;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("current_exchange_rates")
    .select("rate_to_usd")
    .eq("currency_code", currencyCode)
    .maybeSingle();

  if (error) {
    console.error("[payments] failed to load current_exchange_rates", error.message);
    return null;
  }
  return data ? Number(data.rate_to_usd) : null;
}

// Full history row shape, for the Admin Platform's Exchange Rate
// Management screen only — every other consumer of this module reads
// current_exchange_rates (the latest-row-per-currency view) and never
// needs to know history exists underneath. Admin history genuinely
// needs every row, so it reads public.exchange_rates directly.
export type ExchangeRateEntry = {
  id: string;
  currencyCode: string;
  rateToUsd: number;
  effectiveFrom: string;
  updatedBy: string | null;
  reason: string | null;
  createdAt: string;
};

export async function getExchangeRateHistory(currencyCode: string): Promise<ExchangeRateEntry[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("exchange_rates")
    .select("id, currency_code, rate_to_usd, effective_from, updated_by, reason, created_at")
    .eq("currency_code", currencyCode)
    .order("effective_from", { ascending: false });

  if (error) {
    console.error("[payments] failed to load exchange_rates history", error.message);
    return [];
  }

  return (data ?? []).map((row) => ({
    id: row.id,
    currencyCode: row.currency_code,
    rateToUsd: Number(row.rate_to_usd),
    effectiveFrom: row.effective_from,
    updatedBy: row.updated_by,
    reason: row.reason,
    createdAt: row.created_at,
  }));
}

// The one write path for exchange rates — always an INSERT, never an
// UPDATE, per the approved append-only architecture (RLS has no
// update/delete policy on this table at all, so this is also the only
// path the database itself allows). A future maker/checker approval
// step, if ever needed, would sit in front of this function (e.g. an
// approval action that calls this only once approved) rather than
// requiring this function or the table shape to change.
export async function insertExchangeRate(params: {
  currencyCode: string;
  rateToUsd: number;
  reason: string | null;
  actorUserId: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createClient();
  const { error } = await supabase.from("exchange_rates").insert({
    currency_code: params.currencyCode,
    rate_to_usd: params.rateToUsd,
    reason: params.reason,
    updated_by: params.actorUserId,
  });

  if (error) {
    console.error("[payments] failed to insert exchange rate", error.message);
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

// Locks a rate for a checkout session — called once, at
// checkout-initiation time, never re-fetched mid-session (architecture
// proposal §2's "locked once per checkout session, never silently
// changed" rule). Returns null if no admin-set rate exists yet for
// this currency (e.g. Ghana rollout before staff has entered a GHS
// rate) — the caller must treat this as "checkout cannot proceed", not
// silently fall back to a guessed rate.
export async function lockExchangeRate(
  referenceAmountUsd: number,
  currencyCode: string
): Promise<LockedRate | null> {
  const rateToUsd = await getCurrentRate(currencyCode);
  if (rateToUsd == null) return null;

  return {
    currencyCode,
    rateToUsd,
    convertedAmount: Math.round(referenceAmountUsd * rateToUsd * 100) / 100,
    lockedAt: new Date().toISOString(),
    source: "ordift", // admin-controlled — see module doc comment above
  };
}
