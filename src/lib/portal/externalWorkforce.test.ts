import { describe, expect, it } from "vitest";
import { classifyExternalRelationship, modulesForRelationship, isInstructorEngagement } from "@/lib/portal/externalWorkforce";

// Phase H.1/H.2 (2026-09-04) — the actual classification/routing
// decision every portal page in this phase depends on. Pure, no DB
// required, directly testable — the safety property that matters is
// that an individual creative (photo editor, retoucher, etc.) always
// classifies as "contractor", never "vendor", and that a true
// company-level vendor classification always wins when present.

describe("classifyExternalRelationship", () => {
  it("classifies a contractor role as contractor", () => {
    expect(classifyExternalRelationship({ roles: ["contractor"], payeeCategory: "contractor" })).toBe("contractor");
  });

  it("classifies an individual creative payee category as contractor even without the role yet (mid-invite)", () => {
    for (const category of ["contractor", "freelancer", "instructor", "talent", "consultant"]) {
      expect(classifyExternalRelationship({ roles: [], payeeCategory: category })).toBe("contractor");
    }
  });

  it("a payee_profiles.category of 'vendor' always wins — a true company supplier is never misrouted as a contractor", () => {
    expect(classifyExternalRelationship({ roles: ["contractor"], payeeCategory: "vendor" })).toBe("vendor");
  });

  it("classifies the vendor role as vendor when no payee category is set", () => {
    expect(classifyExternalRelationship({ roles: ["vendor"], payeeCategory: null })).toBe("vendor");
  });

  it("classifies the model role as model", () => {
    expect(classifyExternalRelationship({ roles: ["model"], payeeCategory: null })).toBe("model");
  });

  it("falls back to unclassified when nothing is known yet", () => {
    expect(classifyExternalRelationship({ roles: [], payeeCategory: null })).toBe("unclassified");
    expect(classifyExternalRelationship({ roles: ["client"], payeeCategory: "staff" })).toBe("unclassified");
  });
});

describe("modulesForRelationship", () => {
  it("contractor gets Files; vendor and model do not", () => {
    expect(modulesForRelationship("contractor").files).toBe(true);
    expect(modulesForRelationship("vendor").files).toBe(false);
    expect(modulesForRelationship("model").files).toBe(false);
  });

  it("every real relationship gets compensation and payment details", () => {
    for (const relationship of ["contractor", "vendor", "model"] as const) {
      expect(modulesForRelationship(relationship).compensation).toBe(true);
      expect(modulesForRelationship(relationship).paymentDetails).toBe(true);
    }
  });

  it("unclassified gets nothing — fails closed rather than guessing", () => {
    const modules = modulesForRelationship("unclassified");
    expect(Object.values(modules).every((v) => v === false)).toBe(true);
  });
});

describe("isInstructorEngagement", () => {
  it("recognizes the seeded 'Workshop Instructor' operational title, case-insensitively", () => {
    expect(isInstructorEngagement("Workshop Instructor")).toBe(true);
    expect(isInstructorEngagement("workshop instructor")).toBe(true);
  });

  it("does not misclassify an unrelated operational title", () => {
    expect(isInstructorEngagement("Photo Editor")).toBe(false);
    expect(isInstructorEngagement(null)).toBe(false);
  });
});
