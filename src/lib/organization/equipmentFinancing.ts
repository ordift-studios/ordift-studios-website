import { createAdminClient } from "@/lib/supabase/admin";
import { logActivity } from "@/lib/admin/activityLog";
import { isSuperAdminId } from "@/lib/organization/authority";
import { buildEquipmentViews, type DocRef, type EquipmentView, type RawAcquisition, type RawInstalment, type RawObligation, type RawPayment, type RawTerms } from "./equipmentPanelView";
import { validatePayment, validateTerms, type PaymentInput, type TermsInput } from "./acquisitionPaymentRules";
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

// ---------------------------------------------------------------------------------------------------------------- payment arrangements (non-financed purchases)
// Terms and payments are written ONLY through the three audited database functions (migration proposal PROPOSAL_acquisition_payment_arrangements.sql). A payment is REPORTED with evidence;
// nothing here verifies it against a statement, creates an expense or classifies anything. The database re-checks every rule under a row lock (the cap on the net price, no double counting with financing).
function paymentFriendly(message: string): string {
  if (/would total/.test(message)) return "This payment would take the total above the net price.";
  if (/twice|financed acquisition/.test(message)) return "A financed purchase is paid through its instalments; direct payments are not accepted.";
  if (/"unpaid"/.test(message)) return "The arrangement is 'not yet paid': change the arrangement before recording a payment.";
  if (/identical payment/.test(message)) return "An identical payment (same amount, date, method and reference) is already recorded.";
  if (/future/.test(message)) return "The payment date cannot be in the future.";
  if (/THIS entity/.test(message)) return "The evidence document must be a financial document in this legal entity's own vault.";
  if (/full payment must equal/.test(message)) return "A full payment must equal the net price and be the only payment.";
  if (/before the purchase date/.test(message)) return "The balance due date cannot be before the purchase date.";
  if (/already recorded/.test(message)) return "Payments are already recorded, so the arrangement cannot be 'not yet paid'.";
  if (/not recorded/.test(message)) return "That payment is not recorded (it may already be voided).";
  return "The change could not be recorded.";
}
async function acquisitionFacts(acquisitionId: string): Promise<{ entityId: string; net: number; paid: number; financed: boolean } | null> {
  const db = createAdminClient();
  const { data: a } = await db.from("entity_equipment_acquisitions").select("employing_entity_id, net_amount, status").eq("id", acquisitionId).maybeSingle();
  if (!a || a.status !== "recorded") return null;
  const { data: pays } = await db.from("entity_acquisition_payments").select("amount, status").eq("acquisition_id", acquisitionId);
  const { data: obs } = await db.from("entity_financing_obligations").select("status").eq("acquisition_id", acquisitionId);
  const paid = (pays ?? []).filter((x) => x.status === "recorded").reduce((n, x) => n + Math.round(Number(x.amount) * 100), 0) / 100;
  return { entityId: a.employing_entity_id as string, net: Number(a.net_amount), paid, financed: (obs ?? []).some((o) => o.status !== "void") };
}

// ONE atomic database call for a NON-financed purchase with its terms and/or first payment (migration 0187 record_acquisition_bundle): all or nothing, so no half-recorded purchase can exist.
// A retry after a lost response is refused by the unique invoice index and creates nothing. A financed purchase keeps recordEquipmentAcquisition (its own atomic path).
export async function recordAcquisitionBundle(p: { actorUserId: string; acquisition: AcquisitionInput; terms: TermsInput | null; payment: PaymentInput | null }): Promise<{ ok: true; acquisitionId: string } | Fail> {
  if (!(await isSuperAdminId(p.actorUserId))) return DENIED;
  const v = validateAcquisition(p.acquisition, null, today());
  if (!v.ok) return v;
  let terms: Record<string, unknown> | null = null, payment: Record<string, unknown> | null = null;
  if (p.terms) { const t = validateTerms(p.terms); if (!t.ok) return t; terms = { arrangement: t.value.arrangement, balanceDueOn: t.value.balanceDueOn, supplierTerms: t.value.supplierTerms, note: t.value.note }; }
  if (p.payment) {
    if (p.terms?.arrangement === "unpaid") return { ok: false, error: "A purchase marked 'not yet paid' cannot have a payment." };
    const pv = validatePayment(p.payment, { net: p.acquisition.net, alreadyPaid: 0, today: today() });
    if (!pv.ok) return pv;
    payment = { ...pv.value };
  }
  const db = createAdminClient();
  const family = await documentFamily(db, p.acquisition.entityId, p.acquisition.invoiceDocumentId);
  const overlap = await expenseOverlapForAcquisition({ entityId: p.acquisition.entityId, invoiceNumber: p.acquisition.invoiceNumber, supplier: p.acquisition.supplier, documentFamily: family });
  if (overlap) return { ok: false, error: overlap };
  const { data, error } = await db.rpc("record_acquisition_bundle", { p: { entityId: p.acquisition.entityId, acquisition: v.payload.acquisition, terms, payment }, p_actor: p.actorUserId });
  if (error) { console.error("[equipment financing] bundle failed", error.message); return { ok: false, error: /acquisitions_one_per_invoice/.test(error.message) ? friendly(error.message) : paymentFriendly(error.message) }; }
  const row = (Array.isArray(data) ? data[0] : data) as { new_acquisition_id: string } | null;
  if (!row) return { ok: false, error: "The acquisition could not be recorded." };
  await logActivity({ actorUserId: p.actorUserId, action: "equipment_acquisition.recorded", entityType: "employing_entity", entityId: p.acquisition.entityId,
    metadata: { acquisitionId: row.new_acquisition_id, invoiceNumber: p.acquisition.invoiceNumber, net: p.acquisition.net, currency: p.acquisition.currency, classification: "pending_professional_review", arrangement: terms?.arrangement ?? "to_confirm", paymentRecorded: Boolean(payment), bankVerified: false } });
  return { ok: true, acquisitionId: row.new_acquisition_id };
}

