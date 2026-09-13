import { describe, expect, it } from "vitest";
import {
  classifyRequirement,
  STARTER_REQUIREMENT_CATALOG,
  WORKFORCE_RELATIONSHIPS,
  WORKFORCE_JURISDICTIONS,
  type RequirementRule,
} from "./requirementClassification";

// Ordift Studios — Compliance/COMP-SYS-1, Phase A1. All rule fixtures
// below are synthetic test data for proving resolver MECHANICS
// (precedence, conflict handling, fail-closed behavior, versioning) —
// none of them represent a real, approved legal determination for any
// jurisdiction. Only STARTER_REQUIREMENT_CATALOG (imported, not
// redefined here) is the real shipped content, and it is exercised
// separately at the bottom of this file.

const DOMAIN = "test_domain";

function rule(overrides: Partial<RequirementRule> & Pick<RequirementRule, "ruleKey">): RequirementRule {
  return {
    ruleVersion: 1,
    effectiveFrom: "2026-01-01",
    relationshipScope: "ANY",
    jurisdictionScope: "ANY",
    domain: DOMAIN,
    classification: "REVIEW_REQUIRED",
    ...overrides,
  };
}

describe("classifyRequirement — precedence", () => {
  it("1. exact relationship+jurisdiction wins over broader rules", () => {
    const rules = [
      rule({ ruleKey: "global", relationshipScope: "ANY", jurisdictionScope: "ANY", classification: "OPTIONAL" }),
      rule({ ruleKey: "rel-only", relationshipScope: "EMPLOYEE", jurisdictionScope: "ANY", classification: "REQUIRED" }),
      rule({ ruleKey: "exact", relationshipScope: "EMPLOYEE", jurisdictionScope: "GH", classification: "PROHIBITED" }),
    ];
    const result = classifyRequirement(rules, { relationship: "EMPLOYEE", jurisdiction: "GH", domain: DOMAIN });
    expect(result.classification).toBe("PROHIBITED");
    expect(result.ruleKey).toBe("exact");
  });

  it("2. relationship-specific + ANY jurisdiction fallback applies when no exact match exists", () => {
    const rules = [
      rule({ ruleKey: "global", classification: "OPTIONAL" }),
      rule({ ruleKey: "rel-only", relationshipScope: "EMPLOYEE", jurisdictionScope: "ANY", classification: "REQUIRED" }),
    ];
    const result = classifyRequirement(rules, { relationship: "EMPLOYEE", jurisdiction: "QA", domain: DOMAIN });
    expect(result.classification).toBe("REQUIRED");
    expect(result.ruleKey).toBe("rel-only");
  });

  it("3. ANY relationship + jurisdiction-specific fallback applies when no exact match exists", () => {
    const rules = [
      rule({ ruleKey: "global", classification: "OPTIONAL" }),
      rule({ ruleKey: "jur-only", relationshipScope: "ANY", jurisdictionScope: "GB", classification: "NOT_APPLICABLE" }),
    ];
    const result = classifyRequirement(rules, { relationship: "VENDOR", jurisdiction: "GB", domain: DOMAIN });
    expect(result.classification).toBe("NOT_APPLICABLE");
    expect(result.ruleKey).toBe("jur-only");
  });

  it("4. global ANY+ANY fallback applies when nothing more specific exists", () => {
    const rules = [rule({ ruleKey: "global", classification: "REVIEW_REQUIRED" })];
    const result = classifyRequirement(rules, { relationship: "CONTRACTOR", jurisdiction: "US", domain: DOMAIN });
    expect(result.classification).toBe("REVIEW_REQUIRED");
    expect(result.ruleKey).toBe("global");
  });
});

describe("classifyRequirement — fail-closed behavior", () => {
  it("5. unsupported jurisdiction value fails closed to REVIEW_REQUIRED", () => {
    const rules = [rule({ ruleKey: "global", classification: "REQUIRED" })];
    const result = classifyRequirement(rules, { relationship: "EMPLOYEE", jurisdiction: "FR", domain: DOMAIN });
    expect(result.classification).toBe("REVIEW_REQUIRED");
    expect(result.ruleKey).toBeNull();
    expect(result.reason).toMatch(/unsupported|unconfigured/i);
  });

  it("6. no applicable rule for the domain fails closed to REVIEW_REQUIRED", () => {
    const rules = [rule({ ruleKey: "other-domain", domain: "unrelated_domain", classification: "REQUIRED" })];
    const result = classifyRequirement(rules, { relationship: "EMPLOYEE", jurisdiction: "GH", domain: DOMAIN });
    expect(result.classification).toBe("REVIEW_REQUIRED");
    expect(result.ruleKey).toBeNull();
    expect(result.reason).toMatch(/no applicable rule/i);
  });

  it("7. equally-specific conflicting rules fail closed to REVIEW_REQUIRED with an exposed conflict reason", () => {
    const rules = [
      rule({ ruleKey: "a", relationshipScope: "EMPLOYEE", jurisdictionScope: "ANY", classification: "REQUIRED" }),
      rule({ ruleKey: "b", relationshipScope: "ANY", jurisdictionScope: "GH", classification: "PROHIBITED" }),
    ];
    const result = classifyRequirement(rules, { relationship: "EMPLOYEE", jurisdiction: "GH", domain: DOMAIN });
    expect(result.classification).toBe("REVIEW_REQUIRED");
    expect(result.ruleKey).toBeNull();
    expect(result.reason).toContain("a@v1=REQUIRED");
    expect(result.reason).toContain("b@v1=PROHIBITED");
  });

  it("20. malformed/unknown jurisdiction input (null, empty string, garbage) all fail closed to REVIEW_REQUIRED", () => {
    const rules = [rule({ ruleKey: "global", classification: "REQUIRED" })];
    for (const badJurisdiction of [null, undefined, "", "   ", "gh", "not-a-jurisdiction"]) {
      const result = classifyRequirement(rules, { relationship: "EMPLOYEE", jurisdiction: badJurisdiction, domain: DOMAIN });
      expect(result.classification).toBe("REVIEW_REQUIRED");
      expect(result.ruleKey).toBeNull();
    }
  });
});

