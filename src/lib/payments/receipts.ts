import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail, type EmailResult } from "@/lib/shared/email/dispatch";
import { wrap, escapeHtml, SERIF, SANS, NAVY, GOLD, INK_MUTED } from "@/lib/enquiry/emailTemplates";

// Payment receipts — reuses the existing Resend pipeline directly
// (src/lib/shared/email/dispatch.ts), same staging/production gating
// as every other transactional email in this project (logs instead of
// sending unless FORMS_SENDING_ENABLED, so this is sandbox-safe by
// construction). No PDF generation — a polished HTML receipt email is
// the baseline; a downloadable PDF (UX Spec §13) remains a separate
// follow-up.
//
// Redesign (2026-08-19, TD-043 follow-up cleanup phase) — this is now
// Ordift's own branded business receipt, reusing the exact same
// wrapper every other transactional email in this project uses
// (src/lib/enquiry/emailTemplates.ts's `wrap()`), not a bespoke style.
// Paystack's own automatic payment-provider receipt is a separate
// email this function has no involvement in producing — nothing here
// reads from, calls, or depends on anything Paystack-side beyond the
// data already stored on the `payments` row from the original
// completion. sendPaymentReceiptEmail()'s own contract (returns
// EmailResult, called exactly once per completion by gatewaySync.ts's
// dispatchReceiptJob, via the durable outbox) is unchanged.
//
// buildPaymentReceiptEmail() is split out as a pure function
// (plain data in, {subject, html, text} out, no DB/network) so the
// template itself is directly unit-testable — the outer function's
// EmailResult return value never exposes rendered content, so that's
// the only way to actually assert on what the email contains.

const CHANNEL_LABELS: Record<string, string> = {
  mobile_money: "Mobile Money",
  card: "Card",
  apple_pay: "Apple Pay",
  google_pay: "Google Pay",
  bank: "Bank",
};

const PAYMENT_TYPE_LABELS: Record<string, string> = {
  deposit: "Deposit",
  partial: "Partial Payment",
  balance: "Balance Payment",
  full: "Full Payment",
  refund: "Refund",
};

function formatCurrency(amount: number, currency: string): string {
  return `${currency} ${amount.toFixed(2)}`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
}

export type PaymentReceiptData = {
  recordId: string;
  paymentType: string;
  amountCollected: number;
  paymentCurrency: string;
  referenceAmountUsd: number;
  exchangeRate: number | null;
  createdAt: string;
  channel: string | null;
  cardBrand: string | null;
  cardLast4: string | null;
  clientName: string | null;
  projectTitle: string | null;
  entityReference: string | null;
  receiptUrl: string;
};

