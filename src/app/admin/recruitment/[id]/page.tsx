import type { Metadata } from "next";
import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { getCurrentUser, hasRole, isSuperAdmin } from "@/lib/portal/roles";
import { getRecruitmentApplication } from "@/lib/recruitment/adminData";
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
