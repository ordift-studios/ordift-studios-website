import { describe, expect, it } from "vitest";
import {
  KNOWN_ENGAGEMENT_TYPE_SLUGS,
  ENGAGEMENT_TYPE_TO_WORKFORCE_RELATIONSHIP,
  mapEngagementTypeSlugToWorkforceRelationship,
  mapEmploymentJurisdictionToWorkforceJurisdiction,
} from "./workforceMappings";
import { WORKFORCE_RELATIONSHIPS, WORKFORCE_JURISDICTIONS } from "./requirementClassification";

// Ordift Studios Compliance/COMP-SYS-1, Phase B1. Every assertion below
// is a real, executable check against the pure mapping functions — no
// database, no live workflow, no code-reading placeholders needed,
// since this entire module is deliberately pure.

describe("engagement type -> WorkforceRelationship — every currently seeded slug is explicitly covered", () => {
  it("KNOWN_ENGAGEMENT_TYPE_SLUGS matches every slug actually seeded in migrations 0009 and 0065", () => {
    expect([...KNOWN_ENGAGEMENT_TYPE_SLUGS].sort()).toEqual(
      [
        "full_time",
        "part_time",
        "fixed_term",
        "freelancer",
        "independent_contractor",
        "vendor_supplier",
        "instructor",
        "model_talent",
        "collaborator_partner",
        "intern",
        "volunteer",
        "project_based",
      ].sort()
    );
  });

  const DELIBERATE_MAPPINGS: Record<string, string> = {
    full_time: "EMPLOYEE",
    part_time: "EMPLOYEE",
    fixed_term: "EMPLOYEE",
    freelancer: "CONTRACTOR",
    independent_contractor: "CONTRACTOR",
    vendor_supplier: "VENDOR",
    instructor: "INSTRUCTOR",
    model_talent: "MODEL_TALENT",
    collaborator_partner: "COLLABORATOR_PARTNER",
  };

  const DELIBERATELY_UNRESOLVED = ["intern", "volunteer", "project_based"];

  it("every deliberately mapped slug resolves to its exact canonical WorkforceRelationship", () => {
    for (const [slug, expected] of Object.entries(DELIBERATE_MAPPINGS)) {
      expect(mapEngagementTypeSlugToWorkforceRelationship(slug)).toBe(expected);
    }
  });

  it("every deliberately unresolved slug returns null, never a guessed category", () => {
    for (const slug of DELIBERATELY_UNRESOLVED) {
      expect(mapEngagementTypeSlugToWorkforceRelationship(slug)).toBeNull();
    }
  });

  it("KNOWN_ENGAGEMENT_TYPE_SLUGS is fully partitioned: every slug is either deliberately mapped or deliberately unresolved, none silently missing", () => {
    const mappedKeys = new Set(Object.keys(DELIBERATE_MAPPINGS));
    const unresolvedKeys = new Set(DELIBERATELY_UNRESOLVED);
    for (const slug of KNOWN_ENGAGEMENT_TYPE_SLUGS) {
      expect(mappedKeys.has(slug) || unresolvedKeys.has(slug)).toBe(true);
    }
    expect(mappedKeys.size + unresolvedKeys.size).toBe(KNOWN_ENGAGEMENT_TYPE_SLUGS.length);
  });

  it("ENGAGEMENT_TYPE_TO_WORKFORCE_RELATIONSHIP contains only real WorkforceRelationship values", () => {
    for (const relationship of Object.values(ENGAGEMENT_TYPE_TO_WORKFORCE_RELATIONSHIP)) {
      expect(WORKFORCE_RELATIONSHIPS).toContain(relationship);
    }
  });

  it("unknown, missing, and malformed slugs never default to EMPLOYEE or any other relationship", () => {
    for (const bad of [null, undefined, "", "   ", "job-title-not-a-slug", "super_admin", "founder", "manager"]) {
      const result = mapEngagementTypeSlugToWorkforceRelationship(bad as string | null | undefined);
      expect(result).toBeNull();
      expect(result).not.toBe("EMPLOYEE");
    }
  });

  it("tolerates surrounding whitespace and case as defense-in-depth normalization (not synonym guessing)", () => {
    expect(mapEngagementTypeSlugToWorkforceRelationship("  full_time  ")).toBe("EMPLOYEE");
    expect(mapEngagementTypeSlugToWorkforceRelationship("FULL_TIME")).toBe("EMPLOYEE");
    expect(mapEngagementTypeSlugToWorkforceRelationship("Instructor")).toBe("INSTRUCTOR");
  });

  it("a future, not-yet-reviewed engagement_types slug resolves to null rather than being silently guessed", () => {
    expect(mapEngagementTypeSlugToWorkforceRelationship("brand_ambassador")).toBeNull();
  });
});

