import { describe, expect, it } from "vitest";
import { corporateSection, personalSessionSection, weddingEventSection } from "./mappers";
import { formatPrice } from "./RateCardDocument";
import { calculateCorporateEstimate } from "@/lib/pricing/corporateHeadshotEstimate";

// Management-approved display improvements (2 Nov 2026). Counts and prices are NEVER changed; only how existing entitlements are worded.
describe("edited-image quantity states the signature-retouched images as included, counts unchanged", () => {
  const sec = (edited: number, sig: number) => personalSessionSection([{ marketId: "m", durationHours: 1, priceUsd: 1, professionallyEditedImages: edited, signatureRetouchedImages: sig }]).items[0].inclusions;
  it("the approved form, singular, edited-only and signature-only", () => {
    expect(sec(150, 10)).toEqual(["150 professionally edited images, including 10 signature retouched images"]);
    expect(sec(1, 1)).toEqual(["1 professionally edited image, including 1 signature retouched image"]);
    expect(sec(12, 0)).toEqual(["12 professionally edited images"]); expect(sec(0, 3)).toEqual(["3 signature retouched images"]);
  });
  it("never says 'including' when the recorded signature count exceeds the edited count: both are then listed as recorded", () => { expect(sec(5, 8)).toEqual(["5 professionally edited images", "8 signature retouched images"]); });
  it("weddings and events use the same inclusive wording with the minimum shown as '150+'", () => {
    const d = [{ category: "wedding" as const, tierSlug: "chapter", serviceMode: "photography" as const, eventDays: 1, coverageHours: 4, photographers: 1, filmmakers: 0, professionallyEditedImagesMin: 150, signatureRetouchedImages: 10, highlightFilmMinMinutes: null, highlightFilmMaxMinutes: null, includesDocumentary: false, onlineGallery: false, planningConsultation: false, prioritySneakPeek: false }];
    const r = [{ marketId: "m", category: "wedding" as const, serviceMode: "photography" as const, tierSlug: "chapter", priceUsd: 1 }];
    expect(weddingEventSection("wedding", "photography", r, d as never).items[0].inclusions).toContain("150+ professionally edited images, including 10 signature retouched images");
  });
});

describe("event coverage hours are a prominent specification, once; package names are kept", () => {
  const d = (hours: number) => [{ category: "event" as const, tierSlug: "full_day", serviceMode: "photography" as const, eventDays: 1, coverageHours: hours, photographers: 1, filmmakers: 0, professionallyEditedImagesMin: 80, signatureRetouchedImages: 5, highlightFilmMinMinutes: null, highlightFilmMaxMinutes: null, includesDocumentary: false, onlineGallery: true, planningConsultation: false, prioritySneakPeek: false }];
  const rates = [{ marketId: "m", category: "event" as const, serviceMode: "photography" as const, tierSlug: "full_day", priceUsd: 900 }];
  it("events: hours in specs, not in inclusions; the price is untouched", () => {
    const i = weddingEventSection("event", "photography", rates, d(4) as never).items[0];
    expect(i.name).toBe("Full Day"); expect(i.specs).toEqual(["4 hours of coverage"]); expect(i.inclusions.some((x) => /of coverage/.test(x))).toBe(false); expect(i.price).toEqual({ kind: "fixed", amount: 900, unit: "per booking" });
  });
  it("weddings are unchanged: the coverage hours stay an inclusion", () => {
    const wd = d(6).map((x) => ({ ...x, category: "wedding" as const })); const wr = rates.map((x) => ({ ...x, category: "wedding" as const }));
    const i = weddingEventSection("wedding", "photography", wr, wd as never).items[0]; expect(i.specs).toBeUndefined(); expect(i.inclusions[0]).toBe("6 hours of coverage");
  });
});

describe("price on request", () => { it("the display label", () => { expect(formatPrice({ kind: "on_request" }, "USD").amount).toBe("Price on request"); }); });

describe("team headshots: the entitlement shown is the calculator's own, never restated", () => {
  const tiers = [{ marketId: "m", minPeople: 2, maxPeople: 5, pricePerPersonUsd: 100 }, { marketId: "m", minPeople: 6, maxPeople: 10, pricePerPersonUsd: 90 }, { marketId: "m", minPeople: 11, maxPeople: 25, pricePerPersonUsd: 80 }, { marketId: "m", minPeople: 26, maxPeople: 50, pricePerPersonUsd: 70 }];
  it("shows '1 signature retouched image per person' exactly because the calculator gives people x 1 at every size", () => {
    for (const n of [2, 5, 6, 25, 26, 50]) { const r = calculateCorporateEstimate({ product: "team_headshots", headshotRates: [], teamTierRates: tiers as never, minimumBookingUsd: 400, numberOfPeople: n }); expect(r.ok && r.signatureRetouchedImages).toBe(n); }
    const s = corporateSection([], tiers as never, 400, null, {});
    expect(s.items.find((i) => i.key === "corp-team")?.inclusions).toEqual(["1 signature retouched image per person"]);
    expect(s.items.find((i) => i.key === "corp-team")?.price).toEqual({ kind: "from", amount: 70, unit: "per person" });
  });
});
