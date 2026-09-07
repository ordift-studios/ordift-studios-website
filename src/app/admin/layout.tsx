import { redirect } from "next/navigation";
import Link from "next/link";
import Logo from "@/components/Logo";
import { getCurrentUser, hasRole, isStaffOrAdmin, isSuperAdmin, type RoleSlug } from "@/lib/portal/roles";
import { signOutAction } from "@/app/portal/login/actions";
import { getProfileCard } from "@/lib/portal/profileCard";
import ProfileQuickCard from "@/components/admin/ProfileQuickCard";
import { PresenceProvider } from "@/components/admin/PresenceProvider";
import { isExecutiveAdmin } from "@/lib/organization/authority";

// Internal operations console — separate from the customer/partner-facing
// /portal, but built on the exact same auth/role foundation (Supabase Auth
// + getCurrentUser()/hasRole()). Restricted to staff and admin; everyone
// else is bounced to their own portal home. Same defense-in-depth
// reasoning as src/app/portal/(dashboard)/layout.tsx: proxy.ts only does a
// fast JWT-presence check for /portal/**, not /admin/**, so this layout's
// getCurrentUser() call is the actual gate here, not just a backstop.
type NavItem = { label: string; href: string; adminOnly?: boolean; superAdminOnly?: boolean; executiveOnly?: boolean };
type NavGroup = { label: string; items: NavItem[] };

// Admin Workspace Reorganization (2026-09-07) — business-workspace
// grouping over the same flat list of routes/pages this nav already
// had (nothing renamed, moved, or removed — every href below is
// unchanged, and every page keeps its own real authorization check;
// this grouping is a navigation-clutter fix only, per explicit
// instruction "navigation visibility is not authorization"). A group
// with zero visible items for the current viewer (see visibleGroups
// below) simply doesn't render — this is what makes the nav
// role-aware without any group-level flag of its own.
const NAV_GROUPS: NavGroup[] = [
  {
    label: "Overview",
    items: [
      { label: "Overview", href: "/admin/overview" },
      // Ordift Unified Executive Administration Platform (2026-08-25) —
      // visible to Super Admin or an Executive Admin grant holder only
      // (executiveOnly, checked asynchronously below). Each jurisdiction
      // sub-page independently re-checks its own specific capability —
      // this nav entry is not the security boundary.
      { label: "Executive", href: "/admin/executive", executiveOnly: true },
      { label: "Reports", href: "/admin/reports" },
      { label: "Activity", href: "/admin/activity" },
    ],
  },
  {
    label: "Client & Commercial",
    items: [
      { label: "Enquiries", href: "/admin/enquiries" },
      { label: "Bookings", href: "/admin/bookings" },
    ],
  },
  {
    label: "Creative & Production",
    items: [
      // Production Operations Admin (2026-09-07) — no adminOnly/
      // superAdminOnly flag: the page itself gates on
      // operations.coordinate (or Super Admin), the real boundary.
      { label: "Production Operations", href: "/admin/production" },
    ],
  },
  {
    label: "Finance",
    items: [
      { label: "Payments", href: "/admin/payments" },
      // Universal Payables System (2026-09-03) — no adminOnly/
      // superAdminOnly flag: gated on finance.payee.administer (or
      // Super Admin) at the page itself.
      { label: "Payables", href: "/admin/payables" },
      { label: "Pricing", href: "/admin/pricing" },
    ],
  },
  {
    label: "People & Organization",
    items: [
      { label: "Users & Roles", href: "/admin/users", adminOnly: true },
      { label: "Meet the Team", href: "/admin/team", superAdminOnly: true },
      { label: "Recruitment", href: "/admin/recruitment", adminOnly: true },
      { label: "Organization", href: "/admin/organization", adminOnly: true },
      { label: "Authority", href: "/admin/authority", superAdminOnly: true },
    ],
  },
  {
    label: "Talent & Partnerships",
    items: [
      // Partnerships & Collaborations V1 (2026-09-07) — no adminOnly/
      // superAdminOnly flag: gated on
      // strategy.partnership_opportunity.administer (or Super Admin).
      { label: "Partnerships & Collaborations", href: "/admin/partnerships" },
    ],
  },
  {
    label: "OS Academy",
    items: [{ label: "Workshop Management", href: "/admin/workshops" }],
  },
  {
    label: "Content & Website",
    items: [
      { label: "Portfolio", href: "/admin/portfolio" },
      { label: "Content", href: "/admin/content" },
      { label: "Ordift Pulse", href: "/admin/pulse", adminOnly: true },
    ],
  },
  {
    label: "Technology & System",
    items: [
      // Closure refinement (2026-08-25) — label only, not the route or
      // the page itself: distinguishes this flat, cross-jurisdiction
      // utility view from the "Executive" jurisdiction-framed hub,
      // without restructuring either.
      { label: "Operations (Utility)", href: "/admin/operations", superAdminOnly: true },
      { label: "Titles & Classifications", href: "/admin/lookups", superAdminOnly: true },
      { label: "Feature Flags", href: "/admin/flags", adminOnly: true },
      { label: "Settings", href: "/admin/settings", adminOnly: true },
    ],
  },
];

