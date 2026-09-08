import { createAdminClient } from "@/lib/supabase/admin";
import { logActivity } from "@/lib/admin/activityLog";
import { authorizeWithSuperAdminOverride, GOVERNANCE_CAPABILITIES } from "@/lib/organization/authority";
import {
  isValidTemplateLifecycleTransition,
  isOfficialMasterContentIngested,
  type TemplateLifecycleStatus,
  type LegalDocumentClassification,
} from "./masterCatalogue";
import { deriveLegalMastersStatus, derivePublicLegalPagesStatus, type LegalMastersStatus, type PublicLegalPagesStatus } from "./legalSettingsStatus";

// Ordift Studios Legal Suite — LEGAL-SYS-1, Phase D-0 + First
// Implementation Block (2026-09-08). DB-backed layer for
// public.legal_document_masters/legal_document_versions (migration
// 0067). This module is metadata/governance only — it never renders,
// stores, or fabricates actual legal prose. The real, already-live
// public legal content continues to be served entirely unchanged from
// the existing in-code OSELS registry (src/lib/legal/registry.ts) at
// /legal/[slug]; this module's job is to make the Settings page (and
// any future Admin Legal & Governance area) tell the truth about
// where that content stands, never the other way around.

export type LegalDocumentVersion = {
  id: string;
  masterId: string;
  version: string;
  status: TemplateLifecycleStatus;
  approvedBy: string | null;
  approvedAt: string | null;
  effectiveDate: string | null;
  activatedAt: string | null;
  retiredAt: string | null;
  supersedesId: string | null;
  legacyCode: string | null;
  publicSlug: string | null;
  contentReference: string | null;
  documentHash: string | null;
  masterDocxStoragePath: string | null;
  masterDocxSha256: string | null;
  masterPdfStoragePath: string | null;
  masterPdfSha256: string | null;
  ingestedAt: string | null;
  notes: string | null;
  createdAt: string;
};

export type LegalDocumentMaster = {
  id: string;
  canonicalCode: string;
  title: string;
  classification: LegalDocumentClassification;
  currentVersionId: string | null;
  versions: LegalDocumentVersion[];
};

function mapVersion(r: {
  id: string;
  master_id: string;
  version: string;
  status: string;
  approved_by: string | null;
  approved_at: string | null;
  effective_date: string | null;
  activated_at: string | null;
  retired_at: string | null;
  supersedes_id: string | null;
  legacy_code: string | null;
  public_slug: string | null;
  content_reference: string | null;
  document_hash: string | null;
  master_docx_storage_path: string | null;
  master_docx_sha256: string | null;
  master_pdf_storage_path: string | null;
  master_pdf_sha256: string | null;
  ingested_at: string | null;
  notes: string | null;
  created_at: string;
}): LegalDocumentVersion {
  return {
    id: r.id,
    masterId: r.master_id,
    version: r.version,
    status: r.status as TemplateLifecycleStatus,
    approvedBy: r.approved_by,
    approvedAt: r.approved_at,
    effectiveDate: r.effective_date,
    activatedAt: r.activated_at,
    retiredAt: r.retired_at,
    supersedesId: r.supersedes_id,
    legacyCode: r.legacy_code,
    publicSlug: r.public_slug,
    contentReference: r.content_reference,
    documentHash: r.document_hash,
    masterDocxStoragePath: r.master_docx_storage_path,
    masterDocxSha256: r.master_docx_sha256,
    masterPdfStoragePath: r.master_pdf_storage_path,
    masterPdfSha256: r.master_pdf_sha256,
    ingestedAt: r.ingested_at,
    notes: r.notes,
    createdAt: r.created_at,
  };
}

const MASTER_SELECT = "id, canonical_code, title, classification, current_version_id";
const VERSION_SELECT =
  "id, master_id, version, status, approved_by, approved_at, effective_date, activated_at, retired_at, supersedes_id, legacy_code, public_slug, content_reference, document_hash, master_docx_storage_path, master_docx_sha256, master_pdf_storage_path, master_pdf_sha256, ingested_at, notes, created_at";

// Lists every canonical master with its full version history —
// Admin-tier read only (RLS itself already enforces this; this
// function doesn't re-check the actor, matching the established
// pattern for other admin-read-only listers in this codebase, e.g.
// listFinancialAuthorityLevelThresholds()).
export async function listLegalDocumentMasters(): Promise<LegalDocumentMaster[]> {
  const admin = createAdminClient();
  const [{ data: masters, error: mastersError }, { data: versions, error: versionsError }] = await Promise.all([
    admin.from("legal_document_masters").select(MASTER_SELECT).order("canonical_code"),
    admin.from("legal_document_versions").select(VERSION_SELECT).order("created_at"),
  ]);
  if (mastersError || versionsError) {
    console.error("[legal] failed to load legal_document_masters/versions", mastersError?.message, versionsError?.message);
    return [];
  }

  const versionsByMaster = new Map<string, LegalDocumentVersion[]>();
  for (const v of versions ?? []) {
    const mapped = mapVersion(v);
    const list = versionsByMaster.get(mapped.masterId) ?? [];
    list.push(mapped);
    versionsByMaster.set(mapped.masterId, list);
  }

  return (masters ?? []).map((m) => ({
    id: m.id,
    canonicalCode: m.canonical_code,
    title: m.title,
    classification: m.classification as LegalDocumentClassification,
    currentVersionId: m.current_version_id,
    versions: versionsByMaster.get(m.id) ?? [],
  }));
}

export type LegalSuiteSettingsStatus = {
  legalMastersStatus: LegalMastersStatus;
  publicLegalPagesStatus: PublicLegalPagesStatus;
};

