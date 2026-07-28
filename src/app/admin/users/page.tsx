import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser, hasRole, isSuperAdmin } from "@/lib/portal/roles";
import { listUsersWithRoles, listOperationalTitles, listEngagementTypes } from "@/lib/portal/adminData";
import { listClassifications } from "@/lib/portal/memberNumbers";
import UsersManager from "./UsersManager";

export const metadata: Metadata = {
  title: "Users & Roles — Ordift Studios Admin",
  robots: { index: false, follow: false },
};

export default async function AdminUsersPage() {
  const user = await getCurrentUser();
  // Mandatory, not defense-in-depth: the /admin layout only requires
  // staff-or-admin; admin-only pages must guard themselves. Also
  // listUsersWithRoles() reads via the service-role client (bypasses
  // RLS), so there's no database-level backstop the way there is on the
  // Enquiries/Bookings views.
  if (!user || !hasRole(user, "admin")) redirect("/admin/overview");

  const [result, operationalTitles, engagementTypes, classifications] = await Promise.all([
    listUsersWithRoles(),
    listOperationalTitles(),
    listEngagementTypes(),
    listClassifications(),
  ]);

  return (
    <div>
      <div className="mb-8">
        <p className="font-sans font-semibold uppercase tracking-[0.2em] text-eyebrow text-ordift-gold-pressed mb-2">
          Admin
        </p>
        <h1 className="font-serif font-medium text-section-heading lg:text-section-heading-desktop text-ordift-ink">
          Users &amp; Roles
        </h1>
        <p className="font-sans text-body-small text-ordift-ink-muted mt-2 max-w-2xl">
          Client and Workshop Participant access is granted automatically on public signup. Every other role —
          Model, Vendor, Staff, Contractor, Admin, Super Admin — is managed here. Suspending or deactivating an
          account preserves its history; it is never deleted.
        </p>
      </div>

      {!result.ok ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3">
          <p className="font-sans text-body-small text-red-700">
            Couldn&apos;t load accounts — Supabase&apos;s Admin API returned an
            error after retrying. This has been an observed transient issue on
            this project; reloading the page usually resolves it. ({result.error})
          </p>
        </div>
      ) : (
        <UsersManager
          users={result.users}
          currentUserId={user.id}
          currentUserIsSuperAdmin={isSuperAdmin(user)}
          operationalTitles={operationalTitles}
          engagementTypes={engagementTypes}
          classifications={classifications}
        />
      )}
    </div>
  );
}
