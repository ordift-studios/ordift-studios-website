// Ordift Studios Legal Suite — LEGAL-SYS-1, Phase E (2026-09-08).
// Pure, zero-import Agreement lifecycle state machine (Part 12/6).
// Deliberately NOT one generic boolean — every stage is a distinct,
// named status, and only the documented forward transitions are valid.
// Exceptional states (declined/cancelled/expired/superseded/terminated)
// are reachable from multiple normal stages but never from each other,
// and none of them is ever reachable again once reached (terminal).

export const AGREEMENT_LIFECYCLE_STATUSES = [
  "draft",
  "internal_review",
  "approved_for_issue",
  "sent",
  "viewed",
  "changes_requested",
  "accepted_for_signature",
  "partially_signed",
  "fully_executed",
  "active",
  "completed",
  "declined",
  "cancelled",
  "expired",
  "superseded",
  "terminated",
] as const;
export type AgreementLifecycleStatus = (typeof AGREEMENT_LIFECYCLE_STATUSES)[number];

const EXCEPTIONAL_STATUSES = new Set<AgreementLifecycleStatus>(["declined", "cancelled", "expired", "superseded", "terminated"]);
const TERMINAL_STATUSES = new Set<AgreementLifecycleStatus>(["completed", "declined", "cancelled", "expired", "superseded", "terminated"]);

// Normal forward sequence, plus which exceptional states each normal
// stage can additionally fall into. Exceptional states themselves have
// no forward transitions at all — they are terminal.
const VALID_TRANSITIONS: Readonly<Record<AgreementLifecycleStatus, readonly AgreementLifecycleStatus[]>> = {
  draft: ["internal_review", "cancelled"],
  internal_review: ["draft", "approved_for_issue", "cancelled"],
  approved_for_issue: ["sent", "cancelled"],
  sent: ["viewed", "expired", "cancelled"],
  viewed: ["changes_requested", "accepted_for_signature", "declined", "expired", "cancelled"],
  changes_requested: ["draft", "cancelled"],
  accepted_for_signature: ["partially_signed", "fully_executed", "declined", "expired", "cancelled"],
  partially_signed: ["fully_executed", "expired", "cancelled"],
  fully_executed: ["active"],
  active: ["completed", "terminated", "superseded"],
  completed: [],
  declined: [],
  cancelled: [],
  expired: [],
  superseded: [],
  terminated: [],
};

export function isValidAgreementLifecycleTransition(from: AgreementLifecycleStatus, to: AgreementLifecycleStatus): boolean {
  return VALID_TRANSITIONS[from]?.includes(to) ?? false;
}

export function isExceptionalAgreementStatus(status: AgreementLifecycleStatus): boolean {
  return EXCEPTIONAL_STATUSES.has(status);
}

export function isTerminalAgreementStatus(status: AgreementLifecycleStatus): boolean {
  return TERMINAL_STATUSES.has(status);
}

// Part 14 — MASTER != ISSUED AGREEMENT. An agreement is "issued" the
// moment it moves out of draft/internal_review (i.e. reaches
// approved_for_issue or later) — from that point on, later master/
// template revisions must never rewrite it. Exported so callers never
// have to hand-roll this check.
const PRE_ISSUE_STATUSES = new Set<AgreementLifecycleStatus>(["draft", "internal_review"]);
export function isIssuedAgreementStatus(status: AgreementLifecycleStatus): boolean {
  return !PRE_ISSUE_STATUSES.has(status);
}

// Part 18 — the target Finance/Booking gate this phase deliberately
// does NOT wire into any real behavior yet (per explicit instruction:
// "do not activate/change real booking-confirmation behavior... unless
// dormant/non-behavior-changing"). Exported now as the documented,
// testable definition of what "fully executed" means for a future
// booking-gate consumer — calling this function today has no side
// effect and nothing in the codebase calls it to gate anything real.
export function isFullyExecuted(status: AgreementLifecycleStatus): boolean {
  return status === "fully_executed" || status === "active" || status === "completed";
}

// Signature-completion transition defect (2026-09-16) — discovered via
// controlled Production QA (Lady Anim-Tetey's OS-LGL-009A Framework,
// ORD-AGR-2026-000005): recordSignatorySignature() (signatureEngine.ts,
// shared by BOTH the employee and vendor agreement flows) tried a
// single direct transitionAgreementStatus() call straight from
// whatever the agreement's current status happened to be (in practice
// always "sent", since nothing else ever advances the agreement's own
// status as individual signatories view/consent/sign) to
// "fully_executed" — but VALID_TRANSITIONS never allows that as a
// single hop ("sent" only ever leads to viewed/expired/cancelled).
// transitionAgreementStatus() correctly REFUSED (the state machine
// worked exactly as designed), but that refusal was silently
// discarded by the caller, which still returned {ok:true} to the
// signatory — "You have signed this agreement. Thank you." displayed
// successfully even though the agreement's own status update never
// took effect. Real signature evidence was never affected — this is
// purely about the derived agreement.status column catching up to
// evidence that already genuinely exists.
//
// normalForwardPathToFullyExecuted() returns the exact sequence of
// single, individually-valid hops needed to walk an agreement from its
// CURRENT status to fully_executed — e.g. from "sent":
// ["viewed","accepted_for_signature","fully_executed"]. Deliberately
// excludes "changes_requested" and "partially_signed" (an off-ramp and
// an optional intermediate the normal happy-path forward sequence
// still permits skipping directly through, since accepted_for_signature
// already allows fully_executed in one hop) — returns null if `from`
// is not on the normal forward path at all, or is already at/past
// fully_executed.
const NORMAL_FORWARD_SEQUENCE: readonly AgreementLifecycleStatus[] = [
  "draft",
  "internal_review",
  "approved_for_issue",
  "sent",
  "viewed",
  "accepted_for_signature",
  "fully_executed",
];

export function normalForwardPathToFullyExecuted(from: AgreementLifecycleStatus): AgreementLifecycleStatus[] | null {
  const fromIndex = NORMAL_FORWARD_SEQUENCE.indexOf(from);
  if (fromIndex === -1) return null;
  const path = NORMAL_FORWARD_SEQUENCE.slice(fromIndex + 1);
  return path.length > 0 ? path : null;
}
