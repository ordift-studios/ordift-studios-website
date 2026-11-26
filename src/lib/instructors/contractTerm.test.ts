import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => { throw new Error("not used by the pure tests"); } }));
vi.mock("@/lib/organization/engagementTypeLookup", () => ({ getEngagementTypeSlug: async () => "instructor" }));

import { assignmentAuthorization, evaluateToday, evaluateWindow, localCalendarDate, parseAgreementTerm, timezoneForJurisdiction } from "./contractTerm";

const ghana = (over: Record<string, unknown> = {}, jurisdiction: string | null = "ghana") =>
  parseAgreementTerm({ agreementId: "a1", reference: "REF-1", status: "fully_executed", jurisdiction, scheduleA: { agreementEffectiveDate: "2027-01-01", masterTerm: "DATE RANGE: 2027-01-01 to 2027-12-31", ...over } });

describe("parseAgreementTerm", () => {
  it("reads the dates from the agreement's own Schedule A and the jurisdiction's time basis (nothing global)", () => {
    const t = ghana();
    expect(t).toMatchObject({ effectiveDate: "2027-01-01", expiryDate: "2027-12-31", ongoing: false, timezone: "Africa/Accra", problems: [] });
    expect(parseAgreementTerm({ agreementId: "b", reference: "R2", status: "active", jurisdiction: "qatar", scheduleA: { agreementEffectiveDate: "2028-03-05", masterTerm: "DATE RANGE: 2028-03-05 to 2028-06-30" } })).toMatchObject({ effectiveDate: "2028-03-05", expiryDate: "2028-06-30", timezone: "Asia/Qatar" });
  });
  it("ONGOING has no fixed expiry", () => expect(ghana({ masterTerm: "ONGOING" })).toMatchObject({ ongoing: true, expiryDate: null, problems: [] }));
  it("fails closed when the term cannot be read", () => {
    expect(ghana({ agreementEffectiveDate: "next January" }).problems.join(" ")).toMatch(/effective date/);
    expect(ghana({ masterTerm: "ONE YEAR" }).problems.join(" ")).toMatch(/expiry date cannot be read/);
    expect(ghana({ agreementEffectiveDate: "2027-06-01", masterTerm: "DATE RANGE: 2027-12-31 to 2027-01-01" }).problems.join(" ")).toMatch(/before its effective date/);
    expect(ghana({}, "atlantis").problems.join(" ")).toMatch(/jurisdiction/);
    expect(timezoneForJurisdiction(null)).toBeNull();
  });
});

describe("evaluateWindow - boundary conditions (effective date and expiry date are both inclusive)", () => {
  const t = ghana();
  const cases: [string, string, string | null, string][] = [
    ["before commencement", "2026-12-31", null, "before_term"],
    ["a window ending the day before commencement", "2026-12-30", "2026-12-31", "before_term"],
    ["on the effective date", "2027-01-01", null, "inside"],
    ["a window ending on the effective date's first day", "2027-01-01", "2027-01-01", "inside"],
    ["inside the term", "2027-06-15", "2027-06-16", "inside"],
    ["on the expiry date", "2027-12-31", null, "inside"],
    ["the day after expiry", "2028-01-01", null, "after_term"],
    ["after expiry", "2028-03-01", "2028-03-02", "after_term"],
    ["spanning the effective date", "2026-12-31", "2027-01-02", "spans_effective_date"],
    ["spanning the expiry date", "2027-12-30", "2028-01-02", "spans_expiry_date"],
    ["a single-day workshop on the last day", "2027-12-31", "2027-12-31", "inside"],
  ];
  for (const [name, s, e, state] of cases) it(name, () => expect(evaluateWindow(t, s, e).state).toBe(state));
  it("an unreadable term is never 'inside'", () => expect(evaluateWindow(ghana({ masterTerm: "???" }), "2027-06-01").state).toBe("term_unknown"));
  it("ONGOING accepts any date on or after the effective date", () => {
    const o = ghana({ masterTerm: "ONGOING" });
    expect(evaluateWindow(o, "2040-01-01").state).toBe("inside");
    expect(evaluateWindow(o, "2026-12-31").state).toBe("before_term");
  });
});

describe("evaluateToday / localCalendarDate use the jurisdiction's time basis", () => {
  const t = ghana();
  it("is not started before, in term on, and expired after", () => {
    expect(evaluateToday(t, new Date("2026-12-31T23:59:59Z"))).toBe("not_started");
    expect(evaluateToday(t, new Date("2027-01-01T00:00:00Z"))).toBe("in_term");
    expect(evaluateToday(t, new Date("2027-12-31T23:59:59Z"))).toBe("in_term");
    expect(evaluateToday(t, new Date("2028-01-01T00:00:00Z"))).toBe("expired");
  });
  it("a Qatar agreement (UTC+3) switches day three hours earlier than UTC", () => {
    const q = parseAgreementTerm({ agreementId: "q", reference: "Q", status: "fully_executed", jurisdiction: "qatar", scheduleA: { agreementEffectiveDate: "2027-01-01", masterTerm: "ONGOING" } });
    expect(evaluateToday(q, new Date("2026-12-31T20:59:59Z"))).toBe("not_started");
    expect(evaluateToday(q, new Date("2026-12-31T21:00:00Z"))).toBe("in_term");
    expect(localCalendarDate("2026-12-31T21:00:00Z", "Asia/Qatar")).toBe("2027-01-01");
  });
});

describe("assignmentAuthorization - conditional planning versus active authorization", () => {
  const t = ghana();
  const before = new Date("2026-11-19T10:00:00Z");
  const during = new Date("2027-02-01T10:00:00Z");
  it("an approved future workshop inside the term is PLANNING ONLY before the effective date", () => {
    const a = assignmentAuthorization(t, "2027-03-10", "2027-03-11", before);
    expect(a.state).toBe("planning_only");
    expect(a.message).toMatch(/No advertising, registration or delivery/);
  });
  it("the same workshop is AUTHORIZED once the term is in force", () => expect(assignmentAuthorization(t, "2027-03-10", "2027-03-11", during).state).toBe("authorized"));
  it("a workshop outside the term is never authorised", () => {
    expect(assignmentAuthorization(t, "2026-12-20", null, before).state).toBe("outside_term");
    expect(assignmentAuthorization(t, "2028-01-05", null, during).state).toBe("outside_term");
  });
  it("after expiry nothing is authorised, and no term means unknown", () => {
    expect(assignmentAuthorization(t, "2027-12-30", "2027-12-31", new Date("2028-01-02T00:00:00Z")).state).toBe("outside_term");
    expect(assignmentAuthorization(null, "2027-03-10", null, during).state).toBe("term_unknown");
  });
});
