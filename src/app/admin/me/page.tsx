import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser, hasRole, isStaffOrAdmin, isSuperAdmin } from "@/lib/portal/roles";
import { resolveEmployeeDateRange } from "@/lib/organization/workingDayCalendar";
import { getAssignmentsForUser, ASSIGNMENT_STATUS_LABELS } from "@/lib/admin/projectAssignments";
import { getNotificationPreference } from "@/lib/notifications/preferences";
import { NotificationPreferenceToggle } from "./NotificationPreferenceToggle";
import { listUsersWithRoles } from "@/lib/portal/adminData";
import { listControlledPolicyDocuments, listPolicyAcknowledgementsForProfile } from "@/lib/organization/policyAcknowledgements";
import { getCurrentEmploymentTerms } from "@/lib/organization/employmentTermsHistory";
import { listEmployerCapableEmployingEntities } from "@/lib/organization/legalEntities";
import { getServiceLengthSummary } from "@/lib/organization/serviceLength";
import { getLeaveBalance, listLeaveRequestsForProfile } from "@/lib/organization/leaveRequests";
import { listLeaveTypes, resolveEmployeeLeaveJurisdiction } from "@/lib/organization/leaveTypes";
import { listLongServiceBenefitAwardsForProfile } from "@/lib/organization/compensation";
import { getStaffOnboardingByProfileId } from "@/lib/organization/onboarding";
import { listResolvedRequirements } from "@/lib/organization/onboardingRequirements";
import { listAssetAssignmentsForProfile, listCompanyAssets } from "@/lib/organization/assets";
import { getEmployeeEmploymentAgreementSummary } from "@/lib/legal/employeeAgreements";
import { MyWorkspaceLanding } from "./MyWorkspaceLanding";
import { FounderSelfAdministrationForm } from "./FounderSelfAdministrationForm";

// Pending/reserved leave, for the My Workspace HR Summary below: any
// request not yet in a final state (approved/declined/cancelled) —
// reuses LeaveRequestStatus (leaveRequests.ts) verbatim rather than a
// second status list.
const PENDING_LEAVE_STATUSES = new Set(["submitted", "under_review", "alternative_proposed"]);

export const metadata: Metadata = {
  title: "My Workspace — Ordift Studios",
  robots: { index: false, follow: false },
};

