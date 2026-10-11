import { createAdminClient } from "@/lib/supabase/admin";
import { logActivityAsSystem } from "@/lib/admin/activityLog";
import type { CurrentUser } from "@/lib/portal/roles";
import { getCrewAssignmentForEngagement } from "./crewOffers";
import { isManagementUser } from "./management";
import { canManageCrewSupport } from "./permissions";
import {
  READINESS_STATE_LABELS, enrolmentBlocker, mayRespond, noResponseFlag, readinessState, validateReadinessResponse,
  type ReadinessInput, type ReadinessState,
} from "./readinessRules";
import { effectiveTimezone, scheduleEndMs, scheduleStart, scheduleVersionFromChangeCount, type EffectiveTimezone } from "./schedule";

// Pre-assignment readiness (B1). Builds on the existing request / slot / engagement records. It records and
// displays; it sends NOTHING (no email, no notification of any kind) and never touches job reports, files,
// engagement status, payables or payments.

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };
const SLOT_ENTITY = "crew_support_slot";

export type AssignmentContext = {
  engagementId: string;
  slotId: string;
  requestId: string;
  assigneeId: string | null;
  slotStatus: string;
  slotAccepted: boolean;
  engagementStatus: string;
  requestStatus: string;
  isTest: boolean;
  serviceFamily: string | null;
  reference: string;
  startDate: string;
  endDate: string;
  callTime: string | null;
  finishTime: string | null;
  timezone: EffectiveTimezone;
  startMs: number | null;
  callTimeKnown: boolean;
  endMs: number | null;
  scheduleVersion: number;
};

export async function loadAssignmentContext(engagementId: string): Promise<AssignmentContext | null> {
  const admin = createAdminClient();
  const { data: eng } = await admin.from("engagements").select("id, status, payee_profile_id, entity_type, entity_id").eq("id", engagementId).maybeSingle();
  if (!eng || eng.entity_type !== SLOT_ENTITY) return null;
  const { data: slot } = await admin.from("crew_support_slots").select("id, request_id, status, assignee_profile_id, crew_accepted_at").eq("id", eng.entity_id as string).maybeSingle();
  if (!slot) return null;
  const { data: req } = await admin.from("crew_support_requests").select("id, enquiry_id, reference_number, status, is_test, service_family, start_date, end_date, call_time, finish_time, event_timezone").eq("id", slot.request_id as string).maybeSingle();
  if (!req) return null;
  const [{ data: enq }, { count }] = await Promise.all([
    admin.from("enquiries").select("payment_country").eq("id", req.enquiry_id as string).maybeSingle(),
    admin.from("assignment_schedule_changes").select("id", { count: "exact", head: true }).eq("request_id", req.id as string),
  ]);
  const tz = effectiveTimezone({ override: (req.event_timezone as string | null) ?? null, paymentCountry: (enq?.payment_country as string | null) ?? null });
  const start = scheduleStart({ startDate: req.start_date as string, callTime: (req.call_time as string | null) ?? null, timezone: tz.timezone });
  return {
    engagementId, slotId: slot.id as string, requestId: req.id as string,
    assigneeId: (slot.assignee_profile_id as string | null) ?? null,
    slotStatus: slot.status as string, slotAccepted: Boolean(slot.crew_accepted_at),
    engagementStatus: eng.status as string, requestStatus: req.status as string, isTest: Boolean(req.is_test),
    serviceFamily: (req.service_family as string | null) ?? null, reference: req.reference_number as string,
    startDate: req.start_date as string, endDate: req.end_date as string, callTime: (req.call_time as string | null) ?? null, finishTime: (req.finish_time as string | null) ?? null,
    timezone: tz, startMs: start.startMs, callTimeKnown: start.callTimeKnown, endMs: scheduleEndMs({ endDate: req.end_date as string, timezone: tz.timezone }),
    scheduleVersion: scheduleVersionFromChangeCount(count ?? 0),
  };
}

// ---------------------------------------------------------------- settings
export type ReadinessSettings = { autoEnrolFrom: string | null; firstReminderHours: number; readinessCheckHours: number; noResponseFlagHours: number; skipCheckIfReady: boolean; remindersEnabled: boolean; updatedAt: string | null };

