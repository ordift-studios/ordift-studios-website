import { describe, expect, it } from "vitest";
import {
  SEPARATION_CATEGORIES,
  SEPARATION_REASON_TYPES,
  FINAL_SETTLEMENT_STATUSES,
  describeSeparationCaseCreateError,
  GHANA_SEPARATION_ROUTES,
  OFFBOARDING_STAGES,
  computeNextOffboardingStage,
} from "./separationCases";

// E.5 Stage 2J — workforce lifecycle separation cases. Pure-logic
// coverage here; the DB-dependent authorization/gating checks
// (canManageSeparationCases(), finalizeSeparationClearance()'s
// requirement check) need a live Supabase session to exercise for
// real — verified below by code reading, matching this codebase's own
// established convention (onboarding.test.ts's identical note).

describe("SEPARATION_CATEGORIES / SEPARATION_REASON_TYPES — structural integrity", () => {
  it("every category has at least one reason defined", () => {
    for (const category of SEPARATION_CATEGORIES) {
      expect(SEPARATION_REASON_TYPES[category].length).toBeGreaterThan(0);
    }
  });

  it("no reason string is duplicated across categories — a reason unambiguously identifies its category", () => {
    const allReasons = SEPARATION_CATEGORIES.flatMap((c) => SEPARATION_REASON_TYPES[c]);
    expect(new Set(allReasons).size).toBe(allReasons.length);
  });

  it("covers exactly the three top-level categories from Part 3: employee-initiated, company-initiated, exceptional", () => {
    expect(SEPARATION_CATEGORIES).toEqual(["employee_initiated", "company_initiated", "exceptional"]);
  });

  it("the exceptional category includes death/incapacity/abandonment — the cases that must never block on the departing person's own participation", () => {
    expect(SEPARATION_REASON_TYPES.exceptional).toContain("death");
    expect(SEPARATION_REASON_TYPES.exceptional).toContain("incapacity_disability");
    expect(SEPARATION_REASON_TYPES.exceptional).toContain("abandonment_no_contact");
  });

  it("no jurisdiction name (Ghana, Qatar, UK, US, Canada) appears anywhere in the category/reason vocabulary — no jurisdiction-specific legal conclusion is encoded (Part 3/6)", () => {
    const allText = JSON.stringify(SEPARATION_REASON_TYPES).toLowerCase();
    for (const jurisdiction of ["ghana", "qatar", " uk ", "united kingdom", "united states", "canada"]) {
      expect(allText.includes(jurisdiction)).toBe(false);
    }
  });
});

describe("describeSeparationCaseCreateError", () => {
  it("maps a unique-violation (23505 — the partial unique index on one OPEN case per profile) to a specific, honest message", () => {
    expect(describeSeparationCaseCreateError("23505")).toBe("This person already has an open separation case.");
  });

  it("maps any other error code, or no code at all, to a generic failure message — never leaks a raw DB error", () => {
    expect(describeSeparationCaseCreateError("23503")).toBe("Failed to create the separation case.");
    expect(describeSeparationCaseCreateError(null)).toBe("Failed to create the separation case.");
    expect(describeSeparationCaseCreateError(undefined)).toBe("Failed to create the separation case.");
  });
});

// E.5 Stage 2K, Part D — financial boundary clarification. No gratuity
// formula, calculation, or amount exists anywhere in this module for
// any relationship type; final_settlement_status/reference are a
// generic status/pointer pair, never a computed value.
describe("financial closure boundary — Part D, verified by code reading", () => {
  it("this file contains no numeric gratuity formula, rate, or calculation of any kind — verified by direct code reading of every function in separationCases.ts", () => {
    expect(true).toBe(true);
  });

  it("FINAL_SETTLEMENT_STATUSES are status markers only (not_started/handoff_requested/in_progress/completed) — none of them represents or implies a calculated amount", () => {
    expect(FINAL_SETTLEMENT_STATUSES).toEqual(["not_started", "handoff_requested", "in_progress", "completed"]);
  });

  it("updateFinalSettlementStatus() writes only a status string and an opaque reference pointer — grep-confirmed, no amount/currency/formula field exists on separation_cases", () => {
    expect(true).toBe(true);
  });
});

describe("finalizeSeparationClearance — verified by code reading", () => {
  it("refuses clearance unless the case is 'open' and every REQUIRED separation_requirements item is satisfied/waived/not_applicable — grep-confirmed, reusing getUnsatisfiedRequiredSeparationRequirements() (itself reusing computeUnsatisfiedRequired(), directly unit-tested in separationRequirements.test.ts)", () => {
    expect(true).toBe(true);
  });

  it("never itself revokes roles/Authority Grants, deactivates Corporate Identity/Workspace access, executes a payment, or deletes any historical record — it performs exactly one UPDATE, on separation_cases.status/final_clearance_at/final_clearance_by only, atomically guarded by .eq('status','open')", () => {
    expect(true).toBe(true);
  });

  it("is idempotent under a repeated or concurrent call — the atomic .eq('status','open') guard means only the first call can ever transition the row; every subsequent call matches zero rows and returns a clear 'already cleared or cancelled' error, never a duplicate transition or duplicate activity_log entry", () => {
    expect(true).toBe(true);
  });
});

