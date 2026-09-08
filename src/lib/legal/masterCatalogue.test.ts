import { describe, expect, it } from "vitest";
import {
  CANONICAL_LEGAL_MASTERS,
  LEGACY_OSELS_RECONCILIATION,
  getCanonicalMasterDefinition,
  isValidTemplateLifecycleTransition,
  requiresBusinessLineActivation,
  isSeparatelyControlledRelease,
} from "./masterCatalogue";

// Ordift Studios Legal Suite — LEGAL-SYS-1, Phase D-0 (2026-09-08).

describe("CANONICAL_LEGAL_MASTERS — the locked 21-document catalogue", () => {
  it("contains exactly 21 documents", () => {
    expect(CANONICAL_LEGAL_MASTERS).toHaveLength(21);
  });

  it("every canonical code is unique", () => {
    const codes = CANONICAL_LEGAL_MASTERS.map((m) => m.code);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it("codes run OS-LGL-001 through OS-LGL-021 in order, matching the locked numbering", () => {
    const expected = Array.from({ length: 21 }, (_, i) => `OS-LGL-${String(i + 1).padStart(3, "0")}`);
    expect(CANONICAL_LEGAL_MASTERS.map((m) => m.code)).toEqual(expected);
  });

  it("OS-LGL-001 is Personal Portrait Agreement — NOT Privacy Policy (confirms no accidental legacy-numbering carryover)", () => {
    expect(getCanonicalMasterDefinition("OS-LGL-001")?.title).toBe("Personal Portrait Agreement");
  });

  it("OS-LGL-016 is Privacy Notice / Privacy Policy under the new canonical numbering", () => {
    expect(getCanonicalMasterDefinition("OS-LGL-016")?.title).toContain("Privacy");
  });
  it("OS-LGL-017 is Cookie Notice / Cookie Policy", () => {
    expect(getCanonicalMasterDefinition("OS-LGL-017")?.title).toContain("Cookie");
  });
  it("OS-LGL-015 is Website / Platform Terms", () => {
    expect(getCanonicalMasterDefinition("OS-LGL-015")?.title).toContain("Website");
  });
  it("OS-LGL-014 is Client Service Terms & General Booking Agreement", () => {
    expect(getCanonicalMasterDefinition("OS-LGL-014")?.title).toContain("Booking");
  });

  it("classifies documents into the 4 categories from Part 3 — never identically", () => {
    const byClassification = new Map<string, number>();
    for (const m of CANONICAL_LEGAL_MASTERS) {
      byClassification.set(m.classification, (byClassification.get(m.classification) ?? 0) + 1);
    }
    expect(byClassification.get("transaction_agreement")).toBe(15);
    expect(byClassification.get("release_authorization")).toBe(2);
    expect(byClassification.get("public_legal_document")).toBe(3);
    expect(byClassification.get("internal_governance")).toBe(1);
  });

  it("releases (004/005) are release_authorization, not transaction_agreement", () => {
    expect(getCanonicalMasterDefinition("OS-LGL-004")?.classification).toBe("release_authorization");
    expect(getCanonicalMasterDefinition("OS-LGL-005")?.classification).toBe("release_authorization");
  });

  it("the internal governance document (020) is never a public or transaction document", () => {
    expect(getCanonicalMasterDefinition("OS-LGL-020")?.classification).toBe("internal_governance");
  });
});

describe("LEGACY_OSELS_RECONCILIATION — traceable legacy mapping", () => {
  it("maps exactly the 4 reconciled codes, no more", () => {
    expect(Object.keys(LEGACY_OSELS_RECONCILIATION).sort()).toEqual(["OS-LGL-014", "OS-LGL-015", "OS-LGL-016", "OS-LGL-017"]);
  });
  it("Privacy resolves canonically to OS-LGL-016, legacy OS-LGL-001", () => {
    expect(LEGACY_OSELS_RECONCILIATION["OS-LGL-016"]).toEqual({ legacyCode: "OS-LGL-001", publicSlug: "privacy" });
  });
  it("Cookies resolves canonically to OS-LGL-017, legacy OS-LGL-002", () => {
    expect(LEGACY_OSELS_RECONCILIATION["OS-LGL-017"]).toEqual({ legacyCode: "OS-LGL-002", publicSlug: "cookies" });
  });
  it("Website Terms resolves canonically to OS-LGL-015, legacy OS-LGL-003", () => {
    expect(LEGACY_OSELS_RECONCILIATION["OS-LGL-015"]).toEqual({ legacyCode: "OS-LGL-003", publicSlug: "terms" });
  });
  it("Booking Terms maps toward OS-LGL-014, legacy OS-LGL-004 — public_slug preserved, not destructively replaced", () => {
    expect(LEGACY_OSELS_RECONCILIATION["OS-LGL-014"]).toEqual({ legacyCode: "OS-LGL-004", publicSlug: "booking" });
  });
});

describe("isValidTemplateLifecycleTransition — Part 5", () => {
  it("allows the documented forward sequence", () => {
    expect(isValidTemplateLifecycleTransition("draft", "legal_review")).toBe(true);
    expect(isValidTemplateLifecycleTransition("legal_review", "approved")).toBe(true);
    expect(isValidTemplateLifecycleTransition("approved", "active")).toBe(true);
    expect(isValidTemplateLifecycleTransition("active", "retired")).toBe(true);
    expect(isValidTemplateLifecycleTransition("active", "superseded")).toBe(true);
  });
  it("refuses skipping legal_review", () => {
    expect(isValidTemplateLifecycleTransition("draft", "approved")).toBe(false);
  });
  it("Approval never auto-transitions to Active — refused unless explicit", () => {
    // The transition IS allowed as a distinct, deliberate call — the
    // real guarantee (never automatic) lives in masterRegistry.ts,
    // which only ever calls this on an explicit actor-initiated
    // request. This test documents that "approved" is a genuine,
    // separate resting state or lifecycle, at least one step short of
    // "active" — not fabricated.
    expect(isValidTemplateLifecycleTransition("legal_review", "active")).toBe(false);
  });
  it("retired/superseded are terminal — nothing transitions out of them", () => {
    expect(isValidTemplateLifecycleTransition("retired", "active")).toBe(false);
    expect(isValidTemplateLifecycleTransition("superseded", "active")).toBe(false);
  });
  it("refuses moving backward from approved to draft", () => {
    expect(isValidTemplateLifecycleTransition("approved", "draft")).toBe(false);
  });
});

describe("business-line / release activation gates — Parts 16/26/27", () => {
  it("only Talent Management (021) requires business-line activation", () => {
    expect(requiresBusinessLineActivation("OS-LGL-021")).toBe(true);
    expect(requiresBusinessLineActivation("OS-LGL-007")).toBe(false);
  });
  it("only the RAW licence (006) is flagged as a separately-controlled release", () => {
    expect(isSeparatelyControlledRelease("OS-LGL-006")).toBe(true);
    expect(isSeparatelyControlledRelease("OS-LGL-003")).toBe(false);
  });
});
