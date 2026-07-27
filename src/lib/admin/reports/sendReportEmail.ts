import { Resend } from "resend";
import { productionSendingEnabled } from "@/lib/shared/env";

export type SendReportEmailResult = { ok: true; mode: "sent" | "logged" } | { ok: false; error: string };

// The "official Ordift Studios operations email" a report is sent to on
// demand — a dedicated var so it can differ from the transactional
// admin-notification address, but falls back to that existing one if
// unset, so this feature works the moment RESEND_API_KEY/
// EMAIL_FROM_ADDRESS/EMAIL_ADMIN_NOTIFICATION_TO are already configured
// without requiring a new credential first.
function operationsEmailAddress(): string | undefined {
  return process.env.OPERATIONS_EMAIL || process.env.EMAIL_ADMIN_NOTIFICATION_TO;
}

export async function sendReportEmail(params: {
  subject: string;
  bodyText: string;
  filename: string;
  contentType: string;
  attachment: Buffer;
}): Promise<SendReportEmailResult> {
  const to = operationsEmailAddress();

  // Same staging/production split as every other outbound email in
  // this codebase (src/lib/enquiry/email.ts) — staging always logs
  // instead of sending, so the whole flow is testable without risking
  // a real message.
  if (!productionSendingEnabled()) {
    console.log(
      `[reports:test-mode] would email "${params.filename}" (${params.attachment.length} bytes) to ${
        to ?? "(operations email not configured)"
      }\nSubject: ${params.subject}\n${params.bodyText}\n`
    );
    return { ok: true, mode: "logged" };
  }

  if (!to) {
    console.error("[reports] production sending enabled but no operations email is configured");
    return { ok: false, error: "operations-email-not-configured" };
  }

  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM_ADDRESS;
  if (!apiKey || !from) {
    console.error("[reports] production sending enabled but email credentials are missing");
    return { ok: false, error: "email-not-configured" };
  }

  try {
    const resend = new Resend(apiKey);
    await resend.emails.send({
      from,
      to,
      subject: params.subject,
      text: params.bodyText,
      attachments: [
        {
          filename: params.filename,
          content: params.attachment,
          contentType: params.contentType,
        },
      ],
    });
    return { ok: true, mode: "sent" };
  } catch (err) {
    console.error("[reports] report email send failed", err);
    return { ok: false, error: "email-send-failed" };
  }
}