// Mirrors the exact pattern src/app/portal/(dashboard)/layout.tsx
// already uses to cross-link every non-staff role a dual-role account
// holds — previously this only checked `hasRole(user, "client")`, so a
// staff/admin account who was also vendor/model/contractor/
// workshop_participant (but not client) had no way back to their own
// portal short of typing the URL. Navigation only — doesn't grant,
// revoke, or check anything beyond what's already true of the account;
// every server-side permission check on each destination stays exactly
// as it is.
const PORTAL_LINK_ITEMS: { role: RoleSlug; label: string; href: string }[] = [
  { role: "client", label: "Client Portal", href: "/portal/client" },
  { role: "workshop_participant", label: "Workshop Portal", href: "/portal/workshops" },
  { role: "model", label: "Model Portal", href: "/portal/model" },
  { role: "vendor", label: "Vendor Portal", href: "/portal/vendor" },
  { role: "contractor", label: "Collaborator Portal", href: "/portal/collaborator" },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/portal/login?next=/admin");
  if (!isStaffOrAdmin(user)) redirect("/portal");

  const isSuper = isSuperAdmin(user);
  // Super Admin is a strict superset of Admin (it can grant/revoke the
  // Admin role itself — see SUPER_ADMIN_ONLY_ROLES), so `adminOnly` nav
  // items must stay visible to it even when the account only literally
  // holds "super_admin" and never "admin" — hasRole() has no built-in
  // hierarchy, so that has to be spelled out here.
  const isAdmin = hasRole(user, "admin") || isSuper;
  const isExecutive = isSuper || (await isExecutiveAdmin(user.id));
  const itemVisible = (item: NavItem) =>
    (!item.adminOnly || isAdmin) && (!item.superAdminOnly || isSuper) && (!item.executiveOnly || isExecutive);
  // Role-aware navigation (Part 39/58): each group renders ONLY the
  // items this viewer can see, and a group with zero visible items is
  // dropped entirely rather than showing an empty heading. This is
  // display-only — every destination page re-checks its own real
  // authorization; a hidden group is never the security boundary.
  const visibleNavGroups = NAV_GROUPS.map((group) => ({ ...group, items: group.items.filter(itemVisible) })).filter(
    (group) => group.items.length > 0
  );
  const profileCard = await getProfileCard(user);
  const matchingPortalLinks = PORTAL_LINK_ITEMS.filter((item) => hasRole(user, item.role));
  const visiblePortalLinks = matchingPortalLinks.filter(
    (item, index) => matchingPortalLinks.findIndex((other) => other.href === item.href) === index
  );

  return (
    <div className="min-h-screen flex flex-col">
      <header className="bg-ordift-navy-950 text-white">
        <div className="max-w-6xl mx-auto px-4 sm:px-8 py-4 flex items-center justify-between">
          <Link href="/admin" aria-label="Ordift Studios admin home">
            <Logo variant="nav" color="white" height={24} priority />
          </Link>
          <div className="flex items-center gap-4">
            {visiblePortalLinks.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="font-sans text-body-small text-white/70 hover:text-white underline underline-offset-4"
              >
                {item.label}
              </Link>
            ))}
            <ProfileQuickCard card={profileCard} />
            <form action={signOutAction}>
              <button
                type="submit"
                className="font-sans text-body-small text-white/70 hover:text-white underline underline-offset-4"
              >
                Sign Out
              </button>
            </form>
          </div>
        </div>
        <div className="max-w-6xl mx-auto px-4 sm:px-8 flex gap-1 border-t border-white/10 overflow-x-auto">
          {/* Admin Workspace Reorganization (2026-09-07) — hierarchical/
              expandable grouping (Part 38) over the same flat route list,
              using native <details>/<summary> so it works with zero
              client-side JS, keeps every existing deep link exactly as
              it was, and stays close to the site's familiar look rather
              than an unfamiliar redesign. A group with exactly one
              visible item renders as a single direct link (no dropdown
              needed) — most groups have more than one, but this keeps
              a lean group from feeling like unnecessary extra clicking. */}
          {visibleNavGroups.map((group) =>
            group.items.length === 1 ? (
              <Link
                key={group.label}
                href={group.items[0].href}
                className="font-sans text-body-small text-white/70 hover:text-white py-3 px-2 whitespace-nowrap"
              >
                {group.label}
              </Link>
            ) : (
              <details key={group.label} className="group relative py-3">
                <summary className="font-sans text-body-small text-white/70 hover:text-white px-2 whitespace-nowrap cursor-pointer list-none marker:content-none">
                  {group.label} <span className="text-white/40 group-open:rotate-180 inline-block transition-transform">▾</span>
                </summary>
                <div className="absolute left-0 top-full z-20 mt-1 min-w-[14rem] rounded-lg border border-black/10 bg-white shadow-lg py-1.5">
                  {group.items.map((item) => (
                    <Link
                      key={item.href}
                      href={item.href}
                      className="block font-sans text-body-small text-ordift-ink hover:bg-ordift-offwhite px-4 py-2 whitespace-nowrap"
                    >
                      {item.label}
                    </Link>
                  ))}
                </div>
              </details>
            )
          )}
        </div>
      </header>

      <main className="flex-1 bg-ordift-offwhite px-4 sm:px-8 py-10 sm:py-14">
        <div className="max-w-6xl mx-auto">
          <PresenceProvider
            self={{
              userId: user.id,
              fullName: profileCard.fullName,
              memberNumber: profileCard.memberNumber,
              department: profileCard.department,
            }}
          >
            {children}
          </PresenceProvider>
        </div>
      </main>
    </div>
  );
}
