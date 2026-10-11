import { createAdminClient } from "@/lib/supabase/admin";
import { logActivityAsSystem } from "@/lib/admin/activityLog";
import type { CurrentUser } from "@/lib/portal/roles";
import { isManagementUser } from "./management";
import { firmConflicts, loadConflicts } from "./conflicts";
import { NOTICE_METHODS, validateReschedule, type Party, type RescheduleInput } from "./readinessRules";
import { effectiveTimezone, isValidTimeZone, zonedToUtcMs } from "./schedule";

// Rescheduling, with the manual communication record. Ordift sends NOTHING in B1: management tells the
// professional and the client themselves, then records who was told, how and when. The scheduled values stay
// on the request (single source of truth); the actual service date lives on the professional's job report and
// is never touched here; the frozen quotation snapshot is never edited.

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

export type ScheduleChangeView = {
  id: string; kind: string; reason: string; changedAt: string; changedBy: string;
  previous: Record<string, string | null>; new: Record<string, string | null>;
  parties: { kind: string; profileId: string | null; label: string; notice: { method: string; informedAt: string; note: string | null; recordedAt: string } | null }[];
};

// Who must be told about a change to this request: every accepted professional, and the client.
export async function partiesForRequest(requestId: string): Promise<Party[]> {
  const admin = createAdminClient();
  const { data: slots } = await admin.from("crew_support_slots").select("id, assignee_profile_id, status, crew_accepted_at").eq("request_id", requestId).eq("status", "assigned").not("crew_accepted_at", "is", null);
  const ids = (slots ?? []).map((s) => s.assignee_profile_id as string);
  const { data: profiles } = ids.length ? await admin.from("profiles").select("id, full_name, member_number").in("id", ids) : { data: [] as { id: string; full_name: string | null; member_number: string | null }[] };
  const name = new Map((profiles ?? []).map((p) => [p.id, p.member_number ? `${p.full_name ?? "Professional"} (${p.member_number})` : (p.full_name ?? "Professional")]));
  return [...ids.map((id) => ({ kind: "professional" as const, profileId: id, label: name.get(id) ?? "the assigned professional" })), { kind: "client" as const, profileId: null, label: "the client" }];
}

