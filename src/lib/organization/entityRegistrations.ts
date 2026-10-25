import { createAdminClient } from "@/lib/supabase/admin";
import { logActivity } from "@/lib/admin/activityLog";
import { isSuperAdminId } from "@/lib/organization/authority";
import { assessEntityForQuotation, type ActivityFact, type EntityAssessment, type EntityFacts, type RequirementRow } from "@/lib/organization/jurisdictionRequirements";
import { assessContractingEligibility, suggestContractingEntity, reconcileReceipt, type ContractingCandidate, type Eligibility, type KnownDocument, type ReceiptLine, type RegistrationFact, type RegistrationKind, type RegistrationStatus, checkDuplicate, sha256OfBytes, ENTITY_DOCUMENT_TYPES } from "@/lib/organization/entityRegistry";

// Per-entity registrations, permits, authorised signatories and receipt-backed expenses (migration 0159). Every read and write is
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
  entityId: string; permitNumber: string; licenceNumber?: string | null; issuedOn: string; expiresOn: string | null; issuingAuthority: string; premisesAddress: string; sourceDocumentId: string; actorUserId: string;
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
    issuing_authority: p.issuingAuthority.trim(), facts: { premises: p.premisesAddress.trim(), ...(p.licenceNumber?.trim() ? { licenceNumber: p.licenceNumber.trim() } : {}) }, source_document_id: p.sourceDocumentId, supersedes_id: pending?.id ?? null, recorded_by: p.actorUserId,
  }).select("id").single();
  if (error || !data) return { ok: false, error: error?.message ?? "Could not record the permit." };
  await logActivity({ actorUserId: p.actorUserId, action: "entity_registration.permit_recorded", entityType: "employing_entity", entityId: p.entityId, metadata: { registrationId: data.id, documentId: p.sourceDocumentId } });
  return { ok: true, registrationId: data.id };
}

