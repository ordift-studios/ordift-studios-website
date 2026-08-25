import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser, isSuperAdmin } from "@/lib/portal/roles";
import { listUsersWithRoles } from "@/lib/portal/adminData";
import { listDepartmentOptions } from "@/lib/organization/adminData";
import { listAuthorityGrants, isGrantActive } from "@/lib/organization/authority";
import { grantExecutiveAdminAction, grantDepartmentAuthorityAction, createDelegationAction, revokeAuthorityGrantAction } from "./actions";

export const metadata: Metadata = {
  title: "Authority — Ordift Studios Admin",
  robots: { index: false, follow: false },
};

// Ordift Organizational & Administrative Architecture V1, Phase 3, Parts
// B and D (2026-08-25). Super-Admin-only — this is where Executive
// Admin, Director-tier department authority, and time-bound delegations
// are granted/revoked. See supabase/migrations/0042_phase3_callsigns_authority_reporting.sql
// and src/lib/organization/authority.ts for the full design. Nothing on
// this page ever touches roles/user_roles, Grade, Position, or staff/
// member numbers.
export default async function AdminAuthorityPage() {
  const user = await getCurrentUser();
  if (!user || !isSuperAdmin(user)) redirect("/admin/overview");

  const [usersResult, departments, grants] = await Promise.all([
    listUsersWithRoles(),
    listDepartmentOptions(),
    listAuthorityGrants(),
  ]);
  const people = usersResult.ok
    ? usersResult.users.map((u) => ({ id: u.id, label: u.fullName ? `${u.fullName} (${u.email ?? "no email"})` : (u.email ?? u.id) }))
    : [];
  const peopleById = new Map(people.map((p) => [p.id, p.label]));

  const active = grants.filter((g) => isGrantActive(g));
  const history = grants.filter((g) => !isGrantActive(g));
  const executiveAdmins = active.filter((g) => g.authority === "executive_admin");
  const departmentAdmins = active.filter((g) => g.authority === "department_admin");
  const delegations = active.filter((g) => g.authority !== "executive_admin" && g.authority !== "department_admin");

  function GrantRow({ grant }: { grant: (typeof grants)[number] }) {
    return (
      <li className="flex items-center justify-between gap-3 rounded-lg border border-black/10 bg-white px-4 py-3">
        <div>
          <p className="font-sans text-body-small text-ordift-ink font-medium">
            {peopleById.get(grant.profileId) ?? grant.profileId}
          </p>
          <p className="font-sans text-caption text-ordift-ink-muted">
            {grant.authority}
            {grant.scopeDepartmentName ? ` · ${grant.scopeDepartmentName}` : ""}
            {grant.expiresAt ? ` · expires ${new Date(grant.expiresAt).toLocaleString("en-GB")}` : " · standing"}
            {grant.reason ? ` · ${grant.reason}` : ""}
          </p>
        </div>
        <form action={revokeAuthorityGrantAction}>
          <input type="hidden" name="grantId" value={grant.id} />
          <button type="submit" className="font-sans text-caption text-ordift-gold-pressed underline underline-offset-4 whitespace-nowrap">
            Revoke
          </button>
        </form>
      </li>
    );
  }

  return (
    <div>
      <div className="mb-8">
        <p className="font-sans font-semibold uppercase tracking-[0.2em] text-eyebrow text-ordift-gold-pressed mb-2">Admin</p>
        <h1 className="font-serif font-medium text-section-heading lg:text-section-heading-desktop text-ordift-ink">Authority</h1>
        <p className="font-sans text-body-small text-ordift-ink-muted mt-2 max-w-2xl">
          Executive Admin, Director-tier department authority, and time-bound delegations — an authority layer that
          sits alongside roles/user_roles, never replacing them. Nothing granted here changes anyone&rsquo;s Grade,
          Position, staff/member number, or system role.
        </p>
      </div>

      <section className="rounded-xl border border-black/10 bg-white p-6 space-y-4 mb-8">
        <h2 className="font-serif font-medium text-body text-ordift-ink">Executive Admin</h2>
        <p className="font-sans text-caption text-ordift-ink-muted -mt-2">
          Broad operational authority below Super Admin. Does not automatically inherit Super-Admin-only capabilities
          (managing other Super Admins, Grade/Craft/Classification catalogues, or other security controls).
        </p>
        <ul className="space-y-2">
          {executiveAdmins.map((g) => (
            <GrantRow key={g.id} grant={g} />
          ))}
          {executiveAdmins.length === 0 && <p className="font-sans text-body-small text-ordift-ink-muted">None currently active.</p>}
        </ul>
        <form action={grantExecutiveAdminAction} className="flex flex-wrap items-end gap-2 pt-2 border-t border-black/5">
          <select name="profileId" required defaultValue="" className="min-h-9 rounded-lg border border-black/15 bg-white px-2 font-sans text-body-small">
            <option value="" disabled>Choose a person…</option>
            {people.map((p) => (
              <option key={p.id} value={p.id}>{p.label}</option>
            ))}
          </select>
          <input type="text" name="reason" placeholder="Reason (optional)" className="min-w-56 rounded-lg border border-black/15 px-3 py-1.5 font-sans text-body-small" />
          <button type="submit" className="font-sans text-body-small font-semibold px-4 py-1.5 rounded-md bg-ordift-navy-950 text-white">
            Grant Executive Admin
          </button>
        </form>
      </section>

      <section className="rounded-xl border border-black/10 bg-white p-6 space-y-4 mb-8">
        <h2 className="font-serif font-medium text-body text-ordift-ink">Director-Tier Department Authority</h2>
        <p className="font-sans text-caption text-ordift-ink-muted -mt-2">
          Standing authority scoped to one department — e.g. MAESTRO for Creative &amp; Production, ENVOY for Client,
          Marketing &amp; Commercial. Comes from Position + Department + this explicit grant, not from holding a
          generic Admin label.
        </p>
        <ul className="space-y-2">
          {departmentAdmins.map((g) => (
            <GrantRow key={g.id} grant={g} />
          ))}
          {departmentAdmins.length === 0 && <p className="font-sans text-body-small text-ordift-ink-muted">None currently active.</p>}
        </ul>
        <form action={grantDepartmentAuthorityAction} className="flex flex-wrap items-end gap-2 pt-2 border-t border-black/5">
          <select name="profileId" required defaultValue="" className="min-h-9 rounded-lg border border-black/15 bg-white px-2 font-sans text-body-small">
            <option value="" disabled>Choose a person…</option>
            {people.map((p) => (
              <option key={p.id} value={p.id}>{p.label}</option>
            ))}
          </select>
          <select name="departmentId" required defaultValue="" className="min-h-9 rounded-lg border border-black/15 bg-white px-2 font-sans text-body-small">
            <option value="" disabled>Choose a department…</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
          <input type="text" name="reason" placeholder="Reason (optional)" className="min-w-56 rounded-lg border border-black/15 px-3 py-1.5 font-sans text-body-small" />
          <button type="submit" className="font-sans text-body-small font-semibold px-4 py-1.5 rounded-md bg-ordift-navy-950 text-white">
            Grant Department Authority
          </button>
        </form>
      </section>

      <section className="rounded-xl border border-black/10 bg-white p-6 space-y-4 mb-8">
        <h2 className="font-serif font-medium text-body text-ordift-ink">Temporary Delegation</h2>
        <p className="font-sans text-caption text-ordift-ink-muted -mt-2">
          Scoped, auditable, time-bound authority — for when the designated executive is unavailable and a
          time-sensitive matter needs a decision. Never changes Grade, Position, staff number, or permanent system
          role, and lapses automatically at the expiry you set.
        </p>
        <ul className="space-y-2">
          {delegations.map((g) => (
            <GrantRow key={g.id} grant={g} />
          ))}
          {delegations.length === 0 && <p className="font-sans text-body-small text-ordift-ink-muted">None currently active.</p>}
        </ul>
        <form action={createDelegationAction} className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-4 border-t border-black/5">
          <select name="profileId" required defaultValue="" className="rounded-lg border border-black/15 bg-white px-2 py-1.5 font-sans text-body-small">
            <option value="" disabled>Receiving person…</option>
            {people.map((p) => (
              <option key={p.id} value={p.id}>{p.label}</option>
            ))}
          </select>
          <input type="text" name="authority" placeholder="Authority/capability being delegated (e.g. approve_bank_transfer)" required className="rounded-lg border border-black/15 px-3 py-1.5 font-sans text-body-small" />
          <select name="departmentId" defaultValue="" className="rounded-lg border border-black/15 bg-white px-2 py-1.5 font-sans text-body-small">
            <option value="">Scope: entire business (no department limit)</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
          <input type="datetime-local" name="expiresAt" required className="rounded-lg border border-black/15 px-3 py-1.5 font-sans text-body-small" />
          <input type="text" name="reason" placeholder="Reason (required)" required className="rounded-lg border border-black/15 px-3 py-1.5 font-sans text-body-small sm:col-span-2" />
          <button type="submit" className="sm:col-span-2 justify-self-start font-sans text-body-small font-semibold px-4 py-2 rounded-md bg-ordift-gold text-ordift-navy-950">
            Create Delegation
          </button>
        </form>
      </section>

      <section className="rounded-xl border border-black/10 bg-white p-6 space-y-3">
        <h2 className="font-serif font-medium text-body text-ordift-ink">History</h2>
        <p className="font-sans text-caption text-ordift-ink-muted -mt-2">
          Revoked and expired grants — permanent record, never deleted.
        </p>
        <ul className="space-y-2">
          {history.map((g) => (
            <li key={g.id} className="rounded-lg border border-black/5 bg-ordift-offwhite/60 px-4 py-2.5">
              <p className="font-sans text-caption text-ordift-ink-muted">
                {peopleById.get(g.profileId) ?? g.profileId} · {g.authority}
                {g.scopeDepartmentName ? ` · ${g.scopeDepartmentName}` : ""}
                {g.revokedAt ? ` · revoked ${new Date(g.revokedAt).toLocaleString("en-GB")}` : " · expired"}
              </p>
            </li>
          ))}
          {history.length === 0 && <p className="font-sans text-body-small text-ordift-ink-muted">Nothing yet.</p>}
        </ul>
      </section>
    </div>
  );
}
