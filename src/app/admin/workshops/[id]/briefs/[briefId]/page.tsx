import type { Metadata } from "next";
import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { getCurrentUser, isStaffOrAdmin } from "@/lib/portal/roles";
import { authorizeWithSuperAdminOverride, OPERATIONS_CAPABILITIES } from "@/lib/organization/authority";
import { getWorkshopByIdAdmin } from "@/lib/content/sanity/workshopAdmin";
import { createAdminClient } from "@/lib/supabase/admin";
import { listSubmissionsForBriefAsAdmin, listFeedbackForSubmissionAsAdmin } from "@/lib/workshops/briefsAndSubmissions";
import { GiveFeedbackForm } from "./GiveFeedbackForm";

export const metadata: Metadata = {
  title: "Brief — Workshop Management — Ordift Studios Admin",
  robots: { index: false, follow: false },
};

// Workshop Learning Infrastructure V1 (2026-09-19) — admin oversight of
// submissions/feedback for one brief. Read/write both gated on
// operations.workshop.administer (or Super Admin) — the same
// jurisdiction every other write on the Workshop Dashboard already
// uses; this is not a new authorization concept.
export default async function AdminBriefDetailPage({ params }: { params: Promise<{ id: string; briefId: string }> }) {
  const { id, briefId } = await params;
  const user = await getCurrentUser();
  if (!user || !isStaffOrAdmin(user)) redirect("/admin/overview");
  const canManageWorkshop = (await authorizeWithSuperAdminOverride(user.id, OPERATIONS_CAPABILITIES.workshopAdminister)).ok;
  if (!canManageWorkshop) redirect(`/admin/workshops/${id}`);

  const workshop = await getWorkshopByIdAdmin(id);
  if (!workshop) notFound();

  const admin = createAdminClient();
  const { data: brief } = await admin.from("workshop_briefs").select("id, title, instructions, due_at").eq("id", briefId).eq("workshop_id", id).maybeSingle();
  if (!brief) notFound();

  const submissions = await listSubmissionsForBriefAsAdmin(briefId, user.id);
  const feedbackBySubmission = new Map(await Promise.all(submissions.map(async (s) => [s.id, await listFeedbackForSubmissionAsAdmin(s.id, user.id)] as const)));

  return (
    <div className="space-y-8">
      <div>
        <Link href={`/admin/workshops/${id}`} className="font-sans text-caption text-ordift-ink-muted hover:text-ordift-ink">
          ← {workshop.title}
        </Link>
        <h1 className="font-serif font-medium text-section-heading lg:text-section-heading-desktop text-ordift-ink mt-2">{brief.title}</h1>
        <p className="font-sans text-body-small text-ordift-ink-muted mt-2 max-w-3xl">{brief.instructions}</p>
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
                  {s.participantName} <span className="font-normal text-ordift-ink-muted">· submitted {new Date(s.submittedAt).toLocaleString("en-GB")}</span>
                </p>
                {s.note && <p className="font-sans text-body-small text-ordift-ink-muted">{s.note}</p>}
                {s.storagePaths.length > 0 && <p className="font-sans text-caption text-ordift-ink-muted">{s.storagePaths.length} file(s) attached</p>}

                {(feedbackBySubmission.get(s.id) ?? []).map((f) => (
                  <div key={f.id} className="rounded-lg bg-ordift-offwhite px-3 py-2">
                    <p className="font-sans text-caption text-ordift-ink-muted uppercase tracking-wide">{f.status.replace(/_/g, " ")} · {new Date(f.createdAt).toLocaleDateString("en-GB")}</p>
                    <p className="font-sans text-body-small text-ordift-ink">{f.feedbackText}</p>
                  </div>
                ))}

                <GiveFeedbackForm workshopId={id} briefId={briefId} submissionId={s.id} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
