// Ordift Studios — TALENT-SYS-1, Foundation (2026-09-08).
// Pure, zero-import opportunity/casting lifecycle. Internal records
// only — nothing here implies or enables a public listing surface.

export const TALENT_OPPORTUNITY_STATUSES = ["draft", "open", "closed", "filled", "cancelled"] as const;
export type TalentOpportunityStatus = (typeof TALENT_OPPORTUNITY_STATUSES)[number];

const TERMINAL_STATUSES = new Set<TalentOpportunityStatus>(["closed", "filled", "cancelled"]);

const VALID_TRANSITIONS: Readonly<Record<TalentOpportunityStatus, readonly TalentOpportunityStatus[]>> = {
  draft: ["open", "cancelled"],
  open: ["closed", "filled", "cancelled"],
  closed: [],
  filled: [],
  cancelled: [],
};

export function isValidOpportunityTransition(from: TalentOpportunityStatus, to: TalentOpportunityStatus): boolean {
  return VALID_TRANSITIONS[from]?.includes(to) ?? false;
}

export function isTerminalOpportunityStatus(status: TalentOpportunityStatus): boolean {
  return TERMINAL_STATUSES.has(status);
}
