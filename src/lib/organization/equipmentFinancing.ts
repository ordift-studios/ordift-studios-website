import { createAdminClient } from "@/lib/supabase/admin";
import { logActivity } from "@/lib/admin/activityLog";
import { isSuperAdminId } from "@/lib/organization/authority";
import { outstandingBalance, paidTotal, validateAcquisition, type AcquisitionInput, type FinancingInput } from "./equipmentFinancingRules";

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
  const { error } = await createAdminClient().rpc("mark_instalment_paid", { p_instalment: p.instalmentId, p_paid_on: p.paidOn, p_evidence_document: p.evidenceDocumentId ?? null, p_evidence_note: (p.evidenceNote ?? "").trim() || null, p_actor: p.actorUserId });
  if (error) { console.error("[equipment financing] mark paid failed", error.message); return { ok: false, error: /not pending/.test(error.message) ? "That instalment is not pending." : "The payment could not be recorded." }; }
  await logActivity({ actorUserId: p.actorUserId, action: "equipment_instalment.paid", entityType: "employing_entity", entityId: p.entityId, metadata: { instalmentId: p.instalmentId, paidOn: p.paidOn } });
  return { ok: true };
}

export type EquipmentOverview = {
  acquisitionId: string; supplier: string; invoiceNumber: string; purchaseDate: string; itemDescription: string; currency: string; net: number; classification: string; funding: string;
  financing: { provider: string; reference: string; status: string; scheduleBasis: string; instalments: { id: string; sequence: number; amount: number; expectedMonth: string; status: string; paidOn: string | null }[]; paid: number; outstanding: number } | null;
};
export async function loadEquipmentOverview(entityId: string, actorUserId: string): Promise<EquipmentOverview[]> {
  if (!(await isSuperAdminId(actorUserId))) return [];
  const db = createAdminClient();
  const { data: acqs } = await db.from("entity_equipment_acquisitions").select("id, supplier_name, invoice_number, purchase_date, item_description, currency, net_amount, accounting_classification, funding_source_status").eq("employing_entity_id", entityId).eq("status", "recorded").order("purchase_date", { ascending: false });
  const out: EquipmentOverview[] = [];
  for (const a of acqs ?? []) {
    const { data: ob } = await db.from("entity_financing_obligations").select("id, provider, provider_reference, status, schedule_basis").eq("acquisition_id", a.id).neq("status", "void").maybeSingle();
    const { data: ins } = ob ? await db.from("entity_financing_instalments").select("id, sequence, amount, expected_month, status, paid_on").eq("obligation_id", ob.id).order("sequence") : { data: [] as never[] };
    const rows = (ins ?? []).map((i) => ({ id: i.id as string, sequence: i.sequence as number, amount: Number(i.amount), expectedMonth: i.expected_month as string, status: i.status as string, paidOn: (i.paid_on as string | null) ?? null }));
    out.push({ acquisitionId: a.id, supplier: a.supplier_name, invoiceNumber: a.invoice_number, purchaseDate: a.purchase_date, itemDescription: a.item_description, currency: a.currency, net: Number(a.net_amount), classification: a.accounting_classification, funding: a.funding_source_status,
      financing: ob ? { provider: ob.provider, reference: ob.provider_reference, status: ob.status, scheduleBasis: ob.schedule_basis, instalments: rows, paid: paidTotal(rows), outstanding: outstandingBalance(rows) } : null });
  }
  return out;
}
