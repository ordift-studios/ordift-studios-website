"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/portal/roles";
import { getServiceFamilyForEngagement, submitJobReport } from "@/lib/crewSupport/jobReports";
import { questionsFor } from "@/lib/crewSupport/jobReportRules";
import { removeOwnPrivateFile, submitFileForRelease, withdrawFileFromReview } from "@/lib/crewSupport/fileReleaseFlow";
import { createAdminClient } from "@/lib/supabase/admin";
import { actionFail, actionOk, runAction, type ActionState } from "@/lib/shared/actionState";

// The assigned professional's own actions on their assignment: the job report and submitting files for
// client release. Authorisation lives in the lib (it checks the caller is the accepted assignee); these
// actions only read the form and report the result.

function str(f: FormData, k: string): string {
  return String(f.get(k) ?? "");
}
function refresh(engagementId: string) {
  revalidatePath(`/portal/collaborator/engagement/${engagementId}`);
}

export async function submitJobReportAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await getCurrentUser();
  if (!user) return actionFail("You are not signed in.");
  const engagementId = str(formData, "engagementId");
  return runAction(async () => {
    const family = await getServiceFamilyForEngagement(engagementId);
    const answers: Record<string, string> = {};
    for (const q of questionsFor(family)) answers[q.id] = str(formData, `q_${q.id}`);
    const smooth = str(formData, "wentSmoothly");
    const result = await submitJobReport({
      engagementId,
      actorUserId: user.id,
      input: {
        serviceFamily: family,
        actualServiceDate: str(formData, "actualServiceDate"),
        actualStartTime: str(formData, "actualStartTime"),
        actualEndTime: str(formData, "actualEndTime"),
        completionStatus: str(formData, "completionStatus"),
        wentSmoothly: smooth === "yes" ? true : smooth === "no" ? false : null,
        answers,
        incidents: str(formData, "incidents"),
        clientRequests: str(formData, "clientRequests"),
        additionalServices: str(formData, "additionalServices"),
        outstandingWork: str(formData, "outstandingWork"),
        remarks: str(formData, "remarks"),
        correctionReason: str(formData, "correctionReason"),
      },
    });
    if (!result.ok) return actionFail(result.error);
    refresh(engagementId);
    return actionOk(result.isCorrection ? `Correction saved as version ${result.version}. The earlier version is kept.` : "Job report submitted. Thank you.");
  }, "job report");
}

export async function submitFileForReleaseAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await getCurrentUser();
  if (!user) return actionFail("You are not signed in.");
  const engagementId = str(formData, "engagementId");
  return runAction(async () => {
    const result = await submitFileForRelease({ fileId: str(formData, "fileId"), actorUserId: user.id, category: str(formData, "category"), title: str(formData, "title"), description: str(formData, "description") });
    if (!result.ok) return actionFail(result.error);
    refresh(engagementId);
    return actionOk("Submitted for review. It stays private until management approves and releases it.");
  }, "submit file for release");
}

// Submits every still-private file that was uploaded WITH a category, using the file name as its title —
// so a set of thank-you photographs can be sent for review in one step.
export async function submitAllPrivateFilesAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await getCurrentUser();
  if (!user) return actionFail("You are not signed in.");
  const engagementId = str(formData, "engagementId");
  return runAction(async () => {
    const { data } = await createAdminClient().from("project_files").select("id, original_filename, release_category").eq("engagement_id", engagementId).eq("release_status", "private").not("release_category", "is", null).is("purged_at", null);
    const rows = data ?? [];
    if (rows.length === 0) return actionFail("There are no private files with a category to submit.");
    let ok = 0;
    const problems: string[] = [];
    for (const f of rows) {
      const title = (f.original_filename as string).replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim() || "Photo";
      const r = await submitFileForRelease({ fileId: f.id as string, actorUserId: user.id, category: f.release_category as string, title: title.length >= 3 ? title : `${title} photo`, description: "" });
      if (r.ok) ok++;
      else problems.push(r.error);
    }
    refresh(engagementId);
    if (ok === 0) return actionFail(problems[0] ?? "Nothing could be submitted.");
    return actionOk(`${ok} file${ok === 1 ? "" : "s"} submitted for review.${problems.length ? ` ${problems.length} could not be submitted.` : ""}`);
  }, "submit all private files");
}

export async function withdrawFileFromReviewAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await getCurrentUser();
  if (!user) return actionFail("You are not signed in.");
  const engagementId = str(formData, "engagementId");
  return runAction(async () => {
    const result = await withdrawFileFromReview({ fileId: str(formData, "fileId"), actorUserId: user.id });
    if (!result.ok) return actionFail(result.error);
    refresh(engagementId);
    return actionOk("Withdrawn — the file is private again.");
  }, "withdraw file from review");
}

export async function removeOwnPrivateFileAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await getCurrentUser();
  if (!user) return actionFail("You are not signed in.");
  const engagementId = str(formData, "engagementId");
  return runAction(async () => {
    const result = await removeOwnPrivateFile({ fileId: str(formData, "fileId"), actorUserId: user.id });
    if (!result.ok) return actionFail(result.error);
    refresh(engagementId);
    return actionOk("File removed. Nothing was sent to anyone.");
  }, "remove private file");
}
