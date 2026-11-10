// One cost must not be counted both as an equipment ACQUISITION (with its financing) and as an EXPENSE. This module only READS: it never writes, classifies or recognises anything.
// The rules are pure (matchers below); the two loaders fetch one legal entity's small tables with the admin client and apply them. The optional database triggers
// (PROPOSAL_optional_duplicate_expense_guard.sql) are the same rules, exact-row only, as a second line of defence.
import { createAdminClient } from "@/lib/supabase/admin";

const ref = (s: string | null | undefined) => (s ?? "").trim().toLowerCase();

export type AcquisitionRef = { invoiceNumber: string; supplier: string; invoiceDocumentId: string | null; statementDocumentId: string | null; financingDocumentIds: string[] };
export type ExpenseRef = { receiptNumber: string; issuingAuthority: string; sourceDocumentId: string | null };
export type Subject = { number: string; party: string; documentFamily: string[] };

// Does an expense (number, issuing authority, document family) repeat any recorded acquisition? Returns the reason, or null.
export function expenseRepeatsAcquisition(s: Subject, acquisitions: AcquisitionRef[]): string | null {
  const fam = new Set(s.documentFamily);
  for (const a of acquisitions) {
    if (ref(a.invoiceNumber) === ref(s.number) && ref(a.supplier) === ref(s.party)) return "This invoice is already recorded as an equipment acquisition, so it cannot also be recorded as an expense.";
    const docs = [a.invoiceDocumentId, a.statementDocumentId, ...a.financingDocumentIds].filter((x): x is string => Boolean(x));
    if (docs.some((d) => fam.has(d))) return "This stored document (or a copy of it) already backs an equipment acquisition or its financing, so it cannot also back an expense.";
  }
  return null;
}
// Does an acquisition (invoice number, supplier, document family) repeat any recorded expense?
export function acquisitionRepeatsExpense(s: Subject, expenses: ExpenseRef[]): string | null {
  const fam = new Set(s.documentFamily);
  for (const e of expenses) {
    if (ref(e.receiptNumber) === ref(s.number) && ref(e.issuingAuthority) === ref(s.party)) return "This invoice is already recorded as an expense, so it cannot also be recorded as an equipment acquisition.";
    if (e.sourceDocumentId && fam.has(e.sourceDocumentId)) return "This stored document (or a copy of it) already backs a recorded expense, so it cannot also back an equipment acquisition.";
  }
  return null;
}

type Db = ReturnType<typeof createAdminClient>;
// The document, plus every other row of the same entity holding the same bytes (a copy filed under another class), plus the document it replaces.
export async function documentFamily(db: Db, entityId: string, documentId: string): Promise<string[]> {
  const fam = new Set<string>([documentId]);
  const { data: doc } = await db.from("employing_entity_documents").select("id, file_sha256, relation, related_document_id").eq("id", documentId).eq("employing_entity_id", entityId).maybeSingle();
  if (doc?.relation === "new_version_of" && doc.related_document_id) fam.add(doc.related_document_id);
  if (doc?.file_sha256) {
    const { data: same } = await db.from("employing_entity_documents").select("id").eq("employing_entity_id", entityId).eq("file_sha256", doc.file_sha256);
    for (const d of same ?? []) fam.add(d.id as string);
  }
  return [...fam];
}

export async function acquisitionOverlapForExpense(p: { entityId: string; receiptNumber: string; issuingAuthority: string; documentFamily: string[] }): Promise<string | null> {
  const db = createAdminClient();
  const { data: acqs } = await db.from("entity_equipment_acquisitions").select("id, invoice_number, supplier_name, invoice_document_id, bank_evidence_document_id").eq("employing_entity_id", p.entityId).eq("status", "recorded");
  if (!acqs?.length) return null;                                         // no acquisitions (or the table is not there yet): nothing to overlap
  const { data: allObs } = await db.from("entity_financing_obligations").select("id, acquisition_id, confirmation_document_id, status").eq("employing_entity_id", p.entityId);
  const obs = (allObs ?? []).filter((o) => o.status !== "void");
  const { data: pays } = await db.from("entity_acquisition_payments").select("acquisition_id, evidence_document_id, status").in("acquisition_id", acqs.map((a) => a.id as string));   // payment evidence belongs to the acquisition too
  const obIds = obs.map((o) => o.id as string);
  const { data: ins } = obIds.length ? await db.from("entity_financing_instalments").select("obligation_id, evidence_document_id, bank_evidence_document_id").in("obligation_id", obIds) : { data: [] as { obligation_id: string; evidence_document_id: string | null; bank_evidence_document_id: string | null }[] };
  const refs: AcquisitionRef[] = acqs.map((a) => {
    const mine = obs.filter((o) => o.acquisition_id === a.id);
    const mineIds = new Set(mine.map((o) => o.id as string));
    const payDocs = (pays ?? []).filter((x) => x.acquisition_id === a.id && x.status === "recorded").map((x) => x.evidence_document_id as string | null);
    const fin = [...payDocs, ...mine.map((o) => o.confirmation_document_id as string | null), ...(ins ?? []).filter((i) => mineIds.has(i.obligation_id)).flatMap((i) => [i.evidence_document_id, i.bank_evidence_document_id])].filter((x): x is string => Boolean(x));
    return { invoiceNumber: a.invoice_number as string, supplier: a.supplier_name as string, invoiceDocumentId: (a.invoice_document_id as string | null) ?? null, statementDocumentId: (a.bank_evidence_document_id as string | null) ?? null, financingDocumentIds: fin };
  });
  return expenseRepeatsAcquisition({ number: p.receiptNumber, party: p.issuingAuthority, documentFamily: p.documentFamily }, refs);
}

export async function expenseOverlapForAcquisition(p: { entityId: string; invoiceNumber: string; supplier: string; documentFamily: string[] }): Promise<string | null> {
  const db = createAdminClient();
  const { data } = await db.from("entity_expenses").select("receipt_number, issuing_authority, source_document_id").eq("employing_entity_id", p.entityId).eq("status", "recorded");
  return acquisitionRepeatsExpense({ number: p.invoiceNumber, party: p.supplier, documentFamily: p.documentFamily }, (data ?? []).map((e) => ({ receiptNumber: e.receipt_number as string, issuingAuthority: e.issuing_authority as string, sourceDocumentId: (e.source_document_id as string | null) ?? null })));
}
