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
  ],
  admin: [
    "view_all_payments",
    "approve_bank_transfer",
    "reject_bank_transfer",
    "issue_refund",
    "manage_bank_accounts",
    "manage_currencies",
  ],
  staff: ["view_all_payments", "approve_bank_transfer", "reject_bank_transfer"],
};

// Same staff/admin/super_admin boundary as every other /admin/** module
// (src/app/admin/layout.tsx) — clients never see the admin payment
// review surface, only their own Payment History (RLS-scoped, not a
// capability check).
export function canAccessPaymentsAdmin(user: CurrentUser | null): boolean {
  return Boolean(
    user && (hasRole(user, "staff") || hasRole(user, "admin") || hasRole(user, "super_admin"))
  );
}
