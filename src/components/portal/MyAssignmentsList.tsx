import Link from "next/link";
import type { CrewJobView } from "@/lib/crewSupport/crewOfferRules";
import { describeAssignment, groupAssignments } from "@/lib/crewSupport/assignmentStatus";

// One list for every place a professional looks for their jobs (the portal and the Admin Platform's
// My Workspace). It only ever receives the signed-in person's OWN jobs, already filtered by assignee,
// and shows nothing about the client beyond what the job view already allows.
const when = (j: Pick<CrewJobView, "startDate" | "endDate">) => (j.startDate === j.endDate ? j.startDate : `${j.startDate} → ${j.endDate}`);

type Chip = { state: string; label: string };
const CHIP_TONE: Record<string, string> = { ready: "border-green-200 bg-green-50 text-green-900", need_assistance: "border-blue-200 bg-blue-50 text-blue-900", not_ready: "border-red-200 bg-red-50 text-red-900" };

function Card({ job, today, href, chip }: { job: CrewJobView; today: string; href: string; chip?: Chip }) {
  const s = describeAssignment(job, today);
  return (
    <li>
      <Link href={href} className="block rounded-2xl border border-black/10 bg-white p-5 transition-colors hover:border-ordift-gold">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="font-sans text-body-small font-medium text-ordift-ink">{job.projectName} · {job.role}</p>
          <span className="rounded-full border border-black/10 bg-ordift-offwhite px-2.5 py-0.5 font-sans text-caption text-ordift-ink">{s.status}</span>
        </div>
        <p className="mt-1 font-sans text-caption text-ordift-ink-muted">{job.requestReference} · {job.serviceLabel} · {when(job)} · {job.location}</p>
        <p className="mt-2 font-sans text-caption text-ordift-ink">Next: {s.nextAction}</p>
        {chip && <p className="mt-2"><span className={`rounded-full border px-2.5 py-0.5 font-sans text-caption ${CHIP_TONE[chip.state] ?? "border-amber-200 bg-amber-50 text-amber-900"}`}>Readiness: {chip.label}</span></p>}
      </Link>
      {job.engagementId && s.group === "active" && (
        <p className="mt-1 px-1 font-sans text-caption">
          <Link href={`/portal/collaborator/engagement/${job.engagementId}`} className="text-ordift-gold-pressed underline underline-offset-4">Your files &amp; job report →</Link>
        </p>
      )}
    </li>
  );
}

function Section({ title, empty, jobs, today, hrefFor, chips }: { title: string; empty: string; jobs: CrewJobView[]; today: string; hrefFor: (j: CrewJobView) => string; chips?: Record<string, Chip> }) {
  return (
    <section>
      <h2 className="mb-3 font-serif text-body font-medium text-ordift-ink">{title}</h2>
      {jobs.length === 0 ? <p className="font-sans text-body-small text-ordift-ink-muted">{empty}</p> : <ul className="space-y-3">{jobs.map((j) => <Card key={j.slotId} job={j} today={today} href={hrefFor(j)} chip={chips?.[j.slotId]} />)}</ul>}
    </section>
  );
}

export default function MyAssignmentsList({ jobs, today, hrefFor, chips }: { jobs: CrewJobView[]; today: string; hrefFor: (job: CrewJobView) => string; chips?: Record<string, Chip> }) {
  const { offers, active, closed } = groupAssignments(jobs, today);
  return (
    <div className="space-y-10">
      <Section title="Waiting for your response" empty="No offers are waiting." jobs={offers} today={today} hrefFor={hrefFor} />
      <Section title="Accepted and active" empty="None yet." jobs={active} today={today} hrefFor={hrefFor} chips={chips} />
      <Section title="Closed" empty="Nothing closed yet." jobs={closed} today={today} hrefFor={hrefFor} />
    </div>
  );
}
