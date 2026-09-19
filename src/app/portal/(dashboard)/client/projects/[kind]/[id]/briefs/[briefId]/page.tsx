import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/portal/roles";
import { isProjectKind } from "@/lib/portal/workspace";
import { getWorkshopRegistrationByIdForUser } from "@/lib/portal/data";
import { createAdminClient } from "@/lib/supabase/admin";
import { listOwnSubmissionsForBrief, listFeedbackForOwnSubmission } from "@/lib/workshops/briefsAndSubmissions";
import { SubmitWorkForm } from "./SubmitWorkForm";

// Workshop Learning Infrastructure V1 (2026-09-19) — a participant's
// own submission(s) and feedback ONLY. listOwnSubmissionsForBrief()/
// listFeedbackForOwnSubmission() both independently re-verify the
// caller's own registration/submission ownership — this page can never
// show another participant's private work by editing the URL's ids.
export default async function BriefDetailTabPage({ params }: { params: Promise<{ kind: string; id: string; briefId: string }> }) {
  const { kind, id, briefId } = await params;
  if (!isProjectKind(kind) || kind !== "workshop") notFound();
  const user = await getCurrentUser();
  if (!user) return null;

  const registration = await getWorkshopRegistrationByIdForUser(id, user.id);
  if (!registration) return null;

  const admin = createAdminClient();
  const { data: brief } = await admin.from("workshop_briefs").select("id, title, instructions, due_at").eq("id", briefId).eq("workshop_id", registration.workshopId).maybeSingle();
  if (!brief) notFound();

  const submissions = await listOwnSubmissionsForBrief(briefId, user.id, registration.workshopId);
  const feedbackBySubmission = new Map(await Promise.all(submissions.map(async (s) => [s.id, await listFeedbackForOwnSubmission(s.id, user.id)] as const)));

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-black/10 bg-white p-6">
        <h2 className="font-serif font-medium text-body text-ordift-ink mb-2">{brief.title}</h2>
        <p className="font-sans text-body-small text-ordift-ink-muted">{brief.instructions}</p>
        {brief.due_at && <p className="font-sans text-caption text-ordift-ink-muted mt-2">Due {new Date(brief.due_at).toLocaleString("en-GB")}</p>}
      </div>

      {submissions.length > 0 && (
        <div className="rounded-xl border border-black/10 bg-white p-6 space-y-4">
          <h3 className="font-serif font-medium text-body text-ordift-ink">Your Submission{submissions.length > 1 ? "s" : ""}</h3>
          {submissions.map((s) => (
            <div key={s.id} className="space-y-2 pb-4 border-b border-black/5 last:border-0 last:pb-0">
              <p className="font-sans text-caption text-ordift-ink-muted">Submitted {new Date(s.submittedAt).toLocaleString("en-GB")}</p>
              {s.note && <p className="font-sans text-body-small text-ordift-ink">{s.note}</p>}
              {s.storagePaths.length > 0 && <p className="font-sans text-caption text-ordift-ink-muted">{s.storagePaths.length} file(s) attached</p>}
              {(feedbackBySubmission.get(s.id) ?? []).map((f) => (
                <div key={f.id} className="rounded-lg bg-ordift-offwhite px-3 py-2">
                  <p className="font-sans text-caption text-ordift-ink-muted uppercase tracking-wide">{f.status.replace(/_/g, " ")} · {new Date(f.createdAt).toLocaleDateString("en-GB")}</p>
                  <p className="font-sans text-body-small text-ordift-ink">{f.feedbackText}</p>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      <div className="rounded-xl border border-black/10 bg-white p-6 space-y-3">
        <h3 className="font-serif font-medium text-body text-ordift-ink">{submissions.length > 0 ? "Submit a Revision" : "Submit Your Work"}</h3>
        <SubmitWorkForm briefId={briefId} kind={kind} projectId={id} />
      </div>
    </div>
  );
}