export async function setAcquisitionTerms(p: { actorUserId: string; entityId: string; acquisitionId: string; terms: TermsInput }): Promise<{ ok: true } | Fail> {
  if (!(await isSuperAdminId(p.actorUserId))) return DENIED;
  const v = validateTerms(p.terms);
  if (!v.ok) return v;
  const facts = await acquisitionFacts(p.acquisitionId);
  if (!facts || facts.entityId !== p.entityId) return { ok: false, error: "That purchase does not belong to this legal entity." };
  if (facts.financed) return { ok: false, error: "A financed purchase is paid through its instalments and has no payment terms." };
  const { error } = await createAdminClient().rpc("set_acquisition_terms", { p_acquisition: p.acquisitionId, p_arrangement: v.value.arrangement, p_due: v.value.balanceDueOn, p_supplier_terms: v.value.supplierTerms, p_note: v.value.note, p_actor: p.actorUserId });
  if (error) { console.error("[equipment financing] set terms failed", error.message); return { ok: false, error: paymentFriendly(error.message) }; }
  await logActivity({ actorUserId: p.actorUserId, action: "equipment_terms.set", entityType: "employing_entity", entityId: p.entityId, metadata: { acquisitionId: p.acquisitionId, arrangement: v.value.arrangement, balanceDueOn: v.value.balanceDueOn } });
  return { ok: true };
}

export async function recordAcquisitionPayment(p: { actorUserId: string; entityId: string; acquisitionId: string; payment: PaymentInput }): Promise<{ ok: true } | Fail> {
  if (!(await isSuperAdminId(p.actorUserId))) return DENIED;
  const facts = await acquisitionFacts(p.acquisitionId);
  if (!facts || facts.entityId !== p.entityId) return { ok: false, error: "That purchase does not belong to this legal entity." };
  if (facts.financed) return { ok: false, error: "A financed purchase is paid through its instalments; direct payments are not accepted." };
  const v = validatePayment(p.payment, { net: facts.net, alreadyPaid: facts.paid, today: today() });
  if (!v.ok) return v;
  const { error } = await createAdminClient().rpc("record_acquisition_payment", { p_acquisition: p.acquisitionId, p_kind: v.value.kind, p_amount: v.value.amount, p_paid_on: v.value.paidOn, p_method: v.value.method, p_method_note: v.value.methodNote, p_reference: v.value.reference, p_evidence_doc: v.value.evidenceDocumentId, p_evidence_note: v.value.evidenceNote, p_actor: p.actorUserId });
  if (error) { console.error("[equipment financing] record payment failed", error.message); return { ok: false, error: paymentFriendly(error.message) }; }
  await logActivity({ actorUserId: p.actorUserId, action: "equipment_payment.recorded", entityType: "employing_entity", entityId: p.entityId, metadata: { acquisitionId: p.acquisitionId, kind: v.value.kind, amount: v.value.amount, method: v.value.method, paidOn: v.value.paidOn, bankVerified: false } });
  return { ok: true };
}

export async function voidAcquisitionPayment(p: { actorUserId: string; entityId: string; paymentId: string; reason: string }): Promise<{ ok: true } | Fail> {
  if (!(await isSuperAdminId(p.actorUserId))) return DENIED;
  if (p.reason.trim().length < 10) return { ok: false, error: "Give a written reason of at least 10 characters." };
  const { data: pay } = await createAdminClient().from("entity_acquisition_payments").select("employing_entity_id").eq("id", p.paymentId).maybeSingle();
  if (!pay || pay.employing_entity_id !== p.entityId) return { ok: false, error: "That payment does not belong to this legal entity." };
  const { error } = await createAdminClient().rpc("void_acquisition_payment", { p_payment: p.paymentId, p_reason: p.reason.trim(), p_actor: p.actorUserId });
  if (error) { console.error("[equipment financing] void payment failed", error.message); return { ok: false, error: paymentFriendly(error.message) }; }
  await logActivity({ actorUserId: p.actorUserId, action: "equipment_payment.voided", entityType: "employing_entity", entityId: p.entityId, metadata: { paymentId: p.paymentId } });
  return { ok: true };
}