// Employee Self-Service landing page (Phase B5 Step 15, 2026-09-14) —
// the entry point for "My Workspace". Reuses listUsersWithRoles()'s
// already-rich per-person row rather than a new query, matching how
// the Employee Profile page (people/[id]/page.tsx) resolves a person's
// own summary.
export default async function MyWorkspacePage() {
  const user = await getCurrentUser();
  if (!user || !isStaffOrAdmin(user)) redirect("/admin/overview");

  const [usersResult, controlledPolicyDocuments, myAcknowledgements, myEmploymentTerms] = await Promise.all([
    listUsersWithRoles(),
    listControlledPolicyDocuments(),
    listPolicyAcknowledgementsForProfile(user.id),
    getCurrentEmploymentTerms(user.id),
  ]);
  const me = usersResult.ok ? usersResult.users.find((u) => u.id === user.id) : undefined;
  const acknowledgedVersionIds = new Set(myAcknowledgements.map((a) => a.policyVersionId));
  const pendingPolicies = controlledPolicyDocuments.filter((doc) => !acknowledgedVersionIds.has(doc.documentVersionId));

  // Founder/CEO self-administration (2026-09-15) — shown ONLY when the
  // viewer is Super Admin AND genuinely has no employment-terms record
  // of their own yet. This is not a Founder-specific hardcode: it is a
  // self-healing condition that happens to be true only for the
  // Founder today (the one Super Admin with Position/Department/Grade
  // already assigned but no employment_terms_history row — see
  // recordFounderSelfAdministeredEmploymentTerms()'s own comment for
  // why this exists at all), and disappears permanently for anyone
  // once they've recorded it once.
  const showFounderSelfAdministration = isSuperAdmin(user) && !myEmploymentTerms;
  const employingEntities = showFounderSelfAdministration ? await listEmployerCapableEmployingEntities() : [];

  // My Workspace HR Summary (backlog sweep, 2026-09-16) — service
  // length, leave, and benefits, all read from the same source-of-truth
  // modules the dedicated My Leave / My Compensation pages already use
  // (never a second, separately-maintained computation). Each fetch is
  // independently optional: a person with no employment-terms history
  // or no resolved leave jurisdiction yet simply sees that section
  // omitted, never a fabricated zero pretending to be real data.
  const jurisdiction = await resolveEmployeeLeaveJurisdiction(user.id);
  const currentLeaveYear = new Date().getUTCFullYear();
  const [serviceLength, leaveTypes, longServiceAwards] = await Promise.all([
    getServiceLengthSummary(user.id),
    jurisdiction ? listLeaveTypes(jurisdiction) : Promise.resolve([]),
    listLongServiceBenefitAwardsForProfile(user.id),
  ]);
  const [leaveBalanceRows, leaveRequests] = await Promise.all([
    Promise.all(leaveTypes.map((t) => getLeaveBalance(user.id, t.id, currentLeaveYear))),
    leaveTypes.length > 0 ? listLeaveRequestsForProfile(user.id) : Promise.resolve([]),
  ]);
  const leaveBalances = leaveBalanceRows.filter((b): b is NonNullable<typeof b> => b !== null);

  // My Workspace completion (2026-09-16) — Onboarding/Assets/Agreements,
  // all read from the same modules the admin profile page and Vendor
  // detail page already use for the equivalent data, never duplicated.
  const [myOnboarding, myAssetAssignments, companyAssets] = await Promise.all([
    getStaffOnboardingByProfileId(user.id),
    listAssetAssignmentsForProfile(user.id),
    listCompanyAssets(),
  ]);
  const assetById = new Map(companyAssets.map((a) => [a.id, a]));
  const myActiveAssets = myAssetAssignments.filter((a) => !a.returnedAt);
  const myOutstandingRequirements =
    myOnboarding && myOnboarding.status !== "completed"
      ? (await listResolvedRequirements({ onboardingId: myOnboarding.id, profileId: user.id, pipeline: myOnboarding.pipeline })).filter(
          (r) => r.status !== "satisfied" && r.status !== "waived" && r.status !== "not_applicable"
        )
      : [];
  const myAgreementSummary =
    myOnboarding && myOnboarding.pipeline === "employee" ? await getEmployeeEmploymentAgreementSummary(myOnboarding.id) : null;
  // My Workspace — Schedule, Projects, Notifications (2026-09-16).
  // Schedule reuses the SAME resolveEmployeeDateRange() the My Calendar
  // page itself calls, for the current week only — a teaser, never a
  // second calendar engine. Projects reuses getAssignmentsForUser(),
  // the same function admin/users already calls for the other
  // direction of this relationship. Notifications is only real for a
  // plain `admin` today (new_booking is the only wired category, and
  // it's meaningless for Super Admin — see adminData.ts's own comment
  // on newBookingAlertsEnabled) — nobody else sees a fabricated toggle.
  const now = new Date();
  const startOfWeek = new Date(now);
  startOfWeek.setDate(now.getDate() - now.getDay());
  const endOfWeek = new Date(startOfWeek);
  endOfWeek.setDate(startOfWeek.getDate() + 6);
  const toISODate = (d: Date) => d.toISOString().slice(0, 10);
  const [weekResolutions, myProjectAssignments, newBookingAlertsEnabled] = await Promise.all([
    myEmploymentTerms
      ? resolveEmployeeDateRange({ profileId: user.id, startDate: toISODate(startOfWeek), endDate: toISODate(endOfWeek) })
      : Promise.resolve([]),
    getAssignmentsForUser(user.id),
    hasRole(user, "admin") ? getNotificationPreference(user.id, "new_booking") : Promise.resolve(null),
  ]);
  const activeProjectAssignments = myProjectAssignments.filter((a) => a.status === "active" || a.status === "invited");

  const leaveSummary =
    leaveBalances.length > 0
      ? {
          entitlementDays: leaveBalances.reduce((sum, b) => sum + b.entitlementDays + b.carriedOverDays + b.protectedCarriedOverDays, 0),
          usedDays: leaveBalances.reduce((sum, b) => sum + b.usedDays, 0),
          remainingDays: leaveBalances.reduce((sum, b) => sum + b.remainingDays, 0),
          pendingDays: leaveRequests
            .filter((r) => PENDING_LEAVE_STATUSES.has(r.status))
            .reduce((sum, r) => sum + r.daysRequested, 0),
        }
      : null;

  return (
    <div className="space-y-8">
      <div>
        <p className="font-sans font-semibold uppercase tracking-[0.2em] text-eyebrow text-ordift-gold-pressed mb-2">My Workspace</p>
        <h1 className="font-serif font-medium text-section-heading lg:text-section-heading-desktop text-ordift-ink">
          {me?.fullName ?? user.fullName ?? user.email}
        </h1>
      </div>

      <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="rounded-xl border border-black/10 bg-white p-6 space-y-2">
          <h2 className="font-serif font-medium text-body text-ordift-ink">My Details</h2>
          <p className="font-sans text-body-small text-ordift-ink-muted">Grade: {me?.gradeCode ? `${me.gradeCode} — ${me.gradeName}` : "—"}</p>
          <p className="font-sans text-body-small text-ordift-ink-muted">Title/Position: {me?.positionName ?? me?.operationalTitleName ?? "—"}</p>
          <p className="font-sans text-body-small text-ordift-ink-muted">Department: {me?.departmentName ?? "—"}</p>
          <p className="font-sans text-body-small text-ordift-ink-muted">Reports to: {me?.managerName ?? "—"}</p>
          <p className="font-sans text-body-small text-ordift-ink-muted">Employment status: {me?.employmentStatus ?? "Not set"}</p>
        </div>

        <div className="rounded-xl border border-black/10 bg-white p-6 space-y-2">
          <h2 className="font-serif font-medium text-body text-ordift-ink">Quick Links</h2>
          <ul className="space-y-1">
            <li><Link href="/admin/me/leave" className="font-sans text-body-small text-ordift-gold-pressed underline underline-offset-4">My Leave →</Link></li>
            <li><Link href="/admin/me/calendar" className="font-sans text-body-small text-ordift-gold-pressed underline underline-offset-4">My Calendar →</Link></li>
            <li><Link href="/admin/me/attendance" className="font-sans text-body-small text-ordift-gold-pressed underline underline-offset-4">My Attendance →</Link></li>
            <li><Link href="/admin/me/compensation" className="font-sans text-body-small text-ordift-gold-pressed underline underline-offset-4">My Compensation →</Link></li>
            <li><Link href="/admin/me/performance" className="font-sans text-body-small text-ordift-gold-pressed underline underline-offset-4">My Performance →</Link></li>
            <li><Link href="/admin/me/grievances" className="font-sans text-body-small text-ordift-gold-pressed underline underline-offset-4">My Grievances →</Link></li>
            <li><Link href="/admin/me/requests" className="font-sans text-body-small text-ordift-gold-pressed underline underline-offset-4">My Requests →</Link></li>
          </ul>
        </div>
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="rounded-xl border border-black/10 bg-white p-6 space-y-2">
          <h2 className="font-serif font-medium text-body text-ordift-ink">Service Length</h2>
          {serviceLength ? (
            <>
              <p className="font-sans text-body text-ordift-ink">{serviceLength.formatted}</p>
              <p className="font-sans text-caption text-ordift-ink-muted">Since {serviceLength.startDate}</p>
            </>
          ) : (
            <p className="font-sans text-body-small text-ordift-ink-muted">No employment start date recorded yet.</p>
          )}
        </div>

        <div className="rounded-xl border border-black/10 bg-white p-6 space-y-2">
          <h2 className="font-serif font-medium text-body text-ordift-ink">Leave</h2>
          {leaveSummary ? (
            <>
              <p className="font-sans text-body-small text-ordift-ink-muted">Entitlement: {leaveSummary.entitlementDays} days</p>
              <p className="font-sans text-body-small text-ordift-ink-muted">Used: {leaveSummary.usedDays} days</p>
              {leaveSummary.pendingDays > 0 && (
                <p className="font-sans text-body-small text-ordift-ink-muted">Pending/reserved: {leaveSummary.pendingDays} days</p>
              )}
              <p className="font-sans text-body text-ordift-ink">Remaining: {leaveSummary.remainingDays} days</p>
            </>
          ) : (
            <p className="font-sans text-body-small text-ordift-ink-muted">No leave balance recorded yet for {currentLeaveYear}.</p>
          )}
        </div>

        <div className="rounded-xl border border-black/10 bg-white p-6 space-y-2">
          <h2 className="font-serif font-medium text-body text-ordift-ink">Benefits &amp; Employment</h2>
          <p className="font-sans text-body-small text-ordift-ink-muted">
            Basic salary: {myEmploymentTerms?.basicSalary != null ? `${myEmploymentTerms.currency ?? ""} ${myEmploymentTerms.basicSalary}`.trim() : "—"}
          </p>
          <p className="font-sans text-body-small text-ordift-ink-muted">Work pattern: {myEmploymentTerms?.workPattern ?? "—"}</p>
          {longServiceAwards.length > 0 ? (
            <ul className="space-y-1 pt-1">
              {longServiceAwards.map((a) => (
                <li key={a.id} className="font-sans text-body-small text-ordift-ink-muted">
                  {a.milestoneYears}-year long-service award — {a.percentage}% — {a.awardedAt}
                </li>
              ))}
            </ul>
          ) : (
            <p className="font-sans text-body-small text-ordift-ink-muted">No long-service benefit awarded yet.</p>
          )}
        </div>
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="rounded-xl border border-black/10 bg-white p-6 space-y-2">
          <h2 className="font-serif font-medium text-body text-ordift-ink">My Onboarding</h2>
          {!myOnboarding ? (
            <p className="font-sans text-body-small text-ordift-ink-muted">No onboarding record on file.</p>
          ) : myOnboarding.status === "completed" ? (
            <p className="font-sans text-body-small text-green-700">Complete.</p>
          ) : myOutstandingRequirements.length === 0 ? (
            <p className="font-sans text-body-small text-ordift-ink-muted">In progress — no outstanding requirements.</p>
          ) : (
            <ul className="space-y-1">
              {myOutstandingRequirements.map((r) => (
                <li key={r.requirementKey} className="font-sans text-body-small text-ordift-ink-muted">{r.label} — {r.status}</li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-xl border border-black/10 bg-white p-6 space-y-2">
          <h2 className="font-serif font-medium text-body text-ordift-ink">My Agreements</h2>
          {myAgreementSummary ? (
            <p className="font-sans text-body-small text-ordift-ink-muted">
              {myAgreementSummary.agreementReference} — {myAgreementSummary.status.replace(/_/g, " ")}
            </p>
          ) : (
            <p className="font-sans text-body-small text-ordift-ink-muted">No agreement on file yet.</p>
          )}
        </div>

        <div className="rounded-xl border border-black/10 bg-white p-6 space-y-2">
          <h2 className="font-serif font-medium text-body text-ordift-ink">My Assets</h2>
          {myActiveAssets.length === 0 ? (
            <p className="font-sans text-body-small text-ordift-ink-muted">No equipment currently issued.</p>
          ) : (
            <ul className="space-y-1">
              {myActiveAssets.map((a) => {
                const asset = assetById.get(a.assetId);
                return (
                  <li key={a.id} className="font-sans text-body-small text-ordift-ink-muted">
                    {asset ? `${asset.assetIdentifier} — ${asset.description}` : a.assetId}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="rounded-xl border border-black/10 bg-white p-6 space-y-2">
          <div className="flex items-center justify-between mb-1">
            <h2 className="font-serif font-medium text-body text-ordift-ink">This Week</h2>
            <Link href="/admin/me/calendar" className="font-sans text-caption text-ordift-gold-pressed underline underline-offset-4">
              Full calendar →
            </Link>
          </div>
          {weekResolutions.length === 0 ? (
            <p className="font-sans text-body-small text-ordift-ink-muted">Employment calendar not configured yet.</p>
          ) : (
            <div className="grid grid-cols-7 gap-1">
              {weekResolutions.map((r) => (
                <div key={r.date} className="text-center">
                  <p className="font-sans text-[0.6rem] uppercase tracking-wide text-ordift-ink-muted">
                    {new Date(`${r.date}T00:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", timeZone: "UTC" })}
                  </p>
                  <p
                    className={`mt-1 rounded-md py-1 font-sans text-[0.65rem] font-semibold ${
                      r.classification === "WORKING_DAY"
                        ? "bg-ordift-navy-950 text-white"
                        : r.classification === "PUBLIC_HOLIDAY"
                          ? "bg-ordift-gold/30 text-ordift-ink"
                          : "bg-black/5 text-ordift-ink-muted"
                    }`}
                    title={r.holidayName ?? undefined}
                  >
                    {new Date(`${r.date}T00:00:00Z`).getUTCDate()}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-xl border border-black/10 bg-white p-6 space-y-2">
          <h2 className="font-serif font-medium text-body text-ordift-ink">My Projects</h2>
          {activeProjectAssignments.length === 0 ? (
            <p className="font-sans text-body-small text-ordift-ink-muted">No current project assignments.</p>
          ) : (
            <ul className="space-y-1.5">
              {activeProjectAssignments.map((a) => (
                <li key={a.id} className="font-sans text-body-small text-ordift-ink-muted">
                  {a.entityLabel}
                  <span className="ml-1.5 px-1.5 py-0.5 rounded-full font-sans text-[0.65rem] bg-black/5 text-ordift-ink">
                    {ASSIGNMENT_STATUS_LABELS[a.status]}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-xl border border-black/10 bg-white p-6 space-y-1">
          <h2 className="font-serif font-medium text-body text-ordift-ink mb-1">Notifications</h2>
          {newBookingAlertsEnabled === null ? (
            <p className="font-sans text-body-small text-ordift-ink-muted">No notification preferences apply to your account yet.</p>
          ) : (
            <NotificationPreferenceToggle category="new_booking" label="New booking alerts" initialEnabled={newBookingAlertsEnabled} />
          )}
        </div>
      </section>

      {showFounderSelfAdministration && (
        <section className="rounded-xl border border-amber-300 bg-amber-50 p-6 space-y-3">
          <h2 className="font-serif font-medium text-body text-ordift-ink">Founder &amp; CEO — Self-Administered Employment Record</h2>
          <p className="font-sans text-body-small text-ordift-ink-muted">
            No internal HR authority exists above the Founder &amp; CEO, so this record is self-administered rather
            than independently reviewed — it is recorded and audited as such, distinct from every other employee&apos;s
            HR-reviewed employment record.
          </p>
          <FounderSelfAdministrationForm employingEntities={employingEntities} />
        </section>
      )}

      <section className="rounded-xl border border-black/10 bg-white p-6 space-y-3">
        <h2 className="font-serif font-medium text-body text-ordift-ink">Policies to Acknowledge</h2>
        <MyWorkspaceLanding pendingPolicies={pendingPolicies} />
      </section>
    </div>
  );
}
