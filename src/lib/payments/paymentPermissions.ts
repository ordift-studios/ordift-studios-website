import type { CurrentUser } from "@/lib/portal/roles";
import { hasRole } from "@/lib/portal/roles";
import type { WorkflowCapabilityMatrix } from "@/lib/workflow/types";

// Payments & Finance Module permission matrix (2026-08-06) — second
// consumer of the workflow engine's capability system, following the
// exact same pattern proven for Portfolio (src/lib/admin/
// portfolioPermissions.ts). super_admin/admin collapse to one "full
// access" tier, matching that precedent and every other Admin Platform
// module's convention (isStaffOrAdmin()).
//
// `staff` gets view_all_payments + approve/reject_bank_transfer — the
// day-to-day bank-transfer review workflow — but NOT issue_refund or
// manage_bank_accounts/manage_currencies, which stay narrower (Owner/
// Super Admin/Admin only) since a refund or a changed exchange rate
// has direct financial consequences a routine transfer approval
// doesn't (PAYMENT_SECURITY_REVIEW.md §16's narrower-than-default
// refund-authorization reasoning).
export const PAYMENT_CAPABILITIES: WorkflowCapabilityMatrix = {
  super_admin: [
    "view_all_payments",
    "approve_bank_transfer",
    "reject_bank_transfer",
    "issue_refund",
    "manage_bank_accounts",
    "manage_currencies",
    "manage_project_amount",
    "reconcile_payment",
  ],
  admin: [
    "view_all_payments",
    "approve_bank_transfer",
    "reject_bank_transfer",
    "issue_refund",
    "manage_bank_accounts",
    "manage_currencies",
    "manage_project_amount",
    "reconcile_payment",
  ],
  // TD-043 — reconcile_payment sits at the same tier as
  // approve/reject_bank_transfer, not the higher issue_refund/
  // manage_currencies tier: it can only pull Paystack's own
  // authoritative verify result, never choose or force a financial
  // outcome, so it carries none of the risk those capabilities do.
  staff: ["view_all_payments", "approve_bank_transfer", "reject_bank_transfer", "reconcile_payment"],
};

// Task 4 audit fix (2026-09-17, real Kelvin QA finding) — previously
// any `staff` role holder (e.g. a photographer with no finance
// responsibility) could reach the full company-wide payments review
// surface merely by holding the blanket `staff` role, per
// PAYMENT_CAPABILITIES' own staff tier above. A staff member must
// never gain company-wide financial visibility merely because this
// route exists — narrowed to admin/super_admin, the same tier every
// other genuinely-restricted financial/governance module in this
// codebase uses (Client Quotations, Payables, Legal & Governance).
// PAYMENT_CAPABILITIES.staff is left in place architecturally (not
// deleted) for a future, deliberately-scoped re-admission of specific
// staff via a real authority_grant, exactly like every other capability
// in this codebase — never merely the `staff` role again.
export function canAccessPaymentsAdmin(user: CurrentUser | null): boolean {
  return Boolean(user && (hasRole(user, "admin") || hasRole(user, "super_admin")));
}
