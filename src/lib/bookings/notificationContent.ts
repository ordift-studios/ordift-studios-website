// BOOKING NOTIFICATIONS - content (pure: no I/O, no clock). A booking CONFIRMATION is the only thing that produces these messages; a payment, a payment verification or a stage edit never does.
// Approved: the client "Booking Confirmed" e-mail and the internal "New Booking Confirmed" notice. NOT yet approved (wording proposed for the Founder, never sent): the client change / cancellation notices at the bottom.
import { escapeHtml, wrap, SERIF, SANS, NAVY, GOLD, INK_MUTED } from "@/lib/enquiry/emailTemplates";
import { pathwayLabel } from "@/lib/enquiry/pathways";
import type { Segment } from "./rules";

export const STUDIO_CONTACT_EMAIL = "support@ordiftstudios.com";   // the same studio contact the payment receipt already gives; no phone number is invented

const KIND_LABEL: Record<Segment["kind"], string> = { on_site: "On site", studio: "At the studio", online: "Online" };

/** "Tuesday 15 December 2026, 10:00–11:00 (Africa/Accra, GMT)" in the time zone the booking was made in. Same-day sessions share one date. */
export function formatSession(s: Pick<Segment, "startsAt" | "endsAt" | "timezone">): string {
  const start = new Date(s.startsAt), end = new Date(s.endsAt);
  const day = new Intl.DateTimeFormat("en-GB", { timeZone: s.timezone, weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const clock = new Intl.DateTimeFormat("en-GB", { timeZone: s.timezone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  const zone = new Intl.DateTimeFormat("en-GB", { timeZone: s.timezone, timeZoneName: "short" }).formatToParts(start).find((p) => p.type === "timeZoneName")?.value ?? "";
  const sameDay = day.format(start) === day.format(end);
  const range = sameDay ? `${day.format(start)}, ${clock.format(start)}–${clock.format(end)}` : `${day.format(start)} ${clock.format(start)} – ${day.format(end)} ${clock.format(end)}`;
  return `${range} (${s.timezone}${zone ? `, ${zone}` : ""})`;
}
const utcLine = (s: Pick<Segment, "startsAt" | "endsAt">) => `${new Date(s.startsAt).toISOString().slice(0, 16).replace("T", " ")}–${new Date(s.endsAt).toISOString().slice(11, 16)} UTC`;

/** Where it happens: the place for on-site and studio sessions, the platform for online ones; never invents a venue. */
export function formatPlace(s: Pick<Segment, "kind" | "location" | "platform">): string {
  const where = s.kind === "online" ? (s.platform ?? "").trim() : (s.location ?? "").trim();
  return where ? `${KIND_LABEL[s.kind]} — ${where}` : `${KIND_LABEL[s.kind]} — details to be confirmed with you`;
}

export type NoticeSession = Pick<Segment, "startsAt" | "endsAt" | "timezone" | "kind" | "location" | "platform" | "note">;

// ---------------------------------------------------------------------------------------------- client: Booking Confirmed
export type ClientConfirmationData = {
  enquiryId: string; referenceNumber: string; fullName: string; service: string; quotationReference: string | null; sessions: NoticeSession[]; siteUrl: string; version: number;
};
export function buildClientBookingConfirmed(d: ClientConfirmationData): { subject: string; html: string; text: string } {
  const subject = `Booking Confirmed — ${d.referenceNumber}`;
  const first = d.fullName.split(" ")[0] || d.fullName;
  const portalUrl = `${d.siteUrl}/portal/client/projects/enquiry/${d.enquiryId}/booking-details`;
  const service = pathwayLabel(d.service);
  const sessionsHtml = d.sessions.map((s, i) => `
      <tr><td style="padding:8px 0;font-family:${SANS};font-size:13px;color:${INK_MUTED};width:150px;vertical-align:top;border-bottom:1px solid #f0efec;">${d.sessions.length > 1 ? `Session ${i + 1}` : "Date and time"}</td>
      <td style="padding:8px 0;font-family:${SANS};font-size:14px;color:${NAVY};font-weight:500;border-bottom:1px solid #f0efec;">${escapeHtml(formatSession(s))}<br><span style="font-weight:400;color:${INK_MUTED};">${escapeHtml(formatPlace(s))}${s.note ? `<br>${escapeHtml(s.note)}` : ""}</span></td></tr>`).join("");
  const row = (l: string, v: string) => `<tr><td style="padding:8px 0;font-family:${SANS};font-size:13px;color:${INK_MUTED};width:150px;vertical-align:top;border-bottom:1px solid #f0efec;">${l}</td><td style="padding:8px 0;font-family:${SANS};font-size:14px;color:${NAVY};font-weight:500;border-bottom:1px solid #f0efec;">${v}</td></tr>`;
  const bodyHtml = `
    <p style="margin:0 0 4px;font-family:${SANS};font-size:13px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:${GOLD};">Booking Confirmed</p>
    <h1 style="margin:0 0 20px;font-family:${SERIF};font-size:26px;color:${NAVY};font-weight:normal;">Your booking is confirmed, ${escapeHtml(first)}.</h1>
    <p style="margin:0 0 20px;font-family:${SANS};font-size:15px;line-height:1.6;color:${NAVY};">We have confirmed the date, time and arrangements for your ${escapeHtml(service)} booking. Please keep this message for your records.</p>
    <table role="presentation" width="100%" style="margin-bottom:24px;">
      ${row("Booking reference", escapeHtml(d.referenceNumber))}
      ${row("Service", escapeHtml(service))}
      ${sessionsHtml}
      ${d.quotationReference ? row("Quotation", escapeHtml(d.quotationReference)) : ""}
    </table>
    <table role="presentation" width="100%" style="margin-bottom:20px;"><tr><td align="center">
      <a href="${portalUrl}" style="display:inline-block;padding:12px 28px;background:${GOLD};color:${NAVY};font-family:${SANS};font-size:14px;font-weight:600;text-decoration:none;border-radius:999px;">View your booking</a>
    </td></tr></table>
    <p style="margin:0;font-family:${SANS};font-size:13px;line-height:1.6;color:${INK_MUTED};">If anything here is not right, or you need to change it, contact us at <a href="mailto:${STUDIO_CONTACT_EMAIL}" style="color:${NAVY};">${STUDIO_CONTACT_EMAIL}</a> quoting ${escapeHtml(d.referenceNumber)}. This message confirms the booking itself; payment receipts are sent separately.</p>`;
  const html = wrap(bodyHtml, "Ordift Studios · This is an automated message regarding your booking.");
  const text = [
    "Booking Confirmed", "", `Your booking is confirmed, ${first}.`, "",
    `We have confirmed the date, time and arrangements for your ${service} booking.`, "",
    `Booking reference: ${d.referenceNumber}`, `Service: ${service}`,
    ...d.sessions.flatMap((s, i) => [`${d.sessions.length > 1 ? `Session ${i + 1}` : "Date and time"}: ${formatSession(s)}`, `  ${formatPlace(s)}`, ...(s.note ? [`  ${s.note}`] : [])]),
    ...(d.quotationReference ? [`Quotation: ${d.quotationReference}`] : []), "",
    `View your booking: ${portalUrl}`, "",
    `If anything here is not right, or you need to change it, contact us at ${STUDIO_CONTACT_EMAIL} quoting ${d.referenceNumber}.`,
    "This message confirms the booking itself; payment receipts are sent separately.",
  ].join("\n");
  return { subject, html, text };
}

// ---------------------------------------------------------------------------------------------- internal: New Booking Confirmed
export type InternalConfirmationData = {
  enquiryId: string; referenceNumber: string; clientName: string; service: string; quotationReference: string | null; sessions: NoticeSession[]; siteUrl: string; version: number; renewed: boolean;
  assignedLabel: string | null; confirmedByLabel: string | null; agreementRequired: boolean; agreementReference: string | null; paymentCondition: string | null; verifiedPaidUsd: number | null; outstandingUsd: number | null; basis: string | null;
};
export function buildInternalBookingConfirmed(d: InternalConfirmationData): { subject: string; html: string; text: string } {
  const subject = `New Booking Confirmed — ${d.referenceNumber}`;
  const adminUrl = `${d.siteUrl}/admin/enquiries/${d.enquiryId}`;
  const usd = (n: number | null) => (n === null ? "not recorded" : `$${n.toFixed(2)}`);
  const rows: [string, string][] = [
    ["Booking reference", d.referenceNumber], ["Client", d.clientName], ["Service", pathwayLabel(d.service)],
    ...(d.quotationReference ? ([["Quotation", d.quotationReference]] as [string, string][]) : []),
    ["Assigned", d.assignedLabel ?? "No person assigned"],
    ...d.sessions.flatMap((s, i): [string, string][] => [[d.sessions.length > 1 ? `Session ${i + 1}` : "Date and time", `${formatSession(s)} · ${utcLine(s)}`], [`  Arrangement`, formatPlace(s) + (s.note ? ` · ${s.note}` : "")]]),
    ["Payment condition", d.paymentCondition ?? "none"], ["Verified paid", usd(d.verifiedPaidUsd)], ["Outstanding", usd(d.outstandingUsd)],
    ["Agreement", d.agreementRequired ? `Required${d.agreementReference ? ` — ${d.agreementReference}` : ""}` : "Not required"],
    ...(d.confirmedByLabel ? ([["Confirmed by", d.confirmedByLabel]] as [string, string][]) : []),
    ...(d.renewed ? ([["Note", "Re-confirmed after an earlier cancellation"]] as [string, string][]) : []),
    ...(d.basis ? ([["Basis recorded", d.basis]] as [string, string][]) : []),
  ];
  const rowsHtml = rows.map(([l, v]) => `<tr><td style="padding:8px 0;font-family:${SANS};font-size:13px;color:${INK_MUTED};width:160px;vertical-align:top;border-bottom:1px solid #f0efec;">${escapeHtml(l)}</td><td style="padding:8px 0;font-family:${SANS};font-size:14px;color:${NAVY};font-weight:500;border-bottom:1px solid #f0efec;">${escapeHtml(v)}</td></tr>`).join("");
  const bodyHtml = `
    <p style="margin:0 0 4px;font-family:${SANS};font-size:13px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:${GOLD};">New Booking</p>
    <h1 style="margin:0 0 20px;font-family:${SERIF};font-size:24px;color:${NAVY};font-weight:normal;">A booking has been confirmed</h1>
    <table role="presentation" width="100%" style="margin-bottom:24px;">${rowsHtml}</table>
    <table role="presentation" width="100%"><tr><td align="center"><a href="${adminUrl}" style="display:inline-block;padding:12px 28px;background:${GOLD};color:${NAVY};font-family:${SANS};font-size:14px;font-weight:600;text-decoration:none;border-radius:999px;">View in Admin Platform</a></td></tr></table>`;
  const html = wrap(bodyHtml, "Ordift Studios · Internal notification — not sent to the client.");
  const text = ["New Booking Confirmed", "", ...rows.map(([l, v]) => `${l.trim()}: ${v}`), "", `View in Admin Platform: ${adminUrl}`].join("\n");
  return { subject, html, text };
}

// ---------------------------------------------------------------------------------------------- PROPOSED, NOT SENT (wording for the Founder's approval)
// Nothing calls these. They exist so the exact text can be reviewed (and tested for the things it must never say) before any client change / cancellation notice is switched on.
export function proposedClientCancellationNotice(d: { firstName: string; referenceNumber: string; service: string; cancelledSession: string; supportEmail?: string }): { subject: string; text: string } {
  const c = d.supportEmail ?? STUDIO_CONTACT_EMAIL;
  return {
    subject: `Booking cancelled — ${d.referenceNumber}`,
    text: [`Hello ${d.firstName},`, "",
      `Your ${pathwayLabel(d.service)} booking (reference ${d.referenceNumber}) for ${d.cancelledSession} has been cancelled. It is no longer confirmed, so please do not plan on that date.`, "",
      "We will contact you to agree a new date. Your accepted quotation and any payment you have made are unchanged and remain on your project; nothing is lost.", "",
      `If you have questions, contact ${c} quoting ${d.referenceNumber}.`].join("\n"),
  };
}
export function proposedClientRescheduleNotice(d: { firstName: string; referenceNumber: string; service: string; previousSession: string; newSession: string; newPlace: string; supportEmail?: string }): { subject: string; text: string } {
  const c = d.supportEmail ?? STUDIO_CONTACT_EMAIL;
  return {
    subject: `Booking updated — ${d.referenceNumber}`,
    text: [`Hello ${d.firstName},`, "",
      `The date or arrangements for your ${pathwayLabel(d.service)} booking (reference ${d.referenceNumber}) have changed.`, "",
      `Previously: ${d.previousSession}`, `Now confirmed: ${d.newSession}`, `Arrangement: ${d.newPlace}`, "",
      `Your booking remains confirmed on the new details above. If they do not suit you, contact ${c} quoting ${d.referenceNumber}.`].join("\n"),
  };
}
