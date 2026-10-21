"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/portal/roles";
import { canManageCrewSupport } from "@/lib/crewSupport/permissions";
import { notifyClientOfReleasedFiles, releaseApprovedFiles, reviewFileForRelease, reviewFilesForRelease } from "@/lib/crewSupport/fileReleaseFlow";
import { decisionSummary, type FileOutcome, type ReviewDecision } from "@/lib/crewSupport/fileReview";
import { getProjectFileDownloadUrl, getProjectFilePreviewUrls } from "@/lib/payables/projectFiles";
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

// ---- gallery (grid + viewer) support

export type PreviewUrls = { ok: true; urls: Record<string, { url: string } | { error: string }> } | { ok: false; error: string };

// Short-lived signed links for the gallery. Any signed-in user may ASK; the library only signs files the caller is
// allowed to see (the assigned professional for their own engagement, or payee-administration / Super Admin).
export async function previewUrlsAction(fileIds: string[]): Promise<PreviewUrls> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "You are not signed in." };
  return getProjectFilePreviewUrls(fileIds.map(String).slice(0, 60), user.id);
}

export type ReviewBatchResult = { ok: boolean; message: string; outcomes: FileOutcome[] };

// One decision applied to the files chosen in the gallery. Every file gets its own outcome (and its own audit entry);
// separation of duties is enforced per file by the library and by the database, exactly as for a single decision.
export async function reviewFilesAction(input: { requestId: string; engagementId?: string; fileIds: string[]; decision: ReviewDecision; note: string }): Promise<ReviewBatchResult> {
  const user = await authorize();
  if (!user) return { ok: false, message: DENIED, outcomes: [] };
  if (input.decision !== "approve" && input.decision !== "request_changes" && input.decision !== "reject") return { ok: false, message: "Choose approve, return for rework or decline.", outcomes: [] };
  try {
    const r = await reviewFilesForRelease({ fileIds: input.fileIds.map(String), user, action: input.decision, note: input.note ?? "" });
    if (!r.ok) return { ok: false, message: r.error, outcomes: [] };
    if (input.requestId) refresh(input.requestId);
    if (input.engagementId) revalidatePath(`/admin/payables/engagements/${input.engagementId}/media`);
    return { ...decisionSummary(input.decision, r.outcomes), outcomes: r.outcomes };
  } catch (error) {
    console.error("[action] bulk review failed", error);
    return { ok: false, message: "Something went wrong. Some files may have been processed — refresh to see their current status.", outcomes: [] };
  }
}

// Emails the client about files that were already released (the release and the email are separate outcomes).
// Each file is emailed about at most once.
export async function notifyReleasedFilesAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await authorize();
  if (!user) return actionFail(DENIED);
  const fileIds = formData.getAll("fileId").map(String).filter(Boolean);
  return runAction(async () => {
    const r = await notifyClientOfReleasedFiles({ fileIds, user });
    if (!r.ok) return actionFail(r.error);
    refresh(str(formData, "requestId"));
    return actionOk(r.reason);
  }, "email client about released files");
}