export async function getReadinessSettings(): Promise<ReadinessSettings> {
  const { data } = await createAdminClient().from("assignment_readiness_settings").select("*").eq("id", true).maybeSingle();
  return {
    autoEnrolFrom: (data?.auto_enrol_from as string | null) ?? null,
    firstReminderHours: (data?.first_reminder_hours as number | undefined) ?? 48,
    readinessCheckHours: (data?.readiness_check_hours as number | undefined) ?? 24,
    noResponseFlagHours: (data?.no_response_flag_hours as number | undefined) ?? 12,
    skipCheckIfReady: (data?.skip_check_if_ready as boolean | undefined) ?? true,
    remindersEnabled: false, // cannot be enabled in B1
    updatedAt: (data?.updated_at as string | null) ?? null,
  };
}

export function validateSettings(v: { firstReminderHours: number; readinessCheckHours: number; noResponseFlagHours: number }): string | null {
  const ints = [v.firstReminderHours, v.readinessCheckHours, v.noResponseFlagHours];
  if (!ints.every((n) => Number.isInteger(n))) return "Hours must be whole numbers.";
  if (v.firstReminderHours < 3 || v.firstReminderHours > 336) return "The first reminder must be between 3 and 336 hours before the assignment.";
  if (v.readinessCheckHours < 2 || v.readinessCheckHours >= v.firstReminderHours) return "The readiness check must come after the first reminder (fewer hours before the start).";
  if (v.noResponseFlagHours < 1 || v.noResponseFlagHours >= v.readinessCheckHours) return "The unanswered flag must come after the readiness check (fewer hours before the start).";
  return null;
}

export async function updateReadinessSettings(params: { user: CurrentUser; values: { autoEnrolFrom: string | null; firstReminderHours: number; readinessCheckHours: number; noResponseFlagHours: number; skipCheckIfReady: boolean } }): Promise<Result> {
  if (!(await isManagementUser(params.user))) return { ok: false, error: "Only authorised management can change readiness settings." };
  const v = params.values;
  const bad = validateSettings(v);
  if (bad) return { ok: false, error: bad };
  if (v.autoEnrolFrom) return { ok: false, error: "Automatic enrolment isn't available yet — assignments are enrolled by management, one at a time." };
  const before = await getReadinessSettings();
  const { error } = await createAdminClient().from("assignment_readiness_settings").update({
    auto_enrol_from: v.autoEnrolFrom ? new Date(v.autoEnrolFrom).toISOString() : null, first_reminder_hours: v.firstReminderHours, readiness_check_hours: v.readinessCheckHours,
    no_response_flag_hours: v.noResponseFlagHours, skip_check_if_ready: v.skipCheckIfReady, updated_by: params.user.id, updated_at: new Date().toISOString(),
  }).eq("id", true);
  if (error) { console.error("[readiness] settings update failed", error.message); return { ok: false, error: "Could not save the settings." }; }
  await logActivityAsSystem({ actorUserId: params.user.id, action: "assignment_readiness.settings_changed", entityType: "assignment_readiness_settings", entityId: "settings", metadata: { before, after: v } });
  return { ok: true };
}

// ---------------------------------------------------------------- enrolment (manual only in B1)
export async function enrolAssignment(params: { engagementId: string; user: CurrentUser; nowMs?: number }): Promise<Result<{ readinessId: string }>> {
  if (!(await isManagementUser(params.user))) return { ok: false, error: "Only authorised management can enrol an assignment." };
  const ctx = await loadAssignmentContext(params.engagementId);
  if (!ctx) return { ok: false, error: "Assignment not found." };
  const admin = createAdminClient();
  const { data: existing } = await admin.from("assignment_readiness").select("id").eq("engagement_id", params.engagementId).maybeSingle();
  const blocker = enrolmentBlocker({ isTest: ctx.isTest, requestStatus: ctx.requestStatus, slotStatus: ctx.slotStatus, slotAccepted: ctx.slotAccepted, engagementStatus: ctx.engagementStatus, alreadyEnrolled: Boolean(existing), startMs: ctx.startMs, nowMs: params.nowMs ?? Date.now() });
  if (blocker) return { ok: false, error: blocker };
  const { data, error } = await admin.from("assignment_readiness").insert({ engagement_id: ctx.engagementId, slot_id: ctx.slotId, request_id: ctx.requestId, enrolment_source: "manual", enrolled_by: params.user.id }).select("id").single();
  if (error || !data) {
    if (error?.code === "23505") return { ok: false, error: "This assignment is already enrolled." };
    console.error("[readiness] enrol failed", error?.message);
    return { ok: false, error: "Could not enrol the assignment." };
  }
  await logActivityAsSystem({ actorUserId: params.user.id, action: "assignment_readiness.enrolled", entityType: "engagement", entityId: ctx.engagementId, metadata: { source: "manual", reference: ctx.reference } });
  return { ok: true, readinessId: data.id as string };
}

