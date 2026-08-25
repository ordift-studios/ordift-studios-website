import { productionSendingEnabled } from "@/lib/shared/env";
import { sendEmail, type EmailResult } from "@/lib/shared/email/dispatch";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  buildRegistrationAcknowledgementEmail,
  buildRegistrationAdminNotificationEmail,
  buildPaymentConfirmedEmail,
  buildProjectRequestDecidedEmail,
  buildTravelAssistanceStatusEmail,
  buildWorkshopNoticeEmail,
  buildInstructorEngagementApprovedEmail,
} from "./registrationEmailTemplates";
import type { WorkshopRegistrationRecord } from "./registrationStorage";

export type { EmailResult };

export async function sendRegistrationAcknowledgementEmail(
  record: WorkshopRegistrationRecord
): Promise<EmailResult> {
  const { subject, html, text } = buildRegistrationAcknowledgementEmail(record);
  return sendEmail({
    to: record.email,
    subject,
    html,
    text,
    logPrefix: "[workshops]",
    emailType: "workshop-registration-acknowledgement",
    referenceNumber: record.registrationReference,
  });
}

// Workshop Management V1, Phase C (2026-08-25) — every function below
// is called from a real, already-existing system event (see each
// caller): a completed/refunded payment, a staff decision on a
// project_request, a staff-updated travel-assistance status, an
// explicit staff-triggered workshop notice, or an approved instructor
// compensation obligation. None of these are scheduled/polled — each
// fires exactly once, synchronously, from the event that caused it.
async function getRegistrationEmailTarget(
  registrationId: string
): Promise<{ email: string; firstName: string; workshopTitle: string; registrationReference: string } | null> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("workshop_registrations")
    .select("email, first_name, full_name, workshop_title, registration_reference")
    .eq("id", registrationId)
    .maybeSingle();
  if (error || !data) {
    console.error("[workshops] failed to load registration for notification", registrationId, error?.message);
    return null;
  }
  return {
    email: data.email,
    firstName: data.first_name || data.full_name.split(" ")[0] || "there",
    workshopTitle: data.workshop_title,
    registrationReference: data.registration_reference,
  };
}

export async function sendPaymentConfirmedEmail(registrationId: string, amountPaidUsd: number): Promise<EmailResult | null> {
  const target = await getRegistrationEmailTarget(registrationId);
  if (!target) return null;
  const { subject, html, text } = buildPaymentConfirmedEmail({ ...target, amountPaidUsd });
  return sendEmail({
    to: target.email,
    subject,
    html,
    text,
    logPrefix: "[workshops]",
    emailType: "workshop-payment-confirmed",
    referenceNumber: target.registrationReference,
  });
}

export async function sendProjectRequestDecidedEmail(params: {
  registrationId: string;
  requestTypeLabel: string;
  decision: "approved" | "rejected";
  staffResponse: string | null;
}): Promise<EmailResult | null> {
  const target = await getRegistrationEmailTarget(params.registrationId);
  if (!target) return null;
  const { subject, html, text } = buildProjectRequestDecidedEmail({
    ...target,
    requestTypeLabel: params.requestTypeLabel,
    decision: params.decision,
    staffResponse: params.staffResponse,
  });
  return sendEmail({
    to: target.email,
    subject,
    html,
    text,
    logPrefix: "[workshops]",
    emailType: "workshop-request-decided",
    referenceNumber: target.registrationReference,
  });
}

export async function sendTravelAssistanceStatusEmail(registrationId: string, status: string): Promise<EmailResult | null> {
  const target = await getRegistrationEmailTarget(registrationId);
  if (!target) return null;
  const { subject, html, text } = buildTravelAssistanceStatusEmail({ ...target, status });
  return sendEmail({
    to: target.email,
    subject,
    html,
    text,
    logPrefix: "[workshops]",
    emailType: "workshop-travel-assistance-status",
    referenceNumber: target.registrationReference,
  });
}

export async function sendWorkshopNoticeEmailToRegistration(
  registrationId: string,
  noticeType: string,
  message: string
): Promise<EmailResult | null> {
  const target = await getRegistrationEmailTarget(registrationId);
  if (!target) return null;
  const { subject, html, text } = buildWorkshopNoticeEmail({ ...target, noticeType, message });
  return sendEmail({
    to: target.email,
    subject,
    html,
    text,
    logPrefix: "[workshops]",
    emailType: "workshop-notice",
    referenceNumber: target.registrationReference,
  });
}

export async function sendInstructorEngagementApprovedEmail(params: {
  email: string;
  recipientName: string;
  workshopTitle: string;
  role: string;
  amount: number;
  currency: string;
}): Promise<EmailResult> {
  const { subject, html, text } = buildInstructorEngagementApprovedEmail(params);
  return sendEmail({
    to: params.email,
    subject,
    html,
    text,
    logPrefix: "[workshops]",
    emailType: "workshop-instructor-engagement-approved",
    referenceNumber: null,
  });
}

export async function sendRegistrationAdminNotificationEmail(
  record: WorkshopRegistrationRecord
): Promise<EmailResult> {
  const adminTo = process.env.EMAIL_ADMIN_NOTIFICATION_TO;
  if (!adminTo && productionSendingEnabled()) {
    console.error("[workshops] EMAIL_ADMIN_NOTIFICATION_TO is not set — cannot notify admin");
    return { ok: false, error: "admin-recipient-not-configured", attempts: 0, permanent: true };
  }
  const { subject, html, text } = buildRegistrationAdminNotificationEmail(record);
  return sendEmail({
    to: adminTo ?? "admin-notification-recipient-not-yet-configured@ordiftstudios.test",
    subject,
    html,
    text,
    logPrefix: "[workshops]",
    emailType: "workshop-registration-admin-notification",
    referenceNumber: record.registrationReference,
  });
}
