import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { zonedToUtcMs } from "./schedule";
import {
  authenticateScheduler, buildReminderEmail, detectTrigger, escalationRecipients, evaluateReminders, furthestStage, isAuthorizedScheduler, notificationKey, triggerForChannel,
  reminderIneligibility, schedulerHealth, stageForResendEvent, stopsFurtherReminders, validateModeChange, verifyWebhookSignature,
  type ReminderContext, type ReminderDecision, type ReminderKind, type ReminderSettings,
} from "./readinessReminderRules";

const H = 3_600_000;
// Start: Sun 18 Oct 2026 11:00 Doha (UTC+3, no DST)
const START = zonedToUtcMs("2026-10-18", 11, 0, "Asia/Qatar");
const SETTINGS: ReminderSettings = { mode: "live", firstHours: 48, checkHours: 24, flagHours: 12, skipCheckIfReady: true, lateCapFirstHours: 6, lateCapCheckHours: 3, lateCapEscalationHours: 3, switchedOnAtMs: START - 200 * H };
const ctx = (over: Partial<ReminderContext> = {}): ReminderContext => ({
  nowMs: START - 47 * H, startMs: START, scheduleVersion: 1, enrolledAtMs: START - 100 * H, disabled: false, isTest: false, jobReportSubmitted: false,
  requestStatus: "confirmed", slotStatus: "assigned", slotAccepted: true, engagementStatus: "active", state: "not_confirmed",
  areaLabel: "Doha — West Bay", openIssue: null, ...over,
});
const at = (hoursBeforeStart: number, over: Partial<ReminderContext> = {}) => ctx({ nowMs: START - hoursBeforeStart * H, ...over });
const get = (d: ReminderDecision[], kind: ReminderKind) => d.find((x) => x.kind === kind)!;
const act = (d: ReminderDecision[], kind: ReminderKind) => { const x = get(d, kind); return x.action === "skip" ? `skip:${x.reason}` : x.action; };

describe("due times use the assignment's own timezone", () => {
  it("T-48/24/12 are exact offsets from the zoned start (Doha 11:00 = 08:00Z)", () => {
    const d = evaluateReminders(at(47), SETTINGS);
    expect(get(d, "reminder_first").dueMs).toBe(Date.UTC(2026, 9, 16, 8, 0));
    expect(get(d, "reminder_check").dueMs).toBe(Date.UTC(2026, 9, 17, 8, 0));
    expect(get(d, "escalation_no_response").dueMs).toBe(Date.UTC(2026, 9, 17, 20, 0));
  });
  it("the same wall-clock start in Accra is a different instant, so different due times", () => {
    const accra = zonedToUtcMs("2026-10-18", 11, 0, "Africa/Accra");
    const d = evaluateReminders(ctx({ startMs: accra, nowMs: accra - 47 * H }), SETTINGS);
    expect(get(d, "reminder_first").dueMs).toBe(Date.UTC(2026, 9, 16, 11, 0));
  });
});

