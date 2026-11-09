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
export type NoticeEvent = "confirmed" | "changed" | "cancelled_pending" | "cancelled_final";
export type InternalConfirmationData = {
  event?: NoticeEvent; showMoney?: boolean; reason?: string | null; previousSessions?: NoticeSession[] | null;
  enquiryId: string; referenceNumber: string; clientName: string; service: string; quotationReference: string | null; sessions: NoticeSession[]; siteUrl: string; version: number; renewed: boolean;
  assignedLabel: string | null; confirmedByLabel: string | null; agreementRequired: boolean; agreementReference: string | null; paymentCondition: string | null; verifiedPaidUsd: number | null; outstandingUsd: number | null; basis: string | null;
};
const INTERNAL_TITLE: Record<NoticeEvent, { subject: string; heading: string }> = {
  confirmed: { subject: "New Booking Confirmed", heading: "A booking has been confirmed" }, changed: { subject: "Booking Rescheduled", heading: "A booking has been rescheduled" },
  cancelled_pending: { subject: "Booking Cancelled — Rescheduling Pending", heading: "A booking has been cancelled; a new date is to be agreed" }, cancelled_final: { subject: "Booking Cancelled (final)", heading: "A booking has been cancelled for good" },
};
export function buildInternalBookingConfirmed(d: InternalConfirmationData): { subject: string; html: string; text: string } {
  const ev = d.event ?? "confirmed", money = d.showMoney !== false, title = INTERNAL_TITLE[ev];
  const subject = `${title.subject} — ${d.referenceNumber}`;
  const adminUrl = `${d.siteUrl}/admin/enquiries/${d.enquiryId}`;
  const usd = (n: number | null) => (n === null ? "not recorded" : `$${n.toFixed(2)}`);
  const rows: [string, string][] = [
    ["Booking reference", d.referenceNumber], ["Client", d.clientName], ["Service", pathwayLabel(d.service)],
    ...(d.quotationReference ? ([["Quotation", d.quotationReference]] as [string, string][]) : []),
    ["Assigned", d.assignedLabel ?? "No person assigned"],
    ...(ev === "changed" && d.previousSessions?.length ? d.previousSessions.map((s, i): [string, string] => [d.previousSessions!.length > 1 ? `Was (session ${i + 1})` : "Was", formatSession(s)]) : []),
    ...d.sessions.flatMap((s, i): [string, string][] => [[ev.startsWith("cancelled") ? (d.sessions.length > 1 ? `Cancelled (session ${i + 1})` : "Cancelled booking") : d.sessions.length > 1 ? `Session ${i + 1}` : "Date and time", `${formatSession(s)} · ${utcLine(s)}`], [`  Arrangement`, formatPlace(s) + (s.note ? ` · ${s.note}` : "")]]),
    ...(ev.startsWith("cancelled") && d.reason ? ([["Reason", d.reason]] as [string, string][]) : []),
    ...(ev === "cancelled_final" ? ([["Money", "Nothing was refunded or changed by this cancellation; any refund is a separate decision"]] as [string, string][]) : []),
    ...(money ? ([["Payment condition", d.paymentCondition ?? "none"], ["Verified paid", usd(d.verifiedPaidUsd)], ["Outstanding", usd(d.outstandingUsd)]] as [string, string][]) : []),
    ["Agreement", d.agreementRequired ? `Required${d.agreementReference ? ` — ${d.agreementReference}` : ""}` : "Not required"],
    ...(d.confirmedByLabel ? ([[ev.startsWith("cancelled") ? "Cancelled by" : ev === "changed" ? "Changed by" : "Confirmed by", d.confirmedByLabel]] as [string, string][]) : []),
    ...(d.renewed && ev === "confirmed" ? ([["Note", "Re-confirmed after an earlier cancellation"]] as [string, string][]) : []),
    ...(money && d.basis ? ([["Basis recorded", d.basis]] as [string, string][]) : []),
  ];
  const rowsHtml = rows.map(([l, v]) => `<tr><td style="padding:8px 0;font-family:${SANS};font-size:13px;color:${INK_MUTED};width:160px;vertical-align:top;border-bottom:1px solid #f0efec;">${escapeHtml(l)}</td><td style="padding:8px 0;font-family:${SANS};font-size:14px;color:${NAVY};font-weight:500;border-bottom:1px solid #f0efec;">${escapeHtml(v)}</td></tr>`).join("");
  const bodyHtml = `
    <p style="margin:0 0 4px;font-family:${SANS};font-size:13px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:${GOLD};">${ev === "confirmed" ? "New Booking" : "Booking update"}</p>
    <h1 style="margin:0 0 20px;font-family:${SERIF};font-size:24px;color:${NAVY};font-weight:normal;">${escapeHtml(title.heading)}</h1>
    <table role="presentation" width="100%" style="margin-bottom:24px;">${rowsHtml}</table>
    <table role="presentation" width="100%"><tr><td align="center"><a href="${adminUrl}" style="display:inline-block;padding:12px 28px;background:${GOLD};color:${NAVY};font-family:${SANS};font-size:14px;font-weight:600;text-decoration:none;border-radius:999px;">View in Admin Platform</a></td></tr></table>`;
  const html = wrap(bodyHtml, "Ordift Studios · Internal notification — not sent to the client.");
  const text = [title.subject, "", ...rows.map(([l, v]) => `${l.trim()}: ${v}`), "", `View in Admin Platform: ${adminUrl}`].join("\n");
  return { subject, html, text };
}


