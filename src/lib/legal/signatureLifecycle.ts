// Ordift Studios Legal Suite — LEGAL-SYS-1, Phase F (2026-09-08).
// Pure, zero-import Signature Engine state machine. Two levels:
// per-signatory status, and a request-level status DERIVED from its
// signatories' statuses (never set arbitrarily by a caller).

export const SIGNATORY_STATUSES = ["pending", "viewed", "consented", "signed", "declined", "expired", "revoked"] as const;
export type SignatoryStatus = (typeof SIGNATORY_STATUSES)[number];

const TERMINAL_SIGNATORY_STATUSES = new Set<SignatoryStatus>(["signed", "declined", "expired", "revoked"]);

// Consent must precede signature (continuation authorization message:
// "viewed/consent/signature events" as a strict evidentiary sequence)
// — a signatory can never move directly from "viewed" to "signed".
const VALID_SIGNATORY_TRANSITIONS: Readonly<Record<SignatoryStatus, readonly SignatoryStatus[]>> = {
  pending: ["viewed", "expired", "revoked"],
  viewed: ["consented", "declined", "expired", "revoked"],
  consented: ["signed", "declined", "expired", "revoked"],
  signed: [],
  declined: [],
  expired: [],
  revoked: [],
};

export function isValidSignatoryTransition(from: SignatoryStatus, to: SignatoryStatus): boolean {
  return VALID_SIGNATORY_TRANSITIONS[from]?.includes(to) ?? false;
}

export function isTerminalSignatoryStatus(status: SignatoryStatus): boolean {
  return TERMINAL_SIGNATORY_STATUSES.has(status);
}

export const SIGNATURE_REQUEST_STATUSES = [
  "created",
  "sent",
  "in_progress",
  "completed",
  "declined",
  "expired",
  "revoked",
  "cancelled",
] as const;
export type SignatureRequestStatus = (typeof SIGNATURE_REQUEST_STATUSES)[number];

// Pure aggregation — the request-level status is always DERIVED from
// its signatories, never an independent value a caller can set
// directly (aside from the exceptional revoked/cancelled states, which
// are explicit administrative actions applied to the whole request).
export function deriveSignatureRequestStatus(signatories: readonly { status: SignatoryStatus }[]): SignatureRequestStatus {
  if (signatories.length === 0) return "created";
  if (signatories.some((s) => s.status === "revoked")) return "revoked";
  if (signatories.some((s) => s.status === "declined")) return "declined";
  if (signatories.every((s) => s.status === "signed")) return "completed";
  if (signatories.every((s) => s.status === "expired")) return "expired";
  if (signatories.some((s) => s.status !== "pending")) return "in_progress";
  return "sent";
}

// The document-execution traceability chain's completion trigger
// (continuation authorization message): true only when every
// signatory on the request has actually reached "signed" — never
// approximated from the request-level status alone.
export function isFullyExecutedBySignatories(signatories: readonly { status: SignatoryStatus }[]): boolean {
  return signatories.length > 0 && signatories.every((s) => s.status === "signed");
}