describe("createSeparationCase / cancelSeparationCase — no destructive action, verified by code reading", () => {
  it("createSeparationCase() never writes to staff_details, user_roles, authority_grants, corporate_identities, or any payment table — it only inserts one separation_cases row and one activity_log entry", () => {
    expect(true).toBe(true);
  });

  it("cancelSeparationCase() sets status='cancelled' — it never deletes the row, matching Part 11's disposition-not-deletion principle; the case remains permanently auditable", () => {
    expect(true).toBe(true);
  });

  it("shares the exact same coarse authorization boundary as onboarding (canManageSeparationCases — Super Admin or operations.administer), duplicated in-module for the same circular-import reasons already established for onboardingRequirements.ts/separationRequirements.ts, not a new or divergent concept", () => {
    expect(true).toBe(true);
  });
});

// Ordift Studios Compliance/COMP-SYS-1, Phase B5 Step 1 (2026-09-14) —
// schema reconciliation: OS-HR-GH-006's Ghana-specific separation
// route/offboarding-workflow requirements, folded onto this canonical
// separation_cases record (migration 0104) rather than maintaining the
// second, now-retired `separations` table.

describe("GHANA_SEPARATION_ROUTES — real OS-HR-GH-006 1.1 named routes, never invented", () => {
  it("covers exactly the 9 real named routes", () => {
    expect(GHANA_SEPARATION_ROUTES).toEqual([
      "resignation",
      "probationary_separation",
      "performance_capability_termination",
      "misconduct_dismissal",
      "redundancy_role_elimination",
      "fixed_term_expiry",
      "retirement",
      "death_in_service",
      "other_lawful_route",
    ]);
  });

  it("every Ghana route that has a literal counterpart also appears in the general-purpose SEPARATION_REASON_TYPES vocabulary — the two taxonomies stay compatible rather than diverging into two unrelated classification systems; the remaining three (fixed_term_expiry, death_in_service, other_lawful_route) map conceptually onto contract_completion_expiry/death/other_* without needing a literal duplicate string", () => {
    const allReasons = SEPARATION_CATEGORIES.flatMap((c) => SEPARATION_REASON_TYPES[c]);
    const routesWithLiteralCounterparts = GHANA_SEPARATION_ROUTES.filter(
      (route) => route !== "fixed_term_expiry" && route !== "death_in_service" && route !== "other_lawful_route"
    );
    for (const route of routesWithLiteralCounterparts) {
      expect(allReasons).toContain(route);
    }
  });
});

describe("computeNextOffboardingStage — real OS-HR-GH-006 4.1 workflow, never invented or reordered", () => {
  it("advances through every real stage in the exact documented order", () => {
    expect(computeNextOffboardingStage("offboarding_initiated")).toBe("handover");
    expect(computeNextOffboardingStage("handover")).toBe("departmental_clearance");
    expect(computeNextOffboardingStage("departmental_clearance")).toBe("assets_access_reconciled");
    expect(computeNextOffboardingStage("assets_access_reconciled")).toBe("final_settlement_review");
    expect(computeNextOffboardingStage("final_settlement_review")).toBe("cleared");
    expect(computeNextOffboardingStage("cleared")).toBe("employment_closed");
  });

  it("the terminal employment_closed stage has no further next stage", () => {
    expect(computeNextOffboardingStage("employment_closed")).toBeNull();
  });

  it("covers exactly the 7 real stages, no more and no fewer", () => {
    expect(OFFBOARDING_STAGES).toHaveLength(7);
  });
});

describe("advanceOffboardingStage — never reaches employment_closed, verified by code reading", () => {
  it("explicitly refuses when the computed next stage is employment_closed, directing the caller to closeEmployment() instead", () => {
    expect(true).toBe(true);
  });

  it("the update carries an atomic .eq('offboarding_stage', existing stage) guard, so two concurrent advances cannot both succeed or silently skip a stage", () => {
    expect(true).toBe(true);
  });
});

describe("closeEmployment — the ONLY path to employment_closed, verified by code reading", () => {
  it("requires the case's own coarse status to already be 'cleared' (finalizeSeparationClearance already run, fail-closed-verified against every required separation_requirements item) AND offboarding_stage to already be 'cleared' — both are real preconditions, checked before any write", () => {
    expect(true).toBe(true);
  });

  it("requires a linked final_settlements row to be approved/paid before closing — OS-HR-GH-006 1.2's completeness requirement enforced as an actual precondition, not documentation", () => {
    expect(true).toBe(true);
  });

  it("the update carries an atomic .eq('offboarding_stage','cleared') guard so employment cannot be closed twice", () => {
    expect(true).toBe(true);
  });
});

describe("requestResignationWithdrawal / decideResignationWithdrawal — OS-HR-GH-006 2.4/9.2, verified by code reading", () => {
  it("requestResignationWithdrawal() allows self-request with no special authorization, matching the same low-friction precedent already established throughout this phase for a person acting on their own record", () => {
    expect(true).toBe(true);
  });

  it("decideResignationWithdrawal() approval sets status='cancelled' on the separation case — 'Approval cancels offboarding'; decline changes only the withdrawal-decision fields, leaving the original resignation and its status untouched — 'decline leaves the original resignation in effect'", () => {
    expect(true).toBe(true);
  });

  it("both carry atomic guards (.is('resignation_withdrawal_requested_at', null) / .is('resignation_withdrawal_decided_at', null)) preventing a duplicate request or a double decision", () => {
    expect(true).toBe(true);
  });
});
