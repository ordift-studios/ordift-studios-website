import { createHash } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { recordAuditEvent } from "./strictAudit";
import { authorizeWithSuperAdminOverride, GOVERNANCE_CAPABILITIES } from "@/lib/organization/authority";
import { validateApprovalAttestation, resolveApprovalDate, type AttestationInput } from "./approvalAttestation";
import { loadVerifiedEvidence } from "./approvalEvidence";
import { deriveMasterContentReference, verifyStoredMaster } from "./masterContentReference";
import { extractDocxText, findUnresolvedReviewMarkers } from "./docxText";
import { checkActivationPreconditions } from "./legalGovernance";
import { transitionLegalDocumentVersionStatus } from "./masterRegistry";

// Controlled actions on the legal master registry, built on the EXISTING registry tables and the existing audit log - no new table.
// Each action: (1) requires contract-administration authority, (2) re-checks its preconditions from stored records, (3) writes only the
// columns it owns, set-once, and (4) records who did it and when in the audit log. None of them issues, signs or sends anything, and
// none changes an approval that the registry already stamped.

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string; errors?: string[] };
export const BUCKET = "legal-masters";
export const ATTESTED_ACTION = "legal.master_version.approval_attested";
export const REGISTERED_ACTION = "legal.master_version.content_registered";
export const ACTIVATION_PREPARED_ACTION = "legal.master_version.effective_date_set";

async function requireAuthority(actorUserId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const auth = await authorizeWithSuperAdminOverride(actorUserId, GOVERNANCE_CAPABILITIES.contractAdminister);
  return auth.ok ? { ok: true } : { ok: false, error: "Not authorized to administer legal documents." };
}

const sha256 = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");
const today = () => new Date().toISOString().slice(0, 10);

export type VersionRow = {
  id: string; master_id: string; status: string; approved_by: string | null; approved_at: string | null; effective_date: string | null; content_reference: string | null;
  document_hash: string | null; master_docx_storage_path: string | null; master_docx_sha256: string | null; master_pdf_storage_path: string | null; master_pdf_sha256: string | null; created_at: string;
};
const VERSION_COLS = "id, master_id, status, approved_by, approved_at, effective_date, content_reference, document_hash, master_docx_storage_path, master_docx_sha256, master_pdf_storage_path, master_pdf_sha256, created_at";

export async function loadVersion(versionId: string): Promise<{ v: VersionRow; code: string } | null> {
  const admin = createAdminClient();
  const { data: v } = await admin.from("legal_document_versions").select(VERSION_COLS).eq("id", versionId).maybeSingle();
  if (!v) return null;
  const { data: m } = await admin.from("legal_document_masters").select("canonical_code").eq("id", (v as VersionRow).master_id).maybeSingle();
  return m ? { v: v as VersionRow, code: m.canonical_code as string } : null;
}

// ------------------------------------------------------------------ audited facts read back from the audit log
export type StoredAttestation = { approvalDate: string; counselName: string; counselFirm: string; evidenceKind: string; evidenceReference: string; evidenceSha256: string | null; verifiedAt: string; verifiedByProfileId: string | null };

export async function loadApprovalAttestation(versionId: string): Promise<StoredAttestation | null> {
  const { data } = await createAdminClient()
    .from("activity_log").select("actor_user_id, metadata, created_at").eq("action", ATTESTED_ACTION).eq("entity_id", versionId).order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (!data) return null;
  const m = (data.metadata ?? {}) as Record<string, unknown>;
  if (typeof m.approvalDate !== "string") return null;
  return { approvalDate: m.approvalDate, counselName: String(m.counselName ?? ""), counselFirm: String(m.counselFirm ?? ""), evidenceKind: String(m.evidenceKind ?? ""), evidenceReference: String(m.evidenceReference ?? ""), evidenceSha256: (m.evidenceSha256 as string | null) ?? null, verifiedAt: data.created_at as string, verifiedByProfileId: (data.actor_user_id as string | null) ?? null };
}

export async function loadRegistrationCheck(versionId: string): Promise<{ unresolvedMarkers: number; registeredAt: string } | null> {
  const { data } = await createAdminClient()
    .from("activity_log").select("metadata, created_at").eq("action", REGISTERED_ACTION).eq("entity_id", versionId).order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (!data) return null;
  const m = (data.metadata ?? {}) as Record<string, unknown>;
  return { unresolvedMarkers: Number(m.unresolvedMarkers ?? -1), registeredAt: data.created_at as string };
}

