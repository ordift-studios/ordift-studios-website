import type { AvailabilityState } from "./availability";

// QUOTATION AVAILABILITY POLICY (pure; no I/O). Before an ordinary quotation is issued, the person says whether it depends on a specific person and service time. If it does, an availability
// assessment is required first; what that assessment says decides how the quotation may be issued. An assessment is NEVER a booking or reservation, and the booking confirmation re-checks
// availability from scratch whatever happened here.
//   independent                      -> issue as normal (the reason is recorded).
//   depends + AVAILABLE (fresh)      -> issue as normal; no availability wording is added (and none may imply more than was checked).
//   depends + TENTATIVE / UNVERIFIED -> issue ONLY as a clearly labelled CONDITIONAL quotation: the standard sentence below is added to the terms and the person acknowledges it.
//   depends + CONFLICTING (firm)     -> refused: a quotation must not imply availability that is known to be blocked. Change the person or the time, check again.
//   depends + no check / stale check -> refused: run (or repeat) the availability check first.
// The policy applies only while the booking schedule is switched on (the check reads it); with the switch off nothing changes.

export const CONDITIONAL_SENTENCE = "Scheduling is subject to confirmation. This quotation does not confirm that any particular date, time or team member is available. A booking is confirmed only when Ordift Studios confirms the schedule in writing.";
export const hasConditionalSentence = (terms: string | null | undefined) => (terms ?? "").includes(CONDITIONAL_SENTENCE);
export const withoutConditionalSentence = (terms: string | null | undefined) => (terms ?? "").replace(CONDITIONAL_SENTENCE, "").replace(/\n{2,}/g, "\n").trim();
export const withConditionalSentence = (terms: string | null | undefined) => { const t = (terms ?? "").trim(); return hasConditionalSentence(t) ? t : (t ? `${t}\n${CONDITIONAL_SENTENCE}` : CONDITIONAL_SENTENCE); };

export const BASES = ["depends", "independent"] as const;
export type Basis = (typeof BASES)[number];
export type LatestCheckFacts = { state: AvailabilityState; at: string; stale: boolean } | null;
export type PolicyInput = { flagOn: boolean; hasEnquiry: boolean; basis: string; independentReason: string; conditionalAck: boolean; latest: LatestCheckFacts };
export type PolicyMode = "not_applicable" | "independent" | "available" | "conditional";
export type PolicyDecision = { ok: true; mode: PolicyMode; conditional: boolean; summary: string } | { ok: false; code: "basis_missing" | "reason_missing" | "check_needed" | "check_stale" | "conflict_known" | "ack_needed"; error: string };

export function decideQuotationAvailability(i: PolicyInput): PolicyDecision {
  if (!i.flagOn) return { ok: true, mode: "not_applicable", conditional: false, summary: "Availability checks are not switched on." };
  if (!(BASES as readonly string[]).includes(i.basis)) return { ok: false, code: "basis_missing", error: "Say whether this quotation depends on a specific person and service time." };
  if (i.basis === "independent") {
    if (i.independentReason.trim().length < 10) return { ok: false, code: "reason_missing", error: "Say why this quotation does not depend on a specific person or time (at least a short sentence)." };
    return { ok: true, mode: "independent", conditional: false, summary: "Recorded as not dependent on a specific person or time." };
  }
  const conditional = (why: string): PolicyDecision => i.conditionalAck
    ? { ok: true, mode: "conditional", conditional: true, summary: `Issued as a conditional quotation: ${why}` }
    : { ok: false, code: "ack_needed", error: "Availability cannot be confirmed, so this can only be issued as a CONDITIONAL quotation. Tick the box to issue it with the sentence “Scheduling is subject to confirmation” added to its terms." };
  if (!i.hasEnquiry) return conditional("it is not linked to an enquiry, so availability could not be checked.");
  if (!i.latest) return { ok: false, code: "check_needed", error: "Run an availability check for this enquiry first (on the enquiry page). The check is not a reservation." };
  if (i.latest.stale) return { ok: false, code: "check_stale", error: "The last availability check is more than 7 days old. Check again first." };
  if (i.latest.state === "conflicting") return { ok: false, code: "conflict_known", error: "The last availability check found a firm conflict for this person and time. A quotation cannot imply availability that is already known to be blocked: change the person or the time and check again." };
  if (i.latest.state === "available") return { ok: true, mode: "available", conditional: false, summary: "Supported by a recent availability check marked Available. It is not a reservation." };
  return conditional(i.latest.state === "tentative" ? "the last check was tentative (not confirmed directly with the person)." : "the last check could not be completed.");
}

// What the issue form tells the person BEFORE they submit (the same decision with the acknowledgement assumed, so the screen can say what will happen).
export type FormOutlook = { outcome: "normal" | "conditional" | "blocked" | "needs_check"; message: string };
export function outlookFor(i: Omit<PolicyInput, "basis" | "independentReason" | "conditionalAck">): FormOutlook {
  if (!i.flagOn) return { outcome: "normal", message: "" };
  const d = decideQuotationAvailability({ ...i, basis: "depends", independentReason: "", conditionalAck: true });
  if (d.ok) return d.mode === "conditional" ? { outcome: "conditional", message: d.summary } : { outcome: "normal", message: d.summary };
  return { outcome: d.code === "conflict_known" ? "blocked" : "needs_check", message: d.error };
}
