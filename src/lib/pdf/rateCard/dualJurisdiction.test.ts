import { describe, expect, it } from "vitest";
import { convertContent, conversionReview, convertUsd } from "./convert";
import { applyEligibility, excludedByEligibility, resolveLicensed } from "./eligibility";
import { ISSUING_RULES, checkBinding, currencyOptionsFor, roundingFor } from "./jurisdictions";
import { commercialSection, corporateSection, personalSessionSection, weddingEventSection } from "./mappers";
import { type FxBasis, PLACEHOLDER_MARK, type RateCardContent } from "./types";
import { unknownKeys, validateRateCard } from "./validate";

// SYNTHETIC selling rows only (the repository is public: no real price is stored in a test).
const sections = () => {
  const tier = (mode: "photography" | "film" | "photography_film") => [{ marketId: "m", category: "event" as const, serviceMode: mode, tierSlug: "full_day", priceUsd: 500 }];
  const del = (mode: "photography" | "film" | "photography_film") => [{ category: "event" as const, tierSlug: "full_day", serviceMode: mode, eventDays: 1, coverageHours: 4, photographers: 1, filmmakers: mode === "photography" ? 0 : 1, professionallyEditedImagesMin: 50, signatureRetouchedImages: 5, highlightFilmMinMinutes: null, highlightFilmMaxMinutes: null, includesDocumentary: false, onlineGallery: true, planningConsultation: false, prioritySneakPeek: false }];
  return [
    personalSessionSection([{ marketId: "m", durationHours: 1, priceUsd: 125, signatureRetouchedImages: 5, professionallyEditedImages: 10 }, { marketId: "m", durationHours: 2, priceUsd: 25, signatureRetouchedImages: 8, professionallyEditedImages: 15 }]),
    ...(["photography", "film", "photography_film"] as const).map((m) => weddingEventSection("event", m, tier(m), del(m))),
    corporateSection([{ marketId: "m", productSlug: "individual_headshot", priceUsd: 100, signatureRetouchedImages: 2 }], [{ marketId: "m", tierSlug: "2-5", minPeople: 2, maxPeople: 5, pricePerPersonUsd: 75 }], 250, 25, { individual_headshot: 40 }),
    commercialSection([{ marketId: "m", serviceMode: "photography", scopeSlug: "focused", priceUsd: 600 }], 55, 500, [{ itemSlug: "advanced_retouch", priceUsd: 60, isFromPrice: false }, { itemSlug: "cutdown_15s", priceUsd: 150, isFromPrice: false }, { itemSlug: "revision_round", priceUsd: 150, isFromPrice: true }]),
  ];
};
const GHS_FX: FxBasis = { currency: "GHS", rateToUsd: 11.0898, effectiveFrom: "2026-08-14", source: "BoG official interbank mid-rate (synthetic note)", rule: roundingFor("ghana", "GHS") ? { kind: "up_to_multiple", multiple: 10 } : { kind: "up_to_multiple", multiple: 10 } };
const QAR_FX: FxBasis = { currency: "QAR", rateToUsd: 3.64, effectiveFrom: "2026-10-11", source: "Governed rate (synthetic note)", rule: { kind: "up_to_multiple", multiple: 5 } };

// mirrors buildDraftFromSellingRates' pure steps for a (market, entity, currency) combination
function build(market: "qatar" | "ghana", currency: string, verifiedKeys: string[], today = "2026-10-28"): RateCardContent {
  const rule = ISSUING_RULES[market];
  let c: RateCardContent = { meta: { title: "Rate Card", editionLabel: "Draft", effectiveDate: today, marketSlug: market, marketName: market === "qatar" ? "Qatar / GCC" : "Ghana / West Africa", currency: "USD", conversionPolicy: "none" }, coverImage: "/pdf/cover-placeholder.jpg", sections: sections(),
    conditions: [{ title: "Prices", text: `${PLACEHOLDER_MARK} wording` }], contact: [{ label: "Website", value: "ordiftstudios.com" }] };
  c = applyEligibility(c, resolveLicensed(market, rule.jurisdiction, `Ordift Studios ${rule.jurisdiction}`, today, "ent-1", verifiedKeys));
  if (currency !== "USD") c = convertContent(c, currency === "GHS" ? GHS_FX : QAR_FX);
  return c;
}
const QATAR_KEYS = ["photography"]; const GHANA_KEYS: string[] = [];   // Ghana's entity record lists no activity states (verified read-only); Qatar's lists photography
const kinds = (c: RateCardContent) => new Set(c.sections.flatMap((s) => [...s.items.map((i) => i.price.kind), ...(s.addons ?? []).map((a) => a.price.kind)]));

