import { createAdminClient } from "@/lib/supabase/admin";
import { logActivity } from "@/lib/admin/activityLog";
import { authorizeWithSuperAdminOverride, TALENT_CAPABILITIES } from "@/lib/organization/authority";
import { isValidTalentMediaType } from "./talentMediaCatalogue";

const TALENT_MEDIA_BUCKET = "talent-media";

// Ordift Studios — TALENT-SYS-1, Foundation (2026-09-08); Founder/Admin
// Upload + View milestone (2026-09-09). DB-backed media-relationship
// layer over the existing, private talent-media Storage bucket
// (migration 0072 — 25MB/file, image+mp4 only, unchanged by this
// milestone). Direct-to-Storage signed-URL architecture, same proven
// two-step pattern as src/lib/payables/projectFiles.ts's
// requestProjectFileUploadAuthorization()/recordUploadedProjectFile():
// file bytes never pass through this server; this module only ever
// issues short-lived signed URLs and records/reads metadata.

async function requireMediaAdminister(actorUserId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const auth = await authorizeWithSuperAdminOverride(actorUserId, TALENT_CAPABILITIES.mediaAdminister);
  if (!auth.ok) return { ok: false, error: "Not authorized to administer talent media." };
  return { ok: true };
}

// Same filename-sanitization as projectFiles.ts's own local helper
// (not exported there, so duplicated here rather than introducing a
// cross-module dependency for one small pure function).
function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-180);
}

// Step 1 of the direct-upload flow: browser asks Ordift for permission
// before ever touching Storage. Returns a short-lived, single-use
// signed upload URL/token — the browser then PUTs the file bytes
// straight to Supabase Storage, never through this Next.js server, no
// service-role credential ever reaching the browser. Path is prefixed
// with profileId (same convention as projectFiles.ts's
// engagementId-prefixed paths), so recordTalentMediaAsset()'s own
// prefix check (below) can verify the confirmed path actually belongs
// to the profile it claims to.
export async function requestTalentMediaUploadAuthorization(params: {
  profileId: string;
  originalFilename: string;
  actorUserId: string;
}): Promise<{ ok: true; signedUrl: string; token: string; path: string } | { ok: false; error: string }> {
  const auth = await requireMediaAdminister(params.actorUserId);
  if (!auth.ok) return auth;

  const admin = createAdminClient();
  const path = `${params.profileId}/${crypto.randomUUID()}-${sanitizeFilename(params.originalFilename)}`;
  const { data, error } = await admin.storage.from(TALENT_MEDIA_BUCKET).createSignedUploadUrl(path);
  if (error || !data) {
    console.error("[talent] failed to create talent media signed upload url", error?.message);
    return { ok: false, error: "Failed to authorize the upload." };
  }
  return { ok: true, signedUrl: data.signedUrl, token: data.token, path: data.path };
}

