import { createAdminClient } from "@/lib/supabase/admin";
import { logActivity } from "@/lib/admin/activityLog";
import { isSuperAdminId } from "@/lib/organization/authority";
import { reconcileReceipt, type KnownDocument, type ReceiptLine, type RegistrationFact, type RegistrationKind, type RegistrationStatus, checkDuplicate, sha256OfBytes, ENTITY_DOCUMENT_TYPES } from "@/lib/organization/entityRegistry";

// Per-entity registrations, permits, authorised signatories and receipt-backed expenses (migration 0165). Every read and write is
// Super-Admin-only and re-checked here, because the admin client bypasses row-level security. Each entity's records are separate:
// every query is keyed to one entity id. NOTHING here creates a bank transaction, payable, reimbursement or payment instruction.

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };
const NOT_ALLOWED = { ok: false as const, error: "Only a Super Admin can do that." };

// ------------------------------------------------------------------ registrations
const REG_SELECT = "id, kind, status, identifier, issued_on, valid_from, expires_on, issuing_authority, facts, note, source_document_id, supersedes_id, verified_at, created_at";
type RegRow = { id: string; kind: string; status: string; identifier: string | null; issued_on: string | null; valid_from: string | null; expires_on: string | null; issuing_authority: string | null; facts: Record<string, unknown> | null; note: string | null; source_document_id: string | null; supersedes_id: string | null; verified_at: string | null; created_at: string };
export type EntityRegistration = RegistrationFact & { validFrom: string | null; issuingAuthority: string | null; sourceDocumentId: string | null; supersedesId: string | null; createdAt: string };
const mapReg = (r: RegRow): EntityRegistration => ({
  id: r.id, kind: r.kind as RegistrationKind, status: r.status as RegistrationStatus, identifier: r.identifier, issuedOn: r.issued_on, validFrom: r.valid_from, expiresOn: r.expires_on,
  issuingAuthority: r.issuing_authority, facts: r.facts ?? {}, note: r.note, sourceDocumentId: r.source_document_id, supersedesId: r.supersedes_id, verifiedAt: r.verified_at, createdAt: r.created_at,
});

export async function listEntityRegistrations(entityId: string, actorUserId: string, opts: { includeHistory?: boolean } = {}): Promise<EntityRegistration[]> {
  if (!(await isSuperAdminId(actorUserId))) return [];
  const q = createAdminClient().from("entity_registrations").select(REG_SELECT).eq("employing_entity_id", entityId);
  const { data, error } = await (opts.includeHistory ? q : q.in("status", ["active", "pending", "not_issued", "expired"])).order("created_at");
  if (error) { console.error("[entity registry] failed to load registrations", error.message); return []; }
  return ((data ?? []) as RegRow[]).map(mapReg);
}

const PERMIT_NUMBER = /^[A-Za-z0-9][A-Za-z0-9\-/ ]{2,39}$/;