describe("classifyRequirement — each classification value resolves correctly", () => {
  it("8. resolves PROHIBITED", () => {
    const rules = [rule({ ruleKey: "r", classification: "PROHIBITED" })];
    expect(classifyRequirement(rules, { relationship: "EMPLOYEE", jurisdiction: "GH", domain: DOMAIN }).classification).toBe("PROHIBITED");
  });

  it("9. resolves NOT_APPLICABLE", () => {
    const rules = [rule({ ruleKey: "r", classification: "NOT_APPLICABLE" })];
    expect(classifyRequirement(rules, { relationship: "VENDOR", jurisdiction: "QA", domain: DOMAIN }).classification).toBe("NOT_APPLICABLE");
  });

  it("10. resolves REQUIRED", () => {
    const rules = [rule({ ruleKey: "r", classification: "REQUIRED" })];
    expect(classifyRequirement(rules, { relationship: "EMPLOYEE", jurisdiction: "GB", domain: DOMAIN }).classification).toBe("REQUIRED");
  });

  it("11. resolves OPTIONAL", () => {
    const rules = [rule({ ruleKey: "r", classification: "OPTIONAL" })];
    expect(classifyRequirement(rules, { relationship: "MODEL_TALENT", jurisdiction: "OTHER", domain: DOMAIN }).classification).toBe("OPTIONAL");
  });

  it("12. resolves REVIEW_REQUIRED from an explicit rule (not merely a fail-closed default)", () => {
    const rules = [rule({ ruleKey: "r", classification: "REVIEW_REQUIRED" })];
    const result = classifyRequirement(rules, { relationship: "CONTRACTOR", jurisdiction: "DE_EU", domain: DOMAIN });
    expect(result.classification).toBe("REVIEW_REQUIRED");
    expect(result.ruleKey).toBe("r");
  });
});

describe("classifyRequirement — versioning and effective dates", () => {
  it("13. effective-date selection picks the version effective as of the given date", () => {
    const rules = [
      rule({ ruleKey: "r", ruleVersion: 1, effectiveFrom: "2025-01-01", classification: "OPTIONAL" }),
      rule({ ruleKey: "r", ruleVersion: 2, effectiveFrom: "2026-06-01", classification: "REQUIRED" }),
    ];
    const before = classifyRequirement(rules, { relationship: "EMPLOYEE", jurisdiction: "GH", domain: DOMAIN, asOfDate: "2026-01-01" });
    const after = classifyRequirement(rules, { relationship: "EMPLOYEE", jurisdiction: "GH", domain: DOMAIN, asOfDate: "2026-06-01" });
    expect(before.classification).toBe("OPTIONAL");
    expect(before.ruleVersion).toBe(1);
    expect(after.classification).toBe("REQUIRED");
    expect(after.ruleVersion).toBe(2);
  });

  it("14. a newer rule version does not retroactively alter an older-dated evaluation", () => {
    const v1Only = [rule({ ruleKey: "r", ruleVersion: 1, effectiveFrom: "2025-01-01", classification: "OPTIONAL" })];
    const v1AndV2 = [
      ...v1Only,
      rule({ ruleKey: "r", ruleVersion: 2, effectiveFrom: "2026-06-01", classification: "REQUIRED" }),
    ];
    const historicalQuery = { relationship: "EMPLOYEE" as const, jurisdiction: "GH", domain: DOMAIN, asOfDate: "2025-06-01" };
    const resultBeforeV2Existed = classifyRequirement(v1Only, historicalQuery);
    const resultAfterV2WasAdded = classifyRequirement(v1AndV2, historicalQuery);
    expect(resultBeforeV2Existed).toEqual(resultAfterV2WasAdded);
    expect(resultAfterV2WasAdded.classification).toBe("OPTIONAL");
    expect(resultAfterV2WasAdded.ruleVersion).toBe(1);
  });

  it("15. deterministic rule-version identity is returned in the result", () => {
    const rules = [rule({ ruleKey: "identity.gh.employee", ruleVersion: 3, effectiveFrom: "2026-03-01", classification: "REQUIRED" })];
    const result = classifyRequirement(rules, { relationship: "EMPLOYEE", jurisdiction: "GH", domain: DOMAIN, asOfDate: "2026-09-01" });
    expect(result).toEqual({
      classification: "REQUIRED",
      ruleKey: "identity.gh.employee",
      ruleVersion: 3,
      effectiveFrom: "2026-03-01",
      reason: 'Matched rule "identity.gh.employee" v3 (effective 2026-03-01).',
    });
  });
});

