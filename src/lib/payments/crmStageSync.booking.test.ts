import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const sendBooked = vi.fn(async () => ({ ok: true }));
const sendNew = vi.fn(async () => ({ ok: true }));
const logActivity = vi.fn(async () => undefined);
vi.mock("@/lib/enquiry/lifecycleEmails", () => ({ sendBookingConfirmedEmail: (...a: unknown[]) => (sendBooked as any)(...a) }));
vi.mock("@/lib/notifications/newBookingNotification", () => ({ sendNewBookingNotification: (...a: unknown[]) => (sendNew as any)(...a) }));
vi.mock("@/lib/admin/activityLog", () => ({ logActivityAsSystem: (...a: unknown[]) => (logActivity as any)(...a) }));

import { advanceStageOnFullPayment } from "./crmStageSync";

// minimal in-memory enquiries table that honours .update().eq().not().select() and .select().eq().maybeSingle()
function fakeAdmin(row: { id: string; crm_stage: string; commercial_intent: string | null }) {
  const writes: Record<string, unknown>[] = [];
  const admin = {
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { ...row, email: "c@e2e.test", full_name: "C", service: "photography", reference_number: "ENQ-X", amount_paid: 500, amount_due: 500 } }) }) }),
      update: (patch: Record<string, unknown>) => ({ eq: () => ({ not: () => ({ select: async () => { writes.push(patch); const stages = ["booked", "in_progress", "delivered", "completed", "repeat_client", "referral", "declined", "closed"]; if (stages.includes(row.crm_stage)) return { data: [], error: null }; row.crm_stage = String(patch.crm_stage); return { data: [{ id: row.id }], error: null }; } }) }) }),
    }),
  };
  return { admin: admin as never, writes, row };
}

const OLD = process.env.BOOKING_CONFIRMATION_ENABLED, OLD_AUTO = process.env.PAYMENT_AUTO_BOOKS_ENQUIRY;
beforeEach(() => { sendBooked.mockClear(); sendNew.mockClear(); logActivity.mockClear(); });
afterEach(() => { if (OLD_AUTO === undefined) delete process.env.PAYMENT_AUTO_BOOKS_ENQUIRY; else process.env.PAYMENT_AUTO_BOOKS_ENQUIRY = OLD_AUTO; if (OLD === undefined) delete process.env.BOOKING_CONFIRMATION_ENABLED; else process.env.BOOKING_CONFIRMATION_ENABLED = OLD; });

describe("advanceStageOnFullPayment — payment is not a booking", () => {
  it("switch ON: a full payment changes no stage and sends no booking e-mail or new-booking notification", async () => {
    process.env.BOOKING_CONFIRMATION_ENABLED = "true";
    const f = fakeAdmin({ id: "e1", crm_stage: "quotation_sent", commercial_intent: null });
    await advanceStageOnFullPayment(f.admin, "enquiry", "e1", "Paid");
    expect(f.writes).toHaveLength(0); expect(f.row.crm_stage).toBe("quotation_sent");
    expect(sendBooked).not.toHaveBeenCalled(); expect(sendNew).not.toHaveBeenCalled(); expect(logActivity).not.toHaveBeenCalled();
  });
  it("switch ON: repeated completions (webhook retry) are still no-ops", async () => {
    process.env.BOOKING_CONFIRMATION_ENABLED = "true";
    const f = fakeAdmin({ id: "e1", crm_stage: "negotiation", commercial_intent: null });
    for (let i = 0; i < 3; i++) await advanceStageOnFullPayment(f.admin, "enquiry", "e1", "Paid");
    expect(f.row.crm_stage).toBe("negotiation"); expect(f.writes).toHaveLength(0);
  });
  it("switch OFF: legacy behaviour is unchanged (stage booked, audit, both notifications)", async () => {
    delete process.env.BOOKING_CONFIRMATION_ENABLED;
    const f = fakeAdmin({ id: "e2", crm_stage: "quotation_sent", commercial_intent: null });
    await advanceStageOnFullPayment(f.admin, "enquiry", "e2", "Paid");
    expect(f.row.crm_stage).toBe("booked"); expect(sendBooked).toHaveBeenCalledTimes(1); expect(sendNew).toHaveBeenCalledTimes(1);
    expect(logActivity).toHaveBeenCalledWith(expect.objectContaining({ action: "enquiry.stage_change" }));
  });
  it("Crew Support is never advanced by payment (switch on or off)", async () => {
    for (const v of ["true", undefined]) {
      if (v) process.env.BOOKING_CONFIRMATION_ENABLED = v; else delete process.env.BOOKING_CONFIRMATION_ENABLED;
      const f = fakeAdmin({ id: "e3", crm_stage: "quotation_sent", commercial_intent: "creative_crew_support" });
      await advanceStageOnFullPayment(f.admin, "enquiry", "e3", "Paid");
      expect(f.row.crm_stage).toBe("quotation_sent");
    }
  });
  it("a Pending status or a non-enquiry never advances anything", async () => {
    delete process.env.BOOKING_CONFIRMATION_ENABLED;
    const f = fakeAdmin({ id: "e4", crm_stage: "quotation_sent", commercial_intent: null });
    await advanceStageOnFullPayment(f.admin, "enquiry", "e4", "Pending");
    await advanceStageOnFullPayment(f.admin, "workshop_registration", "e4", "Paid");
    expect(f.row.crm_stage).toBe("quotation_sent");
  });
  it("switch OFF + PAYMENT_AUTO_BOOKS_ENQUIRY=false: a full payment no longer books or e-mails (the compatibility-safe correction)", async () => {
    delete process.env.BOOKING_CONFIRMATION_ENABLED; process.env.PAYMENT_AUTO_BOOKS_ENQUIRY = "false";
    const f = fakeAdmin({ id: "e5", crm_stage: "quotation_sent", commercial_intent: null });
    await advanceStageOnFullPayment(f.admin, "enquiry", "e5", "Paid");
    expect(f.row.crm_stage).toBe("quotation_sent"); expect(f.writes).toHaveLength(0); expect(sendBooked).not.toHaveBeenCalled(); expect(sendNew).not.toHaveBeenCalled(); expect(logActivity).not.toHaveBeenCalled();
  });
  it("switch OFF + variable unset or any other value: legacy behaviour is exactly as before (Production today)", async () => {
    for (const v of [undefined, "true", "FALSE", "0"]) {
      delete process.env.BOOKING_CONFIRMATION_ENABLED; if (v === undefined) delete process.env.PAYMENT_AUTO_BOOKS_ENQUIRY; else process.env.PAYMENT_AUTO_BOOKS_ENQUIRY = v;
      sendBooked.mockClear(); const f = fakeAdmin({ id: "e6", crm_stage: "quotation_sent", commercial_intent: null });
      await advanceStageOnFullPayment(f.admin, "enquiry", "e6", "Paid");
      expect(f.row.crm_stage).toBe("booked"); expect(sendBooked).toHaveBeenCalledTimes(1);
    }
  });
  it("switch ON wins whatever the variable says", async () => {
    process.env.BOOKING_CONFIRMATION_ENABLED = "true"; process.env.PAYMENT_AUTO_BOOKS_ENQUIRY = "true";
    const f = fakeAdmin({ id: "e7", crm_stage: "quotation_sent", commercial_intent: null });
    await advanceStageOnFullPayment(f.admin, "enquiry", "e7", "Paid");
    expect(f.row.crm_stage).toBe("quotation_sent");
  });
});
