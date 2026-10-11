"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/portal/roles";
import { canManageCrewSupport } from "@/lib/crewSupport/permissions";
import { releaseApprovedFiles, reviewFileForRelease } from "@/lib/crewSupport/fileReleaseFlow";
import { getProjectFileDownloadUrl } from "@/lib/payables/projectFiles";
import { actionFail, actionOk, runAction, type ActionState } from "@/lib/shared/actionState";

// Management's side of releasing an assignment's files to the client. The lib enforces that only authorised
// management (Super Admin / executive admin) can approve, request changes or release.

async function authorize() {
  const user = await getCurrentUser();
  return canManageCrewSupport(user) && user ? user : null;
}
const DENIED = "You don't have permission to manage Crew Support requests.";
function refresh(requestId: string) {
  revalidatePath(`/admin/crew-support/${requestId}`);
}
function str(f: FormData, k: string): string {
  return String(f.get(k) ?? "");
}

export async function reviewFileAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await authorize();
  if (!user) return actionFail(DENIED);
  const action = str(formData, "decision");
  if (action !== "approve" && action !== "request_changes" && action !== "reject") return actionFail("Choose approve, request changes or decline.");
  return runAction(async () => {
    const r = await reviewFileForRelease({ fileId: str(formData, "fileId"), user, action, note: str(formData, "note") });
    if (!r.ok) return actionFail(r.error);
    refresh(str(formData, "requestId"));
    return actionOk(action === "approve" ? "Approved. It is still private until you release it." : action === "request_changes" ? "Changes requested — the professional has been told." : "Declined.");
  }, "review file for release");
}

export async function releaseFilesAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await authorize();
  if (!user) return actionFail(DENIED);
  const fileIds = formData.getAll("fileId").map(String).filter(Boolean);
  return runAction(async () => {
    const r = await releaseApprovedFiles({ fileIds, user, notifyClient: str(formData, "notifyClient") === "on" });
    if (!r.ok) return actionFail(r.error);
    refresh(str(formData, "requestId"));
    if (r.released === 0) return actionFail(r.failed[0] ?? (r.alreadyReleased ? "Those files were already released." : "Nothing was released."));
    const parts = [`Released ${r.released} file${r.released === 1 ? "" : "s"} to the client and posted a project update.`, r.client.reason];
    if (r.failed.length) parts.push(`Not released: ${r.failed.join("; ")}.`);
    return actionOk(parts.join(" "));
  }, "release files");
}

// Opens a private assignment file for review. Same authorisation as the Payables media page (Super Admin or
// payee-administration), short-lived signed link.
export async function reviewFileDownloadUrlAction(fileId: string): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const user = await authorize();
  if (!user) return { ok: false, error: DENIED };
  return getProjectFileDownloadUrl(fileId, user.id);
}
