import { hasRole, type CurrentUser } from "./roles";

// Admin Nav Access Matrix (Task 12, 2026-09-18) — extracted verbatim
// from src/app/admin/layout.tsx (zero behavior change to any existing
// flag except one real fix — see the Payments entry below) so the
// role → visible-admin-nav-link mapping is independently testable with
// fixtures. This file, together with resolveVisibleAdminNavGroups()
// below, IS the formal access matrix: which real capability each
// admin nav destination requires, in one place, rather than scattered
// one-off page checks nobody can audit at a glance. Navigation
// visibility is never the actual security boundary — every destination
// page independently re-checks its own real authorization — but it
// must always AGREE with that boundary (Task 4/12's explicit rule):
// a user who cannot pass a page's real gate must never be shown a
// dead link to it.
export type AdminNavItem = {
  label: string;
  href: string;
  adminOnly?: boolean;
  superAdminOnly?: boolean;
  executiveOnly?: boolean;
  workforceAdminOnly?: boolean;
  operationsCoordinateOnly?: boolean;
  partnershipAdministerOnly?: boolean;
};
export type AdminNavGroup = { label: string; items: AdminNavItem[] };

export const ADMIN_NAV_GROUPS: AdminNavGroup[] = [
  {
    // Employee Self-Service — no flag on its items: visible to every
    // staff member who reaches /admin at all. Each page independently
    // scopes every read/write to the CURRENT user's own id.
    label: "My Workspace",
    items: [
      { label: "My Workspace", href: "/admin/me" },
      { label: "My Leave", href: "/admin/me/leave" },
      { label: "My Attendance", href: "/admin/me/attendance" },
      { label: "My Compensation", href: "/admin/me/compensation" },
      { label: "My Performance", href: "/admin/me/performance" },
      { label: "My Grievances", href: "/admin/me/grievances" },
      { label: "My Requests", href: "/admin/me/requests" },
    ],
  },
  {
    label: "HR / People",
    items: [{ label: "HR / People", href: "/admin/hr", adminOnly: true }],
  },
  {
    label: "Overview",
    items: [
      { label: "Overview", href: "/admin/overview" },
      { label: "Executive", href: "/admin/executive", executiveOnly: true },
      { label: "Reports", href: "/admin/reports", adminOnly: true },
      // Activity deliberately unflagged — it renders a reduced,
      // self-scoped view for non-admin-tier staff, not a leak.
      { label: "Activity", href: "/admin/activity" },
    ],
  },
  {
    label: "Client & Commercial",
    items: [
      { label: "Enquiries", href: "/admin/enquiries", adminOnly: true },
      { label: "Bookings", href: "/admin/bookings", adminOnly: true },
    ],
  },
  {
    label: "Creative & Production",
    items: [{ label: "Production Operations", href: "/admin/production", operationsCoordinateOnly: true }],
  },
  {
    label: "Finance",
    items: [
      // Task 12 fix (2026-09-18) — Payments' real page gate
      // (canAccessPaymentsAdmin, paymentPermissions.ts) was narrowed
      // to admin/super_admin in Task 4, but this nav entry was never
      // updated to match — exactly the "dead link shown to unauthorized
      // staff" bug Task 4/12 exist to close. adminOnly now agrees with
      // the real page gate.
      { label: "Payments", href: "/admin/payments", adminOnly: true },
      { label: "Payables", href: "/admin/payables" },
      { label: "Pricing", href: "/admin/pricing" },
      { label: "Client Quotations", href: "/admin/pricing/quotations", adminOnly: true },
    ],
  },
  {
    label: "People & Organization",
    items: [
      { label: "Users & Roles", href: "/admin/users", workforceAdminOnly: true },
      { label: "Meet the Team", href: "/admin/team", superAdminOnly: true },
      { label: "Recruitment", href: "/admin/recruitment", adminOnly: true },
      { label: "Organization", href: "/admin/organization", adminOnly: true },
      { label: "Authority", href: "/admin/authority", superAdminOnly: true },
      { label: "Workforce Overview", href: "/admin/organization/workforce", adminOnly: true },
      { label: "Leave", href: "/admin/organization/leave", adminOnly: true },
      { label: "Attendance", href: "/admin/organization/attendance", adminOnly: true },
      { label: "Employee Relations", href: "/admin/organization/employee-relations", adminOnly: true },
      { label: "Assets & Equipment", href: "/admin/organization/assets", adminOnly: true },
      { label: "Safeguarding", href: "/admin/organization/safeguarding", adminOnly: true },
      { label: "Legal Entities", href: "/admin/organization/legal-entities", superAdminOnly: true },
      { label: "Vendors", href: "/admin/organization/vendors", adminOnly: true },
      { label: "Statutory Wages", href: "/admin/organization/statutory-wages", superAdminOnly: true },
    ],
  },
  {
    label: "Talent & Partnerships",
    items: [{ label: "Partnerships & Collaborations", href: "/admin/partnerships", partnershipAdministerOnly: true }],
  },
  {
    label: "Legal & Governance",
    items: [{ label: "Legal & Governance", href: "/admin/legal", adminOnly: true }],
  },
  {
    label: "Talent Management",
    items: [{ label: "Talent Management", href: "/admin/talent", adminOnly: true }],
  },
  {
    label: "OS Academy",
    items: [{ label: "Workshop Management", href: "/admin/workshops" }],
  },
  {
    label: "Content & Website",
    items: [
      { label: "Portfolio", href: "/admin/portfolio" },
      { label: "Content", href: "/admin/content", adminOnly: true },
      { label: "Ordift Pulse", href: "/admin/pulse", adminOnly: true },
    ],
  },
  {
    label: "Technology & System",
    items: [
      { label: "Operations (Utility)", href: "/admin/operations", superAdminOnly: true },
      { label: "Titles & Classifications", href: "/admin/lookups", superAdminOnly: true },
      { label: "Feature Flags", href: "/admin/flags", adminOnly: true },
      { label: "Settings", href: "/admin/settings", adminOnly: true },
    ],
  },
];

