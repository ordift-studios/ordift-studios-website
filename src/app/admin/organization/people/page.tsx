import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser, hasRole, isSuperAdmin } from "@/lib/portal/roles";
import { listUsersWithRoles } from "@/lib/portal/adminData";
import { PeopleDirectory } from "./PeopleDirectory";

export const metadata: Metadata = {
  title: "People Directory — Ordift Studios Admin",
  robots: { index: false, follow: false },
};

// People / Workforce Directory (2026-09-16) — card and list views over
// the SAME account records /admin/users already manages (listUsersWithRoles()),
// never a second source of truth. Each row links to the existing,
// already-comprehensive individual profile (/admin/organization/people/[id]).
export default async function PeopleDirectoryPage() {
  const user = await getCurrentUser();
  if (!user || (!hasRole(user, "admin") && !isSuperAdmin(user))) redirect("/admin/overview");

  const result = await listUsersWithRoles();

  return (
    <div>
      <div className="mb-8">
        <p className="font-sans font-semibold uppercase tracking-[0.2em] text-eyebrow text-ordift-gold-pressed mb-2">Admin · People</p>
        <h1 className="font-serif font-medium text-section-heading lg:text-section-heading-desktop text-ordift-ink">People Directory</h1>
        <p className="font-sans text-body-small text-ordift-ink-muted mt-2 max-w-2xl">
          Every account on record — employees and external workforce alike. Card and list views, search, and filters
          over the same data Users &amp; Roles manages.
        </p>
      </div>

      {!result.ok ? (
        <p className="font-sans text-body-small text-red-700">Couldn&apos;t load accounts ({result.error}).</p>
      ) : (
        <PeopleDirectory people={result.users} />
      )}
    </div>
  );
}
