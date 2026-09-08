// Ordift Studios — TALENT-SYS-1, Foundation (2026-09-08).
// Pure, zero-import representation-state machine. Orthogonal to
// model_profiles.status (pending/active/inactive, account standing) —
// this tracks whether/how Ordift Studios represents this person.

export const REPRESENTATION_STATUSES = ["unrepresented", "exclusive", "non_exclusive", "lapsed"] as const;
export type RepresentationStatus = (typeof REPRESENTATION_STATUSES)[number];

const VALID_TRANSITIONS: Readonly<Record<RepresentationStatus, readonly RepresentationStatus[]>> = {
  unrepresented: ["exclusive", "non_exclusive"],
  exclusive: ["non_exclusive", "lapsed"],
  non_exclusive: ["exclusive", "lapsed"],
  lapsed: ["unrepresented"],
};

export function isValidRepresentationTransition(from: RepresentationStatus, to: RepresentationStatus): boolean {
  return VALID_TRANSITIONS[from]?.includes(to) ?? false;
}

export function isRepresented(status: RepresentationStatus): boolean {
  return status === "exclusive" || status === "non_exclusive";
}
