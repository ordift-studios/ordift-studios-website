import { createAdminClient } from "@/lib/supabase/admin";
import { logActivity } from "@/lib/admin/activityLog";
import { authorizeWithSuperAdminOverride, TALENT_CAPABILITIES } from "@/lib/organization/authority";
import { isValidTalentMediaType } from "./talentMediaCatalogue";

// Ordift Studios — TALENT-SYS-1, Foundation (2026-09-08). DB-backed
// media-relationship layer. This module records a REFERENCE to an
// object already present in the talent-media Storage bucket — it does
// not upload, generate, or move any file itself; no real upload UI
// exists yet in this phase.

async function requireMediaAdminister(actorUserId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const auth = await authorizeWithSuperAdminOverride(actorUserId, TALENT_CAPABILITIES.mediaAdminister);
  if (!auth.ok) return { ok: false, error: "Not authorized to administer talent media." };
  return { ok: true };
}

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

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("talent_media_assets")
    .insert({
      profile_id: params.profileId,
      storage_bucket: "talent-media",
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
