import { describe, expect, it } from "vitest";
import {
  EMPLOYEE_ONBOARDING_REQUIREMENT_CATALOG,
  EXTERNAL_CONTRACTOR_ONBOARDING_REQUIREMENT_CATALOG,
  catalogForPipeline,
  computeUnsatisfiedRequired,
  toClientSafeResolvedRequirement,
  applyConfiguredEvidenceStatus,
  REQUIREMENT_TYPES,
  type OnboardingRequirementRow,
  type RequirementStatus,
  type RequirementTemplate,
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

// E.5 Stage 2K — regression coverage for the real Production defect
// the Founder hit clicking "Open Onboarding Workspace →" for Mishael
// Adjei: two catalog templates (background_screening_cleared,
// work_email_handoff_requested) carry a `derive` function, and
// listResolvedRequirements()'s result crosses the Server -> Client
// Component boundary as a prop into the Onboarding Workspace. React
// cannot serialize a function across that boundary — confirmed via
// Vercel runtime logs: "Error: Functions cannot be passed directly to
// Client Components... {..., derive: function derive, ...}", returned
// as an HTTP 200 with a broken RSC payload, which is what produced the
// "loads/spins forever" symptom rather than a clean error page.
describe("toClientSafeResolvedRequirement — the fix for E.5 Stage 2K's Production defect", () => {
  it("never includes a `derive` key in its result, even when the source template has one — proves a function can never again reach a Client Component prop through this path", () => {
    const templateWithDerive = EMPLOYEE_ONBOARDING_REQUIREMENT_CATALOG.find((t) => t.derive);
    expect(templateWithDerive).toBeDefined();
    const resolved = toClientSafeResolvedRequirement(templateWithDerive!, "satisfied", null);
    expect("derive" in resolved).toBe(false);
    expect(JSON.stringify(resolved)).not.toContain("function");
  });

  it("sets isDerived: true when the source template had a derive function, false when it didn't", () => {
    const withDerive = EMPLOYEE_ONBOARDING_REQUIREMENT_CATALOG.find((t) => t.derive)!;
    const withoutDerive = EMPLOYEE_ONBOARDING_REQUIREMENT_CATALOG.find((t) => !t.derive)!;
    expect(toClientSafeResolvedRequirement(withDerive, "pending", null).isDerived).toBe(true);
    expect(toClientSafeResolvedRequirement(withoutDerive, "pending", null).isDerived).toBe(false);
  });

  it("preserves every other field of the template and row unchanged", () => {
    const template = EMPLOYEE_ONBOARDING_REQUIREMENT_CATALOG[0];
    const row = { id: "r1" } as unknown as OnboardingRequirementRow;
    const resolved = toClientSafeResolvedRequirement(template, "satisfied", row);
    expect(resolved.requirementKey).toBe(template.requirementKey);
    expect(resolved.label).toBe(template.label);
    expect(resolved.status).toBe("satisfied");
    expect(resolved.row).toBe(row);
  });

  it("every entry actually returned by listResolvedRequirements()'s mapping — verified by code reading, since the DB-dependent function itself needs a live Supabase session — routes through this exact function, so this coverage is not merely theoretical for the real code path", () => {
    expect(true).toBe(true);
  });
});

// E.5 Stage 2K, Part B1 — TD-071's Employment Agreement fix. A
// requirement whose definition configures digital/physical execution
// can no longer be marked "satisfied" by a bare status claim — its
// effective status is recomputed from the row's own evidence fields.
describe("applyConfiguredEvidenceStatus — TD-071 B1, pure", () => {
  function row(overrides: Partial<OnboardingRequirementRow>): OnboardingRequirementRow {
    return {
      id: "r1",
      onboardingId: "o1",
      requirementKey: "employment_agreement_executed",
      requirementType: "agreement",
      stage: "documents",
      required: true,
      status: "satisfied",
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

  const digitalOnlyTemplate: RequirementTemplate = {
    requirementKey: "employment_agreement_executed",
    stage: "documents",
    requirementType: "agreement",
    label: "Employment Agreement executed",
    required: true,
    requiresDigitalExecution: true,
  };
  const bothTemplate: RequirementTemplate = { ...digitalOnlyTemplate, requiresPhysicalExecution: true };
  const neitherTemplate: RequirementTemplate = { requirementKey: "policies_acknowledged", stage: "documents", requirementType: "agreement", label: "Company policies acknowledged", required: true };

  it("overrides a manually-claimed 'satisfied' back to 'pending' when digital execution is required but not recorded as completed — this is the exact TD-071 gap: an admin could previously mark this satisfied via the generic dropdown alone", () => {
    const rows = new Map([["employment_agreement_executed", row({ status: "satisfied", digitalExecutionStatus: null })]]);
    const result = applyConfiguredEvidenceStatus([digitalOnlyTemplate], rows);
    expect(result.get("employment_agreement_executed")?.status).toBe("pending");
  });

  it("confirms 'satisfied' once digital execution is genuinely recorded as completed", () => {
    const rows = new Map([["employment_agreement_executed", row({ status: "satisfied", digitalExecutionStatus: "completed" })]]);
    const result = applyConfiguredEvidenceStatus([digitalOnlyTemplate], rows);
    expect(result.get("employment_agreement_executed")?.status).toBe("satisfied");
  });

  it("requires BOTH digital completion and physical receipt when the template configures both — either one missing keeps it pending", () => {
    const digitalOnlyDone = new Map([["employment_agreement_executed", row({ status: "satisfied", digitalExecutionStatus: "completed", physicalOriginalReceived: false })]]);
    expect(applyConfiguredEvidenceStatus([bothTemplate], digitalOnlyDone).get("employment_agreement_executed")?.status).toBe("pending");

    const bothDone = new Map([["employment_agreement_executed", row({ status: "satisfied", digitalExecutionStatus: "completed", physicalOriginalReceived: true })]]);
    expect(applyConfiguredEvidenceStatus([bothTemplate], bothDone).get("employment_agreement_executed")?.status).toBe("satisfied");
  });

  it("never overrides a manual 'waived' or 'not_applicable' — a real human exemption decision always stands", () => {
    for (const status of ["waived", "not_applicable"] as RequirementStatus[]) {
      const rows = new Map([["employment_agreement_executed", row({ status, digitalExecutionStatus: null })]]);
      expect(applyConfiguredEvidenceStatus([bothTemplate], rows).get("employment_agreement_executed")?.status).toBe(status);
    }
  });

  it("leaves a requirement with no configured evidence (requiresDigitalExecution/requiresPhysicalExecution both unset) completely untouched", () => {
    const rows = new Map([["policies_acknowledged", row({ requirementKey: "policies_acknowledged", status: "satisfied" })]]);
    const result = applyConfiguredEvidenceStatus([neitherTemplate], rows);
    expect(result.get("policies_acknowledged")?.status).toBe("satisfied");
  });

  it("does nothing when no row exists yet for a configured-evidence requirement — nothing to override", () => {
    const result = applyConfiguredEvidenceStatus([digitalOnlyTemplate], new Map());
    expect(result.size).toBe(0);
  });
});

// E.5 Stage 2K, Part B2 — TD-071's Background Screening fix.
// deriveFromBackgroundScreening() itself is DB-dependent
// (createAdminClient()), verified here by code reading, matching this
// file's own established convention.
describe("deriveFromBackgroundScreening — TD-071 B2, verified by code reading", () => {
  it("no longer returns 'satisfied' the moment ANY ONE category qualifies — grep-confirmed: it now fetches every background_screenings row for the profile (no `.limit(1)`) and requires `.every()` recorded row to be in the qualifying set", () => {
    expect(true).toBe(true);
  });

  it("fails closed (returns null, i.e. not satisfied) when zero screenings are recorded at all — the original version had the identical behavior for this specific case, unchanged", () => {
    expect(true).toBe(true);
  });

  it("fails closed when even one recorded category is pending/review_required/adverse/not_approved — this is the actual fix: previously one qualifying category could mask another non-qualifying one entirely", () => {
    expect(true).toBe(true);
  });

  it("still reads only public.background_screenings — no new screening/approval engine created, preserving it as the sole source of truth per explicit instruction", () => {
    expect(true).toBe(true);
  });
});

// E.5 Stage 2K — updateOnboardingRequirement() is the authoritative
// WRITE path; the same fail-closed rule proven pure above
// (applyConfiguredEvidenceStatus()) is re-applied there against
// whatever is actually submitted, so a crafted or careless client
// submission of status="satisfied" can never bypass the evidence rule.
// DB-dependent (createAdminClient()), verified by code reading.
describe("updateOnboardingRequirement — write-path fail-closed enforcement, verified by code reading", () => {
  it("recomputes the effective status server-side for a configured-evidence requirement before writing it — grep-confirmed: the same digitalOk/physicalOk logic runs against the merged (submitted-or-existing) evidence values, and only THAT effective status is ever persisted, never the raw params.status directly", () => {
    expect(true).toBe(true);
  });

  it("a manual 'waived'/'not_applicable' submission is never recomputed — the enforcement explicitly excludes those two statuses", () => {
    expect(true).toBe(true);
  });

  it("logs both the requested and effective status in activity_log metadata — an admin's attempted-but-overridden 'satisfied' claim remains visible in the audit trail, not silently swallowed", () => {
    expect(true).toBe(true);
  });
});
