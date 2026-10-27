// Market ↔ issuing entity ↔ display currency. These are three DIFFERENT things and are never inferred from one another: a market says which selling rates are read, the issuing entity says who
// offers the prices (and which activities it may offer), the display currency says how amounts are shown. A rate card is valid only when the three agree with each other; a region is never proof
// that an entity may sell every service in it. Selling rates stay in USD (verified: every selling-rate column is *_usd and every personal-session row is currency USD) — local-currency figures are
// DERIVED, reviewable conversions, never a replacement of the USD record.
import type { RoundingRule } from "./types";

export type IssuingRule = { jurisdiction: string; localCurrency: string; rounding: RoundingRule; roundingStatus: "provisional" | "proposed"; activityBasis: "registration" | "jurisdiction_guidance" };
export const ISSUING_RULES: Record<string, IssuingRule> = {
  qatar: { jurisdiction: "Qatar", localCurrency: "QAR", rounding: { kind: "up_to_multiple", multiple: 5 }, roundingStatus: "provisional", activityBasis: "registration" },
  // GHS rounding is a PROPOSAL for the Founder (QAR 5 is not assumed to apply): GHS is about 11 per USD, so the next GHS 10 is a similar fineness (about USD 0.90) to QAR 5 (about USD 1.37).
  ghana: { jurisdiction: "Ghana", localCurrency: "GHS", rounding: { kind: "up_to_multiple", multiple: 10 }, roundingStatus: "proposed", activityBasis: "jurisdiction_guidance" },
};

// Ghana: the approved jurisdiction guidance (migration 0173) says "No activity licence is needed for ordinary photography or videography. Activity-specific licences apply only where actually
// applicable (see drone operations)." The Ghana entity record has no activity list to verify against, so these two activities rest on that guidance — stated on the card and needing the Founder's clearance.
export const GHANA_GUIDANCE_ACTIVITIES = ["photography", "videography"] as const;

export const currencyOptionsFor = (marketSlug: string): string[] => { const r = ISSUING_RULES[marketSlug]; return r ? ["USD", r.localCurrency] : ["USD"]; };
export const roundingFor = (marketSlug: string, currency: string): RoundingRule | null => { const r = ISSUING_RULES[marketSlug]; return r && r.localCurrency === currency ? r.rounding : null; };

// Pure consistency check of the three choices. Empty list = they agree.
export function checkBinding(p: { marketSlug: string; currency: string; entityJurisdiction?: string | null; hasEntity: boolean }): string[] {
  const errs: string[] = []; const rule = ISSUING_RULES[p.marketSlug];
  if (!currencyOptionsFor(p.marketSlug).includes(p.currency)) errs.push(rule ? `${p.currency} cannot be used for the ${p.marketSlug} market: choose USD or ${rule.localCurrency}.` : `Only USD base prices are available for the ${p.marketSlug} market.`);
  if (!rule && p.hasEntity) errs.push(`No issuing entity is bound to the ${p.marketSlug} market, so none can be selected for it.`);
  if (rule && p.hasEntity && p.entityJurisdiction !== rule.jurisdiction) errs.push(`The ${p.marketSlug} market must be issued by the ${rule.jurisdiction} entity, not the ${p.entityJurisdiction ?? "unknown"} entity.`);
  return errs;
}