export async function rescheduleAssignment(params: { requestId: string; user: CurrentUser; input: RescheduleInput; nowMs?: number }): Promise<Result<{ changeId: string; pending: number; warnings: string[] }>> {
  if (!(await isManagementUser(params.user))) return { ok: false, error: "Only authorised management can reschedule an assignment." };
  const admin = createAdminClient();
  const { data: req } = await admin.from("crew_support_requests").select("id, enquiry_id, status, is_test, start_date, end_date, call_time, finish_time, event_timezone").eq("id", params.requestId).maybeSingle();
  if (!req) return { ok: false, error: "Request not found." };
  if (["declined", "cancelled", "completed"].includes(req.status as string)) return { ok: false, error: "A declined, cancelled or completed request can't be rescheduled." };
  const { data: enq } = await admin.from("enquiries").select("payment_country").eq("id", req.enquiry_id as string).maybeSingle();
  const parties = await partiesForRequest(params.requestId);
  const tz = effectiveTimezone({ override: (req.event_timezone as string | null) ?? null, paymentCountry: (enq?.payment_country as string | null) ?? null });
  const v = validateReschedule(params.input, parties, tz.timezone, params.nowMs ?? Date.now());
  if (!v.ok) return v;

  // nothing to do if it is exactly what is already scheduled (checked first, before any clash lookup)
  const same = v.value.startDate === req.start_date && v.value.endDate === req.end_date && (v.value.callTime || null) === ((req.call_time as string | null) ?? null)
    && (v.value.finishTime || null) === ((req.finish_time as string | null) ?? null) && (!v.value.timezone || v.value.timezone === (req.event_timezone as string | null));
  if (same) return { ok: false, error: "Nothing changed — those are the dates and times already scheduled." };

  // an assigned professional already firmly booked on the new dates blocks the change (soft clashes only warn)
  const warnings: string[] = [];
  const assigned = parties.filter((p) => p.kind === "professional" && p.profileId).map((p) => p.profileId as string);
  if (assigned.length) {
    const conflicts = await loadConflicts(assigned, { start: v.value.startDate, end: v.value.endDate }, params.requestId, Boolean(req.is_test));
    for (const [id, list] of conflicts) {
      const firm = firmConflicts(list);
      const who = parties.find((p) => p.profileId === id)?.label ?? "A professional";
      if (firm.length) return { ok: false, error: `${who} is already booked on those dates: ${firm.map((c) => c.label).join("; ")}. Resolve that before rescheduling.` };
      if (list.length) warnings.push(`${who}: possible clash — ${list.map((c) => c.label).join("; ")}.`);
    }
  }

  const { data: changeId, error } = await admin.rpc("reschedule_assignment", {
    p_request_id: params.requestId, p_kind: "reschedule", p_start: v.value.startDate, p_end: v.value.endDate, p_call: v.value.callTime, p_finish: v.value.finishTime,
    p_timezone: v.value.timezone, p_reason: v.value.reason, p_changed_by: params.user.id,
    p_notify_parties: parties.map((p) => ({ kind: p.kind, profileId: p.profileId })),
  });
  if (error || !changeId) {
    const m = error?.message ?? "";
    if (m.includes("no_change")) return { ok: false, error: "Nothing changed — those are the dates and times already scheduled." };
    if (m.includes("request_closed")) return { ok: false, error: "A declined, cancelled or completed request can't be rescheduled." };
    console.error("[reschedule] rpc failed", m);
    return { ok: false, error: "Could not reschedule. Nothing was changed." };
  }

  let recorded = 0;
  for (let i = 0; i < parties.length; i++) {
    const n = v.value.notices[i];
    if (!n.informed) continue;
    const { error: nErr } = await admin.from("assignment_schedule_change_notices").insert({ change_id: changeId, party_kind: parties[i].kind, party_profile_id: parties[i].profileId, method: n.method, informed_at: new Date(n.informedAtMs).toISOString(), note: n.note || null, recorded_by: params.user.id });
    if (nErr) console.error("[reschedule] notice insert failed", nErr.message); else recorded++;
  }
  await logActivityAsSystem({ actorUserId: params.user.id, action: "assignment.rescheduled", entityType: "crew_support_request", entityId: params.requestId, metadata: { changeId, reason: v.value.reason, noticesRecorded: recorded, noticesOutstanding: parties.length - recorded, automaticNotificationsSent: false } });
  return { ok: true, changeId: changeId as string, pending: parties.length - recorded, warnings };
}

export async function setEventTimezone(params: { requestId: string; user: CurrentUser; timezone: string; reason: string }): Promise<Result> {
  if (!(await isManagementUser(params.user))) return { ok: false, error: "Only authorised management can change an assignment's timezone." };
  const tz = params.timezone.trim();
  if (tz && !isValidTimeZone(tz)) return { ok: false, error: "That timezone isn't recognised (use a name like Asia/Qatar)." };
  if (params.reason.trim().length < 5) return { ok: false, error: "Give a reason (at least 5 characters)." };
  const { error } = await createAdminClient().rpc("reschedule_assignment", { p_request_id: params.requestId, p_kind: "timezone_override", p_start: null, p_end: null, p_call: null, p_finish: null, p_timezone: tz, p_reason: params.reason.trim(), p_changed_by: params.user.id, p_notify_parties: [] });
  if (error) {
    if (error.message.includes("no_change")) return { ok: false, error: "That is already the timezone in use." };
    if (error.message.includes("request_closed")) return { ok: false, error: "A declined, cancelled or completed request can't be changed." };
    console.error("[reschedule] timezone rpc failed", error.message);
    return { ok: false, error: "Could not change the timezone." };
  }
  await logActivityAsSystem({ actorUserId: params.user.id, action: "assignment.timezone_changed", entityType: "crew_support_request", entityId: params.requestId, metadata: { timezone: tz || null, reason: params.reason.trim() } });
  return { ok: true };
}

