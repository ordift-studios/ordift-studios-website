// Backlog Phase 6 (2026-09-16) — Roster/Coverage validation foundation.
// No roster/shift-assignment table exists anywhere in this codebase
// yet, and no staffing-minimum policy has been supplied by the
// Founder — inventing either would violate the explicit "without
// inventing staffing requirements" instruction. This module is
// deliberately the smallest honest piece: a pure CALCULATOR, never a
// rule-maker. The caller supplies the real "who is normally expected
// to work this day" roster (from wherever that's genuinely known —
// department assignment, employment_terms_history.work_pattern_type,
// a future real roster table) and the real set of people with approved
// absence that day; this module only computes the resulting coverage
// signal. It never blocks or auto-decides anything — a future
// leave-approval UI can surface this as a WARNING to the approving
// manager, never a hard denial invented by this module.

export interface CoverageAssessment {
  expectedHeadcount: number;
  absentHeadcount: number;
  remainingHeadcount: number;
  // true only when the remaining headcount is genuinely zero — the one
  // factual, uninvented signal this module is confident enough to name
  // explicitly. Anything less severe is left as plain numbers for the
  // caller/manager to judge, never a manufactured "low coverage"
  // threshold this module has no authority to set.
  zeroCoverage: boolean;
}

export function assessCoverageImpact(params: {
  expectedProfileIds: readonly string[];
  approvedAbsenceProfileIds: readonly string[];
}): CoverageAssessment {
  const expected = new Set(params.expectedProfileIds);
  const absent = new Set(params.approvedAbsenceProfileIds.filter((id) => expected.has(id)));
  const remaining = expected.size - absent.size;
  return {
    expectedHeadcount: expected.size,
    absentHeadcount: absent.size,
    remainingHeadcount: remaining,
    zeroCoverage: expected.size > 0 && remaining <= 0,
  };
}
