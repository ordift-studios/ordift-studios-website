import { redirect } from "next/navigation";
import Link from "next/link";
import Logo from "@/components/Logo";
import { getCurrentUser } from "@/lib/portal/roles";
import { getOwnPayeeProfile } from "@/lib/payables/payeeProfiles";
import { isWorkshopInstructor } from "@/lib/workshops/instructorEngagements";
import { resolveVisibleNavItems } from "@/lib/portal/navigation";
import { signOutAction } from "../login/actions";

// Defense in depth: proxy.ts already redirects unauthenticated /portal/**
// requests to /portal/login, but that's a JWT-presence check only (kept
// fast, no DB query — see src/lib/supabase/middleware.ts). This layout
// does the real check, including role lookup, since every dashboard page
// needs the role list anyway to decide what to show. The actual role →
// nav-item mapping lives in resolveVisibleNavItems() (navigation.ts) —
// a pure, independently-tested function — so a fixture-based regression
// test can catch a broken mapping without touching this async layout.

export default async function PortalDashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/portal/login");

  // Payment Details (2026-09-04) / Instructor Portal (2026-09-16) —
  // both real capability facts, not roles (public.payee_profiles /
  // workshop_instructor_engagements ownership), resolved here and
  // passed into the pure function above.
  const [isPayee, isInstructor] = await Promise.all([
    getOwnPayeeProfile(user.id).then(Boolean),
    isWorkshopInstructor(user.id),
  ]);
  const visibleNavItems = resolveVisibleNavItems(user, isPayee, isInstructor);

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