export async function disableReadiness(params: { engagementId: string; user: CurrentUser; reason: string }): Promise<Result> {
  if (!(await isManagementUser(params.user))) return { ok: false, error: "Only authorised management can stop readiness tracking." };
  if (params.reason.trim().length < 5) return { ok: false, error: "Give a reason (at least 5 characters)." };
  const { data, error } = await createAdminClient().from("assignment_readiness").update({ disabled_at: new Date().toISOString(), disabled_by: params.user.id, disabled_reason: params.reason.trim() }).eq("engagement_id", params.engagementId).is("disabled_at", null).select("id");
  if (error || !data?.length) return { ok: false, error: "That assignment isn't being tracked." };
  await logActivityAsSystem({ actorUserId: params.user.id, action: "assignment_readiness.disabled", entityType: "engagement", entityId: params.engagementId, metadata: { reason: params.reason.trim() } });
  return { ok: true };
}

export async function setResponsibleManager(params: { engagementId: string; user: CurrentUser; managerId: string | null }): Promise<Result> {
  if (!(await isManagementUser(params.user))) return { ok: false, error: "Only authorised management can assign a responsible manager." };
  const admin = createAdminClient();
  if (params.managerId) {
    const { data: roles } = await admin.from("user_roles").select("roles(slug)").eq("user_id", params.managerId);
    const slugs = (roles ?? []).map((r) => (r.roles as unknown as { slug: string } | null)?.slug);
    const { data: profile } = await admin.from("profiles").select("access_status").eq("id", params.managerId).maybeSingle();
    if (profile?.access_status !== "active" || !slugs.some((s) => s === "admin" || s === "super_admin")) return { ok: false, error: "The responsible manager must be an active administrator." };
  }
  const { data, error } = await admin.from("assignment_readiness").update({ responsible_manager_id: params.managerId }).eq("engagement_id", params.engagementId).select("id");
  if (error || !data?.length) return { ok: false, error: "That assignment isn't being tracked." };
  await logActivityAsSystem({ actorUserId: params.user.id, action: "assignment_readiness.manager_set", entityType: "engagement", entityId: params.engagementId, metadata: { managerId: params.managerId } });
  return { ok: true };
}

// ---------------------------------------------------------------- the professional's answer
export type ReadinessResponse = { id: string; version: number; status: string; scheduleVersion: number; checks: Record<string, string>; concerns: Record<string, string>; remarks: string | null; submittedAt: string };
const RESP_COLS = "id, version, status, schedule_version, checks, concerns, remarks, submitted_at";
const mapResp = (r: Record<string, unknown>): ReadinessResponse => ({
  id: r.id as string, version: r.version as number, status: r.status as string, scheduleVersion: r.schedule_version as number,
  checks: (r.checks as Record<string, string>) ?? {}, concerns: (r.concerns as Record<string, string>) ?? {}, remarks: (r.remarks as string | null) ?? null, submittedAt: r.submitted_at as string,
});

export async function listReadinessResponses(readinessId: string): Promise<ReadinessResponse[]> {
  const { data } = await createAdminClient().from("assignment_readiness_responses").select(RESP_COLS).eq("readiness_id", readinessId).order("version", { ascending: false });
  return (data ?? []).map(mapResp);
}