// ---------------------------------------------------------------------------------------------- client: changed / cancelled (each reflects the CURRENT booking state)
export type ClientChangeData = ClientConfirmationData & { event: Exclude<NoticeEvent, "confirmed">; previousSessions?: NoticeSession[] | null; paidAnything?: boolean };
export function buildClientBookingNotice(d: ClientChangeData | (ClientConfirmationData & { event: "confirmed" })): { subject: string; html: string; text: string } {
  if (d.event === "confirmed") return buildClientBookingConfirmed(d);
  const first = d.fullName.split(" ")[0] || d.fullName, service = pathwayLabel(d.service), ref = d.referenceNumber;
  const portalUrl = `${d.siteUrl}/portal/client/projects/enquiry/${d.enquiryId}/booking-details`;
  const lines = (sessions: NoticeSession[], label: (i: number) => string) => sessions.flatMap((s, i) => [`${label(i)}: ${formatSession(s)}`, `  ${formatPlace(s)}`, ...(s.note ? [`  ${s.note}`] : [])]);
  let subject: string, heading: string, intro: string[], detail: string[], close: string;
  if (d.event === "changed") {
    subject = `Booking updated — ${ref}`; heading = "Your booking has been rescheduled and is confirmed";
    intro = [`The date or arrangements for your ${service} booking (reference ${ref}) have changed.`];
    detail = [...(d.previousSessions?.length ? lines(d.previousSessions, (i) => (d.previousSessions!.length > 1 ? `Previously (session ${i + 1})` : "Previously")) : []), ...lines(d.sessions, (i) => (d.sessions.length > 1 ? `Now confirmed (session ${i + 1})` : "Now confirmed"))];
    close = `Your booking is confirmed on the new details above only. If they do not suit you, contact ${STUDIO_CONTACT_EMAIL} quoting ${ref}.`;
  } else if (d.event === "cancelled_pending") {
    subject = `Booking cancelled — new date to be agreed — ${ref}`; heading = "Your booking has been cancelled for now";
    intro = [`Your ${service} booking (reference ${ref}) has been cancelled. It is no longer confirmed, so please do not plan on the date below.`];
    detail = lines(d.sessions, (i) => (d.sessions.length > 1 ? `Cancelled (session ${i + 1})` : "Cancelled"));
    close = `We will contact you to agree a new date; it is confirmed only when you receive a new Booking Confirmed message. Your accepted quotation and any payment you have made are unchanged. Questions: ${STUDIO_CONTACT_EMAIL} quoting ${ref}.`;
  } else {
    subject = `Booking cancelled — ${ref}`; heading = "Your booking has been cancelled";
    intro = [`Your ${service} booking (reference ${ref}) has been cancelled and will not be rescheduled. It is no longer confirmed.`];
    detail = lines(d.sessions, (i) => (d.sessions.length > 1 ? `Cancelled (session ${i + 1})` : "Cancelled"));
    close = d.paidAnything ? `Any payment you have made has not been changed or refunded by this cancellation; we will contact you separately about it. Questions: ${STUDIO_CONTACT_EMAIL} quoting ${ref}.` : `Questions: ${STUDIO_CONTACT_EMAIL} quoting ${ref}.`;
  }
  const p = (t: string, extra = "") => `<p style="margin:0 0 16px;font-family:${SANS};font-size:15px;line-height:1.6;color:${NAVY};${extra}">${escapeHtml(t)}</p>`;
  const bodyHtml = `
    <p style="margin:0 0 4px;font-family:${SANS};font-size:13px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:${GOLD};">Booking update</p>
    <h1 style="margin:0 0 20px;font-family:${SERIF};font-size:24px;color:${NAVY};font-weight:normal;">${escapeHtml(heading)}</h1>
    ${p(`Hello ${first},`)}${intro.map((t) => p(t)).join("")}
    ${detail.length ? `<p style="margin:0 0 16px;font-family:${SANS};font-size:14px;line-height:1.7;color:${NAVY};font-weight:500;">${detail.map((l) => escapeHtml(l)).join("<br>")}</p>` : ""}
    ${p(close)}
    <table role="presentation" width="100%"><tr><td align="center"><a href="${portalUrl}" style="display:inline-block;padding:12px 28px;background:${GOLD};color:${NAVY};font-family:${SANS};font-size:14px;font-weight:600;text-decoration:none;border-radius:999px;">View your booking</a></td></tr></table>`;
  const html = wrap(bodyHtml, "Ordift Studios · This is an automated message regarding your booking.");
  const text = [`Hello ${first},`, "", ...intro, "", ...detail, ...(detail.length ? [""] : []), close, "", `View your booking: ${portalUrl}`].join("\n");
  return { subject, html, text };
}

