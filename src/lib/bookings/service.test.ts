import { beforeEach, describe, expect, it, vi } from "vitest";
const h = vi.hoisted(() => ({ superAdmin: true, rpc: vi.fn(), quote: { data: { payment_condition: "none", deposit_percent: null, payment_booking_terms: "No deposit is required. Payment on delivery." } as Record<string, unknown> | null } }));
vi.mock("@/lib/organization/authority", () => ({ isSuperAdminId: async () => h.superAdmin }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ rpc: h.rpc, from: () => ({ select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => h.quote }) }) }) }) }) }));
import { cancelOrdinaryBooking, confirmOrdinaryBooking, previewConflicts, recordBookingSettingsVersion } from "./service";
const ON = { BOOKING_CONFIRMATION_ENABLED: "true" };
const seg = { startsAt: "2026-12-14T09:00:00Z", endsAt: "2026-12-14T12:00:00Z", timezone: "Asia/Qatar", kind: "on_site" as const, location: "Doha studio" };
const input = () => ({ actorUserId: "u1", enquiryId: "e1", quotationId: "q1", segments: [seg] });
beforeEach(() => { h.superAdmin = true; h.rpc.mockReset(); h.quote.data = { payment_condition: "none", deposit_percent: null, payment_booking_terms: "No deposit is required. Payment on delivery." }; });

describe("with the flag off (the default) nothing happens", () => {
  it("every entry point refuses and the database is never called", async () => {
    expect(await confirmOrdinaryBooking(input(), {})).toMatchObject({ ok: false });
    expect(await cancelOrdinaryBooking({ actorUserId: "u1", enquiryId: "e1", reason: "client withdrew in writing" }, {})).toMatchObject({ ok: false });
    expect(await previewConflicts({ assigneeId: "p1", segments: [seg], excludeEnquiryId: null }, {})).toBeNull();
    expect(h.rpc).not.toHaveBeenCalled();
  });
});
describe("confirmOrdinaryBooking", () => {
  it("only a Super Admin", async () => { h.superAdmin = false; expect(await confirmOrdinaryBooking(input(), ON)).toMatchObject({ ok: false }); expect(h.rpc).not.toHaveBeenCalled(); });
  it("refuses an invalid schedule before asking the database", async () => { expect(await confirmOrdinaryBooking({ ...input(), segments: [] }, ON)).toMatchObject({ ok: false }); expect(h.rpc).not.toHaveBeenCalled(); });
  it("takes the payment condition from the quotation and sends the computed reading of its terms, never a typed-in condition", async () => {
    h.rpc.mockResolvedValue({ data: "c1", error: null });
    expect(await confirmOrdinaryBooking(input(), ON)).toMatchObject({ ok: true, confirmationId: "c1", deferred: false });
    const [fn, args] = h.rpc.mock.calls[0]; expect(fn).toBe("confirm_ordinary_booking");
    expect(args.p.paymentTermsCheck).toBe("consistent"); expect("paymentCondition" in args.p).toBe(false);
  });
  it("a quotation whose structured condition contradicts its own terms is refused until the client's written confirmation is recorded", async () => {
    h.quote.data = { payment_condition: "none", deposit_percent: null, payment_booking_terms: "A 50% deposit is required to confirm the booking." };
    expect(await confirmOrdinaryBooking(input(), ON)).toMatchObject({ ok: false });
    expect(h.rpc).not.toHaveBeenCalled();
    h.rpc.mockResolvedValue({ data: "c2", error: null });
    expect(await confirmOrdinaryBooking({ ...input(), clarification: { kind: "client_confirmed_in_writing", evidence: "client email of 8 Nov confirms no deposit" } }, ON)).toMatchObject({ ok: true });
    expect(h.rpc.mock.calls[0][1].p.paymentTermsCheck).toBe("contradiction");
  });
  it("turns database refusals into plain messages", async () => {
    h.rpc.mockResolvedValue({ data: null, error: { message: "ordift:booking_firm_conflict" } });
    expect(await confirmOrdinaryBooking(input(), ON)).toEqual({ ok: false, error: expect.stringMatching(/approved leave/) });
    h.rpc.mockResolvedValue({ data: null, error: { message: "ordift:booking_overlap_not_overridable" } });
    expect(await confirmOrdinaryBooking(input(), ON)).toEqual({ ok: false, error: expect.stringMatching(/Change the assigned person or the time: a written explanation cannot clear it/) });
    h.rpc.mockResolvedValue({ data: null, error: { message: "ordift:booking_entity_not_eligible" } });
    expect(await confirmOrdinaryBooking(input(), ON)).toEqual({ ok: false, error: expect.stringMatching(/cannot override an unlicensed activity/) });
  });
});
describe("cancel and preview", () => {
  it("cancel needs a Super Admin and a real reason", async () => {
    expect(await cancelOrdinaryBooking({ actorUserId: "u1", enquiryId: "e1", reason: "short" }, ON)).toMatchObject({ ok: false });
    h.superAdmin = false; expect(await cancelOrdinaryBooking({ actorUserId: "u1", enquiryId: "e1", reason: "client withdrew in writing" }, ON)).toMatchObject({ ok: false });
    expect(h.rpc).not.toHaveBeenCalled();
  });
  it("preview asks the database for the conflicts of the assigned person only", async () => {
    h.rpc.mockResolvedValue({ data: [{ key: "booking:b1", kind: "booking", firm: true, label: "ENQ-1", from: "a", to: "b" }], error: null });
    expect(await previewConflicts({ assigneeId: "p1", segments: [seg], excludeEnquiryId: "e1" }, ON)).toHaveLength(1);
    expect(await previewConflicts({ assigneeId: null, segments: [seg], excludeEnquiryId: null }, ON)).toEqual([]);
  });
});

describe("versioned settings", () => {
  const good = { actorUserId: "u1", thresholds: { QAR: 3000 }, alwaysCategories: ["videography"], escalators: ["exclusivity"], status: "provisional" as const, note: "Provisional Founder rules" };
  it("refuses with the flag off, for non-Super-Admins, and for invalid values, without touching the database", async () => {
    expect(await recordBookingSettingsVersion(good, {})).toMatchObject({ ok: false });
    h.superAdmin = false; expect(await recordBookingSettingsVersion(good, ON)).toMatchObject({ ok: false });
    h.superAdmin = true;
    const bads: any[] = [{ ...good, thresholds: {} }, { ...good, thresholds: { QAR: 0 } }, { ...good, thresholds: { qar: 5 } }, { ...good, escalators: ["Bad Key"] }, { ...good, note: "short" }];
    for (const bad of bads) expect(await recordBookingSettingsVersion(bad, ON)).toMatchObject({ ok: false });
    expect(h.rpc).not.toHaveBeenCalled();
  });
});
