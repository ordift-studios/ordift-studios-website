// Ghana Employee Agreement Policy constants (COMP-SYS-1, Phase B7 Step
// 5, 2026-09-15) — restates already-approved OS-HR-GH-001/OS-HR-GH-002
// content as named, jurisdiction-scoped values for the OS-LGL-007
// Schedule A resolver (employeeAgreements.ts) to use, exactly matching
// employeeAgreementRequirements.ts's own established discipline: "no
// new legal figure is asserted here" — every number below already
// exists in a registered controlled policy document; this module only
// makes it programmatically reusable instead of leaving Probation/
// Notice/Annual Leave permanently unresolved ("no source yet", the
// exact prior state that produced the incomplete Schedule A the
// Founder flagged).
//
// Deliberately Ghana(GH)+EMPLOYEE-scoped, never a global default — the
// authorizing instruction's explicit warning: "Do NOT turn 'Ghana = 30
// days' into a global jurisdiction rule." Any other jurisdiction has
// no rule here at all; callers must not fall back to these values for
// a non-Ghana employee.

// OS-HR-GH-002 Employment, Working Time, Attendance & Leave Policy,
// Section 1.3: "The normal initial probation is three months and may
// be extended once, up to a further three months, after a documented
// management review where lawful."
export const GHANA_EMPLOYEE_PROBATION_POLICY = {
  initialMonths: 3,
  maxExtensionMonths: 3,
  source: "OS-HR-GH-002 Employment, Working Time, Attendance & Leave Policy, Section 1.3",
} as const;

// OS-HR-GH-001 Ghana Jurisdiction Schedule C, Section 6.1: "The company
// standard for confirmed employees is 30 calendar days ordinary notice
// and 14 calendar days during probation, each subject to the
// applicable mandatory Ghana rule and the actual contract."
export const GHANA_EMPLOYEE_NOTICE_POLICY = {
  duringProbationDays: 14,
  confirmedDays: 30,
  source: "OS-HR-GH-001 Ghana Jurisdiction Schedule C, Section 6.1",
} as const;

// Pure — computes an inclusive "start through end" probation window
// from a commencement date and a duration in months, using the
// standard "N months later, minus one day" convention (18 September
// 2026 + 3 months = 18 December 2026, minus one day = 17 December
// 2026). Parses/formats plain "YYYY-MM-DD" calendar dates, matching
// how effective_from/startDate are handled everywhere else in this
// codebase — no timezone conversion.
export function computeProbationWindow(commencementDate: string, months: number): { startDate: string; endDate: string } {
  const [y, m, d] = commencementDate.split("-").map(Number);
  const end = new Date(Date.UTC(y, m - 1 + months, d));
  end.setUTCDate(end.getUTCDate() - 1);
  return { startDate: commencementDate, endDate: end.toISOString().slice(0, 10) };
}

function formatDisplayDate(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}

// Builds the OS-LGL-007 Schedule A "Probation" value for a specific
// employee's commencement date — the one place this codebase computes
// a person-specific probation window, so no future caller re-derives
// the "months later minus one day" arithmetic independently.
export function formatProbationVariable(commencementDate: string): string {
  const window = computeProbationWindow(commencementDate, GHANA_EMPLOYEE_PROBATION_POLICY.initialMonths);
  return `${GHANA_EMPLOYEE_PROBATION_POLICY.initialMonths} months (${formatDisplayDate(window.startDate)} through ${formatDisplayDate(window.endDate)}); may be extended once for up to a further ${GHANA_EMPLOYEE_PROBATION_POLICY.maxExtensionMonths} months following documented review and where lawful — no automatic or silent extension.`;
}

// Notice is a flat policy statement, not person-specific — no
// commencement-date math involved.
export function formatNoticeVariable(): string {
  return `${GHANA_EMPLOYEE_NOTICE_POLICY.duringProbationDays} calendar days during probation; ${GHANA_EMPLOYEE_NOTICE_POLICY.confirmedDays} calendar days after confirmed employment; each subject to any stronger mandatory Ghana law requirement applicable to the circumstances.`;
}

// Annual leave: states the entitlement and its planning-allocation
// structure — never a fabricated prorated day-count for a specific
// leave year, since no eligible-service/leave-year proration workflow
// is being built by this change (out of scope; the existing pure
// computeProratedEntitlement() in leaveRequests.ts remains the real
// proration calculator once a caller supplies real eligible-service-day
// inputs — not reproduced or duplicated here).
export function formatAnnualLeaveVariable(annualEntitlementDays: number): string {
  return `${annualEntitlementDays} paid working days per leave year (Ordift enhanced entitlement, not less than the Ghana statutory minimum), prorated for eligible service in the first leave year per Ordift/Ghana policy. Planning allocation of 10 days (H1) and 10 days (H2) for leave-bidding purposes only — one annual entitlement, not two separate legal entitlements.`;
}
