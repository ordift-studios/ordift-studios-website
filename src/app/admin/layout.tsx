import { redirect } from "next/navigation";
import Link from "next/link";
import Logo from "@/components/Logo";
import { getCurrentUser, hasRole, isStaffOrAdmin, isSuperAdmin } from "@/lib/portal/roles";
import { signOutAction } from "@/app/portal/login/actions";

// Internal operations console — separate from the customer/partner-facing
// /portal, but built on the exact same auth/role foundation (Supabase Auth
// + getCurrentUser()/hasRole()). Restricted to staff and admin; everyone
// else is bounced to their own portal home. Same defense-in-depth
// reasoning as src/app/portal/(dashboard)/layout.tsx: proxy.ts only does a
// fast JWT-presence check for /portal/**, not /admin/**, so this layout's
// getCurrentUser() call is the actual gate here, not just a backstop.
const NAV_ITEMS: { label: string; href: string; adminOnly?: boolean; superAdminOnly?: boolean }[] = [
  { label: "Overview", href: "/admin/overview" },
  { label: "Enquiries", href: "/admin/enquiries" },
  { label: "Bookings", href: "/admin/bookings" },
  { label: "Content", href: "/admin/content" },
  { label: "Activity", href: "/admin/activity" },
  { label: "Users & Roles", href: "/admin/users", adminOnly: true },
  { label: "Titles & Engagement Types", href: "/admin/lookups", superAdminOnly: true },
  { label: "Feature Flags", href: "/admin/flags", adminOnly: true },
  { label: "Settings", href: "/admin/settings", adminOnly: true },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/portal/login?next=/admin");
  if (!isStaffOrAdmin(user)) redirect("/portal");

  const isAdmin = hasRole(user, "admin");
  const isSuper = isSuperAdmin(user);
  const visibleNavItems = NAV_ITEMS.filter(
    (item) => (!item.adminOnly || isAdmin) && (!item.superAdminOnly || isSuper)
  );

  return (
    <div className="min-h-screen flex flex-col">
      <header className="bg-ordift-navy-950 text-white">
        <div className="max-w-6xl mx-auto px-4 sm:px-8 py-4 flex items-center justify-between">
          <Link href="/admin" aria-label="Ordift Studios admin home">
            <Logo variant="nav" color="white" height={24} priority />
          </Link>
          <div className="flex items-center gap-4">
            <span className="font-sans text-body-small text-white/70 hidden sm:inline">
              {user.fullName ?? user.email}
            </span>
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
        <div className="max-w-6xl mx-auto">{children}</div>
      </main>
    </div>
  );
}
