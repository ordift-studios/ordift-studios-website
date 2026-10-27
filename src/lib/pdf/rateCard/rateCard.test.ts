import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { canonicalJson, contentHash, freezeEdition } from "./edition";
import { personalSessionSection, weddingEventSection } from "./mappers";
import { SAMPLE_RATE_CARD } from "./sample";
import { validateRateCard } from "./validate";
import { formatPrice } from "./RateCardDocument";
import { DEFAULT_STRUCTURE, CONNECTED_FAMILIES } from "./structure";
import type { RateCardContent, RateCardItem } from "./types";

const real = (over: Partial<RateCardItem> = {}): RateCardItem => ({ key: "k", name: "Real package", description: "Approved wording.", inclusions: ["Two hours"], price: { kind: "fixed", amount: 120, unit: "per session" }, source: "manual", ...over });
const approvable = (): RateCardContent => ({
  meta: { title: "Rate Card", editionLabel: "2026 Edition 1", effectiveDate: "2026-11-01", marketSlug: "ghana", marketName: "Ghana", currency: "USD", issuingEntity: { jurisdiction: "Ghana", name: "Ordift Studios", checkedOn: "2026-11-01", licensedActivities: ["photography"] } }, coverImage: "/pdf/cover.jpg", cover: { variant: "standard", focusY: 0.5, cleared: true, clearedNote: "Founder's own statement" },
  sections: [{ key: "s", title: "Sessions", structure: "fixed", items: [real()] }], conditions: [{ title: "Validity", text: "Approved text." }], contact: [{ label: "Email", value: "x@example.com" }],
});

