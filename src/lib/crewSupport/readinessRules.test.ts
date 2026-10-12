import { describe, expect, it } from "vitest";
import { COMMON_TIMEZONES, effectiveTimezone, formatInZone, isValidTimeZone, parseClock, scheduleEndMs, scheduleStart, scheduleVersionFromChangeCount, zonedToUtcMs } from "./schedule";
import {
  enrolmentBlocker, independentOfAssignee, managementIssueActions, managementIssueTransition, mayRespond, noResponseFlag, professionalMayRespond,
  readinessChecklistFor, readinessState, validateMessage, validateReadinessResponse, validateReschedule, type Party, type RescheduleInput,
} from "./readinessRules";

const H = 3_600_000;

describe("timezones", () => {
  it("resolves override, then market default, else unresolved", () => {
    expect(effectiveTimezone({ override: "Europe/London", paymentCountry: "QA" })).toEqual({ timezone: "Europe/London", source: "override" });
    expect(effectiveTimezone({ override: null, paymentCountry: "QA" })).toEqual({ timezone: "Asia/Qatar", source: "market" });
    expect(effectiveTimezone({ override: null, paymentCountry: "gh" })).toEqual({ timezone: "Africa/Accra", source: "market" });
    expect(effectiveTimezone({ override: "Not/AZone", paymentCountry: "QA" }).source).toBe("market"); // a bad override is ignored, never trusted
    expect(effectiveTimezone({ override: null, paymentCountry: null })).toEqual({ timezone: null, source: "unresolved" });
    expect(COMMON_TIMEZONES.every(isValidTimeZone)).toBe(true);
    expect(isValidTimeZone("Mars/Base")).toBe(false);
  });
  it("converts a Qatar (UTC+3) and Ghana (UTC+0) wall clock to the right instant", () => {
    expect(new Date(zonedToUtcMs("2026-10-12", 10, 0, "Asia/Qatar")).toISOString()).toBe("2026-10-12T07:00:00.000Z");
    expect(new Date(zonedToUtcMs("2026-10-12", 10, 0, "Africa/Accra")).toISOString()).toBe("2026-10-12T10:00:00.000Z");
    expect(new Date(zonedToUtcMs("2026-10-12", 1, 30, "Asia/Qatar")).toISOString()).toBe("2026-10-11T22:30:00.000Z"); // crosses the UTC date
    expect(new Date(zonedToUtcMs("2026-07-01", 10, 0, "Europe/London")).toISOString()).toBe("2026-07-01T09:00:00.000Z"); // daylight saving handled
  });
  it("parses free-text call times and falls back to start of day when unreadable", () => {
    expect(parseClock("10:00")).toEqual({ h: 10, m: 0 });
    expect(parseClock("9:30 pm")).toEqual({ h: 21, m: 30 });
    expect(parseClock("12am")).toEqual({ h: 0, m: 0 });
    expect(parseClock("around 10")).toBeNull();
    expect(parseClock("25:00")).toBeNull();
    const known = scheduleStart({ startDate: "2026-10-12", callTime: "10:00", timezone: "Asia/Qatar" });
    expect(known).toEqual({ startMs: Date.parse("2026-10-12T07:00:00Z"), callTimeKnown: true });
    const unknown = scheduleStart({ startDate: "2026-10-12", callTime: "morning", timezone: "Asia/Qatar" });
    expect(unknown).toEqual({ startMs: Date.parse("2026-10-11T21:00:00Z"), callTimeKnown: false });
    expect(scheduleStart({ startDate: "2026-10-12", callTime: "10:00", timezone: null }).startMs).toBeNull();
    expect(scheduleEndMs({ endDate: "2026-10-12", timezone: "Asia/Qatar" })).toBe(Date.parse("2026-10-12T21:00:00Z"));
    expect(formatInZone(Date.parse("2026-10-12T07:00:00Z"), "Asia/Qatar")).toMatch(/12 Oct 2026.*10:00/);
  });
  it("schedule version is derived from the change count", () => {
    expect(scheduleVersionFromChangeCount(0)).toBe(1);
    expect(scheduleVersionFromChangeCount(2)).toBe(3);
  });
});

