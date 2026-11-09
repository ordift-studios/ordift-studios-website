"use client";

import ActionForm from "@/components/admin/ActionForm";
import SubmitButton from "@/components/admin/SubmitButton";
import { confirmSentenceFor } from "@/lib/bookings/form";
import { cancelBookingAction } from "./bookingActions";

// Super Admin only. Cancelling adds a NEW record (the booking stays in the history); it does not refund, invoice or email anyone.
export default function BookingCancelForm({ enquiryId, reference, expectedVersion }: { enquiryId: string; reference: string; expectedVersion: number }) {
  const field = "w-full rounded-lg border border-black/15 bg-white px-3 py-2 font-sans text-body-small text-ordift-ink";
  return (
    <ActionForm action={cancelBookingAction} className="space-y-3">
      <input type="hidden" name="enquiryId" value={enquiryId} />
      <input type="hidden" name="expectedVersion" value={expectedVersion} />
      <div>
        <label htmlFor="bk-cancel-reason" className="font-sans text-caption text-ordift-ink-muted block mb-1">Reason for cancelling (at least a sentence; kept on the record)</label>
        <textarea id="bk-cancel-reason" name="reason" required minLength={10} rows={2} className={field} />
      </div>
      <div>
        <label htmlFor="bk-cancel-sentence" className="font-sans text-caption text-ordift-ink-muted block mb-1">To cancel, type exactly: <span className="font-semibold text-ordift-ink">{confirmSentenceFor(reference, "cancel")}</span></label>
        <input id="bk-cancel-sentence" name="confirmSentence" required autoComplete="off" className={field} />
      </div>
      <p className="font-sans text-caption text-ordift-ink-muted">Cancelling keeps the accepted quotation and every payment as they are and sends no notice yet: tell the client yourself. The project then reads "Booking Cancelled — Rescheduling Pending".</p>
      <SubmitButton pendingLabel="Cancelling…" className="min-h-11 px-5 rounded-full border border-red-300 text-red-900 font-sans text-body-small">Cancel this booking</SubmitButton>
    </ActionForm>
  );
}