// The 60-working-day condition has no deadline until the approval-notice date is known. Recording it is a replacement record, so the
// original (unconfirmed) one stays in history.
export async function confirmApprovalNoticeDate(p: { entityId: string; approvalNoticeDate: string; source: string; actorUserId: string }): Promise<Result<{ registrationId: string }>> {
  if (!(await isSuperAdminId(p.actorUserId))) return NOT_ALLOWED;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(p.approvalNoticeDate)) return { ok: false, error: "Enter the date you received the official approval notice." };
  if (p.source.trim().length < 5) return { ok: false, error: "Say which document or message confirms that date (it is not accepted without a source)." };
  const db = createAdminClient();
  const { data: cur } = await db.from("entity_registrations").select("*").eq("employing_entity_id", p.entityId).eq("kind", "investment_approval_condition").eq("status", "pending").maybeSingle();
  if (!cur) return { ok: false, error: "There is no open investment-approval condition for this entity." };
  await db.from("entity_registrations").update({ status: "superseded" }).eq("id", cur.id);
  const { data, error } = await db.from("entity_registrations").insert({
    employing_entity_id: p.entityId, kind: "investment_approval_condition", status: "pending", issued_on: cur.issued_on, issuing_authority: cur.issuing_authority,
    facts: { ...(cur.facts as object), approvalNoticeDate: p.approvalNoticeDate, approvalNoticeSource: p.source.trim() }, source_document_id: cur.source_document_id, supersedes_id: cur.id, recorded_by: p.actorUserId,
    note: "Approval-notice date recorded from the stated source. The working-day deadline is not calculated by the system.",
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

// Records ONE authorised signatory for an entity. The documentary basis is mandatory: it must be a document already in THIS entity's vault
// that has a stored file and fingerprint (a note-only record is not evidence). The authority wording is copied from the document by the
// person recording it - it is never generated. A profile link is made only to the profile the caller names, and a signatory of one entity
// never becomes a signatory of another.
export async function addEntitySignatory(p: {
  entityId: string; fullName: string; position: string; authority: string; sourceDocumentId: string; profileId?: string | null; nationality?: string | null; ownershipPercent?: number | null; effectiveFrom?: string | null; actorUserId: string;
}): Promise<Result<{ signatoryId: string }>> {
  if (!(await isSuperAdminId(p.actorUserId))) return NOT_ALLOWED;
  if (p.fullName.trim().length < 3) return { ok: false, error: "Enter the signatory's full name." };
  if (p.position.trim().length < 3) return { ok: false, error: "Enter the position exactly as the document states it." };
  if (p.authority.trim().length < 5) return { ok: false, error: "Enter the authority wording exactly as the document states it." };
  if (p.effectiveFrom && !/^\d{4}-\d{2}-\d{2}$/.test(p.effectiveFrom)) return { ok: false, error: "Enter the effective date as YYYY-MM-DD." };
  if (p.ownershipPercent != null && (p.ownershipPercent < 0 || p.ownershipPercent > 100)) return { ok: false, error: "Ownership must be between 0 and 100." };

  const db = createAdminClient();
  const { data: doc } = await db.from("employing_entity_documents").select("id, file_sha256, original_filename").eq("id", p.sourceDocumentId).eq("employing_entity_id", p.entityId).maybeSingle();
  if (!doc) return { ok: false, error: "The supporting document is not in this entity's vault." };
  if (!doc.file_sha256 || !doc.original_filename) return { ok: false, error: "The selected record has no stored file or fingerprint. Upload the actual document to the entity record first." };
  const { data: existing } = await db.from("entity_signatories").select("id").eq("employing_entity_id", p.entityId).ilike("full_name", p.fullName.trim()).is("effective_to", null).maybeSingle();
  if (existing) return { ok: false, error: "This person is already a current signatory of this entity." };

  const { data, error } = await db.from("entity_signatories").insert({
    employing_entity_id: p.entityId, full_name: p.fullName.trim(), position: p.position.trim(), authority: p.authority.trim(), nationality: p.nationality?.trim() || null,
    ownership_percent: p.ownershipPercent ?? null, profile_id: p.profileId ?? null, effective_from: p.effectiveFrom ?? null, source_document_id: p.sourceDocumentId, recorded_by: p.actorUserId,
  }).select("id").single();
  if (error || !data) return { ok: false, error: error?.message ?? "Could not record the signatory." };
  await logActivity({ actorUserId: p.actorUserId, action: "entity_signatory.recorded", entityType: "employing_entity", entityId: p.entityId, metadata: { signatoryId: data.id, documentId: p.sourceDocumentId, linkedProfile: Boolean(p.profileId) } });
  return { ok: true, signatoryId: data.id };
}

// Finds the existing ACTIVE Ordift account for a member number, so a signatory can be linked to the right account for secure signature delivery.
// Never creates a profile. Super Admin only.
export async function findActiveProfileByMemberNumber(memberNumber: string, actorUserId: string): Promise<Result<{ profileId: string; fullName: string | null }>> {
  if (!(await isSuperAdminId(actorUserId))) return NOT_ALLOWED;
  const n = memberNumber.trim();
  if (!n) return { ok: false, error: "Enter the member number of the existing Ordift account." };
  const { data } = await createAdminClient().from("profiles").select("id, full_name, access_status").eq("member_number", n).maybeSingle();
  if (!data) return { ok: false, error: `No Ordift account has member number ${n}.` };
  if (data.access_status !== "active") return { ok: false, error: `The account ${n} is not active, so it cannot receive a secure signing link.` };
  return { ok: true, profileId: data.id as string, fullName: (data.full_name as string | null) ?? null };
}

// ------------------------------------------------------------------ vault documents (hash, metadata, duplicate detection)
const BUCKET = "legal-entity-documents";
const MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED_MIME = new Set(["application/pdf", "image/jpeg", "image/png"]);

export type VaultDocument = { id: string; documentType: string; filename: string | null; sha256: string | null; sizeBytes: number | null; issuedOn: string | null; expiresOn: string | null; issuingAuthority: string | null; relation: string | null; relatedDocumentId: string | null; replacedByDocumentId: string | null; notes: string | null; uploadedAt: string };
export async function listVaultDocuments(entityId: string, actorUserId: string): Promise<VaultDocument[]> {
  if (!(await isSuperAdminId(actorUserId))) return [];
  const { data, error } = await createAdminClient().from("employing_entity_documents").select("id, document_type, original_filename, file_sha256, size_bytes, issued_on, expires_on, issuing_authority, relation, related_document_id, notes, uploaded_at").eq("employing_entity_id", entityId).order("uploaded_at", { ascending: false });
  if (error) { console.error("[entity registry] failed to load documents", error.message); return []; }
  const replacedBy = new Map<string, string>();
  for (const r of data ?? []) if (r.relation === "new_version_of" && r.related_document_id) replacedBy.set(r.related_document_id, r.id);
  return (data ?? []).map((r) => ({ replacedByDocumentId: replacedBy.get(r.id) ?? null, id: r.id, documentType: r.document_type, filename: r.original_filename, sha256: r.file_sha256, sizeBytes: r.size_bytes == null ? null : Number(r.size_bytes), issuedOn: r.issued_on, expiresOn: r.expires_on, issuingAuthority: r.issuing_authority, relation: r.relation, relatedDocumentId: r.related_document_id, notes: r.notes, uploadedAt: r.uploaded_at }));
}

// Stores one official document. The file is hashed first: an exact copy of a document already in this entity's vault is recorded as a
// duplicate that points at the original and shares its stored object — the original is never replaced, overwritten or deleted, and a
// second copy of the bytes is not stored. A document with overlapping content (e.g. a fuller version of a shorter one) is stored as
// its own file and linked with `overlapOf`.
export async function addVaultDocument(p: {
  entityId: string; documentType: string; filename: string; mimeType: string; bytes: Uint8Array; notes?: string | null;
  issuedOn?: string | null; expiresOn?: string | null; issuingAuthority?: string | null; overlapOf?: string | null; replaces?: string | null; actorUserId: string;
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
  if (p.replaces && !(rows ?? []).some((r) => r.id === p.replaces)) return { ok: false, error: "The document this replaces is not in this entity's vault." };

  let storagePath: string;
  if (verdict.kind === "exact_duplicate_of") {
    storagePath = (rows ?? []).find((r) => r.id === verdict.of.id)!.storage_path;       // shares the original's object; nothing new is stored
  } else {
    storagePath = `${p.entityId}/${sha.slice(0, 16)}-${p.filename.replace(/[^A-Za-z0-9._-]+/g, "_")}`;
    const up = await db.storage.from(BUCKET).upload(storagePath, Buffer.from(p.bytes), { contentType: p.mimeType, upsert: false });
    if (up.error) { console.error("[entity registry] upload failed", up.error.message); return { ok: false, error: "Failed to upload the file." }; }
  }
  const relation = verdict.kind === "exact_duplicate_of" ? { relation: "exact_duplicate_of", related_document_id: verdict.of.id }
    : p.replaces ? { relation: "new_version_of", related_document_id: p.replaces }
    : p.overlapOf ? { relation: "partial_overlap_of", related_document_id: p.overlapOf } : { relation: null, related_document_id: null };
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

// SERVER-INTERNAL, actor-independent: the CURRENT standing of one legal entity as a contracting party for an ORDINARY quotation, judged against ITS OWN jurisdiction's approved
// requirements (migration 0173; Ghana and Qatar are not held to the same rules) and the activities the quotation declares. The database enforces the same rule at issuance
// (private.entity_issue_standing) and a parity test keeps the two identical. Callers authorise first. Never returns governance detail beyond what its caller asks for.
export type EntityStanding = {
  entity: { name: string; legal_name: string | null; registration_type: string | null };
  assessment: EntityAssessment;
  eligibility: Eligibility;
  registrations: EntityRegistration[];
};
type CatalogRow = { requirement_key: string; category: string; label: string; identifier_label: string | null; registration_kind: string | null; necessity: string; condition_activity: string | null; requires_verified: boolean; requires_in_date: boolean; shown_on_document: boolean; sort_order: number; approved_at: string | null };
const mapCatalog = (c: CatalogRow): RequirementRow => ({
  key: c.requirement_key, category: c.category as RequirementRow["category"], label: c.label, identifierLabel: c.identifier_label, registrationKind: c.registration_kind, necessity: c.necessity as RequirementRow["necessity"],
  conditionActivity: c.condition_activity, requiresVerified: c.requires_verified, requiresInDate: c.requires_in_date, shownOnDocument: c.shown_on_document, sortOrder: c.sort_order, approved: Boolean(c.approved_at),
});

async function loadEntityFacts(entityId: string): Promise<{ facts: EntityFacts; catalog: RequirementRow[]; registrations: EntityRegistration[] } | null> {
  const db = createAdminClient();
  const { data: e } = await db.from("employing_entities").select("id, name, legal_name, registration_type, active, verification_status, jurisdiction_id").eq("id", entityId).maybeSingle();
  if (!e) return null;
  const jurisdictionId = (e.jurisdiction_id as string | null) ?? null;
  const [{ data: j }, { data: cat }, { data: regs }, { data: sigs }, { data: acts }, { data: types }] = await Promise.all([
    jurisdictionId ? db.from("employment_jurisdictions").select("name").eq("id", jurisdictionId).maybeSingle() : Promise.resolve({ data: null }),
    jurisdictionId ? db.from("jurisdiction_entity_requirements").select("requirement_key, category, label, identifier_label, registration_kind, necessity, condition_activity, requires_verified, requires_in_date, shown_on_document, sort_order, approved_at").eq("jurisdiction_id", jurisdictionId) : Promise.resolve({ data: [] }),
    db.from("entity_registrations").select(REG_SELECT).eq("employing_entity_id", entityId).in("status", ["active", "pending", "not_issued", "expired"]),
    db.from("entity_signatories").select("effective_from, effective_to").eq("employing_entity_id", entityId),
    db.from("entity_activities").select("activity_key, status, evidence_registration_id").eq("employing_entity_id", entityId),
    db.from("entity_activity_types").select("key, label"),
  ]);
  const registrations = ((regs ?? []) as unknown as RegRow[]).map(mapReg);
  const facts: EntityFacts = {
    name: e.name as string, legalName: (e.legal_name as string | null) ?? null, registrationType: (e.registration_type as string | null) ?? null, active: Boolean(e.active), verified: e.verification_status === "verified",
    jurisdictionName: jurisdictionId ? ((j as { name: string } | null)?.name ?? "this jurisdiction") : null,
    registrations,
    signatories: ((sigs ?? []) as { effective_from: string | null; effective_to: string | null }[]).map((s) => ({ effectiveFrom: s.effective_from, effectiveTo: s.effective_to })),
    activities: ((acts ?? []) as { activity_key: string; status: string; evidence_registration_id: string | null }[]).map((a): ActivityFact => ({ key: a.activity_key, status: a.status as ActivityFact["status"], evidenceRegistrationId: a.evidence_registration_id })),
    activityLabels: Object.fromEntries(((types ?? []) as { key: string; label: string }[]).map((t) => [t.key, t.label])),
  };
  return { facts, catalog: ((cat ?? []) as CatalogRow[]).map(mapCatalog), registrations };
}

export async function getContractingEntityStanding(entityId: string, today: string, declaredActivities: string[] | null = null): Promise<EntityStanding | null> {
  const loaded = await loadEntityFacts(entityId);
  if (!loaded) return null;
  const assessment = assessEntityForQuotation(loaded.facts, loaded.catalog, declaredActivities, today);
  return {
    entity: { name: loaded.facts.name, legal_name: loaded.facts.legalName, registration_type: loaded.facts.registrationType },
    assessment, eligibility: { eligible: assessment.eligible, blockers: assessment.blockers }, registrations: loaded.registrations,
  };
}

// Candidates for an ORDINARY enquiry or quotation (Super Admin only). Selection happens before the activities are declared, so activity coverage is judged when the quotation is issued;
// everything else (jurisdiction requirements, verification, signatory) is judged here, so the selection screen and issuance agree.
export async function listOrdinaryContractingCandidates(actorUserId: string, today: string): Promise<{ candidates: { entityId: string; name: string; jurisdiction: string | null; eligibility: Eligibility; advisories: string[]; requirements: EntityAssessment["requirements"] }[]; suggestion: { entityId: string; reason: string } | null }> {
  if (!(await isSuperAdminId(actorUserId))) return { candidates: [], suggestion: null };
  const { data: ents } = await createAdminClient().from("employing_entities").select("id, name").order("sort_order");
  const candidates = [];
  for (const e of ents ?? []) {
    const st = await getContractingEntityStanding(e.id as string, today, null);
    if (!st) continue;
    candidates.push({ entityId: e.id as string, name: e.name as string, jurisdiction: st.assessment.jurisdiction, eligibility: st.eligibility, advisories: st.assessment.advisories, requirements: st.assessment.requirements });
  }
  return { candidates, suggestion: suggestContractingEntity(candidates) };
}

// Records whether an entity may carry out an activity. 'planned' is an intention and is NEVER treated as licensed. 'licensed' needs verified, active evidence (a registration of the SAME entity);
// the database refuses anything else. Super Admin only; nothing is changed automatically and no activity is ever activated by the system.
export async function setEntityActivity(p: { entityId: string; activityKey: string; status: "planned" | "licensed" | "suspended" | "withdrawn"; evidenceRegistrationId?: string | null; note?: string; actorUserId: string }): Promise<Result<{ status: string }>> {
  if (!(await isSuperAdminId(p.actorUserId))) return NOT_ALLOWED;
  if (p.status === "licensed" && !p.evidenceRegistrationId) return { ok: false, error: "A licensed activity needs the verified registration or licence that covers it." };
  const db = createAdminClient();
  const { data: t } = await db.from("entity_activity_types").select("key").eq("key", p.activityKey).maybeSingle();
  if (!t) return { ok: false, error: "That activity is not one Ordift offers." };
  const { data: prev } = await db.from("entity_activities").select("id, status").eq("employing_entity_id", p.entityId).eq("activity_key", p.activityKey).maybeSingle();
  const row = { employing_entity_id: p.entityId, activity_key: p.activityKey, status: p.status, evidence_registration_id: p.status === "licensed" ? p.evidenceRegistrationId ?? null : p.evidenceRegistrationId ?? null, note: (p.note ?? "").trim() || null, recorded_by: p.actorUserId };
  const { error } = prev ? await db.from("entity_activities").update(row).eq("id", prev.id as string) : await db.from("entity_activities").insert(row);
  if (error) return { ok: false, error: error.message.includes("ordift:activity_evidence") ? "That evidence is not an active, verified record of this entity." : error.message };
  await logActivity({ actorUserId: p.actorUserId, action: "entity.activity_recorded", entityType: "employing_entity", entityId: p.entityId, metadata: { activity: p.activityKey, from: (prev?.status as string | undefined) ?? null, to: p.status } });
  return { ok: true, status: p.status };
}

// The issuance of an ORDINARY quotation fixes its contracting entity. The evidence is the quotation's own `issued_at` (written once, by the single issuing update), NOT its current
// status: a quotation keeps its original entity after it is accepted, declined, expired or superseded. Returns a plain-language refusal, or null when a change is allowed.
//  - quotation subject: locked once issued if ANY entity is on record for it (its own, or its enquiry's);
//  - enquiry subject:   a recorded enquiry-level entity is locked once any ordinary quotation of that enquiry has been issued (a revision selects its own entity on the new version).
// First-time recording on an older issued quotation that never had an entity stays allowed: that is how such a quotation is repaired, and it is not added to the issued document.
async function issuedEntityLock(subject: { type: "enquiry" | "quotation"; id: string }, hasOwnRecord: boolean): Promise<string | null> {
  const db = createAdminClient();
  if (subject.type === "quotation") {
    const { data: q } = await db.from("client_quotations").select("issued_at, enquiry_id").eq("id", subject.id).is("crew_support_request_id", null).maybeSingle();
    if (!q?.issued_at) return null;
    let recorded = hasOwnRecord;
    if (!recorded && q.enquiry_id) {
      const { data: e } = await db.from("booking_contracting_entities").select("id").eq("subject_type", "enquiry").eq("subject_id", q.enquiry_id as string).limit(1);
      recorded = (e ?? []).length > 0;
    }
    return recorded ? "This quotation has been issued with its contracting entity, so the entity is not changed, even after it is accepted, declined, expired or revised. Revise the quotation and select the entity on the new version." : null;
  }
  if (!hasOwnRecord) return null;
  const { data: issued } = await db.from("client_quotations").select("id").eq("enquiry_id", subject.id).is("crew_support_request_id", null).not("issued_at", "is", null).limit(1);
  return (issued ?? []).length > 0 ? "A quotation for this enquiry has already been issued under this entity, so the enquiry's entity is not changed. Revise the quotation and select the entity on the new version." : null;
}

// ------------------------------------------------------------------ the contracting entity of a booking, quotation or agreement
export type ContractingSubject = { type: "crew_support_request" | "enquiry" | "quotation" | "agreement"; id: string };
export type ContractingChoice = { version: number; entityId: string; entityName: string; basis: string; chosenAt: string };

export async function listContractingCandidates(actorUserId: string, serviceFamily: string | null, today: string): Promise<{ candidates: (ContractingCandidate & { eligibility: Eligibility })[]; suggestion: { entityId: string; reason: string } | null }> {
  if (!(await isSuperAdminId(actorUserId))) return { candidates: [], suggestion: null };
  const db = createAdminClient();
  const { data: ents } = await db.from("employing_entities").select("id, name, active, verification_status").order("sort_order");
  const { data: regs } = await db.from("entity_registrations").select(REG_SELECT + ", employing_entity_id").in("status", ["active", "pending", "not_issued", "expired"]);
  const candidates = (ents ?? []).map((e) => {
    const registrations = ((regs ?? []) as unknown as (RegRow & { employing_entity_id: string })[]).filter((r) => r.employing_entity_id === e.id).map(mapReg);
    const c: ContractingCandidate = { entityId: e.id, name: e.name, verified: e.verification_status === "verified", active: e.active, registrations };
    return { ...c, eligibility: assessContractingEligibility(c, serviceFamily, today) };
  });
  return { candidates, suggestion: suggestContractingEntity(candidates) };
}

// A subject with no row is a booking made before this existed: it is NOT assigned an entity. Returned as null.
export async function getContractingEntity(subject: ContractingSubject, actorUserId: string): Promise<ContractingChoice | null> {
  if (!(await isSuperAdminId(actorUserId))) return null;
  const db = createAdminClient();
  const { data } = await db.from("booking_contracting_entities").select("version, employing_entity_id, basis, created_at").eq("subject_type", subject.type).eq("subject_id", subject.id).order("version", { ascending: false }).limit(1).maybeSingle();
  if (!data) return null;
  const { data: e } = await db.from("employing_entities").select("name").eq("id", data.employing_entity_id).maybeSingle();
  return { version: data.version, entityId: data.employing_entity_id, entityName: e?.name ?? "", basis: data.basis, chosenAt: data.created_at };
}

// A booking with an accepted quotation or any payment is historical: its entity is never assigned or changed by this feature.
export async function bookingIsHistorical(requestId: string): Promise<boolean> {
  const db = createAdminClient();
  const { data: r } = await db.from("crew_support_requests").select("enquiry_id").eq("id", requestId).maybeSingle();
  const { data: q } = await db.from("client_quotations").select("id").eq("crew_support_request_id", requestId).eq("status", "accepted").limit(1);
  const { data: enq } = r?.enquiry_id ? await db.from("enquiries").select("amount_paid").eq("id", r.enquiry_id).maybeSingle() : { data: null };
  return (q ?? []).length > 0 || Number(enq?.amount_paid ?? 0) > 0;
}

// An ordinary (non-Crew-Support) enquiry or quotation is historical once its quotation has been accepted or any payment has been received: its entity is then
// never assigned or changed by this feature, the same rule Crew Support bookings already follow. Crew Support enquiries are handled from their request.
export async function ordinarySubjectGate(subject: { type: "enquiry" | "quotation"; id: string }): Promise<{ ok: true } | { ok: false; error: string }> {
  const db = createAdminClient();
  let enquiryId: string | null = null;
  if (subject.type === "quotation") {
    const { data: q } = await db.from("client_quotations").select("status, enquiry_id, crew_support_request_id").eq("id", subject.id).maybeSingle();
    if (!q) return { ok: false, error: "That quotation was not found." };
    if (q.crew_support_request_id) return { ok: false, error: "This quotation belongs to a Crew Support request — choose the entity from that request." };
    if (q.status === "accepted") return { ok: false, error: "This quotation has already been accepted. It is historical and its entity is not assigned here; a correction needs the Founder's separate approval." };
    enquiryId = q.enquiry_id;
  } else {
    enquiryId = subject.id;
  }
  if (!enquiryId) return { ok: true };
  const { data: enq } = await db.from("enquiries").select("commercial_intent, amount_paid").eq("id", enquiryId).maybeSingle();
  if (!enq) return { ok: false, error: "That enquiry was not found." };
  if (enq.commercial_intent === "creative_crew_support") return { ok: false, error: "This is a Creative Crew Support enquiry — choose the entity from its Crew Support request." };
  if (Number(enq.amount_paid ?? 0) > 0) return { ok: false, error: "A payment has already been received for this enquiry. It is historical and its entity is not assigned here; a correction needs the Founder's separate approval." };
  if (subject.type === "enquiry") {
    const { data: acc } = await db.from("client_quotations").select("id").eq("enquiry_id", enquiryId).eq("status", "accepted").limit(1);
    if ((acc ?? []).length > 0) return { ok: false, error: "A quotation for this enquiry has already been accepted. It is historical and its entity is not assigned here; a correction needs the Founder's separate approval." };
  }
  return { ok: true };
}

// Records the contracting entity of a NEW booking. Refused for a booking that already has an accepted quotation or any payment (historical
// bookings stay exactly as they are unless a correction is separately approved), and for an entity that is not eligible. Nothing else is
// changed: no quotation, invoice, agreement, payment or payable is touched or regenerated.
export async function chooseContractingEntity(p: { subject: ContractingSubject; entityId: string; basis: string; actorUserId: string; today?: string }): Promise<Result<{ version: number }>> {
  if (!(await isSuperAdminId(p.actorUserId))) return NOT_ALLOWED;
  if (p.basis.trim().length < 5) return { ok: false, error: "Say why this entity is contracting (for example: the Ghana entity contracts for work billed in GHS)." };
  const db = createAdminClient();
  let serviceFamily: string | null = null;
  if (p.subject.type === "crew_support_request") {
    const { data: r } = await db.from("crew_support_requests").select("id, service_family, enquiry_id").eq("id", p.subject.id).maybeSingle();
    if (!r) return { ok: false, error: "That booking was not found." };
    serviceFamily = r.service_family as string | null;
    if (await bookingIsHistorical(p.subject.id)) return { ok: false, error: "This booking already has an accepted quotation or a payment. It is historical and is not reassigned; a correction needs the Founder's separate approval." };
  }
  if (p.subject.type === "enquiry" || p.subject.type === "quotation") {
    const gate = await ordinarySubjectGate({ type: p.subject.type, id: p.subject.id });
    if (!gate.ok) return gate;
  }
  const today = p.today ?? new Date().toISOString().slice(0, 10);
  // Ordinary subjects are judged against the entity's OWN jurisdiction requirements (the same rule the database enforces at issuance); Crew Support keeps its existing rule.
  const { candidates } = p.subject.type === "enquiry" || p.subject.type === "quotation"
    ? await listOrdinaryContractingCandidates(p.actorUserId, today)
    : await listContractingCandidates(p.actorUserId, serviceFamily, today);
  const cand = candidates.find((c) => c.entityId === p.entityId);
  if (!cand) return { ok: false, error: "That legal entity was not found." };
  if (!cand.eligibility.eligible) return { ok: false, error: `That entity cannot contract for this booking: ${cand.eligibility.blockers.join(" ")}` };
  const { data: prev } = await db.from("booking_contracting_entities").select("id, version, employing_entity_id").eq("subject_type", p.subject.type).eq("subject_id", p.subject.id).order("version", { ascending: false }).limit(1).maybeSingle();
  if (p.subject.type === "enquiry" || p.subject.type === "quotation") {
    const locked = await issuedEntityLock({ type: p.subject.type, id: p.subject.id }, Boolean(prev));
    if (locked) return { ok: false, error: locked };
  }
  if (prev?.employing_entity_id === p.entityId) return { ok: false, error: "That entity is already recorded for this booking." };
  const version = (prev?.version ?? 0) + 1;
  const { error } = await db.from("booking_contracting_entities").insert({ subject_type: p.subject.type, subject_id: p.subject.id, version, employing_entity_id: p.entityId, basis: p.basis.trim(), supersedes_id: prev?.id ?? null, chosen_by: p.actorUserId });
  if (error) return { ok: false, error: error.code === "23505" ? "Someone else recorded an entity at the same moment; reload and check." : error.message };
  await logActivity({ actorUserId: p.actorUserId, action: "booking.contracting_entity_chosen", entityType: p.subject.type, entityId: p.subject.id, metadata: { employingEntityId: p.entityId, version } });
  return { ok: true, version };
}
