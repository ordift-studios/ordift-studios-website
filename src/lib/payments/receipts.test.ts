import { describe, expect, it } from "vitest";
import { buildPaymentReceiptEmail, type PaymentReceiptData } from "./receipts";

// Render/template coverage for the redesigned Ordift receipt email
// (TD-043 follow-up cleanup phase). buildPaymentReceiptEmail() is a
// pure function (no DB, no network) precisely so this can assert on
// actual rendered content, not just describe intent.

const BASE: PaymentReceiptData = {
  recordId: "PAY-2026-000002",
  paymentType: "full",
  amountCollected: 55.45,
  paymentCurrency: "GHS",
  referenceAmountUsd: 5,
  exchangeRate: 11.0898,
  createdAt: "2026-08-19T18:15:08.303751+00:00",
  channel: "card",
  cardBrand: "visa",
  cardLast4: "4478",
  clientName: "Nita Owusu",
  projectTitle: "General Enquiry",
  entityReference: "ENQ-2026-000007",
  receiptUrl: "https://ordiftstudios.com/portal/client/projects/enquiry/abc/payments/def/receipt",
};

describe("buildPaymentReceiptEmail", () => {
  it("renders every available field for a full card payment with a foreign-currency exchange rate", () => {
    const { subject, html, text } = buildPaymentReceiptEmail(BASE);

    expect(subject).toBe("Payment Receipt — PAY-2026-000002");
    expect(html).toContain("Payment Successful");
    expect(html).toContain("Thank you, Nita.");
    expect(html).toContain("PAY-2026-000002");
    expect(html).toContain("ENQ-2026-000007");
    expect(html).toContain("General Enquiry");
    expect(html).toContain("Full Payment");
    expect(html).toContain("GHS 55.45");
    expect(html).toContain("USD 5.00 at 11.0898 exchange rate applied at checkout");
    expect(html).toContain("Card");
    expect(html).toContain("visa •••• 4478");
    expect(html).toContain("View Receipt");
    expect(html).toContain(BASE.receiptUrl);
    expect(html).toContain("support@ordiftstudios.com");
    expect(html).toContain("Paystack"); // distinguishes this from Paystack's own receipt, not silent about it

    // Text version carries the same substance, not just the HTML.
    expect(text).toContain("PAY-2026-000002");
    expect(text).toContain("ENQ-2026-000007");
    expect(text).toContain("GHS 55.45");
    expect(text).toContain(BASE.receiptUrl);
  });

  it("USD payment — no exchange-rate section, not a broken/empty one", () => {
    const { html, text } = buildPaymentReceiptEmail({ ...BASE, paymentCurrency: "USD", exchangeRate: null });
    expect(html).not.toContain("exchange rate");
    expect(text).not.toContain("exchange rate");
  });

  it("bank transfer — no card/channel-specific rows, no broken labels", () => {
    const { html, text } = buildPaymentReceiptEmail({
      ...BASE,
      channel: null,
      cardBrand: null,
      cardLast4: null,
    });
    expect(html).not.toContain("Card:");
    expect(html).not.toContain("•••• ");
    expect(html).not.toContain("null");
    expect(html).not.toContain("undefined");
    expect(text).not.toContain("null");
    expect(text).not.toContain("undefined");
  });

  it("no client name resolved — falls back gracefully, never renders 'null'", () => {
    const { html, text } = buildPaymentReceiptEmail({ ...BASE, clientName: null });
    expect(html).toContain("Thank you, there.");
    expect(html).not.toContain("null");
    expect(text).not.toContain("null");
  });

  it("no project title/entity reference resolved — those rows are simply absent, not empty", () => {
    const { html } = buildPaymentReceiptEmail({ ...BASE, projectTitle: null, entityReference: null });
    expect(html).not.toContain("Project reference");
    expect(html).not.toContain(">Project<");
    expect(html).not.toContain("null");
  });

  it("workshop payment_type/currency edge values map to human-readable labels, not raw codes", () => {
    const { html } = buildPaymentReceiptEmail({ ...BASE, paymentType: "deposit", channel: "mobile_money" });
    expect(html).toContain("Deposit");
    expect(html).toContain("Mobile Money");
    expect(html).not.toContain(">deposit<");
    expect(html).not.toContain(">mobile_money<");
  });

  it("client name and project title are HTML-escaped, not raw-interpolated", () => {
    const { html } = buildPaymentReceiptEmail({
      ...BASE,
      clientName: `<script>alert('x')</script>`,
      projectTitle: `Tom & Jerry's "Shoot"`,
    });
    expect(html).not.toContain("<script>");
    expect(html).toContain("Tom &amp; Jerry's &quot;Shoot&quot;"); // & and " escaped, matching escapeHtml()'s own behavior
  });
});
