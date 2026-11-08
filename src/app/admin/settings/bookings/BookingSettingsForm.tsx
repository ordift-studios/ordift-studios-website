"use client";

import ActionForm from "@/components/admin/ActionForm";
import SubmitButton from "@/components/admin/SubmitButton";
import { recordBookingSettingsAction } from "./bookingSettingsActions";

const field = "w-full rounded-lg border border-black/15 bg-white px-3 py-2 font-sans text-body-small text-ordift-ink";
const label = "font-sans text-caption text-ordift-ink-muted block mb-1";
export default function BookingSettingsForm({ initial }: { initial: { thresholds: string; alwaysCategories: string; escalators: string } }) {
  return (
    <ActionForm action={recordBookingSettingsAction} className="space-y-4">
      <div><label className={label} htmlFor="bs-thr">Value at or above which an agreement is required (one currency per line, like QAR=3000). A currency with no line always requires an agreement.</label><textarea id="bs-thr" name="thresholds" rows={4} required defaultValue={initial.thresholds} className={field} /></div>
      <div><label className={label} htmlFor="bs-cat">Service categories that always require an agreement (one per line)</label><textarea id="bs-cat" name="alwaysCategories" rows={4} defaultValue={initial.alwaysCategories} className={field} /></div>
      <div><label className={label} htmlFor="bs-esc">Circumstances that make an agreement necessary (one per line)</label><textarea id="bs-esc" name="escalators" rows={5} defaultValue={initial.escalators} className={field} /></div>
      <div><label className={label} htmlFor="bs-status">Status of these rules</label><select id="bs-status" name="status" className={field} defaultValue="provisional"><option value="provisional">Provisional (internal, still to be reviewed)</option><option value="approved">Approved</option></select></div>
      <div><label className={label} htmlFor="bs-note">Why are the rules changing? (kept on the record)</label><textarea id="bs-note" name="note" rows={2} required minLength={10} className={field} /></div>
      <div><label className={label} htmlFor="bs-sentence">To record a new version, type exactly: <span className="font-semibold text-ordift-ink">record new booking rules</span></label><input id="bs-sentence" name="confirmSentence" required autoComplete="off" className={field} /></div>
      <SubmitButton pendingLabel="Recording…" className="min-h-11 px-5 rounded-full bg-ordift-navy-950 text-white font-sans text-body-small">Record as a new version</SubmitButton>
    </ActionForm>
  );
}
