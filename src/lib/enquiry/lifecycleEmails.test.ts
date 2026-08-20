import { describe, expect, it } from "vitest";
import {
  buildQuotationReadyEmail,
  buildBookingConfirmedEmail,
  type QuotationReadyData,
  type BookingConfirmedData,
} from "./lifecycleEmails";

// Render/template coverage for the two new CRM Lifecycle Automation
// Phase 1, Batch 2 client emails (2026-08-20), mirroring the pattern
// already proven for buildPaymentReceiptEmail (receipts.test.ts) — both
// builders are pure functions (no DB, no network), so this asserts on
// actual rendered content, not just intent.

const QUOTATION_BASE: QuotationReadyData = {
  enquiryId: "abc-123",
  referenceNumber: "ENQ-2026-000009",
  fullName: "Nita Owusu",
  email: "nita@example.com",
  service: "photography",
  amountDue: 500,
};

const BOOKING_BASE: BookingConfirmedData = {
  enquiryId: "abc-123",
  referenceNumber: "ENQ-2026-000009",
  fullName: "Nita Owusu",
  email: "nita@example.com",
  service: "photography",
};

describe("buildQuotationReadyEmail", () => {
  it("renders reference, amount, greeting, and a portal link scoped to this enquiry", () => {
    const { subject, html, text } = buildQuotationReadyEmail(QUOTATION_BASE);

    expect(subject).toBe("Your Quotation is Ready — ENQ-2026-000009");
    expect(html).toContain("Quotation Ready");
    expect(html).toContain("Hi Nita,");
    expect(html).toContain("ENQ-2026-000009");
    expect(html).toContain("$500.00");
    expect(html).toContain("/portal/client/projects/enquiry/abc-123/payments");
    expect(text).toContain("ENQ-2026-000009");
    expect(text).toContain("$500.00");
  });

  it("client name is HTML-escaped, not raw-interpolated", () => {
    const { html } = buildQuotationReadyEmail({ ...QUOTATION_BASE, fullName: `<script>alert('x')</script>` });
    expect(html).not.toContain("<script>");
  });

  it("never renders literal 'null' or 'undefined'", () => {
    const { html, text } = buildQuotationReadyEmail(QUOTATION_BASE);
    expect(html).not.toContain("null");
    expect(html).not.toContain("undefined");
    expect(text).not.toContain("null");
    expect(text).not.toContain("undefined");
  });
});

describe("buildBookingConfirmedEmail", () => {
  it("renders reference, greeting, and a portal link — distinct content from a payment receipt", () => {
    const { subject, html, text } = buildBookingConfirmedEmail(BOOKING_BASE);

    expect(subject).toBe("Booking Confirmed — ENQ-2026-000009");
    expect(html).toContain("Booking Confirmed");
    expect(html).toContain("You're booked, Nita.");
    expect(html).toContain("ENQ-2026-000009");
    expect(html).toContain("/portal/client/projects/enquiry/abc-123/timeline");
    // Explicitly distinguishes itself from the payment receipt rather
    // than duplicating its content — same "not silent about the other
    // email" pattern receipts.test.ts asserts for Paystack's own email.
    expect(html).toContain("You'll separately receive a payment receipt");
    expect(text).toContain("ENQ-2026-000009");
  });

  it("client name is HTML-escaped, not raw-interpolated", () => {
    const { html } = buildBookingConfirmedEmail({ ...BOOKING_BASE, fullName: `<script>alert('x')</script>` });
    expect(html).not.toContain("<script>");
  });

  it("never renders literal 'null' or 'undefined'", () => {
    const { html, text } = buildBookingConfirmedEmail(BOOKING_BASE);
    expect(html).not.toContain("null");
    expect(html).not.toContain("undefined");
    expect(text).not.toContain("null");
    expect(text).not.toContain("undefined");
  });
});