// Records the Commercial Permit once the Founder has it: the permit document must already be in the vault for THIS entity, the entity must
// hold a current commercial registration, and the pending "not issued" record is superseded (kept in history). Premises are recorded only
// here, from what the Founder supplies — never inferred.
export async function recordCommercialPermit(p: {
  entityId: string; permitNumber: string; issuedOn: string; expiresOn: string | null; issuingAuthority: string; premisesAddress: string; sourceDocumentId: string; actorUserId: string;
}): Promise<Result<{ registrationId: string }>> {
  if (!(await isSuperAdminId(p.actorUserId))) return NOT_ALLOWED;
  if (!PERMIT_NUMBER.test(p.permitNumber.trim())) return { ok: false, error: "Enter the permit number exactly as it appears on the permit." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(p.issuedOn)) return { ok: false, error: "Enter the date the permit was issued." };
  if (p.expiresOn && (!/^\d{4}-\d{2}-\d{2}$/.test(p.expiresOn) || p.expiresOn < p.issuedOn)) return { ok: false, error: "The expiry date must be on or after the issue date." };
  if (p.premisesAddress.trim().length < 8) return { ok: false, error: "Enter the confirmed business premises address." };
  if (p.issuingAuthority.trim().length < 3) return { ok: false, error: "Enter the issuing authority." };

  const db = createAdminClient();
  const { data: doc } = await db.from("employing_entity_documents").select("id, document_type").eq("id", p.sourceDocumentId).eq("employing_entity_id", p.entityId).maybeSingle();
  if (!doc) return { ok: false, error: "Upload the permit document to this entity's vault first, then record the permit." };
  if (doc.document_type !== "commercial_permit") return { ok: false, error: "The selected document is not classed as a Commercial Permit." };

  const { data: cur } = await db.from("entity_registrations").select("id, status, kind").eq("employing_entity_id", p.entityId).in("kind", ["commercial_registration", "commercial_permit"]).in("status", ["active", "pending", "not_issued"]);
  if (!(cur ?? []).some((r) => r.kind === "commercial_registration" && r.status === "active")) return { ok: false, error: "This entity has no active commercial registration on record." };
  const pending = (cur ?? []).find((r) => r.kind === "commercial_permit");
  if (pending && pending.status === "active") return { ok: false, error: "A commercial permit is already recorded. Record a renewal as a replacement after retiring the current one." };

  if (pending) { const { error } = await db.from("entity_registrations").update({ status: "superseded" }).eq("id", pending.id); if (error) return { ok: false, error: "Could not retire the pending permit record." }; }
  const { data, error } = await db.from("entity_registrations").insert({
    employing_entity_id: p.entityId, kind: "commercial_permit", status: "active", identifier: p.permitNumber.trim(), issued_on: p.issuedOn, valid_from: p.issuedOn, expires_on: p.expiresOn,
    issuing_authority: p.issuingAuthority.trim(), facts: { premises: p.premisesAddress.trim() }, source_document_id: p.sourceDocumentId, supersedes_id: pending?.id ?? null, recorded_by: p.actorUserId,
  }).select("id").single();
  if (error || !data) return { ok: false, error: error?.message ?? "Could not record the permit." };
  await logActivity({ actorUserId: p.actorUserId, action: "entity_registration.permit_recorded", entityType: "employing_entity", entityId: p.entityId, metadata: { registrationId: data.id, documentId: p.sourceDocumentId } });
  return { ok: true, registrationId: data.id };
}

// The 60-working-day condition has no deadline until the approval-notice date is known. Recording it is a replacement record, so the
// original (unconfirmed) one stays in history.
export async function confirmApprovalNoticeDate(p: { entityId: string; approvalNoticeDate: string; actorUserId: string }): Promise<Result<{ registrationId: string }>> {
  if (!(await isSuperAdminId(p.actorUserId))) return NOT_ALLOWED;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(p.approvalNoticeDate)) return { ok: false, error: "Enter the date you received the official approval notice." };
  const db = createAdminClient();
  const { data: cur } = await db.from("entity_registrations").select("*").eq("employing_entity_id", p.entityId).eq("kind", "investment_approval_condition").eq("status", "pending").maybeSingle();
  if (!cur) return { ok: false, error: "There is no open investment-approval condition for this entity." };
  await db.from("entity_registrations").update({ status: "superseded" }).eq("id", cur.id);
  const { data, error } = await db.from("entity_registrations").insert({
    employing_entity_id: p.entityId, kind: "investment_approval_condition", status: "pending", issued_on: cur.issued_on, issuing_authority: cur.issuing_authority,
    facts: { ...(cur.facts as object), approvalNoticeDate: p.approvalNoticeDate }, source_document_id: cur.source_document_id, supersedes_id: cur.id, recorded_by: p.actorUserId,
    note: "Approval-notice date confirmed by the Founder.",
  }).select("id").single();
  if (error || !data) return { ok: false, error: error?.message ?? "Could not record the date." };
  await logActivity({ actorUserId: p.actorUserId, action: "entity_registration.approval_notice_date_confirmed", entityType: "employing_entity", entityId: p.entityId, metadata: { registrationId: data.id } });
  return { ok: true, registrationId: data.id };
}

