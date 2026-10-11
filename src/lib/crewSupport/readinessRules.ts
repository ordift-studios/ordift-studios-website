import type { ReportQuestion } from "./jobReportRules";
import { zonedToUtcMs, isValidTimeZone } from "./schedule";

// Pre-assignment readiness: statuses, questionnaires, validation, the issue lifecycle, eligibility and the
// 12-hour unanswered flag. Pure. B1 sends no notifications; nothing here talks to email.

export const READINESS_STATUSES = ["ready", "need_assistance", "not_ready"] as const;
export type ReadinessStatus = (typeof READINESS_STATUSES)[number];
export const READINESS_STATUS_LABELS: Record<ReadinessStatus, string> = {
  ready: "Ready — everything is prepared",
  need_assistance: "Need assistance — some arrangements or resources are outstanding",
  not_ready: "Not ready — unable to confirm readiness for this assignment",
};
export const READINESS_SHORT_LABELS: Record<ReadinessStatus, string> = { ready: "Ready", need_assistance: "Need assistance", not_ready: "Not ready" };

// What the assignment-level readiness looks like to anyone reading it.
export type ReadinessState = "not_confirmed" | "ready" | "need_assistance" | "not_ready" | "stale";
export const READINESS_STATE_LABELS: Record<ReadinessState, string> = {
  not_confirmed: "Not confirmed",
  ready: "Ready",
  need_assistance: "Need assistance",
  not_ready: "Not ready",
  stale: "Schedule changed — please re-confirm",
};

export const CONCERN_AREAS: { id: string; label: string }[] = [
  { id: "equipment", label: "Equipment or materials required" },
  { id: "transport", label: "Transport or logistics assistance" },
  { id: "access", label: "Location access or permit requirements" },
  { id: "schedule", label: "Schedule or arrival-time concerns" },
  { id: "client_info", label: "Missing client information" },
  { id: "crew_support", label: "Additional crew or technical support" },
  { id: "other", label: "Other" },
];

const YES_NO = [{ value: "yes", label: "Yes" }, { value: "no", label: "No" }];
const YN = (id: string, label: string): ReportQuestion => ({ id, label, kind: "yes_no" });

const ON_SITE: ReportQuestion[] = [
  YN("equipmentChecked", "Equipment checked and working?"),
  YN("mediaPowerReady", "Batteries, memory cards or media ready?"),
  YN("transportArranged", "Transport arranged and the call time reachable?"),
  YN("locationAccess", "Location access confirmed?"),
  YN("briefConfirmed", "Client brief and on-site contact confirmed?"),
  YN("supportNeeded", "Do you need a second shooter, assistant or technical support?"),
];
const STUDIO: ReportQuestion[] = [
  YN("briefReceived", "Brief and source assets received?"),
  YN("toolsReady", "Software, licences and files ready?"),
  YN("deadlineRealistic", "Is the deadline realistic?"),
  YN("approvalRoute", "Is the approval route clear?"),
];
const EVENT_CREW: ReportQuestion[] = [
  YN("briefingReceived", "Briefing received?"),
  YN("dressReady", "Uniform or dress requirements met?"),
  YN("accessPass", "Access or pass arrangements confirmed?"),
  YN("transportArranged", "Transport arranged?"),
];
const GENERIC: ReportQuestion[] = [YN("detailsClear", "Are the assignment details clear?"), YN("resourcesReady", "Do you have what you need?"), YN("transportArranged", "Is your travel arranged?")];

export function readinessChecklistFor(serviceFamily: string | null | undefined): ReportQuestion[] {
  switch (serviceFamily) {
    case "photography":
    case "videography":
    case "production":
      return ON_SITE;
    case "graphic-design":
    case "content-creation":
    case "branding":
      return STUDIO;
    case "event-crew":
    case "events":
      return EVENT_CREW;
    default:
      return GENERIC;
  }
}

export type ReadinessInput = { status: string; checks: Record<string, string>; concerns: Record<string, string>; remarks: string };
export type ValidReadiness = { status: ReadinessStatus; checks: Record<string, string>; concerns: Record<string, string>; remarks: string };
export const MAX_CONCERN = 500;
export const MAX_REMARKS = 2000;

