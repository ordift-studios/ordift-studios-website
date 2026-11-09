import { beforeEach, describe, expect, it, vi } from "vitest";

let result: { data: unknown; error: unknown } | "throw" = { data: null, error: null };
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({ from: () => ({ select: () => ({ eq: () => ({ order: () => ({ limit: () => ({ maybeSingle: async () => { if (result === "throw") throw new Error("boom"); return result; } }) }) }) }) }) }),
}));
import { loadSchedulingStatus, withSchedulingLabels } from "./schedulingStatusService";

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
