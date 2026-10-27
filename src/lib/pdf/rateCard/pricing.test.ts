import { describe, expect, it } from "vitest";
import { applyRounding, checkConversions, convertContent, convertUsd, conversionReview, DEFAULT_ROUNDING, usdDrift } from "./convert";
import { applyEligibility, excludedByEligibility } from "./eligibility";
import { commercialSection, corporateSection } from "./mappers";
import { PLACEHOLDER_MARK, type FxBasis, type RateCardContent } from "./types";
import { unknownKeys, validateRateCard } from "./validate";

const fx: FxBasis = { currency: "QAR", rateToUsd: 3.64, effectiveFrom: "2026-10-11", source: "Governed exchange-rate table", rule: DEFAULT_ROUNDING };
const usdCard = (): RateCardContent => ({
  meta: { title: "Rate Card", editionLabel: "E1", effectiveDate: "2026-10-27", marketSlug: "qatar", marketName: "Qatar / GCC", currency: "USD", conversionPolicy: "none" }, coverImage: "/pdf/c.jpg", cover: { variant: "standard", focusY: 0.5, cleared: true, clearedNote: "Founder's own statement" },
  sections: [
    { key: "ps", title: "Personal sessions", structure: "fixed", items: [{ key: "a", name: "1-hour session", description: "Approved.", inclusions: [], price: { kind: "fixed", amount: 150, unit: "per session" }, source: "selling_rates", activities: ["photography"] }, { key: "b", name: "Film package", description: "Approved.", inclusions: [], price: { kind: "fixed", amount: 400 }, source: "selling_rates", activities: ["videography"] }, { key: "c", name: "Custom", description: "Approved.", inclusions: [], price: { kind: "on_request" }, source: "manual" }] },
    { key: "co", title: "Corporate", structure: "mixed", items: [{ key: "t", name: "Team", description: "Approved.", inclusions: [], price: { kind: "from", amount: 65, unit: "per person" }, tiers: [{ label: "2–5", price: { kind: "fixed", amount: 125 } }], source: "selling_rates", activities: ["photography"] }], minimum: { label: "Minimum booking", price: { kind: "fixed", amount: 400 } }, addons: [{ name: "Extra image", price: { kind: "fixed", amount: 25 }, activities: ["photography"] }] },
  ],
  conditions: [{ title: "T", text: "Approved." }], contact: [{ label: "Email", value: "x@example.com" }],
});

describe("rounding upward to the next QAR 5 (provisional rule) and the conversion record", () => {
  it.each([[546, 550], [910, 910], [1237.6, 1240], [1547, 1550], [0.4, 5], [910.0000000001, 910], [912, 915]])("rounds %s up to %s", (exact, want) => expect(applyRounding(exact, { kind: "up_to_multiple", multiple: 5 })).toBe(want));
  it("nearest-multiple rule is available for comparison", () => { expect(applyRounding(1237.6, { kind: "nearest_multiple", multiple: 5 })).toBe(1240); expect(applyRounding(1236, { kind: "nearest_multiple", multiple: 5 })).toBe(1235); });
  it("keeps the USD reference, rate, exact result and the rounding difference; never rounds below the exact figure under the upward rule", () => {
    const c = convertUsd(340, fx); expect(c).toEqual({ usdReference: 340, rateToUsd: 3.64, exact: 1237.6, rounded: 1240, difference: 2.4 });
    for (const usd of [25, 55, 125, 150, 175, 205, 250, 340, 425, 3000]) expect(convertUsd(usd, fx).rounded).toBeGreaterThanOrEqual(convertUsd(usd, fx).exact);
  });
  it("refuses a non-positive amount, rate or multiple", () => { expect(() => convertUsd(0, fx)).toThrow(); expect(() => convertUsd(10, { ...fx, rateToUsd: 0 })).toThrow(); expect(() => applyRounding(10, { kind: "up_to_multiple", multiple: 0 })).toThrow(); });
});

