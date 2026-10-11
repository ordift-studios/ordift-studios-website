import { createAdminClient } from "@/lib/supabase/admin";
import { logActivityAsSystem } from "@/lib/admin/activityLog";
import { sendEmail, type EmailResult } from "@/lib/shared/email/dispatch";
import { escapeHtml, wrap, SERIF, SANS, NAVY, GOLD, INK_MUTED } from "@/lib/enquiry/emailTemplates";
import { siteUrl } from "@/lib/shared/env";
import type { CurrentUser } from "@/lib/portal/roles";
import { SERVICE_FAMILIES } from "./config";
import { crewJobUrl } from "./crewNotifications";
import { isManagementUser } from "./management";
import { loadAssignmentContext, listManagerCandidates, listReadinessResponses } from "./readiness";
import { readinessState } from "./readinessRules";
import {
  buildReminderEmail, escalationRecipients, evaluateReminders, isEscalation, schedulerHealth, stageForResendEvent, stopsFurtherReminders,
  validateLateCaps, validateModeChange, type DeliveryStage, type ReminderDecision, type ReminderKind, type ReminderMode, type ReminderSettings,
  type SchedulerHealth, type SchedulerTrigger, type SkipReason,
} from "./readinessReminderRules";
import { formatInZone } from "./schedule";

// B2 shell: loads live data, asks the pure rules what is due, and records/sends it with claim-before-send idempotency.
//   off      -> nothing computed
//   dry_run  -> computed, nothing written except the heartbeat, nothing sent
//   test     -> the whole flow including claims and delivery records, but NOTHING leaves the system
//   live     -> real email (still honouring FORMS_SENDING_ENABLED via the shared send path)
// Nothing here changes an assignment, a request, a payable, a payment or a file.

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };
const HOUR = 3_600_000;
const MAX_ATTEMPTS = 3;
const STUCK_CLAIM_MINUTES = 15;

export type Mailer = (p: { to: string; subject: string; html: string; text: string; reference: string }) => Promise<EmailResult>;
const defaultMailer: Mailer = (p) => sendEmail({ to: p.to, subject: p.subject, html: p.html, text: p.text, logPrefix: "[readiness-reminder]", emailType: "readiness-reminder", referenceNumber: p.reference });

const serviceLabel = (family: string | null) => SERVICE_FAMILIES.find((f) => f.value === family)?.label ?? "Creative Crew Support";

// ---------------------------------------------------------------- settings
export type ReminderSettingsView = ReminderSettings & { staleAlarmHours: number; modeChangedAt: string | null; resendWebhookConfigured: boolean };

export async function loadReminderSettings(): Promise<ReminderSettingsView> {
  const { data } = await createAdminClient().from("assignment_readiness_settings").select("*").eq("id", true).maybeSingle();
  const mode = ((data?.reminders_mode as string | undefined) ?? "off") as ReminderMode;
  return {
    mode,
    firstHours: (data?.first_reminder_hours as number | undefined) ?? 48,
    checkHours: (data?.readiness_check_hours as number | undefined) ?? 24,
    flagHours: (data?.no_response_flag_hours as number | undefined) ?? 12,
    skipCheckIfReady: (data?.skip_check_if_ready as boolean | undefined) ?? true,
    lateCapFirstHours: (data?.late_cap_first_hours as number | undefined) ?? 6,
    lateCapCheckHours: (data?.late_cap_check_hours as number | undefined) ?? 3,
    lateCapEscalationHours: (data?.late_cap_escalation_hours as number | undefined) ?? 3,
    switchedOnAtMs: data?.reminders_switched_on_at ? Date.parse(data.reminders_switched_on_at as string) : null,
    staleAlarmHours: (data?.scheduler_stale_alarm_hours as number | undefined) ?? 3,
    modeChangedAt: (data?.reminders_mode_changed_at as string | null | undefined) ?? null,
    resendWebhookConfigured: Boolean(process.env.RESEND_WEBHOOK_SECRET),
  };
}

