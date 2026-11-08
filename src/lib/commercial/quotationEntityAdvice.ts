import { createAdminClient } from "@/lib/supabase/admin";
import { getContractingEntityStanding } from "@/lib/organization/entityRegistrations";
import { MARKET_JURISDICTIONS, marketMismatchNote } from "@/lib/organization/entityMarketSuggestion";
import { loadEnquiryMarket } from "@/lib/organization/enquiryMarket";
import { detectActivities, licenceWarnings, type LicenceWarning } from "./quotationLicenceWarnings";

// Advisory guidance shown on a DRAFT ordinary quotation: (1) an early warning when its lines appear to include an activity the contracting entity is not licensed for, and (2) a note when
// the recorded entity belongs to a different market than the enquiry. Read-only. It records, ticks and changes nothing; the authoritative eligibility check still runs when the quotation is
// issued and is not touched here.

export type EntityAdvice = { market: string | null; evaluatedEntityName: string | null; detected: string[]; warnings: LicenceWarning[]; mismatch: string | null };
const NONE: EntityAdvice = { market: null, evaluatedEntityName: null, detected: [], warnings: [], mismatch: null };

// The entity whose jurisdiction matches the market, only when exactly one exists. Used to evaluate the warning before any entity has been chosen; it is not a choice.
async function entityForMarket(country: string | null): Promise<string | null> {
  const label = country ? MARKET_JURISDICTIONS[country] : undefined;
  if (!label) return null;
  const db = createAdminClient();
  const { data: j } = await db.from("employment_jurisdictions").select("id").eq("name", label).limit(2);
  if (!j || j.length !== 1) return null;
  const { data: e } = await db.from("employing_entities").select("id").eq("jurisdiction_id", j[0].id as string).eq("active", true).limit(2);
  return e && e.length === 1 ? (e[0].id as string) : null;
}

export async function quotationEntityAdvice(p: { lines: { serviceItem: string; description: string | null }[]; enquiryId: string | null; recordedEntityId: string | null; today: string }): Promise<EntityAdvice> {
  const { country, service } = await loadEnquiryMarket(p.enquiryId);
  const entityId = p.recordedEntityId ?? (await entityForMarket(country));
  if (!entityId) return { ...NONE, market: country ? MARKET_JURISDICTIONS[country] ?? null : null };
  const detected = detectActivities(p.lines, service);
  const standing = await getContractingEntityStanding(entityId, p.today, detected.length ? detected : null);
  if (!standing) return NONE;
  return {
    market: country ? MARKET_JURISDICTIONS[country] ?? null : null,
    evaluatedEntityName: standing.entity.name,
    detected,
    warnings: licenceWarnings({ entityName: standing.entity.name, jurisdiction: standing.assessment.jurisdiction, detected, states: standing.assessment.activities }),
    mismatch: p.recordedEntityId ? marketMismatchNote(country, standing.entity.name, standing.assessment.jurisdiction) : null,
  };
}
