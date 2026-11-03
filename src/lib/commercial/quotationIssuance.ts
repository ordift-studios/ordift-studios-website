import { createAdminClient } from "@/lib/supabase/admin";
import { logActivity } from "@/lib/admin/activityLog";
import { getCurrentUser, hasRole, isSuperAdmin } from "@/lib/portal/roles";
import { issuanceBlockers, planIssuance } from "./quotationValidity";
import { DELIVERY_CHANNELS_UI } from "./quotationDeliveryChannels";
import { ENTITY_REQUIRED_TO_ISSUE, resolveQuotationEntity } from "./quotationEntity";
import { loadIssuedQuotationDocument, recordIssueFingerprint } from "./quotationDocumentData";
import { isFingerprint } from "./quotationDocument";
import { contactsFor, snapshotContacts } from "@/lib/brand/letterheadContacts";

// ORDINARY quotation issuance, delivery record and their audit. Issuing is ONE deliberate, confirmed act that records WHEN it was issued, BY WHOM, and the approved validity.
// It is deliberately NOT sending: nothing is emailed or notified, and it creates no payment, booking, amount due, receivable or client acceptance. Delivering the quotation to the client
// is a separate step the person records afterwards. Crew Support quotations have their own issue path and are refused here.

export type IssueResult = { ok: true; issuedAt: string; validUntil: string; isException: boolean; isExtension: boolean } | { ok: false; error: string };

export async function issueOrdinaryQuotation(params: { quotationId: string; validUntil?: string | null; exceptionReason?: string | null; expectedEntityId?: string | null; activities?: string[] | null }): Promise<IssueResult> {
  const user = await getCurrentUser();
  if (!user || (!hasRole(user, "admin") && !isSuperAdmin(user))) return { ok: false, error: "Not authorized to issue quotations." };
  if (!params.quotationId) return { ok: false, error: "Quotation not found." };

  const admin = createAdminClient();
  const { data: q } = await admin.from("client_quotations").select("id, status, total, valid_until, issued_at, crew_support_request_id, quotation_reference").eq("id", params.quotationId).maybeSingle();
  if (!q) return { ok: false, error: "Quotation not found." };
  const { count } = await admin.from("client_quotation_items").select("id", { count: "exact", head: true }).eq("quotation_id", params.quotationId);
  const blockers = issuanceBlockers({ status: q.status, lineCount: count ?? 0, total: Number(q.total ?? 0), crewManaged: Boolean(q.crew_support_request_id) });
  if (blockers.length) return { ok: false, error: blockers.join(" ") };

  // FAIL CLOSED: a quotation is issued only with a contracting legal entity that was explicitly recorded (on it or on its enquiry) and that can currently contract. Read from the
  // authoritative record at this moment, never inferred or defaulted. A draft needs none; issuing does.
  const declared = [...new Set((params.activities ?? []).map((a) => String(a).trim()).filter(Boolean))].sort();
  const entity = await resolveQuotationEntity(params.quotationId, undefined, declared);
  if (!entity.ok) return { ok: false, error: entity.message };

  const now = new Date();
  const plan = planIssuance({ now, existingValidUntil: q.valid_until, requestedValidUntil: params.validUntil ?? null, exceptionReason: params.exceptionReason ?? null, isSuperAdmin: isSuperAdmin(user) });
  if (!plan.ok) return plan;
  // The Issue form carries the entity the person was looking at; if it is no longer the one on record, nothing is issued.
  if (params.expectedEntityId && params.expectedEntityId !== entity.entity.entityId) return { ok: false, error: ENTITY_CHANGED };

  // ONE database transaction (migration 0172, issue_ordinary_quotation): lock the enquiry then the quotation, re-check that it is still an unissued draft, resolve and verify the
  // contracting entity on record at that moment, FREEZE its legal details, set status / issue time / issuer / validity, and write the audit event that carries the frozen details.
  // All of it commits together or none of it does, so there is never an issued quotation without its authoritative legal snapshot, and two people pressing at once produce exactly
  // one issuance. The function re-checks the actor's role and the entity's eligibility itself; the checks above only give friendlier messages first.
  const { data, error } = await admin.rpc("issue_ordinary_quotation", {
    p_quotation_id: params.quotationId, p_actor: user.id, p_valid_until: plan.validUntil, p_expected_entity: params.expectedEntityId ?? entity.entity.entityId,
    p_audit: {
      declaredActivities: declared,
      // The letterhead contact details this quotation is issued with, frozen into the append-only issuance event (the database merges p_audit into it) so a later PDF prints these, not whatever
      // the configuration says then. They follow the contracting entity's own jurisdiction, never the client's location or currency.
      letterheadContacts: snapshotContacts(contactsFor(entity.entity.assessment.jurisdiction)),
      standardValidUntil: plan.defaultUntil, withinStandardPolicy: !plan.isException,
      ...(plan.isException ? { exceptionReason: (params.exceptionReason ?? "").trim(), extensionBeyondStandard: plan.isExtension, approvedBy: user.id } : {}),
      ...(plan.replacedExpired ? { replacedExpiredCarriedDate: q.valid_until } : {}),
      delivery: "not sent by the system: issuing does not email or notify the client",
    },
  });
  if (error) {
    console.error("[commercial] failed to issue quotation", error.message);
    return { ok: false, error: messageForIssueError(error.message, (error as { details?: string | null }).details ?? null) };
  }
  const row = (Array.isArray(data) ? data[0] : data) as { issued_at: string } | null;
  if (!row?.issued_at) return { ok: false, error: "The quotation could not be issued. Nothing was changed." };
  // The quotation is now issued (the application accepts no further edit to its lines). Record the fingerprint of its content at this moment so a later change is detectable.
  // Best-effort audit write: its failure never undoes or blocks the issue.
  await recordIssueFingerprint(params.quotationId, user.id);
  return { ok: true, issuedAt: row.issued_at, validUntil: plan.validUntil, isException: plan.isException, isExtension: plan.isExtension };
}

