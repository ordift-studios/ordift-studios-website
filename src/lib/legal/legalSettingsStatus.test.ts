import { describe, expect, it } from "vitest";
import { deriveLegalMastersStatus, derivePublicLegalPagesStatus, type MasterStatusInput } from "./legalSettingsStatus";
import { CANONICAL_LEGAL_MASTERS } from "./masterCatalogue";

// Ordift Studios Legal Suite — LEGAL-SYS-1, Phase D-0 (2026-09-08).
// Settings → Legal & Forms reconciliation: replaces the vestigial
// LEGAL_PAGES_APPROVED env-var badge with two genuinely derived,
// separately-tracked truths.

// Builds a complete, all-21-masters-approved input set (matching the
// real migration 0067 seed exactly) so tests can mutate one master at
// a time rather than re-typing all 21 every time.
function allApprovedInput(): MasterStatusInput[] {
  return CANONICAL_LEGAL_MASTERS.map((def) => ({
    canonicalCode: def.code,
    classification: def.classification,
    versions: [{ status: "approved", effectiveDate: null, publicSlug: null }],
  }));
}

describe("deriveLegalMastersStatus — Part 6/22", () => {
  it("reports approved when every one of the 21 canonical codes has an approved-or-later version", () => {
    expect(deriveLegalMastersStatus(allApprovedInput())).toBe("approved");
  });

  it("reports incomplete if even one canonical code is entirely missing", () => {
    const input = allApprovedInput().filter((m) => m.canonicalCode !== "OS-LGL-021");
    expect(deriveLegalMastersStatus(input)).toBe("incomplete");
  });

  it("reports incomplete if a master exists but has never reached approved (still draft/legal_review)", () => {
    const input = allApprovedInput().map((m) =>
      m.canonicalCode === "OS-LGL-007" ? { ...m, versions: [{ status: "draft", effectiveDate: null, publicSlug: null }] } : m
    );
    expect(deriveLegalMastersStatus(input)).toBe("incomplete");
  });

  it("active/retired/superseded all still count as 'was approved' — status never regresses to incomplete once genuinely approved", () => {
    for (const laterStatus of ["active", "retired", "superseded"]) {
      const input = allApprovedInput().map((m) =>
        m.canonicalCode === "OS-LGL-016" ? { ...m, versions: [{ status: laterStatus, effectiveDate: null, publicSlug: null }] } : m
      );
      expect(deriveLegalMastersStatus(input)).toBe("approved");
    }
  });
});

describe("derivePublicLegalPagesStatus — Part 22 (Counsel Approval != Public Activation)", () => {
  it("reports pending_activation when the public documents are merely approved with no live content", () => {
    // This is the REAL Production state seeded by migration 0067's
    // v1.0 rows alone, before the legacy reconciliation versions —
    // approved-but-no-content must never read as active.
    expect(derivePublicLegalPagesStatus(allApprovedInput())).toBe("pending_activation");
  });

  it("reports active once Website Terms, Privacy, and Cookie Notice each have a genuinely active version with a real effective date and public slug", () => {
    const input = allApprovedInput().map((m) => {
      if (["OS-LGL-015", "OS-LGL-016", "OS-LGL-017"].includes(m.canonicalCode)) {
        return { ...m, versions: [...m.versions, { status: "active", effectiveDate: "2026-08-05", publicSlug: m.canonicalCode === "OS-LGL-015" ? "terms" : m.canonicalCode === "OS-LGL-016" ? "privacy" : "cookies" }] };
      }
      return m;
    });
    expect(derivePublicLegalPagesStatus(input)).toBe("active");
  });

  it("does NOT require Booking Terms (OS-LGL-014, a transaction_agreement) to be active — only the 3 public_legal_document codes", () => {
    const input = allApprovedInput().map((m) => {
      if (["OS-LGL-015", "OS-LGL-016", "OS-LGL-017"].includes(m.canonicalCode)) {
        return { ...m, versions: [...m.versions, { status: "active", effectiveDate: "2026-08-05", publicSlug: "x" }] };
      }
      return m; // OS-LGL-014 stays merely 'approved', no active version
    });
    expect(derivePublicLegalPagesStatus(input)).toBe("active");
  });

  it("reports pending_activation if even one of the three is missing a real effective date (never fabricated)", () => {
    const input = allApprovedInput().map((m) => {
      if (m.canonicalCode === "OS-LGL-016") return { ...m, versions: [...m.versions, { status: "active", effectiveDate: null, publicSlug: "privacy" }] };
      if (["OS-LGL-015", "OS-LGL-017"].includes(m.canonicalCode)) return { ...m, versions: [...m.versions, { status: "active", effectiveDate: "2026-08-05", publicSlug: "x" }] };
      return m;
    });
    expect(derivePublicLegalPagesStatus(input)).toBe("pending_activation");
  });

  it("reports pending_activation if one of the three has no real public URL slug", () => {
    const input = allApprovedInput().map((m) => {
      if (m.canonicalCode === "OS-LGL-017") return { ...m, versions: [...m.versions, { status: "active", effectiveDate: "2026-08-05", publicSlug: null }] };
      if (["OS-LGL-015", "OS-LGL-016"].includes(m.canonicalCode)) return { ...m, versions: [...m.versions, { status: "active", effectiveDate: "2026-08-05", publicSlug: "x" }] };
      return m;
    });
    expect(derivePublicLegalPagesStatus(input)).toBe("pending_activation");
  });
});