describe("window behaviour", () => {
  it("nothing is due more than 48h out", () => {
    const d = evaluateReminders(at(60), SETTINGS);
    expect(d.every((x) => x.action === "wait" || x.action === "none")).toBe(true);
  });
  it("T-48 sends the preparation reminder; later windows still wait", () => {
    const d = evaluateReminders(at(47.5), SETTINGS);
    expect(act(d, "reminder_first")).toBe("send");
    expect(act(d, "reminder_check")).toBe("wait");
    expect(act(d, "escalation_no_response")).toBe("wait");
  });
  it("T-24 follow-up is sent when unconfirmed or stale", () => {
    expect(act(evaluateReminders(at(23.5), SETTINGS), "reminder_check")).toBe("send");
    expect(act(evaluateReminders(at(23.5, { state: "stale" }), SETTINGS), "reminder_check")).toBe("send");
  });
  it("T-24 follow-up is skipped when already Ready for the current version", () => {
    expect(act(evaluateReminders(at(23.5, { state: "ready" }), SETTINGS), "reminder_check")).toBe("skip:already_ready");
  });
  it("Ready no longer suppresses after a reschedule makes the answer stale", () => {
    expect(act(evaluateReminders(at(23.5, { state: "stale" }), SETTINGS), "reminder_check")).toBe("send");
  });
  it("T-24 follow-up is not nagged when the professional asked for help; management follows up", () => {
    expect(act(evaluateReminders(at(23.5, { state: "need_assistance" }), SETTINGS), "reminder_check")).toBe("skip:managed_by_management");
    expect(act(evaluateReminders(at(23.5, { state: "not_ready" }), SETTINGS), "reminder_check")).toBe("skip:managed_by_management");
  });
  it("skipCheckIfReady=false still sends to a Ready professional", () => {
    expect(act(evaluateReminders(at(23.5, { state: "ready" }), { ...SETTINGS, skipCheckIfReady: false }), "reminder_check")).toBe("send");
  });
  it("T-12 escalates no-response only while unanswered", () => {
    expect(act(evaluateReminders(at(11.5, { state: "not_confirmed" }), SETTINGS), "escalation_no_response")).toBe("send");
    expect(act(evaluateReminders(at(11.5, { state: "stale" }), SETTINGS), "escalation_no_response")).toBe("send");
    expect(act(evaluateReminders(at(11.5, { state: "ready" }), SETTINGS), "escalation_no_response")).toBe("skip:condition_not_met");
  });
  it("T-12 escalates an unresolved concern once per issue, keyed by the issue", () => {
    const openIssue = { id: "issue-1", status: "open", raisedAtMs: START - 30 * H };
    const d = evaluateReminders(at(11.5, { state: "need_assistance", openIssue }), SETTINGS);
    const c = get(d, "escalation_concern");
    expect(c.action).toBe("send");
    expect(c.conditionKey).toBe("issue-1");
    // a different issue is a different condition
    const d2 = evaluateReminders(at(11.5, { state: "not_ready", openIssue: { ...openIssue, id: "issue-2" } }), SETTINGS);
    expect(get(d2, "escalation_concern").conditionKey).toBe("issue-2");
  });
  it("a concern raised after T-12 is escalated from when it was raised", () => {
    const openIssue = { id: "late-issue", status: "open", raisedAtMs: START - 5 * H };
    expect(act(evaluateReminders(at(4.9, { state: "need_assistance", openIssue }), SETTINGS), "escalation_concern")).toBe("send");
    // ...but not before it existed
    expect(act(evaluateReminders(at(6, { state: "need_assistance", openIssue }), SETTINGS), "escalation_concern")).toBe("wait");
  });
  it("a resolved issue is not escalated", () => {
    const d = evaluateReminders(at(11, { state: "need_assistance", openIssue: { id: "i", status: "resolved", raisedAtMs: START - 30 * H } }), SETTINGS);
    expect(act(d, "escalation_concern")).toBe("none");
  });
});

describe("no stale reminders (late cap)", () => {
  it("a 48h reminder 7h late is skipped, 5h late is sent", () => {
    expect(act(evaluateReminders(at(48 - 7), SETTINGS), "reminder_first")).toBe("skip:late");
    expect(act(evaluateReminders(at(48 - 5), SETTINGS), "reminder_first")).toBe("send");
  });
  it("a 24h follow-up is capped at 3h", () => {
    expect(act(evaluateReminders(at(24 - 3.5), SETTINGS), "reminder_check")).toBe("skip:late");
    expect(act(evaluateReminders(at(24 - 2.5), SETTINGS), "reminder_check")).toBe("send");
  });
  it("a missed run before the escalation window skips it as late instead of sending in the final hours", () => {
    expect(act(evaluateReminders(at(8), SETTINGS), "escalation_no_response")).toBe("skip:late");
  });
  it("caps are configurable", () => {
    expect(act(evaluateReminders(at(48 - 7), { ...SETTINGS, lateCapFirstHours: 8 }), "reminder_first")).toBe("send");
  });
});

