// Crew Support commitment rules — pure and directly testable. These decide
// WHEN a request may move past the commercial stages and become a hard
// commitment (confirmed). Nothing here touches the database.

// ------------------------------------------------------------ agreement
// Conditional agreement model:
//   - Standard Crew Support: the accepted quotation WITH its terms is the
//     contract. No separate signed agreement.
//   - Agreement required (explicit admin decision, with a reason): a real
//     agreement (existing agreements/signature engine, linked through
//     primary_context = crew_support_request) must be fully executed.
export type AgreementFacts = {
  required: boolean;
  reason: string | null;
  hasExecutedAgreement: boolean;
  // The terms text on the ACCEPTED quotation (payment_booking_terms).
  quotationTerms: string | null;
};

export type AgreementAssessment = { satisfied: true; basis: "agreement_executed" | "quotation_terms" } | { satisfied: false; blocker: string };

export function assessAgreement(f: AgreementFacts): AgreementAssessment {
  if (f.required) {
    if (f.hasExecutedAgreement) return { satisfied: true, basis: "agreement_executed" };
    return {
      satisfied: false,
      blocker: `A separate agreement is required${f.reason ? ` (${f.reason})` : ""} and none is fully executed yet. Issue it through Legal → Agreements with context “Crew Support request”, or clear the requirement if it no longer applies.`,
    };
  }
  if ((f.quotationTerms ?? "").trim().length >= 10) return { satisfied: true, basis: "quotation_terms" };
  return {
    satisfied: false,
    blocker: "No separate agreement is required, so the accepted quotation's own terms are the contract — but this quotation carries no terms text. Mark “Agreement required” or have the quotation's terms completed.",
  };
}

export function validateAgreementRequirementChange(params: { required: boolean; reason: string; requestStatus: string }): { ok: true } | { ok: false; reason: string } {
  if (["declined", "cancelled", "confirmed"].includes(params.requestStatus)) return { ok: false, reason: "The agreement requirement can't be changed once the request is confirmed or closed." };
  if (params.required && params.reason.trim().length < 5) return { ok: false, reason: "Say why a separate agreement is needed (for example bespoke terms, licensing/IP, unusual cancellation, higher risk or value)." };
  return { ok: true };
}

// After a quotation is accepted (or the requirement changes) which status
// should the request be in? Used for the automatic move only — staff can
// not pick agreement_pending / payment_pending by hand without the same
// facts being true.
export function statusAfterCommercialAcceptance(agreement: AgreementAssessment): "agreement_pending" | "payment_pending" {
  return agreement.satisfied ? "payment_pending" : "agreement_pending";
}

// ------------------------------------------------------------ crew slots
export type SlotCommitment = {
  slotId: string;
  label: string; // e.g. "Photographer 1 — Kelvin Acheampong"
  status: "unfilled" | "proposed" | "assigned" | "declined" | "released";
  assigneeProfileId: string | null;
  crewAccepted: boolean;
  // The per-person engagement that carries the agreed compensation. Null
  // before one is recorded.
  engagement: { id: string; agreedAmount: number | null; currency: string | null; status: string } | null;
  firmConflicts: string[];
};

export function compensationKnown(s: SlotCommitment, isTest: boolean): boolean {
  // QA/test records never create an engagement (that would email crew and
  // seed a payable), so for them the crew acceptance record is the gate.
  if (isTest) return true;
  return Boolean(s.engagement && s.engagement.status !== "cancelled" && (s.engagement.agreedAmount ?? 0) > 0 && s.engagement.currency);
}

export function validateCrewAcceptanceInput(params: { amount: number; currency: string; note: string }): { ok: true } | { ok: false; reason: string } {
  if (!Number.isFinite(params.amount) || params.amount <= 0) return { ok: false, reason: "Enter the agreed crew compensation (greater than zero)." };
  if (params.amount > 10_000_000) return { ok: false, reason: "That compensation looks too large — check the amount." };
  if (!/^[A-Z]{3}$/.test(params.currency)) return { ok: false, reason: "Choose the currency the crew member will be paid in." };
  if (params.note.trim().length < 5) return { ok: false, reason: "Add a short note on how and when the crew member agreed (for example “confirmed by WhatsApp on 8 Oct”)." };
  return { ok: true };
}

// ------------------------------------------------------- confirmation gate
export type ConfirmationInput = {
  hasAcceptedQuotation: boolean;
  agreement: AgreementAssessment;
  slots: SlotCommitment[];
  isTest: boolean;
};

// Every reason this request cannot be confirmed yet. Empty = ready.
// Confirmation is the point of hard commitment: it requires an accepted
// quotation, an agreement basis, accepted crew with known compensation,
// and no firm double-booking.
export function confirmationBlockers(input: ConfirmationInput): string[] {
  const out: string[] = [];
  if (!input.hasAcceptedQuotation) out.push("The client must accept the quotation first (or acceptance must be recorded).");
  if (!input.agreement.satisfied) out.push(input.agreement.blocker);

  const assigned = input.slots.filter((s) => s.status === "assigned" && s.assigneeProfileId);
  if (assigned.length === 0) out.push("Assign at least one crew member before confirming.");
  if (input.slots.some((s) => s.status === "unfilled" || s.status === "proposed")) out.push("Resolve every open crew slot (assign, decline or release it) before confirming.");
  for (const s of assigned) {
    if (!s.crewAccepted) out.push(`${s.label} hasn't accepted the assignment yet — record their acceptance first.`);
    else if (!compensationKnown(s, input.isTest)) out.push(`${s.label}: the agreed compensation and currency aren't recorded.`);
    if (s.firmConflicts.length > 0) out.push(`${s.label} is already committed elsewhere (${s.firmConflicts.join("; ")}) — resolve the double-booking before confirming.`);
  }
  return out;
}

// Whether a slot's crew acceptance must be cleared by this slot change.
export function clearsCrewAcceptance(params: { previousAssigneeId: string | null; previousStatus: string; nextAssigneeId: string | null; nextStatus: string }): boolean {
  return params.previousAssigneeId !== params.nextAssigneeId || params.nextStatus !== "assigned" || params.previousStatus !== "assigned";
}

// Collaborator workspace access for confirmed crew ends this many days
// after the job's last day (an access window, not a policy on pay).
export const COLLABORATOR_ACCESS_GRACE_DAYS = 7;

export function accessExpiryFor(endDate: string): string {
  const d = new Date(`${endDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + COLLABORATOR_ACCESS_GRACE_DAYS);
  return d.toISOString();
}
