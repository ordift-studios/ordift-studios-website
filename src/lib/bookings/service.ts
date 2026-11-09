import { createAdminClient } from "@/lib/supabase/admin";
import { isSuperAdminId } from "@/lib/organization/authority";
import { bookingFlagOn, classifyPaymentTerms, isOverridableKind, termsCheckBlocks, validateSegments, type BookingSettings, type Conflict, type Resolution, type Segment } from "./rules";
import type { PaymentCondition } from "@/lib/crewSupport/paymentCondition";
import { deferClientNotice, dispatchBookingNotifications } from "./notificationService";

// BOOKING CONFIRMATION (server). Flag BOOKING_CONFIRMATION_ENABLED, default OFF: with it off every function here refuses and nothing is read or written. Super Admin only to confirm, change or cancel.
// Every rule is enforced AGAIN inside the database functions (PROPOSAL_booking_confirmation.sql, not applied anywhere): this module validates first so the person gets a clear message, then asks the database to decide.
// It never creates a payment, invoice or receivable (a confirmation sends the two booking notifications, see notificationService.ts), and never edits an existing record: a change or cancellation is a new row.
type Fail = { ok: false; error: string };
const OFF: Fail = { ok: false, error: "Booking confirmation is not switched on." };
const DENIED: Fail = { ok: false, error: "Only a Super Admin can confirm, change or cancel a booking." };

const MESSAGES: [RegExp, string][] = [
  [/booking_not_accepted/, "The enquiry needs an issued, accepted ordinary quotation before it can be booked."],
  [/booking_no_fingerprint/, "The accepted quotation has no record of its issued content, so it cannot be booked. It must be issued through the quotation screen (nothing was saved)."],
  [/booking_entity_not_eligible/, "The contracting entity is not eligible for the quoted activities (an agreement cannot override an unlicensed activity)."],
  [/booking_agreement_required/, "An executed agreement linked to this enquiry is required for this booking."],
  [/booking_payment_pending/, "The payment the quotation requires has not been verified yet."],
  [/booking_amount_due_missing/, "A payment is required but no amount due has been established."],
  [/booking_payment_condition_mismatch/, "The payment condition must be the accepted quotation's own."],
  [/booking_payment_terms_unclear/, "The quotation's payment terms are unclear or contradict its structured condition: record the client's written clarification first."],
  [/booking_overlap_not_overridable/, "The assigned person already has a confirmed booking, a confirmed Crew Support assignment or approved leave at this time. Change the assigned person or the time: a written explanation cannot clear it."],
  [/booking_firm_conflict/, "The assigned person has approved leave at this time. Reassign, reschedule, or document that they verified their availability."],
  [/booking_no_schedule|booking_segment/, "Check the date, time and place of every session."],
  [/booking_already_confirmed/, "This enquiry already has a confirmed booking: change or cancel it instead."],
  [/booking_enquiry_closed/, "The enquiry is closed."],
  [/booking_settings_missing/, "The booking rules have not been set up."],
  [/booking_not_authorised/, DENIED.error],
];
const friendly = (m: string) => MESSAGES.find(([r]) => r.test(m))?.[1] ?? "The booking could not be saved.";

export async function loadBookingSettings(): Promise<BookingSettings | null> {
  const { data } = await createAdminClient().from("booking_rule_settings").select("version, status, agreement_value_thresholds, agreement_always_categories, agreement_escalators").order("version", { ascending: false }).limit(1).maybeSingle();
  return data ? { version: data.version as number, status: data.status as "provisional" | "approved", thresholds: data.agreement_value_thresholds as Record<string, number>, alwaysCategories: data.agreement_always_categories as string[], escalators: data.agreement_escalators as string[] } : null;
}

