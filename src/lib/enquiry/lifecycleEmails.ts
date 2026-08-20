import { escapeHtml, wrap, SERIF, SANS, NAVY, GOLD, INK_MUTED } from "./emailTemplates";
import { pathwayLabel } from "./pathways";
import { dispatchNotification } from "@/lib/notifications/dispatch";
import type { EmailResult } from "@/lib/shared/email/dispatch";
import { siteUrl } from "@/lib/shared/env";

// CRM Lifecycle Automation Phase 1, Batch 2 (2026-08-20) — two new
// client-facing lifecycle emails, distinct from every existing
// enquiry/payment email:
//   - Quotation Ready: fires once, only when an enquiry's crm_stage
//     genuinely transitions into "quotation_sent" (setAmountDueAction's
//     existing guarded side effect) — never on a later amount amendment
//     to an enquiry already past that stage, and never on a manual
//     crm_stage edit via updateStageAction (a structurally separate
//     code path that never calls into this file).
//   - Booking Confirmed: fires once, only when advanceStageOnFullPayment
//     genuinely advances crm_stage to "booked" — deliberately NOT the
//     same email as the payment receipt (receipts.ts): the receipt is
//     about the transaction, this is about the booking/project now
//     being secured. Both may arrive for the same event; they say
//     different things.
// Both call dispatchNotification() (src/lib/notifications/dispatch.ts)
// rather than sendEmail() directly, so they're already channel-neutral
// for when SMS is enabled later — today only the "email" channel is
// enabled (channels.ts), so only email ever actually sends.
//
// Recipient is always the enquiry's own self-reported `email` field —
// the same "send to the entity's own contact address, regardless of
// whether it's linked to a verified portal account" precedent already
// used by the acknowledgement email (sendAcknowledgementEmail) and the
// payment receipt (sendPaymentReceiptEmail's guest-entity fallback).
// Neither of those gates on account linkage or email-confirmation
// status, and this doesn't either — introducing a verification gate
// here would be new, inconsistent behavior, not a fix.
//
// Both senders swallow their own errors (never throw) — a notification
// failure must never fail or roll back the payment/quotation write
// that triggered it. Callers still get the EmailResult back so they
// can log it, but should never let it affect their own return value.

function formatUsd(amount: number): string {
  return `$${amount.toFixed(2)}`;
}

export type QuotationReadyData = {
  enquiryId: string;
  referenceNumber: string;
  fullName: string;
  email: string;
  service: string;
  amountDue: number;
};

export function buildQuotationReadyEmail(data: QuotationReadyData): { subject: string; html: string; text: string } {
  const subject = `Your Quotation is Ready — ${data.referenceNumber}`;
  const portalUrl = `${siteUrl()}/portal/client/projects/enquiry/${data.enquiryId}/payments`;
  const greetingName = escapeHtml(data.fullName.split(" ")[0] || data.fullName);

  const bodyHtml = `
    <p style="margin:0 0 4px;font-family:${SANS};font-size:13px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:${GOLD};">
      Quotation Ready
    </p>
    <h1 style="margin:0 0 20px;font-family:${SERIF};font-size:26px;color:${NAVY};font-weight:normal;">
      Hi ${greetingName}, your quotation is ready.
    </h1>
    <p style="margin:0 0 16px;font-family:${SANS};font-size:15px;line-height:1.6;color:${NAVY};">
      We've prepared a quotation for your ${escapeHtml(pathwayLabel(data.service))} enquiry
      (reference ${escapeHtml(data.referenceNumber)}):
    </p>
    <p style="margin:0 0 20px;font-family:${SANS};font-size:20px;font-weight:bold;color:${NAVY};">
      ${formatUsd(data.amountDue)}
    </p>
    <table role="presentation" width="100%" style="margin-bottom:24px;">
      <tr>
        <td align="center">
          <a href="${portalUrl}" style="display:inline-block;padding:12px 28px;background:${GOLD};color:${NAVY};font-family:${SANS};font-size:14px;font-weight:600;text-decoration:none;border-radius:999px;">
            View &amp; Pay in Client Portal
          </a>
        </td>
      </tr>
    </table>
    <p style="margin:0;font-family:${SANS};font-size:13px;line-height:1.6;color:${INK_MUTED};">
      If you have questions about this quotation, just reply to this email and mention your reference number.
    </p>
  `;

  const html = wrap(bodyHtml, "Ordift Studios · This is an automated message regarding your enquiry.");
  const text = [
    `Quotation Ready`,
    ``,
    `Hi ${data.fullName}, your quotation is ready.`,
    ``,
    `Reference: ${data.referenceNumber}`,
    `Amount: ${formatUsd(data.amountDue)}`,
    ``,
    `View and pay in the Client Portal: ${portalUrl}`,
    ``,
    `Questions? Reply to this email and mention your reference number.`,
  ].join("\n");

  return { subject, html, text };
}

