import type { Metadata } from "next";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { getCurrentUser, hasRole, isSuperAdmin } from "@/lib/portal/roles";
import { listUsersWithRoles } from "@/lib/portal/adminData";
import { listAuthorityGrants, isGrantActive } from "@/lib/organization/authority";
import { getPersonFinancialAuthorityLevel } from "@/lib/organization/financialAuthorityGrants";
import { FINANCIAL_AUTHORITY_LEVEL_LABELS } from "@/lib/organization/financialAuthority";
import { listActingAssignments, isActingAssignmentActive } from "@/lib/organization/actingAssignments";
import { listBackgroundScreeningsForProfile, BACKGROUND_SCREENING_CATEGORIES, BACKGROUND_SCREENING_STATUSES } from "@/lib/organization/backgroundScreening";
import { listCorporateIdentities } from "@/lib/organization/reserveCorporateIdentity";
import { getActivityForEntity } from "@/lib/admin/activityLog";
import { setEmploymentStatusAction, recordBackgroundScreeningAction, updateAccessStatusFormAction } from "./actions";

export const metadata: Metadata = {
  title: "Person — Ordift Studios Admin",
  robots: { index: false, follow: false },
};

const EMPLOYMENT_STATUS_LABELS: Record<string, string> = {
  pre_start: "Pre-Start",
  active: "Active",
  probation: "Probation",
  leave: "Leave",
  suspended: "Suspended",
  notice_period: "Notice Period",
  exited: "Exited",
};

