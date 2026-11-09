import { createAdminClient } from "@/lib/supabase/admin";
import { authorizeWithSuperAdminOverride, GOVERNANCE_CAPABILITIES } from "@/lib/organization/authority";
import { recordAuditEvent } from "./strictAudit";
import { deriveMasterContentReference } from "./masterContentReference";
import { loadRegistrationCheck, loadVersion, verifyStoredMasterIntegrity } from "./masterRegistryActions";
import { transitionLegalDocumentVersionStatus } from "./masterRegistry";
import {
  approvalPreconditions, approverLabelFor, CONSULTATION_MODE, describeVersion, FOUNDER_APPROVAL_ACTION, FOUNDER_APPROVAL_BASIS, NOT_COUNSEL_APPROVAL_STATEMENT, validateFounderApproval,
  type FounderApprovalInput, type Precondition, type VersionRole,
} from "./founderApproval";

// FOUNDER APPROVAL ON COUNSEL'S ADVICE - server side (LOCAL build, nothing released). It uses the EXISTING controls and adds none that weakens them:
//  - contract-administer authority (a Super Admin passes through the existing override) AND the signed-in profile must be the active Founder identity;
//  - the version must be in legal review with the stored master registered, clause-checked and byte-verified (the same checks activation makes);
//  - the registry's own approve transition stamps the real time (never back-dated); the approval is set once.
// The review record (consultation, counsel's recommendations, final hash, the Founder's confirmation) is stored in the audit log with the existing strict audit
// write: if it cannot be written, the approval is reversed and nothing is left behind. This module never activates, publishes or issues anything.

type Fail = { ok: false; error: string; errors?: string[] };
const today = () => new Date().toISOString().slice(0, 10);

async function requireFounder(actorUserId: string): Promise<{ ok: true } | Fail> {
  const auth = await authorizeWithSuperAdminOverride(actorUserId, GOVERNANCE_CAPABILITIES.contractAdminister);
  if (!auth.ok) return { ok: false, error: "Not authorized to administer legal documents." };
  const { data, error } = await createAdminClient().from("founder_identities").select("profile_id").eq("status", "active").limit(1).maybeSingle();
  if (error) return { ok: false, error: "The Founder identity could not be verified right now. Nothing was changed." };
  if (!data) return { ok: false, error: "No active Founder identity is on record, so a Founder approval cannot be recorded." };
  if ((data as { profile_id: string }).profile_id !== actorUserId) return { ok: false, error: "Only the Founder can record a Founder approval." };
  return { ok: true };
}

// ------------------------------------------------------------------ stored record (read back from the audit log)
export type StoredFounderApproval = { versionId: string; recordedAt: string; actorProfileId: string | null; actorLabel: string | null; metadata: Record<string, unknown> };
export async function loadFounderApproval(versionId: string): Promise<StoredFounderApproval | null> {
  const admin = createAdminClient();
  const { data } = await admin.from("activity_log").select("actor_user_id, metadata, created_at").eq("action", FOUNDER_APPROVAL_ACTION).eq("entity_id", versionId).order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (!data) return null;
  const actor = (data.actor_user_id as string | null) ?? null;
  let actorLabel: string | null = null;
  if (actor) { const { data: p } = await admin.from("profiles").select("member_number").eq("id", actor).maybeSingle(); actorLabel = (p?.member_number as string | null) ? `member ${p!.member_number}` : null; }   // audit identity standard: member number, not name
  return { versionId, recordedAt: data.created_at as string, actorProfileId: actor, actorLabel, metadata: (data.metadata ?? {}) as Record<string, unknown> };
}

// ------------------------------------------------------------------ read model for the screen (read-only)
export type VersionLine = { id: string; version: string; status: string; role: VersionRole; note: string; approvedBy: string | null; approvedAt: string | null; effectiveDate: string | null };
export type FounderApprovalView =
  | { found: false }
  | {
    found: true; code: string; title: string;
    target: { id: string; version: string; status: string; docxSha256: string | null; pdfSha256: string | null; documentHash: string | null; contentReference: string | null; approvedAt: string | null; approvedBy: string | null; createdAt: string };
    versions: VersionLine[]; preconditions: Precondition[]; record: StoredFounderApproval | null;
    founder: { hasActiveFounder: boolean; viewerIsFounder: boolean }; registered: boolean;
  };

