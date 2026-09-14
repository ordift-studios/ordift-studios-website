import {
  classifyRequirement,
  type RequirementRule,
  type ClassificationResult,
  type WorkforceRelationship,
  type WorkforceJurisdiction,
} from "@/lib/compliance/requirementClassification";
import { EMPLOYMENT_AGREEMENT_VARIABLES, type EmploymentAgreementVariableKey } from "@/lib/legal/documents/os-lgl-007-employee-employment-agreement";

// Ordift Studios Compliance/COMP-SYS-1, Phase B3 Step 2 (2026-09-14) —
// replaces EMPLOYMENT_AGREEMENT_VARIABLES' flat required:boolean check
// with per-variable resolver-driven classification, per Founder
// authorization. This is deliberately scoped to EMPLOYEE relationship +
// GH jurisdiction only — the one combination Management has actually
// reviewed (OS-HR-GH-001 Section 2, "Ghana Employment Particulars":
// "Employing entity, actual work location, employment status, job
// title, grade, commencement/continuous-service date, probation where
// applicable, normal working pattern, salary/pay frequency, allowances,
// leave entitlement, notice provisions and other required particulars
// must be recorded"). No new legal figure is asserted here — every
// REQUIRED/OPTIONAL classification below restates EMPLOYMENT_AGREEMENT_VARIABLES'
// own pre-existing required flag (itself grounded in OS-LGL-007
// Schedule A's own bracketed-placeholder semantics — a field permitting
// "N/A"/"NONE" as genuine content is optional; one that doesn't is
// required), now additionally confirmed by OS-HR-GH-001's own Ghana-
// specific particulars list, and now expressed through the resolver
// instead of a flat array so it participates in the audit trail
// (requirement_evaluations) and in the REQUIRED/OPTIONAL/PROHIBITED/
// NOT_APPLICABLE/REVIEW_REQUIRED vocabulary uniformly.
//
// Any relationship/jurisdiction combination OTHER than EMPLOYEE+GH has
// deliberately NO rule here at all — classifyRequirement's own
// "no_applicable_rule" fail-closed path already resolves that to
// REVIEW_REQUIRED, which is exactly correct: nobody has reviewed what
// these variables should be for e.g. CONTRACTOR+GH or EMPLOYEE+QA yet.

const RULES_EFFECTIVE_FROM = "2026-09-14"; // OS-HR-GH-001's own effective date

function domainForVariable(key: EmploymentAgreementVariableKey): string {
  return `employment_agreement.${key}`;
}

// Mirrors EMPLOYMENT_AGREEMENT_VARIABLES' own required/optional split
// exactly (see file doc comment) — restated here as resolver rules, not
// changed.
const GHANA_EMPLOYEE_REQUIRED_KEYS: readonly EmploymentAgreementVariableKey[] = [
  "employerLegalName",
  "employeeLegalName",
  "jobTitle",
  "department",
  "startDate",
  "employmentType",
  "primaryWorkLocation",
  "normalWorkingHours",
  "basicWageSalary",
  "jurisdiction",
];
const GHANA_EMPLOYEE_OPTIONAL_KEYS: readonly EmploymentAgreementVariableKey[] = [
  "organizationalGrade",
  "reportingTo",
  "probation",
  "allowances",
  "annualLeave",
  "notice",
];

function buildRule(key: EmploymentAgreementVariableKey, classification: "REQUIRED" | "OPTIONAL"): RequirementRule {
  return {
    ruleKey: `employment_agreement.${key}.EMPLOYEE.GH`,
    ruleVersion: 1,
    effectiveFrom: RULES_EFFECTIVE_FROM,
    relationshipScope: "EMPLOYEE",
    jurisdictionScope: "GH",
    domain: domainForVariable(key),
    classification,
    notes:
      "Grounded in OS-HR-GH-001 Section 2 (Ghana Employment Particulars) and OS-LGL-007 Schedule A's own required-field semantics — restates existing approved content through the resolver, asserts no new legal figure.",
  };
}

export const GHANA_EMPLOYEE_AGREEMENT_VARIABLE_CATALOG: readonly RequirementRule[] = [
  ...GHANA_EMPLOYEE_REQUIRED_KEYS.map((key) => buildRule(key, "REQUIRED")),
  ...GHANA_EMPLOYEE_OPTIONAL_KEYS.map((key) => buildRule(key, "OPTIONAL")),
];

// Sanity — every EMPLOYMENT_AGREEMENT_VARIABLES key must have exactly
// one Ghana+EMPLOYEE rule, so a future new variable added to that array
// without a corresponding rule here fails loudly (a test), not silently.
export function ghanaEmployeeCatalogCoversAllVariables(): boolean {
  const covered = new Set(GHANA_EMPLOYEE_AGREEMENT_VARIABLE_CATALOG.map((r) => r.domain));
  return EMPLOYMENT_AGREEMENT_VARIABLES.every((v) => covered.has(domainForVariable(v.key)));
}

export function classifyEmploymentAgreementVariable(params: {
  relationship: WorkforceRelationship;
  jurisdiction: WorkforceJurisdiction;
  key: EmploymentAgreementVariableKey;
  asOfDate?: string;
}): ClassificationResult {
  return classifyRequirement(GHANA_EMPLOYEE_AGREEMENT_VARIABLE_CATALOG, {
    relationship: params.relationship,
    jurisdiction: params.jurisdiction,
    domain: domainForVariable(params.key),
    asOfDate: params.asOfDate,
  });
}
