"use client";

import { useActionState } from "react";
import {
  createTicketTypeAction,
  toggleTicketTypeAction,
  createInstructorEngagementAction,
  linkEngagementPayoutObligationAction,
  approveWorkshopObligationAction,
  updateTravelAssistanceStatusAction,
  sendWorkshopNoticeAction,
  type ActionState,
} from "./actions";

// Submission feedback UX correction (2026-09-20) — every consequential
// action on the Workshop Dashboard now follows the same pattern as
// Add Session: immediate pending state, disabled duplicate submit,
// explicit success/error. No business logic changed — each form still
// calls the exact same server action as before.

export function ToggleTicketTypeButton({ ticketTypeId, workshopId, active }: { ticketTypeId: string; workshopId: string; active: boolean }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(toggleTicketTypeAction, null);
  return (
    <form action={formAction}>
      <input type="hidden" name="ticketTypeId" value={ticketTypeId} />
      <input type="hidden" name="workshopId" value={workshopId} />
      <input type="hidden" name="active" value={String(active)} />
      <button type="submit" disabled={pending} className="font-sans text-caption text-ordift-gold-pressed underline underline-offset-4 disabled:opacity-50">
        {pending ? "Saving…" : active ? "Deactivate" : "Reactivate"}
      </button>
      {!pending && state?.ok === false && <p className="font-sans text-[0.65rem] text-red-700">{state.error}</p>}
    </form>
  );
}

export function CreateTicketTypeForm({ workshopId }: { workshopId: string }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(createTicketTypeAction, null);
  return (
    <form action={formAction} className="grid grid-cols-1 sm:grid-cols-3 gap-3">
      <input type="hidden" name="workshopId" value={workshopId} />
      <input name="name" placeholder="Name (e.g. Early Bird)" required className="rounded-lg border border-black/15 px-3 py-1.5 font-sans text-body-small" />
      <input type="number" name="priceUsd" placeholder="Price (USD)" min={0} step="0.01" required className="rounded-lg border border-black/15 px-3 py-1.5 font-sans text-body-small" />
      <input type="number" name="capacity" placeholder="Capacity (optional)" min={1} className="rounded-lg border border-black/15 px-3 py-1.5 font-sans text-body-small" />
      <div className="sm:col-span-3 flex items-center gap-3">
        <button type="submit" disabled={pending} aria-busy={pending} className="justify-self-start font-sans text-body-small font-semibold px-4 py-2 rounded-md bg-ordift-navy-950 text-white disabled:opacity-50">
          {pending ? "Adding ticket type…" : "Add Ticket Type"}
        </button>
        {!pending && state?.ok === false && <p className="font-sans text-caption text-red-700">{state.error}</p>}
        {!pending && state?.ok === true && <p className="font-sans text-caption text-green-700">Added.</p>}
      </div>
    </form>
  );
}

export function CreateInstructorEngagementForm({ workshopId, people }: { workshopId: string; people: { id: string; label: string }[] }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(createInstructorEngagementAction, null);
  return (
    <form action={formAction} className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <input type="hidden" name="workshopId" value={workshopId} />
      <select name="profileId" defaultValue="" className="rounded-lg border border-black/15 bg-white px-2 py-1.5 font-sans text-body-small">
        <option value="">External payee (use name field instead)…</option>
        {people.map((p) => (
          <option key={p.id} value={p.id}>{p.label}</option>
        ))}
      </select>
      <input name="externalPayeeName" placeholder="External payee name (if not staff/contractor)" className="rounded-lg border border-black/15 px-3 py-1.5 font-sans text-body-small" />
      <input name="role" placeholder="Role (e.g. Lead Instructor)" defaultValue="instructor" className="rounded-lg border border-black/15 px-3 py-1.5 font-sans text-body-small" />
      <input type="number" name="agreedCompensationAmount" placeholder="Agreed compensation (optional)" min={0} step="0.01" className="rounded-lg border border-black/15 px-3 py-1.5 font-sans text-body-small" />
      <div className="sm:col-span-2 flex items-center gap-3">
        <button type="submit" disabled={pending} aria-busy={pending} className="justify-self-start font-sans text-body-small font-semibold px-4 py-2 rounded-md bg-ordift-navy-950 text-white disabled:opacity-50">
          {pending ? "Adding engagement…" : "Add Engagement"}
        </button>
        {!pending && state?.ok === false && <p className="font-sans text-caption text-red-700">{state.error}</p>}
        {!pending && state?.ok === true && <p className="font-sans text-caption text-green-700">Added.</p>}
      </div>
    </form>
  );
}

