import { describe, expect, it } from "vitest";
import { commercialSection, corporateSection, personalSessionSection, weddingEventSection } from "./mappers";
import { formatPrice, minimumStatedInItem, statesBaseRate } from "./RateCardDocument";
import { syntheticDraft } from "./content/testDraft";
import { checkConversions, convertContent } from "./convert";

const find = (key: string) => syntheticDraft().sections.flatMap((s) => s.items).find((i) => i.key === key)!;

describe("signature retouching: one inclusive statement, counts unchanged", () => {
  const sec = (edited: number, sig: number) => personalSessionSection([{ marketId: "m", durationHours: 1, priceUsd: 1, professionallyEditedImages: edited, signatureRetouchedImages: sig }]).items[0].inclusions;
  it("the approved form", () => { expect(sec(150, 10)).toEqual(["150 professionally edited images, including 10 signature retouched images"]); });
  it("singular, edited only, signature only", () => {
    expect(sec(1, 1)).toEqual(["1 professionally edited image, including 1 signature retouched image"]); expect(sec(12, 0)).toEqual(["12 professionally edited images"]); expect(sec(0, 3)).toEqual(["3 signature retouched images"]);
  });
  it("never says 'including' when the signature count exceeds the edited count — both are then listed as recorded", () => { expect(sec(5, 8)).toEqual(["5 professionally edited images", "8 signature retouched images"]); });
  it("weddings and events: '150+ professionally edited images, including 10 signature retouched images'", () => {
    const d = [{ category: "wedding" as const, tierSlug: "chapter", serviceMode: "photography" as const, eventDays: 1, coverageHours: 4, photographers: 1, filmmakers: 0, professionallyEditedImagesMin: 150, signatureRetouchedImages: 10, highlightFilmMinMinutes: null, highlightFilmMaxMinutes: null, includesDocumentary: false, onlineGallery: false, planningConsultation: false, prioritySneakPeek: false }];
    const r = [{ marketId: "m", category: "wedding" as const, serviceMode: "photography" as const, tierSlug: "chapter", priceUsd: 1 }];
    expect(weddingEventSection("wedding", "photography", r, d).items[0].inclusions).toContain("150+ professionally edited images, including 10 signature retouched images");
  });
  it("across all 47 packages no separate 'signature retouched' line sits beside an edited-image line", () => {
    for (const s of syntheticDraft().sections) for (const i of s.items) { const edited = i.inclusions.filter((x) => /professionally edited image/.test(x)); if (edited.length) expect(i.inclusions.filter((x) => /^\d+ signature retouched/.test(x)), i.key).toEqual([]); }
  });
});

describe("event coverage hours are shown prominently; names and keys are kept", () => {
  it("Half Day = 2 hours and Full Day = 4 hours, as a specification line, once", () => {
    const half = find("event-photography-half_day"); const full = find("event-photography-full_day");
    expect(half.name).toBe("Half Day"); expect(half.specs).toEqual(["2 hours of coverage"]); expect(full.name).toBe("Full Day"); expect(full.specs).toEqual(["4 hours of coverage"]);
    for (const i of [half, full]) expect(i.inclusions.some((x) => /of coverage/.test(x))).toBe(false);
  });
  it("every event package has a coverage specification; weddings are unchanged (coverage stays in the inclusions)", () => {
    for (const s of syntheticDraft().sections) for (const i of s.items) {
      if (i.key.startsWith("event-")) expect(i.specs?.[0], i.key).toMatch(/hours? of coverage/);
      if (i.key.startsWith("wedding-")) { expect(i.specs, i.key).toBeUndefined(); expect(i.inclusions[0], i.key).toMatch(/of coverage/); }
    }
  });
});

describe("Team Headshots: one signature retouched image per person, derived from the quotation calculation", () => {
  const tiers = [{ marketId: "m", tierSlug: "2-5", minPeople: 2, maxPeople: 5, pricePerPersonUsd: 3 }, { marketId: "m", tierSlug: "26-50", minPeople: 26, maxPeople: 50, pricePerPersonUsd: 2 }];
  it("shown when the calculation gives the same whole number per person at the smallest and largest team", () => {
    expect(corporateSection([], tiers, 7, 1, {}).items[0].inclusions).toEqual(["1 signature retouched image per person"]);
  });
  it("not shown (a gap, not a guess) when the calculation cannot be run", () => { expect(corporateSection([], tiers, null, 1, {}).items[0].inclusions).toEqual([]); });
});

describe("corporate priority delivery: the printed percentages are retained (management decision H1)", () => {
  const s = corporateSection([], [], 250, 15, { individual_headshot: 40, team_2_5: 30 });
  it("the add-on is 'Price on request' and its note still prints the recorded percentages", () => {
    const a = s.addons!.find((x) => x.name === "Priority delivery")!; expect(a.price).toEqual({ kind: "on_request" }); expect(a.note).toMatch(/40% for an individual headshot; 30% for a team of 2–5/);
  });
  it("is displayed as 'Price on request'", () => { expect(formatPrice({ kind: "on_request" }, "USD").amount).toBe("Price on request"); });
});

