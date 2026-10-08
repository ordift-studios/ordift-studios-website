import ActionForm from "@/components/admin/ActionForm";
import SubmitButton from "@/components/admin/SubmitButton";
import ConfirmSubmitButton from "@/components/admin/ConfirmSubmitButton";
import LocalTime from "@/components/admin/LocalTime";
import type { CommitmentSnapshot } from "@/lib/crewSupport/commitmentData";
import { completeConfirmationAction, markAsTestAction, reevaluateAgreementAction, recordCrewAcceptanceAction, setAgreementRequiredAction } from "./commitmentActions";

const field = "rounded-lg border border-black/15 bg-white px-3 py-2 font-sans text-body-small text-ordift-ink";
const btn = "rounded-lg bg-ordift-ink text-white px-4 py-2 font-sans text-body-small";
const btn2 = "rounded-lg border border-black/20 px-4 py-2 font-sans text-body-small text-ordift-ink";

// Commitment readiness: everything between "the client accepted" and
// "Ordift has confirmed crew". Staff-only; nothing here reaches the client.
export default function CommitmentPanel({ snapshot, currencies, canMarkTest }: { snapshot: CommitmentSnapshot; currencies: { code: string; name: string }[]; canMarkTest: boolean }) {
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
        {snapshot.isTest && <p className="mt-2 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 font-sans text-caption text-amber-900">QA / test record — acceptance is recorded, but no engagement, project access, payable or crew/client email is ever created from it.</p>}
      </div>

      {!closed && (
        confirmed ? (
          <p className="font-sans text-body-small text-green-700">Confirmed. Engagements, project access and payables are established when a request is confirmed.</p>
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
              <ActionForm action={setAgreementRequiredAction} className="flex flex-wrap items-end gap-2">
                <input type="hidden" name="requestId" value={requestId} /><input type="hidden" name="required" value="true" />
                <label className="font-sans text-caption text-ordift-ink-muted">Why is a separate agreement needed?<input name="reason" required minLength={5} maxLength={300} aria-describedby="agreement-reason-help" className={`${field} block w-72 mt-1`} placeholder="e.g. bespoke licensing / IP terms" /><span id="agreement-reason-help" className="block mt-1 text-ordift-ink-muted">Required — recorded with your name and the time.</span></label>
                <ConfirmSubmitButton confirmMessage="Require a separate signed agreement for this request? It will hold the request in Agreement pending until it is fully executed." pendingLabel="Saving…" className={btn2}>Require an agreement</ConfirmSubmitButton>
              </ActionForm>
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

      <div className="border-t border-black/5 pt-4 space-y-3">
        <p className="font-sans text-body-small font-medium text-ordift-ink">Crew acceptance and compensation</p>
        {assigned.length === 0 && <p className="font-sans text-caption text-ordift-ink-muted">Assign people to the slots above first.</p>}
        {assigned.map((s) => (
          <div key={s.slotId} className="rounded-lg border border-black/10 p-3 space-y-2">
            <p className="font-sans text-body-small text-ordift-ink">{s.label}</p>
            {s.crewAccepted ? (
              <p className="font-sans text-caption text-green-700">
                Accepted{s.crewAcceptedAt ? <> <LocalTime iso={s.crewAcceptedAt} /></> : ""}
                {s.engagement ? ` · agreed ${s.engagement.currency ?? ""} ${s.engagement.agreedAmount?.toFixed(2) ?? "—"} (engagement ${s.engagement.status.replace("_", " ")})` : snapshot.isTest ? " · compensation audited only (test record)" : ""}
              </p>
            ) : (
              <p className="font-sans text-caption text-amber-800">Has not accepted yet. Assigned by staff only.</p>
            )}
            {s.firmConflicts.length > 0 && <p role="alert" className="font-sans text-caption text-red-700">Double-booking: {s.firmConflicts.join("; ")}</p>}
            {!confirmed && !closed && (
              <ActionForm action={recordCrewAcceptanceAction} className="grid grid-cols-1 sm:grid-cols-6 gap-2 items-end">
                <input type="hidden" name="requestId" value={requestId} /><input type="hidden" name="slotId" value={s.slotId} />
                <label className="font-sans text-caption text-ordift-ink-muted">Agreed compensation<input name="amount" type="number" step="0.01" min="0" defaultValue={s.engagement?.agreedAmount ?? ""} className={`${field} block w-full mt-1`} /></label>
                <label className="font-sans text-caption text-ordift-ink-muted">Paid in<select name="currency" defaultValue={s.engagement?.currency ?? ""} className={`${field} block w-full mt-1`}><option value="" disabled>Choose…</option>{currencies.map((c) => <option key={c.code} value={c.code}>{c.code}</option>)}</select></label>
                <label className="sm:col-span-3 font-sans text-caption text-ordift-ink-muted">How / when they agreed<input name="note" className={`${field} block w-full mt-1`} placeholder="e.g. Confirmed by WhatsApp on 8 Oct" /></label>
                <SubmitButton pendingLabel="Recording…" className={btn}>{s.crewAccepted ? "Update" : "Record acceptance"}</SubmitButton>
              </ActionForm>
            )}
          </div>
        ))}
        <p className="font-sans text-caption text-ordift-ink-muted">Compensation is held on the person&apos;s engagement (Finance → Payables). It is never the client&apos;s selling price, and no payable is created until the request is Confirmed.</p>
      </div>

      {confirmed && (
        <ActionForm action={completeConfirmationAction} className="flex flex-wrap items-center gap-3 border-t border-black/5 pt-4">
          <input type="hidden" name="requestId" value={requestId} />
          <SubmitButton pendingLabel="Completing…" className={btn2}>Complete confirmation</SubmitButton>
          <span className="font-sans text-caption text-ordift-ink-muted">Safe to repeat: it only creates what is still missing (engagement activation, project access, payable).</span>
        </ActionForm>
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