export function LinkPayoutObligationButton({ engagementId, workshopId }: { engagementId: string; workshopId: string }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(linkEngagementPayoutObligationAction, null);
  return (
    <form action={formAction} className="mt-1">
      <input type="hidden" name="engagementId" value={engagementId} />
      <input type="hidden" name="workshopId" value={workshopId} />
      <button type="submit" disabled={pending} className="font-sans text-caption text-ordift-gold-pressed underline underline-offset-4 disabled:opacity-50">
        {pending ? "Creating obligation…" : "Create Payment Obligation"}
      </button>
      {!pending && state?.ok === false && <p className="font-sans text-[0.65rem] text-red-700">{state.error}</p>}
    </form>
  );
}

export function ApproveObligationButton({ obligationId, workshopId }: { obligationId: string; workshopId: string }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(approveWorkshopObligationAction, null);
  return (
    <form action={formAction}>
      <input type="hidden" name="obligationId" value={obligationId} />
      <input type="hidden" name="workshopId" value={workshopId} />
      <button type="submit" disabled={pending} className="font-sans text-caption text-ordift-gold-pressed underline underline-offset-4 disabled:opacity-50">
        {pending ? "Approving…" : "Approve"}
      </button>
      {!pending && state?.ok === false && <p className="font-sans text-[0.65rem] text-red-700">{state.error}</p>}
    </form>
  );
}

export function TravelAssistanceStatusForm({ requestId, workshopId, currentStatus }: { requestId: string; workshopId: string; currentStatus: string }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(updateTravelAssistanceStatusAction, null);
  return (
    <form action={formAction} className="flex flex-wrap items-center gap-2 mt-2">
      <input type="hidden" name="requestId" value={requestId} />
      <input type="hidden" name="workshopId" value={workshopId} />
      <select name="status" defaultValue={currentStatus} disabled={pending} className="rounded-lg border border-black/15 bg-white px-2 py-1 font-sans text-caption disabled:opacity-50">
        <option value="requested">Requested</option>
        <option value="in_progress">In Progress</option>
        <option value="arranged">Arranged</option>
        <option value="declined">Declined</option>
        <option value="cancelled">Cancelled</option>
      </select>
      <button type="submit" disabled={pending} className="font-sans text-caption text-ordift-gold-pressed underline underline-offset-4 disabled:opacity-50">
        {pending ? "Updating & notifying…" : "Update & Notify"}
      </button>
      {!pending && state?.ok === false && <p className="font-sans text-[0.65rem] text-red-700 basis-full">{state.error}</p>}
      {!pending && state?.ok === true && <p className="font-sans text-[0.65rem] text-green-700 basis-full">Updated.</p>}
    </form>
  );
}

export function NotifyRegistrantsForm({ workshopId }: { workshopId: string }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(sendWorkshopNoticeAction, null);
  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="workshopId" value={workshopId} />
      <select name="noticeType" defaultValue="update" disabled={pending} className="rounded-lg border border-black/15 bg-white px-3 py-1.5 font-sans text-body-small disabled:opacity-50">
        <option value="cancelled">Workshop Cancelled</option>
        <option value="rescheduled">Workshop Rescheduled</option>
        <option value="update">General Update</option>
      </select>
      <textarea name="message" required rows={3} placeholder="Message to registrants…" className="w-full rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small" />
      <div className="flex items-center gap-3">
        <button type="submit" disabled={pending} aria-busy={pending} className="font-sans text-body-small font-semibold px-4 py-2 rounded-md bg-ordift-navy-950 text-white disabled:opacity-50">
          {pending ? "Sending notice…" : "Send Notice"}
        </button>
        {!pending && state?.ok === false && <p className="font-sans text-caption text-red-700">{state.error}</p>}
        {!pending && state?.ok === true && <p className="font-sans text-caption text-green-700">Sent.</p>}
      </div>
    </form>
  );
}
