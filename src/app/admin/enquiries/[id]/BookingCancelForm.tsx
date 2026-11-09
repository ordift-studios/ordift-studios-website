"use client";

import { useState } from "react";
import ActionForm from "@/components/admin/ActionForm";
import SubmitButton from "@/components/admin/SubmitButton";
import { confirmSentenceFor } from "@/lib/bookings/form";
import { cancelBookingAction } from "./bookingActions";

// Super Admin only. Cancelling adds a NEW record (the booking stays in the history, with the accepted quotation and every payment untouched); it never refunds or changes a balance.
// Two outcomes: a new date will be agreed (the project reads "Booking Cancelled — Rescheduling Pending") or the cancellation is final ("Booking Cancelled"). The client is told by default; holding that back needs a written reason.
export default function BookingCancelForm({ enquiryId, reference, expectedVersion }: { enquiryId: string; reference: string; expectedVersion: number }) {
  const field = "w-full rounded-lg border border-black/15 bg-white px-3 py-2 font-sans text-body-small text-ordift-ink";
  const [defer, setDefer] = useState(false);
  const radio = "flex items-start gap-2 font-sans text-body-small text-ordift-ink";
  return (
    <ActionForm action={cancelBookingAction} className="space-y-3">
      <input type="hidden" name="enquiryId" value={enquiryId} />
      <input type="hidden" name="expectedVersion" value={expectedVersion} />
      <fieldset className="space-y-1" data-testid="cancel-outcome">
        <legend className="font-sans text-caption text-ordift-ink-muted mb-1">What kind of cancellation is this?</legend>
        <label className={radio}><input type="radio" name="outcome" value="rescheduling_pending" defaultChecked />A new date will be agreed (the project reads "Booking Cancelled — Rescheduling Pending")</label>
        <label className={radio}><input type="radio" name="outcome" value="final" />Final: no new date (the project reads "Booking Cancelled"; nothing is refunded or closed automatically)</label>
      </fieldset>
      <div>
        <label htmlFor="bk-cancel-reason" className="font-sans text-caption text-ordift-ink-muted block mb-1">Reason for cancelling (at least a sentence; kept on the record)</label>
        <textarea id="bk-cancel-reason" name="reason" required minLength={10} rows={2} className={field} />
      </div>
      <fieldset className="space-y-1" data-testid="cancel-notify">
        <legend className="font-sans text-caption text-ordift-ink-muted mb-1">The client</legend>
        <label className={radio}><input type="radio" name="notifyClient" value="yes" defaultChecked onChange={() => setDefer(false)} />Tell the client now (recommended; the message says which kind of cancellation this is)</label>
        <label className={radio}><input type="radio" name="notifyClient" value="defer" onChange={() => setDefer(true)} />Hold the notice back for now (recorded, with your reason, and shown as an outstanding action)</label>
        {defer ? <div><label htmlFor="bk-cancel-defer" className="font-sans text-caption text-ordift-ink-muted block mb-1">Why the client is not being told yet (kept on the record)</label><textarea id="bk-cancel-defer" name="deferReason" rows={2} className={field} /></div> : null}
      </fieldset>
      <div>
        <label htmlFor="bk-cancel-sentence" className="font-sans text-caption text-ordift-ink-muted block mb-1">To cancel, type exactly: <span className="font-semibold text-ordift-ink">{confirmSentenceFor(reference, "cancel")}</span></label>
        <input id="bk-cancel-sentence" name="confirmSentence" required autoComplete="off" className={field} />
      </div>
      <SubmitButton pendingLabel="Cancelling…" className="min-h-11 px-5 rounded-full border border-red-300 text-red-900 font-sans text-body-small">Cancel this booking</SubmitButton>
    </ActionForm>
  );
}
