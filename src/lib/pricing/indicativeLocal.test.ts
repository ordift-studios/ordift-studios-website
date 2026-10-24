import { describe, expect, it } from "vitest";
import { indicativeLocalAmount } from "./indicativeLocal";

const now = new Date("2026-10-24T12:00:00Z");
describe("internal local-currency reference (never a relabelled USD figure)", () => {
  it("converts with the governed rate (1 USD = rate local units) and reports the rate and its age", () => {
    expect(indicativeLocalAmount(450, "QAR", { rateToUsd: 3.64, effectiveFrom: "2026-10-11T14:39:50Z" }, now)).toMatchObject({ ok: true, currency: "QAR", amount: 1638, rateToUsd: 3.64, ageDays: 12 });
  });
  it("refuses a rate older than the governed 30-day limit (the GHS rate in Production is from August)", () => {
    const r = indicativeLocalAmount(450, "GHS", { rateToUsd: 11.0898, effectiveFrom: "2026-08-14T09:22:55Z" }, now);
    expect(!r.ok && r.reason).toContain("days old (the limit is 30)");
  });
  it("refuses a missing, zero or future-dated rate and a non-positive amount", () => {
    expect(indicativeLocalAmount(450, "QAR", null, now).ok).toBe(false);
    expect(indicativeLocalAmount(450, "QAR", { rateToUsd: 0, effectiveFrom: "2026-10-20T00:00:00Z" }, now).ok).toBe(false);
    expect(indicativeLocalAmount(450, "QAR", { rateToUsd: 3.64, effectiveFrom: "2026-12-01T00:00:00Z" }, now).ok).toBe(false);
    expect(indicativeLocalAmount(0, "QAR", { rateToUsd: 3.64, effectiveFrom: "2026-10-20T00:00:00Z" }, now).ok).toBe(false);
  });
});
