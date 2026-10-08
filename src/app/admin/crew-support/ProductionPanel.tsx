import Link from "next/link";
import type { CommitmentSnapshot } from "@/lib/crewSupport/commitmentData";
import type { AdminDeliverable } from "@/lib/admin/deliverables";

// Production & deliverables for a Crew Support job, built from the
// existing modules — nothing new is stored here. Crew work runs through
// each person's engagement (Finance → Payables → Engagements: status,
// uploads, final approval); what the client receives is published as
// deliverables on the linked enquiry (the same deliverables the client
// portal already shows). The Production board lists the job from the CRM
// stage this request drives.
export default function ProductionPanel({ snapshot, enquiryId, deliverables, handoff }: { snapshot: CommitmentSnapshot; enquiryId: string; deliverables: AdminDeliverable[]; handoff: { media: string | null; raw: string | null } }) {
  const live = ["confirmed", "in_production", "completed"].includes(snapshot.status);
  if (!live) return null;
  const crew = snapshot.slots.filter((s) => s.status === "assigned");
  return (
    <section className="rounded-xl border border-black/10 bg-white p-6 space-y-4" aria-labelledby="production-heading">
      <div>
        <h2 id="production-heading" className="font-serif font-medium text-body text-ordift-ink">Production &amp; deliverables</h2>
        <p className="font-sans text-caption text-ordift-ink-muted mt-1">
          {snapshot.startDate === snapshot.endDate ? snapshot.startDate : `${snapshot.startDate} → ${snapshot.endDate}`}. This job appears on the <Link href="/admin/production" className="text-ordift-gold-pressed underline underline-offset-4">Production board</Link> once booked; crew status below follows each person&apos;s engagement.
        </p>
      </div>

      <div className="space-y-1">
        <p className="font-sans text-body-small font-medium text-ordift-ink">Crew work</p>
        {crew.length === 0 && <p className="font-sans text-caption text-ordift-ink-muted">No accepted crew.</p>}
        {crew.map((s) => (
          <p key={s.slotId} className="font-sans text-body-small text-ordift-ink">
            {s.label} — {s.engagement ? <>engagement {s.engagement.status.replace(/_/g, " ")} · <Link href={`/admin/payables/payees/${s.assigneeProfileId}`} className="text-ordift-gold-pressed underline underline-offset-4">manage engagement &amp; payable</Link> · <Link href={`/admin/payables/engagements/${s.engagement.id}/media`} className="text-ordift-gold-pressed underline underline-offset-4">uploads &amp; approval</Link></> : snapshot.isTest ? "test record — no engagement is created" : "no engagement recorded"}
          </p>
        ))}
        {snapshot.completionBlockers.length > 0 && snapshot.status !== "completed" && (
          <ul className="list-disc pl-5 font-sans text-caption text-ordift-ink-muted">{snapshot.completionBlockers.map((b) => <li key={b}>{b}</li>)}</ul>
        )}
      </div>

      <div className="space-y-1">
        <p className="font-sans text-body-small font-medium text-ordift-ink">Delivered to the client</p>
        {(handoff.media || handoff.raw) && <p className="font-sans text-caption text-ordift-ink-muted">Requester&apos;s handoff expectations: {[handoff.media, handoff.raw ? `RAW files: ${handoff.raw}` : null].filter(Boolean).join(" · ")}</p>}
        {deliverables.length === 0 ? (
          <p className="font-sans text-body-small text-ordift-ink-muted">Nothing published yet. {handoff.media || handoff.raw ? "The requester expects a file handoff — " : ""}publish deliverables on the <Link href={`/admin/enquiries/${enquiryId}`} className="text-ordift-gold-pressed underline underline-offset-4">linked enquiry</Link>; the client sees them in their portal.</p>
        ) : (
          <ul className="list-disc pl-5 font-sans text-body-small text-ordift-ink">{deliverables.map((d) => <li key={d.id}>{d.title} <span className="text-ordift-ink-muted">({d.categoryLabel})</span></li>)}</ul>
        )}
      </div>
    </section>
  );
}
