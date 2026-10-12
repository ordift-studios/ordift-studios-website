import { createHmac, timingSafeEqual } from "node:crypto";
import type { ReadinessState } from "./readinessRules";

// B2: automated readiness reminders and management escalation. PURE — no database, no clock, no email. Everything the
// scheduler decides is decided here from plain inputs, so the guarantees (no duplicate, no stale, no catch-up flood, no
// reminder to an ineligible assignment, never escalate to the professional) are directly testable.

export const REMINDER_MODES = ["off", "dry_run", "test", "live"] as const;
export type ReminderMode = (typeof REMINDER_MODES)[number];
export const REMINDER_MODE_LABELS: Record<ReminderMode, string> = {
  off: "Off — nothing is computed or sent",
  dry_run: "Dry run — shows what would be sent; sends nothing",
  test: "Test — runs the whole process but nothing leaves the system",
  live: "Live — sends real emails for enrolled assignments",
};

export const REMINDER_KINDS = ["reminder_first", "reminder_check", "escalation_no_response", "escalation_concern"] as const;
export type ReminderKind = (typeof REMINDER_KINDS)[number];
export const REMINDER_KIND_LABELS: Record<ReminderKind, string> = {
  reminder_first: "Preparation reminder",
  reminder_check: "Readiness follow-up",
  escalation_no_response: "Management escalation — no response",
  escalation_concern: "Management escalation — unresolved concern",
};
export const isEscalation = (k: ReminderKind): boolean => k === "escalation_no_response" || k === "escalation_concern";

export type SkipReason =
  | "ineligible" | "before_enrolment" | "before_switch_on" | "late" | "already_ready" | "managed_by_management"
  | "condition_not_met" | "no_independent_recipient";
export const SKIP_REASON_LABELS: Record<SkipReason, string> = {
  ineligible: "Assignment not eligible (cancelled, finished, started, disabled or not active)",
  before_enrolment: "Due before the assignment was enrolled",
  before_switch_on: "Due before reminders were switched on (no catch-up)",
  late: "The run was too late — sending now would be stale",
  already_ready: "Already confirmed ready for the current schedule",
  managed_by_management: "Professional asked for help — management follows up",
  condition_not_met: "The condition no longer applied",
  no_independent_recipient: "No independent manager available to receive it",
};

export type ReminderSettings = {
  mode: ReminderMode;
  firstHours: number;
  checkHours: number;
  flagHours: number;
  skipCheckIfReady: boolean;
  lateCapFirstHours: number;
  lateCapCheckHours: number;
  lateCapEscalationHours: number;
  switchedOnAtMs: number | null;
};

export type ReminderContext = {
  nowMs: number;
  startMs: number | null;
  scheduleVersion: number;
  enrolledAtMs: number;
  disabled: boolean;
  isTest: boolean;
  // the professional has reported the work: it is done, so no readiness reminder makes sense whatever the schedule says
  jobReportSubmitted: boolean;
  requestStatus: string;
  slotStatus: string;
  slotAccepted: boolean;
  engagementStatus: string;
  state: ReadinessState;
  areaLabel: string | null;
  openIssue: { id: string; status: string; raisedAtMs: number } | null;
};

export type ReminderDecision =
  | { kind: ReminderKind; dueMs: number; action: "wait" | "none" | "blocked" | "send"; conditionKey: string; detail?: string }
  | { kind: ReminderKind; dueMs: number; action: "skip"; conditionKey: string; reason: SkipReason; detail?: string };

const HOUR = 3_600_000;
const ACTIVE_REQUEST = ["confirmed", "in_production"];
const TERMINAL_ENGAGEMENT = ["completed", "cancelled"];

// Why an assignment can't receive readiness notifications at all right now. Re-checked at SEND time from live data.
export function reminderIneligibility(c: ReminderContext): string | null {
  if (c.disabled) return "Readiness tracking is switched off for this assignment";
  if (c.isTest) return "QA/test record";
  if (c.jobReportSubmitted) return "A job report has already been submitted (the work is done)";
  if (c.slotStatus !== "assigned" || !c.slotAccepted) return "The assignment is not accepted/assigned";
  if (!ACTIVE_REQUEST.includes(c.requestStatus)) return "The request is cancelled, declined, completed or not yet confirmed";
  if (TERMINAL_ENGAGEMENT.includes(c.engagementStatus)) return "The engagement is finished or cancelled";
  if (c.startMs == null) return "The start time is unknown";
  if (c.nowMs >= c.startMs) return "The assignment has started";
  return null;
}