export async function setRemindersMode(params: { user: CurrentUser; to: string; reason: string }): Promise<Result<{ mode: ReminderMode }>> {
  if (!(await isManagementUser(params.user))) return { ok: false, error: "Only authorised management can change the reminder mode." };
  const s = await loadReminderSettings();
  const v = validateModeChange({ from: s.mode, to: params.to, reason: params.reason, resendWebhookConfigured: s.resendWebhookConfigured });
  if (!v.ok) return v;
  const { error } = await createAdminClient().from("assignment_readiness_settings").update({ reminders_mode: v.to, reminders_mode_changed_by: params.user.id, updated_by: params.user.id, updated_at: new Date().toISOString() }).eq("id", true);
  if (error) { console.error("[reminders] mode change failed", error.message); return { ok: false, error: "Could not change the mode." }; }
  await logActivityAsSystem({ actorUserId: params.user.id, action: "assignment_readiness.reminders_mode_changed", entityType: "assignment_readiness_settings", entityId: "settings", metadata: { from: s.mode, to: v.to, reason: params.reason.trim() } });
  return { ok: true, mode: v.to };
}

export async function updateLateCaps(params: { user: CurrentUser; first: number; check: number; escalation: number }): Promise<Result> {
  if (!(await isManagementUser(params.user))) return { ok: false, error: "Only authorised management can change these limits." };
  const bad = validateLateCaps(params);
  if (bad) return { ok: false, error: bad };
  const { error } = await createAdminClient().from("assignment_readiness_settings").update({ late_cap_first_hours: params.first, late_cap_check_hours: params.check, late_cap_escalation_hours: params.escalation, updated_by: params.user.id, updated_at: new Date().toISOString() }).eq("id", true);
  if (error) return { ok: false, error: "Could not save the limits." };
  await logActivityAsSystem({ actorUserId: params.user.id, action: "assignment_readiness.late_caps_changed", entityType: "assignment_readiness_settings", entityId: "settings", metadata: { first: params.first, check: params.check, escalation: params.escalation } });
  return { ok: true };
}

export async function setAreaLabel(params: { engagementId: string; user: CurrentUser; label: string }): Promise<Result> {
  if (!(await isManagementUser(params.user))) return { ok: false, error: "Only authorised management can set the area label." };
  const label = params.label.trim().replace(/\s+/g, " ");
  if (label.length < 2 || label.length > 80) return { ok: false, error: "Enter a short city/area, 2–80 characters, e.g. “Doha — West Bay”." };
  const { data, error } = await createAdminClient().from("assignment_readiness").update({ area_label: label }).eq("engagement_id", params.engagementId).select("id").maybeSingle();
  if (error || !data) return { ok: false, error: "That assignment isn't enrolled in readiness tracking." };
  await logActivityAsSystem({ actorUserId: params.user.id, action: "assignment_readiness.area_label_set", entityType: "engagement", entityId: params.engagementId, metadata: { label } });
  return { ok: true };
}

// ---------------------------------------------------------------- candidates
type Candidate = {
  readinessId: string; engagementId: string; requestId: string; slotId: string; enrolledAtMs: number; disabled: boolean; areaLabel: string | null;
  responsibleManagerId: string | null; assigneeId: string | null; reference: string; serviceFamily: string | null; timezone: string | null; startMs: number | null;
  decisions: ReminderDecision[]; state: ReturnType<typeof readinessState>; issueKind: "need_assistance" | "not_ready" | undefined; scheduleVersion: number;
};

