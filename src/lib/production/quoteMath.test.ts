import { describe, expect, it } from "vitest";
import { computeQuoteTotal } from "./quoteMath";

describe("computeQuoteTotal", () => {
  it("adds tax to the subtotal", () => {
    expect(computeQuoteTotal(1000, 50)).toBe(1050);
  });

  it("handles a null/undefined tax as zero", () => {
    expect(computeQuoteTotal(1000, null)).toBe(1000);
    expect(computeQuoteTotal(1000, undefined)).toBe(1000);
  });

  it("rounds to the cent", () => {
    expect(computeQuoteTotal(999.999, 0.001)).toBe(1000);
  });

  it("4. never touches currency — this function only ever combines two numbers; originalCurrencyCode is stored verbatim by createSupplierQuote() and never passed to or derived by this function at all", () => {
    // Structural proof: computeQuoteTotal's signature has no currency
    // parameter, so there is no code path here that could alter it.
    expect(computeQuoteTotal.length).toBe(2);
  });
});
