import { createAdminClient } from "@/lib/supabase/admin";
import { logActivity } from "@/lib/admin/activityLog";
import { ISSUED_ACTION, parseIssuedLegalDetails, pickIssuanceEvent, type IssuanceEventRow } from "./quotationIssuedDetails";
import { utcDate } from "./quotationValidity";
import { contactsFor, parseContactSnapshot, snapshotContacts, type ContactSnapshot } from "@/lib/brand/letterheadContacts";
import {
  buildDocumentContent, compareToBaseline, contentFingerprint, isFingerprint,
  type Drift, type QuotationDocumentContent, type QuotationDocumentContext,
} from "./quotationDocument";

// Server side of the issued-quotation document: reads the issued quotation, its FROZEN entity details and declared activities (the `client_quotation.issued` event written by the issuing
// transaction), and the fingerprint recorded when it was issued. Read-only apart from `recordIssueFingerprint`, which appends one audit event. Nothing is sent from here.

export const CONTENT_FINGERPRINT_ACTION = "client_quotation.content_fingerprint";

export type IssuedDocument = { content: QuotationDocumentContent; context: QuotationDocumentContext; fingerprint: string; baseline: string | null; drift: Drift; conflictingBaselines: boolean };
export type DocumentResult =
  | { ok: true; doc: IssuedDocument }
  | { ok: false; code: "not_found" | "not_issued" | "crew" | "no_snapshot"; message: string };

const NOT_ISSUED = "Only an issued quotation has a quotation PDF. A draft can be previewed with the print view; it is not a final document.";

async function loadBaselines(quotationId: string): Promise<{ baseline: string | null; conflicting: boolean }> {
  const { data } = await createAdminClient().from("activity_log").select("created_at, metadata").eq("entity_id", quotationId).eq("action", CONTENT_FINGERPRINT_ACTION).order("created_at", { ascending: true });
  const values = (data ?? []).map((r) => (r.metadata as { contentSha256?: unknown } | null)?.contentSha256).filter(isFingerprint);
  if (values.length === 0) return { baseline: null, conflicting: false };
  return { baseline: values[0], conflicting: values.some((v) => v !== values[0]) };
}

// The contracting entity's jurisdiction (from its own record) selects the letterhead's contact details. Never taken from the client's location or currency.
export async function entityJurisdiction(entityId: string): Promise<string | null> {
  const db = createAdminClient();
  const { data: e } = await db.from("employing_entities").select("jurisdiction_id").eq("id", entityId).maybeSingle();
  const jid = (e as { jurisdiction_id?: string | null } | null)?.jurisdiction_id;
  if (!jid) return null;
  const { data: j } = await db.from("employment_jurisdictions").select("name").eq("id", jid).maybeSingle();
  return ((j as { name?: string } | null)?.name) ?? null;
}

