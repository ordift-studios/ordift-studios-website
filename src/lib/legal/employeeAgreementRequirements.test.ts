import { describe, expect, it } from "vitest";
import {
  GHANA_EMPLOYEE_AGREEMENT_VARIABLE_CATALOG,
  ghanaEmployeeCatalogCoversAllVariables,
  classifyEmploymentAgreementVariable,
} from "./employeeAgreementRequirements";
import { EMPLOYMENT_AGREEMENT_VARIABLES } from "./documents/os-lgl-007-employee-employment-agreement";

// Ordift Studios Compliance/COMP-SYS-1, Phase B3 Step 2. Pure, no
// database dependency — every assertion below is real and executable.

describe("GHANA_EMPLOYEE_AGREEMENT_VARIABLE_CATALOG — structural integrity", () => {
  it("covers every EMPLOYMENT_AGREEMENT_VARIABLES key exactly once", () => {
    expect(ghanaEmployeeCatalogCoversAllVariables()).toBe(true);
    expect(GHANA_EMPLOYEE_AGREEMENT_VARIABLE_CATALOG).toHaveLength(EMPLOYMENT_AGREEMENT_VARIABLES.length);
  });

  it("every rule is scoped to EMPLOYEE + GH only — never a broader ANY scope", () => {
    for (const rule of GHANA_EMPLOYEE_AGREEMENT_VARIABLE_CATALOG) {
      expect(rule.relationshipScope).toBe("EMPLOYEE");
      expect(rule.jurisdictionScope).toBe("GH");
    }
  });

  it("restates EMPLOYMENT_AGREEMENT_VARIABLES' own required/optional split exactly — no new figure invented, no field silently changed", () => {
    for (const variable of EMPLOYMENT_AGREEMENT_VARIABLES) {
      const rule = GHANA_EMPLOYEE_AGREEMENT_VARIABLE_CATALOG.find((r) => r.domain === `employment_agreement.${variable.key}`);
      expect(rule).toBeDefined();
      expect(rule?.classification).toBe(variable.required ? "REQUIRED" : "OPTIONAL");
    }
  });

  it("no rule classifies PROHIBITED or NOT_APPLICABLE — none of the 16 Schedule A fields were reviewed as such in OS-HR-GH-001", () => {
    for (const rule of GHANA_EMPLOYEE_AGREEMENT_VARIABLE_CATALOG) {
      expect(["REQUIRED", "OPTIONAL"]).toContain(rule.classification);
    }
  });
});

describe("classifyEmploymentAgreementVariable — EMPLOYEE + GH", () => {
  it("basicWageSalary classifies REQUIRED", () => {
    const result = classifyEmploymentAgreementVariable({ relationship: "EMPLOYEE", jurisdiction: "GH", key: "basicWageSalary" });
    expect(result.classification).toBe("REQUIRED");
    expect(result.outcome).toBe("matched_rule");
  });

  it("probation classifies OPTIONAL", () => {
    const result = classifyEmploymentAgreementVariable({ relationship: "EMPLOYEE", jurisdiction: "GH", key: "probation" });
    expect(result.classification).toBe("OPTIONAL");
  });

  it("jurisdiction itself classifies REQUIRED", () => {
    const result = classifyEmploymentAgreementVariable({ relationship: "EMPLOYEE", jurisdiction: "GH", key: "jurisdiction" });
    expect(result.classification).toBe("REQUIRED");
  });
});

describe("classifyEmploymentAgreementVariable — fail-closed for any combination not EMPLOYEE + GH", () => {
  it("CONTRACTOR + GH has no rule -> REVIEW_REQUIRED (nobody has reviewed this combination)", () => {
    const result = classifyEmploymentAgreementVariable({ relationship: "CONTRACTOR", jurisdiction: "GH", key: "basicWageSalary" });
    expect(result.classification).toBe("REVIEW_REQUIRED");
    expect(result.outcome).toBe("no_applicable_rule");
  });

  it("EMPLOYEE + QA has no rule -> REVIEW_REQUIRED (Ghana content must never leak to Qatar)", () => {
    const result = classifyEmploymentAgreementVariable({ relationship: "EMPLOYEE", jurisdiction: "QA", key: "basicWageSalary" });
    expect(result.classification).toBe("REVIEW_REQUIRED");
    expect(result.outcome).toBe("no_applicable_rule");
  });

  it("MODEL_TALENT + GH has no rule -> REVIEW_REQUIRED (never silently treated as EMPLOYEE)", () => {
    const result = classifyEmploymentAgreementVariable({ relationship: "MODEL_TALENT", jurisdiction: "GH", key: "jobTitle" });
    expect(result.classification).toBe("REVIEW_REQUIRED");
  });
});
