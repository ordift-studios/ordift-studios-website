import { createAdminClient } from "@/lib/supabase/admin";
import { getContractingEntityStanding } from "@/lib/organization/entityRegistrations";
import type { EntityAssessment, EntityDisplay } from "@/lib/organization/jurisdictionRequirements";
import { readIssuedLegalDetails, type IssuedLegalDetails } from "./quotationIssuedDetails";

// The contracting legal entity of an ORDINARY quotation, read from the existing governed record (booking_contracting_entities, chosen explicitly by a Super Admin).
// Resolution: the quotation's own record, else its linked enquiry's. NOTHING here chooses, infers or defaults an entity: no record means "not selected". Server-internal and
// actor-independent (callers authorise); what a client document may show is limited to the legal name, registration type and the jurisdiction's own current, verified identifiers (see assessEntityForQuotation).

export type QuotationEntity = { entityId: string; name: string; source: "quotation" | "enquiry"; version: number; display: EntityDisplay; assessment: EntityAssessment };
export type EntityResolution =
  | { ok: true; entity: QuotationEntity }
  | { ok: false; code: "none" | "unavailable" | "crew"; message: string; entityName?: string; assessment?: EntityAssessment };

export const ENTITY_REQUIRED_TO_ISSUE = "A contracting entity must be selected before this quotation can be issued. A Super Admin selects it on this quotation or on its enquiry; it is never chosen automatically.";

export async function resolveQuotationEntity(quotationId: string, today: string = new Date().toISOString().slice(0, 10), declaredActivities: string[] | null = null): Promise<EntityResolution> {
  const db = createAdminClient();
  const { data: q } = await db.from("client_quotations").select("id, enquiry_id, crew_support_request_id").eq("id", quotationId).maybeSingle();
  if (!q) return { ok: false, code: "none", message: "Quotation not found." };
  if (q.crew_support_request_id) return { ok: false, code: "crew", message: "Crew Support quotations have their own entity governance and are issued from their request." };

  const latest = async (type: "quotation" | "enquiry", id: string) =>
    (await db.from("booking_contracting_entities").select("employing_entity_id, version").eq("subject_type", type).eq("subject_id", id).order("version", { ascending: false }).limit(1).maybeSingle()).data;
  let rec = await latest("quotation", quotationId);
  let source: "quotation" | "enquiry" = "quotation";
  if (!rec && q.enquiry_id) { rec = await latest("enquiry", q.enquiry_id as string); source = "enquiry"; }
  if (!rec) return { ok: false, code: "none", message: ENTITY_REQUIRED_TO_ISSUE };

  const standing = await getContractingEntityStanding(rec.employing_entity_id as string, today, declaredActivities);
  if (!standing) return { ok: false, code: "unavailable", message: "The recorded contracting entity could not be found. A Super Admin must review it before this quotation is issued." };
  if (!standing.eligibility.eligible) {
    return { ok: false, code: "unavailable", entityName: standing.entity.name, assessment: standing.assessment, message: `The recorded contracting entity (${standing.entity.name}) cannot currently contract: ${standing.eligibility.blockers.join(" ")} A Super Admin must review it before this quotation is issued.` };
  }
  return { ok: true, entity: { entityId: rec.employing_entity_id as string, name: standing.entity.name, source, version: Number(rec.version), display: standing.assessment.legal, assessment: standing.assessment } };
}

// What a quotation DOCUMENT or detail page may say about its contracting entity.
//  - draft:  the live governed record (it can still change until the quotation is issued);
//  - issued: ONLY the legal details frozen in the issuance record (never the live registry);
//  - issued before the snapshot existed: no entity block (nothing is reconstructed), and `live` says whether an entity has since been recorded.
export type QuotationEntityView =
  | { phase: "draft"; resolution: EntityResolution }
  | { phase: "issued"; frozen: IssuedLegalDetails; record: { eventId: string; recordedAt: string; issuedAt: string } }
  | { phase: "issued_unfrozen"; live: EntityResolution };

export async function resolveQuotationEntityView(quotationId: string, today?: string): Promise<QuotationEntityView> {
  const issued = await readIssuedLegalDetails(quotationId);
  if (issued.state === "ok") return { phase: "issued", frozen: issued.details, record: issued.record };
  const live = await resolveQuotationEntity(quotationId, today);
  return issued.state === "no_snapshot" ? { phase: "issued_unfrozen", live } : { phase: "draft", resolution: live };
}

// The activities an ordinary quotation can declare, and a SUGGESTED pre-selection from the linked enquiry's service when it names one exactly. The person confirms it when issuing: the
// system never decides which activities a quotation covers, and a planned activity is never made licensed by being selected here.
export async function quotationActivityChoices(enquiryId: string | null): Promise<{ options: { key: string; label: string }[]; suggested: string[] }> {
  const db = createAdminClient();
  const { data: types } = await db.from("entity_activity_types").select("key, label").order("sort_order");
  const options = (types ?? []) as { key: string; label: string }[];
  let suggested: string[] = [];
  if (enquiryId) {
    const { data: e } = await db.from("enquiries").select("service").eq("id", enquiryId).maybeSingle();
    const svc = String((e as { service?: string } | null)?.service ?? "").toLowerCase().replace(/[^a-z]+/g, "_");
    if (options.some((o) => o.key === svc)) suggested = [svc];
  }
  return { options, suggested };
}
