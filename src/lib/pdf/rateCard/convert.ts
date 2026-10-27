// Reviewable conversion of USD selling prices into a display currency (QAR for the Qatar card). Pure functions. The USD records are never modified: every converted figure keeps its
// USD reference, the rate and the exact result, so the Founder reviews "USD → rate → exact → rounded → difference" before anything is approved.
import type { Addon, Conversion, FxBasis, Minimum, PriceSpec, RateCardContent, RateCardItem, RateCardSection, RoundingRule, Tier } from "./types";

export const RATE_MAX_AGE_DAYS = 30;                                   // same freshness limit as the governed exchange-rate table (src/lib/commercial/amountDueRules.ts)
export const DEFAULT_ROUNDING: RoundingRule = { kind: "up_to_multiple", multiple: 5 }; // provisional rule, subject to Founder approval

const cents = (n: number) => Math.round(n * 100) / 100;
export function applyRounding(exact: number, rule: RoundingRule): number {
  const m = rule.multiple;
  if (!(m > 0)) throw new Error("The rounding multiple must be above zero.");
  const q = exact / m;
  // guard against binary noise (for example 910.0000000001 must not round up to 915)
  const r = rule.kind === "up_to_multiple" ? Math.ceil(cents(q * 1000) / 1000) : Math.round(q);
  return cents(r * m);
}

export function convertUsd(usd: number, fx: Pick<FxBasis, "rateToUsd" | "rule">): Conversion {
  if (!(usd > 0) || !(fx.rateToUsd > 0)) throw new Error("A conversion needs a positive USD amount and a positive rate.");
  const exact = cents(usd * fx.rateToUsd);
  const rounded = applyRounding(exact, fx.rule);
  return { usdReference: usd, rateToUsd: fx.rateToUsd, exact, rounded, difference: cents(rounded - exact) };
}

const convPrice = (p: PriceSpec, fx: FxBasis): { price: PriceSpec; conversion?: Conversion } => {
  if (p.kind === "on_request") return { price: p };
  const c = convertUsd(p.amount, fx);
  return { price: { ...p, amount: c.rounded }, conversion: c };
};

// Returns a NEW content in the display currency; the input (USD) content is untouched. Throws when the content is already converted.
export function convertContent(usd: RateCardContent, fx: FxBasis): RateCardContent {
  if (usd.meta.currency !== "USD" || usd.meta.fx) throw new Error("Only a USD card can be converted.");
  const conv = <T extends { price: PriceSpec }>(x: T): T & { conversion?: Conversion } => ({ ...x, ...convPrice(x.price, fx) });
  const sections: RateCardSection[] = usd.sections.map((s) => ({
    ...s,
    items: s.items.map((i): RateCardItem => ({ ...conv(i), tiers: i.tiers?.map((t): Tier => conv(t)) })),
    minimum: s.minimum ? (conv(s.minimum) as Minimum) : undefined,
    addons: s.addons?.map((a): Addon => conv(a)),
  }));
  return { ...usd, meta: { ...usd.meta, currency: fx.currency, fx, conversionPolicy: "proposed" }, sections };
}

export type ConversionRow = { where: string; usd: number; rate: number; exact: number; rounded: number; difference: number };
// The review table: every converted price with its USD reference, the rate, the exact result, the proposed rounded price and the difference the rounding causes.
export function conversionReview(c: RateCardContent): ConversionRow[] {
  const rows: ConversionRow[] = [];
  const add = (where: string, cv?: Conversion) => { if (cv) rows.push({ where, usd: cv.usdReference, rate: cv.rateToUsd, exact: cv.exact, rounded: cv.rounded, difference: cv.difference }); };
  for (const s of c.sections) {
    for (const i of s.items) { if (i.included === false) continue; add(`${s.title} — ${i.name}`, i.conversion); i.tiers?.forEach((t) => add(`${s.title} — ${i.name} — ${t.label}`, t.conversion)); }
    if (s.minimum) add(`${s.title} — ${s.minimum.label}`, s.minimum.conversion);
    s.addons?.forEach((a) => { if (a.included !== false) add(`${s.title} — ${a.name}`, a.conversion); });
  }
  return rows;
}