describe("the four valid combinations", () => {
  const combos: [string, "qatar" | "ghana", string, string[]][] = [["Qatar / Qatar entity / USD", "qatar", "USD", QATAR_KEYS], ["Qatar / Qatar entity / QAR", "qatar", "QAR", QATAR_KEYS], ["Ghana / Ghana entity / USD", "ghana", "USD", GHANA_KEYS], ["Ghana / Ghana entity / GHS", "ghana", "GHS", GHANA_KEYS]];
  it.each(combos)("%s: consistent identity and currency, renders as a draft, fixed + starting + on-request prices, no confidential fields", (_n, market, currency, keys) => {
    const c = build(market, currency, keys);
    expect(c.meta).toMatchObject({ marketSlug: market, currency, issuingEntity: { jurisdiction: ISSUING_RULES[market].jurisdiction, name: `Ordift Studios ${ISSUING_RULES[market].jurisdiction}` } });
    expect(c.meta.fx?.currency).toBe(currency === "USD" ? undefined : currency); expect(c.meta.conversionPolicy).toBe(currency === "USD" ? "none" : "proposed");
    expect(validateRateCard(c, "draft", { today: "2026-10-28" }).errors).toEqual([]);
    expect(kinds(c).has("fixed") && kinds(c).has("from")).toBe(true); expect(unknownKeys(c)).toEqual([]);
    expect(JSON.stringify(c)).not.toMatch(/cost|margin|supplier|vendor|payable/i);
  });
  it("licensed-activity eligibility differs by entity: Qatar offers photography only; Ghana adds videography on the approved guidance and says so; unclassified and drone stay out", () => {
    const q = build("qatar", "USD", QATAR_KEYS); const g = build("ghana", "USD", GHANA_KEYS);
    const filmQ = q.sections.filter((s) => /film/i.test(s.title)).flatMap((s) => s.items); expect(filmQ.length).toBeGreaterThan(0); expect(filmQ.every((i) => i.included === false)).toBe(true);
    const filmG = g.sections.filter((s) => /film/i.test(s.title)).flatMap((s) => s.items); expect(filmG.every((i) => i.included !== false)).toBe(true);
    expect(g.meta.issuingEntity?.licensedActivities).toEqual(["photography", "videography"]); expect(g.meta.issuingEntity?.basis).toMatch(/approved Ghana guidance/); expect(q.meta.issuingEntity?.basis).toBeUndefined();
    for (const c of [q, g]) expect(excludedByEligibility(c).join()).toMatch(/has not been classified yet|not currently licensed/);                       // the unclassified revision round is out in both
    expect(validateRateCard(g, "draft").warnings.join()).toMatch(/Licensed activities rest on: approved Ghana guidance/);
  });
});

