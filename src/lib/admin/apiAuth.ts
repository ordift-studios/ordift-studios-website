import { getCurrentUser, isStaffOrAdmin, type CurrentUser } from "@/lib/portal/roles";

// Shared gate for /api/admin/** route handlers — the API equivalent of
// src/app/admin/layout.tsx's page-level check. proxy.ts doesn't gate
// /api/admin/** any more than it gates /admin/**, so this is the actual
// enforcement point for every admin API route, not just a backstop.
export async function requireAdminApiUser(): Promise<CurrentUser | null> {
  const user = await getCurrentUser();
  return user && isStaffOrAdmin(user) ? user : null;
}
