import { describe, expect, it } from "vitest";
import { assessAvailability, checkVerification, forCheck, NOT_A_RESERVATION, projectConflicts, type AvailabilityInput } from "./availability";
import type { Conflict, Segment } from "./rules";

const seg: Segment = { startsAt: "2027-01-10T07:00:00Z", endsAt: "2027-01-10T08:00:00Z", timezone: "Asia/Qatar", kind: "on_site", location: "Doha" };
const firm: Conflict = { key: "booking:1", kind: "booking", firm: true, overridable: false, label: "ENQ-X-1", from: "2027-01-10T06:00:00Z", to: "2027-01-10T09:00:00Z" };
const soft: Conflict = { key: "crew_slot:1", kind: "crew_slot", firm: false, overridable: true, label: "CSR-1", from: "2027-01-10", to: "2027-01-10" };
const ver = { method: "call", reference: "Called Kofi, 9 Jan, he is free", verifiedOn: "2027-01-09", confirmedWithPerson: true };
const input = (o: Partial<AvailabilityInput> = {}): AvailabilityInput => ({ assigneeId: "p1", segments: [seg], conflicts: [], verification: null, today: "2027-01-10", ...o });

describe("assessAvailability: the four states", () => {
  it("UNVERIFIED when the time is invalid, no person is chosen, or the schedule could not be read (never assumed free)", () => {
    expect(assessAvailability(input({ segments: [] })).state).toBe("unverified");
    expect(assessAvailability(input({ segments: [{ ...seg, endsAt: seg.startsAt }] })).state).toBe("unverified");
    expect(assessAvailability(input({ assigneeId: null })).state).toBe("unverified");
    const r = assessAvailability(input({ conflicts: null, verification: ver })); expect(r.state).toBe("unverified"); expect(r.reasons.join(" ")).toMatch(/Nothing is assumed free/);
  });
  it("CONFLICTING on any firm conflict, even with a direct check recorded (a confirmed overlap is never cleared by a check; approved leave only at confirmation)", () => {
    const r = assessAvailability(input({ conflicts: [firm], verification: ver }));
    expect(r.state).toBe("conflicting"); expect(r.firm).toHaveLength(1); expect(r.reasons.join(" ")).toMatch(/cannot be cleared by a reason or a direct check: change the person or the time/);
    expect(assessAvailability(input({ conflicts: [{ ...firm, kind: "leave", overridable: false, label: "approved leave" }] })).reasons.join(" ")).toMatch(/leave is changed only through the leave workflow/);
    expect(assessAvailability(input({ conflicts: [firm, soft] })).state).toBe("conflicting");
  });
  it("TENTATIVELY available when nothing firm overlaps but the person was not asked directly, the check was not accepted, or a possible clash exists", () => {
    expect(assessAvailability(input()).state).toBe("tentative");
    expect(assessAvailability(input({ verification: { ...ver, confirmedWithPerson: false } })).state).toBe("tentative");
    expect(assessAvailability(input({ verification: { ...ver, reference: "short" } })).reasons.join(" ")).toMatch(/not accepted/);
    const s = assessAvailability(input({ conflicts: [soft], verification: ver })); expect(s.state).toBe("tentative"); expect(s.soft).toHaveLength(1); expect(s.reasons.join(" ")).toMatch(/possible clash/);
  });
  it("AVAILABLE only with no conflicts of any kind AND an accepted direct check with the assigned person", () => {
    const r = assessAvailability(input({ verification: ver })); expect(r.state).toBe("available"); expect(r.verificationAccepted).toBe(true);
  });
  it("every outcome carries the not-a-reservation flag", () => {
    for (const o of [input(), input({ conflicts: [firm] }), input({ assigneeId: null }), input({ verification: ver })]) expect(assessAvailability(o).notReservation).toBe(true);
    expect(NOT_A_RESERVATION).toMatch(/not a reservation or a confirmed booking/); expect(NOT_A_RESERVATION).toMatch(/repeated when a booking is confirmed/);
  });
});

describe("checkVerification", () => {
  it("needs a method, a reference, a date that is not in the future or older than 7 days, and the confirming tick; nothing offered is not an error", () => {
    expect(checkVerification(null, "2027-01-10")).toEqual({ ok: false, problems: [] });
    expect(checkVerification({ method: "", reference: "", verifiedOn: "", confirmedWithPerson: false }, "2027-01-10").problems).toEqual([]);
    expect(checkVerification(ver, "2027-01-10").ok).toBe(true);
    expect(checkVerification({ ...ver, verifiedOn: "2027-01-11" }, "2027-01-10").problems.join()).toMatch(/future/);
    expect(checkVerification({ ...ver, verifiedOn: "2027-01-01" }, "2027-01-10").problems.join()).toMatch(/older than 7 days/);
    expect(checkVerification({ ...ver, method: "telepathy" }, "2027-01-10").problems.join()).toMatch(/how you checked/);
  });
});

describe("projectConflicts: what staff may see", () => {
  it("hides booking and request references from staff, shows them to admins, and always says what and when", () => {
    expect(projectConflicts([firm, soft], false).map((c) => c.label)).toEqual(["a confirmed booking", "a Crew Support assignment"]);
    expect(projectConflicts([firm], true)[0].label).toBe("ENQ-X-1");
    expect(JSON.stringify(projectConflicts([firm], false))).not.toMatch(/ENQ-X-1/);
    expect(projectConflicts([{ ...firm, kind: "leave", label: "approved leave" }], false)[0].label).toBe("approved leave");
  });
});

describe("forCheck", () => {
  it("lets a check proceed without a place (placeholder for the check only), and leaves a given place alone", () => {
    expect(assessAvailability(input({ segments: [{ ...seg, location: null }] })).state).toBe("unverified");           // the booking rules want a place...
    expect(assessAvailability(input({ segments: forCheck([{ ...seg, location: null }]) })).state).toBe("tentative");   // ...a check does not
    expect(forCheck([{ ...seg, location: "Doha" }])[0].location).toBe("Doha");
    expect(forCheck([{ ...seg, kind: "online", location: null, platform: null }])[0].platform).toBe("To be confirmed");
  });
});
