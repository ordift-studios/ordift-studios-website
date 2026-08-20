import { escapeHtml, wrap, SERIF, SANS, NAVY, GOLD, INK_MUTED } from "@/lib/enquiry/emailTemplates";
import { pathwayLabel } from "@/lib/enquiry/pathways";
import { dispatchNotification } from "./dispatch";
import { resolveNewBookingRecipients } from "./recipients";
import { siteUrl } from "@/lib/shared/env";

// CRM Lifecycle Automation Phase 1, Batch 3 (2026-08-20) — internal
// operational notification, distinct from the two client-facing emails
// (lifecycleEmails.ts) and from the payment receipt (payments/
// receipts.ts): three separate communications arising from the same
// underlying "full/booking payment confirmed" business event. This one
// tells staff a new booking needs attention; it never replaces either
// client email.
//
// Content is deliberately limited to what safely exists in the current
// data model — no project/event date (no such field exists anywhere on
// `enquiries` yet, confirmed by direct search; inventing one here would
// be worse than omitting it) and no card/gateway/exchange-rate detail
// (that stays in the payment receipt, not this internal summary).

function formatUsd(amount: number): string {
  return `$${amount.toFixed(2)}`;
}

export type NewBookingNotificationData = {
  entityType: string;
  entityId: string;
  referenceNumber: string;
  clientName: string;
  service: string;
  amountPaid: number;
  amountDue: number;
};

export function buildNewBookingNotificationEmail(data: NewBookingNotificationData): {
  subject: string;
  html: string;
  text: string;
} {
  const subject = `New Booking Confirmed — ${data.referenceNumber}`;
  const adminUrl = `${siteUrl()}/admin/enquiries/${data.entityId}`;
  const outstanding = Math.max(0, Math.round((data.amountDue - data.amountPaid) * 100) / 100);

  const rows: [string, string][] = [
    ["Reference", escapeHtml(data.referenceNumber)],
    ["Client", escapeHtml(data.clientName)],
    ["Service", escapeHtml(pathwayLabel(data.service))],
    ["Status", "Booking confirmed — full payment received"],
    ["Amount paid", formatUsd(data.amountPaid)],
    ...(outstanding > 0 ? ([["Outstanding balance", formatUsd(outstanding)]] as [string, string][]) : []),
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

  const bodyHtml = `
    <p style="margin:0 0 4px;font-family:${SANS};font-size:13px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:${GOLD};">
      New Booking
    </p>
    <h1 style="margin:0 0 20px;font-family:${SERIF};font-size:24px;color:${NAVY};font-weight:normal;">
      A booking is now confirmed
    </h1>
    <table role="presentation" width="100%" style="margin-bottom:24px;">${rowsHtml}</table>
    <table role="presentation" width="100%" style="margin-bottom:8px;">
      <tr>
        <td align="center">
          <a href="${adminUrl}" style="display:inline-block;padding:12px 28px;background:${GOLD};color:${NAVY};font-family:${SANS};font-size:14px;font-weight:600;text-decoration:none;border-radius:999px;">
            View in Admin Platform
          </a>
        </td>
      </tr>
    </table>
  `;

  const html = wrap(bodyHtml, "Ordift Studios · Internal notification — not sent to the client.");
  const text = [
    `New Booking`,
    ``,
    `A booking is now confirmed.`,
    ``,
    `Reference: ${data.referenceNumber}`,
    `Client: ${data.clientName}`,
    `Service: ${pathwayLabel(data.service)}`,
    `Status: Booking confirmed — full payment received`,
    `Amount paid: ${formatUsd(data.amountPaid)}`,
    ...(outstanding > 0 ? [`Outstanding balance: ${formatUsd(outstanding)}`] : []),
    ``,
    `View in Admin Platform: ${adminUrl}`,
  ].join("\n");

  return { subject, html, text };
}

export type NewBookingNotificationResult = { recipientCount: number; sentCount: number };

// Resolves recipients (recipients.ts) and sends one notification per
// recipient — never a single email with every admin's address in `to`.
// Swallows its own errors per recipient (one failed send must never
// block the others) and never throws — the caller (advanceStageOnFullPayment)
// must be able to treat this as fire-and-forget without risking the
// already-successful stage advance it follows.
export async function sendNewBookingNotification(
  data: NewBookingNotificationData
): Promise<NewBookingNotificationResult> {
  try {
    const recipients = await resolveNewBookingRecipients(data.entityType, data.entityId);
    if (recipients.length === 0) {
      console.error("[notifications] sendNewBookingNotification: no eligible recipients found", data.referenceNumber);
      return { recipientCount: 0, sentCount: 0 };
    }

    const { subject, html, text } = buildNewBookingNotificationEmail(data);

    const results = await Promise.all(
      recipients.map(async (recipient) => {
        try {
          const result = await dispatchNotification({
            channels: ["email"],
            email: {
              to: recipient.email,
              subject,
              html,
              text,
              logPrefix: "[notifications]",
              emailType: "internal-new-booking",
              referenceNumber: data.referenceNumber,
            },
          });
          return result.email?.ok === true;
        } catch (err) {
          console.error("[notifications] sendNewBookingNotification: send failed for one recipient", recipient.userId, err);
          return false;
        }
      })
    );

    return { recipientCount: recipients.length, sentCount: results.filter(Boolean).length };
  } catch (err) {
    console.error("[notifications] sendNewBookingNotification threw", data.referenceNumber, err);
    return { recipientCount: 0, sentCount: 0 };
  }
}
