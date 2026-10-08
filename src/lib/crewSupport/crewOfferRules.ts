// Crew assignment offers — pure rules. Lifecycle of a slot's person:
//
//   unfilled ──offer──▶ proposed ──crew accepts (portal)──▶ assigned (accepted)
//                          │  └──crew declines (portal)──▶ declined
//                          └──staff withdraws────────────▶ unfilled
//
// 'assigned' therefore means "the crew member accepted", never merely
// "staff picked someone". Staff can offer, withdraw and release; only the
// crew member can accept or decline their own offer.

export const OFFERABLE_SLOT_STATUSES = ["unfilled", "declined", "released"] as const;
export const OFFER_OPEN_REQUEST_STATUSES = ["received", "under_review", "availability_review", "quote_preparation", "quoted", "agreement_pending", "payment_pending"] as const;

export function canSendOffer(params: { slotStatus: string; requestStatus: string }): { ok: true } | { ok: false; reason: string } {
  if (!(OFFER_OPEN_REQUEST_STATUSES as readonly string[]).includes(params.requestStatus)) {
    return { ok: false, reason: ["confirmed", "in_production", "completed"].includes(params.requestStatus) ? "This request is confirmed — crew can no longer be changed here." : "This request is closed." };
  }
  if (params.slotStatus === "proposed") return { ok: false, reason: "An offer is already waiting for a response — withdraw it first to offer someone else." };
  if (params.slotStatus === "assigned") return { ok: false, reason: "This slot is filled by a crew member who accepted — release them first to offer someone else." };
  if (!(OFFERABLE_SLOT_STATUSES as readonly string[]).includes(params.slotStatus)) return { ok: false, reason: "This slot can't take an offer right now." };
  return { ok: true };
}

export function validateOfferInput(params: { amount: number; currency: string; message: string }): { ok: true } | { ok: false; reason: string } {
  if (!Number.isFinite(params.amount) || params.amount <= 0) return { ok: false, reason: "Enter the compensation you are offering (greater than zero)." };
  if (params.amount > 10_000_000) return { ok: false, reason: "That compensation looks too large — check the amount." };
  if (!/^[A-Z]{3}$/.test(params.currency)) return { ok: false, reason: "Choose the currency the person will be paid in." };
  if (params.message.length > 500) return { ok: false, reason: "Keep the message to 500 characters." };
  return { ok: true };
}

// Can THIS user respond to THIS slot right now? Ownership is the assignee,
// the offer must still be open, and the request must not have moved on.
export function canRespondToOffer(params: { userId: string; assigneeProfileId: string | null; slotStatus: string; requestStatus: string }): { ok: true } | { ok: false; reason: string } {
  if (!params.assigneeProfileId || params.assigneeProfileId !== params.userId) return { ok: false, reason: "This offer isn't available." };
  if (params.slotStatus !== "proposed") return { ok: false, reason: "This offer is no longer open." };
  if (!(OFFER_OPEN_REQUEST_STATUSES as readonly string[]).includes(params.requestStatus)) return { ok: false, reason: "This offer is no longer open." };
  return { ok: true };
}

export type CrewJobView = {
  slotId: string;
  state: "offered" | "accepted" | "declined";
  requestReference: string;
  role: string;
  responsibilities: string | null;
  projectName: string;
  projectType: string | null;
  serviceLabel: string;
  startDate: string;
  endDate: string;
  callTime: string | null;
  finishTime: string | null;
  location: string;
  urgency: string;
  equipment: string | null;
  offer: { amount: number; currency: string; message: string | null; offeredAt: string | null } | null;
  respondedAt: string | null;
  responseNote: string | null;
  // Revealed only to the person who ACCEPTED:
  instructions: string | null;
  onSiteContact: string | null;
  engagementId: string | null;
  jobClosed: boolean;
};

type SlotRow = { id: string; status: string; offer_amount: number | string | null; offer_currency: string | null; offer_message: string | null; offered_at: string | null; crew_response_at: string | null; crew_response_note: string | null; crew_instructions: string | null };
type RequestRow = { reference_number: string; project_name: string; project_type: string | null; service_family: string; start_date: string; end_date: string; call_time: string | null; finish_time: string | null; location: string; urgency: string; on_site_contact: string | null; status: string };

// Strict whitelist projection: the crew member's view of a job. It never
// contains the client's identity or contact details, the requester's
// budget or notes, the quotation or any client money, or other crew.
export function toCrewJobView(params: { slot: SlotRow; request: RequestRow; role: string; responsibilities: string | null; serviceLabel: string; equipment: string | null; engagementId: string | null }): CrewJobView {
  const { slot, request } = params;
  const accepted = slot.status === "assigned";
  return {
    slotId: slot.id,
    state: accepted ? "accepted" : slot.status === "declined" ? "declined" : "offered",
    requestReference: request.reference_number,
    role: params.role,
    responsibilities: params.responsibilities,
    projectName: request.project_name,
    projectType: request.project_type,
    serviceLabel: params.serviceLabel,
    startDate: request.start_date,
    endDate: request.end_date,
    callTime: request.call_time,
    finishTime: request.finish_time,
    location: request.location,
    urgency: request.urgency,
    equipment: params.equipment,
    offer: slot.offer_amount == null || !slot.offer_currency ? null : { amount: Number(slot.offer_amount), currency: slot.offer_currency, message: slot.offer_message, offeredAt: slot.offered_at },
    respondedAt: slot.crew_response_at,
    responseNote: slot.crew_response_note,
    instructions: accepted ? slot.crew_instructions : null,
    onSiteContact: accepted ? request.on_site_contact : null,
    engagementId: accepted ? params.engagementId : null,
    jobClosed: ["declined", "cancelled", "completed"].includes(request.status),
  };
}

export function validateInstructions(text: string): { ok: true } | { ok: false; reason: string } {
  if (text.length > 4000) return { ok: false, reason: "Keep the instructions to 4,000 characters." };
  return { ok: true };
}