export async function loadIssuedQuotationDocument(quotationId: string, today: string = utcDate(new Date())): Promise<DocumentResult> {
  // Loaded lazily: clientQuotations -> quotationIssuance -> this module would otherwise be an import cycle.
  const { getClientQuotation } = await import("./clientQuotations");
  const q = await getClientQuotation(quotationId);
  if (!q) return { ok: false, code: "not_found", message: "Quotation not found." };
  if (q.crewManaged) return { ok: false, code: "crew", message: "Crew Support quotations are issued and documented from their Crew Support request." };
  if (q.status === "draft" || q.status === "ready" || !q.issuedAt) return { ok: false, code: "not_issued", message: NOT_ISSUED };

  const db = createAdminClient();
  const [{ data: row }, { data: events }, { data: types }] = await Promise.all([
    db.from("client_quotations").select("issued_by").eq("id", quotationId).maybeSingle(),
    db.from("activity_log").select("id, created_at, actor_user_id, entity_type, metadata").eq("entity_id", quotationId).eq("action", ISSUED_ACTION),
    db.from("entity_activity_types").select("key, label"),
  ]);
  const hit = pickIssuanceEvent((events ?? []) as IssuanceEventRow[], q.issuedAt, (row?.issued_by as string | null) ?? null);
  const details = hit ? parseIssuedLegalDetails(hit.metadata) : null;
  if (!hit || !details) {
    return { ok: false, code: "no_snapshot", message: "This quotation was issued before its legal details were frozen, so no document can be built from it. Revise it to issue a new version." };
  }
  const declared = ((hit.metadata as { declaredActivities?: unknown } | null)?.declaredActivities);
  const declaredActivities = Array.isArray(declared) ? declared.filter((a): a is string => typeof a === "string") : [];
  const activityLabels = Object.fromEntries((types ?? []).map((t) => [t.key as string, t.label as string]));

  const jurisdiction = await entityJurisdiction(details.entityId);
  // The contact details printed on the letterhead are the ones frozen into the issuance event when the quotation was issued. Only a quotation issued before that existed falls back to the
  // current configuration, and then `contactsFrozen` is false so the page says so.
  const frozen = parseContactSnapshot((hit.metadata as { letterheadContacts?: unknown } | null)?.letterheadContacts);
  const contacts: ContactSnapshot = frozen ?? snapshotContacts(contactsFor(jurisdiction));
  const content = buildDocumentContent({
    reference: q.quotationReference, version: q.version, currency: q.currency, issuedAt: q.issuedAt, validUntil: q.validUntil,
    subtotal: q.subtotal, discountTotal: q.discountTotal, taxTotal: q.taxTotal, total: q.total, paymentBookingTerms: q.paymentBookingTerms,
    items: q.items, entity: { legalName: details.legalName, registrationType: details.registrationType, identifiers: details.identifiers }, declaredActivities, activityLabels,
  });
  const fingerprint = contentFingerprint(content);
  const { baseline, conflicting } = await loadBaselines(quotationId);
  return {
    ok: true,
    doc: {
      content, fingerprint, baseline, conflictingBaselines: conflicting,
      drift: conflicting ? { state: "changed", recorded: baseline as string, current: fingerprint } : compareToBaseline(baseline, fingerprint),
      context: { status: q.status, today, jurisdiction, contacts, contactsFrozen: Boolean(frozen), party: { name: q.clientName ?? q.prospectName, company: q.prospectCompany, email: q.prospectEmail, phone: q.prospectPhone } },
    },
  };
}

// Appends the issue-time fingerprint as an audit event. Called right after the issuing transaction commits: the quotation is no longer a draft, so the application accepts no further
// edit to its lines. Best-effort like every audit write (a failure is logged, never blocks the issue); when it is missing the page says "no issue-time fingerprint was recorded".
export async function recordIssueFingerprint(quotationId: string, actorUserId: string): Promise<void> {
  const r = await loadIssuedQuotationDocument(quotationId);
  if (!r.ok) { console.error("[commercial] issue fingerprint not recorded:", r.code); return; }
  const existing = await loadBaselines(quotationId);
  if (existing.baseline) return;
  await logActivity({
    actorUserId, action: CONTENT_FINGERPRINT_ACTION, entityType: "client_quotation", entityId: quotationId,
    metadata: { quotationReference: r.doc.content.reference, contentSha256: r.doc.fingerprint, schema: r.doc.content.schema, note_system: "recorded by the system at the moment of issue; used to detect later changes to an issued quotation" },
  });
}

// For the print view of an issued quotation: the frozen contact details if the issuance event carries them, else the current configuration for the entity's jurisdiction (flagged as not frozen).
export async function resolveLetterheadContacts(quotationId: string, jurisdiction: string | null): Promise<{ contacts: ContactSnapshot; frozen: boolean }> {
  const db = createAdminClient();
  const { data: q } = await db.from("client_quotations").select("issued_at, issued_by").eq("id", quotationId).maybeSingle();
  if (q?.issued_at) {
    const { data: events } = await db.from("activity_log").select("id, created_at, actor_user_id, entity_type, metadata").eq("entity_id", quotationId).eq("action", ISSUED_ACTION);
    const hit = pickIssuanceEvent((events ?? []) as IssuanceEventRow[], q.issued_at as string, (q.issued_by as string | null) ?? null);
    const frozen = hit ? parseContactSnapshot((hit.metadata as { letterheadContacts?: unknown } | null)?.letterheadContacts) : null;
    if (frozen) return { contacts: frozen, frozen: true };
  }
  return { contacts: snapshotContacts(contactsFor(jurisdiction)), frozen: false };
}
