import { getCurrentUser, isStaffOrAdmin, isSuperAdmin, type CurrentUser } from "@/lib/portal/roles";

// Shared gate for /api/admin/** route handlers — the API equivalent of
// src/app/admin/layout.tsx's page-level check. proxy.ts doesn't gate
// /api/admin/** any more than it gates /admin/**, so this is the actual
// enforcement point for every admin API route, not just a backstop.
export async function requireAdminApiUser(): Promise<CurrentUser | null> {
  const user = await getCurrentUser();
  return user && isStaffOrAdmin(user) ? user : null;
}

// Tighter gate for routes that write directly to external systems on
// an admin's behalf with no visitor-facing origin to audit against
// (e.g. the Google Sheets verification write) — deliberately narrower
// than requireAdminApiUser(), staff/admin excluded.
export async function requireSuperAdminApiUser(): Promise<CurrentUser | null> {
  const user = await getCurrentUser();
  return user && isSuperAdmin(user) ? user : null;
}