async function loadCandidates(nowMs: number, settings: ReminderSettings): Promise<Candidate[]> {
  const admin = createAdminClient();
  const { data: rows } = await admin.from("assignment_readiness").select("id, engagement_id, request_id, slot_id, enrolled_at, disabled_at, area_label, responsible_manager_id");
  const out: Candidate[] = [];
  for (const r of rows ?? []) {
    const ctx = await loadAssignmentContext(r.engagement_id as string);
    if (!ctx || ctx.startMs == null) continue;
    if (ctx.startMs < nowMs - HOUR) continue; // long past: nothing to decide or record
    const responses = await listReadinessResponses(r.id as string);
    const latest = responses[0] ? { status: responses[0].status, scheduleVersion: responses[0].scheduleVersion } : null;
    const state = readinessState({ latest, currentScheduleVersion: ctx.scheduleVersion });
    const { data: issue } = await admin.from("assignment_readiness_issues").select("id, status, kind, raised_at").eq("readiness_id", r.id as string).neq("status", "resolved").maybeSingle();
    const decisions = evaluateReminders({
      nowMs, startMs: ctx.startMs, scheduleVersion: ctx.scheduleVersion, enrolledAtMs: Date.parse(r.enrolled_at as string), disabled: Boolean(r.disabled_at), isTest: ctx.isTest,
      requestStatus: ctx.requestStatus, slotStatus: ctx.slotStatus, slotAccepted: ctx.slotAccepted, engagementStatus: ctx.engagementStatus, state,
      areaLabel: (r.area_label as string | null) ?? null,
      openIssue: issue ? { id: issue.id as string, status: issue.status as string, raisedAtMs: Date.parse(issue.raised_at as string) } : null,
    }, settings);
    out.push({
      readinessId: r.id as string, engagementId: r.engagement_id as string, requestId: r.request_id as string, slotId: r.slot_id as string,
      enrolledAtMs: Date.parse(r.enrolled_at as string), disabled: Boolean(r.disabled_at), areaLabel: (r.area_label as string | null) ?? null,
      responsibleManagerId: (r.responsible_manager_id as string | null) ?? null, assigneeId: ctx.assigneeId, reference: ctx.reference, serviceFamily: ctx.serviceFamily,
      timezone: ctx.timezone.timezone, startMs: ctx.startMs, decisions, state, issueKind: (issue?.kind as "need_assistance" | "not_ready" | undefined), scheduleVersion: ctx.scheduleVersion,
    });
  }
  return out;
}

async function superAdminIds(): Promise<string[]> {
  const admin = createAdminClient();
  const { data: role } = await admin.from("roles").select("id").eq("slug", "super_admin").maybeSingle();
  if (!role) return [];
  const { data: ur } = await admin.from("user_roles").select("user_id").eq("role_id", role.id as string);
  const ids = [...new Set((ur ?? []).map((r) => r.user_id as string))];
  if (!ids.length) return [];
  const { data: profiles } = await admin.from("profiles").select("id").in("id", ids).eq("access_status", "active");
  return (profiles ?? []).map((p) => p.id as string);
}

async function emailOf(profileId: string): Promise<string | null> {
  const { data } = await createAdminClient().auth.admin.getUserById(profileId);
  return data?.user?.email ?? null;
}

async function activeSuppression(profileId: string): Promise<boolean> {
  const { data } = await createAdminClient().from("assignment_notification_suppressions").select("id").eq("profile_id", profileId).is("cleared_at", null).maybeSingle();
  return Boolean(data);
}

// ---------------------------------------------------------------- email rendering
function renderHtml(e: { heading: string; paragraphs: string[]; action: string; reference: string }, link: string): string {
  return wrap(`
    <p style="margin:0 0 4px;font-family:${SANS};font-size:13px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:${GOLD};">Ordift Studios</p>
    <h1 style="margin:0 0 16px;font-family:${SERIF};font-size:24px;color:${NAVY};font-weight:normal;">${escapeHtml(e.heading)}</h1>
    ${e.paragraphs.map((p) => `<p style="margin:0 0 16px;font-family:${SANS};font-size:15px;line-height:1.6;color:${NAVY};">${escapeHtml(p)}</p>`).join("")}
    <table role="presentation" width="100%" style="margin-bottom:20px;"><tr><td align="center"><a href="${escapeHtml(link)}" style="display:inline-block;padding:12px 28px;background:${GOLD};color:${NAVY};font-family:${SANS};font-size:14px;font-weight:600;text-decoration:none;border-radius:6px;">${escapeHtml(e.action)}</a></td></tr></table>
    <p style="margin:0;font-family:${SANS};font-size:12px;line-height:1.6;color:${INK_MUTED};">Reference ${escapeHtml(e.reference)}. Sign in is required; no private details are included in this email.</p>
  `);
}

