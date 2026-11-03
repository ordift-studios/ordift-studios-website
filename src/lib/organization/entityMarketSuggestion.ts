// Suggesting (never choosing) the contracting entity from an enquiry's payment market. Pure.
//
// The platform's rule stands: the entity is chosen explicitly by a Super Admin, recorded with a reason, and never inferred from currency, nationality or location. This module only
// computes a SUGGESTION from the one explicit market field an enquiry already carries (its payment market, GH or QA). The suggestion is shown beside the chooser; nothing is recorded, preselected
// or assigned because of it, and an ineligible entity is reported as such instead of being hidden.

export const MARKET_JURISDICTIONS: Record<string, string> = { GH: "Ghana", QA: "Qatar" };

export type SuggestionCandidate = { entityId: string; name: string; jurisdiction: string | null; eligible: boolean; blockers: string[] };
export type MarketSuggestion = { entityId: string; entityName: string; market: string; eligible: boolean; blockers: string[]; text: string };

export function suggestEntityForMarket(country: string | null | undefined, candidates: SuggestionCandidate[]): MarketSuggestion | null {
  const market = country ? MARKET_JURISDICTIONS[country] : undefined;
  if (!market) return null;
  const inMarket = candidates.filter((c) => c.jurisdiction === market);
  if (inMarket.length !== 1) return null;                                   // none, or ambiguous: suggest nothing
  const c = inMarket[0];
  const text = c.eligible
    ? `This enquiry's payment market is ${market}, so ${c.name} is suggested. A Super Admin must confirm it below; it is not recorded automatically.`
    : `This enquiry's payment market is ${market}, so ${c.name} would be suggested, but it cannot currently contract (${c.blockers[0] ?? "see its requirements"}). Nothing is recorded automatically.`;
  return { entityId: c.entityId, entityName: c.name, market, eligible: c.eligible, blockers: c.blockers, text };
}

// When the recorded entity belongs to a different market than the enquiry's, say so (advisory; it may be intended).
export function marketMismatchNote(country: string | null | undefined, recordedEntityName: string, recordedJurisdiction: string | null): string | null {
  const market = country ? MARKET_JURISDICTIONS[country] : undefined;
  if (!market || !recordedJurisdiction || market === recordedJurisdiction) return null;
  return `The enquiry's payment market is ${market}, but the recorded contracting entity is ${recordedEntityName} (${recordedJurisdiction}). Confirm this is intended. Work that ${market === "Qatar" ? "the Qatar licence does not cover" : "one entity cannot carry out"} is not moved to another entity automatically.`;
}
