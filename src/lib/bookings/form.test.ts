import { describe, expect, it } from "vitest";
import { confirmSentenceFor, isoToZonedLocal, parseBookingForm, sentenceMatches, zonedToIso } from "./form";

const fd = (o: Record<string, string | string[]>) => { const m = new Map(Object.entries(o)); return { get: (k: string) => { const v = m.get(k); return v === undefined ? null : Array.isArray(v) ? v[0] : v; }, getAll: (k: string) => { const v = m.get(k); return v === undefined ? [] : Array.isArray(v) ? v : [v]; } }; };

describe("zonedToIso", () => {
  it("converts wall-clock time in a zone to the exact instant", () => {
    expect(zonedToIso("2026-12-01T09:00", "Asia/Qatar")).toBe("2026-12-01T06:00:00.000Z");     // UTC+3, no daylight saving
    expect(zonedToIso("2026-12-01T09:00", "Africa/Accra")).toBe("2026-12-01T09:00:00.000Z");   // UTC+0
    expect(zonedToIso("2026-07-01T09:00", "Europe/London")).toBe("2026-07-01T08:00:00.000Z");  // summer time
  });
  it("rejects invalid text, impossible dates and unknown zones", () => {
    expect(zonedToIso("tomorrow", "Asia/Qatar")).toBeNull(); expect(zonedToIso("2026-02-31T09:00", "Asia/Qatar")).toBeNull(); expect(zonedToIso("2026-12-01T09:00", "Mars/Olympus")).toBeNull();
  });
});

describe("isoToZonedLocal", () => {
  it("round-trips with zonedToIso (so a change form is pre-filled with what was confirmed)", () => {
    for (const [local, tz] of [["2026-12-01T09:00", "Asia/Qatar"], ["2026-07-01T09:30", "Europe/London"], ["2026-03-29T12:00", "Africa/Accra"]] as const) expect(isoToZonedLocal(zonedToIso(local, tz)!, tz)).toBe(local);
  });
});

describe("parseBookingForm", () => {
  const base = { enquiryId: "e1", quotationId: "q1", expectedVersion: "2", segCount: "2", assignedProfileId: "p1",
    seg0_start: "2026-12-01T09:00", seg0_end: "2026-12-01T13:00", seg0_tz: "Asia/Qatar", seg0_kind: "on_site", seg0_location: "Doha studio",
    seg1_start: "2026-12-02T10:00", seg1_end: "2026-12-02T11:00", seg1_tz: "Asia/Qatar", seg1_kind: "online", seg1_platform: "Zoom" };
  it("reads several sessions, in order, with their zones", () => {
    const f = parseBookingForm(fd(base)); expect(f.segments).toHaveLength(2); expect(f.segments[0]).toMatchObject({ startsAt: "2026-12-01T06:00:00.000Z", kind: "on_site", location: "Doha studio" }); expect(f.segments[1]).toMatchObject({ kind: "online", platform: "Zoom" }); expect(f.expectedVersion).toBe(2); expect(f.segmentError).toBeNull();
  });
  it("reports a bad session instead of silently dropping it", () => { expect(parseBookingForm(fd({ ...base, seg1_start: "nonsense" })).segmentError).toMatch(/Session 2/); });
  it("caps the number of sessions and resolutions", () => { expect(parseBookingForm(fd({ ...base, segCount: "9999" })).segments.length).toBeLessThanOrEqual(20); });
  it("never takes who verified from the form: only the claim, the method and the reference", () => {
    const f = parseBookingForm(fd({ ...base, resCount: "1", res0_key: "leave:1", res0_method: "call", res0_reference: "call 7 Nov", res0_on: "2026-11-07", res0_confirm: "on", res0_verifiedWithProfileId: "attacker" }));
    expect(f.resolutions[0]).toMatchObject({ key: "leave:1", kind: "availability_verified", confirmedWithPerson: true }); expect(f.resolutions[0].verifiedWithProfileId).toBeUndefined();
  });
  it("de-duplicates escalators and ignores an empty clarification", () => { const f = parseBookingForm(fd({ ...base, escalator: ["minors", "minors", "exclusivity"] })); expect(f.escalators).toEqual(["minors", "exclusivity"]); expect(f.clarification).toBeNull(); });
});

describe("typed confirmation sentence", () => {
  it("must match exactly (case and spacing aside)", () => {
    expect(confirmSentenceFor("ENQ-1", "cancel")).toBe("cancel booking ENQ-1"); expect(sentenceMatches("  Cancel booking enq-1 ", "ENQ-1", "cancel")).toBe(true); expect(sentenceMatches("confirm booking ENQ-1", "ENQ-1", "cancel")).toBe(false); expect(sentenceMatches("", "ENQ-1", "confirm")).toBe(false);
  });
});

import { parseSettingsForm } from "./form";
describe("parseSettingsForm", () => {
  it("reads thresholds and word lists", () => {
    const p = parseSettingsForm(fd({ thresholds: "QAR=3000\nghs: 10000.50", alwaysCategories: "Videography\nproduction services", escalators: "minors, Multi-Day Assignment", note: "why", status: "approved" }));
    expect(p).toMatchObject({ thresholds: { QAR: 3000, GHS: 10000.5 }, alwaysCategories: ["videography", "production_services"], escalators: ["minors", "multi_day_assignment"], status: "approved", error: null });
  });
  it("reports an unreadable or duplicated line instead of guessing", () => {
    expect(parseSettingsForm(fd({ thresholds: "three thousand" })).error).toMatch(/Could not read/); expect(parseSettingsForm(fd({ thresholds: "QAR=1\nqar=2" })).error).toMatch(/twice/);
    expect(parseSettingsForm(fd({ thresholds: "QAR=1" })).status).toBe("provisional");
  });
});
