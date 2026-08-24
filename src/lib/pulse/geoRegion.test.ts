import { describe, expect, it } from "vitest";
import { GLOBAL_REGION_SLUG, hasRegionOverlap, resolveRegionChain } from "./geoRegion";

describe("resolveRegionChain", () => {
  it("resolves Ghana to its full chain, ending in global", () => {
    expect(resolveRegionChain("GH")).toEqual(["ghana", "west-africa", "africa", "global"]);
  });

  it("resolves Qatar to its GCC/MENA chain", () => {
    expect(resolveRegionChain("QA")).toEqual(["qatar", "gcc", "mena", "global"]);
  });

  it("resolves Kenya to its East Africa chain", () => {
    expect(resolveRegionChain("KE")).toEqual(["kenya", "east-africa", "africa", "global"]);
  });

  it("resolves the UK to its Europe chain", () => {
    expect(resolveRegionChain("GB")).toEqual(["united-kingdom", "europe", "global"]);
  });

  it("is case-insensitive", () => {
    expect(resolveRegionChain("gh")).toEqual(["ghana", "west-africa", "africa", "global"]);
  });

  it("falls back to global for an unmapped country", () => {
    expect(resolveRegionChain("JP")).toEqual([GLOBAL_REGION_SLUG]);
  });

  it("falls back to global for a missing header", () => {
    expect(resolveRegionChain(null)).toEqual([GLOBAL_REGION_SLUG]);
    expect(resolveRegionChain(undefined)).toEqual([GLOBAL_REGION_SLUG]);
    expect(resolveRegionChain("")).toEqual([GLOBAL_REGION_SLUG]);
  });
});

describe("hasRegionOverlap", () => {
  it("matches when a story region is in the visitor's chain", () => {
    expect(hasRegionOverlap(["west-africa"], ["ghana", "west-africa", "africa", "global"])).toBe(true);
  });

  it("does not match when there is no overlap", () => {
    expect(hasRegionOverlap(["europe"], ["ghana", "west-africa", "africa", "global"])).toBe(false);
  });

  it("always matches an untagged story", () => {
    expect(hasRegionOverlap([], ["europe"])).toBe(true);
  });

  it("always matches a story explicitly tagged global", () => {
    expect(hasRegionOverlap(["global"], ["ghana", "west-africa", "africa", "global"])).toBe(true);
  });

  it("never hides a globally significant story from an unmatched visitor region", () => {
    // A story tagged only "global" must still be eligible for any visitor.
    expect(hasRegionOverlap(["global"], ["kenya", "east-africa", "africa", "global"])).toBe(true);
  });
});
