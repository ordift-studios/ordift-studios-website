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
  // When a separate agreement is required but the platform cannot produce one
  // (no designated approved template / no issuance flow): why, in words.
  workflowUnavailableReason?: string | null;
};

export type AgreementAssessment = { satisfied: true; basis: "agreement_executed" | "quotation_terms" } | { satisfied: false; blocker: string };

export function assessAgreement(f: AgreementFacts): AgreementAssessment {
  if (f.required) {
    if (f.hasExecutedAgreement) return { satisfied: true, basis: "agreement_executed" };
    if (f.workflowUnavailableReason) {
      return { satisfied: false, blocker: `A separate agreement is required${f.reason ? ` (${f.reason})` : ""} but none can be produced: ${f.workflowUnavailableReason} Clear the requirement to use the standard quotation terms, or resolve what is missing.` };
    }
    return {
      satisfied: false,
      blocker: `A separate agreement is required${f.reason ? ` (${f.reason})` : ""} and none is fully executed yet. Issue it through Legal → Agreements with context “Crew Support request”, or clear the requirement if it no longer applies.`,
    };
  }
  if (hasUsableTerms(f.quotationTerms)) return { satisfied: true, basis: "quotation_terms" };
  return {
    satisfied: false,
    blocker: "No separate agreement is required, so the accepted quotation's own terms are the contract — but this quotation carries no terms text. Mark “Agreement required” or have the quotation's terms completed.",
  };
}

// What the "Contract basis" section tells staff. Presentation only — the
// gate itself is assessAgreement(). Terms are judged on the quotation the
// client sees (accepted, or the live issued/ready/draft one), so a legacy
// quotation with NO terms is reported as incomplete instead of being
// described as a contract.
export type QuotationBasisState = "none" | "pending" | "accepted";
export const MIN_TERMS_LENGTH = 10;

export function hasUsableTerms(terms: string | null): boolean {
  return (terms ?? "").trim().length >= MIN_TERMS_LENGTH;
}

export type ContractBasisView = { tone: "ok" | "incomplete" | "neutral"; headline: string; detail: string };

export function describeContractBasis(params: { required: boolean; reason: string | null; hasExecutedAgreement: boolean; quotation: QuotationBasisState; quotationTerms: string | null; workflowUnavailableReason?: string | null }): ContractBasisView {
  if (params.required) {
    if (!params.hasExecutedAgreement && params.workflowUnavailableReason) {
      return { tone: "incomplete", headline: "Separate agreement required — cannot be produced yet", detail: `${params.reason ? `Reason: ${params.reason}. ` : ""}${params.workflowUnavailableReason} Confirmation is blocked; clear the requirement to use the standard quotation terms.` };
    }
    return params.hasExecutedAgreement
      ? { tone: "ok", headline: "Separate agreement required — fully executed", detail: params.reason ? `Reason: ${params.reason}.` : "" }
      : { tone: "incomplete", headline: "Separate agreement required — not fully executed yet", detail: `${params.reason ? `Reason: ${params.reason}. ` : ""}Confirmation is blocked until it is fully executed.` };
  }
  if (params.quotation === "none") {
    return { tone: "neutral", headline: "No quotation yet", detail: "With no separate agreement required, the accepted quotation and its terms will be the contract." };
  }
  if (!hasUsableTerms(params.quotationTerms)) {
    return { tone: "incomplete", headline: "Contract basis incomplete", detail: "This quotation contains no terms. Complete the quotation terms where permitted, or require a separate agreement, before confirmation." };
  }
  return params.quotation === "accepted"
    ? { tone: "ok", headline: "No separate agreement required", detail: "The accepted quotation and its terms are the contract." }
    : { tone: "neutral", headline: "No separate agreement required", detail: "Once the client accepts, the quotation and its terms will be the contract." };
}

export function validateAgreementRequirementChange(params: { required: boolean; reason: string; requestStatus: string; workflowUnavailableReason?: string | null }): { ok: true } | { ok: false; reason: string } {
  if (["declined", "cancelled", "confirmed"].includes(params.requestStatus)) return { ok: false, reason: "The agreement requirement can't be changed once the request is confirmed or closed." };
  if (params.required && params.workflowUnavailableReason) return { ok: false, reason: `A separate agreement can't be required yet: ${params.workflowUnavailableReason}` };
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
  engagement: { id: string; agreedAmount: number | null; currency: string | null; status: string; paymentObligationId?: string | null } | null;
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
  // From paymentCondition.paymentBlocker(); null/undefined = nothing outstanding.
  paymentBlocker?: string | null;
};

// Every reason this request cannot be confirmed yet. Empty = ready.
// Confirmation is the point of hard commitment: it requires an accepted
// quotation, an agreement basis, accepted crew with known compensation,
// and no firm double-booking.
export function confirmationBlockers(input: ConfirmationInput): string[] {
  const out: string[] = [];
  if (!input.hasAcceptedQuotation) out.push("The client must accept the quotation first (or acceptance must be recorded).");
  if (!input.agreement.satisfied) out.push(input.agreement.blocker);
  // Only a payment the accepted quotation CONTRACTUALLY requires blocks confirmation.
  if (input.paymentBlocker) out.push(input.paymentBlocker);

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

// Authorised manual override: assigning someone WITHOUT a matching active
// capability. Allowed only with a recorded justification (kept on the slot
// with who/when, and in the audit log).
export function validateOverrideReason(reason: string): { ok: true } | { ok: false; reason: string } {
  if (reason.trim().length < 10) return { ok: false, reason: "Assigning someone without a matching capability needs a recorded justification (at least a short sentence — it is kept on the slot and in the audit log)." };
  return { ok: true };
}

// Completed means the crew work is done: every crew member's engagement is
// finished (or was cancelled). QA/test requests never have engagements.
export function completionBlockers(input: { slots: SlotCommitment[]; isTest: boolean }): string[] {
  if (input.isTest) return [];
  const out: string[] = [];
  for (const s of input.slots.filter((x) => x.status === "assigned" && x.assigneeProfileId)) {
    if (!s.engagement) out.push(`${s.label} has no engagement record.`);
    else if (s.engagement.status !== "completed") out.push(`${s.label}: the engagement is “${s.engagement.status.replace(/_/g, " ")}” — finish it (Finance → Payables → Engagements) before completing.`);
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

// Post-confirmation cancellation (management only, justified, reviewed).
export function validateCancellationReason(reason: string): { ok: true } | { ok: false; reason: string } {
  if (reason.trim().length < 10) return { ok: false, reason: "Cancelling a confirmed request needs a recorded justification (at least a short sentence)." };
  return { ok: true };
}

export function isPostCommitmentStatus(status: string): boolean {
  return status === "confirmed" || status === "in_production";
}

export function validateReviewNote(note: string): { ok: true } | { ok: false; reason: string } {
  if (note.trim().length < 10) return { ok: false, reason: "Record what the financial review decided (receivable, payments, crew payables) — at least a short sentence." };
  return { ok: true };
}
