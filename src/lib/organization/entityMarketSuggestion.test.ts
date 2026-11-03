import { describe, expect, it } from "vitest";
import { marketMismatchNote, suggestEntityForMarket, type SuggestionCandidate } from "./entityMarketSuggestion";

const gh: SuggestionCandidate = { entityId: "g", name: "Ordift Studios", jurisdiction: "Ghana", eligible: true, blockers: [] };
const qa: SuggestionCandidate = { entityId: "q", name: "Ordift Studios (Qatar)", jurisdiction: "Qatar", eligible: true, blockers: [] };

describe("market-based entity suggestion (a suggestion only)", () => {
  it("suggests the Qatar entity for a Qatar-market enquiry and the Ghana entity for a Ghana-market enquiry", () => {
    expect(suggestEntityForMarket("QA", [gh, qa])?.entityId).toBe("q");
    expect(suggestEntityForMarket("GH", [gh, qa])?.entityId).toBe("g");
  });
  it("says it is a suggestion that a Super Admin must confirm, and nothing is recorded automatically", () => {
    expect(suggestEntityForMarket("QA", [gh, qa])?.text).toMatch(/Super Admin must confirm/);
    expect(suggestEntityForMarket("QA", [gh, qa])?.text).toMatch(/not recorded automatically/);
  });
  it("suggests nothing without a known market, with no entity in that market, or with two", () => {
    expect(suggestEntityForMarket(null, [gh, qa])).toBeNull();
    expect(suggestEntityForMarket("US", [gh, qa])).toBeNull();
    expect(suggestEntityForMarket("QA", [gh])).toBeNull();
    expect(suggestEntityForMarket("QA", [qa, { ...qa, entityId: "q2" }])).toBeNull();
  });
  it("reports an ineligible entity as unavailable instead of hiding it, and never falls back to the other market's entity", () => {
    const s = suggestEntityForMarket("QA", [gh, { ...qa, eligible: false, blockers: ["Commercial Permit has not been issued."] }]);
    expect(s?.entityId).toBe("q");
    expect(s?.eligible).toBe(false);
    expect(s?.text).toMatch(/cannot currently contract/);
  });
  it("notes (advisory) when the recorded entity is from another market, and stays quiet otherwise", () => {
    expect(marketMismatchNote("QA", "Ordift Studios", "Ghana")).toMatch(/Qatar.*Ghana/);
    expect(marketMismatchNote("QA", "Ordift Studios (Qatar)", "Qatar")).toBeNull();
    expect(marketMismatchNote(null, "Ordift Studios", "Ghana")).toBeNull();
  });
});
