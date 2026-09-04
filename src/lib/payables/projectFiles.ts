import { createAdminClient } from "@/lib/supabase/admin";
import { logActivity } from "@/lib/admin/activityLog";
import { authorizeWithSuperAdminOverride, FINANCE_CAPABILITIES } from "@/lib/organization/authority";

// Phase H.1/H.2 (2026-09-04) — direct-to-Supabase-Storage media
// architecture for external-workforce engagements, and the backup/
// grace-period/purge lifecycle for temporary project media (Sections
// 11-22 of the spec). File bytes never pass through this server —
// this module only ever issues short-lived signed URLs and records/
// reads metadata. No file bytes are ever read into memory here.

const BUCKET = "project-media";
const DEFAULT_GRACE_PERIOD_DAYS = 10; // within the spec's suggested 7-14 day MVP range

export const PROJECT_FILE_KINDS = [
  "source_raw",
  "source_reference",
  "intermediate",
  "working",
  "deliverable",
  "final_approved",
  "revision",
  "archive_reference",
  "other",
] as const;
export type ProjectFileKind = (typeof PROJECT_FILE_KINDS)[number];

// Only these kinds may be uploaded by the assigned contractor
// themselves — source/reference/working material stays staff-uploaded,
// matching the RLS policy's own WITH CHECK (belt-and-suspenders: this
// is checked again here so the error message is meaningful before ever
// reaching the database).
const CONTRACTOR_UPLOADABLE_KINDS: ProjectFileKind[] = ["deliverable", "revision"];

function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-180);
}

async function resolveActorAccess(
  engagementId: string,
  actorUserId: string
): Promise<{ ok: true; isContractor: boolean; payeeProfileId: string } | { ok: false; error: string }> {
  const admin = createAdminClient();
  const { data: engagement } = await admin.from("engagements").select("payee_profile_id").eq("id", engagementId).maybeSingle();
  if (!engagement) return { ok: false, error: "Engagement not found." };

  if (engagement.payee_profile_id === actorUserId) {
    return { ok: true, isContractor: true, payeeProfileId: engagement.payee_profile_id };
  }

  const auth = await authorizeWithSuperAdminOverride(actorUserId, FINANCE_CAPABILITIES.payeeAdminister);
  if (!auth.ok) return { ok: false, error: "Not authorized to manage files for this engagement." };
  return { ok: true, isContractor: false, payeeProfileId: engagement.payee_profile_id };
}

// Step 1 of the direct-upload flow: browser asks Ordift for permission
// before ever touching Storage. Returns a short-lived, single-use
// signed upload URL/token — the browser then PUTs the file bytes
// straight to Supabase Storage, never through this Next.js server.
export async function requestProjectFileUploadAuthorization(params: {
  engagementId: string;
  fileKind: string;
  originalFilename: string;
  actorUserId: string;
}): Promise<{ ok: true; signedUrl: string; token: string; path: string } | { ok: false; error: string }> {
  if (!PROJECT_FILE_KINDS.includes(params.fileKind as ProjectFileKind)) {
    return { ok: false, error: "Unrecognized file kind." };
  }

  const access = await resolveActorAccess(params.engagementId, params.actorUserId);
  if (!access.ok) return access;
  if (access.isContractor && !CONTRACTOR_UPLOADABLE_KINDS.includes(params.fileKind as ProjectFileKind)) {
    return { ok: false, error: "Only deliverable/revision files may be uploaded here — source and reference material is added by Ordift staff." };
  }

  const admin = createAdminClient();
  const path = `${params.engagementId}/${crypto.randomUUID()}-${sanitizeFilename(params.originalFilename)}`;
  const { data, error } = await admin.storage.from(BUCKET).createSignedUploadUrl(path);
  if (error || !data) {
    console.error("[payables] failed to create signed upload URL", error?.message);
    return { ok: false, error: "Failed to authorize the upload." };
  }
  return { ok: true, signedUrl: data.signedUrl, token: data.token, path: data.path };
}

