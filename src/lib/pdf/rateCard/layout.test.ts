import { describe, expect, it } from "vitest";
import { estimateItemHeight, pageBreaks } from "./RateCardDocument";
import type { RateCardItem } from "./types";

const item = (n: number, extra: Partial<RateCardItem> = {}): RateCardItem => ({ key: `k${n}`, name: `Package ${n}`, description: "", inclusions: Array.from({ length: n }, (_, k) => `Inclusion ${k + 1}`), price: { kind: "fixed", amount: 100, unit: "per booking" }, ...extra }) as RateCardItem;

describe("rate card page breaks", () => {
  it("adds no break when the section fits one page", () => {
    expect(pageBreaks([90, 90, 90, 90], 70, 0)).toEqual([]);
  });
  it("splits a section that cannot fit into balanced pages, never leaving one lonely package", () => {
    const b = pageBreaks(Array(8).fill(110), 70, 0); // 950pt of content over a ~670pt page body
    expect(b).toHaveLength(1);
    expect(b[0]).toBeGreaterThanOrEqual(3); // 8 packages -> at least 3 on the first page and at most 5 on the second
    expect(8 - b[0]).toBeGreaterThanOrEqual(3);
  });
  it("never breaks before the first package", () => {
    expect(pageBreaks([700, 700], 0, 0)[0]).toBe(1);
  });
  it("counts the minimum and add-ons that follow the last package", () => {
    expect(pageBreaks([150, 150, 150, 150], 60, 0)).toEqual([]);
    expect(pageBreaks([150, 150, 150, 150], 60, 200)).toHaveLength(1);
  });
  it("estimates a two-column package shorter than the same package in one column", () => {
    expect(estimateItemHeight(item(8))).toBeLessThan(estimateItemHeight(item(4)) + 8 * 12);
    expect(estimateItemHeight(item(10))).toBeLessThan(estimateItemHeight(item(10, { inclusions: Array.from({ length: 4 }, (_, k) => `x${k}`) })) * 3);
  });
  it("estimates a longer description as taller", () => {
    expect(estimateItemHeight(item(2, { description: "word ".repeat(120) }))).toBeGreaterThan(estimateItemHeight(item(2)));
  });
});