export function buildPaymentReceiptEmail(data: PaymentReceiptData): { subject: string; html: string; text: string } {
  const amountLocal = formatCurrency(data.amountCollected, data.paymentCurrency);
  const amountUsd = formatCurrency(data.referenceAmountUsd, "USD");
  const showExchangeRate = data.paymentCurrency !== "USD" && data.exchangeRate != null;
  const paymentTypeLabel = PAYMENT_TYPE_LABELS[data.paymentType] ?? data.paymentType;
  const channelLabel = data.channel ? (CHANNEL_LABELS[data.channel] ?? data.channel) : null;
  const cardLabel = data.cardBrand && data.cardLast4 ? `${data.cardBrand.trim()} •••• ${data.cardLast4}` : null;

  const subject = `Payment Receipt — ${data.recordId}`;

  const rows: [string, string][] = [
    ["Reference", data.recordId],
    ...(data.entityReference ? ([["Project reference", escapeHtml(data.entityReference)]] as [string, string][]) : []),
    ...(data.projectTitle ? ([["Project", escapeHtml(data.projectTitle)]] as [string, string][]) : []),
    ["Payment type", paymentTypeLabel],
    ["Amount charged", amountLocal],
    ...(showExchangeRate
      ? ([["Reference amount", `${amountUsd} at ${Number(data.exchangeRate).toFixed(4)} exchange rate applied at checkout`]] as [
          string,
          string,
        ][])
      : []),
    ["Date paid", formatDate(data.createdAt)],
    ...(channelLabel ? ([["Payment method", channelLabel]] as [string, string][]) : []),
    ...(cardLabel ? ([["Card", cardLabel]] as [string, string][]) : []),
    ["Status", "Paid"],
  ];

  const rowsHtml = rows
    .map(
      ([label, value]) => `
      <tr>
        <td style="padding:8px 0;font-family:${SANS};font-size:13px;color:${INK_MUTED};width:160px;vertical-align:top;border-bottom:1px solid #f0efec;">${label}</td>
        <td style="padding:8px 0;font-family:${SANS};font-size:14px;color:${NAVY};font-weight:500;border-bottom:1px solid #f0efec;">${value}</td>
      </tr>`
    )
    .join("");

  const greetingName = data.clientName ? escapeHtml(data.clientName.split(" ")[0] || data.clientName) : "there";

  const bodyHtml = `
    <p style="margin:0 0 4px;font-family:${SANS};font-size:13px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:${GOLD};">
      Payment Successful
    </p>
    <h1 style="margin:0 0 20px;font-family:${SERIF};font-size:26px;color:${NAVY};font-weight:normal;">
      Thank you, ${greetingName}.
    </h1>
    <table role="presentation" width="100%" style="margin-bottom:24px;">${rowsHtml}</table>
    <table role="presentation" width="100%" style="margin-bottom:24px;">
      <tr>
        <td align="center">
          <a href="${data.receiptUrl}" style="display:inline-block;padding:12px 28px;background:${GOLD};color:${NAVY};font-family:${SANS};font-size:14px;font-weight:600;text-decoration:none;border-radius:999px;">
            View Receipt
          </a>
        </td>
      </tr>
    </table>
    <p style="margin:0 0 4px;font-family:${SANS};font-size:13px;line-height:1.6;color:${INK_MUTED};">
      This is Ordift Studios' own business receipt for your payment. You will separately receive a payment
      confirmation directly from Paystack, our payment processor.
    </p>
    <p style="margin:16px 0 0;font-family:${SANS};font-size:13px;line-height:1.6;color:${INK_MUTED};">
      Questions about this payment? Contact us at
      <a href="mailto:support@ordiftstudios.com" style="color:${NAVY};">support@ordiftstudios.com</a>.
    </p>
  `;

  const html = wrap(bodyHtml, "Ordift Studios · This is an automated payment receipt.");

  const textLines = [
    `Payment Successful`,
    ``,
    `Thank you, ${data.clientName ?? "there"}.`,
    ``,
    `Reference: ${data.recordId}`,
    ...(data.entityReference ? [`Project reference: ${data.entityReference}`] : []),
    ...(data.projectTitle ? [`Project: ${data.projectTitle}`] : []),
    `Payment type: ${paymentTypeLabel}`,
    `Amount charged: ${amountLocal}`,
    ...(showExchangeRate ? [`Reference amount: ${amountUsd} at ${Number(data.exchangeRate).toFixed(4)} exchange rate`] : []),
    `Date paid: ${formatDate(data.createdAt)}`,
    ...(channelLabel ? [`Payment method: ${channelLabel}`] : []),
    ...(cardLabel ? [`Card: ${cardLabel}`] : []),
    `Status: Paid`,
    ``,
    `View your receipt: ${data.receiptUrl}`,
    ``,
    `This is Ordift Studios' own business receipt. You will separately receive a payment confirmation directly from Paystack.`,
    ``,
    `Questions? support@ordiftstudios.com`,
    ``,
    `Ordift Studios`,
  ];

  return { subject, html, text: textLines.join("\n") };
}