function emailFor(c: Candidate, kind: ReminderKind, nowMs: number) {
  const management = isEscalation(kind);
  const link = management ? `${siteUrl()}/admin/crew-support/${c.requestId}` : crewJobUrl(c.slotId);
  const tz = c.timezone ?? "UTC";
  const e = buildReminderEmail(kind, { reference: c.reference, serviceLabel: serviceLabel(c.serviceFamily), whenLabel: formatInZone(c.startMs ?? nowMs, tz), timezone: tz, areaLabel: c.areaLabel, link, concernKind: c.issueKind, hoursToStart: ((c.startMs ?? nowMs) - nowMs) / HOUR });
  return { ...e, html: renderHtml({ heading: e.heading, paragraphs: e.paragraphs, action: e.action, reference: c.reference }, link), link };
}

// ---------------------------------------------------------------- preview (dry run) — writes nothing
export type PreviewItem = {
  readinessId: string; requestId: string; reference: string; kind: ReminderKind; dueAt: string; outcome: "will_send" | "would_skip" | "waiting" | "blocked" | "nothing_to_do";
  reason: string | null; audience: string; subject: string | null; text: string | null; recorded: string | null;
};

export async function previewReminders(params: { nowMs?: number; horizonHours?: number } = {}): Promise<{ items: PreviewItem[]; settings: ReminderSettingsView }> {
  const nowMs = params.nowMs ?? Date.now();
  const horizon = (params.horizonHours ?? 72) * HOUR;
  const settings = await loadReminderSettings();
  // "If switched on right now": a window that has already passed would be skipped, never caught up.
  const effective: ReminderSettings = { ...settings, switchedOnAtMs: settings.switchedOnAtMs ?? nowMs };
  const cands = await loadCandidates(nowMs, effective);
  const admin = createAdminClient();
  const items: PreviewItem[] = [];
  for (const c of cands) {
    const { data: existing } = await admin.from("assignment_notifications").select("kind, status, skip_reason, recipient_profile_id, schedule_version").eq("readiness_id", c.readinessId).eq("schedule_version", c.scheduleVersion);
    for (const d of c.decisions) {
      if (d.dueMs > nowMs + horizon || d.action === "none") continue;
      const rec = (existing ?? []).filter((x) => x.kind === d.kind).map((x) => (x.status === "skipped" ? `skipped (${x.skip_reason})` : (x.status as string)));
      const mail = d.action === "send" || d.action === "wait" || d.action === "blocked" ? emailFor(c, d.kind, d.dueMs > nowMs ? d.dueMs : nowMs) : null;
      items.push({
        readinessId: c.readinessId, requestId: c.requestId, reference: c.reference, kind: d.kind, dueAt: new Date(d.dueMs).toISOString(),
        outcome: d.action === "send" ? "will_send" : d.action === "skip" ? "would_skip" : d.action === "wait" ? "waiting" : d.action === "blocked" ? "blocked" : "nothing_to_do",
        reason: d.action === "skip" ? d.reason : d.action === "blocked" ? (d.detail ?? "blocked") : null,
        audience: isEscalation(d.kind) ? (c.responsibleManagerId ? "Responsible manager" : "Super Admins other than the assignee") : "The assigned professional",
        subject: mail?.subject ?? null, text: mail?.text ?? null, recorded: rec.length ? rec.join(", ") : null,
      });
    }
  }
  items.sort((a, b) => a.dueAt.localeCompare(b.dueAt));
  return { items, settings };
}

// ---------------------------------------------------------------- the run
export type RunSummary = { runId: string | null; mode: ReminderMode; trigger: SchedulerTrigger; status: "succeeded" | "failed" | "skipped_locked" | "off"; examined: number; sent: number; skipped: number; lateSkipped: number; failed: number; blocked: number };

type Counters = { examined: number; sent: number; skipped: number; lateSkipped: number; failed: number; blocked: number };

