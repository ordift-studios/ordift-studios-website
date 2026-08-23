import { hasRole, isSuperAdmin } from "@/lib/portal/roles";
import type { CurrentUser } from "@/lib/portal/roles";

// Reuses the existing role primitives directly (no new RBAC system, no
// new capability matrix) — the same admin+super_admin pairing already
// used for Feature Flags/Settings/Users & Roles nav items
// (src/app/admin/layout.tsx). Deliberately not the narrower Portfolio
// capability model (which has separate staff/admin/super_admin tiers
// for different actions) — this feature only ever has one tier: can
// manage, or cannot.
export function canManageHomepageSlideshow(user: CurrentUser | null): boolean {
  return Boolean(user && (hasRole(user, "admin") || isSuperAdmin(user)));
}
