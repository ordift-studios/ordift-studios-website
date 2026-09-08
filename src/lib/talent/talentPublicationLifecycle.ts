// Ordift Talent — TALENT-SYS-2B, Phase 1 (2026-09-08).
// Pure, zero-import publication-state machine. Mirrors portfolioProject's
// Sanity status vocabulary exactly (draft/pending_review/approved/
// published/archived) so the whole site shares one lifecycle language.
// Creating a talent record never publishes it — only an explicit
// transition to "published" makes a profile eligible for the public
// roster query.

export const TALENT_PUBLICATION_STATUSES = ["draft", "pending_review", "approved", "published", "archived"] as const;
export type TalentPublicationStatus = (typeof TALENT_PUBLICATION_STATUSES)[number];

const VALID_TRANSITIONS: Readonly<Record<TalentPublicationStatus, readonly TalentPublicationStatus[]>> = {
  draft: ["pending_review", "archived"],
  pending_review: ["draft", "approved", "archived"],
  approved: ["published", "draft", "archived"],
  published: ["archived"],
  archived: ["draft"],
};

export function isValidPublicationTransition(from: TalentPublicationStatus, to: TalentPublicationStatus): boolean {
  return VALID_TRANSITIONS[from]?.includes(to) ?? false;
}

// The ONLY status the public roster/profile query is ever allowed to
// read (see listPublishedTalent()/getPublishedTalentBySlug() in
// talentPublicRoster.ts).
export function isPubliclyVisible(status: TalentPublicationStatus): boolean {
  return status === "published";
}
