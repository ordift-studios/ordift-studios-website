import { beforeEach, describe, expect, it, vi } from "vitest";

let result: { data: unknown; error: unknown } | "throw" = { data: null, error: null };
let batch: unknown[] | null = [];
const setBatch = (b: unknown[] | null) => { batch = b; };
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({ from: () => ({ select: () => ({ in: () => ({ order: async () => (batch === null ? { data: null, error: { message: "boom" } } : { data: batch, error: null }) }), eq: () => ({ order: () => ({ limit: () => ({ maybeSingle: async () => { if (result === "throw") throw new Error("boom"); return result; } }) }) }) }) }) }),
}));
import { loadSchedulingStatus, loadSchedulingStatuses, matchesSchedulingFilter, schedulingFilterOf, withSchedulingLabels } from "./schedulingStatusService";

const ON = { BOOKING_CONFIRMATION_ENABLED: "true" }, OFF = {};
const paid = { id: "e1", crmStage: "quotation_sent", paymentStatus: "Paid", amountPaid: 700 };
beforeEach(() => { result = { data: null, error: null }; });

describe("loadSchedulingStatus", () => {
  it("is null while booking confirmation is off, whatever the data", async () => { expect(await loadSchedulingStatus(paid, OFF)).toBeNull(); });
  it("paid + no booking row -> Paid — scheduling pending", async () => { expect((await loadSchedulingStatus(paid, ON))?.label).toBe("Paid — scheduling pending"); });
  it("paid + live confirmed booking -> nothing to add", async () => { result = { data: { kind: "confirmed" }, error: null }; expect(await loadSchedulingStatus({ ...paid, crmStage: "booked" }, ON)).toBeNull(); });
  it("a cancelled latest booking reads Booking Cancelled — Rescheduling Pending", async () => { result = { data: { kind: "cancelled" }, error: null }; expect((await loadSchedulingStatus(paid, ON))?.code).toBe("cancelled_rescheduling_pending"); });
  it("a read error never invents a status (booking tables absent)", async () => { result = { data: null, error: { message: "relation does not exist" } }; expect(await loadSchedulingStatus(paid, ON)).toBeNull(); });
  it("a thrown error never invents a status", async () => { result = "throw"; expect(await loadSchedulingStatus(paid, ON)).toBeNull(); });
});

describe("loadSchedulingStatus: the cancellation outcome", () => {
  it("a final cancellation reads Booking Cancelled; the client's card then has no next milestone", async () => {
    result = { data: { kind: "cancelled", cancellation_outcome: "final" }, error: null }; expect((await loadSchedulingStatus(paid, ON))?.code).toBe("cancelled_final");
    const out = await withSchedulingLabels([{ id: "e1", statusLabel: "Quotation Sent", nextMilestoneLabel: "Negotiation" }], [paid], ON); expect(out[0].statusLabel).toBe("Booking Cancelled"); expect(out[0].nextMilestoneLabel).toBeNull();
  });
});
describe("withSchedulingLabels", () => {
  it("overlays the client wording only on cards that need it", async () => {
    const cards = [{ id: "e1", statusLabel: "Quotation Sent" }, { id: "e2", statusLabel: "New Lead" }];
    const out = await withSchedulingLabels(cards, [paid, { id: "e2", crmStage: "new_lead", paymentStatus: "Pending", amountPaid: 0 }], ON);
    expect(out[0].statusLabel).toBe("Paid — scheduling pending"); expect(out[1].statusLabel).toBe("New Lead");
  });
  it("a card that carries a next milestone is told booking confirmation is next", async () => {
    const out = await withSchedulingLabels([{ id: "e1", statusLabel: "Quotation Sent", nextMilestoneLabel: "Negotiation" }], [paid], ON);
    expect(out[0].nextMilestoneLabel).toBe("Booking confirmation");
  });
  it("returns the cards untouched while the switch is off", async () => {
    const cards = [{ id: "e1", statusLabel: "Quotation Sent" }];
    expect(await withSchedulingLabels(cards, [paid], OFF)).toBe(cards);
  });
  it("the client never sees the internal anomaly wording", async () => {
    const out = await withSchedulingLabels([{ id: "e1", statusLabel: "Booked" }], [{ ...paid, crmStage: "booked" }], ON);
    expect(out[0].statusLabel).toBe("Scheduling pending");
  });
});

describe("loadSchedulingStatuses / the Admin filter", () => {
  const rows = [
    { id: "a", crmStage: "quotation_sent", paymentStatus: "Paid", amountPaid: 500 },        // paid, no booking          -> pending
    { id: "b", crmStage: "quotation_sent", paymentStatus: "Pending", amountPaid: 100 },      // part paid, no booking     -> pending (part)
    { id: "c", crmStage: "quotation_sent", paymentStatus: "Paid", amountPaid: 500 },        // latest booking cancelled  -> cancelled
    { id: "d", crmStage: "booked", paymentStatus: "Paid", amountPaid: 500 },                 // live booking              -> nothing
    { id: "e", crmStage: "quotation_sent", paymentStatus: "Pending", amountPaid: 0 },        // nothing paid              -> nothing
  ];
  it("uses payment status and the latest booking record only (no stored status); the filter chips match the right rows", async () => {
    setBatch([{ enquiry_id: "c", version: 3, kind: "cancelled", cancellation_outcome: "final" }, { enquiry_id: "c", version: 2, kind: "changed" }, { enquiry_id: "d", version: 1, kind: "confirmed" }]);
    const m = await loadSchedulingStatuses(rows, ON);
    expect(m.get("a")?.code).toBe("paid_scheduling_pending"); expect(m.get("b")?.code).toBe("part_paid_scheduling_pending"); expect(m.get("c")?.code).toBe("cancelled_final"); expect(m.get("d")).toBeNull(); expect(m.get("e")).toBeNull();
    expect(rows.filter((r) => matchesSchedulingFilter(m.get(r.id), "pending")).map((r) => r.id)).toEqual(["a", "b"]); expect(rows.filter((r) => matchesSchedulingFilter(m.get(r.id), "cancelled")).map((r) => r.id)).toEqual(["c"]);
  });
  it("nothing is computed while the switch is off, and an unreadable booking table shows no status rather than a wrong one", async () => { expect((await loadSchedulingStatuses(rows, {})).size).toBe(0); setBatch(null); expect((await loadSchedulingStatuses(rows, ON)).size).toBe(0); });
  it("the opt-out mode (switch off, payments do not book) needs no booking table and still lists paid, unbooked projects", async () => { const m = await loadSchedulingStatuses(rows, { PAYMENT_AUTO_BOOKS_ENQUIRY: "false" }); expect(m.get("a")?.code).toBe("paid_scheduling_pending"); expect(m.get("d")).toBeNull(); });
  it("filter parsing accepts only the two known values", () => { expect(schedulingFilterOf("pending")).toBe("pending"); expect(schedulingFilterOf("cancelled")).toBe("cancelled"); expect(schedulingFilterOf("x")).toBeNull(); expect(schedulingFilterOf(undefined)).toBeNull(); });
});
