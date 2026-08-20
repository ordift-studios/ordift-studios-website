// CRM Lifecycle Automation Phase 1, Batch 2 (2026-08-20) — provider-
// neutral channel concept, so notification-triggering business logic
// never has to know or care which channels are actually live.
//
// SMS is deliberately deferred: the business decision is to hold live
// SMS integration until Ordift Studios is officially registered in
// Qatar and a provider is chosen. This file is the single place that
// decision is expressed — flipping SMS on later means adding "sms" to
// ENABLED_CHANNELS plus a provider adapter in dispatch.ts, not
// rewriting any of the call sites that already declare which channels
// an event could use.
export type NotificationChannel = "email" | "sms";

export const ENABLED_CHANNELS: readonly NotificationChannel[] = ["email"];

export function isChannelEnabled(channel: NotificationChannel): boolean {
  return ENABLED_CHANNELS.includes(channel);
}