// The single function the Settings page calls — fetches the real rows
// and runs them through the pure derivation logic in
// legalSettingsStatus.ts. Never returns a hand-set flag.
export async function getLegalSuiteSettingsStatus(): Promise<LegalSuiteSettingsStatus> {
  const masters = await listLegalDocumentMasters();
  const input = masters.map((m) => ({
    canonicalCode: m.canonicalCode,
    classification: m.classification,
    versions: m.versions.map((v) => ({ status: v.status, effectiveDate: v.effectiveDate, publicSlug: v.publicSlug })),
  }));
  return {
    legalMastersStatus: deriveLegalMastersStatus(input),
    publicLegalPagesStatus: derivePublicLegalPagesStatus(input),
  };
}

async function requireContractAdminister(actorUserId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const auth = await authorizeWithSuperAdminOverride(actorUserId, GOVERNANCE_CAPABILITIES.contractAdminister);
  if (!auth.ok) return { ok: false, error: "Not authorized to administer legal document masters." };
  return { ok: true };
}

// Transitions an EXISTING version's lifecycle status (never creates a
// new version — that is a separate, future "supersede" operation).
// Refuses any transition isValidTemplateLifecycleTransition() doesn't
// allow (e.g. approved -> draft, or skipping legal_review). Reaching
// "active" for the first time stamps activated_at, and repoints the
// owning master's current_version_id — the one deliberate, explicit
// "Production Activation" moment Part 5/6 requires; nothing in this
// phase calls this function to actually activate anything.
export async function transitionLegalDocumentVersionStatus(params: {
  versionId: string;
  toStatus: TemplateLifecycleStatus;
  actorUserId: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const auth = await requireContractAdminister(params.actorUserId);
  if (!auth.ok) return auth;

  const admin = createAdminClient();
  const { data: existing } = await admin
    .from("legal_document_versions")
    .select("id, master_id, status")
    .eq("id", params.versionId)
    .maybeSingle();
  if (!existing) return { ok: false, error: "Legal document version not found." };

  const fromStatus = existing.status as TemplateLifecycleStatus;
  if (!isValidTemplateLifecycleTransition(fromStatus, params.toStatus)) {
    return { ok: false, error: `Cannot move a legal document version from "${fromStatus}" to "${params.toStatus}".` };
  }

  const now = new Date().toISOString();
  const updates: Record<string, unknown> = { status: params.toStatus };
  if (params.toStatus === "approved") updates.approved_at = now;
  if (params.toStatus === "active") updates.activated_at = now;
  if (params.toStatus === "retired") updates.retired_at = now;

  // Atomic compare-and-swap on the prior status, same idempotency
  // pattern as advanceOnboardingStage()/completeStaffOnboarding().
  const { error } = await admin
    .from("legal_document_versions")
    .update(updates)
    .eq("id", params.versionId)
    .eq("status", fromStatus);
  if (error) {
    console.error("[legal] failed to transition legal_document_version status", error.message);
    return { ok: false, error: "Failed to update the document version status." };
  }

  if (params.toStatus === "active") {
    const { error: repointError } = await admin
      .from("legal_document_masters")
      .update({ current_version_id: params.versionId })
      .eq("id", existing.master_id);
    if (repointError) console.error("[legal] failed to repoint current_version_id", repointError.message);
  }

  await logActivity({
    actorUserId: params.actorUserId,
    action: "legal.master_version.status_changed",
    entityType: "legal_document_version",
    entityId: params.versionId,
    metadata: { fromStatus, toStatus: params.toStatus, masterId: existing.master_id },
  });

  return { ok: true };
}

export type LegalSuiteProvenanceDocument = {
  id: string;
  title: string;
  releaseVersion: string;
  storagePath: string;
  sha256: string | null;
  createdAt: string;
};

// Release-level control artifacts (Official Master Register, Change
// Log, Production Certification, Variable Placeholder Resolution
// Register) — admin-tier read only, matching every other legal table.
export async function listLegalSuiteProvenanceDocuments(): Promise<LegalSuiteProvenanceDocument[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("legal_suite_provenance_documents")
    .select("id, title, release_version, storage_path, sha256, created_at")
    .order("title");
  if (error) {
    console.error("[legal] failed to load legal_suite_provenance_documents", error.message);
    return [];
  }
  return (data ?? []).map((r) => ({
    id: r.id,
    title: r.title,
    releaseVersion: r.release_version,
    storagePath: r.storage_path,
    sha256: r.sha256,
    createdAt: r.created_at,
  }));
}

export type MasterIngestionSummary = { canonicalCode: string; title: string; ingested: boolean };

// One row per canonical master — whether its real Official Master
// source content (DOCX + PDF, both hash-recorded) has been ingested
// yet. Checks the v1.0 "approved" (non-legacy) version specifically,
// the one place ingested content is ever attached — never the legacy
// version (which always has content, by definition, from the OSELS
// reconciliation, not from this ingestion path).
export async function getMasterIngestionSummary(): Promise<MasterIngestionSummary[]> {
  const masters = await listLegalDocumentMasters();
  return masters.map((m) => {
    const v1 = m.versions.find((v) => v.version === "1.0" && v.status !== "active" && v.legacyCode === null) ?? m.versions.find((v) => v.legacyCode === null);
    return {
      canonicalCode: m.canonicalCode,
      title: m.title,
      ingested: v1 ? isOfficialMasterContentIngested({
        masterDocxStoragePath: v1.masterDocxStoragePath,
        masterDocxSha256: v1.masterDocxSha256,
        masterPdfStoragePath: v1.masterPdfStoragePath,
        masterPdfSha256: v1.masterPdfSha256,
      }) : false,
    };
  });
}
