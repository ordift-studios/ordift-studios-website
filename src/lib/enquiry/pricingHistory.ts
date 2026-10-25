import { createHash } from "node:crypto";

// Pure rules for the PERSISTENT enquiry pricing workflow (communicated-price revisions, Founder-approved discounts, follow-ups, conversion).
// The tables that store them are migration 0168 (applied to Production 2026-10-25). Switched ON 2026-10-25 by the Founder's authorisation, for this module ONLY
// (the portfolio and permission features have their own gates and stay off). Nothing here sends, books, posts revenue or creates a payable.

export const ENQUIRY_PRICING_PERSISTENCE_ENABLED = true;

// A discount approval is tied to the exact priced scope. If the scope or base price changes materially, the approval no longer applies.
export function scopeHash(scope: { title: string; lines: readonly string[]; baseUsd: number }): string {
  const canonical = JSON.stringify({ t: scope.title.trim(), l: [...scope.lines].map((x) => x.trim()).sort(), b: Math.round(scope.baseUsd * 100) });
  return createHash("sha256").update(canonical, "utf8").digest("hex");
}
export function approvalStillValid(approved: { scopeHash: string; status: string }, current: { title: string; lines: readonly string[]; baseUsd: number }): { valid: true } | { valid: false; reason: string } {
  if (approved.status !== "approved") return { valid: false, reason: `This discount is ${approved.status}, not approved.` };
  return approved.scopeHash === scopeHash(current) ? { valid: true } : { valid: false, reason: "The scope or base price has changed since this discount was approved, so it needs to be approved again." };
}

export type FollowUpState = "overdue" | "due_today" | "upcoming";
export function followUpState(dueAt: string | Date, now: Date = new Date()): FollowUpState {
  const due = new Date(dueAt);
  if (due.getTime() < now.getTime()) return due.toISOString().slice(0, 10) === now.toISOString().slice(0, 10) ? "due_today" : "overdue";
  return due.toISOString().slice(0, 10) === now.toISOString().slice(0, 10) ? "due_today" : "upcoming";
}

// Deterministic key: pressing "Proceed to booking" twice, retrying, or two staff doing it at once all produce the same key, so the unique
// constraint turns the repeats into a no-op instead of a second quotation.
export function conversionIdempotencyKey(enquiryId: string, targetType: "client_quotation"): string {
  return `enquiry-convert:${targetType}:${createHash("sha256").update(`${enquiryId}|${targetType}`).digest("hex").slice(0, 32)}`;
}

// A communicated price is a record of what was said; it is never a confirmed booking, payment, revenue or agreement.
export const CONVERSION_CREATES = ["a DRAFT client quotation linked to the enquiry"] as const;
export const CONVERSION_NEVER_CREATES = ["a confirmed booking", "a payment or receipt", "revenue", "a contractor payable", "an agreement"] as const;