describe("readiness response validation", () => {
  const ok = { status: "ready", checks: { equipmentChecked: "yes", locationAccess: "yes" }, concerns: {}, remarks: "" };
  it("accepts Ready with no concerns, and trims", () => {
    const r = validateReadinessResponse(ok, "photography");
    expect(r.ok).toBe(true);
  });
  it("Need assistance / Not ready need a concern or a remark", () => {
    expect(validateReadinessResponse({ ...ok, status: "need_assistance" }, "photography").ok).toBe(false);
    expect(validateReadinessResponse({ ...ok, status: "not_ready", remarks: "ill" }, "photography").ok).toBe(false);
    expect(validateReadinessResponse({ ...ok, status: "need_assistance", concerns: { transport: "Need a lift from the hotel" } }, "photography").ok).toBe(true);
    expect(validateReadinessResponse({ ...ok, status: "not_ready", remarks: "I have a family emergency" }, "photography").ok).toBe(true);
  });
  it("questions are service-specific and answers must match them", () => {
    expect(readinessChecklistFor("photography").map((q) => q.id)).toContain("mediaPowerReady");
    expect(readinessChecklistFor("graphic-design").map((q) => q.id)).toContain("briefReceived");
    expect(readinessChecklistFor("other").length).toBeLessThanOrEqual(3);
    expect(validateReadinessResponse({ ...ok, checks: { briefReceived: "yes" } }, "photography").ok).toBe(false); // a design question on a photo job
    expect(validateReadinessResponse({ ...ok, checks: { equipmentChecked: "maybe" } }, "photography").ok).toBe(false);
    expect(validateReadinessResponse({ ...ok, concerns: { nonsense: "x" } }, "photography").ok).toBe(false);
    expect(validateReadinessResponse({ ...ok, status: "bogus" }, "photography").ok).toBe(false);
    expect(validateReadinessResponse({ ...ok, remarks: "x".repeat(2001) }, "photography").ok).toBe(false);
  });
});

describe("readiness state and the 12-hour flag", () => {
  it("not confirmed → answered → stale after a reschedule", () => {
    expect(readinessState({ latest: null, currentScheduleVersion: 1 })).toBe("not_confirmed");
    expect(readinessState({ latest: { status: "ready", scheduleVersion: 1 }, currentScheduleVersion: 1 })).toBe("ready");
    expect(readinessState({ latest: { status: "need_assistance", scheduleVersion: 1 }, currentScheduleVersion: 1 })).toBe("need_assistance");
    expect(readinessState({ latest: { status: "ready", scheduleVersion: 1 }, currentScheduleVersion: 2 })).toBe("stale");
  });
  it("flags only unanswered/stale assignments inside the window, never after the start, never when unresolved", () => {
    const start = Date.parse("2026-10-12T07:00:00Z");
    const f = (state: Parameters<typeof noResponseFlag>[0]["state"], now: number, startMs: number | null = start) => noResponseFlag({ state, nowMs: now, startMs, flagHours: 12 });
    expect(f("not_confirmed", start - 13 * H)).toBe(false);
    expect(f("not_confirmed", start - 12 * H)).toBe(true);
    expect(f("stale", start - 2 * H)).toBe(true);
    expect(f("not_confirmed", start + 1)).toBe(false);
    expect(f("ready", start - 2 * H)).toBe(false);
    expect(f("need_assistance", start - 2 * H)).toBe(false); // answered: handled by the issue, not the no-response flag
    expect(f("not_confirmed", start - 2 * H, null)).toBe(false);
  });
});

describe("enrolment eligibility", () => {
  const now = Date.parse("2026-10-11T12:00:00Z");
  const good = { isTest: false, requestStatus: "confirmed", slotStatus: "assigned", slotAccepted: true, engagementStatus: "engagement_active", alreadyEnrolled: false, startMs: now + 24 * H, nowMs: now };
  it("allows an accepted, confirmed, upcoming, real assignment", () => expect(enrolmentBlocker(good)).toBeNull());
  it("refuses everything else, each for a stated reason", () => {
    expect(enrolmentBlocker({ ...good, alreadyEnrolled: true })).toMatch(/already enrolled/);
    expect(enrolmentBlocker({ ...good, isTest: true })).toMatch(/test/);
    expect(enrolmentBlocker({ ...good, slotAccepted: false })).toMatch(/accepted/);
    expect(enrolmentBlocker({ ...good, slotStatus: "proposed" })).toMatch(/accepted/);
    for (const s of ["cancelled", "declined", "completed", "received", "quoted"]) expect(enrolmentBlocker({ ...good, requestStatus: s })).toMatch(/confirmed/);
    expect(enrolmentBlocker({ ...good, engagementStatus: "completed" })).toMatch(/finished/);
    expect(enrolmentBlocker({ ...good, startMs: null })).toMatch(/timezone/);
    expect(enrolmentBlocker({ ...good, startMs: now - 1 })).toMatch(/already started/);
  });
  it("a professional may answer only while enrolled, active and before the start", () => {
    expect(mayRespond({ enrolled: true, disabled: false, startMs: now + H, nowMs: now, endMs: null })).toBeNull();
    expect(mayRespond({ enrolled: false, disabled: false, startMs: now + H, nowMs: now, endMs: null })).toMatch(/not active/);
    expect(mayRespond({ enrolled: true, disabled: true, startMs: now + H, nowMs: now, endMs: null })).toMatch(/not active/);
    expect(mayRespond({ enrolled: true, disabled: false, startMs: now - 1, nowMs: now, endMs: null })).toMatch(/started/);
  });
});

