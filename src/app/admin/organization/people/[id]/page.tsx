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
import { listAssetAssignmentsForProfile, listAssetIncidentReportsForProfile, listCompanyAssets } from "@/lib/organization/assets";
import {
  listBusinessTravelAuthorizationsForProfile,
  listDriverAuthorizationsForProfile,
  listVehicleIncidentsForProfile,
  listWorkplaceInjuryReportsForProfile,
  VEHICLE_INCIDENT_WORKFLOW_ORDER,
  WORKPLACE_INJURY_WORKFLOW_ORDER,
} from "@/lib/organization/businessTravel";
import { listPortfolioUseRequestsForProfile } from "@/lib/organization/portfolioUse";
import { checkEmployeeAgreementReadiness } from "@/lib/legal/employeeAgreements";
import { getStaffOnboardingByProfileId } from "@/lib/organization/onboarding";
import { listReferenceRequestsForProfile } from "@/lib/organization/employmentReferences";
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
  acknowledgeAssetAssignmentAction,
  returnAssetAction,
  transferAssetAction,
  reportAssetIncidentAction,
  determineAssetIncidentAction,
  requestBusinessTravelAuthorizationAction,
  approveBusinessTravelAuthorizationAction,
  declineBusinessTravelAuthorizationAction,
  authorizeDriverAction,
  revokeDriverAuthorizationAction,
  reportVehicleIncidentAction,
  advanceVehicleIncidentStageAction,
  recordVehicleIncidentResponsibilityDeterminationAction,
  resolveVehicleIncidentAction,
  reportWorkplaceInjuryAction,
  advanceWorkplaceInjuryStageAction,
  recordWorkplaceInjuryAbsencePayClassificationAction,
  resolveWorkplaceInjuryReportAction,
  submitPortfolioUseRequestAction,
  approvePortfolioUseRequestAction,
  declinePortfolioUseRequestAction,
  createEmployeeEmploymentAgreementDraftAction,
  requestEmploymentReferenceAction,
  verifyRequesterIdentityAction,
  declineReferenceRequestAction,
  issueStandardEmploymentVerificationAction,
  issueDetailedCorporateReferenceAction,
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

  const [salaryAdvances, benefitTransactions, longServiceAwards, assetAssignments, assetIncidents, companyAssets] = await Promise.all([
    listSalaryAdvancesForProfile(id),
    listStaffBenefitTransactionsForProfile(id),
    listLongServiceBenefitAwardsForProfile(id),
    listAssetAssignmentsForProfile(id),
    listAssetIncidentReportsForProfile(id),
    listCompanyAssets(),
  ]);
  const assetById = new Map(companyAssets.map((a) => [a.id, a]));
  const otherStaffOptions = usersResult.users.filter((u) => u.id !== id).map((u) => ({ id: u.id, name: u.fullName ?? u.email ?? u.id }));

  const [travelAuthorizations, driverAuthorizations, vehicleIncidents, workplaceInjuries] = await Promise.all([
    listBusinessTravelAuthorizationsForProfile(id),
    listDriverAuthorizationsForProfile(id),
    listVehicleIncidentsForProfile(id),
    listWorkplaceInjuryReportsForProfile(id),
  ]);
  const portfolioUseRequests = await listPortfolioUseRequestsForProfile(id);

  const onboarding = await getStaffOnboardingByProfileId(id);
  const agreementReadiness = onboarding ? await checkEmployeeAgreementReadiness(onboarding.id) : null;

  const referenceRequests = await listReferenceRequestsForProfile(id);
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

      {/* Assets & Equipment — per-person assignments and incidents
          (Phase B5 Step 6, 2026-09-14). Registering/assigning new
          assets happens on the standalone Assets registry page; loss/
          damage always routes to a determination, never directly to a
          deduction. */}
      <section className="rounded-xl border border-black/10 bg-white p-6 space-y-4">
        <h2 className="font-serif font-medium text-body text-ordift-ink">
          Assets &amp; Equipment <Link href="/admin/organization/assets" className="text-caption font-sans text-ordift-gold-pressed underline underline-offset-4 font-normal">Registry →</Link>
        </h2>

        <div>
          <p className="font-sans text-caption font-semibold text-ordift-ink mb-1">Assignments</p>
          {assetAssignments.length > 0 ? (
            <ul className="space-y-2">
              {assetAssignments.map((a) => {
                const asset = assetById.get(a.assetId);
                return (
                  <li key={a.id} className="font-sans text-caption text-ordift-ink-muted space-y-1">
                    <p>
                      · {asset ? `${asset.assetIdentifier} — ${asset.description}` : a.assetId} — {a.status} · issued {new Date(a.issuedAt).toLocaleDateString()}
                      {a.returnedAt ? ` · returned ${new Date(a.returnedAt).toLocaleDateString()}` : ""}
                    </p>
                    {a.status === "issued" && (
                      <div className="pl-3 flex flex-wrap gap-2">
                        <form action={acknowledgeAssetAssignmentAction}>
                          <input type="hidden" name="profileId" value={id} />
                          <input type="hidden" name="assignmentId" value={a.id} />
                          <button type="submit" className="font-sans text-caption font-semibold px-2 py-1 rounded-md bg-ordift-navy-950 text-white">Acknowledge</button>
                        </form>
                        <form action={returnAssetAction} className="flex gap-2">
                          <input type="hidden" name="profileId" value={id} />
                          <input type="hidden" name="assignmentId" value={a.id} />
                          <input name="returnCondition" required placeholder="Return condition" className="rounded-lg border border-black/15 px-2 py-1 font-sans text-caption" />
                          <button type="submit" className="font-sans text-caption font-semibold px-2 py-1 rounded-md bg-ordift-gold-pressed text-ordift-navy-950">Return</button>
                        </form>
                        <form action={transferAssetAction} className="flex gap-2">
                          <input type="hidden" name="profileId" value={id} />
                          <input type="hidden" name="assignmentId" value={a.id} />
                          <select name="newProfileId" required defaultValue="" className="rounded-lg border border-black/15 bg-white px-2 py-1 font-sans text-caption">
                            <option value="" disabled>Transfer to…</option>
                            {otherStaffOptions.map((s) => (
                              <option key={s.id} value={s.id}>{s.name}</option>
                            ))}
                          </select>
                          <button type="submit" className="font-sans text-caption font-semibold px-2 py-1 rounded-md bg-ordift-navy-950 text-white">Transfer</button>
                        </form>
                        <form action={reportAssetIncidentAction} className="flex flex-wrap gap-2 basis-full">
                          <input type="hidden" name="profileId" value={id} />
                          <input type="hidden" name="assignmentId" value={a.id} />
                          <input name="incidentType" required placeholder="Incident type (e.g. damage, loss)" className="rounded-lg border border-black/15 px-2 py-1 font-sans text-caption" />
                          <input name="description" required placeholder="Description" className="rounded-lg border border-black/15 px-2 py-1 font-sans text-caption flex-1 min-w-[160px]" />
                          <button type="submit" className="font-sans text-caption font-semibold px-2 py-1 rounded-md bg-red-800 text-white">Report Incident</button>
                        </form>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="font-sans text-caption text-ordift-ink-muted">No assets currently or previously assigned.</p>
          )}
        </div>

        <div className="border-t border-black/5 pt-4">
          <p className="font-sans text-caption font-semibold text-ordift-ink mb-1">Incident Reports</p>
          {assetIncidents.length > 0 ? (
            <ul className="space-y-2">
              {assetIncidents.map((i) => (
                <li key={i.id} className="font-sans text-caption text-ordift-ink-muted space-y-1">
                  <p>· {i.incidentType} — &ldquo;{i.description}&rdquo; — {i.determination.replace(/_/g, " ")} — {new Date(i.reportedAt).toLocaleDateString()}</p>
                  {i.determination === "pending" && (
                    <form action={determineAssetIncidentAction} className="pl-3 flex flex-wrap gap-2">
                      <input type="hidden" name="profileId" value={id} />
                      <input type="hidden" name="incidentId" value={i.id} />
                      <select name="determination" required defaultValue="" className="rounded-lg border border-black/15 bg-white px-2 py-1 font-sans text-caption">
                        <option value="" disabled>Determination…</option>
                        <option value="company_matter">Company matter</option>
                        <option value="proven_deliberate_or_negligent">Proven deliberate or negligent</option>
                      </select>
                      <input name="determinationNotes" required placeholder="Determination notes" className="rounded-lg border border-black/15 px-2 py-1 font-sans text-caption flex-1 min-w-[160px]" />
                      <label className="flex items-center gap-1"><input type="checkbox" name="recoveryRequired" value="true" /> Lawful recovery required</label>
                      <input name="recoveryNotes" placeholder="Recovery notes (optional)" className="rounded-lg border border-black/15 px-2 py-1 font-sans text-caption flex-1 min-w-[140px]" />
                      <button type="submit" className="font-sans text-caption font-semibold px-2 py-1 rounded-md bg-ordift-navy-950 text-white">Record Determination</button>
                    </form>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="font-sans text-caption text-ordift-ink-muted">No asset incidents on record.</p>
          )}
        </div>
      </section>

      {/* Business Travel, Driving & Production Safety (Phase B5 Step 7,
          2026-09-14). Vehicle incidents and workplace injuries stay
          genuinely separate workflows with their own stage sequences —
          never merged into one generic "incident" concept. An accident
          never automatically makes the employee financially liable;
          responsibility is always an explicit human determination. */}
      <section className="rounded-xl border border-black/10 bg-white p-6 space-y-4">
        <h2 className="font-serif font-medium text-body text-ordift-ink">Business Travel, Driving &amp; Safety</h2>

        <div>
          <p className="font-sans text-caption font-semibold text-ordift-ink mb-1">Travel Authorizations</p>
          {travelAuthorizations.length > 0 ? (
            <ul className="space-y-2">
              {travelAuthorizations.map((t) => (
                <li key={t.id} className="font-sans text-caption text-ordift-ink-muted space-y-1">
                  <p>
                    · {t.destinationCountry} — {t.purpose}
                    {t.travelStartDate ? ` (${t.travelStartDate} → ${t.travelEndDate ?? "?"})` : ""} — {t.status}
                  </p>
                  {t.status === "requested" && (
                    <div className="pl-3 space-y-1">
                      <form action={approveBusinessTravelAuthorizationAction} className="flex flex-wrap items-center gap-2">
                        <input type="hidden" name="profileId" value={id} />
                        <input type="hidden" name="authorizationId" value={t.id} />
                        <label className="flex items-center gap-1"><input type="checkbox" name="immigrationReviewed" value="true" /> Immigration</label>
                        <label className="flex items-center gap-1"><input type="checkbox" name="workAuthorizationReviewed" value="true" /> Work authorization</label>
                        <label className="flex items-center gap-1"><input type="checkbox" name="safetyReviewed" value="true" /> Safety</label>
                        <label className="flex items-center gap-1"><input type="checkbox" name="jurisdictionReviewed" value="true" /> Jurisdiction</label>
                        <button type="submit" className="font-sans text-caption font-semibold px-2 py-1 rounded-md bg-ordift-navy-950 text-white">Approve</button>
                      </form>
                      <form action={declineBusinessTravelAuthorizationAction} className="flex flex-wrap gap-2">
                        <input type="hidden" name="profileId" value={id} />
                        <input type="hidden" name="authorizationId" value={t.id} />
                        <input name="decisionNotes" required placeholder="Decision notes" className="rounded-lg border border-black/15 px-2 py-1 font-sans text-caption flex-1 min-w-[160px]" />
                        <button type="submit" className="font-sans text-caption text-red-700 underline underline-offset-4">Decline</button>
                      </form>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="font-sans text-caption text-ordift-ink-muted">No travel authorizations on record.</p>
          )}
          <form action={requestBusinessTravelAuthorizationAction} className="grid grid-cols-2 gap-2 mt-2">
            <input type="hidden" name="profileId" value={id} />
            <input name="destinationCountry" required placeholder="Destination country" className="rounded-lg border border-black/15 px-2 py-1 font-sans text-caption" />
            <input name="purpose" required placeholder="Purpose" className="rounded-lg border border-black/15 px-2 py-1 font-sans text-caption" />
            <input type="date" name="travelStartDate" className="rounded-lg border border-black/15 px-2 py-1 font-sans text-caption" />
            <input type="date" name="travelEndDate" className="rounded-lg border border-black/15 px-2 py-1 font-sans text-caption" />
            <button type="submit" className="col-span-2 justify-self-start font-sans text-caption font-semibold px-3 py-1 rounded-md bg-ordift-navy-950 text-white">Request Travel Authorization</button>
          </form>
        </div>

        <div className="border-t border-black/5 pt-4">
          <p className="font-sans text-caption font-semibold text-ordift-ink mb-1">Driver Authorization</p>
          {driverAuthorizations.length > 0 ? (
            <ul className="space-y-1 mb-2">
              {driverAuthorizations.map((d) => (
                <li key={d.id} className="font-sans text-caption text-ordift-ink-muted">
                  · {d.licenseClass ?? "License"} {d.licenseNumber ? `#${d.licenseNumber}` : ""}
                  {d.licenseExpiryDate ? ` (expires ${d.licenseExpiryDate})` : ""} — {d.status}
                  {d.status === "active" && (
                    <form action={revokeDriverAuthorizationAction} className="inline-flex items-center gap-2 ml-2">
                      <input type="hidden" name="profileId" value={id} />
                      <input type="hidden" name="authorizationId" value={d.id} />
                      <input name="reason" required placeholder="Revocation reason" className="rounded-lg border border-black/15 px-2 py-0.5 font-sans text-caption" />
                      <button type="submit" className="font-sans text-caption text-red-700 underline underline-offset-4">Revoke</button>
                    </form>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="font-sans text-caption text-ordift-ink-muted mb-2">No driver authorization on record.</p>
          )}
          <form action={authorizeDriverAction} className="grid grid-cols-2 gap-2">
            <input type="hidden" name="profileId" value={id} />
            <input name="licenseNumber" placeholder="License number" className="rounded-lg border border-black/15 px-2 py-1 font-sans text-caption" />
            <input name="licenseClass" placeholder="License class" className="rounded-lg border border-black/15 px-2 py-1 font-sans text-caption" />
            <input type="date" name="licenseExpiryDate" className="rounded-lg border border-black/15 px-2 py-1 font-sans text-caption" />
            <input name="authorizedVehicleTypes" placeholder="Authorized vehicle types" className="rounded-lg border border-black/15 px-2 py-1 font-sans text-caption" />
            <button type="submit" className="col-span-2 justify-self-start font-sans text-caption font-semibold px-3 py-1 rounded-md bg-ordift-navy-950 text-white">Authorize Driver</button>
          </form>
        </div>

        <div className="border-t border-black/5 pt-4">
          <p className="font-sans text-caption font-semibold text-ordift-ink mb-1">Vehicle Incidents</p>
          {vehicleIncidents.length > 0 ? (
            <ul className="space-y-2">
              {vehicleIncidents.map((v) => (
                <li key={v.id} className="font-sans text-caption text-ordift-ink-muted space-y-1">
                  <p>· &ldquo;{v.description}&rdquo; — stage: {v.stage.replace(/_/g, " ")}{v.resolvedAt ? " · resolved" : ""}</p>
                  {!v.resolvedAt && (
                    <div className="pl-3 flex flex-wrap gap-2">
                      {v.stage !== VEHICLE_INCIDENT_WORKFLOW_ORDER[VEHICLE_INCIDENT_WORKFLOW_ORDER.length - 1] && (
                        <form action={advanceVehicleIncidentStageAction}>
                          <input type="hidden" name="profileId" value={id} />
                          <input type="hidden" name="incidentId" value={v.id} />
                          <button type="submit" className="font-sans text-caption font-semibold px-2 py-1 rounded-md bg-ordift-gold-pressed text-ordift-navy-950">Advance Stage</button>
                        </form>
                      )}
                      {v.stage === "responsibility_determination" && (
                        <form action={recordVehicleIncidentResponsibilityDeterminationAction} className="flex flex-wrap gap-2">
                          <input type="hidden" name="profileId" value={id} />
                          <input type="hidden" name="incidentId" value={v.id} />
                          <select name="determination" required defaultValue="" className="rounded-lg border border-black/15 bg-white px-2 py-1 font-sans text-caption">
                            <option value="" disabled>Determination…</option>
                            <option value="employee_responsible">Employee responsible</option>
                            <option value="not_employee_responsible">Not employee responsible</option>
                            <option value="shared">Shared</option>
                            <option value="undetermined">Undetermined</option>
                          </select>
                          <input name="responsibilityNotes" required placeholder="Notes" className="rounded-lg border border-black/15 px-2 py-1 font-sans text-caption flex-1 min-w-[140px]" />
                          <button type="submit" className="font-sans text-caption font-semibold px-2 py-1 rounded-md bg-ordift-navy-950 text-white">Record Determination</button>
                        </form>
                      )}
                      {v.stage === "lawful_financial_disciplinary_treatment" && (
                        <form action={resolveVehicleIncidentAction} className="flex flex-wrap gap-2">
                          <input type="hidden" name="profileId" value={id} />
                          <input type="hidden" name="incidentId" value={v.id} />
                          <input name="financialDisciplinaryTreatmentNotes" required placeholder="Financial/disciplinary treatment notes" className="rounded-lg border border-black/15 px-2 py-1 font-sans text-caption flex-1 min-w-[160px]" />
                          <button type="submit" className="font-sans text-caption font-semibold px-2 py-1 rounded-md bg-ordift-navy-950 text-white">Resolve</button>
                        </form>
                      )}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="font-sans text-caption text-ordift-ink-muted">No vehicle incidents on record.</p>
          )}
          <form action={reportVehicleIncidentAction} className="flex flex-wrap gap-2 mt-2">
            <input type="hidden" name="profileId" value={id} />
            <input name="description" required placeholder="Describe the incident" className="rounded-lg border border-black/15 px-2 py-1 font-sans text-caption flex-1 min-w-[200px]" />
            <button type="submit" className="font-sans text-caption font-semibold px-2 py-1 rounded-md bg-red-800 text-white">Report Vehicle Incident</button>
          </form>
        </div>

        <div className="border-t border-black/5 pt-4">
          <p className="font-sans text-caption font-semibold text-ordift-ink mb-1">Workplace Injuries</p>
          {workplaceInjuries.length > 0 ? (
            <ul className="space-y-2">
              {workplaceInjuries.map((w) => (
                <li key={w.id} className="font-sans text-caption text-ordift-ink-muted space-y-1">
                  <p>· &ldquo;{w.description}&rdquo; — stage: {w.stage.replace(/_/g, " ")}{w.resolvedAt ? " · resolved" : ""}</p>
                  {!w.resolvedAt && (
                    <div className="pl-3 flex flex-wrap gap-2">
                      {w.stage !== WORKPLACE_INJURY_WORKFLOW_ORDER[WORKPLACE_INJURY_WORKFLOW_ORDER.length - 1] && (
                        <form action={advanceWorkplaceInjuryStageAction}>
                          <input type="hidden" name="profileId" value={id} />
                          <input type="hidden" name="reportId" value={w.id} />
                          <button type="submit" className="font-sans text-caption font-semibold px-2 py-1 rounded-md bg-ordift-gold-pressed text-ordift-navy-950">Advance Stage</button>
                        </form>
                      )}
                      {w.stage === "absence_pay_classification" && (
                        <form action={recordWorkplaceInjuryAbsencePayClassificationAction} className="flex flex-wrap gap-2">
                          <input type="hidden" name="profileId" value={id} />
                          <input type="hidden" name="reportId" value={w.id} />
                          <input name="classification" required placeholder="Absence/pay classification" className="rounded-lg border border-black/15 px-2 py-1 font-sans text-caption flex-1 min-w-[160px]" />
                          <button type="submit" className="font-sans text-caption font-semibold px-2 py-1 rounded-md bg-ordift-navy-950 text-white">Record Classification</button>
                        </form>
                      )}
                      {w.stage === "return_to_work" && (
                        <form action={resolveWorkplaceInjuryReportAction} className="flex flex-wrap gap-2">
                          <input type="hidden" name="profileId" value={id} />
                          <input type="hidden" name="reportId" value={w.id} />
                          <input name="returnToWorkNotes" required placeholder="Return-to-work notes" className="rounded-lg border border-black/15 px-2 py-1 font-sans text-caption flex-1 min-w-[160px]" />
                          <button type="submit" className="font-sans text-caption font-semibold px-2 py-1 rounded-md bg-ordift-navy-950 text-white">Resolve</button>
                        </form>
                      )}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="font-sans text-caption text-ordift-ink-muted">No workplace injuries on record.</p>
          )}
          <form action={reportWorkplaceInjuryAction} className="flex flex-wrap gap-2 mt-2">
            <input type="hidden" name="profileId" value={id} />
            <input name="description" required placeholder="Describe the injury" className="rounded-lg border border-black/15 px-2 py-1 font-sans text-caption flex-1 min-w-[200px]" />
            <button type="submit" className="font-sans text-caption font-semibold px-2 py-1 rounded-md bg-red-800 text-white">Report Workplace Injury</button>
          </form>
        </div>
      </section>

      {/* Portfolio / Personal-Use IP (Phase B5 Step 8, 2026-09-14).
          Employees do not gain automatic publication rights — approval
          always requires confidentiality, embargo, contractual, and
          client/model release-rights checks, enforced server-side. */}
      <section className="rounded-xl border border-black/10 bg-white p-6 space-y-4">
        <h2 className="font-serif font-medium text-body text-ordift-ink">Portfolio / Personal-Use IP</h2>
        {portfolioUseRequests.length > 0 ? (
          <ul className="space-y-2">
            {portfolioUseRequests.map((r) => (
              <li key={r.id} className="font-sans text-caption text-ordift-ink-muted space-y-1">
                <p>
                  · &ldquo;{r.description}&rdquo; — {r.status} · {new Date(r.createdAt).toLocaleDateString()}
                  {r.status === "approved" && Array.isArray(r.approvedPlatforms) && r.approvedPlatforms.length > 0 ? ` — platforms: ${(r.approvedPlatforms as string[]).join(", ")}` : ""}
                </p>
                {r.status === "requested" && (
                  <div className="pl-3 space-y-1">
                    <form action={approvePortfolioUseRequestAction} className="flex flex-wrap items-center gap-2">
                      <input type="hidden" name="profileId" value={id} />
                      <input type="hidden" name="requestId" value={r.id} />
                      <label className="flex items-center gap-1"><input type="checkbox" name="confidentialityChecked" value="true" /> Confidentiality</label>
                      <label className="flex items-center gap-1"><input type="checkbox" name="embargoChecked" value="true" /> Embargo</label>
                      <label className="flex items-center gap-1"><input type="checkbox" name="contractualRestrictionsChecked" value="true" /> Contractual</label>
                      <label className="flex items-center gap-1"><input type="checkbox" name="releaseRightsChecked" value="true" /> Release rights</label>
                      <input name="approvedAssets" required placeholder="Approved assets" className="rounded-lg border border-black/15 px-2 py-1 font-sans text-caption" />
                      <input name="approvedPlatforms" required placeholder="Platforms (comma-separated)" className="rounded-lg border border-black/15 px-2 py-1 font-sans text-caption" />
                      <input name="approvedTiming" placeholder="Timing (optional)" className="rounded-lg border border-black/15 px-2 py-1 font-sans text-caption" />
                      <input name="approvedConditions" placeholder="Conditions (optional)" className="rounded-lg border border-black/15 px-2 py-1 font-sans text-caption" />
                      <button type="submit" className="font-sans text-caption font-semibold px-2 py-1 rounded-md bg-ordift-navy-950 text-white">Approve</button>
                    </form>
                    <form action={declinePortfolioUseRequestAction} className="flex flex-wrap gap-2">
                      <input type="hidden" name="profileId" value={id} />
                      <input type="hidden" name="requestId" value={r.id} />
                      <input name="decisionNotes" required placeholder="Decision notes" className="rounded-lg border border-black/15 px-2 py-1 font-sans text-caption flex-1 min-w-[160px]" />
                      <button type="submit" className="font-sans text-caption text-red-700 underline underline-offset-4">Decline</button>
                    </form>
                  </div>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="font-sans text-caption text-ordift-ink-muted">No portfolio-use requests on record.</p>
        )}
        <form action={submitPortfolioUseRequestAction} className="flex flex-wrap gap-2 mt-2">
          <input type="hidden" name="profileId" value={id} />
          <input name="description" required placeholder="Describe the requested assets/use" className="rounded-lg border border-black/15 px-2 py-1 font-sans text-caption flex-1 min-w-[200px]" />
          <button type="submit" className="font-sans text-caption font-semibold px-2 py-1 rounded-md bg-ordift-navy-950 text-white">Submit Portfolio-Use Request</button>
        </form>
      </section>

      {/* Agreement Readiness (Phase B5 Step 10, 2026-09-14). Truthfully
          shows the actual missing facts — checkEmployeeAgreementReadiness()
          never invents a value for an unresolved field, and viewing
          this section has no side effect (it is a read-only preview of
          createEmployeeEmploymentAgreementDraft()'s own gate). */}
      <section className="rounded-xl border border-black/10 bg-white p-6 space-y-3">
        <h2 className="font-serif font-medium text-body text-ordift-ink">Agreement Readiness</h2>
        {!onboarding ? (
          <p className="font-sans text-body-small text-ordift-ink-muted">No onboarding record on file for this person — readiness cannot be evaluated.</p>
        ) : !agreementReadiness ? (
          <p className="font-sans text-body-small text-ordift-ink-muted">Readiness could not be evaluated.</p>
        ) : !agreementReadiness.ok ? (
          <div className="space-y-1">
            <p className="font-sans text-body-small text-red-700">{agreementReadiness.error}</p>
            {agreementReadiness.jurisdictionGateState && (
              <p className="font-sans text-caption text-ordift-ink-muted">Jurisdiction gate: {agreementReadiness.jurisdictionGateState.replace(/_/g, " ")}</p>
            )}
          </div>
        ) : (
          <>
            <ul className="divide-y divide-black/5">
              {agreementReadiness.fields.map((f) => (
                <li key={f.key} className="py-1.5 flex items-center justify-between gap-3">
                  <span className="font-sans text-caption text-ordift-ink">{f.label}{f.value ? ` — ${f.value}` : ""}</span>
                  <span
                    className={`px-2 py-0.5 rounded-full font-sans text-caption whitespace-nowrap ${
                      f.status === "satisfied" || f.status === "not_applicable"
                        ? "bg-green-100 text-green-800"
                        : f.status === "missing"
                          ? "bg-amber-100 text-amber-800"
                          : "bg-red-100 text-red-800"
                    }`}
                  >
                    {f.status.replace(/_/g, " ")}
                  </span>
                </li>
              ))}
            </ul>
            {agreementReadiness.ready ? (
              <form action={createEmployeeEmploymentAgreementDraftAction}>
                <input type="hidden" name="profileId" value={id} />
                <input type="hidden" name="onboardingId" value={onboarding.id} />
                <button type="submit" className="font-sans text-caption font-semibold px-3 py-1.5 rounded-md bg-ordift-navy-950 text-white">Create Draft Employment Agreement</button>
              </form>
            ) : (
              <p className="font-sans text-caption text-ordift-ink-muted">Every field above must be satisfied before a draft can be created — no field is ever filled in automatically.</p>
            )}
          </>
        )}
      </section>

      {/* Employment References (Phase B5 Step 11, 2026-09-14). Standard
          verifications are assembled ONLY from identity/role-title/
          employing-entity/dates — the issue action for them accepts no
          free-text content. Detailed corporate references always
          require human-authored content and an explicitly scoped
          authorization of what may be released. */}
      <section className="rounded-xl border border-black/10 bg-white p-6 space-y-4">
        <h2 className="font-serif font-medium text-body text-ordift-ink">Employment References</h2>
        {referenceRequests.length > 0 ? (
          <ul className="space-y-2">
            {referenceRequests.map((r) => (
              <li key={r.id} className="font-sans text-caption text-ordift-ink-muted space-y-1">
                <p>
                  · {r.requesterName}{r.requesterOrganization ? ` (${r.requesterOrganization})` : ""} — {r.referenceType.replace(/_/g, " ")}
                  {" for "}{r.employeeOrFormerEmployee.replace(/_/g, " ")} — {r.status}
                  {r.identityAuthorityVerified ? " · identity verified" : ""}
                </p>
                {r.status === "issued" && r.issuedReferenceContent && (
                  <div className="pl-3 rounded-lg bg-ordift-offwhite p-2">
                    <p className="whitespace-pre-line">{r.issuedReferenceContent}</p>
                    <p className="mt-1 text-ordift-ink-muted">Hash: {r.issuedReferenceHash}</p>
                  </div>
                )}
                {r.status === "requested" && (
                  <div className="pl-3 space-y-1">
                    {!r.identityAuthorityVerified ? (
                      <form action={verifyRequesterIdentityAction} className="flex items-center gap-2">
                        <input type="hidden" name="profileId" value={id} />
                        <input type="hidden" name="requestId" value={r.id} />
                        <button type="submit" className="font-sans text-caption font-semibold px-2 py-1 rounded-md bg-ordift-navy-950 text-white">Verify Requester Identity/Authority</button>
                      </form>
                    ) : r.referenceType === "standard_verification" ? (
                      <form action={issueStandardEmploymentVerificationAction}>
                        <input type="hidden" name="profileId" value={id} />
                        <input type="hidden" name="requestId" value={r.id} />
                        <button type="submit" className="font-sans text-caption font-semibold px-2 py-1 rounded-md bg-ordift-navy-950 text-white">Issue Standard Verification</button>
                      </form>
                    ) : (
                      <form action={issueDetailedCorporateReferenceAction} className="flex flex-wrap gap-2">
                        <input type="hidden" name="profileId" value={id} />
                        <input type="hidden" name="requestId" value={r.id} />
                        <input name="informationAuthorizedForRelease" required placeholder="Information authorized for release" className="rounded-lg border border-black/15 px-2 py-1 font-sans text-caption flex-1 min-w-[180px]" />
                        <textarea name="content" required placeholder="Reference content" className="w-full rounded-lg border border-black/15 px-2 py-1 font-sans text-caption" rows={3} />
                        <button type="submit" className="font-sans text-caption font-semibold px-2 py-1 rounded-md bg-ordift-navy-950 text-white">Issue Detailed Corporate Reference</button>
                      </form>
                    )}
                    <form action={declineReferenceRequestAction} className="flex flex-wrap gap-2">
                      <input type="hidden" name="profileId" value={id} />
                      <input type="hidden" name="requestId" value={r.id} />
                      <input name="decisionNotes" required placeholder="Decline reason" className="rounded-lg border border-black/15 px-2 py-1 font-sans text-caption flex-1 min-w-[160px]" />
                      <button type="submit" className="font-sans text-caption text-red-700 underline underline-offset-4">Decline</button>
                    </form>
                  </div>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="font-sans text-caption text-ordift-ink-muted">No reference requests on record.</p>
        )}
        <form action={requestEmploymentReferenceAction} className="grid grid-cols-2 gap-2 mt-2">
          <input type="hidden" name="profileId" value={id} />
          <input name="requesterName" required placeholder="Requester name" className="rounded-lg border border-black/15 px-2 py-1 font-sans text-caption" />
          <input name="requesterOrganization" placeholder="Requester organization (optional)" className="rounded-lg border border-black/15 px-2 py-1 font-sans text-caption" />
          <input name="requesterContact" placeholder="Requester contact (optional)" className="col-span-2 rounded-lg border border-black/15 px-2 py-1 font-sans text-caption" />
          <select name="employeeOrFormerEmployee" required defaultValue="" className="rounded-lg border border-black/15 bg-white px-2 py-1 font-sans text-caption">
            <option value="" disabled>Employee or former employee…</option>
            <option value="employee">Employee</option>
            <option value="former_employee">Former employee</option>
          </select>
          <select name="referenceType" required defaultValue="" className="rounded-lg border border-black/15 bg-white px-2 py-1 font-sans text-caption">
            <option value="" disabled>Reference type…</option>
            <option value="standard_verification">Standard verification</option>
            <option value="detailed_corporate_reference">Detailed corporate reference</option>
          </select>
          <button type="submit" className="col-span-2 justify-self-start font-sans text-caption font-semibold px-3 py-1 rounded-md bg-ordift-navy-950 text-white">Log Reference Request</button>
        </form>
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
