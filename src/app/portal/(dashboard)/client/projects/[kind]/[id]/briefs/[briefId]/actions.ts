"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/portal/roles";
import { createSubmissionUploadUrl, submitWork } from "@/lib/workshops/briefsAndSubmissions";

export type ActionState = { ok: true } | { ok: false; error: string } | null;

export async function requestSubmissionUploadAuthorizationAction(params: {
  briefId: string;
  originalFilename: string;
}): Promise<{ ok: true; path: string; token: string } | { ok: false; error: string }> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Not authenticated." };
  return createSubmissionUploadUrl(params.briefId, params.originalFilename, user.id);
}

// submitWork() independently re-verifies the caller holds a real,
// non-cancelled registration for the brief's workshop before writing
// anything — the actorUserId here is always the real session id, never
// a value read from the submitted form.
export async function submitWorkAction(params: {
  briefId: string;
  note: string | null;
  storagePaths: string[];
  kind: string;
  projectId: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Not authenticated." };
  const result = await submitWork({ briefId: params.briefId, note: params.note, storagePaths: params.storagePaths, actorUserId: user.id });
  if (!result.ok) return result;
  revalidatePath(`/portal/client/projects/${params.kind}/${params.projectId}/briefs/${params.briefId}`);
  return { ok: true };
}