// ---------------------------------------------------------------------------------------------- the assigned person (operational facts only: no payment, no agreement, no client contact)
export type AssignedNoticeData = { kind: "assigned" | "released"; event: NoticeEvent; referenceNumber: string; service: string; clientFirstName: string; sessions: NoticeSession[]; previousSessions?: NoticeSession[] | null; version: number };
export function buildAssignedBookingNotice(d: AssignedNoticeData): { subject: string; html: string; text: string } {
  const ref = d.referenceNumber, service = pathwayLabel(d.service);
  const sess = (ss: NoticeSession[], label: string) => ss.flatMap((s, i) => [`${ss.length > 1 ? `${label} (session ${i + 1})` : label}: ${formatSession(s)} · ${utcLine(s)}`, `  ${formatPlace(s)}${s.note ? ` · ${s.note}` : ""}`]);
  let subject: string, head: string, lines: string[];
  if (d.kind === "released") {
    subject = `You are no longer assigned — ${ref}`; head = `You have been taken off the ${service} booking ${ref}. No action is needed from you.`;
    lines = [...sess(d.previousSessions ?? d.sessions, "Was")];
  } else if (d.event === "confirmed") {
    subject = `You are assigned to a booking — ${ref}`; head = `You are assigned to a confirmed ${service} booking (${ref}) for ${d.clientFirstName}.`; lines = sess(d.sessions, "When");
  } else if (d.event === "changed") {
    subject = `Booking you are assigned to has changed — ${ref}`; head = `The ${service} booking ${ref} (client ${d.clientFirstName}) has been rescheduled. The new details replace the old.`;
    lines = [...(d.previousSessions?.length ? sess(d.previousSessions, "Was") : []), ...sess(d.sessions, "Now")];
  } else {
    subject = `Booking cancelled — ${ref}`; head = d.event === "cancelled_final" ? `The ${service} booking ${ref} (client ${d.clientFirstName}) has been cancelled for good. Please release that time.` : `The ${service} booking ${ref} (client ${d.clientFirstName}) has been cancelled; a new date may follow. Please release that time until you hear again.`;
    lines = sess(d.sessions, "Cancelled");
  }
  const text = [head, "", ...lines, "", "This message carries only what you need to carry out the booking. Questions go to the studio team."].join("\n");
  const html = wrap(`<h1 style="margin:0 0 16px;font-family:${SERIF};font-size:22px;color:${NAVY};font-weight:normal;">${escapeHtml(subject)}</h1><p style="margin:0 0 16px;font-family:${SANS};font-size:15px;line-height:1.6;color:${NAVY};">${escapeHtml(head)}</p><p style="margin:0 0 16px;font-family:${SANS};font-size:14px;line-height:1.7;color:${NAVY};font-weight:500;">${lines.map((l) => escapeHtml(l)).join("<br>")}</p><p style="margin:0;font-family:${SANS};font-size:13px;color:${INK_MUTED};">This message carries only what you need to carry out the booking. Questions go to the studio team.</p>`, "Ordift Studios · Internal notification — not sent to the client.");
  return { subject, html, text };
}
