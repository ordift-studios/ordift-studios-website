"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/portal/roles";
import { canManageCrewSupport } from "@/lib/crewSupport/permissions";
import { disableReadiness, enrolAssignment, setResponsibleManager, updateReadinessSettings } from "@/lib/crewSupport/readiness";
import { clearSuppression, runCheckNow, setAreaLabel, setRemindersMode, updateLateCaps } from "@/lib/crewSupport/readinessReminders";
import { assignFollowUp, manageIssue, postIssueMessage } from "@/lib/crewSupport/readinessIssues";
import { recordScheduleNotice, rescheduleAssignment, setEventTimezone } from "@/lib/crewSupport/reschedule";
import type { IssueAction, NoticeInput } from "@/lib/crewSupport/readinessRules";
import { actionFail, actionOk, runAction, type ActionState } from "@/lib/shared/actionState";

// Management's side of schedule integrity and readiness. Authorisation is enforced in the libs (management =
// Super Admin / executive admin for schedule, enrolment and settings; any Crew Support administrator for
// issues, but never on their own assignment). Only "Run check now" can cause a send, and only when the Reminders mode
// is Live; every other action here sends nothing.

async function authorize() {
  const user = await getCurrentUser();
  return canManageCrewSupport(user) && user ? user : null;
}
const DENIED = "You don't have permission to manage Crew Support requests.";
const str = (f: FormData, k: string) => String(f.get(k) ?? "");
const refresh = (requestId: string) => { revalidatePath(`/admin/crew-support/${requestId}`); revalidatePath("/admin/overview"); };

export async function rescheduleAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await authorize();
  if (!user) return actionFail(DENIED);
  const requestId = str(formData, "requestId");
  return runAction(async () => {
    const count = Number(str(formData, "partyCount")) || 0;
    const notices: NoticeInput[] = [];
    for (let i = 0; i < count; i++) notices.push({ informed: str(formData, `informed_${i}`) === "yes", method: str(formData, `method_${i}`), informedAtLocal: str(formData, `at_${i}`), note: str(formData, `note_${i}`) });
    const r = await rescheduleAssignment({ requestId, user, input: { startDate: str(formData, "startDate"), endDate: str(formData, "endDate"), callTime: str(formData, "callTime"), finishTime: str(formData, "finishTime"), timezone: str(formData, "timezone"), reason: str(formData, "reason"), notices } });
    if (!r.ok) return actionFail(r.error);
    refresh(requestId);
    const outstanding = r.pending > 0 ? ` ${r.pending} ${r.pending === 1 ? "person is" : "people are"} still marked as not yet told — tell them, then record it here.` : "";
    return actionOk(`Rescheduled. Ordift has not sent anyone a notification.${outstanding}${r.warnings.length ? ` Note: ${r.warnings.join(" ")}` : ""}`);
  }, "reschedule assignment");
}

export async function setTimezoneAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await authorize();
  if (!user) return actionFail(DENIED);
  const requestId = str(formData, "requestId");
  return runAction(async () => {
    const r = await setEventTimezone({ requestId, user, timezone: str(formData, "timezone"), reason: str(formData, "reason") });
    if (!r.ok) return actionFail(r.error);
    refresh(requestId);
    return actionOk("Timezone saved. It was recorded in the schedule history.");
  }, "set timezone");
}

export async function recordNoticeAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await authorize();
  if (!user) return actionFail(DENIED);
  const requestId = str(formData, "requestId");
  return runAction(async () => {
    const r = await recordScheduleNotice({ changeId: str(formData, "changeId"), user, partyKind: str(formData, "partyKind") === "client" ? "client" : "professional", partyProfileId: str(formData, "partyProfileId") || null, method: str(formData, "method"), informedAtLocal: str(formData, "at"), note: str(formData, "note") });
    if (!r.ok) return actionFail(r.error);
    refresh(requestId);
    return actionOk("Recorded. This is your own record — Ordift sent no notification.");
  }, "record schedule notice");
}

export async function enrolAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await authorize();
  if (!user) return actionFail(DENIED);
  return runAction(async () => {
    const label = str(formData, "areaLabel").trim();
    if (label && (label.length < 2 || label.length > 80)) return actionFail("Enter a short city/area, 2–80 characters, e.g. “Doha — West Bay”.");
    const r = await enrolAssignment({ engagementId: str(formData, "engagementId"), user });
    if (!r.ok) return actionFail(r.error);
    if (label) {
      const a = await setAreaLabel({ engagementId: str(formData, "engagementId"), user, label });
      if (!a.ok) { refresh(str(formData, "requestId")); return actionFail(`Tracking is on, but the area label wasn't saved: ${a.error}`); }
    }
    refresh(str(formData, "requestId"));
    return actionOk("Readiness tracking is on for this assignment. The professional can now confirm their readiness. Nothing was sent to them now; any automatic reminders follow the Reminders setting.");
  }, "enrol assignment");
}

export async function disableAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await authorize();
  if (!user) return actionFail(DENIED);
  return runAction(async () => {
    const r = await disableReadiness({ engagementId: str(formData, "engagementId"), user, reason: str(formData, "reason") });
    if (!r.ok) return actionFail(r.error);
    refresh(str(formData, "requestId"));
    return actionOk("Readiness tracking stopped. History is kept.");
  }, "disable readiness");
}

export async function setManagerAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await authorize();
  if (!user) return actionFail(DENIED);
  return runAction(async () => {
    const r = await setResponsibleManager({ engagementId: str(formData, "engagementId"), user, managerId: str(formData, "managerId") || null });
    if (!r.ok) return actionFail(r.error);
    refresh(str(formData, "requestId"));
    return actionOk("Responsible manager saved.");
  }, "set responsible manager");
}

