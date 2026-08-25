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
const NAV_ITEMS: { label: string; href: string; adminOnly?: boolean; superAdminOnly?: boolean; executiveOnly?: boolean }[] = [
  { label: "Overview", href: "/admin/overview" },
  // Ordift Unified Executive Administration Platform (2026-08-25) —
  // visible to Super Admin or an Executive Admin grant holder only
  // (executiveOnly, checked asynchronously below, unlike the other
  // flags). Each jurisdiction sub-page independently re-checks its own
  // specific capability — this nav entry is not the security boundary.
  { label: "Executive", href: "/admin/executive", executiveOnly: true },
  { label: "Enquiries", href: "/admin/enquiries" },
  { label: "Bookings", href: "/admin/bookings" },
  { label: "Payments", href: "/admin/payments" },
  { label: "Portfolio", href: "/admin/portfolio" },
  { label: "Workshop Management", href: "/admin/workshops" },
  { label: "Reports", href: "/admin/reports" },
  { label: "Content", href: "/admin/content" },
  { label: "Activity", href: "/admin/activity" },
  { label: "Users & Roles", href: "/admin/users", adminOnly: true },
  { label: "Meet the Team", href: "/admin/team", superAdminOnly: true },
  { label: "Recruitment", href: "/admin/recruitment", adminOnly: true },
  { label: "Ordift Pulse", href: "/admin/pulse", adminOnly: true },
  { label: "Organization", href: "/admin/organization", adminOnly: true },
  { label: "Authority", href: "/admin/authority", superAdminOnly: true },
  // Closure refinement (2026-08-25) — label only, not the route or the
  // page itself: distinguishes this flat, cross-jurisdiction utility
  // view from the "Executive" jurisdiction-framed hub next to it in
  // this same nav bar, without restructuring either.
  { label: "Operations (Utility)", href: "/admin/operations", superAdminOnly: true },
  { label: "Titles & Classifications", href: "/admin/lookups", superAdminOnly: true },
  { label: "Feature Flags", href: "/admin/flags", adminOnly: true },
  { label: "Settings", href: "/admin/settings", adminOnly: true },
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
  const visibleNavItems = NAV_ITEMS.filter(
    (item) => (!item.adminOnly || isAdmin) && (!item.superAdminOnly || isSuper) && (!item.executiveOnly || isExecutive)
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
        <div className="max-w-6xl mx-auto px-4 sm:px-8 flex gap-6 border-t border-white/10 overflow-x-auto">
          {visibleNavItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="font-sans text-body-small text-white/70 hover:text-white py-3 whitespace-nowrap"
            >
              {item.label}
            </Link>
          ))}
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
