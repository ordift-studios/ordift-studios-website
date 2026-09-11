import { describe, expect, it } from "vitest";
import {
  EMPLOYEE_ONBOARDING_REQUIREMENT_CATALOG,
  EXTERNAL_CONTRACTOR_ONBOARDING_REQUIREMENT_CATALOG,
  catalogForPipeline,
  computeUnsatisfiedRequired,
  REQUIREMENT_TYPES,
  type OnboardingRequirementRow,
  type RequirementStatus,
} from "./onboardingRequirements";
import { isValidStage } from "./onboardingStages";

// E.5 Stage 2I, Part B/L (2026-09-11) — requirement/gating foundation.
// computeUnsatisfiedRequired() is the pure core of both completion
// gating (completeStaffOnboarding()) and stage-advance gating
// (advanceOnboardingStage()), deliberately isolated from Supabase I/O
// so it's directly unit-testable, matching this codebase's own
// preference for separating a pure decision from its DB-dependent
// wiring (e.g. describeOnboardingStartError() in onboarding.test.ts).

function row(overrides: Partial<OnboardingRequirementRow>): OnboardingRequirementRow {
  return {
    id: "row-1",
    onboardingId: "onboarding-1",
    requirementKey: "x",
    requirementType: "task",
    stage: "documents",
    required: true,
    status: "pending",
    responsibleRole: null,
    digitalExecutionStatus: null,
    physicalOriginalRequired: false,
    physicalOriginalReceived: false,
    evidenceReference: null,
    notes: null,
    completedAt: null,
    completedBy: null,
    verifiedAt: null,
    verifiedBy: null,
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe("EMPLOYEE_ONBOARDING_REQUIREMENT_CATALOG — structural integrity", () => {
  it("has no duplicate requirementKey", () => {
    const keys = EMPLOYEE_ONBOARDING_REQUIREMENT_CATALOG.map((t) => t.requirementKey);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("every entry's stage is a real employee-pipeline stage", () => {
    for (const t of EMPLOYEE_ONBOARDING_REQUIREMENT_CATALOG) {
      expect(isValidStage("employee", t.stage)).toBe(true);
    }
  });

  it("every entry's requirementType is one of the seven defined types", () => {
    for (const t of EMPLOYEE_ONBOARDING_REQUIREMENT_CATALOG) {
      expect(REQUIREMENT_TYPES).toContain(t.requirementType);
    }
  });
});

describe("EXTERNAL_CONTRACTOR_ONBOARDING_REQUIREMENT_CATALOG — deliberately empty for now", () => {
  it("has no entries yet (Part C — implement only what's needed for the current Internal Staff validation)", () => {
    expect(EXTERNAL_CONTRACTOR_ONBOARDING_REQUIREMENT_CATALOG).toEqual([]);
  });
});

describe("catalogForPipeline", () => {
  it("returns the employee catalog for 'employee' and the (empty) external catalog otherwise", () => {
    expect(catalogForPipeline("employee")).toBe(EMPLOYEE_ONBOARDING_REQUIREMENT_CATALOG);
    expect(catalogForPipeline("external_contractor")).toBe(EXTERNAL_CONTRACTOR_ONBOARDING_REQUIREMENT_CATALOG);
  });
});

describe("computeUnsatisfiedRequired — the real gating decision, pure", () => {
  const catalog = [
    { requirementKey: "a", stage: "documents", requirementType: "agreement" as const, label: "A (required)", required: true },
    { requirementKey: "b", stage: "documents", requirementType: "task" as const, label: "B (optional)", required: false },
    { requirementKey: "c", stage: "work_email", requirementType: "external_handoff" as const, label: "C (required, later stage)", required: true },
  ];

  it("a required item with no row and no derived opinion is unsatisfied — never silently satisfied by default", () => {
    const result = computeUnsatisfiedRequired(catalog, new Map(), new Map());
    expect(result.map((r) => r.requirementKey)).toEqual(["a", "c"]);
  });

  it("optional items never block, regardless of status", () => {
    const result = computeUnsatisfiedRequired(catalog, new Map(), new Map());
    expect(result.find((r) => r.requirementKey === "b")).toBeUndefined();
  });

  it("a persisted 'satisfied' row removes the item from the unsatisfied list", () => {
    const rows = new Map([["a", row({ requirementKey: "a", status: "satisfied" })]]);
    const result = computeUnsatisfiedRequired(catalog, rows, new Map());
    expect(result.map((r) => r.requirementKey)).toEqual(["c"]);
  });

  it("'waived' and 'not_applicable' also satisfy — completion is never blocked on something legitimately inapplicable", () => {
    for (const status of ["waived", "not_applicable"] as RequirementStatus[]) {
      const rows = new Map([["a", row({ requirementKey: "a", status })]]);
      const result = computeUnsatisfiedRequired(catalog, rows, new Map());
      expect(result.map((r) => r.requirementKey)).not.toContain("a");
    }
  });

  it("a derived 'satisfied' result (no persisted row) also satisfies", () => {
    const derived = new Map<string, RequirementStatus | null>([["a", "satisfied"]]);
    const result = computeUnsatisfiedRequired(catalog, new Map(), derived);
    expect(result.map((r) => r.requirementKey)).not.toContain("a");
  });

  it("a persisted row always wins over a derived result (a manual waiver overrides a live-derived pending)", () => {
    const rows = new Map([["a", row({ requirementKey: "a", status: "waived" })]]);
    const derived = new Map<string, RequirementStatus | null>([["a", "pending" as RequirementStatus]]);
    const result = computeUnsatisfiedRequired(catalog, rows, derived);
    expect(result.map((r) => r.requirementKey)).not.toContain("a");
  });

  it("filtering by stage only returns required items gating THAT stage — a later stage's requirement never blocks an earlier one", () => {
    const result = computeUnsatisfiedRequired(catalog, new Map(), new Map(), "documents");
    expect(result.map((r) => r.requirementKey)).toEqual(["a"]);
  });

  it("an onboarding record with zero persisted rows (e.g. one started before this feature existed) still computes real, non-vacuous gating from the catalog alone", () => {
    // This is the exact scenario this design was built to handle safely:
    // Mishael Adjei's onboarding (started Stage 2G, before this
    // foundation existed) has zero onboarding_requirements rows. This
    // proves gating is meaningful for him without ever writing to his
    // Production record.
    const result = computeUnsatisfiedRequired(EMPLOYEE_ONBOARDING_REQUIREMENT_CATALOG, new Map(), new Map());
    expect(result.length).toBeGreaterThan(0);
  });
});
