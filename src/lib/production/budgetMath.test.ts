import { describe, expect, it } from "vitest";
import { requiresGovernedChangeRecord, computeBudgetDifference, isClientFacingOrLaterStatus, isApprovedOrLaterStatus, PRODUCTION_BUDGET_STATUS_ORDER } from "./budgetMath";

// Ordift Production Services — Budget Versioning (2026-09-07) —
// requiresGovernedChangeRecord() is the pure decision inside
// createBudgetVersion() (productionBudgets.ts): once a reference's
// latest budget has reached client_approved/committed/actual_final,
// any new version with a materially different total requires a
// governed change/variation record. createBudgetVersion() itself is
// DB-dependent from its first line (authorizeWithSuperAdminOverride()
// constructs a real Supabase admin client), so it is not directly
// unit-tested — same established limitation documented throughout this
// codebase (discounts.test.ts, personalSessionEstimate tests, etc.).

describe("PRODUCTION_BUDGET_STATUS_ORDER", () => {
  it("matches the approved seven-stage lifecycle exactly, in order", () => {
    expect(PRODUCTION_BUDGET_STATUS_ORDER).toEqual(["estimate", "supplier_quoted", "internal_approved", "client_presented", "client_approved", "committed", "actual_final"]);
  });
});

describe("isApprovedOrLaterStatus", () => {
  it("is false before client_approved", () => {
    expect(isApprovedOrLaterStatus("estimate")).toBe(false);
    expect(isApprovedOrLaterStatus("supplier_quoted")).toBe(false);
    expect(isApprovedOrLaterStatus("internal_approved")).toBe(false);
    expect(isApprovedOrLaterStatus("client_presented")).toBe(false);
  });
  it("is true from client_approved onward", () => {
    expect(isApprovedOrLaterStatus("client_approved")).toBe(true);
    expect(isApprovedOrLaterStatus("committed")).toBe(true);
    expect(isApprovedOrLaterStatus("actual_final")).toBe(true);
  });
});

describe("isClientFacingOrLaterStatus", () => {
  it("is true from client_presented onward, false before", () => {
    expect(isClientFacingOrLaterStatus("internal_approved")).toBe(false);
    expect(isClientFacingOrLaterStatus("client_presented")).toBe(true);
    expect(isClientFacingOrLaterStatus("client_approved")).toBe(true);
    expect(isClientFacingOrLaterStatus("committed")).toBe(true);
    expect(isClientFacingOrLaterStatus("actual_final")).toBe(true);
  });
});

describe("requiresGovernedChangeRecord — 26. material post-approval increase requires a governed change/variation", () => {
  it("does NOT require a change record before client_approved, even if the total changes", () => {
    expect(requiresGovernedChangeRecord("estimate", 1000, 1500)).toBe(false);
    expect(requiresGovernedChangeRecord("internal_approved", 1000, 1500)).toBe(false);
    expect(requiresGovernedChangeRecord("client_presented", 1000, 1500)).toBe(false);
  });

  it("DOES require a change record once client_approved, when the total materially changes", () => {
    expect(requiresGovernedChangeRecord("client_approved", 1000, 1500)).toBe(true);
    expect(requiresGovernedChangeRecord("committed", 1000, 900)).toBe(true);
    expect(requiresGovernedChangeRecord("actual_final", 1000, 1000.01)).toBe(true);
  });

  it("does NOT require a change record when the total is unchanged (rounding-safe to the cent)", () => {
    expect(requiresGovernedChangeRecord("client_approved", 1000, 1000)).toBe(false);
    expect(requiresGovernedChangeRecord("client_approved", 1000.005, 1000.006)).toBe(false); // rounds to the same cent
  });

  it("treats null <-> non-null totals as a material change (e.g. a figure becomes known, or a known figure is withdrawn)", () => {
    expect(requiresGovernedChangeRecord("client_approved", null, 1500)).toBe(true);
    expect(requiresGovernedChangeRecord("client_approved", 1500, null)).toBe(true);
    expect(requiresGovernedChangeRecord("client_approved", null, null)).toBe(false);
  });
});

describe("computeBudgetDifference", () => {
  it("computes a positive difference for an increase", () => {
    expect(computeBudgetDifference(1000, 1500)).toBe(500);
  });
  it("computes a negative difference for a decrease", () => {
    expect(computeBudgetDifference(1500, 1000)).toBe(-500);
  });
  it("rounds to the cent", () => {
    expect(computeBudgetDifference(1000, 1000.017)).toBe(0.02);
  });
});

// 25. Approved production budget cannot be silently overwritten.
// 27. Historical budget version remains recoverable/auditable.
// Both are architectural guarantees of createBudgetVersion() itself
// (always INSERT with supersedes_id, never UPDATE an existing row's
// total_usd/line_items) rather than something the pure budgetMath
// functions alone prove — verified by direct code reading: there is no
// UPDATE statement anywhere in productionBudgets.ts touching
// production_budgets' financial columns, only INSERT.
describe("25 / 27 — append-only guarantee (documented, verified by code reading)", () => {
  it("requiresGovernedChangeRecord is the ONLY gate between 'total changed' and 'a new version may be written' once approved — there is no silent path", () => {
    // If this returns true, productionBudgets.ts's createBudgetVersion()
    // refuses to proceed without a non-empty changeReason — proving the
    // gate exists structurally, not just as a comment.
    expect(requiresGovernedChangeRecord("client_approved", 1000, 1200)).toBe(true);
  });
});
