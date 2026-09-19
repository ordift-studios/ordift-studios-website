import type { Metadata } from "next";
import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/portal/roles";
import { createAdminClient } from "@/lib/supabase/admin";
import { listSubmissionsForBriefAsInstructor, listFeedbackForSubmissionAsInstructor } from "@/lib/workshops/briefsAndSubmissions";
import { InstructorGiveFeedbackForm } from "./InstructorGiveFeedbackForm";

export const metadata: Metadata = {
  title: "Brief Submissions — Ordift Studios Portal",
  robots: { index: false, follow: false },
};

// Workshop Learning Infrastructure V1 (2026-09-19) — instructor's own
// review surface for a brief's submissions, scoped to workshops they
// are genuinely engaged on (listSubmissionsForBriefAsInstructor
// re-verifies this independently — an instructor cannot reach another
// workshop's submissions merely by editing this URL's ids).
export default async function InstructorBriefSubmissionsPage({ params }: { params: Promise<{ workshopId: string; briefId: string }> }) {
  const { workshopId, briefId } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/portal/login");

  const admin = createAdminClient();
  const { data: brief } = await admin.from("workshop_briefs").select("id, title, instructions").eq("id", briefId).eq("workshop_id", workshopId).maybeSingle();
  if (!brief) notFound();

  const submissions = await listSubmissionsForBriefAsInstructor(briefId, workshopId, user.id);
  const feedbackBySubmission = new Map(await Promise.all(submissions.map(async (s) => [s.id, await listFeedbackForSubmissionAsInstructor(s.id, user.id)] as const)));

  return (
    <div className="space-y-8">
      <div>
        <Link href="/portal/instructor" className="font-sans text-caption text-ordift-ink-muted hover:text-ordift-ink">← My Workshops</Link>
        <h1 className="font-serif font-medium text-section-heading lg:text-section-heading-desktop text-ordift-ink mt-2">{brief.title}</h1>
        <p className="font-sans text-body-small text-ordift-ink-muted mt-2 max-w-2xl">{brief.instructions}</p>
      </div>

      <section className="rounded-xl border border-black/10 bg-white p-6 space-y-4">
        <h2 className="font-serif font-medium text-body text-ordift-ink">Submissions ({submissions.length})</h2>
        {submissions.length === 0 ? (
          <p className="font-sans text-body-small text-ordift-ink-muted">No submissions yet.</p>
        ) : (
          <ul className="divide-y divide-black/5 rounded-lg border border-black/5">
            {submissions.map((s) => (
              <li key={s.id} className="px-4 py-4 space-y-2">
                <p className="font-sans text-body-small font-medium text-ordift-ink">
                  {s.participantName} <span className="font-normal text-ordift-ink-muted">· {new Date(s.submittedAt).toLocaleString("en-GB")}</span>
                </p>
                {s.note && <p className="font-sans text-body-small text-ordift-ink-muted">{s.note}</p>}
                {s.storagePaths.length > 0 && <p className="font-sans text-caption text-ordift-ink-muted">{s.storagePaths.length} file(s) attached</p>}
                {(feedbackBySubmission.get(s.id) ?? []).map((f) => (
                  <div key={f.id} className="rounded-lg bg-ordift-offwhite px-3 py-2">
                    <p className="font-sans text-caption text-ordift-ink-muted uppercase tracking-wide">{f.status.replace(/_/g, " ")} · {new Date(f.createdAt).toLocaleDateString("en-GB")}</p>
                    <p className="font-sans text-body-small text-ordift-ink">{f.feedbackText}</p>
                  </div>
                ))}
                <InstructorGiveFeedbackForm submissionId={s.id} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
