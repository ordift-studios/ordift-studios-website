import { describe, expect, it } from "vitest";
import { formatAgreementReference, isValidAgreementReferenceFormat, parseAgreementReference } from "./agreementReference";

// Ordift Studios Legal Suite — LEGAL-SYS-1, Phase E, Part 13.

describe("formatAgreementReference", () => {
  it("formats as ORD-AGR-YYYY-###### with zero-padding", () => {
    expect(formatAgreementReference(2027, 123)).toBe("ORD-AGR-2027-000123");
  });
  it("does not hardcode the example's exact sequence as a special case", () => {
    expect(formatAgreementReference(2026, 1)).toBe("ORD-AGR-2026-000001");
    expect(formatAgreementReference(2026, 999999)).toBe("ORD-AGR-2026-999999");
  });
});

describe("isValidAgreementReferenceFormat / parseAgreementReference", () => {
  it("round-trips a well-formed reference", () => {
    const ref = formatAgreementReference(2027, 42);
    expect(isValidAgreementReferenceFormat(ref)).toBe(true);
    expect(parseAgreementReference(ref)).toEqual({ year: 2027, sequenceNumber: 42 });
  });
  it("rejects malformed references", () => {
    expect(isValidAgreementReferenceFormat("ORD-AGR-27-000123")).toBe(false);
    expect(isValidAgreementReferenceFormat("ORD-AGR-2027-123")).toBe(false);
    expect(isValidAgreementReferenceFormat("AGR-2027-000123")).toBe(false);
    expect(parseAgreementReference("not-a-reference")).toBeNull();
  });
});
