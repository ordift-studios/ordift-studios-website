import { hasRole, isSuperAdmin, type CurrentUser } from "@/lib/portal/roles";

// Same tier as the Admin Enquiries page this request hangs off: requests
// carry requester contact details and budgets across the whole business,
// so view and manage are admin/super_admin only — never plain staff.
export function canManageCrewSupport(user: CurrentUser | null): boolean {
  return Boolean(user) && (hasRole(user, "admin") || isSuperAdmin(user));
}
