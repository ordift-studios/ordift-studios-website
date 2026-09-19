import type { Metadata } from "next";
import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { getCurrentUser, hasRole, isSuperAdmin } from "@/lib/portal/roles";
import { getRecruitmentApplication, getHiringBridgeStatus, resolveRecruitmentLiveStage } from "@/lib/recruitment/adminData";
import { StatusUpdateForm, FileLinkButton } from "./RecruitmentDetailActions";

export const metadata: Metadata = {
  title: "Application — Recruitment — Ordift Studios Admin",
  robots: { index: false, follow: false },
};

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  if (!value) return null;
  return (
    <div className="px-6 py-4 border-b border-ordift-ink/10 last:border-0">
      <p className="font-sans text-caption uppercase tracking-[0.1em] text-ordift-ink-muted mb-1">{label}</p>
      <p className="font-sans text-body-small text-ordift-ink whitespace-pre-line">{value}</p>
    </div>
  );
}

export default async function RecruitmentApplicationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user || (!hasRole(user, "admin") && !isSuperAdmin(user))) redirect("/admin/overview");

  const app = await getRecruitmentApplication(id);
  if (!app) notFound();
  const hiringBridge = app.status === "accepted" ? await getHiringBridgeStatus({ id: app.id, email: app.email }) : null;
  const liveStage = hiringBridge ? await resolveRecruitmentLiveStage(hiringBridge) : null;

  return (
    <div className="max-w-2xl">
      <div className="mb-8">
        <Link href="/admin/recruitment" className="font-sans text-caption text-ordift-ink-muted hover:text-ordift-ink">
          ← Recruitment
        </Link>
        <h1 className="font-serif font-medium text-section-heading lg:text-section-heading-desktop text-ordift-ink mt-3">
          {app.fullName}
        </h1>
        <p className="font-sans text-body-small text-ordift-ink-muted mt-2">
          {app.roleInterest}
          {app.engagementType ? ` · ${app.engagementType}` : ""}
        </p>
      </div>

      <div className="bg-white rounded-lg border border-ordift-ink/10 p-6 mb-6">
        <p className="font-sans text-body-small text-ordift-ink-muted mb-3">Status</p>
        <StatusUpdateForm applicationId={app.id} currentStatus={app.status} />
      </div>

      {/* Accepted -> HR bridge (2026-09-16) — deliberately does NOT
          auto-create an employee account. Accepted is a recruitment
          decision, never itself an employment decision (role,
          classification, engagement type, position, grade, department,
          salary, start date remain a separate, deliberate HR action).
          This only carries the genuine, already-recorded application
          data forward as a prefill into the existing, proven Invite
          Collaborator flow (Users & Roles) — the same account-creation
          mechanism convertApplicationToVendorAction reuses, which
          itself refuses a duplicate email, so this can never create a
          duplicate identity. */}
      {/* Invitation idempotency fix (2026-09-16, Kelvin QA) — this used
          to unconditionally show "Proceed to Hire" even once the bridge
          had already run and a real account existed. Now reflects the
          genuine current stage (getHiringBridgeStatus) instead of
          re-asking for an action that already happened. */}
      {hiringBridge?.stage === "not_invited" && (
        <div className="bg-white rounded-lg border border-ordift-gold/40 p-6 mb-6 space-y-3">
          <p className="font-sans text-body-small font-semibold text-ordift-ink">Proceed to Hire / Begin Pre-Employment</p>
          <p className="font-sans text-caption text-ordift-ink-muted">
            Opens Employee Account Setup with this applicant&rsquo;s name and email pre-filled. Role, account
            classification, engagement type, position, department, grade, salary, and start date are all deliberately
            left for you to set there — nothing here invents an employment decision.
          </p>
          <Link
            href={`/admin/users?prefillFullName=${encodeURIComponent(app.fullName)}&prefillEmail=${encodeURIComponent(app.email)}&sourceApplicationId=${app.id}`}
            className="inline-block font-sans text-body-small font-semibold px-4 py-2 rounded-md bg-ordift-navy-950 text-white"
          >
            Proceed to Hire →
          </Link>
        </div>
      )}
      {hiringBridge && hiringBridge.stage !== "not_invited" && (
        <div className="rounded-lg border border-green-200 bg-green-50 p-6 mb-6 space-y-2">
          <p className="font-sans text-body-small font-semibold text-ordift-ink">
            {hiringBridge.stage === "invitation_sent" && "Invitation sent — awaiting acceptance"}
            {hiringBridge.stage === "account_created" && (hiringBridge.positionAssigned ? "Account created — ready to start onboarding" : "Account created — assign a Position to continue")}
            {hiringBridge.stage === "onboarding_in_progress" && "Onboarding in progress"}
            {hiringBridge.stage === "onboarding_complete" && "Onboarding complete"}
          </p>
          <p className="font-sans text-caption text-ordift-ink-muted">
            Account setup already began for this applicant — no further invitation is needed.
          </p>
          {liveStage && (
            <Link href={liveStage.href} className="inline-block font-sans text-caption font-semibold text-ordift-gold-pressed underline underline-offset-4">
              {liveStage.label} →
            </Link>
          )}
          <Link href="/admin/users" className="font-sans text-caption text-ordift-gold-pressed underline underline-offset-4">
            Manage in Users &amp; Roles →
          </Link>
        </div>
      )}

      {(app.hasPhoto || app.hasCv) && (
        <div className="bg-white rounded-lg border border-ordift-ink/10 p-6 mb-6 flex flex-wrap gap-3">
          {app.hasPhoto && <FileLinkButton applicationId={app.id} file="photo" label="View Profile Photograph" />}
          {app.hasCv && <FileLinkButton applicationId={app.id} file="cv" label="Download CV" />}
        </div>
      )}

      <div className="bg-white rounded-lg border border-ordift-ink/10 divide-y divide-ordift-ink/10">
        <Row label="Email" value={app.email} />
        <Row label="Phone / WhatsApp" value={app.phone} />
        <Row label="Location" value={app.location} />
        <Row label="Availability" value={app.availability} />
        <Row label="Portfolio / Website" value={app.portfolioUrl} />
        <Row label="Social / Professional Link" value={app.socialUrl} />
        <Row label="Introduction / About" value={app.intro} />
        <Row label="Relevant Experience" value={app.experience} />
        <Row label="Additional Message" value={app.message} />
        <Row
          label="Submitted"
          value={new Date(app.submittedAt).toLocaleString("en-GB", { dateStyle: "long", timeStyle: "short" })}
        />
        {app.reviewedAt && (
          <Row label="Last Reviewed" value={new Date(app.reviewedAt).toLocaleString("en-GB", { dateStyle: "long", timeStyle: "short" })} />
        )}
      </div>
    </div>
  );
}
