import { RATE_MAX_AGE_DAYS, roundHalfUp } from "@/lib/commercial/amountDueRules";

// INTERNAL reference only. Every calculator prices in USD (the pricing reference currency) and the client payment page is USD-only
// (NON_USD_AMOUNT_DUE_ENABLED is false), so a USD figure is never relabelled as QAR or GHS. This helper only converts for staff reference, using
// the governed, versioned exchange-rate table, and refuses a rate older than the governed limit. It is never part of the client summary.
export type FxEntry = { rateToUsd: number; effectiveFrom: string } | null;
export type IndicativeLocal =
  | { ok: true; currency: string; amount: number; rateToUsd: number; effectiveFrom: string; ageDays: number }
  | { ok: false; reason: string };

export function indicativeLocalAmount(usd: number, currency: string, fx: FxEntry, now: Date = new Date()): IndicativeLocal {
  if (!fx || !(fx.rateToUsd > 0)) return { ok: false, reason: `No governed ${currency} exchange rate is on record, so no ${currency} figure can be shown.` };
  const eff = new Date(fx.effectiveFrom).getTime();
  if (!Number.isFinite(eff) || eff > now.getTime()) return { ok: false, reason: `The ${currency} rate has no valid effective date.` };
  const ageDays = Math.floor((now.getTime() - eff) / 86_400_000);
  if (ageDays > RATE_MAX_AGE_DAYS) return { ok: false, reason: `The governed ${currency} rate is ${ageDays} days old (the limit is ${RATE_MAX_AGE_DAYS}). Update it under Payments → Exchange rates before using a ${currency} figure.` };
  if (!(usd > 0)) return { ok: false, reason: "There is no USD amount to convert." };
  return { ok: true, currency, amount: roundHalfUp(usd * fx.rateToUsd, 2), rateToUsd: fx.rateToUsd, effectiveFrom: fx.effectiveFrom, ageDays };
}
