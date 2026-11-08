import { createAdminClient } from "@/lib/supabase/admin";
import { isSuperAdminId } from "@/lib/organization/authority";
import { bookingFlagOn, classifyPaymentTerms, termsCheckBlocks, validateSegments, type BookingSettings, type Conflict, type Resolution, type Segment } from "./rules";
import type { PaymentCondition } from "@/lib/crewSupport/paymentCondition";

// BOOKING CONFIRMATION (server). Flag BOOKING_CONFIRMATION_ENABLED, default OFF: with it off every function here refuses and nothing is read or written. Super Admin only to confirm, change or cancel.
// Every rule is enforced AGAIN inside the database functions (PROPOSAL_booking_confirmation.sql, not applied anywhere): this module validates first so the person gets a clear message, then asks the database to decide.
// It never creates a payment, invoice, receivable or email, and never edits an existing record: a change or cancellation is a new row.
type Fail = { ok: false; error: string };
const OFF: Fail = { ok: false, error: "Booking confirmation is not switched on." };
const DENIED: Fail = { ok: false, error: "Only a Super Admin can confirm, change or cancel a booking." };

const MESSAGES: [RegExp, string][] = [
  [/booking_not_accepted/, "The enquiry needs an issued, accepted ordinary quotation before it can be booked."],
  [/booking_entity_not_eligible/, "The contracting entity is not eligible for the quoted activities (an agreement cannot override an unlicensed activity)."],
  [/booking_agreement_required/, "An executed agreement linked to this enquiry is required for this booking."],
  [/booking_payment_pending/, "The payment the quotation requires has not been verified yet."],
  [/booking_amount_due_missing/, "A payment is required but no amount due has been established."],
  [/booking_payment_condition_mismatch/, "The payment condition must be the accepted quotation's own."],
  [/booking_payment_terms_unclear/, "The quotation's payment terms are unclear or contradict its structured condition: record the client's written clarification first."],
  [/booking_firm_conflict/, "The assigned person has a firm scheduling conflict. Reassign, reschedule, or document that they verified their availability."],
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
};
export async function confirmOrdinaryBooking(i: ConfirmInput, env: Record<string, string | undefined> = process.env): Promise<{ ok: true; confirmationId: string } | Fail> {
  if (!bookingFlagOn(env)) return OFF;
  if (!(await isSuperAdminId(i.actorUserId))) return DENIED;
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
  return { ok: true, confirmationId: data as string };
}

export async function cancelOrdinaryBooking(p: { actorUserId: string; enquiryId: string; reason: string }, env: Record<string, string | undefined> = process.env): Promise<{ ok: true; confirmationId: string } | Fail> {
  if (!bookingFlagOn(env)) return OFF;
  if (!(await isSuperAdminId(p.actorUserId))) return DENIED;
  if (p.reason.trim().length < 10) return { ok: false, error: "Give a reason of at least a sentence." };
  const { data, error } = await createAdminClient().rpc("cancel_ordinary_booking", { p_enquiry: p.enquiryId, p_reason: p.reason, p_actor: p.actorUserId });
  if (error || !data) { console.error("[booking] cancel failed", error?.message); return { ok: false, error: "The booking could not be cancelled." }; }
  return { ok: true, confirmationId: data as string };
}

// read-only: the conflicts to review BEFORE confirming (same database function the confirmation uses)
export async function previewConflicts(p: { assigneeId: string | null; segments: Segment[]; excludeEnquiryId: string | null }, env: Record<string, string | undefined> = process.env): Promise<Conflict[] | null> {
  if (!bookingFlagOn(env) || !p.assigneeId) return bookingFlagOn(env) ? [] : null;
  const { data, error } = await createAdminClient().rpc("preview_booking_conflicts", { p_assignee: p.assigneeId, p_segments: p.segments, p_exclude_enquiry: p.excludeEnquiryId });
  if (error) { console.error("[booking] preview failed", error.message); return null; }
  return (data as { key: string; kind: Conflict["kind"]; firm: boolean; label: string; from: string; to: string }[]).map((c) => ({ key: c.key, kind: c.kind, firm: c.firm, label: c.label, from: c.from, to: c.to }));
}
