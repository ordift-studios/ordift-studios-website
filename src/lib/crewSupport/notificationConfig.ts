import { escapeHtml, wrap, SERIF, SANS, NAVY, GOLD, INK_MUTED } from "@/lib/enquiry/emailTemplates";
import { siteUrl } from "@/lib/shared/env";
import type { CrewSupportStatus } from "./config";

// Central, single place that decides WHICH workflow transitions are
// client-facing and what the client is told. Internal-only states
// (quote preparation, slot/candidate changes, notes, costs) are absent on
// purpose. Templates contain client-safe content only.
export type ClientTemplate = "under_review" | "availability_review" | "quote_issued" | "quote_accepted" | "agreement_required" | "payment_requested" | "confirmed" | "declined" | "cancelled";

export const STATUS_NOTIFICATIONS: Partial<Record<CrewSupportStatus, ClientTemplate>> = {
  under_review: "under_review",
  availability_review: "availability_review",
  agreement_pending: "agreement_required",
  payment_pending: "payment_requested",
  confirmed: "confirmed",
  declined: "declined",
  cancelled: "cancelled",
};

export type ClientTemplateVars = {
  firstName: string;
  reference: string;
  projectName: string;
  serviceLabel: string;
  enquiryId: string;
  quotationReference?: string;
  totalText?: string;
  localEquivalentText?: string;
  validUntil?: string | null;
  variation?: boolean;
};

export function quotationPortalUrl(enquiryId: string): string {
  return `${siteUrl()}/portal/client/projects/enquiry/${enquiryId}/quotation`;
}

const COPY: Record<ClientTemplate, { subject: (v: ClientTemplateVars) => string; heading: string; body: (v: ClientTemplateVars) => string; action: boolean; notBooking: boolean }> = {
  under_review: {
    subject: (v) => `We're reviewing your Creative Crew Support request — ${v.reference}`,
    heading: "We've started reviewing your request.",
    body: (v) => `Ordift has started reviewing your Creative Crew Support request for ${v.projectName}. No action is needed from you right now.`,
    action: false,
    notBooking: true,
  },
  availability_review: {
    subject: (v) => `We're checking crew availability — ${v.reference}`,
    heading: "We're checking crew and availability.",
    body: (v) => `We're assessing the crew and availability needed for ${v.projectName}. We'll be in touch with the next step. No action is needed from you right now.`,
    action: false,
    notBooking: true,
  },
  quote_issued: {
    subject: (v) => `Your Creative Crew Support quotation is ready — ${v.reference}`,
    heading: "Your quotation is ready.",
    body: (v) => `We've prepared quotation ${v.quotationReference ?? ""} for ${v.projectName}${v.totalText ? ` — ${v.totalText}` : ""}${v.localEquivalentText ? ` (${v.localEquivalentText})` : ""}${v.validUntil ? `, valid until ${v.validUntil}` : ""}. Please review it and, if it suits you, accept it in your client portal. If you can't use the portal, reply to this email and we can record your acceptance.`,
    action: true,
    notBooking: true,
  },
  quote_accepted: {
    subject: (v) => `We've recorded your acceptance — ${v.reference}`,
    heading: "Thank you — your acceptance is recorded.",
    body: (v) => v.variation
      ? `We've recorded your acceptance of the revised quotation ${v.quotationReference ?? ""} for ${v.projectName}. It replaces your previous quotation, and Ordift will confirm any resulting change to payment or arrangements with you directly.`
      : `We've recorded your acceptance of quotation ${v.quotationReference ?? ""} for ${v.projectName}. Ordift will follow up with the next steps, including any agreement or payment details that apply. This is not yet a booking confirmation, and crew availability and assignment are confirmed separately.`,
    action: false,
    notBooking: false,
  },
  agreement_required: {
    subject: (v) => `Next step: an agreement for your crew request — ${v.reference}`,
    heading: "An agreement is needed for your request.",
    body: (v) => `For ${v.projectName}, Ordift will send a separate agreement for you to review and sign before the request can be confirmed. We'll be in touch with it directly — nothing is needed from you in the meantime.`,
    action: false,
    notBooking: true,
  },
  payment_requested: {
    subject: (v) => `Next step: payment for your crew request — ${v.reference}`,
    heading: "Your request is ready for payment.",
    body: (v) => `Your acceptance for ${v.projectName} is recorded and the terms are in place. The next step is payment, which you can make from the Payments section of your client portal using the details shown there. Your request is confirmed once Ordift has confirmed the crew.`,
    action: false,
    notBooking: true,
  },
  confirmed: {
    subject: (v) => `Your Creative Crew Support request is confirmed — ${v.reference}`,
    heading: "Your request is confirmed.",
    body: (v) => `Ordift has confirmed the crew for ${v.projectName}. We'll be in touch with the practical details closer to the date. If anything about your plans changes, please reply to this email quoting your reference number.`,
    action: false,
    notBooking: false,
  },
  declined: {
    subject: (v) => `An update on your Creative Crew Support request — ${v.reference}`,
    heading: "An update on your request.",
    body: (v) => `Thank you for your Creative Crew Support request for ${v.projectName}. Unfortunately Ordift isn't able to take this request on. You're welcome to get in touch if your plans change or you'd like to discuss alternatives.`,
    action: false,
    notBooking: false,
  },
  cancelled: {
    subject: (v) => `Your Creative Crew Support request has been cancelled — ${v.reference}`,
    heading: "Your request has been cancelled.",
    body: (v) => `Your Creative Crew Support request for ${v.projectName} has been cancelled. If this is unexpected, please reply to this email quoting your reference number.`,
    action: false,
    notBooking: false,
  },
};

