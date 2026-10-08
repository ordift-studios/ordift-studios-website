import ActionForm from "@/components/admin/ActionForm";
import SubmitButton from "@/components/admin/SubmitButton";
import ConfirmSubmitButton from "@/components/admin/ConfirmSubmitButton";
import LocalTime from "@/components/admin/LocalTime";
import { candidateLabel, type Candidate } from "@/lib/crewSupport/matching";
import { sendCrewOfferAction, setCrewInstructionsAction, withdrawOrReleaseSlotAction } from "./crewOfferActions";

const control = "rounded-lg border border-black/15 bg-white px-3 py-2 font-sans text-body-small text-ordift-ink";
const btn = "rounded-lg bg-ordift-ink text-white px-4 py-2 font-sans text-body-small";
const btn2 = "rounded-lg border border-black/20 px-4 py-2 font-sans text-body-small text-ordift-ink";

export type SlotView = {
  id: string; slotNumber: number; status: string; assigneeProfileId: string | null; assigneeName: string | null; overrideReason: string | null;
  offerAmount: number | null; offerCurrency: string | null; offeredAt: string | null; responseAt: string | null; responseNote: string | null; acceptedAt: string | null; instructions: string | null;
};

// One crew slot. Staff OFFER, withdraw or release; the person themselves
// accepts or declines in their portal — staff cannot do that for them.
export default function SlotOffer({ requestId, role, slot, candidates, overridePool, currencies, locked }: {
  requestId: string; role: string; slot: SlotView; candidates: Candidate[]; overridePool: { profileId: string; name: string; memberNumber: string | null }[]; currencies: { code: string; name: string }[]; locked: boolean;
}) {
  const open = slot.status === "unfilled" || slot.status === "declined" || slot.status === "released";
  return (
    <div className="border-t border-black/5 pt-3 space-y-2">
      <p className="font-sans text-body-small text-ordift-ink">
        {role} {slot.slotNumber} — <strong>{slot.status === "proposed" ? "Offer sent" : slot.status === "assigned" ? "Accepted" : slot.status === "declined" ? "Declined by crew" : "Open"}</strong>
        {slot.assigneeName ? ` · ${slot.assigneeName}` : ""}
      </p>

      {slot.status === "proposed" && (
        <p className="font-sans text-caption text-ordift-ink-muted">
          Offered {slot.offerCurrency} {slot.offerAmount?.toFixed(2)}{slot.offeredAt ? <> <LocalTime iso={slot.offeredAt} /></> : ""} — waiting for {slot.assigneeName ?? "the person"} to respond in their portal. Nobody is reserved by an offer.
        </p>
      )}
      {slot.status === "assigned" && (
        <p className="font-sans text-caption text-green-700">
          Accepted by {slot.assigneeName ?? "the crew member"} in the portal{slot.acceptedAt ? <> <LocalTime iso={slot.acceptedAt} /></> : ""} · agreed {slot.offerCurrency} {slot.offerAmount?.toFixed(2)}{slot.responseNote ? ` · “${slot.responseNote}”` : ""}
        </p>
      )}
      {slot.status === "declined" && (
        <p className="font-sans text-caption text-amber-900">Declined{slot.responseAt ? <> <LocalTime iso={slot.responseAt} /></> : ""}{slot.responseNote ? ` — “${slot.responseNote}”` : ""}. You can offer the slot to someone else.</p>
      )}
      {slot.overrideReason && <p className="font-sans text-caption text-amber-800">Offered by override (no matching capability) — {slot.overrideReason}</p>}

      {!locked && open && (
        <ActionForm action={sendCrewOfferAction} className="grid grid-cols-1 sm:grid-cols-6 gap-2 items-end">
          <input type="hidden" name="requestId" value={requestId} /><input type="hidden" name="slotId" value={slot.id} />
          <label className="sm:col-span-2 font-sans text-caption text-ordift-ink-muted">Offer to
            <select name="assigneeProfileId" defaultValue="" className={`${control} block w-full mt-1`}>
              <option value="">Choose a person…</option>
              {candidates.map((c) => <option key={c.profileId} value={c.profileId}>{candidateLabel(c)}</option>)}
            </select>
          </label>
          <label className="font-sans text-caption text-ordift-ink-muted">Compensation offered<input name="amount" type="number" step="0.01" min="0" className={`${control} block w-full mt-1`} /></label>
          <label className="font-sans text-caption text-ordift-ink-muted">Paid in
            <select name="currency" defaultValue="" className={`${control} block w-full mt-1`}><option value="" disabled>Choose…</option>{currencies.map((c) => <option key={c.code} value={c.code}>{c.code}</option>)}</select>
          </label>
          <label className="sm:col-span-2 font-sans text-caption text-ordift-ink-muted">Message (optional)<input name="message" maxLength={500} className={`${control} block w-full mt-1`} /></label>
          <details className="sm:col-span-6 text-ordift-ink-muted">
            <summary className="cursor-pointer font-sans text-caption">Offer to someone without a matching capability (authorised override)</summary>
            <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2">
              <select name="overrideProfileId" defaultValue="" aria-label={`Override person for ${role} ${slot.slotNumber}`} className={control}>
                <option value="">No override</option>
                {overridePool.map((p) => <option key={p.profileId} value={p.profileId}>{p.name}{p.memberNumber ? ` (${p.memberNumber})` : ""}</option>)}
              </select>
              <input name="overrideReason" minLength={10} maxLength={300} placeholder="Justification (required with an override)" aria-label="Override justification" className={control} />
            </div>
          </details>
          <div className="sm:col-span-6"><SubmitButton pendingLabel="Sending…" className={btn}>Send offer</SubmitButton> <span className="font-sans text-caption text-ordift-ink-muted">The person becomes Assigned only when they accept in their portal. They are emailed a link (test requests are never emailed).</span></div>
        </ActionForm>
      )}

      {!locked && (slot.status === "proposed" || slot.status === "assigned") && (
        <ActionForm action={withdrawOrReleaseSlotAction} className="flex flex-wrap items-end gap-2">
          <input type="hidden" name="requestId" value={requestId} /><input type="hidden" name="slotId" value={slot.id} />
          <label className="font-sans text-caption text-ordift-ink-muted">{slot.status === "proposed" ? "Reason (optional)" : "Reason for releasing (required)"}<input name="reason" required={slot.status === "assigned"} minLength={slot.status === "assigned" ? 5 : undefined} maxLength={300} className={`${control} block w-72 mt-1`} /></label>
          <ConfirmSubmitButton confirmMessage={slot.status === "proposed" ? "Withdraw this offer? The person is told it was withdrawn." : "Release this crew member? Their pending engagement is cancelled and the slot opens again."} pendingLabel="Working…" className={btn2}>{slot.status === "proposed" ? "Withdraw offer" : "Release crew member"}</ConfirmSubmitButton>
        </ActionForm>
      )}

      {!locked && (slot.status === "proposed" || slot.status === "assigned") && (
        <ActionForm action={setCrewInstructionsAction} className="space-y-1">
          <input type="hidden" name="requestId" value={requestId} /><input type="hidden" name="slotId" value={slot.id} />
          <label className="block font-sans text-caption text-ordift-ink-muted">Instructions for this crew member (shown only after they accept — schedule detail, dress, call point, what to bring)
            <textarea name="instructions" rows={2} maxLength={4000} defaultValue={slot.instructions ?? ""} className={`${control} block w-full mt-1`} />
          </label>
          <SubmitButton pendingLabel="Saving…" className={btn2}>Save instructions</SubmitButton>
        </ActionForm>
      )}
    </div>
  );
}
