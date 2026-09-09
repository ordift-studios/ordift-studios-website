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