export async function runReadinessReminders(params: { trigger: SchedulerTrigger; nowMs?: number; mailer?: Mailer; actorId?: string | null }): Promise<RunSummary> {
  const nowMs = params.nowMs ?? Date.now();
  const admin = createAdminClient();
  const settings = await loadReminderSettings();
  const counters: Counters = { examined: 0, sent: 0, skipped: 0, lateSkipped: 0, failed: 0, blocked: 0 };
  const summary = (status: RunSummary["status"], runId: string | null): RunSummary => ({ runId, mode: settings.mode, trigger: params.trigger, status, ...counters });

  const holder = `${params.trigger}-${nowMs}-${Math.random().toString(36).slice(2, 8)}`;
  const { data: got } = await admin.rpc("acquire_scheduler_lock", { p_holder: holder, p_ttl_seconds: 240 });
  if (got !== true) {
    const { data: r } = await admin.from("scheduler_runs").insert({ trigger: params.trigger, mode: settings.mode, status: "skipped_locked", finished_at: new Date().toISOString(), actor_id: params.actorId ?? null }).select("id").single();
    return summary("skipped_locked", (r?.id as string | undefined) ?? null);
  }

  const { data: run } = await admin.from("scheduler_runs").insert({ trigger: params.trigger, mode: settings.mode, status: "running", actor_id: params.actorId ?? null }).select("id").single();
  const runId = (run?.id as string | undefined) ?? null;
  const finish = async (status: "succeeded" | "failed", error?: string) => {
    if (runId) await admin.from("scheduler_runs").update({ status, finished_at: new Date().toISOString(), examined: counters.examined, sent: counters.sent, skipped: counters.skipped, late_skipped: counters.lateSkipped, failed: counters.failed, error: error ? error.slice(0, 500) : null }).eq("id", runId);
  };

  try {
    if (settings.mode === "off") { await finish("succeeded"); return summary("off", runId); }
    const cands = await loadCandidates(nowMs, settings);
    counters.examined = cands.length;
    if (settings.mode === "dry_run") { await finish("succeeded"); return summary("succeeded", runId); }
    const deliveryMode: "test" | "live" = settings.mode === "live" ? "live" : "test";
    const mailer = params.mailer ?? defaultMailer;
    const supers = await superAdminIds();
    const managers = (await listManagerCandidates()).map((m) => m.id);

    for (const c of cands) {
      for (const d of c.decisions) {
        if (d.action === "blocked") { counters.blocked++; continue; }
        if (d.action === "skip") { await recordDecision({ c, d, deliveryMode, runId, trigger: params.trigger, counters }); continue; }
        if (d.action !== "send") continue;
        // one decision row per window, even for the sends: if a skip decision was already recorded, do not send
        if (await decisionExists(c, d, deliveryMode)) continue;
        const recipients = isEscalation(d.kind)
          ? escalationRecipients({ responsibleManagerId: c.responsibleManagerId, superAdminIds: supers, managerCandidateIds: managers, assigneeId: c.assigneeId })
          : c.assigneeId ? [c.assigneeId] : [];
        if (recipients.length === 0) { await recordDecision({ c, d: { kind: d.kind, dueMs: d.dueMs, action: "skip", conditionKey: d.conditionKey, reason: "no_independent_recipient" }, deliveryMode, runId, trigger: params.trigger, counters }); continue; }
        for (const recipientId of recipients) await sendOne({ c, kind: d.kind, dueMs: d.dueMs, conditionKey: d.conditionKey, recipientId, deliveryMode, nowMs, mailer, runId, trigger: params.trigger, counters });
      }
    }
    await finish("succeeded");
    return summary("succeeded", runId);
  } catch (error) {
    console.error("[reminders] run failed", error instanceof Error ? error.message : error);
    await finish("failed", error instanceof Error ? error.message : "unexpected error");
    return summary("failed", runId);
  } finally {
    await admin.rpc("release_scheduler_lock", { p_holder: holder });
  }
}

