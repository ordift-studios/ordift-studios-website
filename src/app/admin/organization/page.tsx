import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser, hasRole, isSuperAdmin } from "@/lib/portal/roles";
import {
  listDepartments,
  listPositions,
  listDepartmentOptions,
  listOperationalTitleOptions,
  listGradeOptions,
  listRoleOptions,
} from "@/lib/organization/adminData";
import { addDepartmentAction, toggleDepartmentAction, addPositionAction, togglePositionAction } from "./actions";

export const metadata: Metadata = {
  title: "Organization — Ordift Studios Admin",
  robots: { index: false, follow: false },
};

// Ordift Organizational & Administrative Architecture V1, Phase 1
// (2026-08-25). Structural only — creating a Department or Position here
// never assigns anyone to it, never changes anyone's Grade, and never
// touches user_roles. See supabase/migrations/0037_org_departments_positions.sql.
export default async function AdminOrganizationPage() {
  const user = await getCurrentUser();
  if (!user || (!hasRole(user, "admin") && !isSuperAdmin(user))) redirect("/admin/overview");

  const [departments, positions, departmentOptions, operationalTitleOptions, gradeOptions, roleOptions] = await Promise.all([
    listDepartments(),
    listPositions(),
    listDepartmentOptions(),
    listOperationalTitleOptions(),
    listGradeOptions(),
    listRoleOptions(),
  ]);

  return (
    <div>
      <div className="mb-8">
        <p className="font-sans font-semibold uppercase tracking-[0.2em] text-eyebrow text-ordift-gold-pressed mb-2">Admin</p>
        <h1 className="font-serif font-medium text-section-heading lg:text-section-heading-desktop text-ordift-ink">Organization</h1>
        <p className="font-sans text-body-small text-ordift-ink-muted mt-2 max-w-2xl">
          Departments and Positions are structural definitions only — Phase 1 of the Ordift Organizational Architecture. Creating a
          Position here never assigns anyone to it, never changes anyone&rsquo;s Grade, and never grants a system Role. Every Position
          must specify a default Grade, which will become the authoritative source for a person&rsquo;s Grade once staff assignment is
          built in a later phase.
        </p>
      </div>

      <section className="rounded-xl border border-black/10 bg-white p-6 space-y-4 mb-8">
        <h2 className="font-serif font-medium text-body text-ordift-ink">Departments</h2>
        <ul className="divide-y divide-black/5">
          {departments.map((d) => (
            <li key={d.id} className="flex items-center justify-between py-2.5">
              <div>
                <span className={`font-sans text-body-small ${d.active ? "text-ordift-ink" : "text-ordift-ink-muted line-through"}`}>
                  {d.name}
                </span>
                {d.description && <p className="font-sans text-caption text-ordift-ink-muted">{d.description}</p>}
              </div>
              <form action={toggleDepartmentAction}>
                <input type="hidden" name="id" value={d.id} />
                <input type="hidden" name="active" value={String(d.active)} />
                <button type="submit" className="font-sans text-caption text-ordift-gold-pressed underline underline-offset-4">
                  {d.active ? "Deactivate" : "Reactivate"}
                </button>
              </form>
            </li>
          ))}
          {departments.length === 0 && <p className="font-sans text-body-small text-ordift-ink-muted py-2">None yet.</p>}
        </ul>
        <form action={addDepartmentAction} className="flex flex-wrap items-center gap-2 pt-2 border-t border-black/5">
          <input
            type="text"
            name="name"
            placeholder="Department name…"
            aria-label="New department name"
            required
            className="flex-1 min-w-[12rem] rounded-lg border border-black/15 px-3 py-1.5 font-sans text-body-small"
          />
          <input
            type="text"
            name="description"
            placeholder="Description (optional)"
            aria-label="New department description"
            className="flex-1 min-w-[12rem] rounded-lg border border-black/15 px-3 py-1.5 font-sans text-body-small"
          />
          <button type="submit" className="font-sans text-body-small font-semibold px-3 py-1.5 rounded-md bg-ordift-navy-950 text-white">
            Add Department
          </button>
        </form>
      </section>

      <section className="rounded-xl border border-black/10 bg-white p-6 space-y-4">
        <h2 className="font-serif font-medium text-body text-ordift-ink">Positions</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-ordift-ink/10">
                <th className="py-2 pr-4 font-sans text-caption uppercase tracking-[0.1em] text-ordift-ink-muted">Position</th>
                <th className="py-2 pr-4 font-sans text-caption uppercase tracking-[0.1em] text-ordift-ink-muted">Department</th>
                <th className="py-2 pr-4 font-sans text-caption uppercase tracking-[0.1em] text-ordift-ink-muted">Craft</th>
                <th className="py-2 pr-4 font-sans text-caption uppercase tracking-[0.1em] text-ordift-ink-muted">Default Grade</th>
                <th className="py-2 pr-4 font-sans text-caption uppercase tracking-[0.1em] text-ordift-ink-muted">Suggested Role</th>
                <th className="py-2 pr-4 font-sans text-caption uppercase tracking-[0.1em] text-ordift-ink-muted"></th>
              </tr>
            </thead>
            <tbody>
              {positions.map((p) => (
                <tr key={p.id} className="border-b border-ordift-ink/5 last:border-0">
                  <td className={`py-2 pr-4 font-sans text-body-small ${p.active ? "text-ordift-ink" : "text-ordift-ink-muted line-through"}`}>
                    {p.name}
                  </td>
                  <td className="py-2 pr-4 font-sans text-body-small text-ordift-ink-muted">{p.departmentName}</td>
                  <td className="py-2 pr-4 font-sans text-body-small text-ordift-ink-muted">{p.operationalTitleName ?? "—"}</td>
                  <td className="py-2 pr-4 font-sans text-body-small text-ordift-ink-muted">{p.defaultGradeName}</td>
                  <td className="py-2 pr-4 font-sans text-body-small text-ordift-ink-muted">{p.defaultRoleSlug ?? "—"}</td>
                  <td className="py-2 pr-4">
                    <form action={togglePositionAction}>
                      <input type="hidden" name="id" value={p.id} />
                      <input type="hidden" name="active" value={String(p.active)} />
                      <button type="submit" className="font-sans text-caption text-ordift-gold-pressed underline underline-offset-4">
                        {p.active ? "Deactivate" : "Reactivate"}
                      </button>
                    </form>
                  </td>
                </tr>
              ))}
              {positions.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-3 font-sans text-body-small text-ordift-ink-muted">
                    None yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <form action={addPositionAction} className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-4 border-t border-black/5">
          <input
            type="text"
            name="name"
            placeholder="Position name (e.g. Senior Photographer)"
            aria-label="New position name"
            required
            className="rounded-lg border border-black/15 px-3 py-1.5 font-sans text-body-small"
          />
          <select
            name="departmentId"
            aria-label="Department"
            required
            defaultValue=""
            className="rounded-lg border border-black/15 px-3 py-1.5 font-sans text-body-small bg-white"
          >
            <option value="" disabled>
              Department…
            </option>
            {departmentOptions.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
          <select
            name="operationalTitleId"
            aria-label="Craft / operational title (optional)"
            defaultValue=""
            className="rounded-lg border border-black/15 px-3 py-1.5 font-sans text-body-small bg-white"
          >
            <option value="">Craft / Operational Title (optional)…</option>
            {operationalTitleOptions.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
          <select
            name="defaultGradeId"
            aria-label="Default grade"
            required
            defaultValue=""
            className="rounded-lg border border-black/15 px-3 py-1.5 font-sans text-body-small bg-white"
          >
            <option value="" disabled>
              Default Grade…
            </option>
            {gradeOptions.map((g) => (
              <option key={g.id} value={g.id}>
                {g.code} — {g.name}
              </option>
            ))}
          </select>
          <select
            name="defaultRoleSlug"
            aria-label="Suggested baseline system role (optional)"
            defaultValue=""
            className="rounded-lg border border-black/15 px-3 py-1.5 font-sans text-body-small bg-white"
          >
            <option value="">Suggested Role (optional)…</option>
            {roleOptions.map((r) => (
              <option key={r.slug} value={r.slug}>
                {r.name}
              </option>
            ))}
          </select>
          <input
            type="text"
            name="description"
            placeholder="Description (optional)"
            aria-label="New position description"
            className="rounded-lg border border-black/15 px-3 py-1.5 font-sans text-body-small sm:col-span-2"
          />
          <button
            type="submit"
            className="sm:col-span-2 justify-self-start font-sans text-body-small font-semibold px-4 py-2 rounded-md bg-ordift-navy-950 text-white"
          >
            Add Position
          </button>
        </form>
      </section>
    </div>
  );
}
