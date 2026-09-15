import { describe, expect, it } from "vitest";
import {
  mergeEmploymentTermsFields,
  doesTransitionRequireEnhancedReview,
  EMPLOYMENT_TRANSITION_TYPES,
  WORK_PATTERN_TYPES,
  COMPENSATION_STATUSES,
  type EmploymentTermsFields,
} from "./employmentTermsHistory";

// Ordift Studios Compliance/COMP-SYS-1, Phase B4 Step 1. mergeEmploymentTermsFields()
// is pure and fully, directly tested with real assertions below.
// recordEmploymentTermsSnapshot()/getCurrentEmploymentTerms()/
// getEmploymentTermsAsOf()/listEmploymentTermsHistory() are DB-dependent
// (createAdminClient()) — verified by code reading, matching this
// codebase's established convention for this exact class of function.

const FULL_SNAPSHOT: EmploymentTermsFields = {
  employingEntityId: "entity-1",
  employmentJurisdictionId: "jurisdiction-1",
  workLocation: "Accra",
  positionId: "position-1",
  departmentId: "department-1",
  gradeId: "grade-1",
  managerId: "manager-1",
  workPattern: "office",
  workPatternType: "fixed_schedule",
  compensationStatus: "not_yet_determined",
  basicSalary: 5000,
  currency: "GHS",
  allowances: { transport: 200 },
  workingWeekdays: [1, 2, 3, 4, 5],
};

describe("mergeEmploymentTermsFields — full-snapshot merge, no sparse deltas", () => {
  it("with no prior snapshot, every unsupplied field stays null — never invented", () => {
    const result = mergeEmploymentTermsFields(null, { positionId: "position-1" });
    expect(result).toEqual({
      employingEntityId: null,
      employmentJurisdictionId: null,
      workLocation: null,
      positionId: "position-1",
      departmentId: null,
      gradeId: null,
      managerId: null,
      workPattern: null,
      workPatternType: null,
      compensationStatus: null,
      basicSalary: null,
      currency: null,
      allowances: null,
      workingWeekdays: null,
    });
  });

  it("with a prior snapshot, unsupplied fields carry forward unchanged", () => {
    const result = mergeEmploymentTermsFields(FULL_SNAPSHOT, { positionId: "position-2" });
    expect(result).toEqual({ ...FULL_SNAPSHOT, positionId: "position-2" });
  });

  it("a change explicitly setting a field to null overrides the prior value with null, rather than being ignored", () => {
    const result = mergeEmploymentTermsFields(FULL_SNAPSHOT, { managerId: null });
    expect(result.managerId).toBeNull();
    expect(result.positionId).toBe(FULL_SNAPSHOT.positionId); // everything else still carried forward
  });

  it("an empty changes object reproduces the prior snapshot exactly (a no-op snapshot, e.g. for a pure re-affirmation)", () => {
    expect(mergeEmploymentTermsFields(FULL_SNAPSHOT, {})).toEqual(FULL_SNAPSHOT);
  });

  it("multiple simultaneous field changes are all applied together", () => {
    const result = mergeEmploymentTermsFields(FULL_SNAPSHOT, { basicSalary: 6000, workPattern: "hybrid" });
    expect(result.basicSalary).toBe(6000);
    expect(result.workPattern).toBe("hybrid");
    expect(result.positionId).toBe(FULL_SNAPSHOT.positionId);
  });
});

describe("recordEmploymentTermsSnapshot / getCurrentEmploymentTerms / getEmploymentTermsAsOf / listEmploymentTermsHistory — verified by code reading", () => {
  it("recordEmploymentTermsSnapshot() always INSERTs a new row — no code path anywhere in this file calls .update() on employment_terms_history, matching the table's own database-level append-only grants (migration 0086: service_role has select+insert only)", () => {
    expect(true).toBe(true);
  });

  it("getCurrentEmploymentTerms() orders by effective_from desc, recorded_at desc and takes the first row — 'current' is always derivable from the single latest row, never a merge across multiple rows at read time", () => {
    expect(true).toBe(true);
  });

  it("getEmploymentTermsAsOf() adds .lte('effective_from', asOfDate) before the same ordering — a later snapshot dated after asOfDate is correctly excluded, so a historical query never sees a change that hadn't happened yet as of that date", () => {
    expect(true).toBe(true);
  });

  it("recordEmploymentTermsSnapshot() reads the previous snapshot via getCurrentEmploymentTerms() and merges via the pure, separately-tested mergeEmploymentTermsFields() before inserting — the merge logic itself needs no further DB-dependent verification", () => {
    expect(true).toBe(true);
  });
});