describe("eligibility is re-checked from live data", () => {
  const cases: [string, Partial<ReminderContext>][] = [
    ["test record", { isTest: true }],
    ["cancelled request", { requestStatus: "cancelled" }],
    ["declined request", { requestStatus: "declined" }],
    ["completed request", { requestStatus: "completed" }],
    ["released slot", { slotStatus: "released" }],
    ["not accepted", { slotAccepted: false }],
    ["finished engagement", { engagementStatus: "completed" }],
    ["cancelled engagement", { engagementStatus: "cancelled" }],
    ["tracking disabled", { disabled: true }],
    ["job report already submitted (work done, even if the schedule is still in the future)", { jobReportSubmitted: true }],
  ];
  for (const [name, over] of cases) {
    it(`${name} gets nothing`, () => {
      const d = evaluateReminders(at(47.5, over), SETTINGS);
      expect(act(d, "reminder_first")).toBe("skip:ineligible");
      expect(reminderIneligibility(at(47.5, over))).not.toBeNull();
    });
  }
  it("after the start nothing is sent", () => {
    const d = evaluateReminders(ctx({ nowMs: START + 1 * H }), SETTINGS);
    expect(d.every((x) => x.action !== "send")).toBe(true);
  });
  it("unknown start (no timezone) yields no decisions at all", () => {
    expect(evaluateReminders(ctx({ startMs: null }), SETTINGS)).toEqual([]);
  });
});

describe("enrolment and switch-on windows", () => {
  it("enrolled 20h before start: the 48h reminder is never sent retrospectively, the 24h check may be", () => {
    const enrolledAtMs = START - 20 * H;
    const d = evaluateReminders(at(19.9, { enrolledAtMs }), SETTINGS);
    expect(act(d, "reminder_first")).toBe("skip:before_enrolment");
    expect(act(d, "reminder_check")).toBe("skip:before_enrolment");
    expect(act(d, "escalation_no_response")).toBe("wait");
  });
  it("enrolled 25h before start: the 24h follow-up (due after enrolment) is sent", () => {
    const d = evaluateReminders(at(23.5, { enrolledAtMs: START - 25 * H }), SETTINGS);
    expect(act(d, "reminder_check")).toBe("send");
    expect(act(d, "reminder_first")).toBe("skip:before_enrolment");
  });
  it("switching on mid-way never catches up on windows that have already passed", () => {
    const s = { ...SETTINGS, switchedOnAtMs: START - 30 * H };
    const d = evaluateReminders(at(23.5), s);
    expect(act(d, "reminder_first")).toBe("skip:before_switch_on");
    expect(act(d, "reminder_check")).toBe("send");
  });
  it("never switched on => nothing is ever sent", () => {
    const d = evaluateReminders(at(47.5), { ...SETTINGS, switchedOnAtMs: null });
    expect(act(d, "reminder_first")).toBe("skip:before_switch_on");
  });
});

describe("area label and privacy", () => {
  it("a missing area label blocks professional reminders (not recorded as final) but not management escalations", () => {
    expect(act(evaluateReminders(at(47.5, { areaLabel: null }), SETTINGS), "reminder_first")).toBe("blocked");
    expect(act(evaluateReminders(at(47.5, { areaLabel: "  " }), SETTINGS), "reminder_first")).toBe("blocked");
    expect(act(evaluateReminders(at(11.5, { areaLabel: null }), SETTINGS), "escalation_no_response")).toBe("send");
  });
  it("a blocked reminder becomes a recorded 'late' skip once the cap passes (no stale send after the label is added)", () => {
    expect(act(evaluateReminders(at(48 - 7, { areaLabel: null }), SETTINGS), "reminder_first")).toBe("skip:late");
  });
  const vars = { reference: "CSR-2026-000099", serviceLabel: "Photography", whenLabel: "Sun, 18 Oct 2026, 11:00", timezone: "Asia/Qatar", areaLabel: "Doha — West Bay", link: "https://example.test/portal/crew-offers/abc", hoursToStart: 47.6 };
  for (const kind of ["reminder_first", "reminder_check", "escalation_no_response", "escalation_concern"] as ReminderKind[]) {
    it(`${kind} email carries the allowed fields and nothing private`, () => {
      const e = buildReminderEmail(kind, { ...vars, concernKind: "need_assistance" });
      const all = `${e.subject}\n${e.text}`;
      expect(all).toContain("CSR-2026-000099");
      expect(all).toContain("Sun, 18 Oct 2026, 11:00");
      expect(all).toContain("https://example.test/portal/crew-offers/abc");
      if (!kind.startsWith("escalation")) expect(all).toContain("Doha — West Bay");
      expect(all).not.toMatch(/venue|address|phone|client name|compensation|QAR|GHS|instruction/i);
    });
  }
  it("escalation_concern wording follows the kind of concern without quoting any detail", () => {
    expect(buildReminderEmail("escalation_concern", { ...vars, concernKind: "not_ready" }).paragraphs.join(" ")).not.toMatch(/remarks|because/i);
    expect(buildReminderEmail("escalation_concern", { ...vars, concernKind: "not_ready" }).heading).toMatch(/not ready/);
  });
});

