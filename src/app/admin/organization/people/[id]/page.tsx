import type { Metadata } from "next";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { getCurrentUser, isSuperAdmin } from "@/lib/portal/roles";
import { authorizeWithSuperAdminOverride, PEOPLE_CAPABILITIES, listAuthorityGrants, isGrantActive } from "@/lib/organization/authority";
import { listUsersWithRoles } from "@/lib/portal/adminData";
import { getPersonFinancialAuthorityLevel } from "@/lib/organization/financialAuthorityGrants";
import { FINANCIAL_AUTHORITY_LEVEL_LABELS } from "@/lib/organization/financialAuthority";
import { listActingAssignments, isActingAssignmentActive } from "@/lib/organization/actingAssignments";
import { listBackgroundScreeningsForProfile, BACKGROUND_SCREENING_CATEGORIES, BACKGROUND_SCREENING_STATUSES } from "@/lib/organization/backgroundScreening";
import { listCorporateIdentities } from "@/lib/organization/reserveCorporateIdentity";
import { getActivityForEntity } from "@/lib/admin/activityLog";
import { listSeparationCases, SEPARATION_CATEGORIES, SEPARATION_REASON_TYPES } from "@/lib/organization/separationCases";
import { listPerformanceReviewsForProfile, listPipsForProfile, PIP_ALLOWED_DURATIONS_DAYS } from "@/lib/organization/performanceReviews";
import { listInvestigationsForProfile, listSuspensionsForProfile, listDisciplinaryActionsForProfile, DISCIPLINARY_ACTION_TYPES } from "@/lib/organization/discipline";
import {
  listSalaryAdvancesForProfile,
  listStaffBenefitTransactionsForProfile,
  listLongServiceBenefitAwardsForProfile,
  LONG_SERVICE_MILESTONE_PERCENTAGES,
} from "@/lib/organization/compensation";
import {
  setEmploymentStatusAction,
  recordBackgroundScreeningAction,
  updateAccessStatusFormAction,
  initiateSeparationCaseAction,
  recordPerformanceReviewAction,
  initiatePipAction,
  recordPipCheckinAction,
  extendPipAction,
  decidePipAction,
  issueDisciplinaryActionAction,
  openInvestigationAction,
  closeInvestigationAction,
  recordInvestigatorySuspensionAction,
  recordSuspensionReviewAction,
  requestSalaryAdvanceAction,
  decideSalaryAdvanceAction,
  disburseSalaryAdvanceAction,
  recordStaffBenefitTransactionAction,
  awardLongServiceBenefitAction,
  awardDeathInServiceBenefitAction,
} from "./actions";

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
  // Security narrowing (2026-09-07) — matches /admin/users' own
  // capability-based gate exactly (this page surfaces/edits the same
  // workforce data — Access Status, Employment Status — so leaving it
  // reachable by a plain admin while /admin/users is narrowed would
  // just reopen the same gap through a side door).
  if (!currentUser) redirect("/admin/overview");
  const workforceAuth = await authorizeWithSuperAdminOverride(currentUser.id, PEOPLE_CAPABILITIES.workforceAdminister);
  if (!workforceAuth.ok) redirect("/admin/overview");
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

  const [financialLevel, screenings, recentActivity, separationCases, performanceReviews, pips, investigations, suspensions] = await Promise.all([
    getPersonFinancialAuthorityLevel(id),
    listBackgroundScreeningsForProfile(id, currentUser.id), // empty for non-Super-Admin, by construction
    getActivityForEntity("user", id, 20),
    listSeparationCases(),
    listPerformanceReviewsForProfile(id),
    listPipsForProfile(id),
    // Discipline/Investigation is restricted, same tier as Background
    // Screening — the page itself withholds the fetch for non-Super-Admin
    // rather than fetching and merely hiding it in the render.
    isSuper ? listInvestigationsForProfile(id) : Promise.resolve([]),
    isSuper ? listSuspensionsForProfile(id) : Promise.resolve([]),
  ]);
  const disciplinaryActions = isSuper ? await listDisciplinaryActionsForProfile(id) : [];

  const [salaryAdvances, benefitTransactions, longServiceAwards] = await Promise.all([
    listSalaryAdvancesForProfile(id),
    listStaffBenefitTransactionsForProfile(id),
    listLongServiceBenefitAwardsForProfile(id),
  ]);
  const personSeparationCases = separationCases.filter((c) => c.profileId === id);
  const openSeparationCase = personSeparationCases.find((c) => c.status === "open") ?? null;

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

        {/* Workforce Lifecycle — Separation/Offboarding (E.5 Stage 2J,
            2026-09-12). Foundation-only entry point: opening a case here
            never itself changes Position/Grade/roles/Authority/Corporate
            Identity/Workspace/payment — it only opens a case for the
            dedicated Clearance Workspace to act on. */}
        <div className="rounded-xl border border-black/10 bg-white p-6 space-y-2">
          <h2 className="font-serif font-medium text-body text-ordift-ink">Separation / Offboarding</h2>
          {personSeparationCases.length > 0 ? (
            <ul className="space-y-1">
              {personSeparationCases.map((c) => (
                <li key={c.id} className="font-sans text-caption text-ordift-ink-muted">
                  · {c.category.replace(/_/g, " ")} ({c.reasonType.replace(/_/g, " ")}) — {c.status}
                  {" · "}
                  <Link href={`/admin/organization/separation/${c.id}`} className="text-ordift-gold-pressed underline underline-offset-4">
                    Open Clearance Workspace →
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="font-sans text-caption text-ordift-ink-muted">No separation case on record.</p>
          )}
          {!openSeparationCase && (
            <form action={initiateSeparationCaseAction} className="grid grid-cols-2 gap-2 mt-2">
              <input type="hidden" name="profileId" value={id} />
              <select name="category" required defaultValue="" className="rounded-lg border border-black/15 bg-white px-2 py-1 font-sans text-caption col-span-2">
                <option value="" disabled>Separation category…</option>
                {SEPARATION_CATEGORIES.map((c) => (
                  <option key={c} value={c}>{c.replace(/_/g, " ")}</option>
                ))}
              </select>
              {/* A plain form has no cascading-select JS, so reasons are
                  grouped by category via optgroup for clarity; the
                  server action (initiateSeparationCaseAction) is the
                  real validator and silently refuses any
                  category/reason mismatch. */}
              <select name="reasonType" required defaultValue="" className="rounded-lg border border-black/15 bg-white px-2 py-1 font-sans text-caption col-span-2">
                <option value="" disabled>Reason…</option>
                {SEPARATION_CATEGORIES.map((c) => (
                  <optgroup key={c} label={c.replace(/_/g, " ")}>
                    {SEPARATION_REASON_TYPES[c].map((r) => (
                      <option key={r} value={r}>{r.replace(/_/g, " ")}</option>
                    ))}
                  </optgroup>
                ))}
              </select>
              <input type="date" name="proposedLastWorkingDate" className="rounded-lg border border-black/15 px-2 py-1 font-sans text-caption col-span-2" />
              <input name="reasonNotes" placeholder="Notes (optional)" className="rounded-lg border border-black/15 px-2 py-1 font-sans text-caption col-span-2" />
              <button type="submit" className="col-span-2 font-sans text-caption font-semibold px-3 py-1 rounded-md bg-ordift-navy-950 text-white">Initiate Separation Case</button>
            </form>
          )}
        </div>
      </section>

      {/* Performance Reviews / PIP (Phase B5 Step 2, 2026-09-14) —
          performance and discipline are deliberately kept separate
          modules; a failed PIP never auto-terminates employment. */}
      <section className="rounded-xl border border-black/10 bg-white p-6 space-y-4">
        <h2 className="font-serif font-medium text-body text-ordift-ink">Performance</h2>

        <div>
          <p className="font-sans text-caption font-semibold text-ordift-ink mb-1">Reviews</p>
          {performanceReviews.length > 0 ? (
            <ul className="space-y-1">
              {performanceReviews.map((r) => (
                <li key={r.id} className="font-sans text-caption text-ordift-ink-muted">
                  · {new Date(r.conductedAt).toLocaleDateString()} — {r.outcomeSummary}
                  {r.nextReviewDueAt ? ` (next due ${new Date(r.nextReviewDueAt).toLocaleDateString()})` : ""}
                </li>
              ))}
            </ul>
          ) : (
            <p className="font-sans text-caption text-ordift-ink-muted">No performance reviews recorded.</p>
          )}
          <form action={recordPerformanceReviewAction} className="grid grid-cols-2 gap-2 mt-2">
            <input type="hidden" name="profileId" value={id} />
            <input type="date" name="reviewPeriodStart" className="rounded-lg border border-black/15 px-2 py-1 font-sans text-caption" placeholder="Period start" />
            <input type="date" name="reviewPeriodEnd" className="rounded-lg border border-black/15 px-2 py-1 font-sans text-caption" placeholder="Period end" />
            <textarea name="competencyNotes" placeholder="Competency notes (optional)" className="col-span-2 rounded-lg border border-black/15 px-2 py-1 font-sans text-caption" rows={2} />
            <textarea name="kpiNotes" placeholder="KPI notes (optional)" className="col-span-2 rounded-lg border border-black/15 px-2 py-1 font-sans text-caption" rows={2} />
            <textarea name="outcomeSummary" required placeholder="Outcome summary" className="col-span-2 rounded-lg border border-black/15 px-2 py-1 font-sans text-caption" rows={2} />
            <button type="submit" className="col-span-2 justify-self-start font-sans text-caption font-semibold px-3 py-1 rounded-md bg-ordift-navy-950 text-white">Record Review</button>
          </form>
        </div>

        <div className="border-t border-black/5 pt-4">
          <p className="font-sans text-caption font-semibold text-ordift-ink mb-1">Performance Improvement Plans</p>
          {pips.length > 0 ? (
            <ul className="space-y-3">
              {pips.map((p) => (
                <li key={p.id} className="font-sans text-caption text-ordift-ink-muted space-y-1">
                  <p>
                    · {p.startDate} → {p.extendedEndDate ?? p.plannedEndDate}
                    {p.extendedEndDate ? " (extended)" : ""} — {p.status.replace(/_/g, " ")}
                  </p>
                  {(p.status === "active" || p.status === "extended") && (
                    <div className="pl-3 space-y-2">
                      <form action={recordPipCheckinAction} className="flex flex-wrap gap-2">
                        <input type="hidden" name="profileId" value={id} />
                        <input type="hidden" name="pipId" value={p.id} />
                        <input name="notes" required placeholder="Check-in notes" className="rounded-lg border border-black/15 px-2 py-1 font-sans text-caption flex-1 min-w-[180px]" />
                        <button type="submit" className="font-sans text-caption font-semibold px-2 py-1 rounded-md bg-ordift-navy-950 text-white">Record Check-in</button>
                      </form>
                      {p.status === "active" && (
                        <form action={extendPipAction} className="flex flex-wrap gap-2">
                          <input type="hidden" name="profileId" value={id} />
                          <input type="hidden" name="pipId" value={p.id} />
                          <input type="date" name="newEndDate" required className="rounded-lg border border-black/15 px-2 py-1 font-sans text-caption" />
                          <input name="reason" required placeholder="Extension reason" className="rounded-lg border border-black/15 px-2 py-1 font-sans text-caption flex-1 min-w-[180px]" />
                          <button type="submit" className="font-sans text-caption font-semibold px-2 py-1 rounded-md bg-ordift-gold-pressed text-ordift-navy-950">Extend (once only)</button>
                        </form>
                      )}
                      <form action={decidePipAction} className="flex flex-wrap gap-2">
                        <input type="hidden" name="profileId" value={id} />
                        <input type="hidden" name="pipId" value={p.id} />
                        <select name="outcome" required defaultValue="" className="rounded-lg border border-black/15 bg-white px-2 py-1 font-sans text-caption">
                          <option value="" disabled>Outcome…</option>
                          <option value="completed_improved">Completed — improved</option>
                          <option value="completed_failed_escalated">Completed — failed (escalate separately)</option>
                        </select>
                        <input name="outcomeNotes" required placeholder="Outcome notes" className="rounded-lg border border-black/15 px-2 py-1 font-sans text-caption flex-1 min-w-[180px]" />
                        <button type="submit" className="font-sans text-caption font-semibold px-2 py-1 rounded-md bg-ordift-navy-950 text-white">Decide Outcome</button>
                      </form>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="font-sans text-caption text-ordift-ink-muted">No Performance Improvement Plans on record.</p>
          )}
          <form action={initiatePipAction} className="grid grid-cols-2 gap-2 mt-3">
            <input type="hidden" name="profileId" value={id} />
            <textarea name="deficientStandard" required placeholder="Deficient standard" className="col-span-2 rounded-lg border border-black/15 px-2 py-1 font-sans text-caption" rows={2} />
            <textarea name="requiredImprovement" required placeholder="Required improvement" className="col-span-2 rounded-lg border border-black/15 px-2 py-1 font-sans text-caption" rows={2} />
            <textarea name="measurableObjectives" required placeholder="Measurable objectives (one per line)" className="col-span-2 rounded-lg border border-black/15 px-2 py-1 font-sans text-caption" rows={3} />
            <textarea name="supportResources" placeholder="Support resources (optional)" className="col-span-2 rounded-lg border border-black/15 px-2 py-1 font-sans text-caption" rows={2} />
            <select name="plannedDurationDays" defaultValue="30" className="rounded-lg border border-black/15 bg-white px-2 py-1 font-sans text-caption col-span-2">
              {PIP_ALLOWED_DURATIONS_DAYS.map((d) => (
                <option key={d} value={d}>{d} days</option>
              ))}
            </select>
            <button type="submit" className="col-span-2 justify-self-start font-sans text-caption font-semibold px-3 py-1 rounded-md bg-ordift-navy-950 text-white">Initiate PIP</button>
          </form>
        </div>
      </section>

      {/* Employee Relations — Discipline / Investigation (Phase B5 Step 3,
          2026-09-14). Deliberately a separate section from Performance
          (never merged), and restricted to Super Admin — the same
          "restricted access" tier already established for Background
          Screening on this page. No automatic termination path exists
          anywhere behind these forms. */}
      <section className="rounded-xl border border-black/10 bg-white p-6 space-y-4">
        <h2 className="font-serif font-medium text-body text-ordift-ink">Employee Relations — Discipline &amp; Investigations</h2>
        {!isSuper ? (
          <p className="font-sans text-caption text-ordift-ink-muted">Discipline and investigation records are Super-Admin-only.</p>
        ) : (
          <>
            <div>
              <p className="font-sans text-caption font-semibold text-ordift-ink mb-1">Investigations</p>
              {investigations.length > 0 ? (
                <ul className="space-y-3">
                  {investigations.map((inv) => {
                    const suspension = suspensions.find((s) => s.investigationId === inv.id) ?? null;
                    return (
                      <li key={inv.id} className="font-sans text-caption text-ordift-ink-muted space-y-1">
                        <p>· {inv.reason} — {inv.status.replace(/_/g, " ")} (opened {new Date(inv.openedAt).toLocaleDateString()})</p>
                        {inv.status === "open" && (
                          <div className="pl-3 space-y-2">
                            {!suspension ? (
                              <form action={recordInvestigatorySuspensionAction} className="flex flex-wrap gap-2">
                                <input type="hidden" name="profileId" value={id} />
                                <input type="hidden" name="investigationId" value={inv.id} />
                                <input name="reason" required placeholder="Suspension reason" className="rounded-lg border border-black/15 px-2 py-1 font-sans text-caption flex-1 min-w-[180px]" />
                                <label className="flex items-center gap-1"><input type="checkbox" name="accessRestricted" value="true" /> Restrict access</label>
                                <button type="submit" className="font-sans text-caption font-semibold px-2 py-1 rounded-md bg-ordift-navy-950 text-white">Record Investigatory Suspension</button>
                              </form>
                            ) : !suspension.endedAt ? (
                              <form action={recordSuspensionReviewAction} className="flex flex-wrap gap-2">
                                <input type="hidden" name="profileId" value={id} />
                                <input type="hidden" name="suspensionId" value={suspension.id} />
                                <span>Suspended {new Date(suspension.suspendedAt).toLocaleDateString()}, review due {new Date(suspension.initialReviewDueAt).toLocaleDateString()}</span>
                                <select name="decision" required defaultValue="" className="rounded-lg border border-black/15 bg-white px-2 py-1 font-sans text-caption">
                                  <option value="" disabled>Review decision…</option>
                                  <option value="continue_suspension">Continue suspension</option>
                                  <option value="end_suspension">End suspension</option>
                                </select>
                                <input name="notes" placeholder="Notes (optional)" className="rounded-lg border border-black/15 px-2 py-1 font-sans text-caption flex-1 min-w-[140px]" />
                                <input type="date" name="nextReviewDueAt" className="rounded-lg border border-black/15 px-2 py-1 font-sans text-caption" />
                                <button type="submit" className="font-sans text-caption font-semibold px-2 py-1 rounded-md bg-ordift-navy-950 text-white">Record Review</button>
                              </form>
                            ) : (
                              <span>Suspension ended {new Date(suspension.endedAt).toLocaleDateString()}</span>
                            )}
                            <form action={closeInvestigationAction} className="flex flex-wrap gap-2">
                              <input type="hidden" name="profileId" value={id} />
                              <input type="hidden" name="investigationId" value={inv.id} />
                              <select name="outcome" required defaultValue="" className="rounded-lg border border-black/15 bg-white px-2 py-1 font-sans text-caption">
                                <option value="" disabled>Close with outcome…</option>
                                <option value="closed_no_action">No action</option>
                                <option value="closed_resulted_in_discipline">Resulted in discipline</option>
                                <option value="closed_resulted_in_separation">Resulted in separation</option>
                              </select>
                              <input name="outcomeNotes" placeholder="Outcome notes (optional)" className="rounded-lg border border-black/15 px-2 py-1 font-sans text-caption flex-1 min-w-[140px]" />
                              <button type="submit" className="font-sans text-caption font-semibold px-2 py-1 rounded-md bg-ordift-gold-pressed text-ordift-navy-950">Close Investigation</button>
                            </form>
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="font-sans text-caption text-ordift-ink-muted">No investigations on record.</p>
              )}
              <form action={openInvestigationAction} className="flex flex-wrap gap-2 mt-2">
                <input type="hidden" name="profileId" value={id} />
                <input name="reason" required placeholder="Reason to open an investigation" className="rounded-lg border border-black/15 px-2 py-1 font-sans text-caption flex-1 min-w-[180px]" />
                <button type="submit" className="font-sans text-caption font-semibold px-2 py-1 rounded-md bg-ordift-navy-950 text-white">Open Investigation</button>
              </form>
            </div>

            <div className="border-t border-black/5 pt-4">
              <p className="font-sans text-caption font-semibold text-ordift-ink mb-1">Disciplinary Actions</p>
              {disciplinaryActions.length > 0 ? (
                <ul className="space-y-1 mb-2">
                  {disciplinaryActions.map((a) => (
                    <li key={a.id} className="font-sans text-caption text-ordift-ink-muted">
                      · {a.actionType.replace(/_/g, " ")} — {new Date(a.issuedAt).toLocaleDateString()}
                      {a.activeUntil ? ` (active until ${new Date(a.activeUntil).toLocaleDateString()})` : ""}
                      {" · "}{a.isCurrentlyActive ? "active" : "no longer active"}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="font-sans text-caption text-ordift-ink-muted mb-2">No disciplinary actions on record.</p>
              )}
              <form action={issueDisciplinaryActionAction} className="grid grid-cols-2 gap-2">
                <input type="hidden" name="profileId" value={id} />
                <select name="actionType" required defaultValue="" className="rounded-lg border border-black/15 bg-white px-2 py-1 font-sans text-caption col-span-2">
                  <option value="" disabled>Action type…</option>
                  {DISCIPLINARY_ACTION_TYPES.map((t) => (
                    <option key={t} value={t}>{t.replace(/_/g, " ")}</option>
                  ))}
                </select>
                <input type="date" name="incidentDate" className="rounded-lg border border-black/15 px-2 py-1 font-sans text-caption col-span-2" placeholder="Incident date (optional)" />
                {investigations.length > 0 && (
                  <select name="investigationId" defaultValue="" className="rounded-lg border border-black/15 bg-white px-2 py-1 font-sans text-caption col-span-2">
                    <option value="">Not linked to an investigation</option>
                    {investigations.map((inv) => (
                      <option key={inv.id} value={inv.id}>{inv.reason} ({inv.status.replace(/_/g, " ")})</option>
                    ))}
                  </select>
                )}
                <textarea name="reason" required placeholder="Documented reason" className="col-span-2 rounded-lg border border-black/15 px-2 py-1 font-sans text-caption" rows={2} />
                <button type="submit" className="col-span-2 justify-self-start font-sans text-caption font-semibold px-3 py-1 rounded-md bg-ordift-navy-950 text-white">Issue Disciplinary Action</button>
              </form>
            </div>
          </>
        )}
      </section>

      {/* Compensation & Benefits (Phase B5 Step 5, 2026-09-14). Every
          computed amount (advance cap, long-service/death-in-service
          award) is server-computed from OS-HR-GH-003's real approved
          figures — never entered or overridden here. */}
      <section className="rounded-xl border border-black/10 bg-white p-6 space-y-4">
        <h2 className="font-serif font-medium text-body text-ordift-ink">Compensation &amp; Benefits</h2>

        <div>
          <p className="font-sans text-caption font-semibold text-ordift-ink mb-1">Salary Advances</p>
          {salaryAdvances.length > 0 ? (
            <ul className="space-y-2">
              {salaryAdvances.map((a) => (
                <li key={a.id} className="font-sans text-caption text-ordift-ink-muted space-y-1">
                  <p>
                    · {a.requestedAmount.toLocaleString()} (cap {a.capAmount.toLocaleString()}{a.exceedsCap ? ", exceeds cap — Founder/Super Admin required" : ""}) — {a.status}
                    {" · "}{new Date(a.createdAt).toLocaleDateString()}
                  </p>
                  {a.status === "requested" && (
                    <form action={decideSalaryAdvanceAction} className="flex flex-wrap gap-2 pl-3">
                      <input type="hidden" name="profileId" value={id} />
                      <input type="hidden" name="advanceId" value={a.id} />
                      <input name="decisionNotes" placeholder="Decision notes (optional)" className="rounded-lg border border-black/15 px-2 py-1 font-sans text-caption flex-1 min-w-[160px]" />
                      <button type="submit" name="decision" value="approved" className="font-sans text-caption font-semibold px-2 py-1 rounded-md bg-ordift-navy-950 text-white">Approve</button>
                      <button type="submit" name="decision" value="declined" className="font-sans text-caption text-red-700 underline underline-offset-4">Decline</button>
                    </form>
                  )}
                  {a.status === "approved" && (
                    <form action={disburseSalaryAdvanceAction} className="flex flex-wrap gap-2 pl-3">
                      <input type="hidden" name="profileId" value={id} />
                      <input type="hidden" name="advanceId" value={a.id} />
                      <input name="repaymentTerms" required placeholder="Written repayment terms" className="rounded-lg border border-black/15 px-2 py-1 font-sans text-caption flex-1 min-w-[160px]" />
                      <button type="submit" className="font-sans text-caption font-semibold px-2 py-1 rounded-md bg-ordift-gold-pressed text-ordift-navy-950">Disburse</button>
                    </form>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="font-sans text-caption text-ordift-ink-muted">No salary advances on record.</p>
          )}
          <form action={requestSalaryAdvanceAction} className="flex flex-wrap gap-2 mt-2">
            <input type="hidden" name="profileId" value={id} />
            <input name="requestedAmount" type="number" step="0.01" min="0.01" required placeholder="Requested amount" className="rounded-lg border border-black/15 px-2 py-1 font-sans text-caption" />
            <button type="submit" className="font-sans text-caption font-semibold px-2 py-1 rounded-md bg-ordift-navy-950 text-white">Request Salary Advance</button>
          </form>
        </div>

        <div className="border-t border-black/5 pt-4">
          <p className="font-sans text-caption font-semibold text-ordift-ink mb-1">Staff Benefit Transactions</p>
          {benefitTransactions.length > 0 ? (
            <ul className="space-y-1">
              {benefitTransactions.map((t) => (
                <li key={t.id} className="font-sans text-caption text-ordift-ink-muted">
                  · {t.transactionType} — {t.benefitDescription} ({t.amount.toLocaleString()}) — {new Date(t.transactionDate).toLocaleDateString()}
                  {t.reconciledPayrollCycle ? ` · cycle ${t.reconciledPayrollCycle}` : ""}
                </li>
              ))}
            </ul>
          ) : (
            <p className="font-sans text-caption text-ordift-ink-muted">No staff-benefit transactions on record.</p>
          )}
          <form action={recordStaffBenefitTransactionAction} className="grid grid-cols-2 gap-2 mt-2">
            <input type="hidden" name="profileId" value={id} />
            <select name="transactionType" required defaultValue="" className="rounded-lg border border-black/15 bg-white px-2 py-1 font-sans text-caption">
              <option value="" disabled>Type…</option>
              <option value="purchase">Purchase</option>
              <option value="refund">Refund</option>
            </select>
            <input name="amount" type="number" step="0.01" min="0.01" required placeholder="Amount" className="rounded-lg border border-black/15 px-2 py-1 font-sans text-caption" />
            <input name="benefitDescription" required placeholder="Benefit description" className="col-span-2 rounded-lg border border-black/15 px-2 py-1 font-sans text-caption" />
            <input name="relatedTransactionId" placeholder="Related transaction ID (required for refunds)" className="col-span-2 rounded-lg border border-black/15 px-2 py-1 font-sans text-caption" />
            <label className="col-span-2 flex items-center gap-1 font-sans text-caption text-ordift-ink-muted"><input type="checkbox" name="payrollRecovery" value="true" /> Recover via payroll</label>
            <button type="submit" className="col-span-2 justify-self-start font-sans text-caption font-semibold px-3 py-1 rounded-md bg-ordift-navy-950 text-white">Record Transaction</button>
          </form>
        </div>

        <div className="border-t border-black/5 pt-4">
          <p className="font-sans text-caption font-semibold text-ordift-ink mb-1">Long-Service Benefits</p>
          {longServiceAwards.length > 0 ? (
            <ul className="space-y-1">
              {longServiceAwards.map((a) => (
                <li key={a.id} className="font-sans text-caption text-ordift-ink-muted">
                  · {a.milestoneYears}-year milestone ({a.percentage}%) — {a.awardAmount.toLocaleString()} — {new Date(a.awardedAt).toLocaleDateString()}
                </li>
              ))}
            </ul>
          ) : (
            <p className="font-sans text-caption text-ordift-ink-muted">No long-service benefit awarded.</p>
          )}
          <form action={awardLongServiceBenefitAction} className="grid grid-cols-2 gap-2 mt-2">
            <input type="hidden" name="profileId" value={id} />
            <select name="milestoneYears" required defaultValue="" className="rounded-lg border border-black/15 bg-white px-2 py-1 font-sans text-caption">
              <option value="" disabled>Milestone…</option>
              {Object.entries(LONG_SERVICE_MILESTONE_PERCENTAGES).map(([years, pct]) => (
                <option key={years} value={years}>{years} years ({pct}%)</option>
              ))}
            </select>
            <input type="date" name="eligibleServiceStartDate" required className="rounded-lg border border-black/15 px-2 py-1 font-sans text-caption" />
            <input name="notes" placeholder="Notes (optional)" className="col-span-2 rounded-lg border border-black/15 px-2 py-1 font-sans text-caption" />
            <button type="submit" className="col-span-2 justify-self-start font-sans text-caption font-semibold px-3 py-1 rounded-md bg-ordift-navy-950 text-white">Award Long-Service Benefit</button>
          </form>
        </div>

        <div className="border-t border-black/5 pt-4">
          <p className="font-sans text-caption font-semibold text-ordift-ink mb-1">Death-in-Service Benefit</p>
          <form action={awardDeathInServiceBenefitAction} className="grid grid-cols-2 gap-2">
            <input type="hidden" name="profileId" value={id} />
            <label className="col-span-2 flex items-center gap-1 font-sans text-caption text-ordift-ink-muted"><input type="checkbox" name="beneficiaryVerified" value="true" /> Beneficiary/estate verified</label>
            <input name="beneficiaryDetails" placeholder="Beneficiary details" className="col-span-2 rounded-lg border border-black/15 px-2 py-1 font-sans text-caption" />
            <input name="verificationNotes" placeholder="Verification notes" className="col-span-2 rounded-lg border border-black/15 px-2 py-1 font-sans text-caption" />
            <button type="submit" className="col-span-2 justify-self-start font-sans text-caption font-semibold px-3 py-1 rounded-md bg-ordift-navy-950 text-white">Award Death-in-Service Benefit</button>
          </form>
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
