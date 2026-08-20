import { sendEmail, type EmailResult } from "@/lib/shared/email/dispatch";
import { isChannelEnabled, type NotificationChannel } from "./channels";

// Provider-neutral fan-out point for lifecycle/event notifications
// (CRM Lifecycle Automation Phase 1, Batch 2, 2026-08-20) — the first
// consumer is the Quotation Ready / Booking Confirmed client emails
// (src/lib/enquiry/lifecycleEmails.ts), built to call through here
// rather than sendEmail() directly.
//
// A caller declares which channels an event *could* use via
// `channels`; only channels currently enabled (channels.ts) actually
// fire. Today that's email only — `sms` is accepted as a declared
// channel (so call sites don't need to change later) but has no
// payload field and no send path, since no provider is configured.
// Adding SMS later means adding an `sms` payload field, a branch here
// calling a new sendSms(), and enabling the channel in channels.ts —
// none of it touches the business logic that decides *when* to notify.
export type NotificationEvent = {
  channels: NotificationChannel[];
  email?: Parameters<typeof sendEmail>[0];
};

export type NotificationResult = {
  email?: EmailResult;
};

export async function dispatchNotification(event: NotificationEvent): Promise<NotificationResult> {
  const result: NotificationResult = {};

  if (event.channels.includes("email") && event.email && isChannelEnabled("email")) {
    result.email = await sendEmail(event.email);
  }

  // "sms": deliberately unhandled. isChannelEnabled("sms") is always
  // false until a provider adapter exists — see channels.ts.

  return result;
}
