import { describe, expect, it } from "vitest";
import { bookingOverlapsSchedule, isPrecise, preciseWindows, schedulesOverlap, type Schedule } from "./schedulePrecision";

const QA = "Asia/Qatar";
const crew = (o: Partial<Schedule> = {}): Schedule => ({ start: "2027-01-12", end: "2027-01-12", callTime: "09:00", finishTime: "12:00", timezone: QA, ...o });
// Doha is UTC+3: 09:00-12:00 Doha = 06:00-09:00Z
const seg = (fromUtc: string, toUtc: string, timezone = QA) => ({ startsAt: `2027-01-12T${fromUtc}:00Z`, endsAt: `2027-01-12T${toUtc}:00Z`, timezone });

describe("when a schedule is precise, and when it is conservative", () => {
  it("is precise only with readable call and finish times (finish after call), a known timezone and a sane range", () => {
    expect(isPrecise(crew())).toBe(true);
    expect(isPrecise(crew({ callTime: null }))).toBe(false); expect(isPrecise(crew({ finishTime: "" }))).toBe(false);
    expect(isPrecise(crew({ callTime: "early morning" }))).toBe(false);                      // free text we cannot read is never guessed
    expect(isPrecise(crew({ callTime: "18:00", finishTime: "02:00" }))).toBe(false);          // overnight: conservative
    expect(isPrecise(crew({ finishTime: "09:00" }))).toBe(false);
    expect(isPrecise(crew({ timezone: null }))).toBe(false); expect(isPrecise(crew({ timezone: "Mars/Base" }))).toBe(false);
    expect(isPrecise(crew({ start: "2027-01-12", end: "2028-06-30" }))).toBe(false); expect(isPrecise(crew({ start: "2027-01-13", end: "2027-01-12" }))).toBe(false);
    expect(isPrecise({ start: "2027-01-12", end: "2027-01-12" })).toBe(false);                // a date-only (historical) assignment keeps its meaning
  });
  it("reads 12-hour times and gives one window per day", () => {
    expect(preciseWindows(crew({ callTime: "9am", finishTime: "5:30 pm", start: "2027-01-12", end: "2027-01-14" }))).toHaveLength(3);
    expect(preciseWindows(crew({ callTime: "9am", finishTime: "5:30 pm" }))![0]).toEqual([Date.parse("2027-01-12T06:00:00Z"), Date.parse("2027-01-12T14:30:00Z")]);
  });
});