// Later, once management has actually told someone: record how and when. Append-only, once per person per change.
export async function recordScheduleNotice(params: { changeId: string; user: CurrentUser; partyKind: "professional" | "client"; partyProfileId: string | null; method: string; informedAtLocal: string; note: string; nowMs?: number }): Promise<Result> {
  if (!(await isManagementUser(params.user))) return { ok: false, error: "Only authorised management can record who was told." };
  if (!(NOTICE_METHODS as readonly string[]).includes(params.method)) return { ok: false, error: "Choose how they were told." };
  const admin = createAdminClient();
  const { data: change } = await admin.from("assignment_schedule_changes").select("id, request_id, notify_parties").eq("id", params.changeId).maybeSingle();
  if (!change) return { ok: false, error: "Schedule change not found." };
  const expected = ((change.notify_parties as { kind: string; profileId: string | null }[]) ?? []).some((p) => p.kind === params.partyKind && (p.profileId ?? null) === (params.partyProfileId ?? null));
  if (!expected) return { ok: false, error: "That person wasn't one of the people to be told about this change." };
  const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})$/.exec(params.informedAtLocal);
  if (!m) return { ok: false, error: "Enter when they were told." };
  const { data: req } = await admin.from("crew_support_requests").select("enquiry_id, event_timezone").eq("id", change.request_id as string).maybeSingle();
  const { data: enq } = req ? await admin.from("enquiries").select("payment_country").eq("id", req.enquiry_id as string).maybeSingle() : { data: null };
  const tz = effectiveTimezone({ override: (req?.event_timezone as string | null) ?? null, paymentCountry: (enq?.payment_country as string | null) ?? null }).timezone;
  if (!tz) return { ok: false, error: "Set the assignment's timezone first." };
  const ms = zonedToUtcMs(m[1], Number(m[2]), Number(m[3]), tz);
  if (ms > (params.nowMs ?? Date.now()) + 5 * 60_000) return { ok: false, error: "The time they were told can't be in the future." };
  const { error } = await admin.from("assignment_schedule_change_notices").insert({ change_id: params.changeId, party_kind: params.partyKind, party_profile_id: params.partyProfileId, method: params.method, informed_at: new Date(ms).toISOString(), note: params.note.trim().slice(0, 500) || null, recorded_by: params.user.id });
  if (error) {
    if (error.code === "23505") return { ok: false, error: "That has already been recorded." };
    return { ok: false, error: "Could not record that." };
  }
  await logActivityAsSystem({ actorUserId: params.user.id, action: "assignment.schedule_notice_recorded", entityType: "crew_support_request", entityId: change.request_id as string, metadata: { changeId: params.changeId, party: params.partyKind, method: params.method } });
  return { ok: true };
}

export async function listScheduleChanges(requestId: string): Promise<ScheduleChangeView[]> {
  const admin = createAdminClient();
  const { data: changes } = await admin.from("assignment_schedule_changes").select("id, kind, reason, changed_at, changed_by, previous, new, notify_parties").eq("request_id", requestId).order("changed_at", { ascending: false });
  if (!changes?.length) return [];
  const { data: notices } = await admin.from("assignment_schedule_change_notices").select("change_id, party_kind, party_profile_id, method, informed_at, note, recorded_at").in("change_id", changes.map((c) => c.id as string));
  const parties = await partiesForRequest(requestId);
  return changes.map((c) => ({
    id: c.id as string, kind: c.kind as string, reason: c.reason as string, changedAt: c.changed_at as string, changedBy: c.changed_by as string,
    previous: c.previous as Record<string, string | null>, new: c.new as Record<string, string | null>,
    parties: ((c.notify_parties as { kind: string; profileId: string | null }[]) ?? []).map((p) => {
      const n = (notices ?? []).find((x) => x.change_id === c.id && x.party_kind === p.kind && (x.party_profile_id ?? null) === (p.profileId ?? null));
      return { kind: p.kind, profileId: p.profileId, label: parties.find((q) => q.kind === p.kind && (q.profileId ?? null) === (p.profileId ?? null))?.label ?? (p.kind === "client" ? "the client" : "the professional"), notice: n ? { method: n.method as string, informedAt: n.informed_at as string, note: (n.note as string | null) ?? null, recordedAt: n.recorded_at as string } : null };
    }),
  }));
}
