import { describe, expect, it } from "vitest";
import { buildNewBookingNotificationEmail, type NewBookingNotificationData } from "./newBookingNotification";

// Render/template coverage for the internal New Booking notification
// (CRM Lifecycle Automation Phase 1, Batch 3, 2026-08-20) — a pure
// function, same pattern as receipts.test.ts and lifecycleEmails.test.ts.

const BASE: NewBookingNotificationData = {
  entityType: "enquiry",
  entityId: "abc-123",
  referenceNumber: "ENQ-2026-000010",
  clientName: "Nita Owusu",
  service: "photography",
  amountPaid: 500,
  amountDue: 500,
};

describe("buildNewBookingNotificationEmail", () => {
  it("renders reference, client, service, amount paid, and an Admin Platform link", () => {
    const { subject, html, text } = buildNewBookingNotificationEmail(BASE);

    expect(subject).toBe("New Booking Confirmed — ENQ-2026-000010");
    expect(html).toContain("New Booking");
    expect(html).toContain("ENQ-2026-000010");
    expect(html).toContain("Nita Owusu");
    expect(html).toContain("$500.00");
    expect(html).toContain("/admin/enquiries/abc-123");
    expect(html).toContain("Internal notification — not sent to the client.");
    expect(text).toContain("ENQ-2026-000010");
    expect(text).toContain("/admin/enquiries/abc-123");
  });

  it("fully paid (amountPaid === amountDue) shows no outstanding-balance row", () => {
    const { html, text } = buildNewBookingNotificationEmail(BASE);
    expect(html).not.toContain("Outstanding balance");
    expect(text).not.toContain("Outstanding balance");
  });

  it("a genuine remaining balance is shown, not hidden", () => {
    const { html, text } = buildNewBookingNotificationEmail({ ...BASE, amountPaid: 300, amountDue: 500 });
    expect(html).toContain("Outstanding balance");
    expect(html).toContain("$200.00");
    expect(text).toContain("Outstanding balance: $200.00");
  });

  it("client name and reference are HTML-escaped, not raw-interpolated", () => {
    const { html } = buildNewBookingNotificationEmail({ ...BASE, clientName: `<script>alert('x')</script>` });
    expect(html).not.toContain("<script>");
  });

  it("never renders literal 'null' or 'undefined'", () => {
    const { html, text } = buildNewBookingNotificationEmail(BASE);
    expect(html).not.toContain("null");
    expect(html).not.toContain("undefined");
    expect(text).not.toContain("null");
    expect(text).not.toContain("undefined");
  });

  it("contains no card, gateway, or exchange-rate detail — that stays in the payment receipt", () => {
    const { html, text } = buildNewBookingNotificationEmail(BASE);
    for (const term of ["card", "Visa", "Mastercard", "exchange rate", "Paystack", "gateway"]) {
      expect(html.toLowerCase()).not.toContain(term.toLowerCase());
      expect(text.toLowerCase()).not.toContain(term.toLowerCase());
    }
  });
});
