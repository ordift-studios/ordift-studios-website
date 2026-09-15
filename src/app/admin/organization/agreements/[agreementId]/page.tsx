import type { Metadata } from "next";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { getCurrentUser, isSuperAdmin } from "@/lib/portal/roles";
import { getEmployeeEmploymentAgreementForReview } from "@/lib/legal/employeeAgreements";

export const metadata: Metadata = {
  title: "Agreement Review — Ordift Studios Admin",
  robots: { index: false, follow: false },
};

// Founder-review-only agreement viewer (Workforce/Employee Self-Service
// Phase, 2026-09-15) — the OS-LGL-007 Employee Employment Agreement
// pipeline (agreementEngine.ts, employeeAgreements.ts) has always been
// able to CREATE a draft agreement, but nothing in this codebase could
// ever display one back — confirmed by inspection, a repo-wide gap,
// not specific to this agreement type (see clientPortalAgreements.ts's
// own "no real issued-artifact rendering exists yet" comment). This
// page is deliberately narrow: it renders the real, unmodified
// OS-LGL-007 master text and this specific agreement's frozen snapshot
// values side by side — never splicing values into the master's prose
// (which would risk corrupting counsel-approved wording), and never
// generating a PDF or any downloadable/public artifact (that
// infrastructure doesn't exist anywhere yet and is out of this
// narrow task's scope). Viewing here has no side effect: it never
// issues, sends, signs, or executes anything, and never advances
// onboarding or marks any requirement satisfied.
export default async function AgreementReviewPage({ params }: { params: Promise<{ agreementId: string }> }) {
  const { agreementId } = await params;
  const currentUser = await getCurrentUser();
  if (!currentUser) redirect("/admin/overview");
  if (!isSuperAdmin(currentUser)) redirect("/admin/overview");

  const result = await getEmployeeEmploymentAgreementForReview(agreementId, currentUser.id);
  if (!result.ok) notFound();
  const { detail } = result;

  return (
    <div className="space-y-8">
      <div>
        <p className="font-sans font-semibold uppercase tracking-[0.2em] text-eyebrow text-ordift-gold-pressed mb-2">
          Admin · Organization · Legal
        </p>
        <h1 className="font-serif font-medium text-section-heading lg:text-section-heading-desktop text-ordift-ink">
          {detail.agreementReference}
        </h1>
        <p className="font-sans text-body-small text-ordift-ink-muted mt-2">
          <span className={`px-2 py-0.5 rounded-full font-sans text-caption ${detail.isIssued ? "bg-blue-100 text-blue-800" : "bg-amber-100 text-amber-800"}`}>
            {detail.isIssued ? detail.status.replace(/_/g, " ").toUpperCase() : "DRAFT — AVAILABLE FOR FOUNDER REVIEW"}
          </span>
        </p>
      </div>

      {!detail.isIssued && (
        <section className="rounded-xl border border-amber-300 bg-amber-50 p-6 space-y-2">
          <h2 className="font-serif font-medium text-body text-ordift-ink">This is a DRAFT — nothing has been issued</h2>
          <p className="font-sans text-body-small text-ordift-ink-muted">
            Generation itself is not Founder approval. Nothing has been issued to the employee, sent for signature,
            marked executed, or used to advance onboarding or acknowledge policies. Return to the Full Profile to
            regenerate (via a fresh Create Draft) if a correction is needed — later phases will add explicit
            approve/issue actions.
          </p>
        </section>
      )}

      <section className="rounded-xl border border-black/10 bg-white p-6 space-y-2">
        <h2 className="font-serif font-medium text-body text-ordift-ink">Generation Metadata</h2>
        <p className="font-sans text-body-small text-ordift-ink-muted">Employee: <span className="text-ordift-ink">{detail.employeeName ?? "—"}</span></p>
        <p className="font-sans text-body-small text-ordift-ink-muted">OS-LGL-007 master version: <span className="text-ordift-ink">{detail.masterVersion}</span></p>
        <p className="font-sans text-body-small text-ordift-ink-muted">Agreement created: <span className="text-ordift-ink">{new Date(detail.createdAt).toLocaleString()}</span></p>
        <p className="font-sans text-body-small text-ordift-ink-muted">
          Snapshot recorded: <span className="text-ordift-ink">{detail.snapshotRecordedAt ? new Date(detail.snapshotRecordedAt).toLocaleString() : "—"}</span>
        </p>
        <p className="font-sans text-caption text-ordift-ink-muted break-all">Master template content hash (SHA-256): {detail.masterTextSha256}</p>
      </section>

      <section className="rounded-xl border border-black/10 bg-white p-6 space-y-3">
        <h2 className="font-serif font-medium text-body text-ordift-ink">Schedule A — Resolved Employee-Specific Particulars</h2>
        <p className="font-sans text-caption text-ordift-ink-muted">
          The exact values this agreement was generated with, frozen at snapshot time — never re-resolved live.
        </p>
        <ul className="divide-y divide-black/5">
          {detail.snapshot.map((row) => (
            <li key={row.key} className="py-2 flex flex-wrap items-baseline justify-between gap-2">
              <span className="font-sans text-body-small font-medium text-ordift-ink">{row.label}</span>
              <span className="font-sans text-body-small text-ordift-ink-muted">{row.value ?? "— (not applicable / not recorded)"}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-xl border border-black/10 bg-white p-6 space-y-3">
        <h2 className="font-serif font-medium text-body text-ordift-ink">OS-LGL-007 Master Text (Registered, Unmodified)</h2>
        <p className="font-sans text-caption text-ordift-ink-muted">
          Rendered verbatim from the controlled source — never edited here. Schedule A above shows this specific
          agreement&apos;s resolved values; the placeholders below remain exactly as approved.
        </p>
        <pre className="font-sans text-caption text-ordift-ink whitespace-pre-wrap max-h-[32rem] overflow-y-auto rounded-lg border border-black/10 bg-ordift-offwhite p-4">
          {detail.masterFullText}
        </pre>
      </section>

      <p className="font-sans text-body-small text-ordift-ink-muted">
        <Link href="/admin/users" className="underline underline-offset-4">← Users &amp; Roles</Link>
      </p>
    </div>
  );
}
