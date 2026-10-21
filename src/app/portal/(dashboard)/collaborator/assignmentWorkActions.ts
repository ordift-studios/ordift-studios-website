"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/portal/roles";
import { getServiceFamilyForEngagement, submitJobReport } from "@/lib/crewSupport/jobReports";
import { questionsFor } from "@/lib/crewSupport/jobReportRules";
import { removeOwnPrivateFile, submitFileForRelease, submitPrivateFilesForRelease, withdrawFileFromReview } from "@/lib/crewSupport/fileReleaseFlow";
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
// so a set of photographs can be sent for review in one step. One check and one read for the whole set, then
// bounded-parallel updates (the original one-file-at-a-time loop took about 1.3 s per file, so a full gallery left
// the button on "Submitting…" for half a minute). Safe to repeat: files already in review are counted, never
// touched, so a retry after a refresh cannot duplicate anything and still reports the true state.
export async function submitAllPrivateFilesAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await getCurrentUser();
  if (!user) return actionFail("You are not signed in.");
  const engagementId = str(formData, "engagementId");
  return runAction(async () => {
    const r = await submitPrivateFilesForRelease({ engagementId, actorUserId: user.id });
    if (!r.ok) return actionFail(r.error);
    refresh(engagementId);
    const failed = r.outcomes.filter((o) => !o.ok);
    if (r.outcomes.length === 0) {
      return r.alreadyInReview > 0
        ? actionOk(`Nothing left to submit — ${r.alreadyInReview} file${r.alreadyInReview === 1 ? " is" : "s are"} already submitted for review, approved or released.`)
        : actionFail("There are no private files with a category to submit.");
    }
    if (r.submitted === 0) return actionFail(`None of the ${r.outcomes.length} files could be submitted. ${failed[0]?.error ?? ""}`.trim());
    const tail = failed.length ? ` ${failed.length} could not be submitted: ${failed.slice(0, 3).map((f) => `${f.label} (${f.error})`).join("; ")}${failed.length > 3 ? "…" : ""}.` : "";
    return actionOk(`${r.submitted} of ${r.outcomes.length} file${r.outcomes.length === 1 ? "" : "s"} submitted for review.${tail} They stay private until management approves and releases them.`);
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
