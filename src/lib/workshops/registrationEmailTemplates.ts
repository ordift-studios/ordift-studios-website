import type { WorkshopRegistrationRecord } from "./registrationStorage";
import { fullNameOf } from "./registrationStorage";

// Same email-safe font stacks and palette as the enquiry emails
// (src/lib/enquiry/emailTemplates.ts) — kept as a local copy rather than
// a shared import so the two systems stay fully independent, per the
// "structurally separate dataset" principle for workshops.
const SERIF = "Georgia, 'Times New Roman', serif";
const SANS = "-apple-system, Segoe UI, Roboto, Arial, sans-serif";
const NAVY = "#0B1220";
const GOLD = "#BFA14A";
const OFFWHITE = "#F7F5F1";
const INK_MUTED = "#5B5F6B";

function wrap(bodyHtml: string): string {
  return `<!DOCTYPE html>
<html>
  <body style="margin:0;padding:0;background:${OFFWHITE};font-family:${SANS};">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${OFFWHITE};padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" style="max-width:560px;background:#ffffff;border-radius:12px;overflow:hidden;">
            <tr>
              <td style="background:${NAVY};padding:28px 32px;">
                <span style="font-family:${SERIF};font-size:20px;color:#ffffff;letter-spacing:0.02em;">ORDIFT STUDIOS</span>
              </td>
            </tr>
            <tr><td style="height:3px;background:${GOLD};"></td></tr>
            <tr>
              <td style="padding:32px;">
                ${bodyHtml}
              </td>
            </tr>
            <tr>
              <td style="padding:20px 32px;border-top:1px solid #eeeeee;">
                <p style="margin:0;font-family:${SANS};font-size:12px;color:${INK_MUTED};">
                  Ordift Studios · This is an automated message regarding your workshop registration.
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

export function buildRegistrationAcknowledgementEmail(record: WorkshopRegistrationRecord) {
  const subject =
    record.registrationStatus === "Waitlisted"
      ? `You're on the waiting list — ${record.registrationReference}`
      : `Registration received — ${record.registrationReference}`;

  const statusParagraph =
    record.registrationStatus === "Waitlisted"
      ? `<p style="margin:0 0 20px;font-family:${SANS};font-size:15px;line-height:1.6;color:${NAVY};">
           ${record.workshopTitle} is currently full. You've been added to the
           waiting list${record.waitingListPosition ? ` at position ${record.waitingListPosition}` : ""} —
           we'll email you right away if a space opens up.
         </p>`
      : `<p style="margin:0 0 20px;font-family:${SANS};font-size:15px;line-height:1.6;color:${NAVY};">
           You're registered for <strong>${record.workshopTitle}</strong>. This
           confirms your registration only — ${
             record.paymentStatus === "Pending"
               ? "your place is finalized once payment is manually confirmed by our team; we'll follow up with payment details."
               : "no payment is required for this workshop."
           }
         </p>`;

  const bodyHtml = `
    <h1 style="margin:0 0 16px;font-family:${SERIF};font-size:24px;color:${NAVY};font-weight:normal;">
      Thank you, ${escapeHtml(record.firstName)}.
    </h1>
    <p style="margin:0 0 16px;font-family:${SANS};font-size:15px;line-height:1.6;color:${NAVY};">
      Your registration reference is:
    </p>
    <p style="margin:0 0 20px;font-family:${SANS};font-size:18px;font-weight:bold;color:${NAVY};letter-spacing:0.03em;">
      ${record.registrationReference}
    </p>
    ${statusParagraph}
    <p style="margin:0;font-family:${SANS};font-size:14px;line-height:1.6;color:${INK_MUTED};">
      If anything changes in the meantime, just reply to this email and
      mention your reference number.
    </p>
  `;

  return { subject, html: wrap(bodyHtml), text: toPlainText(record) };
}

export function buildRegistrationAdminNotificationEmail(record: WorkshopRegistrationRecord) {
  const subject = `New workshop registration — ${record.workshopTitle} — ${record.registrationReference}`;

  const rows: [string, string][] = [
    ["Reference", record.registrationReference],
    ["Environment", record.environment],
    ["Workshop", record.workshopTitle],
    ["Registration date", record.registrationDate],
    ["Status", record.registrationStatus],
    ["Waiting-list position", record.waitingListPosition ? String(record.waitingListPosition) : "—"],
    ["Payment status", record.paymentStatus],
    ["Name", fullNameOf(record)],
    ["Email", record.email],
    ["Phone / WhatsApp", record.phone],
    ["Country", record.country || "—"],
    ["Experience level", record.experienceLevel || "—"],
  ];

  const rowsHtml = rows
    .map(
      ([label, value]) => `
      <tr>
        <td style="padding:6px 0;font-family:${SANS};font-size:13px;color:${INK_MUTED};width:160px;vertical-align:top;">${label}</td>
        <td style="padding:6px 0;font-family:${SANS};font-size:13px;color:${NAVY};">${escapeHtml(value)}</td>
      </tr>`
    )
    .join("");

  const bodyHtml = `
    <h1 style="margin:0 0 16px;font-family:${SERIF};font-size:20px;color:${NAVY};font-weight:normal;">
      New workshop registration
    </h1>
    <table role="presentation" width="100%">${rowsHtml}</table>
  `;

  return { subject, html: wrap(bodyHtml), text: toPlainText(record) };
}

function toPlainText(record: WorkshopRegistrationRecord): string {
  return [
    `Reference: ${record.registrationReference}`,
    `Workshop: ${record.workshopTitle}`,
    `Status: ${record.registrationStatus}`,
    `Name: ${fullNameOf(record)}`,
    `Email: ${record.email}`,
  ].join("\n");
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
