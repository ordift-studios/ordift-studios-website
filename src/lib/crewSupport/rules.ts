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
  // Conditional agreement (see commitmentRules.ts): is a separate signed
  // agreement required, and is the contractual basis satisfied (executed
  // agreement, or — when none is required — the accepted quotation's terms)?
  agreementRequired: boolean;
  agreementSatisfied: boolean;
  // Everything still blocking confirmation (accepted crew, known
  // compensation, firm double-bookings, ...). Empty = ready to confirm.
  confirmationBlockers: string[];
};

export const NO_QUOTATION: StatusChangeContext = { hasLiveQuotation: false, hasIssuedQuotation: false, hasAcceptedQuotation: false, agreementRequired: false, agreementSatisfied: false, confirmationBlockers: [] };

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
  if (to === "agreement_pending" && !(context.agreementRequired && !context.agreementSatisfied)) {
    return { ok: false, reason: "No separate agreement is outstanding — Agreement pending only applies when an agreement is required and not yet executed." };
  }
  if (to === "payment_pending" && !context.agreementSatisfied) {
    return { ok: false, reason: "The contractual basis isn't satisfied yet — a required agreement must be fully executed, or the accepted quotation must carry its terms." };
  }
  if (to === "confirmed") {
    const base = canConfirm(slots);
    if (!base.ok) return base;
    if (context.confirmationBlockers.length > 0) return { ok: false, reason: context.confirmationBlockers[0] };
    return { ok: true };
  }
  return { ok: true };
}

export function validateSlotChange(params: {
  requestStatus: CrewSupportStatus;
  status: SlotStatus;
  assigneeProfileId: string | null;
}): { ok: true } | { ok: false; reason: string } {
  if (params.requestStatus === "declined" || params.requestStatus === "cancelled") return { ok: false, reason: "This request is closed — crew can no longer be changed." };
  if (params.requestStatus === "confirmed") return { ok: false, reason: "This request is confirmed — crew engagements and payables now exist, so crew can't be changed here. Cancel the request or handle the replacement through the engagement." };
  if ((params.status === "proposed" || params.status === "assigned") && !params.assigneeProfileId) return { ok: false, reason: "Choose a person to propose or assign." };
  return { ok: true };
}
