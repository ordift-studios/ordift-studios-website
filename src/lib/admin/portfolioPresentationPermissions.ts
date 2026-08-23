import { hasRole, isSuperAdmin } from "@/lib/portal/roles";
import type { CurrentUser } from "@/lib/portal/roles";

// Portfolio Hero/Cover Image Management (2026-08-23) — Work Landing
// Images (Service.workLandingImage) and Portfolio Cover/Index Images
// (PortfolioProject.coverImage). Deliberately a standalone copy of the
// same admin+super_admin pairing as canManageHomepageSlideshow()
// (src/lib/admin/homepageSlideshowPermissions.ts) rather than a shared
// import — these are two independently-approved features that happen to
// use an identical rule; keeping them separate means neither can
// regress the other. Not the narrower Portfolio capability matrix
// (which has separate staff/admin/super_admin tiers for different
// workflow actions) — this feature only ever has one tier: can manage
// presentation images, or cannot.
export function canManagePortfolioPresentation(user: CurrentUser | null): boolean {
  return Boolean(user && (hasRole(user, "admin") || isSuperAdmin(user)));
}
