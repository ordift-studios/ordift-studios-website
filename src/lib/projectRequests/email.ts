import { productionSendingEnabled } from "@/lib/shared/env";
import { sendEmail, type EmailResult } from "@/lib/shared/email/dispatch";
import { buildProjectRequestAcknowledgementEmail, buildProjectRequestAdminNotificationEmail } from "./emailTemplates";
import type { ProjectRequestRecord } from "./sheetsSync";

export type { EmailResult };

export async function sendProjectRequestAcknowledgementEmail(record: ProjectRequestRecord): Promise<EmailResult> {
  const { subject, html, text } = buildProjectRequestAcknowledgementEmail(record);
  return sendEmail({
    to: record.email,
    subject,
    html,
    text,
    logPrefix: "[projectRequests]",
    emailType: "project-request-acknowledgement",
    referenceNumber: record.referenceNumber,
  });
}

export async function sendProjectRequestAdminNotificationEmail(record: ProjectRequestRecord): Promise<EmailResult> {
  const adminTo = process.env.EMAIL_ADMIN_NOTIFICATION_TO;
  if (!adminTo && productionSendingEnabled()) {
    console.error("[projectRequests] EMAIL_ADMIN_NOTIFICATION_TO is not set — cannot notify admin");
    return { ok: false, error: "admin-recipient-not-configured", attempts: 0, permanent: true };
  }
  const { subject, html, text } = buildProjectRequestAdminNotificationEmail(record);
  return sendEmail({
    to: adminTo ?? "admin-notification-recipient-not-yet-configured@ordiftstudios.test",
    subject,
    html,
    text,
    logPrefix: "[projectRequests]",
    emailType: "project-request-admin-notification",
    referenceNumber: record.referenceNumber,
  });
}