describe("escalation recipients never include the professional", () => {
  it("responsible manager only, when independent", () => {
    expect(escalationRecipients({ responsibleManagerId: "m1", superAdminIds: ["s1", "s2"], managerCandidateIds: ["m1", "s1"], assigneeId: "p1" })).toEqual(["m1"]);
  });
  it("falls back to Super Admins when no manager is set", () => {
    expect(escalationRecipients({ responsibleManagerId: null, superAdminIds: ["s1", "s2"], managerCandidateIds: [], assigneeId: "p1" })).toEqual(["s1", "s2"]);
  });
  it("excludes the assignee even when they are a Super Admin", () => {
    expect(escalationRecipients({ responsibleManagerId: null, superAdminIds: ["s1", "s2"], managerCandidateIds: [], assigneeId: "s1" })).toEqual(["s2"]);
  });
  it("a manager who IS the assignee is not used; falls back to others", () => {
    expect(escalationRecipients({ responsibleManagerId: "p1", superAdminIds: ["s1"], managerCandidateIds: ["p1"], assigneeId: "p1" })).toEqual(["s1"]);
  });
  it("a sole Super Admin who is the assignee leaves no independent recipient", () => {
    expect(escalationRecipients({ responsibleManagerId: null, superAdminIds: ["s1"], managerCandidateIds: [], assigneeId: "s1" })).toEqual([]);
  });
  it("a stale responsible manager who is no longer a candidate is ignored", () => {
    expect(escalationRecipients({ responsibleManagerId: "gone", superAdminIds: ["s1"], managerCandidateIds: ["s1"], assigneeId: "p1" })).toEqual(["s1"]);
  });
});

describe("idempotency key", () => {
  const base = { kind: "reminder_first" as const, readinessId: "r", scheduleVersion: 1, recipientId: "p", conditionKey: "", mode: "live" as const };
  it("is stable for the same notification", () => expect(notificationKey(base)).toBe(notificationKey({ ...base })));
  it("a reschedule (new schedule version) is a new key", () => expect(notificationKey(base)).not.toBe(notificationKey({ ...base, scheduleVersion: 2 })));
  it("test and live never collide", () => expect(notificationKey(base)).not.toBe(notificationKey({ ...base, mode: "test" })));
  it("each recipient and each issue is its own key", () => {
    expect(notificationKey(base)).not.toBe(notificationKey({ ...base, recipientId: "q" }));
    expect(notificationKey(base)).not.toBe(notificationKey({ ...base, conditionKey: "issue-9" }));
  });
});

describe("delivery stages", () => {
  it("maps Resend events and ignores opens and clicks", () => {
    expect(stageForResendEvent("email.delivered")).toBe("delivered");
    expect(stageForResendEvent("email.delivery_delayed")).toBe("delayed");
    expect(stageForResendEvent("email.bounced")).toBe("bounced");
    expect(stageForResendEvent("email.opened")).toBeNull();
    expect(stageForResendEvent("email.clicked")).toBeNull();
  });
  it("accepted is not delivered", () => {
    expect(furthestStage(["attempted", "provider_accepted"])).toBe("provider_accepted");
    expect(furthestStage(["provider_accepted", "delivered"])).toBe("delivered");
  });
  it("out-of-order events resolve to the furthest stage and a bounce outranks delivered", () => {
    expect(furthestStage(["delivered", "sent", "provider_accepted"])).toBe("delivered");
    expect(furthestStage(["delivered", "bounced"])).toBe("bounced");
    expect(furthestStage([])).toBeNull();
  });
  it("only bounces and complaints stop further reminders", () => {
    expect(stopsFurtherReminders("bounced")).toBe(true);
    expect(stopsFurtherReminders("complained")).toBe(true);
    expect(stopsFurtherReminders("delayed")).toBe(false);
    expect(stopsFurtherReminders("failed")).toBe(false);
  });
});

