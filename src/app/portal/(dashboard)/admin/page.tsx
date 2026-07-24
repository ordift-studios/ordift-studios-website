import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser, hasRole, ADMIN_GRANTED_ONLY_ROLES, type RoleSlug } from "@/lib/portal/roles";
import { listUsersWithRoles, type AdminUserRow } from "@/lib/portal/adminData";
import { grantRoleAction, revokeRoleAction } from "./actions";

export const metadata: Metadata = {
  title: "Admin — Ordift Studios Portal",
  robots: { index: false, follow: false },
};

const ROLE_LABELS: Record<RoleSlug, string> = {
  client: "Client",
  workshop_participant: "Workshop Participant",
  model: "Model",
  vendor: "Vendor",
  staff: "Staff",
  admin: "Admin",
};

function UsersTable({ users }: { users: AdminUserRow[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left border-collapse">
        <thead>
          <tr className="border-b border-black/10">
            <th className="font-sans text-caption uppercase tracking-wide text-ordift-ink-muted py-3 pr-4">
              Account
            </th>
            <th className="font-sans text-caption uppercase tracking-wide text-ordift-ink-muted py-3 pr-4">
              Roles
            </th>
            <th className="font-sans text-caption uppercase tracking-wide text-ordift-ink-muted py-3">
              Grant Role
            </th>
          </tr>
        </thead>
        <tbody>
          {users.map((u) => {
            const grantableRoles = ADMIN_GRANTED_ONLY_ROLES.filter((r) => !u.roles.includes(r));
            return (
              <tr key={u.id} className="border-b border-black/5 align-top">
                <td className="py-4 pr-4">
                  <p className="font-sans text-body-small text-ordift-ink font-medium">
                    {u.fullName ?? "—"}
                  </p>
                  <p className="font-sans text-caption text-ordift-ink-muted">{u.email ?? "—"}</p>
                </td>
                <td className="py-4 pr-4">
                  <div className="flex flex-wrap gap-2">
                    {u.roles.length === 0 && (
                      <span className="font-sans text-caption text-ordift-ink-muted">No roles</span>
                    )}
                    {u.roles.map((role) => (
                      <span
                        key={role}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-ordift-offwhite font-sans text-caption text-ordift-ink"
                      >
                        {ROLE_LABELS[role]}
                        {(ADMIN_GRANTED_ONLY_ROLES as string[]).includes(role) && (
                          <form action={revokeRoleAction}>
                            <input type="hidden" name="userId" value={u.id} />
                            <input type="hidden" name="role" value={role} />
                            <button
                              type="submit"
                              aria-label={`Revoke ${ROLE_LABELS[role]}`}
                              className="text-ordift-ink-muted hover:text-red-600 leading-none"
                            >
                              ×
                            </button>
                          </form>
                        )}
                      </span>
                    ))}
                  </div>
                </td>
                <td className="py-4">
                  {grantableRoles.length === 0 ? (
                    <span className="font-sans text-caption text-ordift-ink-muted">—</span>
                  ) : (
                    <form action={grantRoleAction} className="flex items-center gap-2">
                      <input type="hidden" name="userId" value={u.id} />
                      <select
                        name="role"
                        defaultValue=""
                        required
                        className="min-h-9 rounded-lg border border-black/15 bg-white px-2 font-sans text-body-small text-ordift-ink"
                      >
                        <option value="" disabled>
                          Choose role…
                        </option>
                        {grantableRoles.map((r) => (
                          <option key={r} value={r}>
                            {ROLE_LABELS[r]}
                          </option>
                        ))}
                      </select>
                      <button
                        type="submit"
                        className="font-sans text-body-small text-ordift-gold-pressed underline underline-offset-4"
                      >
                        Grant
                      </button>
                    </form>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default async function AdminPortalPage() {
  const user = await getCurrentUser();
  // Mandatory, not defense-in-depth: listUsersWithRoles() reads via the
  // service-role client (bypasses RLS), so there is no database-level
  // backstop here the way there is on the Client/Staff views.
  if (!user || !hasRole(user, "admin")) redirect("/portal");

  const result = await listUsersWithRoles();

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
          Client and Workshop Participant access is granted automatically.
          Model, Vendor, Staff, and Admin access is granted here.
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
      ) : result.users.length === 0 ? (
        <p className="font-sans text-body text-ordift-ink-muted">No accounts yet.</p>
      ) : (
        <UsersTable users={result.users} />
      )}
    </div>
  );
}
