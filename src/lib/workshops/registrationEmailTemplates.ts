import type { WorkshopRegistrationRecord } from "./registrationStorage";
import { fullNameOf } from "./registrationStorage";
import { siteUrl } from "@/lib/shared/env";

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

// Closure refinement (2026-08-25) — reuses the existing portal
// login/signup `next` redirect (isSafeReturnPath in
// src/lib/portal/roles.ts) to carry the registrant straight to their
// pending payment after authentication, exactly as RegistrationForm.tsx's
// on-screen success state does. Null registrationId (e.g. the QA
// verify-send route's synthetic record) simply omits the payment
// section rather than linking to a broken path.
function paymentActionHtml(record: WorkshopRegistrationRecord): string {
  if (record.paymentStatus !== "Pending" || !record.registrationId) return "";
  const nextPath = `/portal/client/projects/workshop/${record.registrationId}/payments`;
  const nextParam = `?next=${encodeURIComponent(nextPath)}`;
  const loginUrl = `${siteUrl()}/portal/login${nextParam}`;
  const signupUrl = `${siteUrl()}/portal/signup${nextParam}`;
  return `
    <p style="margin:0 0 12px;font-family:${SANS};font-size:15px;line-height:1.6;color:${NAVY};">
      Payment is required to complete your registration — you can pay online now:
    </p>
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 20px;">
      <tr>
        <td style="border-radius:999px;background:${GOLD};">
          <a href="${loginUrl}" style="display:inline-block;padding:10px 20px;font-family:${SANS};font-size:14px;font-weight:bold;color:${NAVY};text-decoration:none;">
            Already registered — sign in to pay
          </a>
        </td>
        <td style="width:12px;"></td>
        <td style="border-radius:999px;border:1px solid ${NAVY};">
          <a href="${signupUrl}" style="display:inline-block;padding:10px 20px;font-family:${SANS};font-size:14px;font-weight:bold;color:${NAVY};text-decoration:none;">
            New here — create an account
          </a>
        </td>
      </tr>
    </table>
  `;
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
           You're registered for <strong>${record.workshopTitle}</strong>. Your place is confirmed —
           ${record.paymentStatus === "Pending" ? "payment is still required to complete it." : "no payment is required for this workshop."}
         </p>
         ${paymentActionHtml(record)}`;

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

  const paymentTextLines =
    record.paymentStatus === "Pending" && record.registrationId
      ? [
          "",
          "Payment is required to complete your registration:",
          `Sign in to pay: ${siteUrl()}/portal/login?next=${encodeURIComponent(`/portal/client/projects/workshop/${record.registrationId}/payments`)}`,
          `New here — create an account: ${siteUrl()}/portal/signup?next=${encodeURIComponent(`/portal/client/projects/workshop/${record.registrationId}/payments`)}`,
        ]
      : [];

  return { subject, html: wrap(bodyHtml), text: [toPlainText(record), ...paymentTextLines].join("\n") };
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

// ============================================================
// Workshop Management V1, Phase C (2026-08-25) — participant
// communication lifecycle. Every template below reuses this file's
// existing wrap()/escapeHtml() and the shared sendEmail() dispatch
// path (src/lib/shared/email/dispatch.ts) — no second notification
// system. Each is only sent from a real, already-existing system event
// (see the calling sites) — never a fabricated schedule/reminder.
// ============================================================

export function buildPaymentConfirmedEmail(params: {
  firstName: string;
  workshopTitle: string;
  registrationReference: string;
  amountPaidUsd: number;
}) {
  const { firstName, workshopTitle, registrationReference, amountPaidUsd } = params;
  const subject = `Payment received — ${registrationReference}`;
  const bodyHtml = `
    <h1 style="margin:0 0 16px;font-family:${SERIF};font-size:24px;color:${NAVY};font-weight:normal;">
      Thank you, ${escapeHtml(firstName)}.
    </h1>
    <p style="margin:0 0 16px;font-family:${SANS};font-size:15px;line-height:1.6;color:${NAVY};">
      We've received your payment of <strong>$${amountPaidUsd.toFixed(2)} USD</strong> for
      <strong>${escapeHtml(workshopTitle)}</strong>. Your registration
      (<strong>${registrationReference}</strong>) is now confirmed.
    </p>
    <p style="margin:0;font-family:${SANS};font-size:14px;line-height:1.6;color:${INK_MUTED};">
      If anything looks wrong, just reply to this email and mention your reference number.
    </p>
  `;
  return {
    subject,
    html: wrap(bodyHtml),
    text: `Payment received for ${workshopTitle}. Reference: ${registrationReference}. Amount: $${amountPaidUsd.toFixed(2)} USD.`,
  };
}

export function buildProjectRequestDecidedEmail(params: {
  firstName: string;
  workshopTitle: string;
  registrationReference: string;
  requestTypeLabel: string;
  decision: "approved" | "rejected";
  staffResponse: string | null;
}) {
  const { firstName, workshopTitle, registrationReference, requestTypeLabel, decision, staffResponse } = params;
  const subject = `${requestTypeLabel} ${decision} — ${registrationReference}`;
  const decisionLine =
    decision === "approved"
      ? `Your ${requestTypeLabel.toLowerCase()} for <strong>${escapeHtml(workshopTitle)}</strong> has been approved.`
      : `Your ${requestTypeLabel.toLowerCase()} for <strong>${escapeHtml(workshopTitle)}</strong> was not approved.`;
  const bodyHtml = `
    <h1 style="margin:0 0 16px;font-family:${SERIF};font-size:24px;color:${NAVY};font-weight:normal;">
      Hello, ${escapeHtml(firstName)}.
    </h1>
    <p style="margin:0 0 16px;font-family:${SANS};font-size:15px;line-height:1.6;color:${NAVY};">
      ${decisionLine} Reference: <strong>${registrationReference}</strong>.
    </p>
    ${
      staffResponse
        ? `<p style="margin:0 0 16px;font-family:${SANS};font-size:15px;line-height:1.6;color:${NAVY};">
             ${escapeHtml(staffResponse)}
           </p>`
        : ""
    }
    <p style="margin:0;font-family:${SANS};font-size:14px;line-height:1.6;color:${INK_MUTED};">
      Questions? Just reply to this email and mention your reference number.
    </p>
  `;
  return {
    subject,
    html: wrap(bodyHtml),
    text: `${requestTypeLabel} ${decision} for ${workshopTitle}. Reference: ${registrationReference}.${staffResponse ? ` ${staffResponse}` : ""}`,
  };
}

const TRAVEL_ASSISTANCE_STATUS_MESSAGES: Record<string, string> = {
  in_progress: "Our team is now working on your travel/accommodation assistance request.",
  arranged: "We've arranged your travel/accommodation assistance — our team will follow up with the details.",
  declined: "We're unable to assist with this particular travel/accommodation request. Our team will reach out if alternatives are available.",
  cancelled: "Your travel/accommodation assistance request has been cancelled.",
};

export function buildTravelAssistanceStatusEmail(params: {
  firstName: string;
  workshopTitle: string;
  registrationReference: string;
  status: string;
}) {
  const { firstName, workshopTitle, registrationReference, status } = params;
  const statusMessage = TRAVEL_ASSISTANCE_STATUS_MESSAGES[status] ?? `Your travel/accommodation assistance request status is now: ${status}.`;
  const subject = `Travel assistance update — ${registrationReference}`;
  const bodyHtml = `
    <h1 style="margin:0 0 16px;font-family:${SERIF};font-size:24px;color:${NAVY};font-weight:normal;">
      Hello, ${escapeHtml(firstName)}.
    </h1>
    <p style="margin:0 0 16px;font-family:${SANS};font-size:15px;line-height:1.6;color:${NAVY};">
      An update on the travel/accommodation assistance you requested for
      <strong>${escapeHtml(workshopTitle)}</strong> (${registrationReference}):
    </p>
    <p style="margin:0 0 16px;font-family:${SANS};font-size:15px;line-height:1.6;color:${NAVY};">
      ${statusMessage}
    </p>
    <p style="margin:0;font-family:${SANS};font-size:14px;line-height:1.6;color:${INK_MUTED};">
      This remains a manually-arranged request — no external booking has been made automatically.
    </p>
  `;
  return { subject, html: wrap(bodyHtml), text: `${statusMessage} (${workshopTitle}, ${registrationReference})` };
}

const WORKSHOP_NOTICE_LABELS: Record<string, string> = {
  cancelled: "Workshop cancelled",
  rescheduled: "Workshop rescheduled",
  update: "Workshop update",
};

export function buildWorkshopNoticeEmail(params: {
  firstName: string;
  workshopTitle: string;
  registrationReference: string;
  noticeType: string;
  message: string;
}) {
  const { firstName, workshopTitle, registrationReference, noticeType, message } = params;
  const label = WORKSHOP_NOTICE_LABELS[noticeType] ?? "Workshop update";
  const subject = `${label} — ${escapeHtml(workshopTitle)}`;
  const bodyHtml = `
    <h1 style="margin:0 0 16px;font-family:${SERIF};font-size:24px;color:${NAVY};font-weight:normal;">
      ${label}
    </h1>
    <p style="margin:0 0 16px;font-family:${SANS};font-size:15px;line-height:1.6;color:${NAVY};">
      Hello ${escapeHtml(firstName)}, this concerns your registration
      (<strong>${registrationReference}</strong>) for <strong>${escapeHtml(workshopTitle)}</strong>.
    </p>
    <p style="margin:0 0 16px;font-family:${SANS};font-size:15px;line-height:1.6;color:${NAVY};white-space:pre-line;">
      ${escapeHtml(message)}
    </p>
    <p style="margin:0;font-family:${SANS};font-size:14px;line-height:1.6;color:${INK_MUTED};">
      Questions? Just reply to this email and mention your reference number.
    </p>
  `;
  return { subject, html: wrap(bodyHtml), text: `${label} — ${workshopTitle} (${registrationReference}): ${message}` };
}

export function buildInstructorEngagementApprovedEmail(params: {
  recipientName: string;
  workshopTitle: string;
  role: string;
  amount: number;
  currency: string;
}) {
  const { recipientName, workshopTitle, role, amount, currency } = params;
  const subject = `Compensation approved — ${workshopTitle}`;
  const bodyHtml = `
    <h1 style="margin:0 0 16px;font-family:${SERIF};font-size:24px;color:${NAVY};font-weight:normal;">
      Hello, ${escapeHtml(recipientName)}.
    </h1>
    <p style="margin:0 0 16px;font-family:${SANS};font-size:15px;line-height:1.6;color:${NAVY};">
      Your engagement as <strong>${escapeHtml(role)}</strong> for <strong>${escapeHtml(workshopTitle)}</strong>
      has an approved compensation obligation of <strong>${currency} ${amount.toFixed(2)}</strong>.
    </p>
    <p style="margin:0;font-family:${SANS};font-size:14px;line-height:1.6;color:${INK_MUTED};">
      This confirms the internal obligation record only — it does not itself move any money; our team will
      follow up separately on payment arrangements.
    </p>
  `;
  return {
    subject,
    html: wrap(bodyHtml),
    text: `Compensation approved for ${role} — ${workshopTitle}: ${currency} ${amount.toFixed(2)}.`,
  };
}
