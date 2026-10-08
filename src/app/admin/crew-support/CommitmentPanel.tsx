import ActionForm from "@/components/admin/ActionForm";
import SubmitButton from "@/components/admin/SubmitButton";
import ConfirmSubmitButton from "@/components/admin/ConfirmSubmitButton";
import LocalTime from "@/components/admin/LocalTime";
import type { CommitmentSnapshot } from "@/lib/crewSupport/commitmentData";
import { cancelConfirmedRequestAction, resolveCancellationReviewAction, completeConfirmationAction, markAsTestAction, reevaluateAgreementAction, setAgreementRequiredAction } from "./commitmentActions";

const field = "rounded-lg border border-black/15 bg-white px-3 py-2 font-sans text-body-small text-ordift-ink";
const btn2 = "rounded-lg border border-black/20 px-4 py-2 font-sans text-body-small text-ordift-ink";

// Commitment readiness: everything between "the client accepted" and
// "Ordift has confirmed crew". Staff-only; nothing here reaches the client.
export default function CommitmentPanel({ snapshot, canMarkTest, canCancelConfirmed, canReviewCancellation }: { snapshot: CommitmentSnapshot; canMarkTest: boolean; canCancelConfirmed: boolean; canReviewCancellation: boolean }) {
  const { requestId, status } = snapshot;
  const closed = status === "declined" || status === "cancelled";
  const confirmed = status === "confirmed";
  const assigned = snapshot.slots.filter((s) => s.status === "assigned" && s.assigneeProfileId);
  const ready = snapshot.blockers.length === 0;

  return (
    <section className="rounded-xl border border-black/10 bg-white p-6 space-y-5">
      <div>
        <h2 className="font-serif font-medium text-body text-ordift-ink">Commitment readiness</h2>
        <p className="font-sans text-caption text-ordift-ink-muted mt-1">
          Nothing is reserved or payable until the request is Confirmed. Confirming requires an accepted quotation, a contractual basis, accepted crew with agreed compensation, and no firm double-booking. The client&apos;s price and the crew&apos;s compensation are separate records.
        </p>
        {snapshot.isTest && <p className="mt-2 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 font-sans text-caption text-amber-900">QA / test record — offers and responses work as normal, but no engagement, payable or crew/client email is ever created from it.</p>}
      </div>

      {!closed && (
        confirmed ? (
          <p className="font-sans text-body-small text-green-700">Confirmed. Crew engagements are activated and payables created when a request is confirmed.</p>
        ) : ready ? (
          <p className="font-sans text-body-small text-green-700">Ready to confirm — use “Move this request forward” below.</p>
        ) : (
          <div>
            <p className="font-sans text-caption uppercase tracking-wide text-ordift-ink-muted mb-1">Still needed before confirming</p>
            <ul className="list-disc pl-5 space-y-1 font-sans text-body-small text-ordift-ink">{snapshot.blockers.map((b) => <li key={b}>{b}</li>)}</ul>
          </div>
        )
      )}

      <div className="border-t border-black/5 pt-4 space-y-3">
        <p className="font-sans text-body-small font-medium text-ordift-ink">Contract basis</p>
        <div className={`rounded-lg border px-3 py-2 ${snapshot.contractBasis.tone === "incomplete" ? "border-amber-300 bg-amber-50" : "border-black/10"}`}>
          <p className={`font-sans text-body-small font-medium ${snapshot.contractBasis.tone === "incomplete" ? "text-amber-900" : snapshot.contractBasis.tone === "ok" ? "text-green-700" : "text-ordift-ink"}`}>{snapshot.contractBasis.headline}</p>
          {snapshot.contractBasis.detail && <p className="font-sans text-caption text-ordift-ink-muted mt-0.5">{snapshot.contractBasis.detail}</p>}
        </div>
        {!confirmed && !closed && (
          <div className="flex flex-wrap gap-4">
            {!snapshot.agreementRequired ? (
              !snapshot.agreementWorkflowAvailable ? (
                <p role="status" className="font-sans text-caption text-amber-900 max-w-2xl">
                  “Require a separate agreement” is unavailable. {snapshot.agreementWorkflowExplanation}
                </p>
              ) : (
              <ActionForm action={setAgreementRequiredAction} className="flex flex-wrap items-end gap-2">
                <input type="hidden" name="requestId" value={requestId} /><input type="hidden" name="required" value="true" />
                <label className="font-sans text-caption text-ordift-ink-muted">Why is a separate agreement needed?<input name="reason" required minLength={5} maxLength={300} aria-describedby="agreement-reason-help" className={`${field} block w-72 mt-1`} placeholder="e.g. bespoke licensing / IP terms" /><span id="agreement-reason-help" className="block mt-1 text-ordift-ink-muted">Required — recorded with your name and the time.</span></label>
                <ConfirmSubmitButton confirmMessage="Require a separate signed agreement for this request? It will hold the request in Agreement pending until it is fully executed." pendingLabel="Saving…" className={btn2}>Require an agreement</ConfirmSubmitButton>
              </ActionForm>
              )
            ) : (
              <>
                <ActionForm action={setAgreementRequiredAction} className="flex items-center gap-2">
                  <input type="hidden" name="requestId" value={requestId} /><input type="hidden" name="required" value="false" /><input type="hidden" name="reason" value="" />
                  <ConfirmSubmitButton confirmMessage="Clear the agreement requirement? The accepted quotation and its terms become the contract." pendingLabel="Saving…" className={btn2}>No agreement needed</ConfirmSubmitButton>
                </ActionForm>
                <ActionForm action={reevaluateAgreementAction} className="flex items-center gap-2">
                  <input type="hidden" name="requestId" value={requestId} />
                  <SubmitButton pendingLabel="Checking…" className={btn2}>Re-check agreement status</SubmitButton>
                </ActionForm>
              </>
            )}
          </div>
        )}
      </div>

      <div className="border-t border-black/5 pt-4 space-y-1">
        <p className="font-sans text-body-small font-medium text-ordift-ink">Payment condition</p>
        {!snapshot.hasAcceptedQuotation ? (
          <p className="font-sans text-caption text-ordift-ink-muted">Applies once a quotation is accepted. It is set on the quotation before it is issued.</p>
        ) : snapshot.payment.condition === "none" ? (
          <p className="font-sans text-body-small text-ordift-ink-muted">No payment is required before confirmation — confirmation isn&apos;t held up by payment. (Amount due USD {snapshot.payment.amountDueUsd.toFixed(2)}, received USD {snapshot.payment.amountPaidUsd.toFixed(2)}.)</p>
        ) : (
          <p className={`font-sans text-body-small ${snapshot.payment.blocker && !snapshot.isTest ? "text-amber-900" : "text-green-700"}`}>
            {snapshot.payment.condition === "full" ? "Full payment" : `${snapshot.payment.depositPercent}% deposit`} (USD {snapshot.payment.requiredUsd.toFixed(2)}) required before confirmation — USD {snapshot.payment.amountPaidUsd.toFixed(2)} received of USD {snapshot.payment.amountDueUsd.toFixed(2)} due.
            {snapshot.isTest ? " QA/test record: not enforced, and no payment is created." : snapshot.payment.blocker ? " Not yet satisfied." : " Satisfied."}
          </p>
        )}
      </div>

      <div className="border-t border-black/5 pt-4 space-y-2">
        <p className="font-sans text-body-small font-medium text-ordift-ink">Crew responses</p>
        {assigned.length === 0 && <p className="font-sans text-caption text-ordift-ink-muted">Nobody has accepted a job yet. Send offers in “Crew requirements and assignment” above — a person becomes Assigned only when they accept in their own portal.</p>}
        {assigned.map((s) => (
          <p key={s.slotId} className="font-sans text-body-small text-ordift-ink">
            {s.label} — <span className="text-green-700">accepted in the portal{s.crewAcceptedAt ? <> <LocalTime iso={s.crewAcceptedAt} /></> : ""}</span>
            {s.engagement ? ` · agreed ${s.engagement.currency ?? ""} ${s.engagement.agreedAmount?.toFixed(2) ?? "—"} (engagement ${s.engagement.status.replace(/_/g, " ")})` : snapshot.isTest ? " · compensation audited only (test record)" : ""}
            {s.firmConflicts.length > 0 && <span role="alert" className="block text-caption text-red-700">Double-booking: {s.firmConflicts.join("; ")}</span>}
          </p>
        ))}
        <p className="font-sans text-caption text-ordift-ink-muted">Compensation is held on the person&apos;s engagement (Finance → Payables), created when they accept. It is never the client&apos;s selling price, and no payable exists until the request is Confirmed.</p>
      </div>

      {confirmed && (
        <ActionForm action={completeConfirmationAction} className="flex flex-wrap items-center gap-3 border-t border-black/5 pt-4">
          <input type="hidden" name="requestId" value={requestId} />
          <SubmitButton pendingLabel="Completing…" className={btn2}>Complete confirmation</SubmitButton>
          <span className="font-sans text-caption text-ordift-ink-muted">Safe to repeat: it only creates what is still missing (engagement activation, payable).</span>
        </ActionForm>
      )}

      {(status === "confirmed" || status === "in_production") && (
        <div className="border-t border-black/5 pt-4 space-y-2">
          <p className="font-sans text-body-small font-medium text-ordift-ink">Cancel confirmed request</p>
          {canCancelConfirmed ? (
            <ActionForm action={cancelConfirmedRequestAction} className="flex flex-wrap items-end gap-2">
              <input type="hidden" name="requestId" value={requestId} />
              <label className="font-sans text-caption text-ordift-ink-muted">Justification (required, recorded with your name)<input name="reason" required minLength={10} maxLength={500} className={`${field} block w-96 mt-1`} placeholder="Why is this confirmed request being cancelled?" /></label>
              <ConfirmSubmitButton confirmMessage="Cancel this confirmed request? Crew engagements without payables are cancelled, the client is told, and a financial review is raised. The receivable and any payments are NOT changed automatically." pendingLabel="Cancelling…" className={btn2}>Cancel request</ConfirmSubmitButton>
            </ActionForm>
          ) : (
            <p className="font-sans text-caption text-ordift-ink-muted">Only authorised management (Super Admin or an executive administrator) can cancel a confirmed request.</p>
          )}
        </div>
      )}

      {status === "cancelled" && snapshot.cancellation.reviewStatus !== "not_required" && (
        <div className={`border-t border-black/5 pt-4 space-y-2`}>
          <p className="font-sans text-body-small font-medium text-ordift-ink">Financial review after cancellation</p>
          {snapshot.cancellation.reason && <p className="font-sans text-caption text-ordift-ink-muted">Cancelled{snapshot.cancellation.at ? <> <LocalTime iso={snapshot.cancellation.at} /></> : ""} — {snapshot.cancellation.reason}</p>}
          <p className="font-sans text-caption text-ordift-ink-muted">Amount due USD {snapshot.payment.amountDueUsd.toFixed(2)} · received USD {snapshot.payment.amountPaidUsd.toFixed(2)} · crew payables {snapshot.slots.filter((s) => s.engagement?.paymentObligationId).length}. None of these were changed by the cancellation.</p>
          {snapshot.cancellation.reviewStatus === "resolved" ? (
            <p className="font-sans text-body-small text-green-700">Review recorded{snapshot.cancellation.reviewAt ? <> <LocalTime iso={snapshot.cancellation.reviewAt} /></> : ""}: {snapshot.cancellation.reviewNote}</p>
          ) : canReviewCancellation ? (
            <ActionForm action={resolveCancellationReviewAction} className="flex flex-wrap items-end gap-2">
              <input type="hidden" name="requestId" value={requestId} />
              <label className="font-sans text-caption text-ordift-ink-muted">Review outcome (required)<input name="note" required minLength={10} maxLength={500} className={`${field} block w-96 mt-1`} placeholder="e.g. Deposit retained per terms; crew payable cancelled" /></label>
              <ConfirmSubmitButton confirmMessage="Record this financial review outcome? It doesn't move money — refunds and payable changes are made in Payments and Payables." pendingLabel="Recording…" className={btn2}>Record review</ConfirmSubmitButton>
            </ActionForm>
          ) : (
            <p role="status" className="font-sans text-body-small text-amber-900">Pending — a finance approver must review the receivable, payments received and crew payables.</p>
          )}
        </div>
      )}

      {canMarkTest && !snapshot.isTest && ["received", "under_review", "availability_review", "quote_preparation"].includes(status) && (
        <ActionForm action={markAsTestAction} className="flex flex-wrap items-end gap-2 border-t border-black/5 pt-4">
          <input type="hidden" name="requestId" value={requestId} />
          <label className="font-sans text-caption text-ordift-ink-muted">Super Admin: mark as QA/test record (one-way)<input name="reason" required minLength={5} maxLength={300} className={`${field} block w-80 mt-1`} placeholder="Why is this a test record?" /></label>
          <ConfirmSubmitButton confirmMessage="Mark this request as a QA/test record? It can't be undone. No client/crew emails, engagements or payables will ever be created from it." pendingLabel="Marking…" className={btn2}>Mark as test</ConfirmSubmitButton>
        </ActionForm>
      )}
    </section>
  );
}