export function isClientFacingTemplate(value: string): value is ClientTemplate {
  return value in COPY;
}

export function buildClientEmail(template: ClientTemplate, v: ClientTemplateVars): { subject: string; html: string; text: string } {
  const c = COPY[template];
  const link = quotationPortalUrl(v.enquiryId);
  const html = wrap(`
    <p style="margin:0 0 4px;font-family:${SANS};font-size:13px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:${GOLD};">Creative Crew Support</p>
    <h1 style="margin:0 0 16px;font-family:${SERIF};font-size:24px;color:${NAVY};font-weight:normal;">Hi ${escapeHtml(v.firstName)}, ${escapeHtml(c.heading.charAt(0).toLowerCase() + c.heading.slice(1))}</h1>
    <p style="margin:0 0 16px;font-family:${SANS};font-size:15px;line-height:1.6;color:${NAVY};">${escapeHtml(c.body(v))}</p>
    <p style="margin:0 0 20px;font-family:${SANS};font-size:13px;line-height:1.6;color:${INK_MUTED};">Reference: <strong>${escapeHtml(v.reference)}</strong> · ${escapeHtml(v.serviceLabel)}</p>
    ${c.action ? `<table role="presentation" width="100%" style="margin-bottom:20px;"><tr><td align="center"><a href="${escapeHtml(link)}" style="display:inline-block;padding:12px 28px;background:${GOLD};color:${NAVY};font-family:${SANS};font-size:14px;font-weight:600;text-decoration:none;border-radius:6px;">View quotation</a></td></tr></table>` : ""}
    ${c.notBooking ? `<p style="margin:0;font-family:${SANS};font-size:12px;line-height:1.6;color:${INK_MUTED};">This is not a booking confirmation, and crew availability is not guaranteed until Ordift confirms it.</p>` : ""}
  `);
  const text = [`Hi ${v.firstName},`, "", c.body(v), "", `Reference: ${v.reference} · ${v.serviceLabel}`, c.action ? `\nView your quotation: ${link}` : "", c.notBooking ? "\nThis is not a booking confirmation, and crew availability is not guaranteed until Ordift confirms it." : ""].join("\n");
  return { subject: c.subject(v), html, text };
}
