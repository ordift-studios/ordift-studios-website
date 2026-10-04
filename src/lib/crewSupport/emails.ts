import { escapeHtml, wrap, SERIF, SANS, NAVY, INK_MUTED } from "@/lib/enquiry/emailTemplates";
import { siteUrl } from "@/lib/shared/env";
import { REQUESTER_TYPES, SERVICE_FAMILIES, SUBMITTED_MESSAGE } from "./config";
import type { CrewSupportRecord } from "./submit";

function crewLines(record: CrewSupportRecord): string {
  return record.requirements.map((r) => `${r.quantity} × ${r.roleLabel}`).join(", ");
}

function dateRange(record: CrewSupportRecord): string {
  return record.startDate === record.endDate ? record.startDate : `${record.startDate} to ${record.endDate}`;
}

export function buildCrewSupportAcknowledgementEmail(record: CrewSupportRecord) {
  const subject = `We've received your Creative Crew Support request — ${record.referenceNumber}`;
  const first = record.requesterName.split(" ")[0] || record.requesterName;
  const html = `
    <h1 style="margin:0 0 16px;font-family:${SERIF};font-size:24px;color:${NAVY};font-weight:normal;">Thank you, ${escapeHtml(first)}.</h1>
    <p style="margin:0 0 16px;font-family:${SANS};font-size:15px;line-height:1.6;color:${NAVY};">${escapeHtml(SUBMITTED_MESSAGE)} Your reference number is:</p>
    <p style="margin:0 0 20px;font-family:${SANS};font-size:18px;font-weight:bold;color:${NAVY};letter-spacing:0.03em;">${escapeHtml(record.referenceNumber)}</p>
    <p style="margin:0 0 8px;font-family:${SANS};font-size:14px;line-height:1.6;color:${NAVY};"><strong>${escapeHtml(record.projectName)}</strong> · ${escapeHtml(dateRange(record))} · ${escapeHtml(record.location)}</p>
    <p style="margin:0 0 20px;font-family:${SANS};font-size:14px;line-height:1.6;color:${NAVY};">Crew requested: ${escapeHtml(crewLines(record))}</p>
    <p style="margin:0;font-family:${SANS};font-size:14px;line-height:1.6;color:${INK_MUTED};">This is not a booking confirmation, and crew availability is not guaranteed until Ordift confirms it. If anything changes, reply to this email and quote your reference number.</p>`;
  const text = `${SUBMITTED_MESSAGE}\n\nReference: ${record.referenceNumber}\nProject: ${record.projectName} (${dateRange(record)}, ${record.location})\nCrew requested: ${crewLines(record)}\n\nThis is not a booking confirmation, and crew availability is not guaranteed until Ordift confirms it.`;
  return { subject, html: wrap(html), text };
}

export function buildCrewSupportAdminNotificationEmail(record: CrewSupportRecord) {
  const subject = `New Creative Crew Support request — ${record.referenceNumber}`;
  const family = SERVICE_FAMILIES.find((f) => f.value === record.serviceFamily)?.label ?? record.serviceFamily;
  const requesterType = REQUESTER_TYPES.find((t) => t.value === record.requesterType)?.label ?? record.requesterType;
  const adminUrl = `${siteUrl()}/admin/crew-support/${record.requestId}`;
  const rows: [string, string][] = [
    ["Reference", record.referenceNumber],
    ["Requester", `${record.requesterName} (${requesterType})`],
    ["Email / phone", `${record.requesterEmail} · ${record.requesterPhone}`],
    ...(record.requesterCompany ? ([["Company", record.requesterCompany]] as [string, string][]) : []),
    ...(record.leadCompany ? ([["Lead company / studio", record.leadCompany]] as [string, string][]) : []),
    ["Service area", family],
    ["Project", record.projectName],
    ["Dates", dateRange(record)],
    ["Location", record.location],
    ["Crew requested", crewLines(record)],
  ];
  const tableHtml = rows
    .map(([k, v]) => `<tr><td style="padding:6px 12px 6px 0;font-family:${SANS};font-size:13px;color:${INK_MUTED};vertical-align:top;">${escapeHtml(k)}</td><td style="padding:6px 0;font-family:${SANS};font-size:14px;color:${NAVY};">${escapeHtml(v)}</td></tr>`)
    .join("");
  const html = wrap(`
    <h1 style="margin:0 0 16px;font-family:${SERIF};font-size:22px;color:${NAVY};font-weight:normal;">New Creative Crew Support request</h1>
    <p style="margin:0 0 16px;font-family:${SANS};font-size:14px;line-height:1.6;color:${NAVY};">Status: request received — pending Ordift review and availability confirmation. Not a booking.</p>
    <table style="border-collapse:collapse;">${tableHtml}</table>
    <p style="margin:20px 0 0;font-family:${SANS};font-size:14px;"><a href="${escapeHtml(adminUrl)}" style="color:${NAVY};">Open in Admin</a></p>`, "Ordift Studios · Internal notification");
  const text = `New Creative Crew Support request (pending review — not a booking)\n\n${rows.map(([k, v]) => `${k}: ${v}`).join("\n")}\n\n${adminUrl}`;
  return { subject, html, text };
}