describe("converting a card: USD base is preserved, every price is reviewable", () => {
  it("produces a NEW card and leaves the USD card untouched", () => {
    const usd = usdCard(); const before = JSON.stringify(usd); const q = convertContent(usd, fx);
    expect(JSON.stringify(usd)).toBe(before);
    expect(q.meta).toMatchObject({ currency: "QAR", conversionPolicy: "proposed", fx });
    expect(q.sections[0].items[0]).toMatchObject({ price: { kind: "fixed", amount: 550, unit: "per session" }, conversion: { usdReference: 150, exact: 546, rounded: 550, difference: 4 } });
    expect(q.sections[0].items[2].price).toEqual({ kind: "on_request" }); expect(q.sections[0].items[2].conversion).toBeUndefined();
    expect(q.sections[1].items[0].tiers![0]).toMatchObject({ price: { amount: 455 }, conversion: { usdReference: 125, exact: 455, rounded: 455 } });
    expect(q.sections[1].minimum).toMatchObject({ price: { amount: 1460 }, conversion: { usdReference: 400 } }); expect(q.sections[1].addons![0]).toMatchObject({ price: { amount: 95 }, conversion: { usdReference: 25, exact: 91, rounded: 95 } });
    expect(() => convertContent(q, fx)).toThrow(/Only a USD card/);
  });
  it("the review table lists every converted price with USD, rate, exact, rounded and difference — excluded items are not listed", () => {
    const q = applyEligibility(convertContent(usdCard(), fx), { jurisdiction: "Qatar", entityName: "Qatar", checkedOn: "2026-10-27", keys: ["photography"] });
    const rows = conversionReview(q);
    expect(rows.map((r) => r.where)).toEqual(["Personal sessions — 1-hour session", "Corporate — Team", "Corporate — Team — 2–5", "Corporate — Minimum booking", "Corporate — Extra image"]);
    expect(rows[0]).toEqual({ where: "Personal sessions — 1-hour session", usd: 150, rate: 3.64, exact: 546, rounded: 550, difference: 4 });
  });
  it("detects a price that no longer matches its USD reference, rate and rule; a stale rate; a missing source; a missing basis", () => {
    const q = convertContent(usdCard(), fx);
    expect(checkConversions(q, "2026-10-27")).toEqual([]);
    const t = structuredClone(q); (t.sections[0].items[0].price as { amount: number }).amount = 540;
    expect(checkConversions(t, "2026-10-27").join()).toMatch(/does not match its USD reference/);
    expect(checkConversions(q, "2026-12-01").join()).toMatch(/days old/);
    const s = structuredClone(q); s.meta.fx!.source = " "; expect(checkConversions(s, "2026-10-27").join()).toMatch(/source of the exchange rate/);
    const n = structuredClone(q); n.meta.fx = undefined; expect(checkConversions(n, "2026-10-27").join()).toMatch(/needs its exchange-rate basis/);
  });
  it("drift guard: a card whose USD references differ from the CURRENT selling rates is reported, so it cannot silently disagree with quotations", () => {
    const stored = convertContent(usdCard(), fx); const now = usdCard(); (now.sections[0].items[0].price as { amount: number }).amount = 160;
    expect(usdDrift(stored, usdCard())).toEqual([]);
    expect(usdDrift(stored, now)).toEqual(["ps/a: the selling rate is now USD 160 (the card has USD 150)"]);
    now.sections[0].items.shift(); expect(usdDrift(stored, now).join()).toMatch(/no longer in the selling rates/);
  });
});

