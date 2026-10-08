import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/portal/roles";
import { getMyCrewJob } from "@/lib/crewSupport/crewOffers";
import CrewJobDetails from "@/components/portal/CrewJobDetails";
import RespondForm from "./RespondForm";

export const metadata: Metadata = { title: "Crew Job — Ordift Studios Portal", robots: { index: false, follow: false } };

export default async function CrewOfferPage({ params }: { params: Promise<{ slotId: string }> }) {
  const { slotId } = await params;
  const user = await getCurrentUser();
  if (!user) redirect(`/portal/login?next=/portal/crew-offers/${slotId}`);
  const job = await getMyCrewJob(slotId, user.id);
  if (!job) notFound();

  return (
    <div className="space-y-6 max-w-3xl">
      <Link href="/portal/crew-offers" className="font-sans text-caption text-ordift-gold-pressed underline underline-offset-4">← My crew jobs</Link>
      <CrewJobDetails job={job} />
      {job.state === "offered" && !job.jobClosed && (
        <div className="rounded-xl border border-black/10 bg-ordift-offwhite p-5 space-y-3">
          <p className="font-sans text-body-small text-ordift-ink">Nothing is confirmed until you accept. Accepting records your agreement to the date and compensation above; Ordift then confirms the job with the client.</p>
          <RespondForm slotId={job.slotId} />
        </div>
      )}
      {job.state === "accepted" && (
        <div role="status" className="rounded-xl border border-green-200 bg-green-50 p-5 font-sans text-body-small text-ordift-ink">
          You accepted this job. {job.engagementId ? <>Your assignment, files and updates are in <Link href={`/portal/collaborator/engagement/${job.engagementId}`} className="text-ordift-gold-pressed underline underline-offset-4">your engagement</Link>.</> : "Ordift will be in touch with the details."}
        </div>
      )}
    </div>
  );
}