export type AdminNavFlags = {
  isAdmin: boolean;
  isSuper: boolean;
  isExecutive: boolean;
  isWorkforceAdmin: boolean;
  canCoordinateOperations: boolean;
  canAdministerPartnerships: boolean;
};

function adminNavItemVisible(item: AdminNavItem, flags: AdminNavFlags): boolean {
  return (
    (!item.adminOnly || flags.isAdmin) &&
    (!item.superAdminOnly || flags.isSuper) &&
    (!item.executiveOnly || flags.isExecutive) &&
    (!item.workforceAdminOnly || flags.isWorkforceAdmin) &&
    (!item.operationsCoordinateOnly || flags.canCoordinateOperations) &&
    (!item.partnershipAdministerOnly || flags.canAdministerPartnerships)
  );
}

// Pure — every capability flag is resolved by the caller (async
// authority_grants/role checks in the layout) and passed in already
// resolved, so this function itself needs no database and is directly
// fixture-testable. A group with zero visible items is dropped
// entirely rather than rendered with an empty heading.
export function resolveVisibleAdminNavGroups(flags: AdminNavFlags): AdminNavGroup[] {
  return ADMIN_NAV_GROUPS.map((group) => ({ ...group, items: group.items.filter((item) => adminNavItemVisible(item, flags)) })).filter(
    (group) => group.items.length > 0
  );
}

export type AdminPortalLinkItem = { role: CurrentUser["roles"][number]; label: string; href: string };

export const ADMIN_PORTAL_LINK_ITEMS: AdminPortalLinkItem[] = [
  { role: "client", label: "Client Portal", href: "/portal/client" },
  { role: "workshop_participant", label: "Workshop Portal", href: "/portal/workshops" },
  { role: "model", label: "Model Portal", href: "/portal/model" },
  { role: "vendor", label: "Vendor Portal", href: "/portal/vendor" },
  { role: "contractor", label: "Collaborator Portal", href: "/portal/collaborator" },
];

export function resolveVisibleAdminPortalLinks(user: CurrentUser): { label: string; href: string }[] {
  // Same role-field-leak bug class already fixed once in
  // src/lib/portal/navigation.ts (2026-09-17) — map to {label, href}
  // BEFORE dedup, never filter the raw items through untouched.
  const matching = ADMIN_PORTAL_LINK_ITEMS.filter((item) => hasRole(user, item.role)).map((item) => ({ label: item.label, href: item.href }));
  return matching.filter((item, index) => matching.findIndex((other) => other.href === item.href) === index);
}
