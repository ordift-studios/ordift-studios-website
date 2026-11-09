import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Conflict, Segment } from "./rules";

type Row = Record<string, unknown>;
const h = vi.hoisted(() => ({ user: null as null | { id: string }, staff: true, admin: false, sa: false, tables: {} as Record<string, Row[]>, failAudit: false, conflicts: [] as Conflict[] | null, previewCalls: 0 as number,
  pool: [{ profileId: "p1", name: "Kofi", memberNumber: "INT0003" }] }));
vi.mock("@/lib/portal/roles", () => ({ getCurrentUser: async () => h.user, isStaffOrAdmin: () => h.staff, hasRole: (_u: unknown, r: string) => r === "admin" && h.admin, isSuperAdmin: () => h.sa }));
vi.mock("@/lib/crewSupport/candidates", () => ({ listOverridePool: async () => h.pool }));
vi.mock("./service", () => ({ previewConflicts: async () => { h.previewCalls++; return h.conflicts; } }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ from: (table: string) => {
  const f: ((r: Row) => boolean)[] = []; let mode = "select"; let payload: Row = {};
  const rows = () => (h.tables[table] ??= []);
  const q: Record<string, unknown> = {
    select: () => q, eq: (c: string, v: unknown) => { f.push((r) => r[c] === v); return q; }, order: () => q, limit: () => q,
    insert: (v: Row) => { if (table === "activity_log" && h.failAudit) return Promise.resolve({ error: { message: "boom" } }); rows().push({ created_at: new Date().toISOString(), ...v }); return Promise.resolve({ error: null }); },
    maybeSingle: async () => ({ data: rows().filter((r) => f.every((p) => p(r))).at(-1) ?? null, error: null }), then: undefined,
  };
  void mode; void payload; return q;
} }) }));

import { loadAvailabilityPanel, loadLatestAvailabilityCheck, runAvailabilityCheck } from "./availabilityService";

const ON: Record<string, string | undefined> = { BOOKING_CONFIRMATION_ENABLED: "true" };
const seg: Segment = { startsAt: "2027-01-10T07:00:00Z", endsAt: "2027-01-10T08:00:00Z", timezone: "Asia/Qatar", kind: "on_site", location: "Doha" };
const firm: Conflict = { key: "booking:1", kind: "booking", firm: true, overridable: false, label: "ENQ-X-1", from: "2027-01-10T06:00:00Z", to: "2027-01-10T09:00:00Z" };
const run = (o: Record<string, unknown> = {}, env = ON) => runAvailabilityCheck({ actorUserId: "s1", enquiryId: "e1", assigneeId: "p1", segments: [seg], verification: null, ...o } as Parameters<typeof runAvailabilityCheck>[0], env);
beforeEach(() => {
  h.user = { id: "s1" }; h.staff = true; h.admin = false; h.sa = false; h.failAudit = false; h.conflicts = []; h.previewCalls = 0;
  h.tables = { enquiries: [{ id: "e1", crm_stage: "new_lead" }, { id: "e2", crm_stage: "booked" }, { id: "e3", crm_stage: "closed" }], activity_log: [], profiles: [{ id: "s1", member_number: "INT0007" }] };
});