describe("a confirmed booking against an assignment", () => {
  it("same-day NON-overlapping: a precise assignment and a booking at different hours do not conflict", () => {
    expect(bookingOverlapsSchedule(seg("10:00", "12:00"), crew())).toBe(false);              // 13:00-15:00 Doha
    expect(bookingOverlapsSchedule(seg("03:00", "05:00"), crew())).toBe(false);              // 06:00-08:00 Doha
  });
  it("PARTIAL overlap conflicts", () => { expect(bookingOverlapsSchedule(seg("08:00", "10:00"), crew())).toBe(true); expect(bookingOverlapsSchedule(seg("05:00", "07:00"), crew())).toBe(true); });
  it("ADJACENT assignments do not conflict (the booking starts exactly when the assignment ends, and the reverse)", () => {
    expect(bookingOverlapsSchedule(seg("09:00", "11:00"), crew())).toBe(false); expect(bookingOverlapsSchedule(seg("04:00", "06:00"), crew())).toBe(false);
  });
  it("a booking inside or containing the assignment conflicts", () => { expect(bookingOverlapsSchedule(seg("07:00", "08:00"), crew())).toBe(true); expect(bookingOverlapsSchedule(seg("00:00", "23:00"), crew())).toBe(true); });
  it("MULTI-DAY: the daily window applies on each date, so an evening booking on a middle day is free and a daytime one is not", () => {
    const three = crew({ start: "2027-01-12", end: "2027-01-14", callTime: "09:00", finishTime: "17:00" });
    expect(bookingOverlapsSchedule({ startsAt: "2027-01-13T15:00:00Z", endsAt: "2027-01-13T17:00:00Z", timezone: QA }, three)).toBe(false);   // 18:00-20:00 Doha on the 13th
    expect(bookingOverlapsSchedule({ startsAt: "2027-01-13T11:00:00Z", endsAt: "2027-01-13T13:00:00Z", timezone: QA }, three)).toBe(true);    // 14:00-16:00 Doha on the 13th
    expect(bookingOverlapsSchedule({ startsAt: "2027-01-15T06:00:00Z", endsAt: "2027-01-15T08:00:00Z", timezone: QA }, three)).toBe(false);   // the day after
  });
  it("CONSERVATIVE: a date-only assignment, unreadable times, an overnight window or no timezone block the WHOLE calendar date", () => {
    for (const s of [crew({ callTime: null, finishTime: null }), crew({ callTime: "morning" }), crew({ callTime: "18:00", finishTime: "02:00" }), crew({ timezone: null })])
      expect(bookingOverlapsSchedule(seg("14:00", "16:00"), s), JSON.stringify(s)).toBe(true);                      // 17:00-19:00 Doha, same calendar date
    expect(bookingOverlapsSchedule({ startsAt: "2027-01-13T06:00:00Z", endsAt: "2027-01-13T08:00:00Z", timezone: QA }, crew({ callTime: null, finishTime: null }))).toBe(false);   // another date
  });
  it("daylight-saving is respected (London, the clocks go forward on 28 March 2027)", () => {
    const lon = crew({ start: "2027-03-28", end: "2027-03-28", callTime: "09:00", finishTime: "10:00", timezone: "Europe/London" });   // BST: 08:00-09:00Z
    expect(bookingOverlapsSchedule({ startsAt: "2027-03-28T08:30:00Z", endsAt: "2027-03-28T09:30:00Z", timezone: "Europe/London" }, lon)).toBe(true);
    expect(bookingOverlapsSchedule({ startsAt: "2027-03-28T09:00:00Z", endsAt: "2027-03-28T10:00:00Z", timezone: "Europe/London" }, lon)).toBe(false);
  });
});

describe("an assignment against another assignment (changes to existing schedules use the same rule)", () => {
  it("two precise assignments on the same day conflict only if their hours overlap", () => {
    expect(schedulesOverlap(crew(), crew({ callTime: "13:00", finishTime: "16:00" }))).toBe(false);
    expect(schedulesOverlap(crew(), crew({ callTime: "11:00", finishTime: "14:00" }))).toBe(true);
    expect(schedulesOverlap(crew(), crew({ callTime: "12:00", finishTime: "15:00" }))).toBe(false);                   // adjacent
  });
  it("if either one is date-only the whole date conflicts (nothing is inferred)", () => {
    expect(schedulesOverlap(crew(), crew({ callTime: null, finishTime: null }))).toBe(true);
    expect(schedulesOverlap(crew({ callTime: null, finishTime: null }), crew({ start: "2027-01-13", end: "2027-01-13" }))).toBe(false);
  });
  it("multi-day ranges overlap on shared dates only", () => {
    expect(schedulesOverlap(crew({ start: "2027-01-10", end: "2027-01-12" }), crew({ start: "2027-01-12", end: "2027-01-14", callTime: "13:00", finishTime: "15:00" }))).toBe(false);
    expect(schedulesOverlap(crew({ start: "2027-01-10", end: "2027-01-12", callTime: null }), crew({ start: "2027-01-12", end: "2027-01-14" }))).toBe(true);
  });
});

import { classifyConflicts, firmConflicts } from "./conflicts";
import type { ConfirmedBooking } from "@/lib/bookings/crewDirection";