// Person Detail View (Organizational Structure & Authority Grants V1,
// 2026-09-07, Part 51) — Identity/Organization/Engagement/Access/
// Authority/Compliance-Onboarding/Work Email/History as clearly
// separated sections, deliberately NOT one enormous form. Reuses
// listUsersWithRoles()'s already-rich per-person row (Grade/Position/
// Department/reporting/onboarding — all pre-existing) rather than
// re-querying any of that; layers only the genuinely new pieces
// (Financial Authority, Acting Assignments, Employment Status,
// Background Screening, work-email approval state) on top.
export default async function PersonDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const currentUser = await getCurrentUser();
  if (!currentUser || !(hasRole(currentUser, "admin") || isSuperAdmin(currentUser))) redirect("/admin/overview");
  const isSuper = isSuperAdmin(currentUser);

  const [usersResult, grants, actingAssignments, identities] = await Promise.all([
    listUsersWithRoles(),
    listAuthorityGrants(),
    listActingAssignments(),
    listCorporateIdentities(),
  ]);
  if (!usersResult.ok) redirect("/admin/users");
  const person = usersResult.users.find((u) => u.id === id);
  if (!person) notFound();

  const [financialLevel, screenings, recentActivity] = await Promise.all([
    getPersonFinancialAuthorityLevel(id),
    listBackgroundScreeningsForProfile(id, currentUser.id), // empty for non-Super-Admin, by construction
    getActivityForEntity("user", id, 20),
  ]);

  const personGrants = grants.filter((g) => g.profileId === id && isGrantActive(g));
  const personActingAssignments = actingAssignments.filter((a) => a.profileId === id);
  const identity = identities.find((i) => i.profileId === id) ?? null;

  return (
    <div className="space-y-8">
      <div>
        <p className="font-sans font-semibold uppercase tracking-[0.2em] text-eyebrow text-ordift-gold-pressed mb-2">
          Admin · Organization
        </p>
        <h1 className="font-serif font-medium text-section-heading lg:text-section-heading-desktop text-ordift-ink">
          {person.fullName ?? person.email ?? id}
        </h1>
        <p className="font-sans text-body-small text-ordift-ink-muted mt-2">
          <Link href="/admin/organization" className="underline underline-offset-4">← Organization</Link>
          {" · "}
          <Link href="/admin/users" className="underline underline-offset-4">Users & Roles</Link>
        </p>
      </div>

      <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="rounded-xl border border-black/10 bg-white p-6 space-y-2">
          <h2 className="font-serif font-medium text-body text-ordift-ink">Identity</h2>
          <p className="font-sans text-body-small text-ordift-ink-muted">Name: {person.fullName ?? "—"}</p>
          <p className="font-sans text-body-small text-ordift-ink-muted">Personal/contact email: {person.email ?? "—"}</p>
          <p className="font-sans text-body-small text-ordift-ink-muted">
            Work email: {identity ? `${identity.email} (${identity.status})` : "Not reserved yet"}
          </p>
        </div>

        <div className="rounded-xl border border-black/10 bg-white p-6 space-y-2">
          <h2 className="font-serif font-medium text-body text-ordift-ink">Organization</h2>
          <p className="font-sans text-body-small text-ordift-ink-muted">Grade: {person.gradeCode ? `${person.gradeCode} — ${person.gradeName}` : "—"}</p>
          <p className="font-sans text-body-small text-ordift-ink-muted">Title/Position: {person.positionName ?? person.operationalTitleName ?? "—"}</p>
          <p className="font-sans text-body-small text-ordift-ink-muted">Department: {person.departmentName ?? "—"}</p>
          <p className="font-sans text-body-small text-ordift-ink-muted">Call Sign: {person.callSign ?? "—"}</p>
          <p className="font-sans text-body-small text-ordift-ink-muted">Reports to: {person.managerName ?? "—"}</p>
        </div>

        <div className="rounded-xl border border-black/10 bg-white p-6 space-y-3">
          <h2 className="font-serif font-medium text-body text-ordift-ink">Engagement</h2>
          <p className="font-sans text-body-small text-ordift-ink-muted">Engagement classification: {person.engagementTypeName ?? "—"}</p>
          <p className="font-sans text-body-small text-ordift-ink-muted">
            Employment status: {person.employmentStatus ? (EMPLOYMENT_STATUS_LABELS[person.employmentStatus] ?? person.employmentStatus) : "Not set"}
          </p>
          <form action={setEmploymentStatusAction} className="flex flex-wrap items-center gap-2">
            <input type="hidden" name="profileId" value={id} />
            <select name="status" defaultValue="" required className="rounded-lg border border-black/15 bg-white px-2 py-1 font-sans text-caption">
              <option value="" disabled>Set employment status…</option>
              {Object.entries(EMPLOYMENT_STATUS_LABELS).map(([slug, label]) => (
                <option key={slug} value={slug}>{label}</option>
              ))}
            </select>
            <button type="submit" className="font-sans text-caption font-semibold px-3 py-1 rounded-md bg-ordift-navy-950 text-white">Update</button>
          </form>
        </div>

        <div className="rounded-xl border border-black/10 bg-white p-6 space-y-3">
          <h2 className="font-serif font-medium text-body text-ordift-ink">Access</h2>
          <p className="font-sans text-body-small text-ordift-ink-muted">System roles: {person.roles.join(", ") || "—"}</p>
          <p className="font-sans text-body-small text-ordift-ink-muted">Account/system access status: {person.accessStatus}</p>
          <form action={updateAccessStatusFormAction} className="flex flex-wrap items-center gap-2">
            <input type="hidden" name="userId" value={id} />
            <select name="status" defaultValue="" required className="rounded-lg border border-black/15 bg-white px-2 py-1 font-sans text-caption">
              <option value="" disabled>Set access status…</option>
              <option value="invited">Invited</option>
              <option value="active">Active</option>
              <option value="restricted">Restricted</option>
              <option value="suspended">Suspended</option>
              <option value="deactivated">Deactivated</option>
            </select>
            <input type="text" name="reason" placeholder="Reason" className="rounded-lg border border-black/15 px-2 py-1 font-sans text-caption" />
            <button type="submit" className="font-sans text-caption font-semibold px-3 py-1 rounded-md bg-ordift-navy-950 text-white">Update</button>
          </form>
        </div>

        <div className="rounded-xl border border-black/10 bg-white p-6 space-y-2">
          <h2 className="font-serif font-medium text-body text-ordift-ink">Authority</h2>
          <p className="font-sans text-body-small text-ordift-ink-muted">
            Financial Authority Level: {financialLevel !== null ? FINANCIAL_AUTHORITY_LEVEL_LABELS[financialLevel] : "None granted"}
          </p>
          {personGrants.length > 0 ? (
            <ul className="space-y-1">
              {personGrants.map((g) => (
                <li key={g.id} className="font-sans text-caption text-ordift-ink-muted">
                  · {g.authority}{g.scopeDepartmentName ? ` · ${g.scopeDepartmentName}` : ""}{g.expiresAt ? ` · expires ${new Date(g.expiresAt).toLocaleDateString()}` : " · standing"}
                </li>
              ))}
            </ul>
          ) : (
            <p className="font-sans text-caption text-ordift-ink-muted">No active Authority Grants.</p>
          )}
          {personActingAssignments.length > 0 && (
            <>
              <p className="font-sans text-caption font-semibold text-ordift-ink mt-2">Acting Assignments</p>
              <ul className="space-y-1">
                {personActingAssignments.map((a) => (
                  <li key={a.id} className="font-sans text-caption text-ordift-ink-muted">
                    · {a.actingTitle} ({a.startDate} → {a.endDate}) — {isActingAssignmentActive(a) ? "active" : "not active"}
                  </li>
                ))}
              </ul>
            </>
          )}
          <Link href="/admin/authority" className="font-sans text-caption text-ordift-gold-pressed underline underline-offset-4 inline-block mt-1">
            Manage in Authority →
          </Link>
        </div>

        <div className="rounded-xl border border-black/10 bg-white p-6 space-y-2">
          <h2 className="font-serif font-medium text-body text-ordift-ink">Compliance / Onboarding</h2>
          <p className="font-sans text-body-small text-ordift-ink-muted">Onboarding status: {person.onboardingStatus ?? "Not started"}</p>
          {isSuper ? (
            <>
              <p className="font-sans text-caption font-semibold text-ordift-ink mt-2">Background Screening (Super Admin only)</p>
              {screenings.length > 0 ? (
                <ul className="space-y-1">
                  {screenings.map((s) => (
                    <li key={s.id} className="font-sans text-caption text-ordift-ink-muted">· {s.category}: {s.status}{s.jurisdiction ? ` (${s.jurisdiction})` : ""}</li>
                  ))}
                </ul>
              ) : (
                <p className="font-sans text-caption text-ordift-ink-muted">No screening recorded.</p>
              )}
              <form action={recordBackgroundScreeningAction} className="grid grid-cols-2 gap-2 mt-2">
                <input type="hidden" name="profileId" value={id} />
                <select name="category" required defaultValue="" className="rounded-lg border border-black/15 bg-white px-2 py-1 font-sans text-caption">
                  <option value="" disabled>Category…</option>
                  {BACKGROUND_SCREENING_CATEGORIES.map((c) => (
                    <option key={c} value={c}>{c.replace(/_/g, " ")}</option>
                  ))}
                </select>
                <select name="status" required defaultValue="" className="rounded-lg border border-black/15 bg-white px-2 py-1 font-sans text-caption">
                  <option value="" disabled>Status…</option>
                  {BACKGROUND_SCREENING_STATUSES.map((s) => (
                    <option key={s} value={s}>{s.replace(/_/g, " ")}</option>
                  ))}
                </select>
                <input name="jurisdiction" placeholder="Jurisdiction (e.g. Ghana)" className="rounded-lg border border-black/15 px-2 py-1 font-sans text-caption col-span-2" />
                <input name="evidenceReference" placeholder="Evidence reference (pointer only)" className="rounded-lg border border-black/15 px-2 py-1 font-sans text-caption col-span-2" />
                <button type="submit" className="col-span-2 font-sans text-caption font-semibold px-3 py-1 rounded-md bg-ordift-navy-950 text-white">Record Decision</button>
              </form>
            </>
          ) : (
            <p className="font-sans text-caption text-ordift-ink-muted">Background screening is Super-Admin-only.</p>
          )}
        </div>
      </section>

      <section className="rounded-xl border border-black/10 bg-white p-6 space-y-2">
        <h2 className="font-serif font-medium text-body text-ordift-ink">History</h2>
        {recentActivity.length > 0 ? (
          <ul className="divide-y divide-black/5">
            {recentActivity.map((e) => (
              <li key={e.id} className="py-2 font-sans text-caption text-ordift-ink-muted">
                {new Date(e.createdAt).toLocaleString()} — {e.action}
              </li>
            ))}
          </ul>
        ) : (
          <p className="font-sans text-body-small text-ordift-ink-muted">No recorded activity yet.</p>
        )}
      </section>
    </div>
  );
}
