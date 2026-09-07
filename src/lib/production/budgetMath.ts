// Ordift Production Services — Budget Versioning (2026-09-07) — pure
// logic only, zero imports. A production budget is never UPDATEd in
// place; every change is a new row (see productionBudgets.ts), and
// these two pure functions are what that module uses to decide (a)
// whether a proposed new version is even allowed to follow the
// previous one, and (b) the exact diff a change/variation record must
// carry once a client-approved-or-later budget needs to change.

export type ProductionBudgetStatus = "estimate" | "supplier_quoted" | "internal_approved" | "client_presented" | "client_approved" | "committed" | "actual_final";

export const PRODUCTION_BUDGET_STATUS_ORDER: ProductionBudgetStatus[] = ["estimate", "supplier_quoted", "internal_approved", "client_presented", "client_approved", "committed", "actual_final"];

// A budget-approved-or-later status is one where a silent change would
// misrepresent something the client has already seen/approved —
// exactly the set of statuses that trigger the "requires a governed
// change/variation" rule below.
const CLIENT_FACING_OR_LATER: ReadonlySet<ProductionBudgetStatus> = new Set(["client_presented", "client_approved", "committed", "actual_final"]);
const APPROVED_OR_LATER: ReadonlySet<ProductionBudgetStatus> = new Set(["client_approved", "committed", "actual_final"]);

export function isClientFacingOrLaterStatus(status: ProductionBudgetStatus): boolean {
  return CLIENT_FACING_OR_LATER.has(status);
}

export function isApprovedOrLaterStatus(status: ProductionBudgetStatus): boolean {
  return APPROVED_OR_LATER.has(status);
}

// A new budget version may move the status forward (including
// re-entering an earlier state to redo a step, e.g. internal_approved
// -> supplier_quoted after a supplier price changes) — the ONLY thing
// this never allows is skipping past client_approved/committed/
// actual_final invisibly: once a budget has reached one of those,
// any new version with a materially different total REQUIRES a paired
// change/variation record (enforced in productionBudgets.ts, not
// here — this function only classifies, it doesn't gate).
export function requiresGovernedChangeRecord(previousStatus: ProductionBudgetStatus, previousTotalUsd: number | null, newTotalUsd: number | null): boolean {
  if (!isApprovedOrLaterStatus(previousStatus)) return false;
  if (previousTotalUsd === null || newTotalUsd === null) return previousTotalUsd !== newTotalUsd;
  return Math.round(previousTotalUsd * 100) !== Math.round(newTotalUsd * 100);
}

export function computeBudgetDifference(previousAmountUsd: number, newAmountUsd: number): number {
  return Math.round((newAmountUsd - previousAmountUsd) * 100) / 100;
}

// Organizational Structure & Authority Grants V1 (2026-09-07), Part 14
// — the CUMULATIVE variation from the original client-approved baseline,
// never an isolated single change (so repeated small changes cannot
// avoid escalation by staying under 10% each time individually — see
// productionBudgets.ts, which passes the FIRST client_approved-or-later
// version's total as baselineUsd, not the immediately-previous version).
// A null/zero baseline can't meaningfully express a percentage — treated
// as 100% (maximally material) rather than dividing by zero or hiding
// the variation.
export function computeCumulativeVariationPercent(baselineUsd: number | null, currentUsd: number | null): number {
  const baseline = baselineUsd ?? 0;
  const current = currentUsd ?? 0;
  if (baseline <= 0) return current === 0 ? 0 : 100;
  return ((current - baseline) / baseline) * 100;
}
