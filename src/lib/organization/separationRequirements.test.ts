import { describe, expect, it } from "vitest";
import {
  STAFF_SEPARATION_CLEARANCE_CATALOG,
  EXTERNAL_SEPARATION_CLEARANCE_CATALOG,
  catalogForRelationship,
} from "./separationRequirements";
import { computeUnsatisfiedRequired, REQUIREMENT_TYPES } from "./onboardingRequirements";

// E.5 Stage 2J, Part 4/13 — workforce lifecycle clearance requirements.
// computeUnsatisfiedRequired() is imported and reused directly from
// onboardingRequirements.ts, not reimplemented — these tests prove
// that reuse actually works correctly against separation-shaped
// catalog objects, and that relationship-awareness (Part 4: external
// contributors must not automatically receive the same clearance set
// as staff) is real, not just documented.

describe("STAFF_SEPARATION_CLEARANCE_CATALOG — structural integrity", () => {
  it("has no duplicate requirementKey", () => {
    const keys = STAFF_SEPARATION_CLEARANCE_CATALOG.map((t) => t.requirementKey);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("every entry's requirementType is one of the seven defined types", () => {
    for (const t of STAFF_SEPARATION_CLEARANCE_CATALOG) {
      expect(REQUIREMENT_TYPES).toContain(t.requirementType);
    }
  });

  it("contains no item that depends on the departing person's own participation — by construction, an exceptional case (death/incapacity/abandonment) can always reach full clearance without needing to mark anything not_applicable on their behalf", () => {
    const participationKeywords = ["employee_sign", "employee_accept", "self_ack", "employee_confirm"];
    for (const t of STAFF_SEPARATION_CLEARANCE_CATALOG) {
      for (const kw of participationKeywords) {
        expect(t.requirementKey.includes(kw)).toBe(false);
      }
    }
  });
});

describe("EXTERNAL_SEPARATION_CLEARANCE_CATALOG — relationship-aware, smaller set", () => {
  it("has no duplicate requirementKey", () => {
    const keys = EXTERNAL_SEPARATION_CLEARANCE_CATALOG.map((t) => t.requirementKey);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("has strictly fewer REQUIRED items than the staff catalog — external contributors are not forced through the same clearance set", () => {
    const staffRequiredCount = STAFF_SEPARATION_CLEARANCE_CATALOG.filter((t) => t.required).length;
    const externalRequiredCount = EXTERNAL_SEPARATION_CLEARANCE_CATALOG.filter((t) => t.required).length;
    expect(externalRequiredCount).toBeLessThan(staffRequiredCount);
  });

  it("has no Corporate Identity / Authority Grant / HR-personnel item — those concepts don't apply to non-staff relationships in this architecture", () => {
    const keys = EXTERNAL_SEPARATION_CLEARANCE_CATALOG.map((t) => t.requirementKey);
    expect(keys).not.toContain("authority_grants_revoked");
    expect(keys).not.toContain("corporate_identity_work_email_disposition");
    expect(keys).not.toContain("hr_personnel_document_clearance");
  });
});

describe("catalogForRelationship", () => {
  it("returns the staff catalog only for an account holding the 'staff' role", () => {
    expect(catalogForRelationship(["staff"])).toBe(STAFF_SEPARATION_CLEARANCE_CATALOG);
    expect(catalogForRelationship(["staff", "admin"])).toBe(STAFF_SEPARATION_CLEARANCE_CATALOG);
  });

  it("returns the external catalog for contractor/vendor/model/instructor-shaped role sets (anything without 'staff')", () => {
    expect(catalogForRelationship(["contractor"])).toBe(EXTERNAL_SEPARATION_CLEARANCE_CATALOG);
    expect(catalogForRelationship(["vendor"])).toBe(EXTERNAL_SEPARATION_CLEARANCE_CATALOG);
    expect(catalogForRelationship(["model"])).toBe(EXTERNAL_SEPARATION_CLEARANCE_CATALOG);
    expect(catalogForRelationship([])).toBe(EXTERNAL_SEPARATION_CLEARANCE_CATALOG);
  });
});

describe("computeUnsatisfiedRequired reused directly against separation-shaped catalog objects", () => {
  it("a fresh staff separation case (zero persisted rows, zero derived opinions) has real, non-vacuous unsatisfied required items — clearance is never trivially 'complete' by default", () => {
    const result = computeUnsatisfiedRequired(STAFF_SEPARATION_CLEARANCE_CATALOG, new Map(), new Map());
    expect(result.length).toBe(STAFF_SEPARATION_CLEARANCE_CATALOG.filter((t) => t.required).length);
  });

  it("a fresh external separation case has fewer unsatisfied required items than a staff one, reflecting the smaller relationship-aware catalog", () => {
    const staffResult = computeUnsatisfiedRequired(STAFF_SEPARATION_CLEARANCE_CATALOG, new Map(), new Map());
    const externalResult = computeUnsatisfiedRequired(EXTERNAL_SEPARATION_CLEARANCE_CATALOG, new Map(), new Map());
    expect(externalResult.length).toBeLessThan(staffResult.length);
  });
});