export function validateReadinessResponse(input: ReadinessInput, serviceFamily: string | null): { ok: true; value: ValidReadiness } | { ok: false; error: string } {
  if (!(READINESS_STATUSES as readonly string[]).includes(input.status)) return { ok: false, error: "Choose Ready, Need assistance or Not ready." };
  const status = input.status as ReadinessStatus;
  const allowed = new Map(readinessChecklistFor(serviceFamily).map((q) => [q.id, q]));
  const checks: Record<string, string> = {};
  for (const [id, v] of Object.entries(input.checks)) {
    if (!allowed.has(id)) return { ok: false, error: "That answer contains an unrecognised question." };
    if (v === "") continue;
    if (!YES_NO.some((o) => o.value === v)) return { ok: false, error: "Answer each checklist question Yes or No." };
    checks[id] = v;
  }
  const areas = new Set(CONCERN_AREAS.map((c) => c.id));
  const concerns: Record<string, string> = {};
  for (const [id, v] of Object.entries(input.concerns)) {
    if (!areas.has(id)) return { ok: false, error: "That answer contains an unrecognised concern." };
    const t = v.trim();
    if (!t) continue;
    if (t.length > MAX_CONCERN) return { ok: false, error: `Each concern must be ${MAX_CONCERN} characters or fewer.` };
    concerns[id] = t;
  }
  const remarks = input.remarks.trim();
  if (remarks.length > MAX_REMARKS) return { ok: false, error: `Remarks must be ${MAX_REMARKS} characters or fewer.` };
  if (status !== "ready" && Object.keys(concerns).length === 0 && remarks.length < 5) {
    return { ok: false, error: "Tell us what is outstanding — fill in at least one concern, or explain in the remarks." };
  }
  return { ok: true, value: { status, checks, concerns, remarks } };
}

// ---- state shown for an assignment
export function readinessState(input: { latest: { status: string; scheduleVersion: number } | null; currentScheduleVersion: number }): ReadinessState {
  const l = input.latest;
  if (!l) return "not_confirmed";
  if (l.scheduleVersion !== input.currentScheduleVersion) return "stale";
  return l.status === "ready" || l.status === "need_assistance" || l.status === "not_ready" ? l.status : "not_confirmed";
}

// The 12-hour flag: still unanswered (never answered, or the schedule changed since) as the start approaches.
// Display-only in B1 — nothing is sent.
export function noResponseFlag(input: { state: ReadinessState; nowMs: number; startMs: number | null; flagHours: number }): boolean {
  if (input.startMs == null) return false;
  if (input.state !== "not_confirmed" && input.state !== "stale") return false;
  const hoursLeft = (input.startMs - input.nowMs) / 3_600_000;
  return hoursLeft > 0 && hoursLeft <= input.flagHours;
}

// ---- who may be enrolled
export type EnrolContext = {
  isTest: boolean;
  requestStatus: string;
  slotStatus: string;
  slotAccepted: boolean;
  engagementStatus: string;
  alreadyEnrolled: boolean;
  startMs: number | null;
  nowMs: number;
};
const ENROLLABLE_REQUEST_STATUSES = ["confirmed", "in_production"];
const TERMINAL_ENGAGEMENT = ["completed", "cancelled"];

export function enrolmentBlocker(c: EnrolContext): string | null {
  if (c.alreadyEnrolled) return "This assignment is already enrolled.";
  if (c.isTest) return "QA/test assignments can't be enrolled.";
  if (c.slotStatus !== "assigned" || !c.slotAccepted) return "Only an accepted assignment can be enrolled.";
  if (!ENROLLABLE_REQUEST_STATUSES.includes(c.requestStatus)) return "Only a confirmed assignment that is not cancelled, declined or completed can be enrolled.";
  if (TERMINAL_ENGAGEMENT.includes(c.engagementStatus)) return "This assignment's engagement is already finished or cancelled.";
  if (c.startMs == null) return "Set the assignment's timezone first, so its start time is known.";
  if (c.startMs <= c.nowMs) return "This assignment has already started, so readiness can't be tracked for it.";
  return null;
}

// A professional may answer only while enrolled and before the assignment starts.
export function mayRespond(input: { enrolled: boolean; disabled: boolean; startMs: number | null; nowMs: number; endMs: number | null }): string | null {
  if (!input.enrolled || input.disabled) return "Readiness tracking is not active for this assignment.";
  const limit = input.startMs ?? input.endMs;
  if (limit != null && input.nowMs >= limit) return "This assignment has started, so readiness can no longer be updated.";
  return null;
}

// ---- issue lifecycle
export const ISSUE_STATUSES = ["open", "acknowledged", "in_progress", "awaiting_professional", "resolved"] as const;
export type IssueStatus = (typeof ISSUE_STATUSES)[number];
export const ISSUE_STATUS_LABELS: Record<IssueStatus, string> = {
  open: "Open",
  acknowledged: "Acknowledged",
  in_progress: "Action in progress",
  awaiting_professional: "Awaiting professional confirmation",
  resolved: "Resolved",
};

export type IssueAction = "acknowledge" | "start_action" | "request_confirmation" | "resolve" | "reopen";
const MGMT: Record<IssueAction, { from: IssueStatus[]; to: IssueStatus }> = {
  acknowledge: { from: ["open"], to: "acknowledged" },
  start_action: { from: ["open", "acknowledged"], to: "in_progress" },
  request_confirmation: { from: ["acknowledged", "in_progress"], to: "awaiting_professional" },
  resolve: { from: ["open", "acknowledged", "in_progress", "awaiting_professional"], to: "resolved" },
  reopen: { from: ["resolved"], to: "open" },
};