// ------------------------------------------------------------------ 1. verify historical approval
export async function attestHistoricalApproval(params: { versionId: string; input: Omit<AttestationInput, "documentCode" | "evidenceSha256"> & { evidenceDocumentId: string }; actorUserId: string }): Promise<Result<{ approvalDate: string }>> {
  const auth = await requireAuthority(params.actorUserId);
  if (!auth.ok) return auth;
  const loaded = await loadVersion(params.versionId);
  if (!loaded) return { ok: false, error: "Legal document version not found." };
  const { v, code } = loaded;
  if (!["approved", "active"].includes(v.status)) return { ok: false, error: `This version is “${v.status}”; only an approved version carries a historical approval to verify.` };
  if (v.approved_at) return { ok: false, error: "The registry already holds a stamped approval date for this version; nothing needs to be attested." };
  if (await loadApprovalAttestation(v.id)) return { ok: false, error: "An approval attestation is already on record for this version and is not replaced. A correction needs the Founder's separate authorization." };
  // The attestation is a claim by an administrator; the system cannot decide who approved a document. It therefore requires a STORED evidence file for
  // this document, whose fingerprint it computes and re-verifies itself (no typed fingerprint), and it reports what it could and could not read.
  if (!params.input.evidenceDocumentId) return { ok: false, error: "Upload or select the approval evidence first. A description alone is not accepted." };
  const evidence = await loadVerifiedEvidence(v.id, params.input.evidenceDocumentId, params.input.counselName);
  if (!evidence.ok) return evidence;
  if (evidence.text.checked && !evidence.text.mentionsDocument) return { ok: false, error: `The evidence text does not mention ${code} or its title, so it cannot support an approval of this document. Select evidence that names it.` };
  const verdict = validateApprovalAttestation(
    { ...params.input, documentCode: code, evidenceSha256: evidence.item.sha256 },
    { documentCode: code, today: today(), versionCreatedOn: v.created_at.slice(0, 10), versionWasCreatedApproved: true },
  );
  if (!verdict.ok) return { ok: false, error: verdict.errors[0], errors: verdict.errors };

  const written = await recordAuditEvent({
    actorUserId: params.actorUserId,
    action: ATTESTED_ACTION,
    entityType: "legal_document_version",
    entityId: v.id,
    metadata: {
      basis: "administrator_attestation_system_has_not_inspected_the_evidence",
      documentCode: code, approvalDate: params.input.approvalDate, counselName: params.input.counselName.trim(), counselFirm: params.input.counselFirm.trim(),
      evidenceKind: params.input.evidenceKind, evidenceReference: params.input.evidenceReference.trim(), evidenceSha256: evidence.item.sha256,
      evidenceDocumentId: evidence.item.id, evidenceFile: evidence.item.name, evidenceStoragePath: evidence.item.storagePath, evidenceSizeBytes: evidence.sizeBytes, evidenceCheck: evidence.text,
      claimedApprovalDate: params.input.approvalDate,
      coversDocumentCodes: params.input.coversDocumentCodes, versionCreatedOn: v.created_at.slice(0, 10),
    },
  });
  if (!written.ok) return { ok: false, error: "The attestation could not be recorded, so nothing was saved. Try again." };
  return { ok: true, approvalDate: params.input.approvalDate };
}

// Re-reads the stored master from the private bucket and checks it against what the registry recorded at ingestion. Used both when the master
// is registered and again at activation, so the template that goes live is the actual approved file, byte for byte.
export async function verifyStoredMasterIntegrity(v: VersionRow): Promise<{ ok: true; markers: number; docxSha256: string; pdfSha256: string; text: string } | { ok: false; error: string }> {
  if (!v.master_docx_storage_path || !v.master_docx_sha256 || !v.master_pdf_storage_path || !v.master_pdf_sha256) return { ok: false, error: "The stored master files or their checksums are not recorded." };
  const admin = createAdminClient();
  const [docx, pdf] = await Promise.all([admin.storage.from(BUCKET).download(v.master_docx_storage_path), admin.storage.from(BUCKET).download(v.master_pdf_storage_path)]);
  if (docx.error || !docx.data || pdf.error || !pdf.data) return { ok: false, error: "A stored master file could not be read." };
  const docxBytes = new Uint8Array(await docx.data.arrayBuffer());
  const pdfBytes = new Uint8Array(await pdf.data.arrayBuffer());
  const check = verifyStoredMaster({ docxSha256: v.master_docx_sha256, pdfSha256: v.master_pdf_sha256 }, { docxSha256: sha256(docxBytes), pdfSha256: sha256(pdfBytes) });
  if (!check.ok) return { ok: false, error: `HARD STOP: the stored ${check.mismatched.join(" and ")} master no longer matches its recorded checksum.` };
  const text = extractDocxText(docxBytes);
  if (text === null) return { ok: false, error: "The stored Word master could not be read for the clause check." };
  return { ok: true, markers: findUnresolvedReviewMarkers(text).length, docxSha256: sha256(docxBytes), pdfSha256: sha256(pdfBytes), text };
}