async function decisionExists(c: Candidate, d: ReminderDecision, mode: "test" | "live"): Promise<boolean> {
  const { data } = await createAdminClient().from("assignment_notifications").select("id").eq("readiness_id", c.readinessId).eq("schedule_version", c.scheduleVersion).eq("kind", d.kind).eq("condition_key", d.conditionKey).eq("delivery_mode", mode).eq("status", "skipped").limit(1);
  return (data?.length ?? 0) > 0;
}

async function recordDecision(p: { c: Candidate; d: Extract<ReminderDecision, { action: "skip" }>; deliveryMode: "test" | "live"; runId: string | null; trigger: SchedulerTrigger; counters: Counters }): Promise<void> {
  const admin = createAdminClient();
  const { error } = await admin.from("assignment_notifications").insert({
    readiness_id: p.c.readinessId, engagement_id: p.c.engagementId, schedule_version: p.c.scheduleVersion, kind: p.d.kind, recipient_profile_id: null,
    recipient_role: isEscalation(p.d.kind) ? "management" : "professional", condition_key: p.d.conditionKey, delivery_mode: p.deliveryMode, status: "skipped",
    skip_reason: p.d.reason satisfies SkipReason, due_at: new Date(p.d.dueMs).toISOString(), triggered_by: p.trigger, scheduler_run_id: p.runId,
  });
  if (error) { if (error.code !== "23505") console.error("[reminders] decision insert failed", error.message); return; } // 23505 = already decided
  p.counters.skipped++;
  if (p.d.reason === "late") p.counters.lateSkipped++;
}

async function sendOne(p: { c: Candidate; kind: ReminderKind; dueMs: number; conditionKey: string; recipientId: string; deliveryMode: "test" | "live"; nowMs: number; mailer: Mailer; runId: string | null; trigger: SchedulerTrigger; counters: Counters }): Promise<void> {
  const admin = createAdminClient();
  const role = isEscalation(p.kind) ? "management" : "professional";
  const base = { readiness_id: p.c.readinessId, engagement_id: p.c.engagementId, schedule_version: p.c.scheduleVersion, kind: p.kind, recipient_profile_id: p.recipientId, recipient_role: role, condition_key: p.conditionKey, delivery_mode: p.deliveryMode, due_at: new Date(p.dueMs).toISOString(), triggered_by: p.trigger, scheduler_run_id: p.runId };

  if (await activeSuppression(p.recipientId)) {
    const { error } = await admin.from("assignment_notifications").insert({ ...base, status: "skipped", skip_reason: "address_blocked" });
    if (!error) p.counters.skipped++;
    return;
  }
  const to = await emailOf(p.recipientId);
  if (!to) {
    const { error } = await admin.from("assignment_notifications").insert({ ...base, status: "skipped", skip_reason: "no_email_address" });
    if (!error) p.counters.skipped++;
    return;
  }
  const mail = emailFor(p.c, p.kind, p.nowMs);

  // CLAIM BEFORE SEND. A unique-key conflict means another run (or an earlier attempt) owns this notification.
  let claimId: string | null = null;
  const ins = await admin.from("assignment_notifications").insert({ ...base, status: "claimed", subject: mail.subject, attempts: 0 }).select("id").single();
  if (ins.data) claimId = ins.data.id as string;
  else if (ins.error?.code === "23505") {
    // Only a clean 'failed' row may be retried (never a stuck 'claimed' one: its outcome is unknown, so resending could duplicate).
    const { data: again } = await admin.from("assignment_notifications").update({ status: "claimed", updated_at: new Date().toISOString() })
      .eq("readiness_id", p.c.readinessId).eq("schedule_version", p.c.scheduleVersion).eq("kind", p.kind).eq("recipient_profile_id", p.recipientId).eq("condition_key", p.conditionKey).eq("delivery_mode", p.deliveryMode).eq("status", "failed").lt("attempts", MAX_ATTEMPTS).select("id").maybeSingle();
    if (!again) return;
    claimId = again.id as string;
  } else { console.error("[reminders] claim failed", ins.error?.message); return; }

  const record = async (status: "sent" | "logged" | "failed" | "suppressed_test", extra: { attempts?: number; error?: string | null }) => {
    const { data: cur } = await admin.from("assignment_notifications").select("attempts").eq("id", claimId).single();
    // attempts counts our own tries (one per run that handed it to the mailer); the mailer's internal retries are not added
    await admin.from("assignment_notifications").update({ status, attempts: ((cur?.attempts as number | undefined) ?? 0) + (status === "suppressed_test" ? 0 : 1), error: extra.error ?? null, updated_at: new Date().toISOString() }).eq("id", claimId);
  };
  const stage = async (s: DeliveryStage, extra: { providerId?: string; detail?: string } = {}) => {
    await admin.from("assignment_notification_deliveries").insert({ notification_id: claimId, stage: s, provider_message_id: extra.providerId ?? null, detail: extra.detail ?? null });
  };

  if (p.deliveryMode === "test") {
    // Test mode: the whole path is exercised, but nothing is handed to any email provider.
    console.log(`[readiness-reminder] [test mode, not delivered] ${p.kind} for ${p.c.reference} (${role})`);
    await record("suppressed_test", {});
    await stage("suppressed", { detail: "Test mode — not sent" });
    p.counters.sent++;
    return;
  }
  try {
    await stage("attempted");
    const res = await p.mailer({ to, subject: mail.subject, html: mail.html, text: mail.text, reference: p.c.reference });
    if (res.ok) {
      await record(res.mode === "sent" ? "sent" : "logged", { attempts: res.attempts });
      if (res.mode === "sent") await stage("provider_accepted", { providerId: res.providerId });
      else await stage("suppressed", { detail: "Production sending is off — logged only" });
      p.counters.sent++;
    } else {
      await record("failed", { attempts: res.attempts, error: res.error });
      await stage("failed", { detail: res.error.slice(0, 200) });
      p.counters.failed++;
    }
  } catch (error) {
    console.error("[reminders] send threw", error instanceof Error ? error.message : error);
    await record("failed", { attempts: 1, error: "unexpected error" }).catch(() => undefined);
    p.counters.failed++;
  }
}