export async function sendQuotationReadyEmail(data: QuotationReadyData): Promise<EmailResult | null> {
  try {
    const { subject, html, text } = buildQuotationReadyEmail(data);
    const result = await dispatchNotification({
      channels: ["email"],
      email: {
        to: data.email,
        subject,
        html,
        text,
        logPrefix: "[enquiry]",
        emailType: "enquiry-quotation-ready",
        referenceNumber: data.referenceNumber,
      },
    });
    return result.email ?? null;
  } catch (err) {
    console.error("[enquiry] sendQuotationReadyEmail threw", data.referenceNumber, err);
    return null;
  }
}

export type BookingConfirmedData = {
  enquiryId: string;
  referenceNumber: string;
  fullName: string;
  email: string;
  service: string;
};

export function buildBookingConfirmedEmail(data: BookingConfirmedData): { subject: string; html: string; text: string } {
  const subject = `Booking Confirmed — ${data.referenceNumber}`;
  const portalUrl = `${siteUrl()}/portal/client/projects/enquiry/${data.enquiryId}/timeline`;
  const greetingName = escapeHtml(data.fullName.split(" ")[0] || data.fullName);

  const bodyHtml = `
    <p style="margin:0 0 4px;font-family:${SANS};font-size:13px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:${GOLD};">
      Booking Confirmed
    </p>
    <h1 style="margin:0 0 20px;font-family:${SERIF};font-size:26px;color:${NAVY};font-weight:normal;">
      You're booked, ${greetingName}.
    </h1>
    <p style="margin:0 0 20px;font-family:${SANS};font-size:15px;line-height:1.6;color:${NAVY};">
      Your ${escapeHtml(pathwayLabel(data.service))} project (reference ${escapeHtml(data.referenceNumber)}) is now
      confirmed. Our team will be in touch with next steps.
    </p>
    <table role="presentation" width="100%" style="margin-bottom:24px;">
      <tr>
        <td align="center">
          <a href="${portalUrl}" style="display:inline-block;padding:12px 28px;background:${GOLD};color:${NAVY};font-family:${SANS};font-size:14px;font-weight:600;text-decoration:none;border-radius:999px;">
            View in Client Portal
          </a>
        </td>
      </tr>
    </table>
    <p style="margin:0;font-family:${SANS};font-size:13px;line-height:1.6;color:${INK_MUTED};">
      You'll separately receive a payment receipt for this transaction. This email confirms the booking itself.
    </p>
  `;

  const html = wrap(bodyHtml, "Ordift Studios · This is an automated message regarding your enquiry.");
  const text = [
    `Booking Confirmed`,
    ``,
    `You're booked, ${data.fullName}.`,
    ``,
    `Reference: ${data.referenceNumber}`,
    `Your project is now confirmed. Our team will be in touch with next steps.`,
    ``,
    `View in the Client Portal: ${portalUrl}`,
    ``,
    `You'll separately receive a payment receipt for this transaction. This email confirms the booking itself.`,
  ].join("\n");

  return { subject, html, text };
}

export async function sendBookingConfirmedEmail(data: BookingConfirmedData): Promise<EmailResult | null> {
  try {
    const { subject, html, text } = buildBookingConfirmedEmail(data);
    const result = await dispatchNotification({
      channels: ["email"],
      email: {
        to: data.email,
        subject,
        html,
        text,
        logPrefix: "[payments]",
        emailType: "enquiry-booking-confirmed",
        referenceNumber: data.referenceNumber,
      },
    });
    return result.email ?? null;
  } catch (err) {
    console.error("[payments] sendBookingConfirmedEmail threw", data.referenceNumber, err);
    return null;
  }
}
