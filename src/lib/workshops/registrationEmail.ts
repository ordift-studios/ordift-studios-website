import { Resend } from "resend";
import { productionSendingEnabled } from "@/lib/shared/env";
import {
  buildRegistrationAcknowledgementEmail,
  buildRegistrationAdminNotificationEmail,
} from "./registrationEmailTemplates";
import type { WorkshopRegistrationRecord } from "./registrationStorage";

export type EmailResult = { ok: true; mode: "sent" | "logged" } | { ok: false; error: string };

async function dispatch(
  to: string,
  subject: string,
  html: string,
  text: string
): Promise<EmailResult> {
  if (!productionSendingEnabled()) {
    console.log(`[workshops:test-mode] would send email to ${to}\nSubject: ${subject}\n${text}\n`);
    return { ok: true, mode: "logged" };
  }

  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM_ADDRESS;
  if (!apiKey || !from) {
    console.error("[workshops] production sending enabled but email credentials are missing");
    return { ok: false, error: "email-not-configured" };
  }

  try {
    const resend = new Resend(apiKey);
    await resend.emails.send({ from, to, subject, html, text });
    return { ok: true, mode: "sent" };
  } catch (err) {
    console.error("[workshops] email send failed", err);
    return { ok: false, error: "email-send-failed" };
  }
}

export async function sendRegistrationAcknowledgementEmail(
  record: WorkshopRegistrationRecord
): Promise<EmailResult> {
  const { subject, html, text } = buildRegistrationAcknowledgementEmail(record);
  return dispatch(record.email, subject, html, text);
}

export async function sendRegistrationAdminNotificationEmail(
  record: WorkshopRegistrationRecord
): Promise<EmailResult> {
  const adminTo = process.env.EMAIL_ADMIN_NOTIFICATION_TO;
  if (!adminTo && productionSendingEnabled()) {
    console.error("[workshops] EMAIL_ADMIN_NOTIFICATION_TO is not set — cannot notify admin");
    return { ok: false, error: "admin-recipient-not-configured" };
  }
  const { subject, html, text } = buildRegistrationAdminNotificationEmail(record);
  return dispatch(adminTo ?? "admin-notification-recipient-not-yet-configured@ordiftstudios.test", subject, html, text);
}
