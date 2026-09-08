import { describe, expect, it } from "vitest";
import { PULSE_SOURCE_CLASSIFICATIONS, isValidSourceClassification, resolveDraftOrigin } from "./sourceClassification";

describe("PULSE_SOURCE_CLASSIFICATIONS / isValidSourceClassification", () => {
  it("is exactly official_primary and editorial_discovery", () => {
    expect(PULSE_SOURCE_CLASSIFICATIONS).toEqual(["official_primary", "editorial_discovery"]);
  });
  it("rejects an unknown value", () => {
    expect(isValidSourceClassification("something_else")).toBe(false);
  });
});

describe("resolveDraftOrigin — Requirements 1-3: classification decides draft/origin behaviour", () => {
  it("1. OFFICIAL source classification routes to origin \"official\"", () => {
    expect(resolveDraftOrigin("official_primary")).toBe("official");
  });
  it("2. EDITORIAL source classification routes to origin \"curated\" — unchanged existing behaviour", () => {
    expect(resolveDraftOrigin("editorial_discovery")).toBe("curated");
  });
});
