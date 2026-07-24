import { pathwayLabel } from "./pathways";
import { budgetRangeLabel } from "./budgetRanges";
import type { EnquiryRecord } from "./storage";

// Email-safe font stacks — custom web fonts (Fraunces/Inter) aren't
// reliably supported across email clients, so these are the closest
// email-safe analogs: a serif for the display line, a system sans for
// body copy. Same navy/gold palette as the site.
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
                  Ordift Studios · This is an automated message regarding your enquiry.
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

export function buildAcknowledgementEmail(record: EnquiryRecord) {
  const subject = `We've received your enquiry — ${record.referenceNumber}`;

  const bodyHtml = `
    <h1 style="margin:0 0 16px;font-family:${SERIF};font-size:24px;color:${NAVY};font-weight:normal;">
      Thank you, ${escapeHtml(record.fullName.split(" ")[0] || record.fullName)}.
    </h1>
    <p style="margin:0 0 16px;font-family:${SANS};font-size:15px;line-height:1.6;color:${NAVY};">
      We've received your ${escapeHtml(pathwayLabel(record.service))} enquiry. Your reference number is:
    </p>
    <p style="margin:0 0 20px;font-family:${SANS};font-size:18px;font-weight:bold;color:${NAVY};letter-spacing:0.03em;">
      ${record.referenceNumber}
    </p>
    <p style="margin:0 0 20px;font-family:${SANS};font-size:14px;line-height:1.6;color:${INK_MUTED};">
      Submitting this form does not confirm a booking. Ordift Studios will
      review your request and contact you to discuss availability, scope,
      timeline and pricing.
    </p>
    <p style="margin:0;font-family:${SANS};font-size:14px;line-height:1.6;color:${INK_MUTED};">
      If anything about your request changes in the meantime, just reply
      to this email and mention your reference number.
    </p>
  `;

  return { subject, html: wrap(bodyHtml), text: toPlainText(record) };
}

export function buildAdminNotificationEmail(record: EnquiryRecord) {
  const subject = `New enquiry — ${pathwayLabel(record.service)} — ${record.referenceNumber}`;

  const rows: [string, string][] = [
    ["Reference", record.referenceNumber],
    ["Environment", record.environment],
    ["Submitted", record.submittedAt],
    ["Service", pathwayLabel(record.service)],
    ["Name", record.fullName],
    ["Company", record.companyName || "—"],
    ["Email", record.email],
    ["Phone / WhatsApp", record.phone],
    ["Country", record.country || "—"],
    ["Project type", record.projectType || "—"],
    ["Project location", record.projectLocation || "—"],
    ["Timeframe", record.timeframe || "—"],
    ["Budget range", record.budgetRange ? budgetRangeLabel(record.budgetRange) : "—"],
    ["Reference link", record.referenceLink || "—"],
    ["Heard about us via", record.hearAboutUs || "—"],
    ["Marketing consent", record.marketingConsent ? "Yes" : "No"],
    ["Source page", record.sourcePage || "—"],
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
      New enquiry received
    </h1>
    <table role="presentation" width="100%" style="margin-bottom:20px;">${rowsHtml}</table>
    <p style="margin:0 0 4px;font-family:${SANS};font-size:13px;color:${INK_MUTED};">Description</p>
    <p style="margin:0;font-family:${SANS};font-size:14px;line-height:1.6;color:${NAVY};white-space:pre-wrap;">${escapeHtml(record.description)}</p>
  `;

  return { subject, html: wrap(bodyHtml), text: toPlainText(record) };
}

function toPlainText(record: EnquiryRecord): string {
  return [
    `Reference: ${record.referenceNumber}`,
    `Service: ${pathwayLabel(record.service)}`,
    `Name: ${record.fullName}`,
    `Email: ${record.email}`,
    `Phone: ${record.phone}`,
    `Description: ${record.description}`,
  ].join("\n");
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