const ENTITY_CHANGED = "The contracting entity was changed since you opened this quotation. Review it and issue again. Nothing was issued.";
function messageForIssueError(message: string, details: string | null): string {
  const m = message ?? "";
  if (m.includes("ordift:already_issued") || m.includes("ordift:changed_concurrently")) return "This quotation was already issued or changed by someone else. Reload to see its current state. Nothing was changed.";
  if (m.includes("ordift:entity_changed")) return ENTITY_CHANGED;
  if (m.includes("ordift:entity_required")) return ENTITY_REQUIRED_TO_ISSUE;
  if (m.includes("ordift:entity_ineligible")) return `The recorded contracting entity cannot currently contract: ${details ?? ""} A Super Admin must review it before this quotation is issued. Nothing was issued.`.replace("  ", " ");
  if (m.includes("ordift:entity_unavailable")) return "The recorded contracting entity could not be found. A Super Admin must review it before this quotation is issued. Nothing was issued.";
  if (m.includes("ordift:validity_in_past")) return "The validity date is already in the past. Choose a date from today onward. Nothing was issued.";
  if (m.includes("ordift:validity_needs_super_admin")) return "A validity beyond the standard 30 days needs approval from a Founder / Super Admin. Nothing was issued.";
  if (m.includes("ordift:unknown_activity")) return "Choose the activities from the list. Nothing was issued.";
  if (m.includes("ordift:not_authorised")) return "Not authorized to issue quotations.";
  if (m.includes("ordift:crew_managed")) return "This is a Crew Support quotation: it is issued from its Crew Support request.";
  if (m.includes("ordift:no_lines")) return "Add at least one line item before issuing.";
  if (m.includes("ordift:no_total")) return "The total must be greater than zero before issuing.";
  return "The quotation could not be issued. Nothing was changed.";
}

// ---- delivery to the client: a person records HOW and WHEN they delivered it, to whom, and what evidence they hold. Kept as an audit event (no schema change); it never changes the
// quotation and the system sends nothing. When the person sent the system's PDF, they also record its FINGERPRINT (printed on the PDF): the record then says exactly which content was
// delivered, and whether the quotation still has that content now.
export const DELIVERY_CHANNELS = DELIVERY_CHANNELS_UI;

export type DeliveryRecord = { quotationId: string; channel: string; deliveredAt: string; note?: string; recipient?: string; evidence?: string; pdfFingerprint?: string | null };
export type DeliveryResult = { ok: true; warning?: string } | { ok: false; error: string };