// Step 2: called by the browser only after the direct upload to
// Storage has actually succeeded — writes the metadata row. This is
// the one part of the flow that must stay server-authorized even
// though the bytes bypassed the server, so a client can never fabricate
// a record for bytes that were never actually uploaded/authorized.
//
// Storage-path prefix check added in this milestone (2026-09-09) —
// mirrors recordUploadedProjectFile()'s own
// `storagePath.startsWith(...)` guard exactly, which this function
// didn't previously have (it predates any real upload flow existing at
// all). Without it, an authorized caller could otherwise record a
// path under a DIFFERENT profile's prefix than the one being written
// against.
export async function recordTalentMediaAsset(params: {
  profileId: string;
  storagePath: string;
  mediaType: string;
  caption?: string | null;
  actorUserId: string;
}): Promise<{ ok: true; assetId: string } | { ok: false; error: string }> {
  const auth = await requireMediaAdminister(params.actorUserId);
  if (!auth.ok) return auth;

  if (!isValidTalentMediaType(params.mediaType)) {
    return { ok: false, error: `Unsupported media type: "${params.mediaType}".` };
  }
  if (!params.storagePath.startsWith(`${params.profileId}/`)) {
    return { ok: false, error: "Storage path does not match this talent profile." };
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("talent_media_assets")
    .insert({
      profile_id: params.profileId,
      storage_bucket: TALENT_MEDIA_BUCKET,
      storage_path: params.storagePath,
      media_type: params.mediaType,
      caption: params.caption ?? null,
      uploaded_by: params.actorUserId,
    })
    .select("id")
    .single();
  if (error || !data) {
    console.error("[talent] failed to record talent media asset", error?.message);
    return { ok: false, error: "Failed to record the media asset." };
  }

  await logActivity({ actorUserId: params.actorUserId, action: "talent.media.recorded", entityType: "profile", entityId: params.profileId, metadata: { mediaType: params.mediaType } });
  return { ok: true, assetId: data.id };
}

// Private viewing — same pattern as getProjectFileDownloadUrl(): a
// short-lived (5 minute) signed URL generated server-side via the
// admin client, after an explicit authorization check. The bucket
// stays private throughout; nothing here makes any object public, and
// the raw bucket/path is never returned to an unauthorized caller —
// only this one-time, expiring URL is.
const VIEW_URL_TTL_SECONDS = 300;

export async function getTalentMediaDownloadUrl(assetId: string, actorUserId: string): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const auth = await requireMediaAdminister(actorUserId);
  if (!auth.ok) return auth;

  const admin = createAdminClient();
  const { data: asset } = await admin.from("talent_media_assets").select("storage_bucket, storage_path").eq("id", assetId).maybeSingle();
  if (!asset) return { ok: false, error: "Media asset not found." };

  const { data, error } = await admin.storage.from(asset.storage_bucket).createSignedUrl(asset.storage_path, VIEW_URL_TTL_SECONDS);
  if (error || !data) {
    console.error("[talent] failed to create talent media signed view url", error?.message);
    return { ok: false, error: "Failed to generate a viewing link." };
  }
  return { ok: true, url: data.signedUrl };
}

// A "not found" Storage error means the object is already gone —
// treat as success so a retry after a partial prior failure is safe,
// rather than reporting a false failure for something already
// resolved. Same established convention as
// purgeEligibleProjectFiles() (src/lib/payables/projectFiles.ts).
function isStorageObjectAlreadyGone(message: string | undefined): boolean {
  return Boolean(message) && /not.?found/i.test(message as string);
}

