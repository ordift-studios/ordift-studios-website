import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser, isSuperAdmin } from "@/lib/portal/roles";
import { authorizeWithSuperAdminOverride, PEOPLE_CAPABILITIES } from "@/lib/organization/authority";
import { listUsersWithRoles, listOperationalTitles, listEngagementTypes } from "@/lib/portal/adminData";
import { listClassifications } from "@/lib/portal/memberNumbers";
import { listPositions } from "@/lib/organization/adminData";
import { listApprovedRequisitionsForOnboarding } from "@/lib/recruitment/requisitions";
import UsersManager from "./UsersManager";

export const metadata: Metadata = {
  title: "Users & Roles — Ordift Studios Admin",
  robots: { index: false, follow: false },
};

export default async function AdminUsersPage() {
  const user = await getCurrentUser();
  // Mandatory, not defense-in-depth: the /admin layout only requires
  // staff-or-admin; this page must guard itself. Also listUsersWithRoles()
  // reads via the service-role client (bypasses RLS), so there's no
  // database-level backstop the way there is on the Enquiries/Bookings
  // views.
  //
  // Security narrowing (2026-09-07) — this used to accept any plain
  // `admin` role holder. The general staff/workforce roster is now
  // restricted to Super Admin OR a holder of the dormant
  // people.workforce.administer capability (see authority.ts) — the
  // same capability-based architecture as every other Admin Platform
  // module, never a hardcoded person/email. Zero authority_grants rows
  // exist in Production today, so this is Super-Admin-only in
  // practice; a future genuinely-authorized HR/workforce administrator
  // can be granted exactly this capability via /admin/authority
  // without being made Super Admin.
  if (!user) redirect("/admin/overview");
  const auth = await authorizeWithSuperAdminOverride(user.id, PEOPLE_CAPABILITIES.workforceAdminister);
  if (!auth.ok) redirect("/admin/overview");

  const [result, operationalTitles, engagementTypes, classifications, positions, approvedRequisitions] = await Promise.all([
    listUsersWithRoles(),
    listOperationalTitles(),
    listEngagementTypes(),
    listClassifications(),
    listPositions(),
    listApprovedRequisitionsForOnboarding(),
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
          positions={positions}
          approvedRequisitions={approvedRequisitions}
        />
      )}
    </div>
  );
}
