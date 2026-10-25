import Link from "next/link";
import { loadWorkflowFacts } from "@/lib/enquiry/workflowFacts";
import { summariseWorkflow, type StepState } from "@/lib/enquiry/workflowSummary";

const DOT: Record<StepState, string> = {
  done: "bg-green-600",
  current: "bg-amber-500",
  pending: "bg-black/20",
  not_applicable: "bg-black/10",
  unknown: "bg-black/10",
};
const WORD: Record<StepState, string> = { done: "Done", current: "In progress", pending: "Not yet", not_applicable: "n/a", unknown: "Unknown" };

// Read-only workflow summary: enquiry, quotation, recorded acceptance, amount due, payment, booking, contracting entity. It restates existing facts only and
// changes nothing; a recorded acceptance is shown as a recorded acceptance, never as a booking.
export default async function WorkflowSummary({ enquiryId, userId, isSuperAdmin }: { enquiryId: string; userId: string; isSuperAdmin: boolean }) {
  const facts = await loadWorkflowFacts(enquiryId, { userId, isSuperAdmin });
  if (!facts) return null;
  const { steps, notes, next } = summariseWorkflow(facts);
  return (
    <section className="rounded-xl border border-black/10 bg-white p-6 space-y-3" aria-label="Workflow summary">
      <h2 className="font-serif font-medium text-body text-ordift-ink">Workflow summary</h2>
      <ol className="space-y-2">
        {steps.map((s) => (
          <li key={s.key} className="flex items-start gap-3">
            <span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${DOT[s.state]}`} aria-hidden="true" />
            <div>
              <p className="font-sans text-body-small text-ordift-ink"><span className="font-medium">{s.label}</span> <span className="text-ordift-ink-muted">· {s.answer ?? WORD[s.state]}</span></p>
              <p className="font-sans text-caption text-ordift-ink-muted">{s.detail}</p>
              {s.href && <Link href={s.href} className="inline-flex min-h-10 items-center font-sans text-caption font-medium text-ordift-ink underline underline-offset-2">{s.hrefLabel ?? "View quotation"}</Link>}
            </div>
          </li>
        ))}
      </ol>
      <div className="rounded-lg border border-black/15 bg-ordift-offwhite px-3 py-2">
        <p className="font-sans text-caption font-medium uppercase tracking-wide text-ordift-ink-muted">Next required action</p>
        <p className="font-sans text-body-small text-ordift-ink">{next}</p>
      </div>
      {notes.map((n) => (
        <p key={n} className="rounded-lg border border-black/10 bg-black/[0.03] px-3 py-2 font-sans text-caption text-ordift-ink-muted">{n}</p>
      ))}
      <p className="font-sans text-caption text-ordift-ink-muted">Read-only. Existing stages keep their meaning; nothing on this panel changes a record.</p>
    </section>
  );
}