describe("runAvailabilityCheck", () => {
  it("is off while the booking flag is off: nothing is read or written", async () => {
    const r = await run({}, {}); expect(r.ok).toBe(false); expect(h.previewCalls).toBe(0); expect(h.tables.activity_log).toEqual([]);
  });
  it("is for staff and admins only (not clients or anonymous), and the actor must be the signed-in user; none of this needs Super Admin", async () => {
    h.user = null; expect((await run()).ok).toBe(false);
    h.user = { id: "s1" }; h.staff = false; expect((await run()).ok).toBe(false);
    h.staff = true; expect((await run({ actorUserId: "other" })).ok).toBe(false);
    h.sa = false; h.admin = false; expect((await run()).ok).toBe(true);                                    // plain staff
    expect(h.tables.activity_log.length).toBe(1);
  });
  it("refuses a missing, closed or already booked enquiry and a person who is not an active team member", async () => {
    expect((await run({ enquiryId: "nope" })).ok).toBe(false);
    expect((await run({ enquiryId: "e3" })) as { error: string }).toMatchObject({ error: "This enquiry is closed." });
    expect((await run({ enquiryId: "e2" }) as { error: string }).error).toMatch(/already booked/);
    expect((await run({ assigneeId: "stranger" }) as { error: string }).error).toMatch(/active team members/);
    expect(h.tables.activity_log).toEqual([]);
  });
  it("returns each state, always flagged as not a reservation, and records the check without creating any booking or hold", async () => {
    const tentative = await run(); expect(tentative).toMatchObject({ ok: true, state: "tentative", notReservation: true });
    const available = await run({ verification: { method: "call", reference: "Called Kofi today, he is free", verifiedOn: new Date().toISOString().slice(0, 10), confirmedWithPerson: true } }); expect(available).toMatchObject({ state: "available", verificationAccepted: true });
    h.conflicts = [firm]; expect(await run()).toMatchObject({ state: "conflicting" });
    h.conflicts = null; expect(await run()).toMatchObject({ state: "unverified" });
    expect(await run({ assigneeId: null })).toMatchObject({ state: "unverified" });
    expect(h.tables.activity_log.every((a) => a.action === "enquiry.availability_checked" && (a.metadata as { notReservation: boolean }).notReservation === true)).toBe(true);
    expect(Object.keys(h.tables).sort()).toEqual(["activity_log", "enquiries", "profiles"]);                // no booking, hold or other table was written
  });
  it("shows staff a generic description of a conflict and admins the reference", async () => {
    h.conflicts = [firm];
    const staff = await run(); expect(JSON.stringify(staff)).not.toMatch(/ENQ-X-1/); expect(staff.ok && staff.conflicts[0].label).toBe("a confirmed booking");
    h.admin = true; const adm = await run(); expect(adm.ok && adm.conflicts[0].label).toBe("ENQ-X-1");
  });
  it("shows nothing when the record cannot be written (fail closed)", async () => { h.failAudit = true; const r = await run(); expect(r.ok).toBe(false); expect(JSON.stringify(r)).not.toMatch(/Tentatively/); });
  it("records the verification only when it was accepted", async () => {
    await run({ verification: { method: "call", reference: "short", verifiedOn: "2027-01-01", confirmedWithPerson: true } });
    expect((h.tables.activity_log.at(-1)!.metadata as { verification: unknown }).verification).toBeNull();
  });
  it("re-reads the schedule on every call (a result is never cached or carried into a booking)", async () => { await run(); await run(); expect(h.previewCalls).toBe(2); });
});

describe("loadLatestAvailabilityCheck and loadAvailabilityPanel", () => {
  it("returns the latest check with the checker's member number (never a name) and marks an old one stale", async () => {
    await run();
    const l = await loadLatestAvailabilityCheck("e1"); expect(l).toMatchObject({ state: "tentative", label: "Tentatively available", byLabel: "member INT0007", stale: false });
    h.tables.activity_log[0].created_at = new Date(Date.now() - 8 * 86_400_000).toISOString();
    expect((await loadLatestAvailabilityCheck("e1"))?.stale).toBe(true);
    expect(await loadLatestAvailabilityCheck("e2")).toBeNull();
  });
  it("renders nothing (and reads nothing) with the flag off, for non-staff, and for a booked or closed enquiry", async () => {
    expect(await loadAvailabilityPanel("e1", {})).toBeNull();
    h.staff = false; expect(await loadAvailabilityPanel("e1", ON)).toBeNull(); h.staff = true;
    expect(await loadAvailabilityPanel("e2", ON)).toBeNull(); expect(await loadAvailabilityPanel("e3", ON)).toBeNull();
    expect((await loadAvailabilityPanel("e1", ON))?.people).toEqual([{ id: "p1", name: "Kofi" }]);
  });
});