// ------------------------------------------------------------------ signatories
export type EntitySignatory = { id: string; fullName: string; position: string; authority: string | null; nationality: string | null; ownershipPercent: number | null; effectiveFrom: string | null };
export async function listEntitySignatories(entityId: string, actorUserId: string): Promise<EntitySignatory[]> {
  if (!(await isSuperAdminId(actorUserId))) return [];
  const { data } = await createAdminClient().from("entity_signatories").select("id, full_name, position, authority, nationality, ownership_percent, effective_from").eq("employing_entity_id", entityId).is("effective_to", null).order("created_at");
  return (data ?? []).map((r) => ({ id: r.id, fullName: r.full_name, position: r.position, authority: r.authority, nationality: r.nationality, ownershipPercent: r.ownership_percent == null ? null : Number(r.ownership_percent), effectiveFrom: r.effective_from }));
}

// ------------------------------------------------------------------ vault documents (hash, metadata, duplicate detection)
const BUCKET = "legal-entity-documents";
const MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED_MIME = new Set(["application/pdf", "image/jpeg", "image/png"]);

export type VaultDocument = { id: string; documentType: string; filename: string | null; sha256: string | null; sizeBytes: number | null; issuedOn: string | null; expiresOn: string | null; issuingAuthority: string | null; relation: string | null; relatedDocumentId: string | null; notes: string | null; uploadedAt: string };
export async function listVaultDocuments(entityId: string, actorUserId: string): Promise<VaultDocument[]> {
  if (!(await isSuperAdminId(actorUserId))) return [];
  const { data, error } = await createAdminClient().from("employing_entity_documents").select("id, document_type, original_filename, file_sha256, size_bytes, issued_on, expires_on, issuing_authority, relation, related_document_id, notes, uploaded_at").eq("employing_entity_id", entityId).order("uploaded_at", { ascending: false });
  if (error) { console.error("[entity registry] failed to load documents", error.message); return []; }
  return (data ?? []).map((r) => ({ id: r.id, documentType: r.document_type, filename: r.original_filename, sha256: r.file_sha256, sizeBytes: r.size_bytes == null ? null : Number(r.size_bytes), issuedOn: r.issued_on, expiresOn: r.expires_on, issuingAuthority: r.issuing_authority, relation: r.relation, relatedDocumentId: r.related_document_id, notes: r.notes, uploadedAt: r.uploaded_at }));
}