// TD-043 — returns the real send outcome (rather than a bare void) so
// the durable receipt outbox (gatewaySync.ts's dispatchReceiptJob) can
// record what actually happened — sent, logged (Staging's own
// suppressed-send mode), or genuinely failed — instead of assuming
// success merely because this function was called.
export async function sendPaymentReceiptEmail(paymentId: string): Promise<EmailResult> {
  const admin = createAdminClient();
  const { data: payment } = await admin
    .from("payments")
    .select(
      "record_id, user_id, reference_amount_usd, payment_currency, exchange_rate, amount_collected, payment_type, entity_type, entity_id, created_at, channel, card_brand, card_last4"
    )
    .eq("id", paymentId)
    .maybeSingle();

  if (!payment) {
    console.error("[payments] receipt: payment not found", paymentId);
    return { ok: false, error: "payment-not-found", attempts: 0, permanent: true };
  }

  // Client name + project reference/title — the same entity lookup
  // pattern already used throughout the payments module (e.g. the
  // admin payment detail page), scoped to just the fields this email
  // needs, never anything sensitive beyond what a receipt legitimately
  // shows the same person it's addressed to.
  const entityTable = payment.entity_type === "enquiry" ? "enquiries" : "workshop_registrations";
  const entitySelect =
    payment.entity_type === "enquiry"
      ? "id, reference_number, full_name, email, service"
      : "id, registration_reference, full_name, email, workshop_title";
  const { data: entity } = await admin.from(entityTable).select(entitySelect).eq("id", payment.entity_id).maybeSingle();

  let email: string | null = null;
  if (payment.user_id) {
    // Email lives on auth.users, not public.profiles (see migration
    // 0001 — profiles has no email column) — resolved via the admin
    // auth API, the standard Supabase pattern for looking up another
    // user's email server-side.
    const { data: userResult } = await admin.auth.admin.getUserById(payment.user_id);
    email = userResult?.user?.email ?? null;
  }
  if (!email) {
    // Fall back to the payable entity's own contact email (a guest
    // enquiry/registration may have no linked portal account) — same
    // "resolve from the entity if no user_id" pattern already used
    // elsewhere in this codebase for guest submissions.
    email = (entity as { email?: string } | null)?.email ?? null;
  }

  if (!email) {
    console.error("[payments] receipt: no email resolved for payment", paymentId);
    return { ok: false, error: "no-email-resolved", attempts: 0, permanent: true };
  }

  const kind = payment.entity_type === "enquiry" ? "enquiry" : "workshop";
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://ordiftstudios.com";

  const { subject, html, text } = buildPaymentReceiptEmail({
    recordId: payment.record_id,
    paymentType: payment.payment_type,
    amountCollected: Number(payment.amount_collected ?? payment.reference_amount_usd),
    paymentCurrency: payment.payment_currency,
    referenceAmountUsd: Number(payment.reference_amount_usd),
    exchangeRate: payment.exchange_rate != null ? Number(payment.exchange_rate) : null,
    createdAt: payment.created_at,
    channel: payment.channel,
    cardBrand: payment.card_brand,
    cardLast4: payment.card_last4,
    clientName: (entity as { full_name?: string } | null)?.full_name ?? null,
    projectTitle:
      payment.entity_type === "enquiry"
        ? (entity as { service?: string } | null)?.service ?? null
        : (entity as { workshop_title?: string } | null)?.workshop_title ?? null,
    entityReference:
      payment.entity_type === "enquiry"
        ? (entity as { reference_number?: string } | null)?.reference_number ?? null
        : (entity as { registration_reference?: string } | null)?.registration_reference ?? null,
    receiptUrl: `${siteUrl}/portal/client/projects/${kind}/${payment.entity_id}/payments/${paymentId}/receipt`,
  });

  return sendEmail({
    to: email,
    subject,
    html,
    text,
    logPrefix: "[payments]",
    emailType: "payment_receipt",
    referenceNumber: payment.record_id,
  });
}