export async function submitReadiness(params: { engagementId: string; userId: string; input: ReadinessInput; nowMs?: number }): Promise<Result<{ version: number; issueId: string | null }>> {
  const job = await getCrewAssignmentForEngagement(params.engagementId, params.userId);
  if (!job) return { ok: false, error: "Only the professional assigned to this job can confirm its readiness." };
  const admin = createAdminClient();
  const { data: rd } = await admin.from("assignment_readiness").select("id, disabled_at").eq("engagement_id", params.engagementId).maybeSingle();
  const ctx = await loadAssignmentContext(params.engagementId);
  if (!ctx) return { ok: false, error: "Assignment not found." };
  const blocked = mayRespond({ enrolled: Boolean(rd), disabled: Boolean(rd?.disabled_at), startMs: ctx.startMs, nowMs: params.nowMs ?? Date.now(), endMs: ctx.endMs });
  if (blocked || !rd) return { ok: false, error: blocked ?? "Readiness tracking is not active for this assignment." };
  const v = validateReadinessResponse(params.input, ctx.serviceFamily);
  if (!v.ok) return v;

  let version = 0;
  let responseId = "";
  for (let attempt = 0; attempt < 2 && !responseId; attempt++) {
    const { data: last } = await admin.from("assignment_readiness_responses").select("version").eq("readiness_id", rd.id as string).order("version", { ascending: false }).limit(1).maybeSingle();
    version = ((last?.version as number | undefined) ?? 0) + 1;
    const { data, error } = await admin.from("assignment_readiness_responses").insert({
      readiness_id: rd.id, version, status: v.value.status, schedule_version: ctx.scheduleVersion, checks: v.value.checks, concerns: v.value.concerns, remarks: v.value.remarks || null, submitted_by: params.userId,
    }).select("id").single();
    if (data) responseId = data.id as string;
    else if (error?.code !== "23505") { console.error("[readiness] response insert failed", error?.message); return { ok: false, error: "Could not save your answer. Please try again." }; }
  }
  if (!responseId) return { ok: false, error: "Your answer was saved at the same moment from another tab — refresh and check it." };

  const issueId = await reconcileIssue({ readinessId: rd.id as string, responseId, status: v.value.status, version, userId: params.userId });
  await logActivityAsSystem({ actorUserId: params.userId, action: "assignment_readiness.response_submitted", entityType: "engagement", entityId: params.engagementId, metadata: { readinessId: rd.id, version, status: v.value.status, scheduleVersion: ctx.scheduleVersion, issueId } });
  return { ok: true, version, issueId };
}

