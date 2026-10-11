"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/portal/roles";
import { submitReadiness } from "@/lib/crewSupport/readiness";
import { professionalIssueAction } from "@/lib/crewSupport/readinessIssues";
import { readinessChecklistFor, CONCERN_AREAS } from "@/lib/crewSupport/readinessRules";
import { getServiceFamilyForEngagement } from "@/lib/crewSupport/jobReports";
import { actionFail, actionOk, runAction, type ActionState } from "@/lib/shared/actionState";

// The assigned professional's own readiness actions. Authorisation lives in the lib (accepted assignee,
// enrolled assignment, before the start). Nothing here sends any notification.

const str = (f: FormData, k: string) => String(f.get(k) ?? "");
const refresh = (engagementId: string) => revalidatePath(`/portal/collaborator/engagement/${engagementId}`);

export async function submitReadinessAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await getCurrentUser();
  if (!user) return actionFail("You are not signed in.");
  const engagementId = str(formData, "engagementId");
  return runAction(async () => {
    const family = await getServiceFamilyForEngagement(engagementId);
    const checks: Record<string, string> = {};
    for (const q of readinessChecklistFor(family)) checks[q.id] = str(formData, `c_${q.id}`);
    const concerns: Record<string, string> = {};
    for (const a of CONCERN_AREAS) concerns[a.id] = str(formData, `n_${a.id}`);
    const r = await submitReadiness({ engagementId, userId: user.id, input: { status: str(formData, "status"), checks, concerns, remarks: str(formData, "remarks") } });
    if (!r.ok) return actionFail(r.error);
    refresh(engagementId);
    return actionOk(r.issueId ? "Thank you — your answer is saved and management can see it." : "Thank you — your readiness is saved.");
  }, "submit readiness");
}

export async function readinessIssueReplyAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await getCurrentUser();
  if (!user) return actionFail("You are not signed in.");
  const engagementId = str(formData, "engagementId");
  return runAction(async () => {
    const r = await professionalIssueAction({ issueId: str(formData, "issueId"), userId: user.id, action: "reply", body: str(formData, "body") });
    if (!r.ok) return actionFail(r.error);
    refresh(engagementId);
    return actionOk("Reply sent.");
  }, "readiness issue reply");
}

export async function readinessIssueReportResolvedAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await getCurrentUser();
  if (!user) return actionFail("You are not signed in.");
  const engagementId = str(formData, "engagementId");
  return runAction(async () => {
    const r = await professionalIssueAction({ issueId: str(formData, "issueId"), userId: user.id, action: "report_resolved", body: str(formData, "body") });
    if (!r.ok) return actionFail(r.error);
    refresh(engagementId);
    return actionOk("Thanks — management will verify and close it.");
  }, "readiness issue report resolved");
}