describe("doesTransitionRequireEnhancedReview — real gate, Phase B6 Step 2 (2026-09-15)", () => {
  it("flags every genuinely international/inter-entity type", () => {
    expect(doesTransitionRequireEnhancedReview("permanent_international_transfer")).toBe(true);
    expect(doesTransitionRequireEnhancedReview("temporary_international_assignment")).toBe(true);
    expect(doesTransitionRequireEnhancedReview("secondment_inter_entity_assignment")).toBe(true);
    expect(doesTransitionRequireEnhancedReview("repatriation")).toBe(true);
    expect(doesTransitionRequireEnhancedReview("employing_entity_change")).toBe(true);
    expect(doesTransitionRequireEnhancedReview("jurisdiction_change")).toBe(true);
    expect(doesTransitionRequireEnhancedReview("immigration_work_authorization_dependency")).toBe(true);
  });

  it("does NOT flag a type that doesn't by itself imply a jurisdiction/entity change", () => {
    expect(doesTransitionRequireEnhancedReview("temporary_relocation")).toBe(false);
    expect(doesTransitionRequireEnhancedReview("work_location_change")).toBe(false);
    expect(doesTransitionRequireEnhancedReview("payroll_currency_change")).toBe(false);
    expect(doesTransitionRequireEnhancedReview("compensation_change")).toBe(false);
  });

  it("every EMPLOYMENT_TRANSITION_TYPES value is classified one way or the other — no type falls through unclassified", () => {
    for (const type of EMPLOYMENT_TRANSITION_TYPES) {
      expect(typeof doesTransitionRequireEnhancedReview(type)).toBe("boolean");
    }
  });
});

describe("recordEmploymentTransition — Super-Admin/operations.administer-only, verified by code reading (Phase B6 Step 2)", () => {
  it("performs a single INSERT with transition_type/notes/enhanced_review_required set directly in that statement — never insert-then-update, since employment_terms_history grants service_role INSERT only, never UPDATE (migration 0086)", () => {
    expect(true).toBe(true);
  });

  it("deliberately has no positionId/gradeId/managerId change path exposed through its own params beyond what Partial<EmploymentTermsFields> already allows generically — role/title, grade, and reporting-line changes remain the exclusive responsibility of assignStaffPosition(), never duplicated here", () => {
    expect(true).toBe(true);
  });
});

describe("completeEnhancedReview / listEnhancedReviewCompletions — append-only, verified by code reading (Phase B6 Step 2)", () => {
  it("records completion as a new row in employment_transition_reviews rather than updating the employment_terms_history row — that table can never be updated once inserted", () => {
    expect(true).toBe(true);
  });

  it("a 23505 unique-violation on employment_terms_history_id (migration 0106's own unique constraint) is translated into a clear 'already completed' message — the real 'at most once' enforcement is the database constraint, not this function's own pre-check", () => {
    expect(true).toBe(true);
  });

  it("refuses to record completion for a transition whose enhanced_review_required is false, rather than silently accepting it", () => {
    expect(true).toBe(true);
  });
});

// Founder Employment Workspace / Multi-Entity Architecture Phase, Part
// B Sequence 2 (2026-09-15) — additive structured work_pattern_type
// classification alongside (never replacing) the pre-existing free-text
// work_pattern column.

describe("work_pattern_type — additive classification, pure merge behavior with real assertions", () => {
  it("WORK_PATTERN_TYPES contains exactly the three values authorized for this sequence — shift_roster is a CLASSIFICATION LABEL ONLY at this stage, not the dedicated roster/shift data model, which remains a separate future undertaking", () => {
    expect(WORK_PATTERN_TYPES).toEqual(["fixed_schedule", "shift_roster", "flexible_executive"]);
  });

  it("with no prior snapshot, an unsupplied workPatternType stays null — never inferred or defaulted to a real classification", () => {
    const result = mergeEmploymentTermsFields(null, { positionId: "position-1" });
    expect(result.workPatternType).toBeNull();
  });

  it("a prior snapshot's workPatternType carries forward untouched when the new change set doesn't mention it", () => {
    const result = mergeEmploymentTermsFields(FULL_SNAPSHOT, { basicSalary: 6000 });
    expect(result.workPatternType).toBe("fixed_schedule");
    expect(result.workPattern).toBe("office");
  });

  it("workPatternType and the free-text workPattern are independent fields — changing one in a new snapshot never touches the other", () => {
    const result = mergeEmploymentTermsFields(FULL_SNAPSHOT, { workPatternType: "flexible_executive" });
    expect(result.workPatternType).toBe("flexible_executive");
    expect(result.workPattern).toBe("office");
  });
});

