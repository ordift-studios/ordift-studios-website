import { describe, expect, it } from "vitest";
import { paymentAutoBookOptedOut, paymentMayBookEnquiry, schedulingStatus } from "./paymentStagePolicy";

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
  it("no record at all and still paid -> scheduling pending", () => { expect(schedulingStatus({ ...base, crmStage: "quotation_sent", hasLiveBooking: false })?.code).toBe("paid_scheduling_pending"); });
  it("a CANCELLED booking reads Booking Cancelled — Rescheduling Pending whatever was paid", () => {
    for (const p of [{ paymentStatus: "Paid", amountPaid: 500 }, { paymentStatus: "Pending", amountPaid: 0 }, { paymentStatus: "Partially Paid", amountPaid: 100 }]) {
      const s = schedulingStatus({ ...base, ...p, hasCancelledBooking: true }); expect(s?.code).toBe("cancelled_rescheduling_pending"); expect(s?.label).toBe("Booking Cancelled — Rescheduling Pending"); expect(s?.detail).toMatch(/no longer confirmed/);
    }
  });
  it("a cancelled booking never shows once work is under way, the project is closed, or a live booking replaced it", () => {
    for (const st of ["in_progress", "completed", "closed", "declined"]) expect(schedulingStatus({ ...base, crmStage: st, hasCancelledBooking: true })).toBeNull();
    expect(schedulingStatus({ ...base, crmStage: "booked", hasLiveBooking: true, hasCancelledBooking: false })).toBeNull();
  });
  it("work already under way, closed, or declined -> nothing", () => {
    for (const s of ["in_progress", "delivered", "completed", "declined", "closed"]) expect(schedulingStatus({ ...base, crmStage: s })).toBeNull();
  });
  it("switch off -> nothing (legacy)", () => { expect(schedulingStatus({ ...base, flagOn: false })).toBeNull(); });
  it("Crew Support -> nothing", () => { expect(schedulingStatus({ ...base, commercialIntent: "creative_crew_support" })).toBeNull(); });
  it("a refund that returns the record to unpaid shows no scheduling label", () => { expect(schedulingStatus({ ...base, paymentStatus: "Pending", amountPaid: 0 })).toBeNull(); });
});

describe("switch states (booking confirmation ON/OFF) x PAYMENT_AUTO_BOOKS_ENQUIRY", () => {
  const books = (flagOn: boolean, autoBookOff: boolean, commercialIntent: string | null = null) => paymentMayBookEnquiry({ flagOn, autoBookOff, commercialIntent });
  it("the matrix: only 'switch off and not opted out' books from a payment", () => {
    expect(books(false, false)).toBe(true);     // PRODUCTION TODAY: unchanged
    expect(books(false, true)).toBe(false);     // the compatibility-safe correction
    expect(books(true, false)).toBe(false);
    expect(books(true, true)).toBe(false);
  });
  it("Crew Support never books from a payment in any state", () => { for (const f of [true, false]) for (const o of [true, false]) expect(books(f, o, "creative_crew_support")).toBe(false); });
  it("the opt-out is the exact word false and nothing else (a typo can never change behaviour)", () => {
    expect(paymentAutoBookOptedOut({ PAYMENT_AUTO_BOOKS_ENQUIRY: "false" })).toBe(true);
    for (const v of [undefined, "", "FALSE", "0", "no", "true", " false"]) expect(paymentAutoBookOptedOut({ PAYMENT_AUTO_BOOKS_ENQUIRY: v })).toBe(false);
    expect(paymentAutoBookOptedOut({})).toBe(false);
  });
  const off = { ...base, flagOn: false };
  it("switch off, not opted out: legacy, nothing derived", () => { expect(schedulingStatus({ ...off, autoBookOff: false })).toBeNull(); });
  it("switch off, opted out, paid, before Booked: Paid — scheduling pending (no booking tables are read)", () => {
    expect(schedulingStatus({ ...off, autoBookOff: true })?.code).toBe("paid_scheduling_pending");
    expect(schedulingStatus({ ...off, autoBookOff: true, paymentStatus: "Partially Paid", amountPaid: 100 })?.code).toBe("part_paid_scheduling_pending");
    expect(schedulingStatus({ ...off, autoBookOff: true, paymentStatus: "Pending", amountPaid: 0 })).toBeNull();
  });
  it("switch off, opted out: a project staff set to Booked by hand is NOT flagged as an anomaly (no booking records exist in that mode)", () => {
    expect(schedulingStatus({ ...off, autoBookOff: true, crmStage: "booked" })).toBeNull();
    expect(schedulingStatus({ ...off, autoBookOff: true, hasCancelledBooking: true })?.code).toBe("paid_scheduling_pending");
  });
});

describe("final cancellation vs cancellation awaiting rescheduling", () => {
  const c = { ...base, hasCancelledBooking: true };
  it("final reads Booking Cancelled and says nothing was refunded or closed automatically, whatever was paid", () => {
    for (const p of [{ paymentStatus: "Paid", amountPaid: 500 }, { paymentStatus: "Pending", amountPaid: 0 }]) { const s = schedulingStatus({ ...c, ...p, cancellationOutcome: "final" }); expect(s?.code).toBe("cancelled_final"); expect(s?.label).toBe("Booking Cancelled"); expect(s?.detail).toMatch(/nothing was refunded or closed automatically/); }
  });
  it("awaiting rescheduling (and an older record with no outcome) keeps the pending wording", () => {
    expect(schedulingStatus({ ...c, cancellationOutcome: "rescheduling_pending" })?.label).toBe("Booking Cancelled — Rescheduling Pending"); expect(schedulingStatus({ ...c, cancellationOutcome: null })?.code).toBe("cancelled_rescheduling_pending"); expect(schedulingStatus(c)?.code).toBe("cancelled_rescheduling_pending");
  });
  it("neither shows once work is under way or the project is closed", () => { for (const st of ["in_progress", "closed"]) for (const o of ["final", "rescheduling_pending"] as const) expect(schedulingStatus({ ...c, crmStage: st, cancellationOutcome: o })).toBeNull(); });
});