// At most ONE active issue per assignment (database-enforced). A problem answer raises it or updates it; a
// Ready answer on an active issue tells management the professional now reports it fixed, for them to verify.
async function reconcileIssue(p: { readinessId: string; responseId: string; status: string; version: number; userId: string }): Promise<string | null> {
  const admin = createAdminClient();
  const { data: active } = await admin.from("assignment_readiness_issues").select("id, kind").eq("readiness_id", p.readinessId).neq("status", "resolved").maybeSingle();
  const label = p.status === "need_assistance" ? "Need assistance" : p.status === "not_ready" ? "Not ready" : "Ready";
  if (p.status === "ready") {
    if (!active) return null;
    await admin.from("assignment_readiness_issues").update({ latest_response_id: p.responseId, professional_reported_resolved_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", active.id as string);
    await admin.from("assignment_readiness_issue_events").insert({ issue_id: active.id, event: "professional_update", visibility: "shared", actor_id: p.userId, actor_role: "professional", body: `Readiness answer updated to Ready (version ${p.version}). The professional reports this is now sorted — management to verify.` });
    return active.id as string;
  }
  if (active) {
    await admin.from("assignment_readiness_issues").update({ latest_response_id: p.responseId, kind: p.status, updated_at: new Date().toISOString() }).eq("id", active.id as string);
    await admin.from("assignment_readiness_issue_events").insert({ issue_id: active.id, event: "professional_update", visibility: "shared", actor_id: p.userId, actor_role: "professional", body: `Readiness answer updated to ${label} (version ${p.version}).` });
    return active.id as string;
  }
  const { data: created, error } = await admin.from("assignment_readiness_issues").insert({ readiness_id: p.readinessId, origin_response_id: p.responseId, latest_response_id: p.responseId, kind: p.status }).select("id").single();
  if (error || !created) {
    if (error?.code === "23505") { // a concurrent answer raised it first — attach to that one
      const { data: raced } = await admin.from("assignment_readiness_issues").select("id").eq("readiness_id", p.readinessId).neq("status", "resolved").maybeSingle();
      return (raced?.id as string | undefined) ?? null;
    }
    console.error("[readiness] issue insert failed", error?.message);
    return null;
  }
  await admin.from("assignment_readiness_issue_events").insert({ issue_id: created.id, event: "raised", visibility: "shared", actor_id: p.userId, actor_role: "professional", body: `Reported: ${label} (version ${p.version}).` });
  return created.id as string;
}

// ---------------------------------------------------------------- what each audience sees
export type IssueEventView = { id: string; event: string; visibility: string; actorId: string | null; actorRole: string; body: string | null; createdAt: string };
export type IssueView = {
  id: string; kind: string; status: string; raisedAt: string; acknowledgedAt: string | null; assignedTo: string | null; followUpAction: string | null;
  professionalReportedResolvedAt: string | null; professionalConfirmedAt: string | null; resolutionNote: string | null; resolvedAt: string | null; events: IssueEventView[];
};
const ISSUE_COLS = "id, kind, status, raised_at, acknowledged_at, assigned_to, follow_up_action, professional_reported_resolved_at, professional_confirmed_at, resolution_note, resolved_by, resolved_at";

async function loadIssues(readinessId: string, audience: "professional" | "management"): Promise<IssueView[]> {
  const admin = createAdminClient();
  const { data: issues } = await admin.from("assignment_readiness_issues").select(ISSUE_COLS).eq("readiness_id", readinessId).order("raised_at", { ascending: false });
  const out: IssueView[] = [];
  for (const i of issues ?? []) {
    let q = admin.from("assignment_readiness_issue_events").select("id, event, visibility, actor_id, actor_role, body, created_at").eq("issue_id", i.id as string).order("created_at", { ascending: true });
    if (audience === "professional") q = q.eq("visibility", "shared"); // internal notes never leave management
    const { data: events } = await q;
    out.push({
      id: i.id as string, kind: i.kind as string, status: i.status as string, raisedAt: i.raised_at as string, acknowledgedAt: (i.acknowledged_at as string | null) ?? null,
      assignedTo: audience === "management" ? ((i.assigned_to as string | null) ?? null) : null,
      followUpAction: audience === "management" ? ((i.follow_up_action as string | null) ?? null) : null,
      professionalReportedResolvedAt: (i.professional_reported_resolved_at as string | null) ?? null, professionalConfirmedAt: (i.professional_confirmed_at as string | null) ?? null,
      resolutionNote: audience === "management" || i.status === "resolved" ? ((i.resolution_note as string | null) ?? null) : null, resolvedAt: (i.resolved_at as string | null) ?? null,
      events: (events ?? []).map((e) => ({ id: e.id as string, event: e.event as string, visibility: e.visibility as string, actorId: audience === "management" ? ((e.actor_id as string | null) ?? null) : null, actorRole: e.actor_role as string, body: (e.body as string | null) ?? null, createdAt: e.created_at as string })),
    });
  }
  return out;
}

export type ProfessionalReadinessView = {
  enrolled: boolean; active: boolean; readinessId: string | null; state: ReadinessState; scheduleVersion: number; timezone: string | null;
  startMs: number | null; callTimeKnown: boolean; latest: ReadinessResponse | null; canRespond: string | null; issues: IssueView[]; serviceFamily: string | null; reference: string;
};

export async function getReadinessForProfessional(engagementId: string, userId: string, nowMs: number = Date.now()): Promise<ProfessionalReadinessView | null> {
  if (!(await getCrewAssignmentForEngagement(engagementId, userId))) return null;
  const ctx = await loadAssignmentContext(engagementId);
  if (!ctx) return null;
  const admin = createAdminClient();
  const { data: rd } = await admin.from("assignment_readiness").select("id, disabled_at").eq("engagement_id", engagementId).maybeSingle();
  if (!rd) return { enrolled: false, active: false, readinessId: null, state: "not_confirmed", scheduleVersion: ctx.scheduleVersion, timezone: ctx.timezone.timezone, startMs: ctx.startMs, callTimeKnown: ctx.callTimeKnown, latest: null, canRespond: "Readiness tracking is not active for this assignment.", issues: [], serviceFamily: ctx.serviceFamily, reference: ctx.reference };
  const responses = await listReadinessResponses(rd.id as string);
  const latest = responses[0] ?? null;
  return {
    enrolled: true, active: !rd.disabled_at, readinessId: rd.id as string,
    state: readinessState({ latest: latest ? { status: latest.status, scheduleVersion: latest.scheduleVersion } : null, currentScheduleVersion: ctx.scheduleVersion }),
    scheduleVersion: ctx.scheduleVersion, timezone: ctx.timezone.timezone, startMs: ctx.startMs, callTimeKnown: ctx.callTimeKnown, latest,
    canRespond: mayRespond({ enrolled: true, disabled: Boolean(rd.disabled_at), startMs: ctx.startMs, nowMs, endMs: ctx.endMs }),
    issues: await loadIssues(rd.id as string, "professional"), serviceFamily: ctx.serviceFamily, reference: ctx.reference,
  };
}

export type AdminReadinessView = {
  context: AssignmentContext; enrolled: boolean; readinessId: string | null; enrolmentSource: string | null; enrolledAt: string | null; disabledAt: string | null; disabledReason: string | null;
  responsibleManagerId: string | null; state: ReadinessState; flagNoResponse: boolean; responses: ReadinessResponse[]; issues: IssueView[]; enrolBlocker: string | null;
};

export async function getReadinessForAdmin(engagementId: string, nowMs: number = Date.now()): Promise<AdminReadinessView | null> {
  const ctx = await loadAssignmentContext(engagementId);
  if (!ctx) return null;
  const admin = createAdminClient();
  const [{ data: rd }, settings] = await Promise.all([admin.from("assignment_readiness").select("id, enrolment_source, enrolled_at, disabled_at, disabled_reason, responsible_manager_id").eq("engagement_id", engagementId).maybeSingle(), getReadinessSettings()]);
  const blocker = enrolmentBlocker({ isTest: ctx.isTest, requestStatus: ctx.requestStatus, slotStatus: ctx.slotStatus, slotAccepted: ctx.slotAccepted, engagementStatus: ctx.engagementStatus, alreadyEnrolled: Boolean(rd), startMs: ctx.startMs, nowMs });
  if (!rd) return { context: ctx, enrolled: false, readinessId: null, enrolmentSource: null, enrolledAt: null, disabledAt: null, disabledReason: null, responsibleManagerId: null, state: "not_confirmed", flagNoResponse: false, responses: [], issues: [], enrolBlocker: blocker };
  const responses = await listReadinessResponses(rd.id as string);
  const latest = responses[0] ?? null;
  const state = readinessState({ latest: latest ? { status: latest.status, scheduleVersion: latest.scheduleVersion } : null, currentScheduleVersion: ctx.scheduleVersion });
  return {
    context: ctx, enrolled: true, readinessId: rd.id as string, enrolmentSource: rd.enrolment_source as string, enrolledAt: rd.enrolled_at as string, disabledAt: (rd.disabled_at as string | null) ?? null,
    disabledReason: (rd.disabled_reason as string | null) ?? null, responsibleManagerId: (rd.responsible_manager_id as string | null) ?? null, state,
    flagNoResponse: !rd.disabled_at && noResponseFlag({ state, nowMs, startMs: ctx.startMs, flagHours: settings.noResponseFlagHours }),
    responses, issues: await loadIssues(rd.id as string, "management"), enrolBlocker: null,
  };
}

// ---------------------------------------------------------------- overview (management only, display only)
export type ReadinessAttention = { openIssues: { requestId: string; reference: string; status: string }[]; verifyIssues: number; noResponse: { requestId: string; reference: string }[]; pendingNotices: number };

export async function getReadinessAttention(user: CurrentUser, nowMs: number = Date.now()): Promise<ReadinessAttention | null> {
  if (!canManageCrewSupport(user)) return null;
  const admin = createAdminClient();
  const { data: tracked } = await admin.from("assignment_readiness").select("id, engagement_id, request_id").is("disabled_at", null);
  const out: ReadinessAttention = { openIssues: [], verifyIssues: 0, noResponse: [], pendingNotices: 0 };
  const rows = tracked ?? [];
  if (rows.length) {
    const { data: refs } = await admin.from("crew_support_requests").select("id, reference_number, is_test").in("id", rows.map((r) => r.request_id as string));
    const refMap = new Map((refs ?? []).map((r) => [r.id as string, r]));
    const { data: issues } = await admin.from("assignment_readiness_issues").select("readiness_id, status, professional_reported_resolved_at").in("readiness_id", rows.map((r) => r.id as string)).neq("status", "resolved");
    for (const i of issues ?? []) {
      const row = rows.find((r) => r.id === i.readiness_id);
      const ref = row ? refMap.get(row.request_id as string) : null;
      if (!row || !ref || ref.is_test) continue;
      out.openIssues.push({ requestId: row.request_id as string, reference: ref.reference_number as string, status: i.status as string });
      if (i.professional_reported_resolved_at) out.verifyIssues++;
    }
    for (const row of rows) {
      const ref = refMap.get(row.request_id as string);
      if (!ref || ref.is_test) continue;
      const view = await getReadinessForAdmin(row.engagement_id as string, nowMs);
      if (view?.flagNoResponse) out.noResponse.push({ requestId: row.request_id as string, reference: ref.reference_number as string });
    }
  }
  const { data: changes } = await admin.from("assignment_schedule_changes").select("id, notify_parties").eq("kind", "reschedule");
  if (changes?.length) {
    const { data: notices } = await admin.from("assignment_schedule_change_notices").select("change_id, party_kind, party_profile_id").in("change_id", changes.map((c) => c.id as string));
    const have = new Set((notices ?? []).map((n) => `${n.change_id}|${n.party_kind}|${n.party_profile_id ?? ""}`));
    for (const c of changes) for (const p of ((c.notify_parties as { kind: string; profileId: string | null }[]) ?? [])) if (!have.has(`${c.id}|${p.kind}|${p.profileId ?? ""}`)) out.pendingNotices++;
  }
  return out;
}

// For the My Assignments list: the readiness chip for each of the signed-in person's own enrolled, upcoming jobs.
export async function getReadinessChips(userId: string, jobs: { slotId: string; engagementId: string | null; state: string }[], nowMs: number = Date.now()): Promise<Record<string, { state: ReadinessState; label: string }>> {
  const out: Record<string, { state: ReadinessState; label: string }> = {};
  for (const j of jobs) {
    if (!j.engagementId || j.state !== "accepted") continue;
    const v = await getReadinessForProfessional(j.engagementId, userId, nowMs);
    if (!v || !v.enrolled || !v.active || v.canRespond) continue; // only while tracking is active and the job has not started
    out[j.slotId] = { state: v.state, label: READINESS_STATE_LABELS[v.state] };
  }
  return out;
}

// Active administrators who can be named responsible manager.
export async function listManagerCandidates(): Promise<{ id: string; label: string }[]> {
  const admin = createAdminClient();
  const { data: roles } = await admin.from("roles").select("id, slug").in("slug", ["admin", "super_admin"]);
  const roleIds = (roles ?? []).map((r) => r.id as string);
  if (!roleIds.length) return [];
  const { data: ur } = await admin.from("user_roles").select("user_id").in("role_id", roleIds);
  const ids = [...new Set((ur ?? []).map((r) => r.user_id as string))];
  if (!ids.length) return [];
  const { data: profiles } = await admin.from("profiles").select("id, full_name, member_number, access_status").in("id", ids).eq("access_status", "active");
  return (profiles ?? []).map((p) => ({ id: p.id as string, label: `${(p.full_name as string | null) ?? "Administrator"}${p.member_number ? ` (${p.member_number})` : ""}` })).sort((a, b) => a.label.localeCompare(b.label));
}