describe("publication eligibility for the issuing entity", () => {
  const lic = { jurisdiction: "Qatar", entityName: "ORDIFT STUDIOS (Qatar W.L.L.)", checkedOn: "2026-10-27", keys: ["photography"] };
  it("keeps photography, leaves videography out of the PDF with the reason, records who was checked and when; never re-enables an item", () => {
    const c = applyEligibility(usdCard(), lic);
    expect(c.sections[0].items.map((i) => [i.key, i.included, i.eligibility?.ok])).toEqual([["a", undefined, true], ["b", false, false], ["c", undefined, true]]);
    expect(excludedByEligibility(c)).toEqual(["Personal sessions — Film package: ORDIFT STUDIOS (Qatar W.L.L.) is not currently licensed for: videography."]);
    expect(c.meta.issuingEntity).toEqual({ jurisdiction: "Qatar", name: lic.entityName, checkedOn: "2026-10-27", licensedActivities: ["photography"] });
    const again = applyEligibility(c, { ...lic, keys: ["photography", "videography"] }); expect(again.sections[0].items[1].included).toBe(false);   // a left-out item stays out until a person turns it on
  });
  it("a combined photography + film service needs BOTH activities; an unclassified service is never eligible", () => {
    const c = usdCard(); c.sections[0].items[0].activities = ["photography", "videography"]; c.sections[0].items[2].activities = ["unclassified"];
    const r = applyEligibility(c, lic).sections[0].items; expect(r[0].eligibility?.ok).toBe(false); expect(r[2].eligibility).toEqual({ ok: false, reason: "The activity this service falls under has not been classified yet." });
  });
});

describe("corporate headshots and commercial mappers (selling prices only)", () => {
  it("corporate: fixed per-person products, a starting price for team bookings with its bands, the minimum booking and the add-ons", () => {
    const s = corporateSection([{ marketId: "m", productSlug: "executive_portrait", priceUsd: 300, signatureRetouchedImages: 5 }, { marketId: "m", productSlug: "individual_headshot", priceUsd: 175, signatureRetouchedImages: 2 }],
      [{ marketId: "m", tierSlug: "26-50", minPeople: 26, maxPeople: 50, pricePerPersonUsd: 65 }, { marketId: "m", tierSlug: "2-5", minPeople: 2, maxPeople: 5, pricePerPersonUsd: 125 }], 400, 25, { individual_headshot: 40, team_2_5: 30 });
    expect(s.items.map((i) => [i.name, i.price.kind, (i.price as { amount: number }).amount])).toEqual([["Individual headshot", "fixed", 175], ["Executive portrait", "fixed", 300], ["Team headshots", "from", 65]]);
    expect(s.items[2].tiers!.map((t) => t.label)).toEqual(["2–5 people", "26–50 people"]);
    expect(s.minimum).toEqual({ label: "Minimum booking", price: { kind: "fixed", amount: 400 } });
    expect(s.addons!.map((a) => a.name)).toEqual(["Additional retouched image", "Priority delivery"]); expect(s.addons![1].price.kind).toBe("on_request"); expect(s.addons![1].note).toMatch(/40% for an individual headshot; 30% for a team of 2–5/);
    expect(s.items.every((i) => i.source === "selling_rates" && i.activities?.[0] === "photography" && i.description === "")).toBe(true);
  });
  it("commercial: starting prices per scope and mode, catalogue per image with the minimum, post-production add-ons with the data's own 'from' flags and an explicit activity classification", () => {
    const s = commercialSection([{ marketId: "m", serviceMode: "film", scopeSlug: "focused", priceUsd: 1200 }, { marketId: "m", serviceMode: "photography", scopeSlug: "full_day", priceUsd: 1600 }, { marketId: "m", serviceMode: "photography", scopeSlug: "focused", priceUsd: 900 }], 55, 500,
      [{ itemSlug: "advanced_retouch", priceUsd: 60, isFromPrice: false }, { itemSlug: "creative_composite", priceUsd: 150, isFromPrice: true }, { itemSlug: "cutdown_15s", priceUsd: 150, isFromPrice: false }, { itemSlug: "revision_round", priceUsd: 150, isFromPrice: false }]);
    expect(s.structure).toBe("from"); expect(s.items.every((i) => i.price.kind === "from")).toBe(true);
    expect(s.items.map((i) => i.name)).toEqual(["Focused production — film", "Focused production — photography", "Full day production — photography", "Product and catalogue photography"]);
    expect(s.items[3].price).toEqual({ kind: "from", amount: 55, unit: "per image" }); expect(s.minimum?.price).toEqual({ kind: "fixed", amount: 500 });
    expect(s.addons!.map((a) => [a.name, a.price.kind, a.activities?.[0]])).toEqual([["Advanced retouch", "fixed", "photography"], ["Creative composite", "from", "photography"], ["15-second cutdown", "fixed", "videography"], ["Revision round", "fixed", "unclassified"]]);
  });
});

