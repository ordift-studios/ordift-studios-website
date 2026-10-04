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

export function validateStatusChange(from: CrewSupportStatus, to: CrewSupportStatus, slots: SlotLike[]): { ok: true } | { ok: false; reason: string } {
  if (!allowedStatusTransitions(from).includes(to)) return { ok: false, reason: "That status change isn't allowed from the current status." };
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
