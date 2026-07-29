import { productionSendingEnabled } from "@/lib/shared/env";
import { sendEmail, type EmailResult } from "@/lib/shared/email/dispatch";
import { buildAcknowledgementEmail, buildAdminNotificationEmail } from "./emailTemplates";
import type { EnquiryRecord } from "./storage";

export type { EmailResult };

export async function sendAcknowledgementEmail(record: EnquiryRecord): Promise<EmailResult> {
  const { subject, html, text } = buildAcknowledgementEmail(record);
  return sendEmail({
    to: record.email,
    subject,
    html,
    text,
    logPrefix: "[enquiry]",
    emailType: "enquiry-acknowledgement",
    referenceNumber: record.referenceNumber,
  });
}

export async function sendAdminNotificationEmail(record: EnquiryRecord): Promise<EmailResult> {
  const adminTo = process.env.EMAIL_ADMIN_NOTIFICATION_TO;
  // A real recipient is only required once we're actually capable of
  // sending — in staging/test mode, sendEmail() logs instead of
  // sending, so a placeholder is fine and doesn't block testing the
  // full flow.
  if (!adminTo && productionSendingEnabled()) {
    console.error("[enquiry] EMAIL_ADMIN_NOTIFICATION_TO is not set — cannot notify admin");
    return { ok: false, error: "admin-recipient-not-configured", attempts: 0, permanent: true };
  }
  const { subject, html, text } = buildAdminNotificationEmail(record);
  return sendEmail({
    to: adminTo ?? "admin-notification-recipient-not-yet-configured@ordiftstudios.test",
    subject,
    html,
    text,
    logPrefix: "[enquiry]",
    emailType: "enquiry-admin-notification",
    referenceNumber: record.referenceNumber,
  });
}