// Step 2: called by the browser only after the direct upload to
// Storage has actually succeeded — writes the metadata row. This is
// the one part of the flow that must stay server-authorized even
// though the bytes bypassed the server, so a client can never fabricate
// a file record for bytes that were never actually uploaded/authorized.
export async function recordUploadedProjectFile(params: {
  engagementId: string;
  fileKind: string;
  storagePath: string;
  originalFilename: string;
  mimeType: string | null;
  sizeBytes: number | null;
  actorUserId: string;
  notes?: string | null;
  supersedesFileId?: string | null;
}): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  if (!PROJECT_FILE_KINDS.includes(params.fileKind as ProjectFileKind)) {
    return { ok: false, error: "Unrecognized file kind." };
  }
  // storagePath must actually belong to this engagement — the first
  // path segment is the owning engagement id (same convention as every
  // other private bucket in this schema).
  if (!params.storagePath.startsWith(`${params.engagementId}/`)) {
    return { ok: false, error: "Storage path does not match this engagement." };
  }

  const access = await resolveActorAccess(params.engagementId, params.actorUserId);
  if (!access.ok) return access;
  if (access.isContractor && !CONTRACTOR_UPLOADABLE_KINDS.includes(params.fileKind as ProjectFileKind)) {
    return { ok: false, error: "Only deliverable/revision files may be recorded here." };
  }

  const admin = createAdminClient();

  let version = 1;
  if (params.supersedesFileId) {
    const { data: previous } = await admin.from("project_files").select("version").eq("id", params.supersedesFileId).maybeSingle();
    if (previous) version = previous.version + 1;
  }

  const { data, error } = await admin
    .from("project_files")
    .insert({
      engagement_id: params.engagementId,
      file_kind: params.fileKind,
      storage_bucket: BUCKET,
      storage_path: params.storagePath,
      original_filename: params.originalFilename,
      mime_type: params.mimeType,
      size_bytes: params.sizeBytes,
      version,
      uploaded_by: params.actorUserId,
      notes: params.notes ?? (params.supersedesFileId ? `Supersedes file ${params.supersedesFileId}` : null),
    })
    .select("id")
    .single();
  if (error || !data) {
    console.error("[payables] failed to record project_files row", error?.message);
    return { ok: false, error: "Failed to record the uploaded file." };
  }

  await logActivity({
    actorUserId: params.actorUserId,
    action: "project_file.uploaded",
    entityType: "engagement",
    entityId: params.engagementId,
    metadata: { fileId: data.id, fileKind: params.fileKind, originalFilename: params.originalFilename, sizeBytes: params.sizeBytes, uploadedByContractor: access.isContractor },
  });

  return { ok: true, id: data.id };
}

export type ProjectFile = {
  id: string;
  engagementId: string;
  fileKind: string;
  originalFilename: string;
  mimeType: string | null;
  sizeBytes: number | null;
  version: number;
  uploadedBy: string;
  uploadedAt: string;
  notes: string | null;
  lifecycleState: string;
  retain: boolean;
  retainUntil: string | null;
  backupConfirmedBy: string | null;
  backupConfirmedAt: string | null;
  purgeScheduledAt: string | null;
  purgedAt: string | null;
  purgeReason: string | null;
};

const FILE_SELECT =
  "id, engagement_id, file_kind, storage_path, original_filename, mime_type, size_bytes, version, uploaded_by, uploaded_at, notes, lifecycle_state, retain, retain_until, backup_confirmed_by, backup_confirmed_at, purge_scheduled_at, purged_at, purge_reason";