describe("employment_jurisdictions representation -> WorkforceJurisdiction", () => {
  it("GH: recognizes the canonical code and the Schedule C label", () => {
    expect(mapEmploymentJurisdictionToWorkforceJurisdiction("GH")).toBe("GH");
    expect(mapEmploymentJurisdictionToWorkforceJurisdiction("Ghana")).toBe("GH");
  });

  it("QA: recognizes the canonical code and the Schedule C label", () => {
    expect(mapEmploymentJurisdictionToWorkforceJurisdiction("QA")).toBe("QA");
    expect(mapEmploymentJurisdictionToWorkforceJurisdiction("Qatar")).toBe("QA");
  });

  it("GB: recognizes the canonical code and the Schedule C label", () => {
    expect(mapEmploymentJurisdictionToWorkforceJurisdiction("GB")).toBe("GB");
    expect(mapEmploymentJurisdictionToWorkforceJurisdiction("United Kingdom")).toBe("GB");
  });

  it("DE_EU: recognizes the canonical code and the Schedule C label", () => {
    expect(mapEmploymentJurisdictionToWorkforceJurisdiction("DE_EU")).toBe("DE_EU");
    expect(mapEmploymentJurisdictionToWorkforceJurisdiction("Germany / European Union")).toBe("DE_EU");
  });

  it("US: recognizes the canonical code and the Schedule C label", () => {
    expect(mapEmploymentJurisdictionToWorkforceJurisdiction("US")).toBe("US");
    expect(mapEmploymentJurisdictionToWorkforceJurisdiction("United States")).toBe("US");
  });

  it("OTHER: recognizes the canonical code and the Schedule C 'International / Other' label as a deliberate, genuine result — not a catch-all", () => {
    expect(mapEmploymentJurisdictionToWorkforceJurisdiction("OTHER")).toBe("OTHER");
    expect(mapEmploymentJurisdictionToWorkforceJurisdiction("International / Other")).toBe("OTHER");
  });

  it("tolerates surrounding whitespace and case for every recognized representation", () => {
    expect(mapEmploymentJurisdictionToWorkforceJurisdiction("  ghana  ")).toBe("GH");
    expect(mapEmploymentJurisdictionToWorkforceJurisdiction("GHANA")).toBe("GH");
    expect(mapEmploymentJurisdictionToWorkforceJurisdiction("united kingdom")).toBe("GB");
    expect(mapEmploymentJurisdictionToWorkforceJurisdiction(" us ")).toBe("US");
  });

  it("missing values (null, undefined, empty, whitespace-only) return null, never a default jurisdiction", () => {
    for (const bad of [null, undefined, "", "   "]) {
      expect(mapEmploymentJurisdictionToWorkforceJurisdiction(bad)).toBeNull();
    }
  });

  it("malformed or unsupported values return null rather than being guessed", () => {
    for (const bad of ["France", "Nigeria", "de-eu", "de_EU_typo", "Deutschland", "N/A", "TBD", "unknown"]) {
      expect(mapEmploymentJurisdictionToWorkforceJurisdiction(bad)).toBeNull();
    }
  });

  it("deliberately narrow abbreviations/synonyms are NOT guessed — 'UK', 'USA', and 'Germany' alone are not anchored in either recognized source", () => {
    expect(mapEmploymentJurisdictionToWorkforceJurisdiction("UK")).toBeNull();
    expect(mapEmploymentJurisdictionToWorkforceJurisdiction("USA")).toBeNull();
    expect(mapEmploymentJurisdictionToWorkforceJurisdiction("Germany")).toBeNull();
    expect(mapEmploymentJurisdictionToWorkforceJurisdiction("EU")).toBeNull();
  });

  it("unknown/unsupported jurisdictions never default to GH, OTHER, or any other jurisdiction", () => {
    for (const bad of ["France", "Nigeria", "", null]) {
      const result = mapEmploymentJurisdictionToWorkforceJurisdiction(bad);
      expect(result).toBeNull();
      expect(result).not.toBe("GH");
      expect(result).not.toBe("OTHER");
    }
  });

  it("every canonical WorkforceJurisdiction value is independently reachable through this mapper", () => {
    for (const jurisdiction of WORKFORCE_JURISDICTIONS) {
      expect(mapEmploymentJurisdictionToWorkforceJurisdiction(jurisdiction)).toBe(jurisdiction);
    }
  });
});
