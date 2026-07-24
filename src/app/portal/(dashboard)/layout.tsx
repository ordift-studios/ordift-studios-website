import { redirect } from "next/navigation";
import Link from "next/link";
import Logo from "@/components/Logo";
import { getCurrentUser, hasRole, type RoleSlug } from "@/lib/portal/roles";
import { signOutAction } from "../login/actions";

// Defense in depth: proxy.ts already redirects unauthenticated /portal/**
// requests to /portal/login, but that's a JWT-presence check only (kept
// fast, no DB query — see src/lib/supabase/middleware.ts). This layout
// does the real check, including role lookup, since every dashboard page
// needs the role list anyway to decide what to show.
const NAV_ITEMS: { role: RoleSlug; label: string; href: string }[] = [
  { role: "client", label: "My Bookings", href: "/portal/client" },
  { role: "workshop_participant", label: "My Workshops", href: "/portal/workshops" },
  { role: "model", label: "My Profile", href: "/portal/model" },
  { role: "vendor", label: "Vendor", href: "/portal/vendor" },
  { role: "staff", label: "Staff", href: "/portal/staff" },
  { role: "admin", label: "Admin", href: "/portal/admin" },
];

export default async function PortalDashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/portal/login");

  const visibleNavItems = NAV_ITEMS.filter((item) => hasRole(user, item.role));

  return (
    <div className="min-h-screen flex flex-col">
      <header className="bg-ordift-navy-950 text-white">
        <div className="max-w-6xl mx-auto px-4 sm:px-8 py-4 flex items-center justify-between">
          <Link href="/" aria-label="Ordift Studios home">
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
        {visibleNavItems.length > 1 && (
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
        )}
      </header>

      <main className="flex-1 bg-ordift-offwhite px-4 sm:px-8 py-10 sm:py-14">
        <div className="max-w-6xl mx-auto">{children}</div>
      </main>
    </div>
  );
}