describe("corporate minimum: the card does not claim more than the estimator applies", () => {
  it("the section keeps its plain 'Minimum booking' label and no wording mentions the quotation engine applying it", () => {
    const s = corporateSection([], [], 250, 15, {}); expect(s.minimum?.label).toBe("Minimum booking");
    expect(JSON.stringify(syntheticDraft().sections.find((x) => x.key === "corporate_headshots"))).not.toMatch(/automatic|calculat|quotation engine|estimator/i);
  });
});

describe("Product and catalogue: standard base rate, never 'the lowest price'", () => {
  const item = commercialSection([], 55, 500, []).items.find((i) => i.key === "com-catalogue")!;
  it("states the base rate and the minimum exactly as approved", () => { expect(item.inclusions).toEqual(["Standard base rate: USD 55 per image", "Minimum booking: USD 500"]); });
  it("no wording calls the rate a minimum price", () => { expect(item.inclusions.join(" ")).not.toMatch(/lowest|cheapest|from only|as low as|starting/i); });
  it("no new package or add-on keys were introduced (Food & Beverage is not a record)", () => { const keys = syntheticDraft().sections.flatMap((s) => s.items.map((i) => i.key)); expect(keys.some((k) => /food|beverage|product-/i.test(k))).toBe(false); });
});

describe("catalogue presentation: no 'From' label and the minimum shown once (presentation only; the price record is unchanged)", () => {
  const sec = commercialSection([{ marketId: "m", serviceMode: "photography", scopeSlug: "focused", priceUsd: 450 }], 55, 500, []);
  const cat = sec.items.find((i) => i.key === "com-catalogue")!; const focused = sec.items.find((i) => i.key !== "com-catalogue")!;
  it("only the catalogue item drops the 'From' label; production packages keep it", () => { expect(statesBaseRate(cat)).toBe(true); expect(statesBaseRate(focused)).toBe(false); });
  it("the price record itself stays a starting price (selling data untouched)", () => { expect(cat.price).toEqual({ kind: "from", amount: 55, unit: "per image" }); expect(sec.minimum?.price).toEqual({ kind: "fixed", amount: 500 }); });
  it("the section's minimum band is suppressed only when an item already states the minimum", () => { expect(minimumStatedInItem(sec)).toBe(true); expect(minimumStatedInItem({ ...sec, items: [focused] })).toBe(false); });
});

describe("H2 catalogue statements: base rate and minimum, per market and currency (management-approved wording)", () => {
  const sec = (base: number, min: number) => commercialSection([], base, min, []);
  const line = (base: number, min: number) => sec(base, min).items.find((i) => i.key === "com-catalogue")!;
  it("Qatar, Ghana and North America figures, in the approved form, without a 'From' prefix and without repeating the minimum band", () => {
    for (const [base, min] of [[40, 350], [25, 200], [55, 500]] as const) {
      const i = line(base, min); expect(i.inclusions).toEqual([`Standard base rate: USD ${base} per image`, `Minimum booking: USD ${min}`]);
      expect(statesBaseRate(i)).toBe(true); expect(minimumStatedInItem(sec(base, min))).toBe(true);
    }
  });
  it("the price records are unchanged (still the recorded base rate and minimum)", () => {
    const s = sec(25, 200); expect(s.items.find((i) => i.key === "com-catalogue")!.price).toEqual({ kind: "from", amount: 25, unit: "per image" }); expect(s.minimum?.price).toEqual({ kind: "fixed", amount: 200 });
  });
  it("on a GHS card the statements are restated with the same conversion and rounding as the prices (never left in USD)", () => {
    const fx = { currency: "GHS", rateToUsd: 11.2, effectiveFrom: "2026-11-01", source: "synthetic", rule: { kind: "up_to_multiple" as const, multiple: 10 } };
    const usd = { meta: { currency: "USD" }, sections: [sec(25, 200)] } as never;
    const out = convertContent(usd, fx); const i = out.sections[0].items.find((x) => x.key === "com-catalogue")!;
    expect(i.price).toMatchObject({ amount: 280 }); expect(i.inclusions).toEqual(["Standard base rate: GHS 280 per image", "Minimum booking: GHS 2,240"]);
    expect(out.sections[0].minimum!.price).toMatchObject({ amount: 2240 }); expect(checkConversions(out, "2026-11-02")).toEqual([]);
  });
  it("a converted card that still states USD in these lines is reported", () => {
    const fx = { currency: "GHS", rateToUsd: 11.2, effectiveFrom: "2026-11-01", source: "synthetic", rule: { kind: "up_to_multiple" as const, multiple: 10 } };
    const out = convertContent({ meta: { currency: "USD" }, sections: [sec(25, 200)] } as never, fx);
    out.sections[0].items.find((x) => x.key === "com-catalogue")!.inclusions = ["Minimum booking: USD 200"];
    expect(checkConversions(out, "2026-11-02").some((e) => /still in USD/.test(e))).toBe(true);
  });
});