describe("validation: currency, placeholders, eligibility and the allowed-fields guard", () => {
  const okQar = () => applyEligibility(convertContent(usdCard(), fx), { jurisdiction: "Qatar", entityName: "Qatar", checkedOn: "2026-10-27", keys: ["photography"] });
  it("a QAR card previews as a draft but can never be approved for clients while the currency policy is unapproved — even if it says 'approved'", () => {
    const q = okQar(); expect(validateRateCard(q, "draft", { today: "2026-10-27" }).errors).toEqual([]);
    expect(validateRateCard(q, "approval", { today: "2026-10-27", currencyPolicyApproved: false }).errors.join()).toMatch(/stay proposed \/ indicative until the Founder approves the quotation and payment currency policy/);
    q.meta.conversionPolicy = "approved"; expect(validateRateCard(q, "approval", { today: "2026-10-27", currencyPolicyApproved: false }).errors.join()).toMatch(/cannot be approved for clients yet/);
    expect(validateRateCard(q, "approval", { today: "2026-10-27", currencyPolicyApproved: true }).errors).toEqual([]);
  });
  it("a stale rate is a warning in draft and an error at approval", () => {
    const q = okQar(); q.meta.conversionPolicy = "approved";
    expect(validateRateCard(q, "draft", { today: "2026-12-30" }).warnings.join()).toMatch(/days old/); expect(validateRateCard(q, "draft", { today: "2026-12-30" }).errors).toEqual([]);
    expect(validateRateCard(q, "approval", { today: "2026-12-30", currencyPolicyApproved: true }).errors.join()).toMatch(/days old/);
  });
  it("placeholder markers anywhere in the text block approval but not drafts", () => {
    const c = applyEligibility(usdCard(), { jurisdiction: "Qatar", entityName: "Q", checkedOn: "2026-10-27", keys: ["photography", "videography"] }); c.conditions[0].text = `${PLACEHOLDER_MARK} to be supplied`;
    expect(validateRateCard(c, "draft").errors).toEqual([]); expect(validateRateCard(c, "draft").warnings.join()).toMatch(/placeholder wording/); expect(validateRateCard(c, "approval").errors.join()).toMatch(/1 text field\(s\) still contain placeholder wording/);
  });
  it("an included item the entity is not licensed for blocks approval; excluding it clears the block; an all-excluded card is refused", () => {
    const c = usdCard(); c.meta.issuingEntity = { jurisdiction: "Qatar", name: "Q", checkedOn: "2026-10-27", licensedActivities: ["photography"] }; c.sections[0].items[1].eligibility = { ok: false, reason: "not licensed" };
    expect(validateRateCard(c, "approval").errors.join()).toMatch(/not eligible for publication/);
    c.sections[0].items[1].included = false; expect(validateRateCard(c, "approval").errors).toEqual([]);
    c.sections.forEach((s) => s.items.forEach((i) => { i.included = false; })); expect(validateRateCard(c, "draft").errors.join()).toMatch(/nothing to publish/);
  });
  it("unknown fields — a cost, margin, supplier rate or internal allocation hidden in the JSON — are rejected, wherever they sit", () => {
    const c = usdCard() as unknown as Record<string, unknown>;
    expect(unknownKeys(c as never)).toEqual([]);
    (c.sections as { items: Record<string, unknown>[] }[])[0].items[0].costUsd = 40; ((c.sections as { minimum?: Record<string, unknown> }[])[1].minimum as Record<string, unknown>).marginPercent = 30; (c.meta as Record<string, unknown>).supplierRate = 5;
    ((c.sections as { items: { price: Record<string, unknown> }[] }[])[0].items[0].price).internalAllocation = 1;
    expect(unknownKeys(c as never)).toEqual(expect.arrayContaining(["meta.supplierRate", "sections[0].items[0].costUsd", "sections[0].items[0].price.internalAllocation", "sections[1].minimum.marginPercent"]));
    expect(validateRateCard(c as never, "draft").errors.join()).toMatch(/fields that a rate card may not carry/);
  });
});