// Migration 0190: void a whole acquisition (its financing, instalments and recorded payments are kept, marked void, with the reason). One database call, one audit event; nothing is edited or deleted,
// no expense, payment or statement verification is created, and the invoice number and financing reference become free again so a corrected record can be entered.
function voidAcquisitionFriendly(message: string): string {
  if (/linked to an asset/.test(message)) return "This acquisition is linked to an asset. Unlink the asset first (audited), then void the acquisition.";
  if (/statement is already linked/.test(message)) return "A bank or card statement is already linked to this acquisition. It was reconciled, so it cannot be voided here.";
  if (/already settled/.test(message)) return "The financing is already fully paid (settled), so it cannot be voided here.";
  if (/not a recorded acquisition/.test(message)) return "That acquisition is not recorded (it may already be voided).";
  if (/at least 10 characters/.test(message)) return "Give a written reason of at least 10 characters.";
  return "The acquisition could not be voided.";
}
export async function voidEquipmentAcquisition(p: { actorUserId: string; entityId: string; acquisitionId: string; reason: string }): Promise<{ ok: true } | Fail> {
  if (!(await isSuperAdminId(p.actorUserId))) return DENIED;
  if (p.reason.trim().length < 10) return { ok: false, error: "Give a written reason of at least 10 characters." };
  const db = createAdminClient();
  const { data: a } = await db.from("entity_equipment_acquisitions").select("employing_entity_id").eq("id", p.acquisitionId).maybeSingle();
  if (!a || a.employing_entity_id !== p.entityId) return { ok: false, error: "That acquisition does not belong to this legal entity." };
  const { error } = await db.rpc("void_equipment_acquisition", { p_acquisition: p.acquisitionId, p_reason: p.reason.trim(), p_actor: p.actorUserId });
  if (error) { console.error("[equipment financing] void acquisition failed", error.message); return { ok: false, error: voidAcquisitionFriendly(error.message) }; }
  await logActivity({ actorUserId: p.actorUserId, action: "equipment_acquisition.voided", entityType: "employing_entity", entityId: p.entityId, metadata: { acquisitionId: p.acquisitionId } });
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
    db.from("entity_equipment_acquisitions").select("id, supplier_name, supplier_branch, invoice_number, purchase_date, item_description, quantity, currency, list_price_total, discount_total, net_amount, customer_as_shown, invoice_document_id, funding_source_status, funding_source_note, accounting_classification, bank_evidence_document_id, created_at, company_asset_id, status, void_reason").eq("employing_entity_id", entityId).in("status", ["recorded", "void"]).order("purchase_date", { ascending: false }),
    db.from("entity_financing_obligations").select("id, acquisition_id, provider, provider_reference, instalment_count, financed_amount, plan_started_on, confirmation_document_id, schedule_basis, status").eq("employing_entity_id", entityId),
    db.from("employing_entity_documents").select("id, document_type, original_filename, file_sha256").eq("employing_entity_id", entityId).in("document_type", FINANCIAL_TYPES).order("uploaded_at", { ascending: false }),
  ]);
  if (acq.error || ob.error || docs.error) { console.error("[equipment financing] load failed", acq.error?.message ?? ob.error?.message ?? docs.error?.message); return empty; }
  const acqIds = (acq.data ?? []).map((a) => a.id as string);
  // terms and payments exist from the payment-arrangements migration; before it is applied these reads simply return nothing
  const termsRes = acqIds.length ? await db.from("entity_acquisition_terms").select("id, acquisition_id, arrangement, balance_due_on, supplier_terms, note, status, created_at").in("acquisition_id", acqIds) : { data: [], error: null };
  const paysRes = acqIds.length ? await db.from("entity_acquisition_payments").select("id, acquisition_id, kind, amount, currency, paid_on, method, method_note, reference, evidence_document_id, evidence_note, status, void_reason, created_at").in("acquisition_id", acqIds) : { data: [], error: null };
  const obIds = (ob.data ?? []).map((o) => o.id as string);
  const ins = obIds.length ? await db.from("entity_financing_instalments").select("id, obligation_id, sequence, amount, expected_month, status, paid_on, evidence_document_id, bank_evidence_document_id, evidence_note").in("obligation_id", obIds) : { data: [], error: null };
  if (ins.error) { console.error("[equipment financing] load instalments failed", ins.error.message); return empty; }
  const docRefs: DocRef[] = (docs.data ?? []).map((d) => ({ id: d.id as string, filename: (d.original_filename as string | null) ?? null, sha256: (d.file_sha256 as string | null) ?? null, documentType: d.document_type as string }));
  const views = buildEquipmentViews({ acquisitions: (acq.data ?? []) as unknown as RawAcquisition[], obligations: (ob.data ?? []) as unknown as RawObligation[], instalments: (ins.data ?? []) as unknown as RawInstalment[], docs: docRefs, entityLegalName,
    terms: (termsRes.error ? [] : termsRes.data ?? []) as unknown as RawTerms[], payments: (paysRes.error ? [] : paysRes.data ?? []) as unknown as RawPayment[] });
  return { views, invoiceDocs: docRefs.filter((d) => d.documentType === "purchase_receipt" || d.documentType === "supplier_invoice"), financialDocs: docRefs };
}