// Stores one official document. The file is hashed first: an exact copy of a document already in this entity's vault is recorded as a
// duplicate that points at the original and shares its stored object — the original is never replaced, overwritten or deleted, and a
// second copy of the bytes is not stored. A document with overlapping content (e.g. a fuller version of a shorter one) is stored as
// its own file and linked with `overlapOf`.
export async function addVaultDocument(p: {
  entityId: string; documentType: string; filename: string; mimeType: string; bytes: Uint8Array; notes?: string | null;
  issuedOn?: string | null; expiresOn?: string | null; issuingAuthority?: string | null; overlapOf?: string | null; actorUserId: string;
}): Promise<Result<{ documentId: string; duplicateOf: string | null }>> {
  if (!(await isSuperAdminId(p.actorUserId))) return NOT_ALLOWED;
  if (!ENTITY_DOCUMENT_TYPES.some((t) => t.value === p.documentType)) return { ok: false, error: "Choose what kind of document this is." };
  if (!ALLOWED_MIME.has(p.mimeType)) return { ok: false, error: "Only PDF, JPEG or PNG files can be stored." };
  if (p.bytes.byteLength === 0 || p.bytes.byteLength > MAX_BYTES) return { ok: false, error: "The file must be between 1 byte and 10 MB." };
  for (const d of [p.issuedOn, p.expiresOn]) if (d && !/^\d{4}-\d{2}-\d{2}$/.test(d)) return { ok: false, error: "Dates must be entered as YYYY-MM-DD." };

  const db = createAdminClient();
  const sha = sha256OfBytes(p.bytes);
  const { data: rows } = await db.from("employing_entity_documents").select("id, document_type, original_filename, file_sha256, storage_path, relation").eq("employing_entity_id", p.entityId);
  const known: KnownDocument[] = (rows ?? []).filter((r) => r.relation == null).map((r) => ({ id: r.id, sha256: r.file_sha256, documentType: r.document_type, filename: r.original_filename }));
  const verdict = checkDuplicate(known, sha);

  let storagePath: string;
  if (verdict.kind === "exact_duplicate_of") {
    storagePath = (rows ?? []).find((r) => r.id === verdict.of.id)!.storage_path;       // shares the original's object; nothing new is stored
  } else {
    storagePath = `${p.entityId}/${sha.slice(0, 16)}-${p.filename.replace(/[^A-Za-z0-9._-]+/g, "_")}`;
    const up = await db.storage.from(BUCKET).upload(storagePath, Buffer.from(p.bytes), { contentType: p.mimeType, upsert: false });
    if (up.error) { console.error("[entity registry] upload failed", up.error.message); return { ok: false, error: "Failed to upload the file." }; }
  }
  const relation = verdict.kind === "exact_duplicate_of" ? { relation: "exact_duplicate_of", related_document_id: verdict.of.id } : p.overlapOf ? { relation: "partial_overlap_of", related_document_id: p.overlapOf } : { relation: null, related_document_id: null };
  const { data, error } = await db.from("employing_entity_documents").insert({
    employing_entity_id: p.entityId, document_type: p.documentType, storage_path: storagePath, notes: p.notes ?? null, uploaded_by: p.actorUserId,
    original_filename: p.filename, mime_type: p.mimeType, size_bytes: p.bytes.byteLength, file_sha256: sha, issued_on: p.issuedOn ?? null, expires_on: p.expiresOn ?? null, issuing_authority: p.issuingAuthority ?? null, ...relation,
  }).select("id").single();
  if (error || !data) return { ok: false, error: error?.message ?? "The file was stored but its record failed to save." };
  await logActivity({ actorUserId: p.actorUserId, action: "employing_entity_document.uploaded", entityType: "employing_entity", entityId: p.entityId, metadata: { documentId: data.id, documentType: p.documentType, duplicateOf: verdict.kind === "exact_duplicate_of" ? verdict.of.id : null } });
  return { ok: true, documentId: data.id, duplicateOf: verdict.kind === "exact_duplicate_of" ? verdict.of.id : null };
}

// ------------------------------------------------------------------ expenses
export type EntityExpense = { id: string; expenseDate: string; amount: number; currency: string; category: string; lineCode: string; description: string; receiptNumber: string; receiptTotal: number; issuingAuthority: string; requestReference: string | null; sourceDocumentId: string | null; payerAsShown: string | null; fundingSourceStatus: string; fundingSourceNote: string | null; accountingTreatment: string; status: string };
const EXP_SELECT = "id, expense_date, amount, currency, category, line_code, description, receipt_number, receipt_total, issuing_authority, request_reference, source_document_id, payer_as_shown, funding_source_status, funding_source_note, accounting_treatment, status";
export async function listEntityExpenses(entityId: string, actorUserId: string): Promise<EntityExpense[]> {
  if (!(await isSuperAdminId(actorUserId))) return [];
  const { data } = await createAdminClient().from("entity_expenses").select(EXP_SELECT).eq("employing_entity_id", entityId).order("expense_date").order("created_at");
  return (data ?? []).map((r) => ({ id: r.id, expenseDate: r.expense_date, amount: Number(r.amount), currency: r.currency, category: r.category, lineCode: r.line_code, description: r.description, receiptNumber: r.receipt_number, receiptTotal: Number(r.receipt_total), issuingAuthority: r.issuing_authority, requestReference: r.request_reference, sourceDocumentId: r.source_document_id, payerAsShown: r.payer_as_shown, fundingSourceStatus: r.funding_source_status, fundingSourceNote: r.funding_source_note, accountingTreatment: r.accounting_treatment, status: r.status }));
}

