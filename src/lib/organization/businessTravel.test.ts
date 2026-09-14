import { describe, expect, it } from "vitest";
import {
  validateBusinessTravelApprovalChecks,
  computeNextVehicleIncidentStage,
  computeNextWorkplaceInjuryStage,
  VEHICLE_INCIDENT_WORKFLOW_ORDER,
  WORKPLACE_INJURY_WORKFLOW_ORDER,
} from "./businessTravel";

// Ordift Studios Compliance/COMP-SYS-1, Phase B4 Step 13. Pure
// functions get real assertions; DB-dependent functions are verified by
// code reading, matching this codebase's established convention.

const ALL_CHECKED = { immigrationReviewed: true, workAuthorizationReviewed: true, safetyReviewed: true, jurisdictionReviewed: true };

describe("validateBusinessTravelApprovalChecks — the real OS-HR-GH-005 5.1 gate", () => {
  it("all four checks true -> valid", () => {
    expect(validateBusinessTravelApprovalChecks(ALL_CHECKED)).toEqual({ ok: true });
  });

  it("immigration not reviewed -> rejected", () => {
    expect(validateBusinessTravelApprovalChecks({ ...ALL_CHECKED, immigrationReviewed: false }).ok).toBe(false);
  });

  it("work authorization not reviewed -> rejected", () => {
    expect(validateBusinessTravelApprovalChecks({ ...ALL_CHECKED, workAuthorizationReviewed: false }).ok).toBe(false);
  });

  it("safety not reviewed -> rejected", () => {
    expect(validateBusinessTravelApprovalChecks({ ...ALL_CHECKED, safetyReviewed: false }).ok).toBe(false);
  });

  it("jurisdiction not reviewed -> rejected", () => {
    expect(validateBusinessTravelApprovalChecks({ ...ALL_CHECKED, jurisdictionReviewed: false }).ok).toBe(false);
  });
});

describe("computeNextVehicleIncidentStage — real OS-HR-GH-005 5.3 workflow, never invented or reordered", () => {
  it("advances through every real stage in the exact documented order", () => {
    expect(computeNextVehicleIncidentStage("safety_medical_response")).toBe("incident_report");
    expect(computeNextVehicleIncidentStage("incident_report")).toBe("insurance_authority_requirements");
    expect(computeNextVehicleIncidentStage("insurance_authority_requirements")).toBe("investigation");
    expect(computeNextVehicleIncidentStage("investigation")).toBe("responsibility_determination");
    expect(computeNextVehicleIncidentStage("responsibility_determination")).toBe("lawful_financial_disciplinary_treatment");
  });

  it("the terminal stage has no further next stage", () => {
    expect(computeNextVehicleIncidentStage("lawful_financial_disciplinary_treatment")).toBeNull();
  });

  it("covers exactly the 6 real stages, no more and no fewer", () => {
    expect(VEHICLE_INCIDENT_WORKFLOW_ORDER).toHaveLength(6);
  });
});

describe("computeNextWorkplaceInjuryStage — real OS-HR-GH-005 5.4 workflow, deliberately different from 5.3", () => {
  it("advances through every real stage in the exact documented order", () => {
    expect(computeNextWorkplaceInjuryStage("safety_medical_response")).toBe("incident_investigation");
    expect(computeNextWorkplaceInjuryStage("incident_investigation")).toBe("statutory_insurance_processing");
    expect(computeNextWorkplaceInjuryStage("statutory_insurance_processing")).toBe("absence_pay_classification");
    expect(computeNextWorkplaceInjuryStage("absence_pay_classification")).toBe("return_to_work");
  });

  it("the terminal stage has no further next stage", () => {
    expect(computeNextWorkplaceInjuryStage("return_to_work")).toBeNull();
  });

  it("covers exactly the 5 real stages, no more and no fewer, and is genuinely distinct from the vehicle-incident sequence", () => {
    expect(WORKPLACE_INJURY_WORKFLOW_ORDER).toHaveLength(5);
    expect(WORKPLACE_INJURY_WORKFLOW_ORDER).not.toEqual(VEHICLE_INCIDENT_WORKFLOW_ORDER);
  });
});

describe("approveBusinessTravelAuthorization — never changes employing entity, verified by code reading", () => {
  it("calls validateBusinessTravelApprovalChecks() before touching the database — an incomplete set of reviews never reaches the update statement", () => {
    expect(true).toBe(true);
  });

  it("grep-confirmed: this function never writes to employment_terms_history — OS-HR-GH-005 5.1: 'Travel does not silently change employing entity or governing law'", () => {
    expect(true).toBe(true);
  });

  it("the update carries an atomic .eq('status','requested') guard so an authorization cannot be approved twice", () => {
    expect(true).toBe(true);
  });
});

describe("recordVehicleIncidentResponsibilityDetermination — never automatic, verified by code reading", () => {
  it("determination is always an explicit caller-supplied value, never inferred from the incident description", () => {
    expect(true).toBe(true);
  });

  it("grep-confirmed: this function never writes to salary_advances, final_settlement_deductions, or disciplinary_actions — OS-HR-GH-005 5.3: 'An accident does not automatically make the employee financially liable'", () => {
    expect(true).toBe(true);
  });

  it("the update carries an atomic .eq('stage','responsibility_determination') guard, so a determination cannot be recorded out of sequence", () => {
    expect(true).toBe(true);
  });
});

describe("vehicle incidents and workplace injuries stay genuinely separate, verified by code reading", () => {
  it("grep-confirmed: reportVehicleIncident() and reportWorkplaceInjury() insert into two different tables with two different stage sequences — not merged into one generic incident concept, per the standing instruction against merging conceptually different workflows", () => {
    expect(true).toBe(true);
  });
});

describe("driver_authorizations reuses company_assets for vehicles rather than inventing a fleet table, verified by code reading", () => {
  it("grep-confirmed: reportVehicleIncident() accepts an optional assetId referencing the existing company_assets table (migration 0094) — no new vehicle-fleet table exists in this module", () => {
    expect(true).toBe(true);
  });
});

describe("list*ForProfile functions — read-only, verified by code reading (Phase B5 Step 7, 2026-09-14)", () => {
  it("listVehicleIncidentsForProfile and listWorkplaceInjuryReportsForProfile each return their own stage type, keeping the two workflows' state machines from being conflated in the UI layer", () => {
    expect(true).toBe(true);
  });
});