const clean = (v: string | undefined, max: number): string | null => (v ?? "").replace(/[\u0000-\u001f]/g, " ").trim().slice(0, max) || null;

export async function recordQuotationDelivery(params: DeliveryRecord): Promise<DeliveryResult> {
  const user = await getCurrentUser();
  if (!user || (!hasRole(user, "admin") && !isSuperAdmin(user))) return { ok: false, error: "Not authorized to manage quotations." };
  if (!DELIVERY_CHANNELS.some((c) => c.value === params.channel)) return { ok: false, error: "Choose how it was delivered." };
  const when = new Date(params.deliveredAt);
  if (Number.isNaN(when.getTime())) return { ok: false, error: "Enter when it was delivered." };
  if (when.getTime() > Date.now() + 5 * 60_000) return { ok: false, error: "The delivery time cannot be in the future." };
  if (params.pdfFingerprint && !isFingerprint(params.pdfFingerprint)) return { ok: false, error: "The document fingerprint is not valid. Reload the page and try again." };
  const admin = createAdminClient();
  const { data: q } = await admin.from("client_quotations").select("id, status, issued_at, quotation_reference, crew_support_request_id").eq("id", params.quotationId).maybeSingle();
  if (!q) return { ok: false, error: "Quotation not found." };
  if (q.crew_support_request_id) return { ok: false, error: "Crew Support quotations are delivered from their Crew Support request." };
  if (q.status !== "sent" && q.status !== "accepted") return { ok: false, error: "Only an issued quotation can have a delivery recorded. Issue it first." };
  if (q.issued_at && when.getTime() < new Date(q.issued_at).getTime() - 60_000) return { ok: false, error: "It cannot have been delivered before it was issued." };

  // What the person says they sent is compared with what the quotation says NOW. A mismatch is recorded truthfully (the delivery did happen) and flagged to the person.
  let current: string | null = null;
  let matches: boolean | null = null;
  if (params.pdfFingerprint) {
    const doc = await loadIssuedQuotationDocument(params.quotationId);
    current = doc.ok ? doc.doc.fingerprint : null;
    matches = current === null ? null : current === params.pdfFingerprint;
  }
  await logActivity({
    actorUserId: user.id, action: "client_quotation.delivery_recorded", entityType: "client_quotation", entityId: params.quotationId,
    metadata: {
      quotationReference: q.quotation_reference, channel: params.channel, deliveredAt: when.toISOString(), note: clean(params.note, 300), recordedBy: user.id,
      recipient: clean(params.recipient, 200), evidence: clean(params.evidence, 500),
      ...(params.pdfFingerprint ? { pdfFingerprint: params.pdfFingerprint, pdfMatchesCurrentContent: matches, currentContentFingerprint: current } : {}),
      note_system: "recorded by staff; the system did not send anything",
    },
  });
  return { ok: true, ...(matches === false ? { warning: "The quotation's content is different from the PDF you say you sent. The delivery is recorded as you reported it. Check what the client received before relying on it." } : {}) };
}

export type DeliveryFact = { channel: string; deliveredAt: string; recordedAt: string; recipient: string | null; evidence: string | null; pdfFingerprint: string | null; pdfMatchesCurrentContent: boolean | null } | null;
export async function getQuotationDelivery(quotationId: string): Promise<DeliveryFact> {
  const { data } = await createAdminClient().from("activity_log").select("created_at, metadata").eq("entity_id", quotationId).eq("action", "client_quotation.delivery_recorded").order("created_at", { ascending: false }).limit(1).maybeSingle();
  const m = (data?.metadata ?? null) as { channel?: string; deliveredAt?: string; recipient?: string | null; evidence?: string | null; pdfFingerprint?: string; pdfMatchesCurrentContent?: boolean | null } | null;
  return data && m?.channel && m.deliveredAt
    ? { channel: m.channel, deliveredAt: m.deliveredAt, recordedAt: data.created_at as string, recipient: m.recipient ?? null, evidence: m.evidence ?? null, pdfFingerprint: isFingerprint(m.pdfFingerprint) ? m.pdfFingerprint : null, pdfMatchesCurrentContent: m.pdfMatchesCurrentContent ?? null }
    : null;
}
