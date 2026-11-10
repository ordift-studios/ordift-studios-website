import { createAdminClient } from "@/lib/supabase/admin";
import { logActivity } from "@/lib/admin/activityLog";
import { isSuperAdminId } from "@/lib/organization/authority";
import { buildEquipmentViews, type DocRef, type EquipmentView, type RawAcquisition, type RawInstalment, type RawObligation } from "./equipmentPanelView";
import { documentFamily, expenseOverlapForAcquisition } from "./financeOverlap";
import { validateAcquisition, type AcquisitionInput, type FinancingInput } from "./equipmentFinancingRules";

// EQUIPMENT ACQUISITIONS + FINANCING (see supabase/proposals/PROPOSAL_equipment_acquisitions_and_financing.sql: NOT applied anywhere until the Founder authorises it).
// Super Admin only. Every write goes through one database function (one transaction, audit written inside it); this module validates first, calls it, and adds the platform activity-log entry.
// It records NO expense, NO journal and NO payment. Documents are the existing private entity vault's rows; this module never stores a file.
type Fail = { ok: false; error: string };
const DENIED: Fail = { ok: false, error: "Only a Super Admin can record or change an equipment acquisition." };
const today = () => new Date().toISOString().slice(0, 10);

function friendly(message: string): string {
  if (/acquisitions_one_per_invoice/.test(message)) return "This supplier invoice is already recorded as an acquisition.";
  if (/obligations_one_per_reference|obligations_one_active_per_acquisition/.test(message)) return "This financing reference is already recorded.";
  if (/must be exactly/.test(message)) return "The instalments do not add up to the amount financed.";
  if (/THIS entity|purchase receipt or supplier invoice|two different documents/.test(message)) return "Each linked document must be the right kind of financial document in this entity's own vault.";
  return "The acquisition could not be recorded.";
}

export async function recordEquipmentAcquisition(p: { actorUserId: string; acquisition: AcquisitionInput; financing: FinancingInput | null }): Promise<{ ok: true; acquisitionId: string; obligationId: string | null } | Fail> {
  if (!(await isSuperAdminId(p.actorUserId))) return DENIED;
  const v = validateAcquisition(p.acquisition, p.financing, today());
  if (!v.ok) return v;
  // the same invoice or document must not already be recorded as an expense (read-only check; the optional database triggers are a second line of defence)
  const db = createAdminClient();
  const family = [...new Set([...(await documentFamily(db, p.acquisition.entityId, p.acquisition.invoiceDocumentId)), ...(p.financing ? await documentFamily(db, p.acquisition.entityId, p.financing.confirmationDocumentId) : [])])];
  const overlap = await expenseOverlapForAcquisition({ entityId: p.acquisition.entityId, invoiceNumber: p.acquisition.invoiceNumber, supplier: p.acquisition.supplier, documentFamily: family });
  if (overlap) return { ok: false, error: overlap };
  const { data, error } = await createAdminClient().rpc("record_equipment_acquisition", { p: v.payload, p_actor: p.actorUserId });
  if (error) { console.error("[equipment financing] record failed", error.message); return { ok: false, error: friendly(error.message) }; }
  const row = (Array.isArray(data) ? data[0] : data) as { acquisition_id: string; obligation_id: string | null } | null;
  if (!row) return { ok: false, error: "The acquisition could not be recorded." };
  await logActivity({ actorUserId: p.actorUserId, action: "equipment_acquisition.recorded", entityType: "employing_entity", entityId: p.acquisition.entityId,
    metadata: { acquisitionId: row.acquisition_id, obligationId: row.obligation_id, invoiceNumber: p.acquisition.invoiceNumber, net: p.acquisition.net, currency: p.acquisition.currency, classification: "pending_professional_review" } });
  return { ok: true, acquisitionId: row.acquisition_id, obligationId: row.obligation_id };
}