function mapProjectFile(r: Record<string, unknown>): ProjectFile {
  return {
    id: r.id as string,
    engagementId: r.engagement_id as string,
    fileKind: r.file_kind as string,
    originalFilename: r.original_filename as string,
    mimeType: r.mime_type as string | null,
    sizeBytes: r.size_bytes as number | null,
    version: r.version as number,
    uploadedBy: r.uploaded_by as string,
    uploadedAt: r.uploaded_at as string,
    notes: r.notes as string | null,
    lifecycleState: r.lifecycle_state as string,
    retain: r.retain as boolean,
    retainUntil: r.retain_until as string | null,
    backupConfirmedBy: r.backup_confirmed_by as string | null,
    backupConfirmedAt: r.backup_confirmed_at as string | null,
    purgeScheduledAt: r.purge_scheduled_at as string | null,
    purgedAt: r.purged_at as string | null,
    purgeReason: r.purge_reason as string | null,
  };
}

// Admin-side list — matches this codebase's established convention of
// separate admin (admin-client) vs portal (session-client, RLS-scoped)
// read functions, even where logically similar. See
// engagementPortalData.ts for the portal-side self-read equivalent.
export async function listProjectFilesForEngagement(engagementId: string): Promise<ProjectFile[]> {
  const admin = createAdminClient();
  const { data, error } = await admin.from("project_files").select(FILE_SELECT).eq("engagement_id", engagementId).order("uploaded_at", { ascending: false });
  if (error) {
    console.error("[payables] failed to load project_files", error.message);
    return [];
  }
  return (data ?? []).map(mapProjectFile);
}

// Portal-safe list — unlike listProjectFilesForEngagement() (admin-
// only, no authorization check of its own, by design matching every
// other admin bulk-list function in this codebase), this re-verifies
// the requesting user is either the assigned contractor or staff
// before returning anything, so the collaborator portal never needs to
// trust RLS alone for a list built via the admin client.
export async function listMyProjectFiles(engagementId: string, actorUserId: string): Promise<{ ok: true; files: ProjectFile[] } | { ok: false; error: string }> {
  const access = await resolveActorAccess(engagementId, actorUserId);
  if (!access.ok) return access;
  return { ok: true, files: await listProjectFilesForEngagement(engagementId) };
}

// Signed download URL — same 300s-TTL pattern already proven by
// getPaymentEvidenceSignedUrl()/getRecruitmentFileSignedUrl().
export async function getProjectFileDownloadUrl(fileId: string, actorUserId: string): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const admin = createAdminClient();
  const { data: file } = await admin.from("project_files").select("engagement_id, storage_bucket, storage_path, purged_at").eq("id", fileId).maybeSingle();
  if (!file) return { ok: false, error: "File not found." };
  if (file.purged_at) return { ok: false, error: "This file has been purged and is no longer available for download." };

  const access = await resolveActorAccess(file.engagement_id, actorUserId);
  if (!access.ok) return access;

  const { data, error } = await admin.storage.from(file.storage_bucket).createSignedUrl(file.storage_path, 300);
  if (error || !data) {
    console.error("[payables] failed to create signed download URL", error?.message);
    return { ok: false, error: "Failed to authorize the download." };
  }
  return { ok: true, url: data.signedUrl };
}

// ============================================================
// Backup / grace-period / purge lifecycle (Sections 14-22)
// ============================================================

// Pure, directly testable — the actual gate that decides whether a
// file may ever be deleted. Every condition in Section 17 of the spec
// is represented here; the DB-backed purge job below does nothing but
// fetch inputs and call this. file_kind === 'final_approved' is an
// unconditional exclusion, checked first and independent of every
// other flag — classification determines retention, not lifecycle
// state or extension (Section 21).
export function isProjectFilePurgeEligible(params: {
  fileKind: string;
  lifecycleState: string;
  retain: boolean;
  retainUntil: string | null;
  backupConfirmedAt: string | null;
  engagementStatus: string;
  gracePeriodDays: number;
  now: Date;
}): boolean {
  if (params.fileKind === "final_approved") return false;
  if (params.lifecycleState === "purged") return false;
  if (params.retain) return false;
  if (params.retainUntil && new Date(params.retainUntil) > params.now) return false;
  // Conservative: only a truly terminal engagement state qualifies —
  // 'work_approved' alone is deliberately excluded, since further
  // revisions could still follow it.
  if (!["completed", "cancelled"].includes(params.engagementStatus)) return false;
  if (!params.backupConfirmedAt) return false;
  const graceElapsesAt = new Date(params.backupConfirmedAt);
  graceElapsesAt.setDate(graceElapsesAt.getDate() + params.gracePeriodDays);
  if (params.now < graceElapsesAt) return false;
  return true;
}