const ISSUE_ACTIONS = ["acknowledge", "start_action", "request_confirmation", "resolve", "reopen"] as const;
export async function manageIssueAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await authorize();
  if (!user) return actionFail(DENIED);
  const action = str(formData, "action") as IssueAction;
  if (!(ISSUE_ACTIONS as readonly string[]).includes(action)) return actionFail("Choose an action.");
  return runAction(async () => {
    const r = await manageIssue({ issueId: str(formData, "issueId"), user, action, note: str(formData, "note"), sharedMessage: str(formData, "sharedMessage") });
    if (!r.ok) return actionFail(r.error);
    refresh(str(formData, "requestId"));
    return actionOk("Saved.");
  }, "manage readiness issue");
}

export async function postIssueMessageAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await authorize();
  if (!user) return actionFail(DENIED);
  return runAction(async () => {
    const r = await postIssueMessage({ issueId: str(formData, "issueId"), user, visibility: str(formData, "visibility") === "internal" ? "internal" : "shared", body: str(formData, "body") });
    if (!r.ok) return actionFail(r.error);
    refresh(str(formData, "requestId"));
    return actionOk(str(formData, "visibility") === "internal" ? "Internal note saved — the professional can't see it." : "Message sent to the professional.");
  }, "post readiness issue message");
}

export async function assignFollowUpAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await authorize();
  if (!user) return actionFail(DENIED);
  return runAction(async () => {
    const r = await assignFollowUp({ issueId: str(formData, "issueId"), user, assignedTo: str(formData, "assignedTo") || null, followUpAction: str(formData, "followUpAction") });
    if (!r.ok) return actionFail(r.error);
    refresh(str(formData, "requestId"));
    return actionOk("Follow-up saved (internal).");
  }, "assign readiness follow-up");
}

export async function updateSettingsAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await authorize();
  if (!user) return actionFail(DENIED);
  return runAction(async () => {
    // Automatic enrolment is not available in this version (manual enrolment only), so it is never set here.
    const r = await updateReadinessSettings({ user, values: { autoEnrolFrom: null, firstReminderHours: Number(str(formData, "firstReminderHours")), readinessCheckHours: Number(str(formData, "readinessCheckHours")), noResponseFlagHours: Number(str(formData, "noResponseFlagHours")), skipCheckIfReady: str(formData, "skipCheckIfReady") === "on" } });
    if (!r.ok) return actionFail(r.error);
    revalidatePath("/admin/crew-support/readiness-settings");
    return actionOk("Settings saved. Nothing is sent automatically in this version.");
  }, "update readiness settings");
}

export async function setAreaLabelAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await authorize();
  if (!user) return actionFail(DENIED);
  return runAction(async () => {
    const r = await setAreaLabel({ engagementId: str(formData, "engagementId"), user, label: str(formData, "areaLabel") });
    if (!r.ok) return actionFail(r.error);
    refresh(str(formData, "requestId"));
    return actionOk("Area label saved. It is the only location detail that appears in reminder emails.");
  }, "set readiness area label");
}

export async function setRemindersModeAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await authorize();
  if (!user) return actionFail(DENIED);
  return runAction(async () => {
    const r = await setRemindersMode({ user, to: str(formData, "mode"), reason: str(formData, "reason") });
    if (!r.ok) return actionFail(r.error);
    revalidatePath("/admin/crew-support/readiness-settings");
    revalidatePath("/admin/overview");
    return actionOk(r.mode === "off" ? "Reminders are off." : r.mode === "dry_run" ? "Dry run on: the system shows what it would send and sends nothing." : r.mode === "test" ? "Test mode on: the whole process runs but nothing leaves the system." : "Reminders are LIVE for enrolled assignments.");
  }, "set reminders mode");
}

export async function updateLateCapsAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await authorize();
  if (!user) return actionFail(DENIED);
  return runAction(async () => {
    const r = await updateLateCaps({ user, first: Number(str(formData, "first")), check: Number(str(formData, "check")), escalation: Number(str(formData, "escalation")) });
    if (!r.ok) return actionFail(r.error);
    revalidatePath("/admin/crew-support/readiness-settings");
    return actionOk("Late-run limits saved.");
  }, "update reminder late caps");
}

export async function runCheckNowAction(): Promise<ActionState> {
  const user = await authorize();
  if (!user) return actionFail(DENIED);
  return runAction(async () => {
    const r = await runCheckNow({ user });
    if (!r.ok) return actionFail(r.error);
    revalidatePath("/admin/crew-support/readiness-settings");
    revalidatePath("/admin/overview");
    const s = r.summary;
    if (s.status === "skipped_locked") return actionOk("Another check is already running — try again in a minute.");
    if (s.status === "failed") return actionFail("The check failed. See the scheduler status below.");
    if (s.mode === "off") return actionOk("Reminders are off, so nothing was computed.");
    if (s.mode === "dry_run") return actionOk(`Dry run: examined ${s.examined} assignment(s); nothing was sent or recorded. See the preview below.`);
    return actionOk(`${s.mode === "test" ? "Test run" : "Run"} finished: examined ${s.examined}, ${s.mode === "test" ? "recorded (not sent)" : "sent"} ${s.sent}, skipped ${s.skipped}${s.lateSkipped ? ` (${s.lateSkipped} too late)` : ""}, failed ${s.failed}.`);
  }, "run readiness check");
}

export async function clearSuppressionAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await authorize();
  if (!user) return actionFail(DENIED);
  return runAction(async () => {
    const r = await clearSuppression({ user, profileId: str(formData, "profileId"), reason: str(formData, "reason") });
    if (!r.ok) return actionFail(r.error);
    revalidatePath("/admin/crew-support/readiness-settings");
    return actionOk("Cleared. Reminders can go to this person again.");
  }, "clear blocked address");
}