export async function markInstalmentPaid(p: { actorUserId: string; entityId: string; instalmentId: string; paidOn: string; evidenceDocumentId?: string | null; evidenceNote?: string | null }): Promise<{ ok: true } | Fail> {
  if (!(await isSuperAdminId(p.actorUserId))) return DENIED;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(p.paidOn) || p.paidOn > today()) return { ok: false, error: "The payment date must be a real date that is not in the future." };
  if (!p.evidenceDocumentId && (p.evidenceNote ?? "").trim().length < 10) return { ok: false, error: "An instalment can only be marked paid with evidence: a stored document, or a written note of what you saw." };
  // the instalment must belong to the entity the screen is showing (a tampered form cannot audit-log or pay another entity's instalment)
  const owner = await createAdminClient().from("entity_financing_instalments").select("id, entity_financing_obligations!inner(employing_entity_id)").eq("id", p.instalmentId).maybeSingle();
  const ownerEntity = (owner.data as { entity_financing_obligations?: { employing_entity_id?: string } | { employing_entity_id?: string }[] } | null)?.entity_financing_obligations;
  const ownerId = Array.isArray(ownerEntity) ? ownerEntity[0]?.employing_entity_id : ownerEntity?.employing_entity_id;
  if (ownerId !== p.entityId) return { ok: false, error: "That instalment does not belong to this legal entity." };
  const { error } = await createAdminClient().rpc("mark_instalment_paid", { p_instalment: p.instalmentId, p_paid_on: p.paidOn, p_evidence_document: p.evidenceDocumentId ?? null, p_evidence_note: (p.evidenceNote ?? "").trim() || null, p_actor: p.actorUserId });
  if (error) { console.error("[equipment financing] mark paid failed", error.message); return { ok: false, error: /not pending/.test(error.message) ? "That instalment is not pending." : "The payment could not be recorded." }; }
  await logActivity({ actorUserId: p.actorUserId, action: "equipment_instalment.paid", entityType: "employing_entity", entityId: p.entityId, metadata: { instalmentId: p.instalmentId, paidOn: p.paidOn } });
  return { ok: true };
}

export type EquipmentPanelData = { views: EquipmentView[]; invoiceDocs: DocRef[]; financialDocs: DocRef[] };
const FINANCIAL_TYPES = ["purchase_receipt", "supplier_invoice", "other_financial_document"];
// Reads only (Super Admin only; an unauthorised caller gets nothing). Documents are the existing vault's rows — this never stores or alters a file.
export async function loadEquipmentPanelData(entityId: string, actorUserId: string, entityLegalName: string): Promise<EquipmentPanelData> {
  const empty: EquipmentPanelData = { views: [], invoiceDocs: [], financialDocs: [] };
  if (!(await isSuperAdminId(actorUserId))) return empty;
  const db = createAdminClient();
  const [acq, ob, docs] = await Promise.all([
    db.from("entity_equipment_acquisitions").select("id, supplier_name, supplier_branch, invoice_number, purchase_date, item_description, quantity, currency, list_price_total, discount_total, net_amount, customer_as_shown, invoice_document_id, funding_source_status, funding_source_note, accounting_classification, bank_evidence_document_id, created_at").eq("employing_entity_id", entityId).eq("status", "recorded").order("purchase_date", { ascending: false }),
    db.from("entity_financing_obligations").select("id, acquisition_id, provider, provider_reference, instalment_count, financed_amount, plan_started_on, confirmation_document_id, schedule_basis, status").eq("employing_entity_id", entityId).neq("status", "void"),
    db.from("employing_entity_documents").select("id, document_type, original_filename, file_sha256").eq("employing_entity_id", entityId).in("document_type", FINANCIAL_TYPES).order("uploaded_at", { ascending: false }),
  ]);
  if (acq.error || ob.error || docs.error) { console.error("[equipment financing] load failed", acq.error?.message ?? ob.error?.message ?? docs.error?.message); return empty; }
  const obIds = (ob.data ?? []).map((o) => o.id as string);
  const ins = obIds.length ? await db.from("entity_financing_instalments").select("id, obligation_id, sequence, amount, expected_month, status, paid_on, evidence_document_id, bank_evidence_document_id, evidence_note").in("obligation_id", obIds) : { data: [], error: null };
  if (ins.error) { console.error("[equipment financing] load instalments failed", ins.error.message); return empty; }
  const docRefs: DocRef[] = (docs.data ?? []).map((d) => ({ id: d.id as string, filename: (d.original_filename as string | null) ?? null, sha256: (d.file_sha256 as string | null) ?? null, documentType: d.document_type as string }));
  const views = buildEquipmentViews({ acquisitions: (acq.data ?? []) as unknown as RawAcquisition[], obligations: (ob.data ?? []) as unknown as RawObligation[], instalments: (ins.data ?? []) as unknown as RawInstalment[], docs: docRefs, entityLegalName });
  return { views, invoiceDocs: docRefs.filter((d) => d.documentType === "purchase_receipt" || d.documentType === "supplier_invoice"), financialDocs: docRefs };
}