export function dueTimeMs(startMs: number, hours: number): number {
  return startMs - hours * HOUR;
}

// Evaluate all four notification windows for one assignment at `nowMs`. The shell records `send` and `skip` decisions
// (each at most once, by unique key) and ignores `wait`, `none` and `blocked`.
export function evaluateReminders(c: ReminderContext, s: ReminderSettings): ReminderDecision[] {
  if (c.startMs == null) return [];
  const startMs = c.startMs;
  const inelig = reminderIneligibility(c);
  const out: ReminderDecision[] = [];

  const kinds: { kind: ReminderKind; hours: number; cap: number }[] = [
    { kind: "reminder_first", hours: s.firstHours, cap: s.lateCapFirstHours },
    { kind: "reminder_check", hours: s.checkHours, cap: s.lateCapCheckHours },
    { kind: "escalation_no_response", hours: s.flagHours, cap: s.lateCapEscalationHours },
    { kind: "escalation_concern", hours: s.flagHours, cap: s.lateCapEscalationHours },
  ];

  for (const k of kinds) {
    const dueMs = dueTimeMs(startMs, k.hours);
    let conditionKey = "";
    let anchorMs = dueMs;
    if (k.kind === "escalation_concern") {
      // Concerns are escalated once per issue, from T-flag onward (an issue raised after the due time anchors there).
      if (!c.openIssue || c.openIssue.status === "resolved") { out.push({ kind: k.kind, dueMs, action: c.nowMs < dueMs ? "wait" : "none", conditionKey }); continue; }
      conditionKey = c.openIssue.id;
      anchorMs = Math.max(dueMs, c.openIssue.raisedAtMs);
    }
    const base = { kind: k.kind, dueMs, conditionKey } as const;
    if (c.nowMs < anchorMs) { out.push({ ...base, action: "wait" }); continue; }
    if (inelig) { out.push({ ...base, action: "skip", reason: "ineligible", detail: inelig }); continue; }
    if (dueMs < c.enrolledAtMs) { out.push({ ...base, action: "skip", reason: "before_enrolment" }); continue; }
    if (s.switchedOnAtMs == null || dueMs < s.switchedOnAtMs) { out.push({ ...base, action: "skip", reason: "before_switch_on" }); continue; }
    if (c.nowMs - anchorMs > k.cap * HOUR) { out.push({ ...base, action: "skip", reason: "late" }); continue; }
    if (!isEscalation(k.kind) && !c.areaLabel?.trim()) { out.push({ ...base, action: "blocked", detail: "No city/area label is set for this assignment" }); continue; }

    switch (k.kind) {
      case "reminder_first":
        out.push({ ...base, action: "send" });
        break;
      case "reminder_check":
        if (s.skipCheckIfReady && c.state === "ready") out.push({ ...base, action: "skip", reason: "already_ready" });
        else if (c.state === "need_assistance" || c.state === "not_ready") out.push({ ...base, action: "skip", reason: "managed_by_management" });
        else out.push({ ...base, action: "send" });
        break;
      case "escalation_no_response":
        if (c.state === "not_confirmed" || c.state === "stale") out.push({ ...base, action: "send" });
        else out.push({ ...base, action: "skip", reason: "condition_not_met" });
        break;
      case "escalation_concern":
        out.push({ ...base, action: "send" });
        break;
    }
  }
  return out;
}

// Who receives a management escalation. The professional never does; the responsible manager if there is one who is
// independent of the assignee, otherwise the active Super Admins other than the assignee. Empty = nobody independent.
export function escalationRecipients(input: { responsibleManagerId: string | null; superAdminIds: string[]; managerCandidateIds: string[]; assigneeId: string | null }): string[] {
  const { responsibleManagerId, assigneeId } = input;
  if (responsibleManagerId && responsibleManagerId !== assigneeId && input.managerCandidateIds.includes(responsibleManagerId)) return [responsibleManagerId];
  return [...new Set(input.superAdminIds)].filter((id) => id !== assigneeId);
}

// ---------------------------------------------------------------- idempotency key (mirrors the database unique index)
export function notificationKey(p: { kind: ReminderKind; readinessId: string; scheduleVersion: number; recipientId: string | null; conditionKey: string; mode: "test" | "live" }): string {
  return [p.kind, p.readinessId, p.scheduleVersion, p.recipientId ?? "-", p.conditionKey, p.mode].join("|");
}

