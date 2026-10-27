// Publication eligibility: a rate card may only offer what the ISSUING entity is currently licensed to do. This is checked separately from pricing and again at approval.
import { GHANA_GUIDANCE_ACTIVITIES, ISSUING_RULES } from "./jurisdictions";
import type { Addon, Eligibility, RateCardContent, RateCardItem } from "./types";

export const UNCLASSIFIED = "unclassified";
export type LicensedActivities = { entityId?: string; jurisdiction?: string; entityName: string; checkedOn: string; keys: string[]; basis?: string };

export function assessActivities(activities: string[] | undefined, lic: LicensedActivities): Eligibility {
  if (!activities || activities.length === 0) return { ok: true };
  if (activities.includes(UNCLASSIFIED)) return { ok: false, reason: "The activity this service falls under has not been classified yet." };
  const missing = activities.filter((a) => !lic.keys.includes(a));
  return missing.length ? { ok: false, reason: `${lic.entityName} is not currently licensed for: ${missing.join(", ")}.` } : { ok: true };
}

// Marks every item and add-on with its eligibility; an ineligible one is left out of the PDF (included = false) and says why. Never turns an item back on.
export function applyEligibility(c: RateCardContent, lic: LicensedActivities): RateCardContent {
  const mark = <T extends RateCardItem | Addon>(x: T): T => { const e = assessActivities(x.activities, lic); return { ...x, eligibility: e, included: e.ok ? x.included : false }; };
  return {
    ...c,
    meta: { ...c.meta, issuingEntity: { ...(lic.entityId ? { entityId: lic.entityId } : {}), ...(lic.jurisdiction ? { jurisdiction: lic.jurisdiction } : {}), name: lic.entityName, checkedOn: lic.checkedOn, licensedActivities: [...lic.keys].sort(), ...(lic.basis ? { basis: lic.basis } : {}) } },
    sections: c.sections.map((s) => ({ ...s, items: s.items.map(mark), addons: s.addons?.map(mark) })),
  };
}
export const excludedByEligibility = (c: RateCardContent): string[] =>
  c.sections.flatMap((s) => [...s.items.filter((i) => i.eligibility && !i.eligibility.ok).map((i) => `${s.title} — ${i.name}: ${i.eligibility?.reason}`), ...(s.addons ?? []).filter((a) => a.eligibility && !a.eligibility.ok).map((a) => `${s.title} — ${a.name}: ${a.eligibility?.reason}`)]);

// What an entity may offer. Qatar: only activities its VERIFIED registration lists (or an explicit licensed record). Ghana: its record carries no activity list, so ordinary photography and videography
// rest on the approved jurisdiction guidance (said so on the card; the Founder clears it at approval) — nothing else is assumed (drone, design, talent, production stay out).
export function resolveLicensed(marketSlug: string, jurisdiction: string, entityName: string, checkedOn: string, entityId: string | undefined, verifiedKeys: string[]): LicensedActivities {
  const rule = ISSUING_RULES[marketSlug];
  if (rule?.activityBasis === "jurisdiction_guidance") {
    const keys = [...new Set([...verifiedKeys, ...GHANA_GUIDANCE_ACTIVITIES])];
    return { entityId, jurisdiction, entityName, checkedOn, keys, basis: "approved Ghana guidance (no activity licence is needed for ordinary photography or videography); the registered nature of business is not recorded on the entity, so the Founder confirms it at approval" };
  }
  return { entityId, jurisdiction, entityName, checkedOn, keys: verifiedKeys };
}
