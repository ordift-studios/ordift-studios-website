import { describe, expect, it } from "vitest";
import { getExcludedActionsForViewerTier, SUPER_ADMIN_ONLY_ACTIONS, ADMIN_TIER_ACTIONS } from "@/lib/admin/activityLog";

// Phase I.1 (2026-09-05) — the /admin/activity sensitivity-tiering gap
// found during the Phase I.0 roadmap review: every External Workforce /
// Universal Payables / Media Lifecycle action type introduced in Phases
// E-H.2 was never added to either restricted tier, so plain `staff`
// could see payee classification changes, payable amounts, payment
// destinations, and engagement status transitions in the unfiltered
// global feed. This is the pure classification logic
// getRecentActivity() filters against — directly testable without a
// live Supabase session; RLS/the actual query itself aren't covered
// here (same established limitation as every other DB-dependent
// function in this suite).

const ordinaryStaff = { isSuperAdmin: false, isAdminTier: false };
const adminTier = { isSuperAdmin: false, isAdminTier: true };
const superAdmin = { isSuperAdmin: true, isAdminTier: true };

describe("getExcludedActionsForViewerTier", () => {
  it("ordinary staff has both restricted tiers excluded", () => {
    const excluded = new Set(getExcludedActionsForViewerTier(ordinaryStaff));
    for (const action of SUPER_ADMIN_ONLY_ACTIONS) expect(excluded.has(action)).toBe(true);
    for (const action of ADMIN_TIER_ACTIONS) expect(excluded.has(action)).toBe(true);
  });

  it("an admin-tier viewer sees financial/payables activity but not role/personnel-tier activity", () => {
    const excluded = new Set(getExcludedActionsForViewerTier(adminTier));
    for (const action of ADMIN_TIER_ACTIONS) expect(excluded.has(action)).toBe(false);
    for (const action of SUPER_ADMIN_ONLY_ACTIONS) expect(excluded.has(action)).toBe(true);
  });

  it("a super admin has nothing excluded", () => {
    expect(getExcludedActionsForViewerTier(superAdmin)).toEqual([]);
  });
});

// Explicit inventory — every new action type introduced by the External
// Workforce / Universal Payables / Media Lifecycle phases (Phase I.0's
// grep of every logActivity() call site under src/lib/payables,
// src/lib/payments/payoutObligations.ts, src/lib/payments/
// payeeInstructions.ts), asserted against its assigned tier directly —
// not a re-typed copy: these tests read the real exported Sets.
describe("payee classification changes are super-admin-only (personnel-sensitive, same class as role.grant/revoke)", () => {
  it.each(["payee_profile.created", "payee_profile.status_changed", "payee.classification_corrected"])("%s", (action) => {
    expect(SUPER_ADMIN_ONLY_ACTIONS.has(action)).toBe(true);
    expect(ADMIN_TIER_ACTIONS.has(action)).toBe(false);
  });
});

describe("payable/payment-obligation/destination/evidence/engagement events are admin-tier (financial-sensitive)", () => {
  it.each([
    "payment_obligation.created",
    "payment_obligation.approved",
    "payment_obligation.destination_selected",
    "payment_obligation.paid_manually",
    "payment_obligation.cancelled",
    "payment_obligation.reversed",
    "payment_instruction.created",
    "payment_instruction.updated",
    "payable_item.added",
    "payment_evidence.added",
    "engagement.created",
    "engagement.updated",
    "engagement.status_changed",
  ])("%s", (action) => {
    expect(ADMIN_TIER_ACTIONS.has(action)).toBe(true);
    expect(SUPER_ADMIN_ONLY_ACTIONS.has(action)).toBe(false);
  });
});

describe("project-file media-lifecycle events remain staff-visible (deliberately reviewed, not restricted)", () => {
  it.each([
    "project_file.uploaded",
    "project_file.backup_confirmed",
    "project_file.retain_set",
    "project_file.promoted_final_approved",
    "project_file.purge_run",
  ])("%s is in neither restricted tier", (action) => {
    expect(SUPER_ADMIN_ONLY_ACTIONS.has(action)).toBe(false);
    expect(ADMIN_TIER_ACTIONS.has(action)).toBe(false);
  });
});

// Regression: pre-existing (TD-035, 2026-08-14) classifications must
// not have shifted as a side effect of this phase's additions.
describe("pre-existing classifications are unchanged (no regression)", () => {
  it("role/access-management actions remain super-admin-only", () => {
    for (const action of ["role.grant", "role.revoke", "access_status.change", "access_expiry.change"]) {
      expect(SUPER_ADMIN_ONLY_ACTIONS.has(action)).toBe(true);
    }
  });

  it("pre-existing customer-payment actions remain admin-tier", () => {
    for (const action of ["payment.completed", "payment.failed", "enquiry.amount_due_set", "booking.amount_due_set"]) {
      expect(ADMIN_TIER_ACTIONS.has(action)).toBe(true);
    }
  });

  it("an unrelated, ordinary operational action stays unclassified (staff-visible) — sanity check against over-restriction", () => {
    expect(SUPER_ADMIN_ONLY_ACTIONS.has("enquiry.stage_change")).toBe(false);
    expect(ADMIN_TIER_ACTIONS.has("enquiry.stage_change")).toBe(false);
  });
});
