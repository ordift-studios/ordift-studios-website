import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser, hasRole, isSuperAdmin } from "@/lib/portal/roles";
import { listRecruitmentApplications } from "@/lib/recruitment/adminData";
import { RECRUITMENT_STATUS_LABEL } from "@/lib/recruitment/types";

export const metadata: Metadata = {
  title: "Recruitment — Ordift Studios Admin",
  robots: { index: false, follow: false },
};

// Admin/Super Admin only — narrower than most internal-facing Admin
// pages, per explicit direction (applicant CVs/photos/contact details
// are more sensitive than a client enquiry). Mirrors /admin/users'
// exact gate.
export default async function AdminRecruitmentPage() {
  const user = await getCurrentUser();
  if (!user || (!hasRole(user, "admin") && !isSuperAdmin(user))) redirect("/admin/overview");

  const applications = await listRecruitmentApplications();

  return (
    <div>
      <div className="mb-8">
        <p className="font-sans font-semibold uppercase tracking-[0.2em] text-eyebrow text-ordift-gold-pressed mb-2">Admin</p>
        <h1 className="font-serif font-medium text-section-heading lg:text-section-heading-desktop text-ordift-ink">
          Recruitment
        </h1>
        <p className="font-sans text-body-small text-ordift-ink-muted mt-2 max-w-2xl">
          Applications submitted through /careers (&ldquo;Join Our Team&rdquo;). Submitting an application never
          creates a Staff/Admin account or a public Team profile on its own — those remain separate, deliberate
          actions.
        </p>
      </div>

      {applications.length === 0 ? (
        <p className="font-sans text-body-small text-ordift-ink-muted">No applications yet.</p>
      ) : (
        <div className="bg-white rounded-lg border border-ordift-ink/10 overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-ordift-ink/10">
                <th className="px-5 py-3 font-sans text-caption uppercase tracking-[0.1em] text-ordift-ink-muted">Applicant</th>
                <th className="px-5 py-3 font-sans text-caption uppercase tracking-[0.1em] text-ordift-ink-muted">Role</th>
                <th className="px-5 py-3 font-sans text-caption uppercase tracking-[0.1em] text-ordift-ink-muted">Location</th>
                <th className="px-5 py-3 font-sans text-caption uppercase tracking-[0.1em] text-ordift-ink-muted">Submitted</th>
                <th className="px-5 py-3 font-sans text-caption uppercase tracking-[0.1em] text-ordift-ink-muted">Status</th>
              </tr>
            </thead>
            <tbody>
              {applications.map((app) => (
                <tr key={app.id} className="border-b border-ordift-ink/5 last:border-0 hover:bg-black/[0.02]">
                  <td className="px-5 py-3">
                    <Link href={`/admin/recruitment/${app.id}`} className="font-sans text-body-small text-ordift-ink font-medium hover:text-ordift-gold-pressed">
                      {app.fullName}
                    </Link>
                  </td>
                  <td className="px-5 py-3 font-sans text-body-small text-ordift-ink-muted">{app.roleInterest}</td>
                  <td className="px-5 py-3 font-sans text-body-small text-ordift-ink-muted">{app.location ?? "—"}</td>
                  <td className="px-5 py-3 font-sans text-body-small text-ordift-ink-muted">
                    {new Date(app.submittedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                  </td>
                  <td className="px-5 py-3">
                    <span className="font-sans text-caption uppercase tracking-[0.1em] px-2 py-0.5 rounded-full bg-black/5 text-ordift-ink-muted">
                      {RECRUITMENT_STATUS_LABEL[app.status]}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