// ---------------------------------------------------------------- email content (privacy by construction)
// The builders accept ONLY the fields below, so a venue, client name, contact detail, access instruction, brief or
// compensation figure cannot appear in a reminder: there is nowhere to put it.
export type ReminderEmailVars = {
  reference: string;
  serviceLabel: string;
  whenLabel: string; // already formatted in the assignment's timezone, e.g. "Sun, 18 Oct 2026, 11:00"
  timezone: string;
  areaLabel: string | null;
  link: string;
  concernKind?: "need_assistance" | "not_ready";
  hoursToStart: number;
};

export function buildReminderEmail(kind: ReminderKind, v: ReminderEmailVars): { subject: string; heading: string; paragraphs: string[]; action: string; text: string } {
  const where = v.areaLabel ? ` in ${v.areaLabel}` : "";
  const hours = Math.max(1, Math.round(v.hoursToStart));
  let subject: string, heading: string, paragraphs: string[], action: string;
  switch (kind) {
    case "reminder_first":
      subject = `Please get ready — ${v.reference} starts ${v.whenLabel}`;
      heading = "Your assignment is coming up.";
      paragraphs = [
        `You are booked for ${v.serviceLabel}${where} on ${v.whenLabel} (${v.timezone}), about ${hours} hours from now.`,
        "Please sign in, check the details and confirm you are ready. If anything is missing — equipment, transport, access or information — tell us there so we can help in good time.",
      ];
      action = "Confirm readiness";
      break;
    case "reminder_check":
      subject = `Have you confirmed? ${v.reference} starts ${v.whenLabel}`;
      heading = "We haven't had your readiness confirmation yet.";
      paragraphs = [
        `Your ${v.serviceLabel} assignment${where} starts on ${v.whenLabel} (${v.timezone}), about ${hours} hours from now.`,
        "Please sign in and confirm you are ready, or tell us what you still need.",
      ];
      action = "Confirm readiness";
      break;
    case "escalation_no_response":
      subject = `Action needed — no readiness response, ${v.reference}`;
      heading = "An assignment starting soon has no readiness response.";
      paragraphs = [
        `${v.reference} (${v.serviceLabel}${where}) starts on ${v.whenLabel} (${v.timezone}), about ${hours} hours from now. The assigned professional has not confirmed readiness for the current schedule.`,
        "Please contact the professional by another route and record what you find in the assignment's readiness panel.",
      ];
      action = "Open the assignment";
      break;
    case "escalation_concern":
      subject = `Action needed — unresolved readiness concern, ${v.reference}`;
      heading = v.concernKind === "not_ready" ? "A professional has said they are not ready." : "A professional has asked for assistance.";
      paragraphs = [
        `${v.reference} (${v.serviceLabel}${where}) starts on ${v.whenLabel} (${v.timezone}), about ${hours} hours from now, and the concern is still unresolved.`,
        "Open the assignment to read the details, acknowledge it and record the follow-up.",
      ];
      action = "Open the assignment";
      break;
  }
  const text = [heading, "", ...paragraphs, "", `${action}: ${v.link}`, "", `Reference ${v.reference}.`].join("\n");
  return { subject, heading, paragraphs, action, text };
}

// ---------------------------------------------------------------- delivery stages
export const DELIVERY_STAGES = ["attempted", "provider_accepted", "sent", "delivered", "delayed", "bounced", "complained", "failed", "suppressed"] as const;
export type DeliveryStage = (typeof DELIVERY_STAGES)[number];
export const DELIVERY_STAGE_LABELS: Record<DeliveryStage, string> = {
  attempted: "Send attempted",
  provider_accepted: "Accepted by the email provider (not yet delivered)",
  sent: "Provider sent it",
  delivered: "Delivered to the inbox provider",
  delayed: "Delivery delayed",
  bounced: "Bounced — the address did not accept it",
  complained: "Reported as spam",
  failed: "Failed",
  suppressed: "Suppressed by the provider",
};
const STAGE_RANK: Record<DeliveryStage, number> = { attempted: 0, provider_accepted: 1, sent: 2, delayed: 3, delivered: 4, failed: 5, suppressed: 5, bounced: 6, complained: 6 };
// Events can arrive out of order and a bounce can follow "delivered"; the furthest/most adverse stage wins.
export function furthestStage(stages: DeliveryStage[]): DeliveryStage | null {
  let best: DeliveryStage | null = null;
  for (const s of stages) if (best == null || STAGE_RANK[s] > STAGE_RANK[best]) best = s;
  return best;
}
export const stopsFurtherReminders = (s: DeliveryStage): boolean => s === "bounced" || s === "complained";