// Derives what to SHOW for a file's backup/lifecycle progress without
// requiring a separate stored "project-level" state table — computed
// from the file's own lifecycle_state plus its engagement's status, so
// there is exactly one source of truth (the file row) and no risk of a
// project-level summary silently disagreeing with it.
export function deriveProjectFileDisplayState(params: { lifecycleState: string; engagementStatus: string; fileKind: string }): string {
  if (params.lifecycleState === "purged") return "Cleanup Completed";
  if (params.fileKind === "final_approved") return "Retained (Final Deliverable)";
  if (params.lifecycleState === "backup_confirmed") return "Backup Confirmed";
  if (["completed", "cancelled"].includes(params.engagementStatus)) return "Backup Required";
  return "Active";
}

export async function confirmProjectFilesBackup(params: {
  fileIds: string[];
  note?: string | null;
  actorUserId: string;
}): Promise<{ ok: true; confirmedCount: number } | { ok: false; error: string }> {
  const auth = await authorizeWithSuperAdminOverride(params.actorUserId, FINANCE_CAPABILITIES.payeeAdminister);
  if (!auth.ok) return { ok: false, error: "Not authorized to confirm a media backup." };
  if (params.fileIds.length === 0) return { ok: false, error: "Select at least one file." };

  const admin = createAdminClient();
  const now = new Date();
  const purgeScheduledAt = new Date(now);
  purgeScheduledAt.setDate(purgeScheduledAt.getDate() + DEFAULT_GRACE_PERIOD_DAYS);

  const { data, error } = await admin
    .from("project_files")
    .update({
      lifecycle_state: "backup_confirmed",
      backup_confirmed_by: params.actorUserId,
      backup_confirmed_at: now.toISOString(),
      purge_scheduled_at: purgeScheduledAt.toISOString(),
      notes: params.note ?? undefined,
    })
    .in("id", params.fileIds)
    .eq("lifecycle_state", "active") // no-op on already-confirmed/purged rows — idempotent
    .neq("file_kind", "final_approved")
    .select("id");
  if (error) {
    console.error("[payables] failed to confirm project file backup", error.message);
    return { ok: false, error: "Failed to confirm backup." };
  }

  await logActivity({
    actorUserId: params.actorUserId,
    action: "project_file.backup_confirmed",
    entityType: "user",
    entityId: params.actorUserId,
    metadata: { fileIds: params.fileIds, confirmedCount: data?.length ?? 0, purgeScheduledAt: purgeScheduledAt.toISOString() },
  });

  return { ok: true, confirmedCount: data?.length ?? 0 };
}

