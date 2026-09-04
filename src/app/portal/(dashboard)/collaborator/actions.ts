"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser, hasRole } from "@/lib/portal/roles";
import { isProjectKind } from "@/lib/portal/collaboratorData";
import {
  requestProjectFileUploadAuthorization,
  recordUploadedProjectFile,
  listMyProjectFiles,
  getProjectFileDownloadUrl,
} from "@/lib/payables/projectFiles";

// Insert-only, via the session client (not the admin client) — RLS
// policy "project_updates: contractor insert assigned own" (migration
// 0009) is the actual authorization here: it requires
// author_user_id = auth.uid() AND an active project_assignments row
// for this exact project, so there is nothing left for this action to
// check beyond basic input shape.
export async function postProjectUpdateAction(formData: FormData): Promise<{ error?: string }> {
  const user = await getCurrentUser();
  if (!user || !hasRole(user, "contractor")) {
    return { error: "Not authorized." };
  }

  const kind = String(formData.get("kind") ?? "");
  const id = String(formData.get("id") ?? "");
  const note = String(formData.get("note") ?? "").trim();
  const linkUrl = String(formData.get("linkUrl") ?? "").trim();
  if (!isProjectKind(kind) || !id || !note) {
    return { error: "Enter an update before posting." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("project_updates").insert({
    entity_type: kind === "enquiry" ? "enquiry" : "workshop_registration",
    entity_id: id,
    author_user_id: user.id,
    note,
    link_url: linkUrl || null,
  });

  if (error) {
    console.error("[portal collaborator] failed to post update", error.message);
    return { error: "Couldn't post — you may no longer be assigned to this project." };
  }

  revalidatePath(`/portal/collaborator/${kind}/${id}`);
  return {};
}

// Phase H.1/H.2 (2026-09-04) — engagement-linked counterpart to
// postProjectUpdateAction above, using the widened entity_type
// ('engagement') and the new has_engagement_access()-based RLS
// policies from migration 0051. Not gated by hasRole("contractor")
// here — engagement ownership (payee_profile_id = auth.uid(), checked
// by RLS) is the real boundary, and a true-vendor or model-relationship
// payee can equally own an engagement.
export async function postEngagementUpdateAction(formData: FormData): Promise<{ error?: string }> {
  const user = await getCurrentUser();
  if (!user) return { error: "Not authorized." };

  const engagementId = String(formData.get("engagementId") ?? "");
  const note = String(formData.get("note") ?? "").trim();
  const linkUrl = String(formData.get("linkUrl") ?? "").trim();
  if (!engagementId || !note) return { error: "Enter an update before posting." };

  const supabase = await createClient();
  const { error } = await supabase.from("project_updates").insert({
    entity_type: "engagement",
    entity_id: engagementId,
    author_user_id: user.id,
    note,
    link_url: linkUrl || null,
  });
  if (error) {
    console.error("[portal collaborator] failed to post engagement update", error.message);
    return { error: "Couldn't post — you may no longer be assigned to this engagement." };
  }

  revalidatePath(`/portal/collaborator/engagement/${engagementId}`);
  return {};
}

// Direct-to-storage upload flow (Section 11/23) — steps 1 and 2 are
// two separate authorized calls from the client component; the actual
// file bytes travel straight from the browser to Supabase Storage in
// between, never through this server action or any Next.js route.
export async function requestFileUploadAuthorizationAction(params: {
  engagementId: string;
  fileKind: string;
  originalFilename: string;
}): Promise<{ ok: true; signedUrl: string; token: string; path: string } | { ok: false; error: string }> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Not signed in." };
  return requestProjectFileUploadAuthorization({ ...params, actorUserId: user.id });
}

export async function recordUploadedFileAction(params: {
  engagementId: string;
  fileKind: string;
  storagePath: string;
  originalFilename: string;
  mimeType: string | null;
  sizeBytes: number | null;
  supersedesFileId?: string | null;
}): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Not signed in." };
  const result = await recordUploadedProjectFile({ ...params, actorUserId: user.id });
  if (result.ok) revalidatePath(`/portal/collaborator/engagement/${params.engagementId}`);
  return result;
}

export async function listMyEngagementFilesAction(engagementId: string) {
  const user = await getCurrentUser();
  if (!user) return { ok: false as const, error: "Not signed in." };
  return listMyProjectFiles(engagementId, user.id);
}

export async function getMyFileDownloadUrlAction(fileId: string): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Not signed in." };
  return getProjectFileDownloadUrl(fileId, user.id);
}
