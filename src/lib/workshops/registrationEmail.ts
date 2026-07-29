import { productionSendingEnabled } from "@/lib/shared/env";
import { sendEmail, type EmailResult } from "@/lib/shared/email/dispatch";
import {
  buildRegistrationAcknowledgementEmail,
  buildRegistrationAdminNotificationEmail,
} from "./registrationEmailTemplates";
import type { WorkshopRegistrationRecord } from "./registrationStorage";

export type { EmailResult };

export async function sendRegistrationAcknowledgementEmail(
  record: WorkshopRegistrationRecord
): Promise<EmailResult> {
  const { subject, html, text } = buildRegistrationAcknowledgementEmail(record);
  return sendEmail({ to: record.email, subject, html, text, logPrefix: "[workshops]" });
}

export async function sendRegistrationAdminNotificationEmail(
  record: WorkshopRegistrationRecord
): Promise<EmailResult> {
  const adminTo = process.env.EMAIL_ADMIN_NOTIFICATION_TO;
  if (!adminTo && productionSendingEnabled()) {
    console.error("[workshops] EMAIL_ADMIN_NOTIFICATION_TO is not set — cannot notify admin");
    return { ok: false, error: "admin-recipient-not-configured", attempts: 0, permanent: true };
  }
  const { subject, html, text } = buildRegistrationAdminNotificationEmail(record);
  return sendEmail({
    to: adminTo ?? "admin-notification-recipient-not-yet-configured@ordiftstudios.test",
    subject,
    html,
    text,
    logPrefix: "[workshops]",
  });
}