describe("webhook signature (fail closed)", () => {
  const secretRaw = Buffer.from("0123456789abcdef0123456789abcdef");
  const secret = `whsec_${secretRaw.toString("base64")}`;
  const body = JSON.stringify({ type: "email.delivered", data: { email_id: "e1" } });
  const nowMs = Date.UTC(2026, 9, 12, 12, 0, 0);
  const ts = String(Math.floor(nowMs / 1000));
  const sign = (id: string, t: string, b: string) => `v1,${createHmac("sha256", secretRaw).update(`${id}.${t}.${b}`).digest("base64")}`;
  const base = { secret, id: "msg_1", timestamp: ts, signatureHeader: sign("msg_1", ts, body), body, nowMs };
  it("accepts a correct signature", () => expect(verifyWebhookSignature(base)).toEqual({ ok: true }));
  it("accepts when one of several signatures matches (key rotation)", () => expect(verifyWebhookSignature({ ...base, signatureHeader: `v1,AAAA ${base.signatureHeader}` }).ok).toBe(true));
  it("refuses when no secret is configured", () => expect(verifyWebhookSignature({ ...base, secret: undefined })).toEqual({ ok: false, error: "not-configured" }));
  it("refuses a tampered body", () => expect(verifyWebhookSignature({ ...base, body: body.replace("e1", "e2") }).ok).toBe(false));
  it("refuses a wrong id", () => expect(verifyWebhookSignature({ ...base, id: "msg_2" }).ok).toBe(false));
  it("refuses missing headers", () => expect(verifyWebhookSignature({ ...base, signatureHeader: null }).ok).toBe(false));
  it("refuses a replayed (old) timestamp", () => {
    const old = String(Math.floor(nowMs / 1000) - 3600);
    expect(verifyWebhookSignature({ ...base, timestamp: old, signatureHeader: sign("msg_1", old, body) })).toEqual({ ok: false, error: "timestamp-out-of-tolerance" });
  });
  it("refuses a different secret", () => expect(verifyWebhookSignature({ ...base, secret: `whsec_${Buffer.from("another-secret-another-secret-12").toString("base64")}` }).ok).toBe(false));
});

describe("scheduler authentication", () => {
  const secret = "a-long-random-lab-only-secret-value";
  it("accepts the exact bearer secret", () => expect(isAuthorizedScheduler(`Bearer ${secret}`, secret)).toBe(true));
  it("refuses no secret configured (fail closed)", () => expect(isAuthorizedScheduler(`Bearer ${secret}`, undefined)).toBe(false));
  it("refuses a missing, wrong or truncated header", () => {
    expect(isAuthorizedScheduler(null, secret)).toBe(false);
    expect(isAuthorizedScheduler("Bearer nope", secret)).toBe(false);
    expect(isAuthorizedScheduler(`Bearer ${secret.slice(0, -1)}`, secret)).toBe(false);
    expect(isAuthorizedScheduler(secret, secret)).toBe(false);
  });
  it("refuses a weak secret even if it matches", () => expect(isAuthorizedScheduler("Bearer short", "short")).toBe(false));
  it("detects the trigger", () => {
    expect(detectTrigger({ userAgent: "vercel-cron/1.0", declared: null })).toBe("vercel");
    expect(detectTrigger({ userAgent: "curl/8", declared: "github" })).toBe("github");
    expect(detectTrigger({ userAgent: "curl/8", declared: null })).toBe("manual");
  });
});