// ---------------------------------------------------------------- manual run (management) and health
export async function runCheckNow(params: { user: CurrentUser }): Promise<Result<{ summary: RunSummary }>> {
  if (!(await isManagementUser(params.user))) return { ok: false, error: "Only authorised management can run the check." };
  const summary = await runReadinessReminders({ trigger: "manual", actorId: params.user.id });
  await logActivityAsSystem({ actorUserId: params.user.id, action: "assignment_readiness.reminders_manual_run", entityType: "assignment_readiness_settings", entityId: "settings", metadata: { mode: summary.mode, status: summary.status, sent: summary.sent, skipped: summary.skipped, failed: summary.failed } });
  return { ok: true, summary };
}

export type SchedulerStatus = { health: SchedulerHealth; mode: ReminderMode; lastRunAt: string | null; lastSuccessAt: string | null; lastTrigger: string | null; lateSkips7d: number; failed7d: number; stuckClaims: number; blocked: number };

export async function getSchedulerStatus(nowMs: number = Date.now()): Promise<SchedulerStatus> {
  const admin = createAdminClient();
  const settings = await loadReminderSettings();
  const [{ data: last }, { data: lastOk }, { data: tracked }] = await Promise.all([
    admin.from("scheduler_runs").select("started_at, trigger").order("started_at", { ascending: false }).limit(1).maybeSingle(),
    admin.from("scheduler_runs").select("finished_at").eq("status", "succeeded").order("finished_at", { ascending: false }).limit(1).maybeSingle(),
    admin.from("assignment_readiness").select("id, request_id").is("disabled_at", null),
  ]);
  const weekAgo = new Date(nowMs - 7 * 24 * HOUR).toISOString();
  const stuckBefore = new Date(nowMs - STUCK_CLAIM_MINUTES * 60_000).toISOString();
  const [{ count: late }, { count: failed }, { count: stuck }] = await Promise.all([
    admin.from("assignment_notifications").select("id", { count: "exact", head: true }).eq("status", "skipped").eq("skip_reason", "late").gte("claimed_at", weekAgo),
    admin.from("assignment_notifications").select("id", { count: "exact", head: true }).eq("status", "failed").gte("claimed_at", weekAgo),
    admin.from("assignment_notifications").select("id", { count: "exact", head: true }).eq("status", "claimed").lt("updated_at", stuckBefore),
  ]);
  const lastSuccessMs = lastOk?.finished_at ? Date.parse(lastOk.finished_at as string) : null;
  return {
    health: schedulerHealth({ mode: settings.mode, trackedUpcoming: (tracked ?? []).length, lastSuccessMs, nowMs, staleHours: settings.staleAlarmHours }),
    mode: settings.mode, lastRunAt: (last?.started_at as string | null | undefined) ?? null, lastSuccessAt: (lastOk?.finished_at as string | null | undefined) ?? null, lastTrigger: (last?.trigger as string | null | undefined) ?? null,
    lateSkips7d: late ?? 0, failed7d: failed ?? 0, stuckClaims: stuck ?? 0, blocked: 0,
  };
}

