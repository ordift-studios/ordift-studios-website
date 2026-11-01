// The wording registry: founder-approved EDITORIAL text only, keyed by the exact package keys of the selling tables. It never carries a price, a count, a specification, an eligibility flag or
// an activity, so it cannot change what a rate card sells. One entry serves every market; a market override replaces single fields only.
export type RegistryMarket = "ghana" | "qatar";

export type Copy = {
  description?: string;            // the approved service description (Luxury Editorial copy)
  note?: string;                   // a short condition printed under the price (narrow column: keep it brief)
  appendInclusions?: string[];     // approved lines added AFTER the lines derived from the selling tables
};
// status describes the DESCRIPTION only (a note or appended line carries its own approval):
//   "approved"       previously reviewed wording (the default when absent)
//   "reviewed_draft" reviewed, but exact-text approval is still pending: merged so it can be previewed, reported separately, and raises an approval blocker
//   "draft"          a new proposal awaiting Founder approval: kept in the registry, NEVER merged into a card, reported separately
export type DescriptionStatus = "approved" | "reviewed_draft" | "draft";
export type Entry = Copy & { status?: DescriptionStatus; markets?: Partial<Record<RegistryMarket, Copy>> };

export type SectionCopy = { intro?: string; customQuotationHeading?: string; customQuotationNote?: string; notes?: string[] };
// A section record carries the quotation note and its own approval status and availability:
//   status       "approved" (default) | "draft" (kept, never merged, reported)
//   availableIn  markets that may show it; absent = every market. Anywhere else the note is deliberately WITHHELD (reported, and the placeholder is cleared).
//   markets      field-level market variation; { omit: true } withholds the note in that market.
export type SectionEntry = SectionCopy & { status?: DescriptionStatus; availableIn?: RegistryMarket[]; markets?: Partial<Record<RegistryMarket, SectionCopy & { omit?: boolean }>> };

export type Registry = {
  packages: Record<string, Entry>;                                             // key = the exact item key, e.g. "event-photography-half_day"
  sections: Record<string, SectionEntry>;                                      // key = the exact section key, e.g. "corporate_headshots"
  conditions: Partial<Record<RegistryMarket, { title: string; text: string }[]>>;
  contact: Partial<Record<RegistryMarket, { label: string; value: string }[]>>;
};

export type ContentReport = {
  market: string;
  items: number;                          // included in the draft, whatever their eligibility
  described: number;                      // items whose description was merged from the registry (approved + reviewed drafts)
  approvedDescribed: number;              // of those, previously reviewed (approved) wording
  reviewedDraft: string[];                // of those, reviewed drafts still awaiting exact-text approval
  missingDescriptions: string[];          // item keys with NO registry entry at all (left empty, never replaced by invented copy)
  missingSectionWording: string[];        // sections still on the placeholder custom-quotation note (no approved note, not deliberately withheld)
  quotationNotes: {
    approved: string[];                   // sections whose approved note was merged
    draft: string[];                      // sections whose note is a draft: held back, placeholder remains
    missing: string[];                    // sections with no registry note at all
    withheld: string[];                   // deliberately not shown in this market (e.g. film notes in Qatar): placeholder cleared
    marketVariants: string[];             // approved notes that use this market's own wording
  };
  missingConditions: boolean;             // the placeholder terms blocks remain
  missingContact: boolean;                // the placeholder contact lines remain
  unknownKeys: string[];                  // registry keys that match nothing in this draft's market (reported, never applied)
  draftOnly: string[];                    // item keys whose registry wording is still a draft: held back, not applied, never publication-ready
  rejected: string[];                     // registry text refused by the wording checks (not applied)
  notices: string[];                      // known, documented differences between the card and the quotation engine
  publicationBlockers: string[];          // every other requirement before a card can be published (terms, contacts, cover, entity scope, edition, currency, undefined conditions…)
  approvalBlockers: string[];             // reasons a card of this kind is not ready for approval (shown to the administrator; the existing approval checks are unchanged)
};
