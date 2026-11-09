import { beforeEach, describe, expect, it, vi } from "vitest";
import { crewOverlapMessage } from "@/lib/crewSupport/conflicts";

type Row = Record<string, unknown>;
const h = vi.hoisted(() => ({ tables: {} as Record<string, Row[]>, errorFor: null as null | string, calls: 0 }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ from: (table: string) => {
  h.calls++;
  const f: ((r: Row) => boolean)[] = [];
  const q: Record<string, unknown> = {
    select: () => q, neq: (c: string, v: unknown) => { f.push((r) => r[c] !== v); return q; }, in: (c: string, vs: unknown[]) => { f.push((r) => vs.includes(r[c])); return q; },
    then: (res: (v: unknown) => unknown) => Promise.resolve(h.errorFor === table ? { data: null, error: { code: "42P01", message: `relation "${table}" does not exist` } } : { data: (h.tables[table] ?? []).filter((r) => f.every((p) => p(r))), error: null }).then(res),
  };
  return q;
} }) }));

import { loadConfirmedBookingsForPeople } from "./crewDirection";
const ON: Record<string, string | undefined> = { BOOKING_CONFIRMATION_ENABLED: "true" };
beforeEach(() => {
  h.errorFor = null; h.calls = 0;
  h.tables = {
    enquiry_booking_confirmations: [
      { id: "c1", enquiry_id: "e1", version: 1, kind: "confirmed", assigned_profile_id: "p1" },
      { id: "c2", enquiry_id: "e2", version: 1, kind: "confirmed", assigned_profile_id: "p1" }, { id: "c2b", enquiry_id: "e2", version: 2, kind: "changed", assigned_profile_id: "p2" },    // e2 was changed to another person
      { id: "c3", enquiry_id: "e3", version: 1, kind: "confirmed", assigned_profile_id: "p1" }, { id: "c3b", enquiry_id: "e3", version: 2, kind: "cancelled", assigned_profile_id: "p1" },  // e3 was cancelled
    ],
    enquiry_booking_segments: [{ confirmation_id: "c1", starts_at: "2027-01-12T06:00:00Z", ends_at: "2027-01-12T09:00:00Z", timezone: "Asia/Qatar" }, { confirmation_id: "c2b", starts_at: "2027-01-13T06:00:00Z", ends_at: "2027-01-13T09:00:00Z", timezone: "Asia/Qatar" }],
    enquiries: [{ id: "e1", reference_number: "ENQ-1" }, { id: "e2", reference_number: "ENQ-2" }, { id: "e3", reference_number: "ENQ-3" }],
  };
});

describe("loadConfirmedBookingsForPeople (the booking -> Crew Support direction)", () => {
  it("reads NOTHING while the booking switch is off, or with nobody to check", async () => {
    expect(await loadConfirmedBookingsForPeople(["p1"], {})).toEqual([]); expect(await loadConfirmedBookingsForPeople([], ON)).toEqual([]); expect(h.calls).toBe(0);
  });
  it("returns only a person's CURRENT confirmed bookings: not a changed-away one, not a cancelled one", async () => {
    const r = await loadConfirmedBookingsForPeople(["p1"], ON);
    expect(r.map((b) => `${b.reference}:${b.assigneeId}`)).toEqual(["ENQ-1:p1"]); expect(r[0].segments).toEqual([{ startsAt: "2027-01-12T06:00:00Z", endsAt: "2027-01-12T09:00:00Z", timezone: "Asia/Qatar" }]);
    expect((await loadConfirmedBookingsForPeople(["p2"], ON)).map((b) => b.reference)).toEqual(["ENQ-2"]);                  // the change to p2 is the live one
  });
  it("is inert where the booking tables do not exist (Production today): no booking, no failure", async () => {
    h.errorFor = "enquiry_booking_confirmations"; expect(await loadConfirmedBookingsForPeople(["p1"], ON)).toEqual([]);
  });
  it("any other database error fails closed (it throws) instead of pretending nobody is booked", async () => {
    h.errorFor = "enquiry_booking_segments"; h.tables.enquiry_booking_segments = [];
    // a different error code on the segments read
    vi.doMock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ from: () => ({ select: () => ({ in: () => ({ neq: () => Promise.resolve({ data: null, error: { code: "XX000", message: "boom" } }) }) }) }) }) }));
    vi.resetModules();
    const { loadConfirmedBookingsForPeople: fresh } = await import("./crewDirection");
    await expect(fresh(["p1"], ON)).rejects.toThrow("boom");
    vi.doUnmock("@/lib/supabase/admin");
  });
});

describe("crewOverlapMessage", () => {
  it("turns the database refusal into a plain message with no override, and ignores every other message", () => {
    const m = crewOverlapMessage("ordift:crew_confirm_overlaps_booking: ENQ-BK-901");
    expect(m).toContain("ENQ-BK-901"); expect(m).toMatch(/Reassign the person or change the schedule: a justification cannot clear it/);
    expect(crewOverlapMessage("duplicate key value")).toBeNull(); expect(crewOverlapMessage(null)).toBeNull();
  });
});