describe("dedicated scheduler secret", () => {
  const cron = "vercel-cron-lab-only-secret-value-1";
  const dedicated = "readiness-dedicated-lab-secret-value-2";
  const both = { cron, dedicated };
  it("accepts the dedicated secret and reports it as the dedicated channel", () => expect(authenticateScheduler(`Bearer ${dedicated}`, both)).toBe("dedicated"));
  it("still accepts CRON_SECRET so Vercel's own daily sweep is not rejected", () => expect(authenticateScheduler(`Bearer ${cron}`, both)).toBe("vercel"));
  it("works with only CRON_SECRET configured (today's Production) and with only the dedicated one", () => {
    expect(authenticateScheduler(`Bearer ${cron}`, { cron, dedicated: undefined })).toBe("vercel");
    expect(authenticateScheduler(`Bearer ${dedicated}`, { cron, dedicated: undefined })).toBeNull();
    expect(authenticateScheduler(`Bearer ${dedicated}`, { cron: undefined, dedicated })).toBe("dedicated");
  });
  it("fails closed: nothing configured, no header, wrong, truncated, prefix-only or secret-without-Bearer", () => {
    expect(authenticateScheduler(`Bearer ${dedicated}`, { cron: undefined, dedicated: undefined })).toBeNull();
    expect(authenticateScheduler(null, both)).toBeNull();
    expect(authenticateScheduler("Bearer wrong-wrong-wrong-wrong-wrong", both)).toBeNull();
    expect(authenticateScheduler(`Bearer ${dedicated.slice(0, -1)}`, both)).toBeNull();
    expect(authenticateScheduler(`Bearer ${dedicated}x`, both)).toBeNull();
    expect(authenticateScheduler(dedicated, both)).toBeNull();
    expect(authenticateScheduler("Bearer ", both)).toBeNull();
  });
  it("applies the 16-character floor to each secret on its own", () => {
    expect(authenticateScheduler("Bearer short", { cron, dedicated: "short" })).toBeNull();
    expect(authenticateScheduler("Bearer short", { cron: "short", dedicated })).toBeNull();
    expect(authenticateScheduler("Bearer ", { cron: "", dedicated: "" })).toBeNull();
  });
  it("an unset or empty dedicated secret never lets an empty bearer through", () => {
    expect(authenticateScheduler("Bearer undefined", { cron, dedicated: undefined })).toBeNull();
    expect(authenticateScheduler("Bearer ", { cron, dedicated: "" })).toBeNull();
  });
  it("records the trigger from the credential, not from a self-declared header", () => {
    expect(triggerForChannel("dedicated", { userAgent: "curl/8", declared: "github" })).toBe("github");
    expect(triggerForChannel("dedicated", { userAgent: "vercel-cron/1.0", declared: null })).toBe("manual");
    expect(triggerForChannel("vercel", { userAgent: "vercel-cron/1.0", declared: null })).toBe("vercel");
    expect(triggerForChannel("vercel", { userAgent: "curl/8", declared: "github" })).toBe("manual");
  });
});

describe("missed-run heartbeat", () => {
  const now = Date.UTC(2026, 9, 12, 12, 0, 0);
  it("is not applicable when reminders are off or dry-run, or nothing is tracked", () => {
    expect(schedulerHealth({ mode: "off", trackedUpcoming: 3, lastSuccessMs: null, nowMs: now, staleHours: 3 }).state).toBe("not_applicable");
    expect(schedulerHealth({ mode: "dry_run", trackedUpcoming: 3, lastSuccessMs: null, nowMs: now, staleHours: 3 }).state).toBe("not_applicable");
    expect(schedulerHealth({ mode: "live", trackedUpcoming: 0, lastSuccessMs: null, nowMs: now, staleHours: 3 }).state).toBe("not_applicable");
  });
  it("alarms when live and the last success is older than the limit", () => {
    expect(schedulerHealth({ mode: "live", trackedUpcoming: 2, lastSuccessMs: now - 2 * H, nowMs: now, staleHours: 3 }).state).toBe("ok");
    expect(schedulerHealth({ mode: "live", trackedUpcoming: 2, lastSuccessMs: now - 4 * H, nowMs: now, staleHours: 3 }).state).toBe("stale");
    expect(schedulerHealth({ mode: "live", trackedUpcoming: 2, lastSuccessMs: null, nowMs: now, staleHours: 3 }).state).toBe("never_run");
  });
});

describe("mode changes", () => {
  const ok = { reason: "Trial period approved", resendWebhookConfigured: true };
  it("requires a reason and a real change", () => {
    expect(validateModeChange({ from: "off", to: "dry_run", reason: "x", resendWebhookConfigured: true }).ok).toBe(false);
    expect(validateModeChange({ from: "off", to: "off", ...ok }).ok).toBe(false);
    expect(validateModeChange({ from: "off", to: "bogus", ...ok }).ok).toBe(false);
  });
  it("goes Live only from Test, and only with delivery tracking configured", () => {
    expect(validateModeChange({ from: "off", to: "live", ...ok }).ok).toBe(false);
    expect(validateModeChange({ from: "dry_run", to: "live", ...ok }).ok).toBe(false);
    expect(validateModeChange({ from: "test", to: "live", ...ok, resendWebhookConfigured: false }).ok).toBe(false);
    expect(validateModeChange({ from: "test", to: "live", ...ok })).toEqual({ ok: true, to: "live" });
  });
  it("off, dry run and test are always reachable", () => {
    for (const to of ["off", "dry_run", "test"]) expect(validateModeChange({ from: "live", to, ...ok }).ok).toBe(true);
  });
});
