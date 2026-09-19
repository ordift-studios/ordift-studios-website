import { redirect } from "next/navigation";
import Link from "next/link";
import Logo from "@/components/Logo";
import { getCurrentUser, hasRole, isStaffOrAdmin, isSuperAdmin } from "@/lib/portal/roles";
import { signOutAction } from "@/app/portal/login/actions";
import { getProfileCard } from "@/lib/portal/profileCard";
import ProfileQuickCard from "@/components/admin/ProfileQuickCard";
import { PresenceProvider } from "@/components/admin/PresenceProvider";
import AdminNavDropdown from "@/components/admin/AdminNavDropdown";
import { isExecutiveAdmin, hasAuthority, PEOPLE_CAPABILITIES, OPERATIONS_CAPABILITIES, STRATEGY_CAPABILITIES } from "@/lib/organization/authority";
import { resolveVisibleAdminNavGroups, resolveVisibleAdminPortalLinks } from "@/lib/portal/adminNavigation";

// Internal operations console — separate from the customer/partner-facing
// /portal, but built on the exact same auth/role foundation (Supabase Auth
// + getCurrentUser()/hasRole()). Restricted to staff and admin; everyone
// else is bounced to their own portal home. Same defense-in-depth
// reasoning as src/app/portal/(dashboard)/layout.tsx: proxy.ts only does a
// fast JWT-presence check for /portal/**, not /admin/**, so this layout's
// getCurrentUser() call is the actual gate here, not just a backstop.
// Nav data/types/visibility logic extracted to src/lib/portal/adminNavigation.ts (Task 12, 2026-09-18) — ADMIN_NAV_GROUPS, resolveVisibleAdminNavGroups(), resolveVisibleAdminPortalLinks() — that module IS the formal admin access matrix, independently fixture-tested.

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
  // Security narrowing (2026-09-07) — same async-capability-check
  // pattern as isExecutive above, for the new people.workforce.administer
  // capability (see authority.ts / src/app/admin/users/actions.ts).
  const isWorkforceAdmin = isSuper || (await hasAuthority(user.id, PEOPLE_CAPABILITIES.workforceAdminister, null));
  // Task 4 fix (2026-09-17) — same async-capability-check pattern as
  // isExecutive/isWorkforceAdmin above, for the two real dead-link
  // findings (Production Operations, Partnerships & Collaborations).
  const canCoordinateOperations = isSuper || (await hasAuthority(user.id, OPERATIONS_CAPABILITIES.coordinate, null));
  const canAdministerPartnerships = isSuper || (await hasAuthority(user.id, STRATEGY_CAPABILITIES.partnershipOpportunityAdminister, null));
  // Role-aware navigation (Part 39/58): each group renders ONLY the
  // items this viewer can see, and a group with zero visible items is
  // dropped entirely rather than showing an empty heading. This is
  // display-only — every destination page re-checks its own real
  // authorization; a hidden group is never the security boundary.
  const visibleNavGroups = resolveVisibleAdminNavGroups({
    isAdmin,
    isSuper,
    isExecutive,
    isWorkforceAdmin,
    canCoordinateOperations,
    canAdministerPartnerships,
  });
  const profileCard = await getProfileCard(user);
  const visiblePortalLinks = resolveVisibleAdminPortalLinks(user);

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
              expandable grouping (Part 38) over the same flat route list.
              Submenu dropdown fix (2026-09-07): this container is
              deliberately overflow-x-auto (so the group bar itself can
              scroll on narrow viewports) — but per the CSS Overflow
              spec, giving overflow-x any value but `visible` forces
              overflow-y to compute to `auto` too, silently turning this
              row into a vertically-clipping/scrollable box as well. A
              same-parent absolutely-positioned submenu was getting
              clipped by that accidental box (the reported iPad defect:
              only reachable by touch-scrolling the sliver of clipped
              space). AdminNavDropdown renders its menu through a portal
              into document.body instead — completely outside this
              container's clipping/stacking context — which is the only
              correct fix for a clipping-container bug (no z-index value
              on a child fixes a clip on its ancestor). A group with
              exactly one visible item still renders as a single direct
              link — no dropdown, no clipping risk, unaffected either way. */}
          {/* Super Admin flat navigation (2026-09-16) — a Super Admin is
              authorized for nearly every module, so the grouped/SAP-style
              dropdown bar was hiding entire categories (HR, Vendors, ...)
              behind an extra click the Founder's own QA flagged. For
              Super Admin only: every group except My Workspace renders as
              individual top-level links (no dropdown, no group header) so
              every authorized module is directly visible; horizontal
              scroll/wrap is accepted in exchange. My Workspace stays a
              dropdown (explicit requirement — it's a 7-item personal
              menu, not a module list). Non-Super-Admin viewers are
              unaffected: same grouped/dropdown bar as before, unchanged —
              this is a Super-Admin-only presentation choice, never a
              permission change (itemVisible/visibleNavGroups above are
              identical for every role). No route, page, or authorization
              check changes; this only decides dropdown vs. flat link. */}
          {visibleNavGroups.map((group) => {
            if (group.label === "My Workspace") {
              return <AdminNavDropdown key={group.label} label={group.label} items={group.items} />;
            }
            if (group.items.length === 1) {
              return (
                <Link
                  key={group.label}
                  href={group.items[0].href}
                  className="font-sans text-body-small text-white/70 hover:text-white py-3 px-2 whitespace-nowrap"
                >
                  {group.label}
                </Link>
              );
            }
            if (!isSuper) {
              return <AdminNavDropdown key={group.label} label={group.label} items={group.items} />;
            }
            return group.items.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="font-sans text-body-small text-white/70 hover:text-white py-3 px-2 whitespace-nowrap"
              >
                {item.label}
              </Link>
            ));
          })}
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