export type ConfirmInput = {
  actorUserId: string; enquiryId: string; quotationId: string; supersedes?: string | null; assignedProfileId?: string | null; segments: Segment[]; escalators?: string[];
  agreementId?: string | null; clarification?: { kind: string; evidence: string } | null; conflictResolutions?: Resolution[]; basis?: string | null;
  deferClientNoticeReason?: string | null;           // a CHANGE only: hold back the client notice, with a written reason (default: the client is told)
};
export type NoticeFollowUp = { deferred: boolean; deferError?: string };
export async function confirmOrdinaryBooking(i: ConfirmInput, env: Record<string, string | undefined> = process.env): Promise<({ ok: true; confirmationId: string } & NoticeFollowUp) | Fail> {
  if (!bookingFlagOn(env)) return OFF;
  if (!(await isSuperAdminId(i.actorUserId))) return DENIED;
  if (i.deferClientNoticeReason !== undefined && i.deferClientNoticeReason !== null && !i.supersedes) return { ok: false, error: "A client notice can only be held back when changing a booking, not when confirming one: the client must be told they are booked." };
  if (i.deferClientNoticeReason !== undefined && i.deferClientNoticeReason !== null && i.deferClientNoticeReason.trim().length < 10) return { ok: false, error: "Give a reason of at least a sentence for holding back the client notice." };
  const segErr = validateSegments(i.segments); if (segErr) return { ok: false, error: segErr };
  const db = createAdminClient();
  const { data: q } = await db.from("client_quotations").select("payment_condition, deposit_percent, payment_booking_terms").eq("id", i.quotationId).eq("enquiry_id", i.enquiryId).maybeSingle();
  if (!q) return { ok: false, error: MESSAGES[0][1] };
  const cond = (q.payment_condition ?? "none") as PaymentCondition;
  const termsCheck = classifyPaymentTerms(q.payment_booking_terms as string | null, cond, q.deposit_percent === null ? null : Number(q.deposit_percent));
  const unclear = termsCheckBlocks(termsCheck, i.clarification ?? null); if (unclear) return { ok: false, error: unclear };
  const { data, error } = await db.rpc("confirm_ordinary_booking", { p: { enquiryId: i.enquiryId, quotationId: i.quotationId, supersedes: i.supersedes ?? null, assignedProfileId: i.assignedProfileId ?? null,
    segments: i.segments, escalators: i.escalators ?? [], agreementId: i.agreementId ?? null, paymentTermsCheck: termsCheck, clarification: i.clarification ?? null, conflictResolutions: i.conflictResolutions ?? [], basis: i.basis ?? null }, p_actor: i.actorUserId });
  if (error || !data) { console.error("[booking] confirm refused/failed", error?.message); return { ok: false, error: friendly(error?.message ?? "") }; }
  // The ONLY trigger of the booking e-mails: a successful confirmation. The database made the notification records with the confirmation; this sends them once. A notification problem never undoes the booking.
  // A deferral is recorded BEFORE anything is sent; if it cannot be recorded the notice simply goes out (the safe direction: the client is told) and the person is told so.
  let follow: NoticeFollowUp = { deferred: false };
  if (i.deferClientNoticeReason) { const d = await deferClientNotice({ actorUserId: i.actorUserId, confirmationId: data as string, reason: i.deferClientNoticeReason }, env); follow = d.ok ? { deferred: true } : { deferred: false, deferError: d.error }; }
  try { await dispatchBookingNotifications(data as string, env); } catch (err) { console.error("[booking] notifications threw (the booking stands)", err); }
  return { ok: true, confirmationId: data as string, ...follow };
}