// ------------------------------------------------------------------ 2. register the controlled master
export async function registerControlledMaster(params: { versionId: string; actorUserId: string }): Promise<Result<{ contentReference: string; documentHash: string }>> {
  const auth = await requireAuthority(params.actorUserId);
  if (!auth.ok) return auth;
  const loaded = await loadVersion(params.versionId);
  if (!loaded) return { ok: false, error: "Legal document version not found." };
  const { v, code } = loaded;
  if (v.content_reference || v.document_hash) return { ok: false, error: "This master is already registered under a controlled content reference." };
  const integrity = await verifyStoredMasterIntegrity(v);
  if (!integrity.ok) return { ok: false, error: `${integrity.error} Nothing was registered.` };
  if (integrity.markers > 0) return { ok: false, error: `The master still contains ${integrity.markers} unresolved counsel-review marker(s). Nothing was registered.` };
  const admin = createAdminClient();

  const ref = deriveMasterContentReference({ code, version: "1.0", docxPath: v.master_docx_storage_path!, docxSha256: v.master_docx_sha256!, pdfPath: v.master_pdf_storage_path!, pdfSha256: v.master_pdf_sha256! });
  const { error } = await admin.from("legal_document_versions").update({ content_reference: ref.contentReference, document_hash: ref.documentHash }).eq("id", v.id).is("content_reference", null).is("document_hash", null);
  if (error) { console.error("[legal] failed to register controlled master", error.message); return { ok: false, error: "Failed to record the controlled content reference." }; }

  const written = await recordAuditEvent({
    actorUserId: params.actorUserId, action: REGISTERED_ACTION, entityType: "legal_document_version", entityId: v.id,
    metadata: { documentCode: code, contentReference: ref.contentReference, documentHash: ref.documentHash, pdfSha256: v.master_pdf_sha256, unresolvedMarkers: 0, checkedAgainst: "recorded ingestion checksums" },
  });
  if (!written.ok) {
    await admin.from("legal_document_versions").update({ content_reference: null, document_hash: null }).eq("id", v.id).eq("content_reference", ref.contentReference);
    return { ok: false, error: "The registration could not be audited, so it was reversed. Nothing was registered." };
  }
  return { ok: true, ...ref };
}

// ------------------------------------------------------------------ 3. set the effective date and activate (explicit; never automatic)
export async function activateMasterVersion(params: { versionId: string; effectiveDate: string; backdatedReason?: string | null; actorUserId: string }): Promise<Result> {
  const auth = await requireAuthority(params.actorUserId);
  if (!auth.ok) return auth;
  const loaded = await loadVersion(params.versionId);
  if (!loaded) return { ok: false, error: "Legal document version not found." };
  const { v, code } = loaded;

  const attestation = await loadApprovalAttestation(v.id);
  const registration = await loadRegistrationCheck(v.id);
  const approval = resolveApprovalDate({ approvedAt: v.approved_at }, attestation);
  const verdict = checkActivationPreconditions({
    status: v.status, approvalDate: approval?.date ?? null, contentRegistered: Boolean(v.content_reference && v.document_hash),
    unresolvedMarkers: registration && registration.unresolvedMarkers >= 0 ? registration.unresolvedMarkers : null,
    effectiveDate: params.effectiveDate, today: today(), backdatedReason: params.backdatedReason ?? null,
  });
  if (!verdict.ok) return { ok: false, error: verdict.errors[0], errors: verdict.errors };

  // The template that goes live must be the actual approved file: re-verify the stored master now, not only at registration.
  const integrity = await verifyStoredMasterIntegrity(v);
  if (!integrity.ok) return { ok: false, error: `${integrity.error} Nothing was activated.` };
  if (integrity.markers > 0) return { ok: false, error: `The master contains ${integrity.markers} unresolved counsel-review marker(s). Nothing was activated.` };
  const expected = deriveMasterContentReference({ code, version: "1.0", docxPath: v.master_docx_storage_path!, docxSha256: v.master_docx_sha256!, pdfPath: v.master_pdf_storage_path!, pdfSha256: v.master_pdf_sha256! });
  if (v.content_reference !== expected.contentReference || v.document_hash !== expected.documentHash) return { ok: false, error: "The registered content reference no longer matches the stored master. Nothing was activated." };
  const { data: master } = await createAdminClient().from("legal_document_masters").select("current_version_id").eq("id", v.master_id).maybeSingle();
  if (!master || master.current_version_id !== v.id) return { ok: false, error: "This is not the current version of its legal master. Nothing was activated." };

  const admin = createAdminClient();
  if (v.effective_date && v.effective_date !== params.effectiveDate) return { ok: false, error: `An effective date (${v.effective_date}) is already recorded and is not overwritten.` };
  if (!v.effective_date) {
    const { error } = await admin.from("legal_document_versions").update({ effective_date: params.effectiveDate }).eq("id", v.id).is("effective_date", null);
    if (error) { console.error("[legal] failed to set effective date", error.message); return { ok: false, error: "Failed to record the effective date." }; }
    const written = await recordAuditEvent({ actorUserId: params.actorUserId, action: ACTIVATION_PREPARED_ACTION, entityType: "legal_document_version", entityId: v.id, metadata: { documentCode: code, effectiveDate: params.effectiveDate, approvalDate: approval?.date, approvalDateSource: approval?.source, backdatedReason: params.backdatedReason ?? null } });
    if (!written.ok) {
      await admin.from("legal_document_versions").update({ effective_date: null }).eq("id", v.id).eq("effective_date", params.effectiveDate);
      return { ok: false, error: "The effective date could not be audited, so it was reversed. Nothing was activated." };
    }
  }
  // The registry stamps the REAL activation time and repoints the master - it is never back-dated.
  return transitionLegalDocumentVersionStatus({ versionId: v.id, toStatus: "active", actorUserId: params.actorUserId });
}