export async function setProjectFileRetain(params: {
  fileId: string;
  retain: boolean;
  retainUntil?: string | null;
  actorUserId: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const auth = await authorizeWithSuperAdminOverride(params.actorUserId, FINANCE_CAPABILITIES.payeeAdminister);
  if (!auth.ok) return { ok: false, error: "Not authorized to change file retention." };

  const admin = createAdminClient();
  const { error } = await admin
    .from("project_files")
    .update({ retain: params.retain, retain_until: params.retainUntil ?? null })
    .eq("id", params.fileId);
  if (error) {
    console.error("[payables] failed to set project file retain flag", error.message);
    return { ok: false, error: "Failed to update retention." };
  }

  await logActivity({
    actorUserId: params.actorUserId,
    action: "project_file.retain_set",
    entityType: "user",
    entityId: params.actorUserId,
    metadata: { fileId: params.fileId, retain: params.retain, retainUntil: params.retainUntil ?? null },
  });

  return { ok: true };
}

// The purge job itself. Deliberately NOT scheduled by this migration/
// module — no pg_cron or Vercel Cron infrastructure exists yet in this
// project (checked directly against Production before writing this;
// neither pg_cron nor pg_net is installed, and no vercel.json exists)
// — so for this phase it is callable only from an authorized admin
// Server Action. Wiring real unattended scheduling is a deliberate,
// separately-flagged NEXT item rather than silently enabling a new
// Postgres extension or cron config no one asked for. Idempotent:
// re-running only ever touches rows still eligible (lifecycle_state
// != 'purged'), and a missing/already-deleted Storage object is
// treated as a successful no-op, not a failure.
export async function purgeEligibleProjectFiles(params: {
  actorUserId: string;
  gracePeriodDays?: number;
}): Promise<{ ok: true; purgedCount: number; failedCount: number; releasedBytes: number } | { ok: false; error: string }> {
  const auth = await authorizeWithSuperAdminOverride(params.actorUserId, FINANCE_CAPABILITIES.payeeAdminister);
  if (!auth.ok) return { ok: false, error: "Not authorized to run media cleanup." };

  const admin = createAdminClient();
  const gracePeriodDays = params.gracePeriodDays ?? DEFAULT_GRACE_PERIOD_DAYS;
  const now = new Date();

  const { data: candidates, error } = await admin
    .from("project_files")
    .select("id, engagement_id, file_kind, storage_bucket, storage_path, lifecycle_state, retain, retain_until, backup_confirmed_at, size_bytes, engagements(status)")
    .neq("lifecycle_state", "purged")
    .not("backup_confirmed_at", "is", null);
  if (error || !candidates) {
    console.error("[payables] failed to load purge candidates", error?.message);
    return { ok: false, error: "Failed to load candidates." };
  }

  let purgedCount = 0;
  let failedCount = 0;
  let releasedBytes = 0;

  for (const row of candidates) {
    const engagementStatus = (row.engagements as unknown as { status: string } | null)?.status ?? "";
    const eligible = isProjectFilePurgeEligible({
      fileKind: row.file_kind,
      lifecycleState: row.lifecycle_state,
      retain: row.retain,
      retainUntil: row.retain_until,
      backupConfirmedAt: row.backup_confirmed_at,
      engagementStatus,
      gracePeriodDays,
      now,
    });
    if (!eligible) continue;

    try {
      const { error: removeError } = await admin.storage.from(row.storage_bucket).remove([row.storage_path]);
      // A "not found" style error means the object is already gone —
      // treat as success so re-running this job is safe.
      if (removeError && !/not.?found/i.test(removeError.message)) {
        console.error(`[payables] failed to remove storage object for project_files ${row.id}`, removeError.message);
        failedCount += 1;
        continue;
      }

      const { error: updateError } = await admin
        .from("project_files")
        .update({ lifecycle_state: "purged", purged_at: now.toISOString(), purge_reason: "automatic: backup confirmed, grace period elapsed" })
        .eq("id", row.id)
        .eq("lifecycle_state", row.lifecycle_state); // guards against a concurrent purge run double-processing this row
      if (updateError) {
        console.error(`[payables] failed to mark project_files ${row.id} purged`, updateError.message);
        failedCount += 1;
        continue;
      }

      purgedCount += 1;
      releasedBytes += row.size_bytes ?? 0;
    } catch (err) {
      console.error(`[payables] unexpected error purging project_files ${row.id}`, err);
      failedCount += 1;
    }
  }

  await logActivity({
    actorUserId: params.actorUserId,
    action: "project_file.purge_run",
    entityType: "user",
    entityId: params.actorUserId,
    metadata: { purgedCount, failedCount, releasedBytes, gracePeriodDays },
  });

  return { ok: true, purgedCount, failedCount, releasedBytes };
}