// Checks a converted card is internally honest: the rate and rule are stated, every price is exactly what the rule produces from its USD reference, and the rate is fresh.
export function checkConversions(c: RateCardContent, today: string): string[] {
  const errs: string[] = [];
  const fx = c.meta.fx;
  if (c.meta.currency === "USD") { if (fx) errs.push("A USD card must not carry an exchange rate."); return errs; }
  if (!fx || fx.currency !== c.meta.currency) return [`A ${c.meta.currency} card needs its exchange-rate basis (rate, effective date, source and rounding rule).`];
  if (!(fx.rateToUsd > 0)) errs.push("The exchange rate must be above zero.");
  if (!fx.source.trim()) errs.push("State the source of the exchange rate.");
  const age = Math.floor((Date.parse(today) - Date.parse(fx.effectiveFrom)) / 86_400_000);
  if (!Number.isFinite(age) || age < 0) errs.push("The exchange rate has no valid effective date.");
  else if (age > RATE_MAX_AGE_DAYS) errs.push(`The exchange rate is ${age} days old (the limit is ${RATE_MAX_AGE_DAYS}). Review the governed rate first.`);
  const check = (where: string, price: PriceSpec, cv?: Conversion) => {
    if (price.kind === "on_request") return;
    if (!cv) { errs.push(`${where}: no conversion is recorded for this price.`); return; }
    const want = convertUsd(cv.usdReference, fx);
    if (cv.rateToUsd !== fx.rateToUsd || cv.exact !== want.exact || cv.rounded !== want.rounded || price.amount !== want.rounded) errs.push(`${where}: the price does not match its USD reference, the stated rate and the rounding rule.`);
  };
  for (const s of c.sections) {
    for (const i of s.items) { if (i.included === false) continue; check(`${s.title} — ${i.name}`, i.price, i.conversion); i.tiers?.forEach((t) => check(`${s.title} — ${i.name} — ${t.label}`, t.price, t.conversion)); }
    if (s.minimum) check(`${s.title} — ${s.minimum.label}`, s.minimum.price, s.minimum.conversion);
    s.addons?.forEach((a) => { if (a.included !== false) check(`${s.title} — ${a.name}`, a.price, a.conversion); });
  }
  return errs;
}

// Drift guard: the USD references stored in a card against the CURRENT selling rates. A difference means the card would silently disagree with what quotations now calculate.
export function usdDrift(stored: RateCardContent, current: RateCardContent): string[] {
  const usdOf = (price: PriceSpec, cv?: Conversion): number | null => (price.kind === "on_request" ? null : cv ? cv.usdReference : price.amount);
  const flat = (c: RateCardContent) => {
    const m = new Map<string, number | null>();
    for (const s of c.sections) {
      for (const i of s.items) { m.set(`${s.key}/${i.key}`, usdOf(i.price, i.conversion)); i.tiers?.forEach((t) => m.set(`${s.key}/${i.key}/${t.label}`, usdOf(t.price, t.conversion))); }
      if (s.minimum) m.set(`${s.key}/minimum`, usdOf(s.minimum.price, s.minimum.conversion));
      s.addons?.forEach((a) => m.set(`${s.key}/addon/${a.name}`, usdOf(a.price, a.conversion)));
    }
    return m;
  };
  const a = flat(stored); const b = flat(current); const out: string[] = [];
  for (const [k, v] of a) { if (!b.has(k)) out.push(`${k}: no longer in the selling rates`); else if (b.get(k) !== v) out.push(`${k}: the selling rate is now USD ${b.get(k) ?? "on request"} (the card has USD ${v ?? "on request"})`); }
  return out;
}
