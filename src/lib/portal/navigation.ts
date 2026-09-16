import { hasRole, type CurrentUser, type RoleSlug } from "./roles";

// Cross-portal nav resolution (2026-09-16) — extracted verbatim from
// src/app/portal/(dashboard)/layout.tsx (zero behavior change) so the
// role → visible-portal-links mapping is independently testable with
// fixtures, per the Task 8 cross-portal regression QA requirement.
// Staff/admin/super_admin all point at the same /admin destination
// (the internal Admin Platform superseded the old /portal/staff and
// /portal/admin pages — see primaryPortalPath()) — a dual staff+admin
// user only ever needs the one link, deduplicated by href.
export type NavItem = { label: string; href: string };

export const NAV_ITEMS: { role: RoleSlug; label: string; href: string }[] = [
  { role: "client", label: "My Bookings", href: "/portal/client" },
  { role: "workshop_participant", label: "My Workshops", href: "/portal/workshops" },
  { role: "model", label: "My Profile", href: "/portal/model" },
  { role: "vendor", label: "Vendor", href: "/portal/vendor" },
  { role: "contractor", label: "My Projects", href: "/portal/collaborator" },
  { role: "staff", label: "Admin Platform", href: "/admin" },
  { role: "admin", label: "Admin Platform", href: "/admin" },
  { role: "super_admin", label: "Admin Platform", href: "/admin" },
];

// isPayee (public.payee_profiles) and isInstructor
// (workshop_instructor_engagements ownership) are both real capability
// facts, not roles — see the layout's own comments for why they can't
// be expressed as NAV_ITEMS entries. Passed in already-resolved so
// this function stays pure and DB-free.
export function resolveVisibleNavItems(user: CurrentUser, isPayee: boolean, isInstructor: boolean): NavItem[] {
  const matchingNavItems: NavItem[] = NAV_ITEMS.filter((item) => hasRole(user, item.role)).map((item) => ({ label: item.label, href: item.href }));
  const dedupedNavItems: NavItem[] = matchingNavItems.filter(
    (item, index) => matchingNavItems.findIndex((other) => other.href === item.href) === index
  );
  const withPayeeLink = isPayee ? [...dedupedNavItems, { label: "Payment Details", href: "/portal/payment-details" }] : dedupedNavItems;
  return isInstructor ? [...withPayeeLink, { label: "Instructor", href: "/portal/instructor" }] : withPayeeLink;
}