// Records every payable line of ONE receipt, all or nothing: the lines must add up to the printed total, the receipt must be a document in
// this entity's vault, and a receipt already recorded is refused (so two copies of the same receipt can never double-count). The payer is
// stored as the receipt shows it; the funding source stays "to confirm" until a Super Admin confirms it.
export async function recordEntityReceipt(p: {
  entityId: string; receiptNumber: string; receiptDate: string; issuingAuthority: string; requestReference?: string | null; currency: string; printedTotal: number;
  lines: ReceiptLine[]; category: string; payerAsShown: string | null; sourceDocumentId: string; actorUserId: string;
}): Promise<Result<{ recorded: number; total: number }>> {
  if (!(await isSuperAdminId(p.actorUserId))) return NOT_ALLOWED;
  if (!p.receiptNumber.trim()) return { ok: false, error: "Enter the receipt number printed on the receipt." };
  const rec = reconcileReceipt(p.lines, p.printedTotal);
  if (!rec.ok) return { ok: false, error: `The lines add up to ${rec.sum.toFixed(2)} but the receipt total is ${p.printedTotal.toFixed(2)} (difference ${rec.difference.toFixed(2)}). Nothing was recorded.` };
  if (rec.payable.length === 0) return { ok: false, error: "The receipt has no payable lines." };

  const db = createAdminClient();
  const { data: doc } = await db.from("employing_entity_documents").select("id, document_type").eq("id", p.sourceDocumentId).eq("employing_entity_id", p.entityId).maybeSingle();
  if (!doc) return { ok: false, error: "Upload the receipt to this entity's vault first." };
  if (doc.document_type !== "government_receipt") return { ok: false, error: "The selected document is not classed as a payment receipt." };
  const { data: existing } = await db.from("entity_expenses").select("id").eq("employing_entity_id", p.entityId).eq("receipt_number", p.receiptNumber.trim()).limit(1);
  if ((existing ?? []).length) return { ok: false, error: "This receipt is already recorded for this entity, so it was not recorded again." };

  const rows = rec.payable.map((l) => ({
    employing_entity_id: p.entityId, expense_date: p.receiptDate, amount: l.amount, currency: p.currency, category: p.category, line_code: l.code, description: l.description,
    receipt_number: p.receiptNumber.trim(), receipt_total: p.printedTotal, issuing_authority: p.issuingAuthority, request_reference: p.requestReference ?? null,
    source_document_id: p.sourceDocumentId, payer_as_shown: p.payerAsShown, recorded_by: p.actorUserId,
  }));
  const { error } = await db.from("entity_expenses").insert(rows);
  if (error) return { ok: false, error: error.code === "23505" ? "A line of this receipt is already recorded." : error.message };
  await logActivity({ actorUserId: p.actorUserId, action: "entity_expense.receipt_recorded", entityType: "employing_entity", entityId: p.entityId, metadata: { receiptNumber: p.receiptNumber.trim(), lines: rows.length, total: rec.sum, currency: p.currency } });
  return { ok: true, recorded: rows.length, total: rec.sum };
}

export async function confirmExpenseFunding(p: { entityId: string; receiptNumber: string; status: "company_account" | "founder_personal" | "other_verified"; note: string; actorUserId: string }): Promise<Result<{ updated: number }>> {
  if (!(await isSuperAdminId(p.actorUserId))) return NOT_ALLOWED;
  if (p.note.trim().length < 5) return { ok: false, error: "Say how you know who funded it (for example, the bank statement line)." };
  const { data, error } = await createAdminClient().from("entity_expenses").update({ funding_source_status: p.status, funding_source_note: p.note.trim(), funding_confirmed_by: p.actorUserId, funding_confirmed_at: new Date().toISOString() })
    .eq("employing_entity_id", p.entityId).eq("receipt_number", p.receiptNumber).eq("status", "recorded").select("id");
  if (error) return { ok: false, error: error.message };
  await logActivity({ actorUserId: p.actorUserId, action: "entity_expense.funding_confirmed", entityType: "employing_entity", entityId: p.entityId, metadata: { receiptNumber: p.receiptNumber, status: p.status } });
  return { ok: true, updated: (data ?? []).length };
}