export async function loadFounderApprovalView(versionId: string, viewerUserId: string): Promise<FounderApprovalView> {
  const loaded = await loadVersion(versionId);
  if (!loaded) return { found: false };
  const { v, code } = loaded;
  const admin = createAdminClient();
  const [{ data: master }, { data: siblings }, { data: founder }, record, registration] = await Promise.all([
    admin.from("legal_document_masters").select("title, current_version_id").eq("id", v.master_id).maybeSingle(),
    admin.from("legal_document_versions").select("id, version, status, approved_by, approved_at, effective_date, legacy_code, created_at").eq("master_id", v.master_id).order("created_at"),
    admin.from("founder_identities").select("profile_id").eq("status", "active").limit(1).maybeSingle(),
    loadFounderApproval(v.id),
    loadRegistrationCheck(v.id),
  ]);
  const currentId = (master?.current_version_id as string | null) ?? null;
  const rows = (siblings ?? []) as { id: string; version: string; status: string; approved_by: string | null; approved_at: string | null; effective_date: string | null; legacy_code: string | null }[];
  const me = rows.find((r) => r.id === v.id);
  const registered = Boolean(v.content_reference && v.document_hash);
  let verified: boolean | null = null; let markers: number | null = registration && registration.unresolvedMarkers >= 0 ? registration.unresolvedMarkers : null;
  if (registered && v.status !== "approved" && v.status !== "active") { const integ = await verifyStoredMasterIntegrity(v); verified = integ.ok; if (integ.ok) markers = integ.markers; }
  const preconditions = approvalPreconditions({
    status: v.status, legacyCode: me?.legacy_code ?? null, approvedAt: v.approved_at, contentRegistered: registered, unresolvedMarkers: markers, storedMasterVerified: verified,
    founderApprovalExists: Boolean(record), isCurrentActiveVersion: currentId === v.id && v.status === "active",
  });
  return {
    found: true, code, title: (master?.title as string | undefined) ?? code,
    target: { id: v.id, version: me?.version ?? v.version, status: v.status, docxSha256: v.master_docx_sha256, pdfSha256: v.master_pdf_sha256, documentHash: v.document_hash, contentReference: v.content_reference, approvedAt: v.approved_at, approvedBy: v.approved_by, createdAt: v.created_at },
    versions: rows.map((r) => { const d = describeVersion({ id: r.id, version: r.version, status: r.status, legacyCode: r.legacy_code, approvedBy: r.approved_by, approvedAt: r.approved_at }, currentId, v.id); return { id: r.id, version: r.version, status: r.status, role: d.role, note: d.note, approvedBy: r.approved_by, approvedAt: r.approved_at, effectiveDate: r.effective_date }; }),
    preconditions, record, registered,
    founder: { hasActiveFounder: Boolean(founder), viewerIsFounder: (founder as { profile_id: string } | null)?.profile_id === viewerUserId },
  };
}

// ------------------------------------------------------------------ step 1: start the legal review (draft -> legal review), by the existing transition
export async function startLegalReview(params: { versionId: string; actorUserId: string }): Promise<{ ok: true } | Fail> {
  const f = await requireFounder(params.actorUserId);
  if (!f.ok) return f;
  const loaded = await loadVersion(params.versionId);
  if (!loaded) return { ok: false, error: "Legal document version not found." };
  if (loaded.v.status !== "draft") return { ok: false, error: `Only a draft can be moved into legal review (this one is “${loaded.v.status}”).` };
  const sib = await createAdminClient().from("legal_document_versions").select("legacy_code").eq("id", params.versionId).maybeSingle();
  if (sib.data?.legacy_code) return { ok: false, error: "The legacy-mapped active version is never moved through this screen." };
  return transitionLegalDocumentVersionStatus({ versionId: params.versionId, toStatus: "legal_review", actorUserId: params.actorUserId });
}

