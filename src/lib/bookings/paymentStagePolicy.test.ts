import { describe, expect, it } from "vitest";
import { paymentMayBookEnquiry, schedulingStatus } from "./paymentStagePolicy";

const base = { flagOn: true, crmStage: "quotation_sent", paymentStatus: "Paid", amountPaid: 500, hasLiveBooking: false };

describe("paymentMayBookEnquiry", () => {
  it("never books once booking confirmation is on", () => { expect(paymentMayBookEnquiry({ flagOn: true, commercialIntent: null })).toBe(false); });
  it("keeps the legacy advance while the switch is off", () => { expect(paymentMayBookEnquiry({ flagOn: false, commercialIntent: null })).toBe(true); });
  it("never books Crew Support from a payment, switch on or off", () => {
    expect(paymentMayBookEnquiry({ flagOn: false, commercialIntent: "creative_crew_support" })).toBe(false);
    expect(paymentMayBookEnquiry({ flagOn: true, commercialIntent: "creative_crew_support" })).toBe(false);
  });
});

describe("schedulingStatus", () => {
  it("fully paid with no booking -> Paid — scheduling pending", () => { expect(schedulingStatus(base)?.label).toBe("Paid — scheduling pending"); });
  it("part paid with no booking -> payment received, scheduling pending", () => { expect(schedulingStatus({ ...base, paymentStatus: "Partially Paid", amountPaid: 100 })?.code).toBe("part_paid_scheduling_pending"); });
  it("nothing paid -> nothing to add", () => { expect(schedulingStatus({ ...base, paymentStatus: "Pending", amountPaid: 0 })).toBeNull(); });
  it("a live confirmed booking -> nothing to add (stage label is accurate)", () => { expect(schedulingStatus({ ...base, crmStage: "booked", hasLiveBooking: true })).toBeNull(); });
  it("stage booked with no booking record is surfaced, not hidden", () => { expect(schedulingStatus({ ...base, crmStage: "booked" })?.code).toBe("booked_without_record"); });
  it("a cancelled booking (no live record) returns to scheduling pending when still paid", () => { expect(schedulingStatus({ ...base, crmStage: "quotation_sent", hasLiveBooking: false })?.code).toBe("paid_scheduling_pending"); });
  it("work already under way, closed, or declined -> nothing", () => {
    for (const s of ["in_progress", "delivered", "completed", "declined", "closed"]) expect(schedulingStatus({ ...base, crmStage: s })).toBeNull();
  });
  it("switch off -> nothing (legacy)", () => { expect(schedulingStatus({ ...base, flagOn: false })).toBeNull(); });
  it("Crew Support -> nothing", () => { expect(schedulingStatus({ ...base, commercialIntent: "creative_crew_support" })).toBeNull(); });
  it("a refund that returns the record to unpaid shows no scheduling label", () => { expect(schedulingStatus({ ...base, paymentStatus: "Pending", amountPaid: 0 })).toBeNull(); });
});
