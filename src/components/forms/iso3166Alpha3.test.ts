import { describe, expect, it } from "vitest";
import { getCountries } from "libphonenumber-js";
import { getAlpha3 } from "./iso3166Alpha3";

// PhoneInput compact-selector correction (2026-09-25) — closed-state
// display now shows ISO 3166-1 alpha-3 + calling code (e.g. "GHA
// +233") instead of the full country name.

describe("getAlpha3", () => {
  it("matches the Founder's own worked examples", () => {
    expect(getAlpha3("GH")).toBe("GHA");
    expect(getAlpha3("QA")).toBe("QAT");
    expect(getAlpha3("GB")).toBe("GBR");
    expect(getAlpha3("US")).toBe("USA");
  });

  it("never returns a blank/undefined value for any country libphonenumber-js actually supports — falls back to the real alpha-2 code for the rare territory with no ISO alpha-3, never crashes or hides the country", () => {
    for (const code of getCountries()) {
      const alpha3 = getAlpha3(code);
      expect(alpha3).toBeTruthy();
      expect(alpha3.length).toBeGreaterThanOrEqual(2);
    }
  });

  it("never produces the same alpha-3 for two different countries (no accidental collision in the mapping)", () => {
    const seen = new Map<string, string>();
    for (const code of getCountries()) {
      const alpha3 = getAlpha3(code);
      const existing = seen.get(alpha3);
      expect(existing, `${alpha3} used by both ${existing} and ${code}`).toBeUndefined();
      seen.set(alpha3, code);
    }
  });
});
