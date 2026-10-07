import { allowedStatusTransitions, type CrewSupportStatus, type SlotStatus } from "./config";

export type SlotLike = { status: SlotStatus; assigneeProfileId: string | null };

// Confirming a request is a genuine staff decision: at least one person
// must actually be assigned, and no slot may be left open (unfilled or
// merely proposed). Declined/released slots count as resolved — staff
// may confirm a smaller crew than first requested.
export function canConfirm(slots: SlotLike[]): { ok: true } | { ok: false; reason: string } {
  if (!slots.some((s) => s.status === "assigned" && s.assigneeProfileId)) return { ok: false, reason: "Assign at least one crew member before confirming." };
  if (slots.some((s) => s.status === "unfilled" || s.status === "proposed")) return { ok: false, reason: "Resolve every open crew slot (assign, decline or release it) before confirming." };
  return { ok: true };
}

export type StatusChangeContext = {
  // Facts about the request's linked quotation, supplied by the caller
  // from real data. A status that asserts a business event is only
  // reachable when that event actually happened.
  hasLiveQuotation: boolean; // a draft/ready/sent/accepted quotation is linked
  hasIssuedQuotation: boolean; // a linked quotation has been issued (sent) or accepted
  hasAcceptedQuotation: boolean; // the linked quotation has been accepted
};

export const NO_QUOTATION: StatusChangeContext = { hasLiveQuotation: false, hasIssuedQuotation: false, hasAcceptedQuotation: false };

export function validateStatusChange(
  from: CrewSupportStatus,
  to: CrewSupportStatus,
  slots: SlotLike[],
  context: StatusChangeContext = NO_QUOTATION
): { ok: true } | { ok: false; reason: string } {
  if (!allowedStatusTransitions(from).includes(to)) return { ok: false, reason: "That status change isn't allowed from the current status." };
  if (to === "quote_preparation" && !context.hasLiveQuotation) {
    return { ok: false, reason: "Quote preparation starts when you use “Prepare quotation” — it can't be selected by hand." };
  }
  if (to === "quoted" && !context.hasIssuedQuotation) {
    return { ok: false, reason: "Quote issued happens when a prepared quotation is actually issued — it can't be selected by hand." };
  }
  if ((to === "agreement_pending" || to === "payment_pending") && !context.hasAcceptedQuotation) {
    return { ok: false, reason: "The client must accept the quotation first (or acceptance must be recorded)." };
  }
  if (to === "confirmed") return canConfirm(slots);
  return { ok: true };
}

export function validateSlotChange(params: {
  requestStatus: CrewSupportStatus;
  status: SlotStatus;
  assigneeProfileId: string | null;
}): { ok: true } | { ok: false; reason: string } {
  if (params.requestStatus === "declined" || params.requestStatus === "cancelled") return { ok: false, reason: "This request is closed — crew can no longer be changed." };
  if ((params.status === "proposed" || params.status === "assigned") && !params.assigneeProfileId) return { ok: false, reason: "Choose a person to propose or assign." };
  return { ok: true };
}