// ------------------------------------------------------------------ step 3: record the Founder approval
export type FounderApprovalResult = { ok: true; approvedAt: string; documentHash: string } | Fail;
export async function recordFounderApproval(params: { versionId: string; input: FounderApprovalInput; actorUserId: string }): Promise<FounderApprovalResult> {
  const f = await requireFounder(params.actorUserId);
  if (!f.ok) return f;
  const loaded = await loadVersion(params.versionId);
  if (!loaded) return { ok: false, error: "Legal document version not found." };
  const { v, code } = loaded;
  const admin = createAdminClient();
  const [{ data: row }, { data: master }, prior, registration] = await Promise.all([
    admin.from("legal_document_versions").select("version, legacy_code, approved_by").eq("id", v.id).maybeSingle(),
    admin.from("legal_document_masters").select("current_version_id").eq("id", v.master_id).maybeSingle(),
    loadFounderApproval(v.id),
    loadRegistrationCheck(v.id),
  ]);
  const version = (row?.version as string | undefined) ?? "";
  if (!version) return { ok: false, error: "The version label is missing from the registry row." };
  if (row?.legacy_code) return { ok: false, error: "The legacy-mapped active version is never approved through this screen." };
  if (master?.current_version_id === v.id && v.status === "active") return { ok: false, error: "This is the active version; it is the comparison baseline and is not approved here." };
  if (v.status !== "legal_review") return { ok: false, error: v.status === "draft" ? "Start the legal review first." : `This version is “${v.status}”; only a version in legal review can be approved.` };
  if (v.approved_at || row?.approved_by || prior) return { ok: false, error: "An approval is already on record for this version. It is set once and is not replaced; a correction needs your separate instruction." };
  if (!v.content_reference || !v.document_hash) return { ok: false, error: "The stored master is not registered under a controlled content reference. Register it first." };
  if (!registration || registration.unresolvedMarkers !== 0) return { ok: false, error: "The registration did not record a clean clause check (no unresolved counsel-review markers). A correction needs your separate instruction." };

  // the files that will be approved are re-read and re-hashed NOW, exactly as activation will later do
  const integrity = await verifyStoredMasterIntegrity(v);
  if (!integrity.ok) return { ok: false, error: `${integrity.error} Nothing was approved.` };
  if (integrity.markers > 0) return { ok: false, error: `The master contains ${integrity.markers} unresolved counsel-review marker(s). Nothing was approved.` };
  const expected = deriveMasterContentReference({ code, version, docxPath: v.master_docx_storage_path!, docxSha256: v.master_docx_sha256!, pdfPath: v.master_pdf_storage_path!, pdfSha256: v.master_pdf_sha256! });
  if (v.content_reference !== expected.contentReference || v.document_hash !== expected.documentHash || integrity.docxSha256 !== v.document_hash) return { ok: false, error: "The registered content reference no longer matches the stored master. Nothing was approved." };

  const verdict = validateFounderApproval(params.input, { today: today(), code, version, registeredDocxSha256: v.document_hash });
  if (!verdict.ok) return { ok: false, error: verdict.errors[0], errors: verdict.errors };

  // 1) the registry's own approve transition: stamps the real time and moves legal_review -> approved (compare-and-swap on the prior status)
  const moved = await transitionLegalDocumentVersionStatus({ versionId: v.id, toStatus: "approved", actorUserId: params.actorUserId });
  if (!moved.ok) return { ok: false, error: moved.error };
  const { data: stamped } = await admin.from("legal_document_versions").select("approved_at").eq("id", v.id).maybeSingle();
  const approvedAt = (stamped?.approved_at as string | null) ?? null;
  const revert = async () => { await admin.from("legal_document_versions").update({ status: "legal_review", approved_at: null, approved_by: null }).eq("id", v.id).eq("status", "approved"); };
  if (!approvedAt) { await revert(); return { ok: false, error: "The registry did not stamp the approval time, so the approval was reversed. Nothing was approved." }; }

  // 2) the approver label says plainly whose approval this is
  const label = await admin.from("legal_document_versions").update({ approved_by: approverLabelFor(params.input.consultationDate) }).eq("id", v.id).is("approved_by", null);
  if (label.error) { await revert(); return { ok: false, error: "The approver label could not be recorded, so the approval was reversed. Nothing was approved." }; }

  // 3) the full review record, in the strict audit log
  const i = params.input;
  const { data: versions } = await admin.from("legal_document_versions").select("id, version, status, approved_by, approved_at, legacy_code").eq("master_id", v.master_id);
  const lines = ((versions ?? []) as { id: string; version: string; status: string; approved_by: string | null; approved_at: string | null; legacy_code: string | null }[])
    .filter((r) => r.id !== v.id).map((r) => ({ versionId: r.id, version: r.version, status: r.status, ...describeVersion({ id: r.id, version: r.version, status: r.status, legacyCode: r.legacy_code, approvedBy: r.approved_by, approvedAt: r.approved_at }, (master?.current_version_id as string | null) ?? null, v.id) }));
  const written = await recordAuditEvent({
    actorUserId: params.actorUserId, action: FOUNDER_APPROVAL_ACTION, entityType: "legal_document_version", entityId: v.id,
    metadata: {
      basis: FOUNDER_APPROVAL_BASIS, notCounselIssuedWrittenApproval: true, statement: NOT_COUNSEL_APPROVAL_STATEMENT,
      documentCode: code, version, approvedAt,
      consultation: { mode: CONSULTATION_MODE, date: i.consultationDate, startTime: i.startTime, endTime: i.endTime, timezone: i.timezone, counselName: i.counselName.trim(), counselFirm: i.counselFirm.trim(), identityCheckNote: i.identityCheckNote.trim(), recordedBy: "founder" },
      advice: { recommendations: i.recommendations.trim(), amendmentsRequested: i.amendments.trim(), conclusion: i.conclusion, conclusionNote: i.conclusionNote.trim(), counselAskedToSeeFinalText: i.counselAskedToSeeFinalText, reconfirmationNote: i.reconfirmationNote.trim() || null },
      document: { version, docxSha256: v.master_docx_sha256, pdfSha256: v.master_pdf_sha256, documentHash: v.document_hash, contentReference: v.content_reference, reviewedDraftSha256: i.reviewedDraftSha256.trim().toLowerCase(), textRelation: i.textRelation },
      confirmation: { statementAccepted: true, typedHashPrefix: i.typedHashPrefix.trim().toLowerCase(), typedSentence: i.typedSentence.trim() },
      otherVersionsAtApproval: lines, activated: false, issued: false, published: false, schemaVersion: 1,
    },
  });
  if (!written.ok) { await revert(); return { ok: false, error: "The review record could not be written, so the approval was reversed. Nothing was approved." }; }
  return { ok: true, approvedAt, documentHash: v.document_hash };
}