describe("issue lifecycle", () => {
  it("Open → Acknowledged → Action in progress → Awaiting professional confirmation → Resolved, and reopen", () => {
    expect(managementIssueTransition("open", "acknowledge")).toEqual({ ok: true, to: "acknowledged" });
    expect(managementIssueTransition("acknowledged", "start_action")).toEqual({ ok: true, to: "in_progress" });
    expect(managementIssueTransition("in_progress", "request_confirmation")).toEqual({ ok: true, to: "awaiting_professional" });
    expect(managementIssueTransition("awaiting_professional", "resolve")).toEqual({ ok: true, to: "resolved" });
    expect(managementIssueTransition("resolved", "reopen")).toEqual({ ok: true, to: "open" });
    expect(managementIssueTransition("open", "request_confirmation").ok).toBe(false); // must be acknowledged first
    expect(managementIssueTransition("resolved", "acknowledge").ok).toBe(false);
    expect(managementIssueActions("open")).toEqual(["acknowledge", "start_action", "resolve"]);
    expect(managementIssueActions("resolved")).toEqual(["reopen"]);
  });
  it("the professional may reply or report resolved until closed, but closing is management only", () => {
    for (const s of ["open", "acknowledged", "in_progress", "awaiting_professional"]) expect(professionalMayRespond(s)).toBe(true);
    expect(professionalMayRespond("resolved")).toBe(false);
  });
  it("nobody acts in management on their own assignment", () => {
    expect(independentOfAssignee("founder", "founder")).toMatch(/your own assignment/);
    expect(independentOfAssignee("other", "founder")).toBeNull();
    expect(independentOfAssignee("", "founder")).toBeNull();
  });
  it("messages are short and non-empty", () => {
    expect(validateMessage("ok").ok).toBe(true);
    expect(validateMessage(" ").ok).toBe(false);
    expect(validateMessage("x".repeat(1001)).ok).toBe(false);
  });
});

describe("reschedule validation: management must record who was told, how and when", () => {
  const parties: Party[] = [{ kind: "professional", profileId: "p1", label: "Crew One" }, { kind: "client", profileId: null, label: "the client" }];
  const now = Date.parse("2026-10-11T12:00:00Z");
  const base: RescheduleInput = {
    startDate: "2026-10-14", endDate: "2026-10-14", callTime: "10:00", finishTime: "21:00", timezone: "", reason: "Client moved the event",
    notices: [{ informed: true, method: "phone", informedAtLocal: "2026-10-11T14:30", note: "" }, { informed: false, method: "", informedAtLocal: "", note: "" }],
  };
  it("accepts a complete record; times are interpreted in the job's timezone", () => {
    const r = validateReschedule(base, parties, "Asia/Qatar", now);
    expect(r.ok).toBe(true);
    if (r.ok) {
      const n = r.value.notices[0];
      expect(n).toMatchObject({ informed: true, method: "phone", informedAtMs: Date.parse("2026-10-11T11:30:00Z") });
      expect(r.value.notices[1]).toEqual({ informed: false });
    }
  });
  it("rejects bad dates/times/timezones, a missing reason, and the wrong number of notice rows", () => {
    expect(validateReschedule({ ...base, endDate: "2026-10-13" }, parties, "Asia/Qatar", now).ok).toBe(false);
    expect(validateReschedule({ ...base, callTime: "10am" }, parties, "Asia/Qatar", now).ok).toBe(false);
    expect(validateReschedule({ ...base, timezone: "Mars/Base" }, parties, "Asia/Qatar", now).ok).toBe(false);
    expect(validateReschedule({ ...base, reason: "x" }, parties, "Asia/Qatar", now).ok).toBe(false);
    expect(validateReschedule({ ...base, notices: [base.notices[0]] }, parties, "Asia/Qatar", now).ok).toBe(false);
  });
  it("an 'informed' record needs a real method and a time that is not in the future", () => {
    expect(validateReschedule({ ...base, notices: [{ ...base.notices[0], method: "carrier pigeon" }, base.notices[1]] }, parties, "Asia/Qatar", now).ok).toBe(false);
    expect(validateReschedule({ ...base, notices: [{ ...base.notices[0], informedAtLocal: "" }, base.notices[1]] }, parties, "Asia/Qatar", now).ok).toBe(false);
    expect(validateReschedule({ ...base, notices: [{ ...base.notices[0], informedAtLocal: "2026-10-12T09:00" }, base.notices[1]] }, parties, "Asia/Qatar", now).ok).toBe(false);
    expect(validateReschedule(base, parties, null, now).ok).toBe(false); // no timezone to interpret the time in
  });
});

import { enrolmentBlocker as enrolBlock } from "./readinessRules";
describe("enrolment is refused once the work has been reported", () => {
  const base = { isTest: false, requestStatus: "confirmed", slotStatus: "assigned", slotAccepted: true, engagementStatus: "engagement_active", alreadyEnrolled: false, startMs: 2_000_000, nowMs: 1_000_000 };
  it("a future-dated assignment can be enrolled, but not after the professional's job report", () => {
    expect(enrolBlock(base)).toBeNull();
    expect(enrolBlock({ ...base, jobReportSubmitted: false })).toBeNull();
    expect(enrolBlock({ ...base, jobReportSubmitted: true })).toMatch(/job report has already been submitted/);
  });
});