// ---------------------------------------------------------------- delivery webhook
export async function recordDeliveryEvent(params: { eventId: string; type: string; emailId: string | null; occurredAt: string | null }): Promise<{ outcome: "recorded" | "duplicate" | "ignored" | "unknown_message" }> {
  const stage = stageForResendEvent(params.type);
  if (!stage || !params.emailId) return { outcome: "ignored" };
  const admin = createAdminClient();
  const { data: accepted } = await admin.from("assignment_notification_deliveries").select("notification_id").eq("provider_message_id", params.emailId).eq("stage", "provider_accepted").maybeSingle();
  if (!accepted) return { outcome: "unknown_message" }; // not one of ours (or accepted before we recorded it)
  const occurredAt = params.occurredAt && !Number.isNaN(Date.parse(params.occurredAt)) ? new Date(params.occurredAt).toISOString() : new Date().toISOString();
  const { data: row, error } = await admin.from("assignment_notification_deliveries").insert({ notification_id: accepted.notification_id, stage, provider_message_id: params.emailId, provider_event_id: params.eventId, occurred_at: occurredAt }).select("id").single();
  if (error) {
    if (error.code !== "23505") console.error("[reminders] delivery event insert failed", error.code, error.message);
    return { outcome: error.code === "23505" ? "duplicate" : "ignored" };
  }
  if (stopsFurtherReminders(stage)) {
    const { data: n } = await admin.from("assignment_notifications").select("recipient_profile_id").eq("id", accepted.notification_id as string).single();
    if (n?.recipient_profile_id) {
      const { error: sErr } = await admin.from("assignment_notification_suppressions").insert({ profile_id: n.recipient_profile_id, reason: stage === "bounced" ? "bounced" : "complained", source_delivery_id: row?.id ?? null });
      if (!sErr) await logActivityAsSystem({ actorUserId: null, action: "assignment_readiness.address_suppressed", entityType: "profile", entityId: n.recipient_profile_id as string, metadata: { reason: stage } });
    }
  }
  return { outcome: "recorded" };
}

export async function clearSuppression(params: { user: CurrentUser; profileId: string; reason: string }): Promise<Result> {
  if (!(await isManagementUser(params.user))) return { ok: false, error: "Only authorised management can clear a blocked address." };
  if (params.reason.trim().length < 5) return { ok: false, error: "Say why it is safe to resume (at least 5 characters)." };
  const { data, error } = await createAdminClient().from("assignment_notification_suppressions").update({ cleared_at: new Date().toISOString(), cleared_by: params.user.id, cleared_reason: params.reason.trim() }).eq("profile_id", params.profileId).is("cleared_at", null).select("id").maybeSingle();
  if (error || !data) return { ok: false, error: "No blocked address to clear." };
  await logActivityAsSystem({ actorUserId: params.user.id, action: "assignment_readiness.address_suppression_cleared", entityType: "profile", entityId: params.profileId, metadata: { reason: params.reason.trim() } });
  return { ok: true };
}
