import type { CrewJobView } from "@/lib/crewSupport/crewOfferRules";

// What a crew member may see about a job: the assignment itself — role,
// schedule, place, equipment, responsibilities, their own offered pay and
// (after accepting) staff instructions and the on-site contact. Never the
// client's identity or contact details, the budget, the quotation or any
// client money, or anyone else's assignment.
export default function CrewJobDetails({ job }: { job: CrewJobView }) {
  const dates = job.startDate === job.endDate ? job.startDate : `${job.startDate} → ${job.endDate}`;
  const times = [job.callTime, job.finishTime].filter(Boolean).join(" → ");
  const row = (label: string, value: string | null) => value ? <div><dt className="font-sans text-caption uppercase tracking-wide text-ordift-ink-muted">{label}</dt><dd className="font-sans text-body-small text-ordift-ink mt-0.5 whitespace-pre-line">{value}</dd></div> : null;
  return (
    <div className="bg-white border border-black/10 rounded-2xl p-6 space-y-4">
      <div>
        <p className="font-sans text-caption uppercase tracking-wide text-ordift-ink-muted">{job.serviceLabel} · {job.requestReference}</p>
        <h1 className="font-serif font-medium text-section-heading text-ordift-ink">{job.role}</h1>
        {job.jobClosed && <p className="font-sans text-caption text-red-700 mt-1">This job has been closed by Ordift.</p>}
      </div>
      <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {row("Project", `${job.projectName}${job.projectType ? ` — ${job.projectType}` : ""}`)}
        {row("Date", dates)}
        {row("Call / finish", times || null)}
        {row("Location", job.location)}
        {row("Equipment", job.equipment)}
        {row("Urgency", job.urgency)}
        {row("What you'll do", job.responsibilities)}
        {job.offer && row(job.state === "accepted" ? "Agreed compensation" : "Compensation offered", `${job.offer.currency} ${job.offer.amount.toFixed(2)}`)}
        {row("Message from Ordift", job.offer?.message ?? null)}
        {row("Instructions", job.instructions)}
        {row("On-site contact", job.onSiteContact)}
      </dl>
    </div>
  );
}