describe("Crew Support conflict classification uses precise schedules and confirmed bookings", () => {
  const slot = (id: string, o: Record<string, unknown> = {}) => ({ assignee_profile_id: id, request: { id: "r-other", status: "confirmed", start_date: "2027-01-12", end_date: "2027-01-12", reference_number: "CSR-1", is_test: false, call_time: "13:00", finish_time: "16:00", event_timezone: QA, payment_country: null, ...o } });
  const run = (o: Record<string, unknown>) => classifyConflicts({ slots: [], leave: [], range: { start: "2027-01-12", end: "2027-01-12", callTime: "09:00", finishTime: "12:00", timezone: QA }, excludeRequestId: "r-me", currentIsTest: false, ...o } as never);
  const booking = (a: string, b: string): ConfirmedBooking => ({ id: "b1", reference: "ENQ-9", assigneeId: "p1", enquiryId: "e9", segments: [{ startsAt: `2027-01-12T${a}:00Z`, endsAt: `2027-01-12T${b}:00Z`, timezone: QA }] });
  it("same-day assignments with non-overlapping hours no longer conflict; overlapping hours do; date-only ones conflict conservatively", () => {
    expect(run({ slots: [slot("p1")] }).get("p1")).toBeUndefined();
    expect(run({ slots: [slot("p1", { call_time: "11:00", finish_time: "14:00" })] }).get("p1")?.[0]).toMatchObject({ kind: "crew_slot", firm: true });
    expect(run({ slots: [slot("p1", { call_time: null, finish_time: null })] }).get("p1")).toHaveLength(1);
    expect(run({ slots: [slot("p1", { call_time: "12:00", finish_time: "15:00" })] }).get("p1")).toBeUndefined();            // adjacent
  });
  it("a confirmed ordinary booking is a firm conflict for the same person only, by the same precision rules", () => {
    expect(firmConflicts(run({ bookings: [booking("08:00", "10:00")] }).get("p1") ?? [])).toHaveLength(1);
    expect(run({ bookings: [booking("08:00", "10:00")] }).get("p1")?.[0]).toMatchObject({ kind: "booking", firm: true, label: expect.stringContaining("ENQ-9") });
    expect(run({ bookings: [booking("10:00", "12:00")] }).get("p1")).toBeUndefined();                                       // 13:00-15:00 Doha, after the 09:00-12:00 assignment
    expect(run({ bookings: [booking("09:00", "11:00")] }).get("p1")).toBeUndefined();                                       // starts exactly when it ends
    expect(run({ bookings: [booking("14:00", "16:00")], range: { start: "2027-01-12", end: "2027-01-12" } }).get("p1")).toHaveLength(1);   // my assignment is date-only: the whole date is taken
  });
  it("approved leave stays a firm conflict; a soft (not yet confirmed) slot never blocks", () => {
    expect(run({ leave: [{ profile_id: "p1", start_date: "2027-01-10", end_date: "2027-01-13" }] }).get("p1")?.[0]).toMatchObject({ kind: "leave", firm: true });
    expect(firmConflicts(run({ slots: [slot("p1", { status: "quoted", call_time: "10:00", finish_time: "11:00" })] }).get("p1") ?? [])).toHaveLength(0);
  });
});

describe("while the booking switch is off, Crew Support conflicts are judged exactly as before (whole dates)", () => {
  const slot = { assignee_profile_id: "p1", request: { id: "r-other", status: "confirmed", start_date: "2027-01-12", end_date: "2027-01-12", reference_number: "CSR-1", is_test: false, call_time: "13:00", finish_time: "16:00", event_timezone: QA, payment_country: null } };
  const range = { start: "2027-01-12", end: "2027-01-12", callTime: "09:00", finishTime: "12:00", timezone: QA };
  it("same-day, non-overlapping hours still conflict when precision is off, and do not when it is on", () => {
    expect(classifyConflicts({ slots: [slot], leave: [], range, excludeRequestId: "r-me", currentIsTest: false, precise: false } as never).get("p1")).toHaveLength(1);
    expect(classifyConflicts({ slots: [slot], leave: [], range, excludeRequestId: "r-me", currentIsTest: false, precise: true } as never).get("p1")).toBeUndefined();
  });
});