const RESEND_EVENT_STAGE: Record<string, DeliveryStage> = {
  "email.sent": "sent", "email.delivered": "delivered", "email.delivery_delayed": "delayed", "email.bounced": "bounced",
  "email.complained": "complained", "email.failed": "failed", "email.suppressed": "suppressed",
};
// opened / clicked / received are deliberately not tracked.
export function stageForResendEvent(type: string): DeliveryStage | null {
  return RESEND_EVENT_STAGE[type] ?? null;
}

// ---------------------------------------------------------------- webhook signature (Svix scheme used by Resend)
export type SignatureCheck = { ok: true } | { ok: false; error: string };
export function verifyWebhookSignature(p: { secret: string | undefined; id: string | null; timestamp: string | null; signatureHeader: string | null; body: string; nowMs: number; toleranceSeconds?: number }): SignatureCheck {
  if (!p.secret) return { ok: false, error: "not-configured" }; // fail closed
  if (!p.id || !p.timestamp || !p.signatureHeader) return { ok: false, error: "missing-headers" };
  const ts = Number(p.timestamp);
  if (!Number.isFinite(ts)) return { ok: false, error: "bad-timestamp" };
  if (Math.abs(p.nowMs / 1000 - ts) > (p.toleranceSeconds ?? 300)) return { ok: false, error: "timestamp-out-of-tolerance" };
  const key = Buffer.from(p.secret.startsWith("whsec_") ? p.secret.slice(6) : p.secret, "base64");
  const expected = createHmac("sha256", key).update(`${p.id}.${p.timestamp}.${p.body}`).digest();
  for (const part of p.signatureHeader.split(" ")) {
    const [version, sig] = part.split(",");
    if (version !== "v1" || !sig) continue;
    const given = Buffer.from(sig, "base64");
    if (given.length === expected.length && timingSafeEqual(given, expected)) return { ok: true };
  }
  return { ok: false, error: "bad-signature" };
}

// ---------------------------------------------------------------- scheduler authentication and trigger
export function isAuthorizedScheduler(authorization: string | null, secret: string | undefined): boolean {
  if (!secret || secret.length < 16 || !authorization) return false; // fail closed; refuse an obviously weak secret
  const expected = Buffer.from(`Bearer ${secret}`);
  const given = Buffer.from(authorization);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

export type SchedulerTrigger = "github" | "vercel" | "manual" | "test";
export function detectTrigger(h: { userAgent: string | null; declared: string | null }): SchedulerTrigger {
  if (h.userAgent?.toLowerCase().startsWith("vercel-cron")) return "vercel";
  if (h.declared === "github") return "github";
  return "manual";
}

// ---------------------------------------------------------------- heartbeat / missed-run alarm
export type SchedulerHealth = { state: "not_applicable" | "ok" | "stale" | "never_run"; ageHours: number | null };
export function schedulerHealth(p: { mode: ReminderMode; trackedUpcoming: number; lastSuccessMs: number | null; nowMs: number; staleHours: number }): SchedulerHealth {
  if ((p.mode !== "live" && p.mode !== "test") || p.trackedUpcoming === 0) return { state: "not_applicable", ageHours: null };
  if (p.lastSuccessMs == null) return { state: "never_run", ageHours: null };
  const ageHours = (p.nowMs - p.lastSuccessMs) / HOUR;
  return { state: ageHours > p.staleHours ? "stale" : "ok", ageHours };
}

// ---------------------------------------------------------------- settings
export function validateLateCaps(v: { first: number; check: number; escalation: number }): string | null {
  for (const n of [v.first, v.check, v.escalation]) if (!Number.isInteger(n) || n < 1 || n > 48) return "Late-run limits must be whole hours between 1 and 48.";
  return null;
}
export function validateModeChange(p: { from: ReminderMode; to: string; reason: string; resendWebhookConfigured: boolean }): { ok: true; to: ReminderMode } | { ok: false; error: string } {
  if (!(REMINDER_MODES as readonly string[]).includes(p.to)) return { ok: false, error: "Choose Off, Dry run, Test or Live." };
  const to = p.to as ReminderMode;
  if (to === p.from) return { ok: false, error: "That is already the current mode." };
  if (p.reason.trim().length < 5) return { ok: false, error: "Give a reason for the change (at least 5 characters)." };
  if (to === "live" && p.from !== "test") return { ok: false, error: "Reminders can only go Live from Test — run Test first so the full process is seen working." };
  if (to === "live" && !p.resendWebhookConfigured) return { ok: false, error: "Delivery tracking is not set up (the email provider webhook secret is missing), so Live can't be switched on. Add it first." };
  return { ok: true, to };
}