describe("classifyRequirement — relationship isolation", () => {
  it("16. an Employee-scoped rule does not leak to a Vendor query (falls through to a broader/fallback rule instead)", () => {
    const rules = [
      rule({ ruleKey: "employee-rule", relationshipScope: "EMPLOYEE", jurisdictionScope: "ANY", classification: "REQUIRED" }),
      rule({ ruleKey: "global", relationshipScope: "ANY", jurisdictionScope: "ANY", classification: "NOT_APPLICABLE" }),
    ];
    const result = classifyRequirement(rules, { relationship: "VENDOR", jurisdiction: "GH", domain: DOMAIN });
    expect(result.ruleKey).toBe("global");
    expect(result.classification).toBe("NOT_APPLICABLE");
  });

  it("17. a Vendor-scoped rule does not leak to an Employee query", () => {
    const rules = [
      rule({ ruleKey: "vendor-rule", relationshipScope: "VENDOR", jurisdictionScope: "ANY", classification: "NOT_APPLICABLE" }),
      rule({ ruleKey: "global", relationshipScope: "ANY", jurisdictionScope: "ANY", classification: "REQUIRED" }),
    ];
    const result = classifyRequirement(rules, { relationship: "EMPLOYEE", jurisdiction: "GH", domain: DOMAIN });
    expect(result.ruleKey).toBe("global");
    expect(result.classification).toBe("REQUIRED");
  });

  it("18. Model/Talent never resolves via an Employee-scoped rule — it does not silently become Employee", () => {
    const rules = [
      rule({ ruleKey: "employee-rule", relationshipScope: "EMPLOYEE", jurisdictionScope: "ANY", classification: "REQUIRED" }),
      rule({ ruleKey: "model-talent-rule", relationshipScope: "MODEL_TALENT", jurisdictionScope: "ANY", classification: "OPTIONAL" }),
    ];
    const result = classifyRequirement(rules, { relationship: "MODEL_TALENT", jurisdiction: "GH", domain: DOMAIN });
    expect(result.ruleKey).toBe("model-talent-rule");
    expect(result.classification).toBe("OPTIONAL");
  });

  it("19. grade/title/permission are never inputs to relationship classification — ClassificationQuery accepts only relationship/jurisdiction/domain/asOfDate", () => {
    const query = { relationship: "EMPLOYEE" as const, jurisdiction: "GH", domain: DOMAIN };
    expect(Object.keys(query).sort()).toEqual(["domain", "jurisdiction", "relationship"]);
    // WorkforceRelationship is a fixed, closed vocabulary — a caller cannot pass a
    // job title, grade name, or permission string in its place without a type error.
    expect(WORKFORCE_RELATIONSHIPS).toEqual(["EMPLOYEE", "CONTRACTOR", "VENDOR", "MODEL_TALENT"]);
  });
});

describe("WORKFORCE_JURISDICTIONS — supported set stays as specified", () => {
  it("keeps exactly the currently-approved jurisdiction list", () => {
    expect(WORKFORCE_JURISDICTIONS).toEqual(["GH", "QA", "GB", "DE_EU", "US", "OTHER"]);
  });
});

describe("STARTER_REQUIREMENT_CATALOG — shipped content stays deliberately minimal", () => {
  it("contains exactly one rule: a global ANY+ANY fallback resolving to REVIEW_REQUIRED", () => {
    expect(STARTER_REQUIREMENT_CATALOG).toHaveLength(1);
    const [only] = STARTER_REQUIREMENT_CATALOG;
    expect(only.relationshipScope).toBe("ANY");
    expect(only.jurisdictionScope).toBe("ANY");
    expect(only.classification).toBe("REVIEW_REQUIRED");
  });

  it("resolves every relationship/jurisdiction combination to REVIEW_REQUIRED (no jurisdiction-specific rule shipped yet)", () => {
    for (const relationship of WORKFORCE_RELATIONSHIPS) {
      for (const jurisdiction of WORKFORCE_JURISDICTIONS) {
        const result = classifyRequirement([...STARTER_REQUIREMENT_CATALOG], {
          relationship,
          jurisdiction,
          domain: "identity_document_collection",
        });
        expect(result.classification).toBe("REVIEW_REQUIRED");
      }
    }
  });
});