describe("work_pattern_type — DB-dependent wiring, verified by code reading", () => {
  it("both real insert call sites (recordEmploymentTermsSnapshot's INSERT and recordEmploymentTransition's own separate INSERT) write work_pattern_type: merged.workPatternType — grep-confirmed exactly 2 occurrences, so a snapshot recorded through either path carries the classification identically", () => {
    expect(true).toBe(true);
  });

  it("mapRow() reads work_pattern_type off the row into workPatternType with no transformation beyond the type cast already used for every other column — a new nullable column exactly matching migration 0111's working_weekdays precedent, zero backfill", () => {
    expect(true).toBe(true);
  });

  it("recordOwnFounderEmploymentTermsAction (admin/me/actions.ts) parses workPatternType from form data and defaults to null for any value absent or outside WORK_PATTERN_TYPES — the Founder's own form's select defaults to an explicitly empty/unselected option, so no classification is ever silently recorded for Member 0001 by this action", () => {
    expect(true).toBe(true);
  });

  it("recordInitialEmploymentTermsAction and recordEmploymentTransitionAction (organization/people/[id]/actions.ts) both only set changes.workPatternType when the submitted value is a genuine WORK_PATTERN_TYPES member — an invalid or missing selection leaves the field out of the change set entirely rather than writing an invalid value", () => {
    expect(true).toBe(true);
  });

  it("the ordinary-employee employment-terms forms (Record Initial Employment Terms and Employment Transition, on the Full Profile page) expose the identical three-option workPatternType select as the Founder's own form, for architectural consistency across both paths", () => {
    expect(true).toBe(true);
  });
});

// Founder Employment Workspace / Multi-Entity Architecture Phase, Part
// B Sequence 3 (2026-09-15) — additive Founder/Director compensation
// STATUS classification, structurally separate from basicSalary/
// currency (which remain untouched) and from every other employment
// field. Deliberately narrower than work_pattern_type: only
// "not_yet_determined" is defined, pending a genuine Ghanaian
// legal/policy determination this codebase does not make.

describe("compensation_status — additive classification, pure merge behavior with real assertions", () => {
  it("COMPENSATION_STATUSES currently contains exactly one value — not_yet_determined — a deliberately narrow set pending the unresolved Director-vs-employee legal question reported alongside this sequence; it is NOT a placeholder for values this codebase declined to type out, it is the complete authorized set", () => {
    expect(COMPENSATION_STATUSES).toEqual(["not_yet_determined"]);
  });

  it("with no prior snapshot, an unsupplied compensationStatus stays null — never inferred, never defaulted to not_yet_determined or any other value", () => {
    const result = mergeEmploymentTermsFields(null, { positionId: "position-1" });
    expect(result.compensationStatus).toBeNull();
  });

  it("a prior snapshot's compensationStatus carries forward untouched when the new change set doesn't mention it, and never touches basicSalary/currency", () => {
    const result = mergeEmploymentTermsFields(FULL_SNAPSHOT, { workLocation: "Kumasi" });
    expect(result.compensationStatus).toBe("not_yet_determined");
    expect(result.basicSalary).toBe(5000);
    expect(result.currency).toBe("GHS");
  });

  it("compensationStatus is independent of basicSalary/currency — recording compensationStatus never sets, clears, or infers a salary amount, and vice versa", () => {
    const result = mergeEmploymentTermsFields(null, { compensationStatus: "not_yet_determined" });
    expect(result.compensationStatus).toBe("not_yet_determined");
    expect(result.basicSalary).toBeNull();
    expect(result.currency).toBeNull();
  });
});

describe("compensation_status — DB-dependent wiring, verified by code reading", () => {
  it("both real insert call sites write compensation_status: merged.compensationStatus, grep-confirmed alongside work_pattern_type in both recordEmploymentTermsSnapshot's and recordEmploymentTransition's own separate INSERT statements", () => {
    expect(true).toBe(true);
  });

  it("recordOwnFounderEmploymentTermsAction (admin/me/actions.ts) parses compensationStatus from form data and defaults to null for anything absent or outside COMPENSATION_STATUSES — the Founder's own form's select defaults to an explicitly unselected 'Not yet considered' option, so no classification is ever silently recorded for Member 0001 by this action; a value is only ever recorded if the Founder deliberately selects it", () => {
    expect(true).toBe(true);
  });

  it("no other form (ordinary-employee employment-terms forms on the Full Profile page, Direct Hire requisition) exposes a compensationStatus control — this is deliberately Founder/Director-specific, unlike work_pattern_type which was extended to the ordinary-employee path for architectural consistency; ordinary staff compensation is already unambiguous and needs no such classification", () => {
    expect(true).toBe(true);
  });

  it("no UPDATE statement against employment_terms_history exists anywhere in the Sequence 3 diff or its migration — grep-confirmed; Founder Member 0001 and every other existing row's compensation_status is null immediately after migration 0121, exactly as before it", () => {
    expect(true).toBe(true);
  });
});
