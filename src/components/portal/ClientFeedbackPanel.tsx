import type { ProfessionalFeedback } from "@/lib/crewSupport/clientResponses";

// Shown to the ASSIGNED PROFESSIONAL on their own engagement only: what the client said about this assignment. Display only.
const fmt = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

export default function ClientFeedbackPanel({ feedback }: { feedback: ProfessionalFeedback }) {
  return (
    <section className="bg-white border border-black/10 rounded-2xl p-6 space-y-3" aria-labelledby="client-feedback-heading">
      <h2 id="client-feedback-heading" className="font-serif font-medium text-body text-ordift-ink">What the client said</h2>
      <ul className="font-sans text-body-small text-ordift-ink space-y-1">
        <li>{feedback.receiptAt ? `✓ Confirmed receipt on ${fmt(feedback.receiptAt)}` : "Receipt not yet confirmed"}</li>
        <li>{feedback.acceptedAt ? `✓ Accepted the delivery on ${fmt(feedback.acceptedAt)}` : "Delivery not yet accepted"}</li>
        {feedback.correctionRequests > 0 && <li>The client asked for corrections ({feedback.correctionRequests}).</li>}
      </ul>
      {feedback.rating && (
        <div className="rounded-lg bg-ordift-offwhite p-4 space-y-2">
          <p className="font-sans text-body-small text-ordift-ink">
            Overall experience: <strong>{feedback.rating.overall !== null ? `${feedback.rating.overall}/10` : "—"}</strong> <span className="text-ordift-ink-muted">({fmt(feedback.rating.at)})</span>
          </p>
          {feedback.rating.categories.length > 0 && (
            <p className="font-sans text-caption text-ordift-ink-muted">{feedback.rating.categories.map((c) => `${c.label} ${c.value}/10`).join(" · ")}</p>
          )}
          {feedback.rating.comment && <p className="font-sans text-body-small text-ordift-ink">“{feedback.rating.comment}”</p>}
        </div>
      )}
    </section>
  );
}