describe("local-currency conversion: USD stays the base; Ghana's rounding is its own proposal", () => {
  it("GHS rounds UP to the next GHS 10 (proposed); QAR keeps the next QAR 5; a rule exists only for the market's own currency", () => {
    expect(roundingFor("ghana", "GHS")).toEqual({ kind: "up_to_multiple", multiple: 10 }); expect(roundingFor("qatar", "QAR")).toEqual({ kind: "up_to_multiple", multiple: 5 });
    expect(roundingFor("qatar", "GHS")).toBeNull(); expect(roundingFor("ghana", "QAR")).toBeNull(); expect(ISSUING_RULES.ghana.roundingStatus).toBe("proposed");
    expect(convertUsd(125, GHS_FX)).toEqual({ usdReference: 125, rateToUsd: 11.0898, exact: 1386.23, rounded: 1390, difference: 3.77 });
    expect(convertUsd(25, GHS_FX)).toMatchObject({ exact: 277.25, rounded: 280, difference: 2.75 });
    expect(convertUsd(125, QAR_FX)).toMatchObject({ exact: 455, rounded: 455 });
  });
  it("every converted price keeps USD reference, rate, exact, rounded and difference; the USD card is untouched", () => {
    const usd = build("ghana", "USD", GHANA_KEYS); const before = JSON.stringify(usd); const g = convertContent(usd, GHS_FX);
    expect(JSON.stringify(usd)).toBe(before);
    const rows = conversionReview(g); expect(rows.length).toBeGreaterThan(10);
    for (const r of rows) { expect(r.rate).toBe(11.0898); expect(r.rounded).toBeGreaterThanOrEqual(r.exact); expect(r.rounded % 10).toBe(0); expect(Math.round((r.rounded - r.exact) * 100) / 100).toBe(r.difference); }
  });
  it("the stale Ghana rate (74 days old, limit 30) is a loud draft warning and an approval error; a missing source is refused; it is never replaced silently", () => {
    const g = build("ghana", "GHS", GHANA_KEYS, "2026-10-27");
    const draft = validateRateCard(g, "draft", { today: "2026-10-27" }); expect(draft.errors).toEqual([]); expect(draft.warnings.join()).toMatch(/74 days old \(the limit is 30\)/);
    expect(validateRateCard(g, "approval", { today: "2026-10-27", currencyPolicyApproved: true }).errors.join()).toMatch(/74 days old/);
    const noSource = structuredClone(g); noSource.meta.fx!.source = ""; expect(validateRateCard(noSource, "draft", { today: "2026-10-27" }).errors.join()).toMatch(/source of the exchange rate/);
    expect(g.meta.fx).toMatchObject({ rateToUsd: 11.0898, effectiveFrom: "2026-08-14" });
  });
  it("neither local-currency card can be approved while the currency policy is unapproved, even with a fresh rate", () => {
    for (const [m, cur] of [["qatar", "QAR"], ["ghana", "GHS"]] as const) {
      const c = build(m, cur, m === "qatar" ? QATAR_KEYS : GHANA_KEYS, "2026-10-28"); c.meta.fx!.effectiveFrom = "2026-10-20"; c.meta.conversionPolicy = "approved";
      for (const it of c.sections.flatMap((s) => s.items)) { it.description = "Approved."; it.source = "manual"; }
      c.conditions = [{ title: "T", text: "Approved." }]; c.contact = [{ label: "E", value: "x@example.com" }];
      expect(validateRateCard(c, "approval", { today: "2026-10-28", currencyPolicyApproved: false }).errors.join()).toMatch(/cannot be approved for clients yet/);
    }
  });
});

describe("mismatched combinations are refused, never silently issued", () => {
  it.each([
    [{ marketSlug: "ghana", currency: "QAR", hasEntity: false }, /cannot be used for the ghana market: choose USD or GHS/],
    [{ marketSlug: "qatar", currency: "GHS", hasEntity: false }, /cannot be used for the qatar market: choose USD or QAR/],
    [{ marketSlug: "uk_western_europe", currency: "GHS", hasEntity: false }, /Only USD base prices are available/],
    [{ marketSlug: "uk_western_europe", currency: "USD", hasEntity: true, entityJurisdiction: "Ghana" }, /No issuing entity is bound/],
    [{ marketSlug: "ghana", currency: "USD", hasEntity: true, entityJurisdiction: "Qatar" }, /must be issued by the Ghana entity, not the Qatar entity/],
    [{ marketSlug: "qatar", currency: "QAR", hasEntity: true, entityJurisdiction: "Ghana" }, /must be issued by the Qatar entity, not the Ghana entity/],
  ])("%j", (p, msg) => expect(checkBinding(p).join()).toMatch(msg));
  it("agreeing combinations produce no binding error; the currency choices per market are as specified", () => {
    expect(checkBinding({ marketSlug: "ghana", currency: "GHS", hasEntity: true, entityJurisdiction: "Ghana" })).toEqual([]); expect(checkBinding({ marketSlug: "qatar", currency: "QAR", hasEntity: true, entityJurisdiction: "Qatar" })).toEqual([]);
    expect(currencyOptionsFor("qatar")).toEqual(["USD", "QAR"]); expect(currencyOptionsFor("ghana")).toEqual(["USD", "GHS"]); expect(currencyOptionsFor("north_america")).toEqual(["USD"]);
  });
  it("the validator catches a card whose market, entity or currency disagree — wherever the content came from", () => {
    const wrongEntity = build("ghana", "USD", GHANA_KEYS); wrongEntity.meta.issuingEntity!.jurisdiction = "Qatar";
    expect(validateRateCard(wrongEntity, "draft").errors.join()).toMatch(/must be issued by the Ghana entity/);
    const wrongCurrency = build("qatar", "QAR", QATAR_KEYS); wrongCurrency.meta.marketSlug = "ghana"; wrongCurrency.meta.issuingEntity!.jurisdiction = "Ghana";
    expect(validateRateCard(wrongCurrency, "draft", { today: "2026-10-28" }).errors.join()).toMatch(/QAR cannot be used for the ghana market/);
  });
});
