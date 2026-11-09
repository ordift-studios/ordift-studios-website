import { beforeEach, describe, expect, it, vi } from "vitest";
const h = vi.hoisted(() => ({ superAdmin: true, rpc: vi.fn(), order: [] as string[], defer: vi.fn(), dispatch: vi.fn() }));
vi.mock("@/lib/organization/authority", () => ({ isSuperAdminId: async () => h.superAdmin }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ rpc: (...a: unknown[]) => { h.order.push(String(a[0])); return h.rpc(...a); }, from: () => ({ select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { payment_condition: "none", deposit_percent: null, payment_booking_terms: "No payment is required before the booking is confirmed." } }) }) }) }) }) }) }));
vi.mock("./notificationService", () => ({ deferClientNotice: async (...a: unknown[]) => { h.order.push("defer"); return h.defer(...a); }, dispatchBookingNotifications: async (...a: unknown[]) => { h.order.push("dispatch"); return h.dispatch(...a); } }));
import { cancelOrdinaryBooking, confirmOrdinaryBooking } from "./service";
const ON = { BOOKING_CONFIRMATION_ENABLED: "true" };
const seg = { startsAt: "2026-12-14T09:00:00Z", endsAt: "2026-12-14T12:00:00Z", timezone: "Asia/Qatar", kind: "on_site" as const, location: "Doha studio" };
const input = (o: Record<string, unknown> = {}) => ({ actorUserId: "u1", enquiryId: "e1", quotationId: "q1", segments: [seg], ...o });
beforeEach(() => { h.superAdmin = true; h.rpc.mockReset(); h.rpc.mockResolvedValue({ data: "c9", error: null }); h.order.length = 0; h.defer.mockReset(); h.defer.mockResolvedValue({ ok: true }); h.dispatch.mockReset(); });

describe("cancelOrdinaryBooking: outcome, notification and deferral", () => {
  it("the default sends no outcome argument (a database without the notices update still cancels as before), then tells the client", async () => {
    const r = await cancelOrdinaryBooking({ actorUserId: "u1", enquiryId: "e1", reason: "client asked for another date" }, ON);
    expect(r).toMatchObject({ ok: true, confirmationId: "c9", deferred: false }); const [fn, args] = h.rpc.mock.calls[0]; expect(fn).toBe("cancel_ordinary_booking"); expect("p_outcome" in args).toBe(false); expect(h.order).toEqual(["cancel_ordinary_booking", "dispatch"]);
  });
  it("a final cancellation sends the outcome; on a database that lacks it the person is told in plain words and nothing is dispatched", async () => {
    await cancelOrdinaryBooking({ actorUserId: "u1", enquiryId: "e1", reason: "client withdrew for good", outcome: "final" }, ON); expect(h.rpc.mock.calls[0][1]).toMatchObject({ p_outcome: "final" });
    h.rpc.mockResolvedValue({ data: null, error: { message: "Could not find the function public.cancel_ordinary_booking(p_actor, p_enquiry, p_outcome, p_reason) in the schema cache" } }); h.order.length = 0;
    const r = await cancelOrdinaryBooking({ actorUserId: "u1", enquiryId: "e1", reason: "client withdrew for good", outcome: "final" }, ON); expect(r).toMatchObject({ ok: false }); expect((r as { error: string }).error).toMatch(/needs the booking notices update/); expect(h.order).not.toContain("dispatch");
  });
  it("an unknown outcome is refused before the database is asked", async () => { const r = await cancelOrdinaryBooking({ actorUserId: "u1", enquiryId: "e1", reason: "client withdrew for good", outcome: "refund" as never }, ON); expect(r.ok).toBe(false); expect(h.rpc).not.toHaveBeenCalled(); });
  it("holding the client notice back is recorded BEFORE anything is sent, needs a reason, and reports itself", async () => {
    const short = await cancelOrdinaryBooking({ actorUserId: "u1", enquiryId: "e1", reason: "client asked for another date", deferClientNoticeReason: "later" }, ON); expect(short.ok).toBe(false); expect(h.rpc).not.toHaveBeenCalled();
    const r = await cancelOrdinaryBooking({ actorUserId: "u1", enquiryId: "e1", reason: "client asked for another date", deferClientNoticeReason: "phoning the client about a new date first" }, ON);
    expect(r).toMatchObject({ ok: true, deferred: true }); expect(h.order).toEqual(["cancel_ordinary_booking", "defer", "dispatch"]); expect(h.defer.mock.calls[0][0]).toMatchObject({ confirmationId: "c9", reason: "phoning the client about a new date first" });
  });
  it("if the deferral cannot be recorded the cancellation stands, the notice goes out (the safe direction) and the person is told", async () => {
    h.defer.mockResolvedValue({ ok: false, error: "The deferral could not be recorded." }); const r = await cancelOrdinaryBooking({ actorUserId: "u1", enquiryId: "e1", reason: "client asked for another date", deferClientNoticeReason: "phoning the client about a new date first" }, ON);
    expect(r).toMatchObject({ ok: true, deferred: false, deferError: "The deferral could not be recorded." }); expect(h.order).toContain("dispatch");
  });
  it("only a Super Admin", async () => { h.superAdmin = false; expect((await cancelOrdinaryBooking({ actorUserId: "u1", enquiryId: "e1", reason: "client asked for another date" }, ON)).ok).toBe(false); expect(h.rpc).not.toHaveBeenCalled(); });
});

describe("confirmOrdinaryBooking: only a CHANGE may hold the client notice back", () => {
  it("a first confirmation can never defer: the client must be told they are booked", async () => { const r = await confirmOrdinaryBooking(input({ deferClientNoticeReason: "phoning the client about the date first" }), ON); expect(r.ok).toBe(false); expect(h.rpc).not.toHaveBeenCalled(); });
  it("a change can, with a reason, recorded before sending; without one the client is told", async () => {
    expect((await confirmOrdinaryBooking(input({ supersedes: "c1", deferClientNoticeReason: "short" }), ON)).ok).toBe(false);
    const d = await confirmOrdinaryBooking(input({ supersedes: "c1", deferClientNoticeReason: "phoning the client about the new date first" }), ON); expect(d).toMatchObject({ ok: true, deferred: true }); expect(h.order).toEqual(["confirm_ordinary_booking", "defer", "dispatch"]);
    h.order.length = 0; const n = await confirmOrdinaryBooking(input({ supersedes: "c1" }), ON); expect(n).toMatchObject({ ok: true, deferred: false }); expect(h.order).toEqual(["confirm_ordinary_booking", "dispatch"]);
  });
});
