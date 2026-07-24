import { Resend } from "resend";
import { productionSendingEnabled } from "@/lib/shared/env";
import { buildAcknowledgementEmail, buildAdminNotificationEmail } from "./emailTemplates";
import type { EnquiryRecord } from "./storage";

export type EmailResult = { ok: true; mode: "sent" | "logged" } | { ok: false; error: string };

async function dispatch(
  to: string,
  subject: string,
  html: string,
  text: string
): Promise<EmailResult> {
  // Staging (or production without legal approval) never sends a real
  // email — the content is logged instead, so the full flow is still
  // testable end-to-end without risking a real message going out.
  if (!productionSendingEnabled()) {
    console.log(`[enquiry:test-mode] would send email to ${to}\nSubject: ${subject}\n${text}\n`);
    return { ok: true, mode: "logged" };
  }

  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM_ADDRESS;
  if (!apiKey || !from) {
    console.error("[enquiry] production sending enabled but email credentials are missing");
    return { ok: false, error: "email-not-configured" };
  }

  try {
    const resend = new Resend(apiKey);
    await resend.emails.send({ from, to, subject, html, text });
    return { ok: true, mode: "sent" };
  } catch (err) {
    console.error("[enquiry] email send failed", err);
    return { ok: false, error: "email-send-failed" };
  }
}

export async function sendAcknowledgementEmail(record: EnquiryRecord): Promise<EmailResult> {
  const { subject, html, text } = buildAcknowledgementEmail(record);
  return dispatch(record.email, subject, html, text);
}

export async function sendAdminNotificationEmail(record: EnquiryRecord): Promise<EmailResult> {
  const adminTo = process.env.EMAIL_ADMIN_NOTIFICATION_TO;
  // A real recipient is only required once we're actually capable of
  // sending — in staging/test mode, dispatch() logs instead of sending,
  // so a placeholder is fine and doesn't block testing the full flow.
  if (!adminTo && productionSendingEnabled()) {
    console.error("[enquiry] EMAIL_ADMIN_NOTIFICATION_TO is not set — cannot notify admin");
    return { ok: false, error: "admin-recipient-not-configured" };
  }
  const { subject, html, text } = buildAdminNotificationEmail(record);
  return dispatch(adminTo ?? "admin-notification-recipient-not-yet-configured@ordiftstudios.test", subject, html, text);
}