export function managementIssueTransition(from: string, action: IssueAction): { ok: true; to: IssueStatus } | { ok: false; error: string } {
  const t = MGMT[action];
  if (!t) return { ok: false, error: "Unknown action." };
  if (!(t.from as string[]).includes(from)) return { ok: false, error: `That can't be done while the issue is “${ISSUE_STATUS_LABELS[from as IssueStatus] ?? from}”.` };
  return { ok: true, to: t.to };
}
export function managementIssueActions(status: string): IssueAction[] {
  return (Object.keys(MGMT) as IssueAction[]).filter((a) => managementIssueTransition(status, a).ok);
}

// A professional may say their own issue is resolved or reply, but never closes it: only management does.
export function professionalMayRespond(status: string): boolean {
  return status !== "resolved";
}

// Management never acts on an issue about their own assignment, whatever their administrative role.
export const SELF_ISSUE_MESSAGE =
  "This is your own assignment, so you can't acknowledge, update or close its issues in management. Another administrator must do that; you can reply from your assignment page.";
export function independentOfAssignee(actorId: string, assigneeId: string | null): string | null {
  return actorId && assigneeId && actorId === assigneeId ? SELF_ISSUE_MESSAGE : null;
}

export const MAX_MESSAGE = 1000;
export function validateMessage(body: string, required = true): { ok: true; body: string } | { ok: false; error: string } {
  const t = body.trim();
  if (required && t.length < 2) return { ok: false, error: "Write a short message." };
  if (t.length > MAX_MESSAGE) return { ok: false, error: `Messages must be ${MAX_MESSAGE} characters or fewer.` };
  return { ok: true, body: t };
}

// ---- rescheduling
export const NOTICE_METHODS = ["phone", "whatsapp", "email", "in_person", "other"] as const;
export type NoticeMethod = (typeof NOTICE_METHODS)[number];
export const NOTICE_METHOD_LABELS: Record<NoticeMethod, string> = { phone: "Phone call", whatsapp: "WhatsApp", email: "Email (sent by you)", in_person: "In person", other: "Other" };

export type Party = { kind: "professional" | "client"; profileId: string | null; label: string };
export type NoticeInput = { informed: boolean; method: string; informedAtLocal: string; note: string };

export type RescheduleInput = {
  startDate: string; endDate: string; callTime: string; finishTime: string; timezone: string; reason: string;
  notices: NoticeInput[]; // aligned with the expected parties
};
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const LOCAL_DT = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})$/;

export type ValidReschedule = { startDate: string; endDate: string; callTime: string; finishTime: string; timezone: string; reason: string; notices: ({ informed: false } | { informed: true; method: NoticeMethod; informedAtMs: number; note: string })[] };

export function validateReschedule(input: RescheduleInput, parties: Party[], effectiveTz: string | null, nowMs: number): { ok: true; value: ValidReschedule } | { ok: false; error: string } {
  if (!DATE_RE.test(input.startDate) || Number.isNaN(Date.parse(`${input.startDate}T00:00:00Z`))) return { ok: false, error: "Enter the new start date." };
  if (!DATE_RE.test(input.endDate) || Number.isNaN(Date.parse(`${input.endDate}T00:00:00Z`))) return { ok: false, error: "Enter the new end date." };
  if (input.endDate < input.startDate) return { ok: false, error: "The end date can't be before the start date." };
  for (const [label, t] of [["call", input.callTime], ["finish", input.finishTime]] as const) if (t && !TIME_RE.test(t)) return { ok: false, error: `Enter the ${label} time as HH:MM (24-hour), or leave it blank.` };
  const tzInput = input.timezone.trim();
  if (tzInput && !isValidTimeZone(tzInput)) return { ok: false, error: "That timezone isn't recognised (use a name like Asia/Qatar)." };
  if (input.reason.trim().length < 5) return { ok: false, error: "Give the reason for the change (at least 5 characters)." };
  if (input.notices.length !== parties.length) return { ok: false, error: "Record, for each person, whether they have been told." };
  const tz = tzInput || effectiveTz;
  const notices: ValidReschedule["notices"] = [];
  for (let i = 0; i < parties.length; i++) {
    const n = input.notices[i];
    if (!n.informed) { notices.push({ informed: false }); continue; }
    if (!(NOTICE_METHODS as readonly string[]).includes(n.method)) return { ok: false, error: `Choose how ${parties[i].label} was told.` };
    const m = LOCAL_DT.exec(n.informedAtLocal);
    if (!m) return { ok: false, error: `Enter when ${parties[i].label} was told.` };
    if (!tz) return { ok: false, error: "Set the assignment's timezone so the time you were told can be recorded." };
    const ms = zonedToUtcMs(m[1], Number(m[2]), Number(m[3]), tz);
    if (ms > nowMs + 5 * 60_000) return { ok: false, error: `The time ${parties[i].label} was told can't be in the future.` };
    notices.push({ informed: true, method: n.method as NoticeMethod, informedAtMs: ms, note: n.note.trim().slice(0, 500) });
  }
  return { ok: true, value: { startDate: input.startDate, endDate: input.endDate, callTime: input.callTime, finishTime: input.finishTime, timezone: tzInput, reason: input.reason.trim(), notices } };
}
