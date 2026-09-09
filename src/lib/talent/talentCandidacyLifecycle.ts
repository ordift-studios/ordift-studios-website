// Ordift Talent — Opportunity Candidacy (2026-09-09).
// Pure, zero-import candidacy lifecycle for talent_opportunity_candidates.
// Same shape as talentOpportunityLifecycle.ts. Statuses and their
// business meaning are Founder-approved (not invented here):
//
// candidate    — internally added for consideration; no contact implied.
// shortlisted  — identified as a serious candidate.
// contacted    — Ordift has approached the talent about this opportunity.
// selected     — selected for the opportunity; no booking/engagement is
//                implied or created by this status alone.
// booked       — candidacy resulted in confirmed work. Candidacy-lifecycle
//                state ONLY at this milestone — reaching "booked" never
//                creates an engagement/payment_obligation; that remains a
//                separate, deliberate, later staff action through the
//                existing engagements/Universal Payables architecture.
// declined     — Ordift/client decided not to proceed.
// unavailable  — the talent cannot participate.
// withdrawn    — the talent withdrew from consideration.
//
// Transitions are deliberately linear with exit points, not an open
// graph: candidate -> shortlisted -> contacted -> selected -> booked is
// the only forward path (no skipping straight to "selected" or
// "booked"), and declined/unavailable/withdrawn are reachable from any
// non-terminal state as an exit — matching this project's other
// lifecycle state machines (e.g. talentOpportunityLifecycle.ts).
// booked/declined/unavailable/withdrawn are all terminal — no
// transition leads out of any of them. This is deliberate, not an
// oversight: an exceptional real-world reversal (e.g. a booked job
// falling through) is a genuinely different business event from a
// normal forward transition, and modeling it would mean either
// inventing a state the Founder didn't approve or weakening the
// state machine to allow arbitrary jumps out of a terminal state —
// neither is appropriate for this milestone. If that need becomes
// real, it should be modeled deliberately then (see this module's own
// header for the same reasoning already applied to
// talentOpportunityLifecycle.ts's own terminal states).
export const TALENT_CANDIDACY_STATUSES = [
  "candidate",
  "shortlisted",
  "contacted",
  "selected",
  "booked",
  "declined",
  "unavailable",
  "withdrawn",
] as const;
export type TalentCandidacyStatus = (typeof TALENT_CANDIDACY_STATUSES)[number];

const TERMINAL_STATUSES = new Set<TalentCandidacyStatus>(["booked", "declined", "unavailable", "withdrawn"]);

const EXIT_STATUSES = ["declined", "unavailable", "withdrawn"] as const;

const VALID_TRANSITIONS: Readonly<Record<TalentCandidacyStatus, readonly TalentCandidacyStatus[]>> = {
  candidate: ["shortlisted", ...EXIT_STATUSES],
  shortlisted: ["contacted", ...EXIT_STATUSES],
  contacted: ["selected", ...EXIT_STATUSES],
  selected: ["booked", ...EXIT_STATUSES],
  booked: [],
  declined: [],
  unavailable: [],
  withdrawn: [],
};

export function isValidCandidacyTransition(from: TalentCandidacyStatus, to: TalentCandidacyStatus): boolean {
  return VALID_TRANSITIONS[from]?.includes(to) ?? false;
}

export function isTerminalCandidacyStatus(status: TalentCandidacyStatus): boolean {
  return TERMINAL_STATUSES.has(status);
}

export function isValidCandidacyStatus(value: string): value is TalentCandidacyStatus {
  return (TALENT_CANDIDACY_STATUSES as readonly string[]).includes(value);
}