describe("rate card types carry no confidential field", () => {
  it("no source file in the rate card builder mentions a cost, margin, vendor or payable field", () => {
    const dir = __dirname; const forbidden = /\b(cost|margin|markup|vendor|payable|profit|supplier_rate|rate_card_items)\b/i;
    for (const f of readdirSync(dir).filter((x) => /\.(ts|tsx)$/.test(x) && !x.endsWith(".test.ts"))) {
      const code = readFileSync(path.join(dir, f), "utf8").split("\n").filter((l) => !l.trim().startsWith("//") && !l.trim().startsWith("*") && !l.trim().startsWith("/*")).join("\n").replace(/\/\/.*$/gm, "");
      expect(code, f).not.toMatch(forbidden);
    }
  });
  it("the loader reads only the existing selling-rate getters", () => {
    const code = readFileSync(path.join(__dirname, "loaders.ts"), "utf8");
    expect([...code.matchAll(/from "([^"]+)"/g)].map((m) => m[1]).sort()).toEqual(["./convert", "./eligibility", "./jurisdictions", "./mappers", "./types", "@/lib/organization/entityRegistrations", "@/lib/pricing/commercialPricing", "@/lib/pricing/corporateHeadshotPricing", "@/lib/pricing/personalSessionPricing", "@/lib/pricing/weddingEventEstimate", "@/lib/pricing/weddingEventPricing", "@/lib/supabase/server"].sort());
    expect(code).not.toMatch(/\.insert\(|\.update\(|\.delete\(|\.upsert\(|\.rpc\(/);               // reads only
    expect([...code.matchAll(/\.from\("([a-z_]+)"\)/g)].map((m) => m[1])).toEqual(["exchange_rates"]);   // the only table it touches directly
    expect(code).not.toMatch(/createAdminClient/);                                                          // exchange_rates is readable by the staff session only (the service role has no grant)
  });
});

describe("mappers: selling prices and factual deliverables only; wording is never invented", () => {
  it("personal sessions: fixed prices, sorted, inclusions from the stored image counts, empty description", () => {
    const sec = personalSessionSection([{ marketId: "m", durationHours: 2, priceUsd: 250, signatureRetouchedImages: 3, professionallyEditedImages: 20 }, { marketId: "m", durationHours: 0.5, priceUsd: 80, signatureRetouchedImages: 0, professionallyEditedImages: 8 }]);
    expect(sec.structure).toBe("fixed");
    expect(sec.items.map((i) => [i.name, (i.price as { amount: number }).amount, i.price.kind])).toEqual([["30-minute session", 80, "fixed"], ["2-hour session", 250, "fixed"]]);
    expect(sec.items[1].inclusions).toEqual(["20 professionally edited images", "3 signature retouched images"]);
    expect(sec.items.every((i) => i.description === "" && i.source === "selling_rates")).toBe(true);
  });
  it("weddings/events: one section per category and mode, prices per tier, inclusions only from stored deliverables", () => {
    const rates = [{ marketId: "m", category: "event" as const, serviceMode: "photography" as const, tierSlug: "full_day", priceUsd: 900 }, { marketId: "m", category: "event" as const, serviceMode: "film" as const, tierSlug: "full_day", priceUsd: 1500 }];
    const d = [{ category: "event" as const, tierSlug: "full_day", serviceMode: "photography" as const, eventDays: 1, coverageHours: 4, photographers: 1, filmmakers: 0, professionallyEditedImagesMin: 80, signatureRetouchedImages: 5, highlightFilmMinMinutes: null, highlightFilmMaxMinutes: null, includesDocumentary: false, onlineGallery: true, planningConsultation: false, prioritySneakPeek: false }];
    const sec = weddingEventSection("event", "photography", rates, d);
    expect(sec.title).toBe("Events — Photography"); expect(sec.items).toHaveLength(1);
    expect(sec.items[0].inclusions).toEqual(["4 hours of coverage", "1 photographer", "80+ professionally edited images", "5 signature retouched images", "Online gallery"]);
    expect(sec.items[0].price).toEqual({ kind: "fixed", amount: 900, unit: "per booking" });
    expect(weddingEventSection("event", "film", rates, d).items[0].inclusions).toEqual([]);   // no deliverable row for that mode → nothing invented
  });
  it("structure defaults: packages are fixed, variable services start-from; two families connected so far", () => {
    expect(DEFAULT_STRUCTURE.weddings_events).toBe("fixed"); expect(DEFAULT_STRUCTURE.commercial).toBe("from"); expect(CONNECTED_FAMILIES).toEqual(["personal_sessions", "weddings_events"]);
  });
});

describe("price display", () => {
  it("fixed, starting and on-request prices", () => {
    expect(formatPrice({ kind: "fixed", amount: 1234.5, unit: "per session" }, "USD")).toEqual({ prefix: "", amount: "USD 1,234.50", unit: "per session" });
    expect(formatPrice({ kind: "from", amount: 800 }, "GHS")).toEqual({ prefix: "From", amount: "GHS 800", unit: "" });
    expect(formatPrice({ kind: "on_request" }, "USD").amount).toBe("On request");
  });
});

describe("validation: a draft only has to render; approval needs approved, non-placeholder content", () => {
  it("the placeholder sample previews as a draft but can never be approved", () => {
    expect(validateRateCard(SAMPLE_RATE_CARD, "draft").errors).toEqual([]);
    const a = validateRateCard(SAMPLE_RATE_CARD, "approval");
    expect(a.errors.some((e) => /placeholder content/.test(e))).toBe(true);
    expect(a.errors.some((e) => /cover image/.test(e))).toBe(true);
  });
  it("selling-rate items with no wording yet: warning in draft, error at approval", () => {
    const c = approvable(); c.sections[0].items = [real({ description: "", source: "selling_rates" })];
    expect(validateRateCard(c, "draft").warnings.join()).toMatch(/no approved service description/); expect(validateRateCard(c, "draft").errors).toEqual([]);
    expect(validateRateCard(c, "approval").errors.join()).toMatch(/no approved service description/);
  });
  it("price rules: above zero, two decimals, structure respected", () => {
    const c = approvable(); c.sections[0].items = [real({ price: { kind: "fixed", amount: 0 } }), real({ key: "b", name: "B", price: { kind: "fixed", amount: 10.005 } }), real({ key: "c", name: "C", price: { kind: "from", amount: 50 } })];
    const e = validateRateCard(c, "draft").errors.join("|");
    expect(e).toMatch(/above zero/); expect(e).toMatch(/at most two decimals/); expect(e).toMatch(/fixed-price category, so a starting price is not allowed/);
  });
  it("approval requires conditions, contact details and a cover image; a complete real card passes", () => {
    expect(validateRateCard(approvable(), "approval").errors).toEqual([]);
    const c = approvable(); c.conditions = []; c.contact = []; c.coverImage = "";
    expect(validateRateCard(c, "approval").errors).toHaveLength(3);
    const d = approvable(); d.meta.issuingEntity = undefined;
    expect(validateRateCard(d, "approval").errors.join()).toMatch(/which legal entity offers these prices/);
  });
  it("meta fields are required and the currency is a 3-letter code", () => {
    const c = approvable(); c.meta = { ...c.meta, title: "", currency: "usd", effectiveDate: "1/11/2026" };
    const e = validateRateCard(c, "draft").errors.join("|");
    expect(e).toMatch(/rate card title/); expect(e).toMatch(/three-letter code/); expect(e).toMatch(/YYYY-MM-DD/);
  });
});

describe("frozen edition (design): a detached, hash-verified snapshot", () => {
  it("refuses unapprovable content and freezes approvable content with a SHA-256 of its canonical JSON", async () => {
    const bad = await freezeEdition(SAMPLE_RATE_CARD, { id: "u", name: "F" }, new Date("2026-11-01T00:00:00Z"), "E1"); expect(bad.ok).toBe(false);
    const draft = approvable(); const r = await freezeEdition(draft, { id: "u", name: "Founder" }, new Date("2026-11-01T00:00:00Z"), "E1");
    expect(r.ok).toBe(true); if (!r.ok) return;
    expect(r.edition.status).toMatchObject({ state: "approved", editionId: "E1", approvedBy: "Founder", approvedAt: "2026-11-01T00:00:00.000Z" });
    expect(r.edition.status.contentHash).toMatch(/^[0-9a-f]{64}$/); expect(await contentHash(r.edition.content)).toBe(r.edition.status.contentHash);
    draft.sections[0].items[0].price = { kind: "fixed", amount: 999 };                       // editing the draft afterwards must not reach the frozen copy
    expect((r.edition.content.sections[0].items[0].price as { amount: number }).amount).toBe(120);
    expect(await contentHash(draft)).not.toBe(r.edition.status.contentHash);
  });
  it("canonical JSON ignores key order", () => { expect(canonicalJson({ b: 1, a: [2, { d: 1, c: 2 }] })).toBe(canonicalJson({ a: [2, { c: 2, d: 1 }], b: 1 })); });
});