// Remove + Replace milestone (2026-09-09). Storage deletion here uses
// the same admin/secret-key client already used for every other
// Storage call in this file — confirmed safe without any new RLS/
// policy change by direct precedent: purgeEligibleProjectFiles()
// already calls `admin.storage.from(bucket).remove([path])` in
// Production today, against project-media's storage.objects policies,
// every one of which is scoped to `to authenticated` — none mention
// service_role at all. The admin/secret-key client bypasses Storage
// RLS the same way it already bypasses table RLS everywhere else in
// this codebase; no migration was needed or made for this milestone.
export async function removeTalentMediaAsset(params: {
  assetId: string;
  profileId: string;
  actorUserId: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const auth = await requireMediaAdminister(params.actorUserId);
  if (!auth.ok) return auth;

  const admin = createAdminClient();
  const { data: asset } = await admin.from("talent_media_assets").select("id, profile_id, storage_bucket, storage_path, media_type").eq("id", params.assetId).maybeSingle();
  if (!asset) return { ok: false, error: "Media asset not found." };
  // Ownership check: the asset must genuinely belong to the profile
  // the caller says it does — never trust the caller's profileId
  // alone to decide what gets deleted.
  if (asset.profile_id !== params.profileId) return { ok: false, error: "This media asset does not belong to the specified talent profile." };
  // Storage-path ownership: defense-in-depth against arbitrary-path
  // deletion, same convention as recordTalentMediaAsset()'s own check.
  if (!asset.storage_path.startsWith(`${params.profileId}/`)) {
    return { ok: false, error: "Storage path does not match this talent profile." };
  }

  // Storage object removed FIRST. If this fails for a real reason (not
  // "already gone"), stop here — the metadata row is left intact, so
  // the asset stays visible/usable rather than silently vanishing while
  // its file still exists, uncontrolled, in Storage.
  const { error: removeError } = await admin.storage.from(asset.storage_bucket).remove([asset.storage_path]);
  if (removeError && !isStorageObjectAlreadyGone(removeError.message)) {
    console.error("[talent] failed to remove talent media storage object", removeError.message);
    return { ok: false, error: "Failed to remove the media file. Please try again." };
  }

  const { error: deleteError } = await admin.from("talent_media_assets").delete().eq("id", params.assetId);
  if (deleteError) {
    console.error("[talent] failed to delete talent media asset record", deleteError.message);
    return { ok: false, error: "The file was removed from storage, but its record could not be deleted. Please contact support." };
  }

  await logActivity({ actorUserId: params.actorUserId, action: "talent.media.removed", entityType: "profile", entityId: params.profileId, metadata: { assetId: params.assetId, mediaType: asset.media_type } });
  return { ok: true };
}

// Replace, per the Founder-specified conservative ordering: the new
// file must already be uploaded and confirmed to exist (the caller
// only reaches this function after a successful direct-to-Storage
// upload of the replacement, using the exact same
// requestTalentMediaUploadAuthorization() as a fresh upload — no
// separate "replace upload" mechanism was invented). This function
// updates the existing record to point at the new file FIRST, and only
// retires the old Storage object AFTER that update has actually
// succeeded — so a failure at any earlier step (validation, the
// upload itself, or this function's own authorization/ownership
// checks) leaves the original media completely untouched.
export async function replaceTalentMediaAsset(params: {
  assetId: string;
  profileId: string;
  newStoragePath: string;
  mediaType: string;
  caption: string | null;
  actorUserId: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const auth = await requireMediaAdminister(params.actorUserId);
  if (!auth.ok) return auth;

  if (!isValidTalentMediaType(params.mediaType)) {
    return { ok: false, error: `Unsupported media type: "${params.mediaType}".` };
  }
  if (!params.newStoragePath.startsWith(`${params.profileId}/`)) {
    return { ok: false, error: "Storage path does not match this talent profile." };
  }

  const admin = createAdminClient();
  const { data: existing } = await admin.from("talent_media_assets").select("id, profile_id, storage_bucket, storage_path").eq("id", params.assetId).maybeSingle();
  if (!existing) return { ok: false, error: "Media asset not found." };
  if (existing.profile_id !== params.profileId) return { ok: false, error: "This media asset does not belong to the specified talent profile." };

  // The one moment the existing record actually changes. Everything
  // before this point (validation, authorization, the new file's own
  // upload) could fail without touching the old media at all; nothing
  // after this point can undo it either — deliberately, since the new
  // file is already real and confirmed, this update is what makes it
  // the profile's media of record.
  const { error: updateError } = await admin
    .from("talent_media_assets")
    .update({
      storage_path: params.newStoragePath,
      media_type: params.mediaType,
      caption: params.caption,
      uploaded_at: new Date().toISOString(),
      uploaded_by: params.actorUserId,
    })
    .eq("id", params.assetId);
  if (updateError) {
    console.error("[talent] failed to update talent media asset record for replace", updateError.message);
    return { ok: false, error: "The new file was uploaded but could not be linked to this media item. Please try again." };
  }

  // Retire the superseded object only now, best-effort: the replace has
  // already genuinely succeeded from the caller's perspective (the
  // profile's media now shows the new file) — a failure here leaves one
  // orphaned Storage object rather than losing or corrupting anything.
  const { error: removeError } = await admin.storage.from(existing.storage_bucket).remove([existing.storage_path]);
  if (removeError && !isStorageObjectAlreadyGone(removeError.message)) {
    console.error("[talent] failed to remove superseded talent media storage object", removeError.message);
  }

  await logActivity({
    actorUserId: params.actorUserId,
    action: "talent.media.replaced",
    entityType: "profile",
    entityId: params.profileId,
    metadata: { assetId: params.assetId, mediaType: params.mediaType },
  });
  return { ok: true };
}