export type CancelOutcome = "rescheduling_pending" | "final";
export async function cancelOrdinaryBooking(p: { actorUserId: string; enquiryId: string; reason: string; outcome?: CancelOutcome; deferClientNoticeReason?: string | null }, env: Record<string, string | undefined> = process.env): Promise<({ ok: true; confirmationId: string } & NoticeFollowUp) | Fail> {
  if (!bookingFlagOn(env)) return OFF;
  if (!(await isSuperAdminId(p.actorUserId))) return DENIED;
  if (p.reason.trim().length < 10) return { ok: false, error: "Give a reason of at least a sentence." };
  const outcome: CancelOutcome = p.outcome ?? "rescheduling_pending";
  if (outcome !== "rescheduling_pending" && outcome !== "final") return { ok: false, error: "Choose whether the cancellation is final or a new date will be agreed." };
  if (p.deferClientNoticeReason !== undefined && p.deferClientNoticeReason !== null && p.deferClientNoticeReason.trim().length < 10) return { ok: false, error: "Give a reason of at least a sentence for holding back the client notice." };
  // The outcome argument is sent only when it is not the default, so a database that has not yet received the notices proposal still cancels exactly as before; a FINAL cancellation there is refused in plain words.
  const { data, error } = await createAdminClient().rpc("cancel_ordinary_booking", { p_enquiry: p.enquiryId, p_reason: p.reason, p_actor: p.actorUserId, ...(outcome === "final" ? { p_outcome: "final" } : {}) });
  if (error || !data) { console.error("[booking] cancel failed", error?.message); return { ok: false, error: outcome === "final" && /could not find the function|does not exist|schema cache/i.test(error?.message ?? "") ? "A final cancellation needs the booking notices update, which this database does not have yet." : "The booking could not be cancelled." }; }
  let follow: NoticeFollowUp = { deferred: false };
  if (p.deferClientNoticeReason) { const d = await deferClientNotice({ actorUserId: p.actorUserId, confirmationId: data as string, reason: p.deferClientNoticeReason }, env); follow = d.ok ? { deferred: true } : { deferred: false, deferError: d.error }; }
  try { await dispatchBookingNotifications(data as string, env); } catch (err) { console.error("[booking] notifications threw (the cancellation stands)", err); }
  return { ok: true, confirmationId: data as string, ...follow };
}

// read-only: the conflicts to review BEFORE confirming (same database function the confirmation uses)
export async function previewConflicts(p: { assigneeId: string | null; segments: Segment[]; excludeEnquiryId: string | null }, env: Record<string, string | undefined> = process.env): Promise<Conflict[] | null> {
  if (!bookingFlagOn(env) || !p.assigneeId) return bookingFlagOn(env) ? [] : null;
  const { data, error } = await createAdminClient().rpc("preview_booking_conflicts", { p_assignee: p.assigneeId, p_segments: p.segments, p_exclude_enquiry: p.excludeEnquiryId });
  if (error) { console.error("[booking] preview failed", error.message); return null; }
  // an older database that does not yet send the flag is read the strict way: only leave and in-progress slots are overridable
  return (data as { key: string; kind: Conflict["kind"]; firm: boolean; overridable?: boolean; label: string; from: string; to: string }[]).map((c) => ({ key: c.key, kind: c.kind, firm: c.firm, overridable: c.overridable ?? isOverridableKind(c.kind, c.firm), label: c.label, from: c.from, to: c.to }));
}

// ---- versioned rule settings (thresholds, categories, escalators): a change is a NEW version, never an edit; Super Admin only
const CURRENCY = /^[A-Z]{3}$/, KEY = /^[a-z][a-z_]{2,40}$/;
export async function recordBookingSettingsVersion(p: { actorUserId: string; thresholds: Record<string, number>; alwaysCategories: string[]; escalators: string[]; status: "provisional" | "approved"; note: string }, env: Record<string, string | undefined> = process.env): Promise<{ ok: true; version: number } | Fail> {
  if (!bookingFlagOn(env)) return OFF;
  if (!(await isSuperAdminId(p.actorUserId))) return DENIED;
  if (Object.keys(p.thresholds).length === 0 || Object.entries(p.thresholds).some(([c, n]) => !CURRENCY.test(c) || !Number.isFinite(n) || n <= 0)) return { ok: false, error: "Give each currency a threshold above zero (a three-letter currency code)." };
  if ([...p.alwaysCategories, ...p.escalators].some((k) => !KEY.test(k))) return { ok: false, error: "Categories and circumstances must be lowercase words with underscores." };
  if (p.note.trim().length < 10) return { ok: false, error: "Say why the rules are changing (at least a sentence)." };
  const db = createAdminClient();
  const { data: last } = await db.from("booking_rule_settings").select("version").order("version", { ascending: false }).limit(1).maybeSingle();
  const version = ((last?.version as number | undefined) ?? 0) + 1;
  const { error } = await db.from("booking_rule_settings").insert({ version, status: p.status, agreement_value_thresholds: p.thresholds, agreement_always_categories: p.alwaysCategories, agreement_escalators: p.escalators, note: p.note.trim(), created_by: p.actorUserId });
  if (error) { console.error("[booking] settings version failed", error.message); return { ok: false, error: "The settings could not be saved (someone may have saved a newer version: reload and try again)." }; }
  return { ok: true, version };
}
