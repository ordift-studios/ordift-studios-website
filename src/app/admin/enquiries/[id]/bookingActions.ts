"use server";

import { revalidatePath } from "next/cache";
import { actionFail, actionOk, runAction, type ActionState } from "@/lib/shared/actionState";
import { getCurrentUser, isSuperAdmin } from "@/lib/portal/roles";
import { listOverridePool } from "@/lib/crewSupport/candidates";
import { bookingFlagOn, type Conflict, type Resolution } from "@/lib/bookings/rules";
import { decideFinancialAction, recordFinancialExecution, requestFinancialAction } from "@/lib/bookings/financialDecisions";
import { recordManualClientNotice, retryBookingNotification } from "@/lib/bookings/notificationService";
import { confirmOrdinaryBooking, cancelOrdinaryBooking, loadBookingSettings, previewConflicts } from "@/lib/bookings/service";
import { confirmSentenceFor, parseBookingForm, parseCancelOutcome, parseNoticeChoice, sentenceMatches } from "@/lib/bookings/form";
import { assessDraft, loadAcceptedContext, loadCurrentBooking, todayUtc, type AcceptedContext } from "@/lib/bookings/panel";

// BOOKING CONFIRMATION - thin FormData wrappers. The signed-in user is read FIRST and must be a Super Admin (the library functions and the database re-check it).
// Nothing here is trusted from the form except the typed facts (schedule, person, escalators, clarification, resolutions): the quotation, the agreement, the version being changed and
// WHO verified a conflict are all decided on the server. None of these actions creates a payment, invoice, receivable or email.

const NOT_SUPER = "Only a Super Admin can confirm, change or cancel a booking.";
export type BookingPreviewState =
  | { ok: true; blockers: string[]; conflicts: Conflict[]; agreement: { required: boolean; reasons: string[] }; outstandingUsd: number | null; settingsVersion: number }
  | { ok: false; error: string } | null;

const refresh = (enquiryId: string) => { revalidatePath(`/admin/enquiries/${enquiryId}`); revalidatePath("/admin/enquiries"); };

type Prepared = { ok: false; error: string } | {
  ok: true; userId: string; ctx: AcceptedContext; form: ReturnType<typeof parseBookingForm>; settingsVersion: number; live: Awaited<ReturnType<typeof loadCurrentBooking>>;
  resolutions: Resolution[]; assessment: ReturnType<typeof assessDraft>; conflicts: Conflict[]; escalators: string[];
};
async function prepare(formData: FormData): Promise<Prepared> {
  const user = await getCurrentUser();
  if (!user || !isSuperAdmin(user)) return { ok: false, error: NOT_SUPER };                         // authorisation FIRST
  if (!bookingFlagOn()) return { ok: false, error: "Booking confirmation is not switched on." };
  const form = parseBookingForm(formData);
  if (!form.enquiryId) return { ok: false, error: "The enquiry is missing." };
  if (form.segmentError) return { ok: false, error: form.segmentError };
  const ctx = await loadAcceptedContext(form.enquiryId);
  if ("reason" in ctx) return { ok: false, error: ctx.reason === "crew_support" ? "Crew Support requests are confirmed in Crew Support." : "The enquiry needs an issued, accepted ordinary quotation before it can be booked." };
  if (form.quotationId !== ctx.quotation.id) return { ok: false, error: "The accepted quotation has changed since you opened this page. Reload and check again." };
  const [settings, live] = await Promise.all([loadBookingSettings(), loadCurrentBooking(form.enquiryId)]);
  if (!settings) return { ok: false, error: "The booking rules have not been set up." };
  if ((live?.version ?? 0) !== form.expectedVersion) return { ok: false, error: "This booking was changed by someone else since you opened it. Reload and review the latest version." };
  const unknown = form.escalators.filter((e) => !settings.escalators.includes(e));
  if (unknown.length) return { ok: false, error: `These circumstances are not in the current rules version: ${unknown.join(", ")}.` };
  if (form.assignedProfileId) {
    const pool = await listOverridePool([]);
    if (!pool.some((p) => p.profileId === form.assignedProfileId)) return { ok: false, error: "Choose the assigned person from the list of active team members." };
  }
  const liveBooking = live && live.kind !== "cancelled" ? live : null;
  const found = form.segments.length > 0 ? await previewConflicts({ assigneeId: form.assignedProfileId, segments: form.segments, excludeEnquiryId: form.enquiryId }) : [];
  if (found === null) return { ok: false, error: "Conflicts could not be checked. Nothing was changed; try again." };           // fail closed
  // no firm conflict is overridable any more (a confirmed booking, a confirmed Crew Support assignment or approved leave): any resolution the form sends is IGNORED, by design
  const resolutions: Resolution[] = [];
  const assessment = assessDraft({ quotation: ctx.quotation, activities: ctx.activities, settings, entityEligible: ctx.entityEligible, hasExecutedAgreement: Boolean(ctx.executedAgreement), amountDueUsd: ctx.enquiry.amountDueUsd, verifiedPaidUsd: ctx.enquiry.verifiedPaidUsd,
    segments: form.segments, escalators: form.escalators, clarification: form.clarification, conflicts: found, resolutions, assigneeId: form.assignedProfileId, today: todayUtc() });
  return { ok: true, userId: user.id, ctx, form, settingsVersion: settings.version, live: liveBooking, resolutions, assessment, conflicts: found, escalators: form.escalators };
}

// read-only: the blockers and the conflicts BEFORE anything is confirmed
export async function previewBookingAction(_prev: BookingPreviewState, formData: FormData): Promise<BookingPreviewState> {
  try {
    const p = await prepare(formData);
    if (!p.ok) return { ok: false, error: p.error };
    return { ok: true, blockers: p.assessment.blockers, conflicts: p.conflicts, agreement: p.assessment.agreement, outstandingUsd: p.assessment.payment?.outstandingUsd ?? null, settingsVersion: p.settingsVersion };
  } catch (error) { console.error("[action] preview booking failed", error); return { ok: false, error: "The check could not be completed. Nothing was changed." }; }
}

export async function confirmBookingAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const p = await prepare(formData);
    if (!p.ok) return actionFail(p.error);
    const verb = p.live ? "change" : "confirm";
    const notice = p.live ? parseNoticeChoice(formData) : ({ ok: true, deferReason: null } as const);        // only a change can hold the client notice back; a confirmation always tells the client
    if (!notice.ok) return actionFail(notice.error);
    if (!sentenceMatches(p.form.confirmSentence, p.ctx.enquiry.reference, verb)) return actionFail(`To ${verb} the booking, type exactly: ${confirmSentenceFor(p.ctx.enquiry.reference, verb)}`);
    if (p.assessment.blockers.length > 0) return actionFail(`Not ready to ${verb}: ${p.assessment.blockers.join(" ")}`);
    const result = await confirmOrdinaryBooking({
      actorUserId: p.userId, enquiryId: p.ctx.enquiry.id, quotationId: p.ctx.quotation.id, supersedes: p.live?.id ?? null, assignedProfileId: p.form.assignedProfileId, segments: p.form.segments, escalators: p.escalators,
      agreementId: p.assessment.agreement.required ? p.ctx.executedAgreement?.id ?? null : null, clarification: p.form.clarification, conflictResolutions: p.resolutions, basis: p.form.basis,
      deferClientNoticeReason: notice.deferReason,
    });
    if (!result.ok) return actionFail(result.error);
    refresh(p.ctx.enquiry.id);
    return actionOk(p.live
      ? `Booking changed. The previous version stays in the record. No payment or invoice was created. ${result.deferred ? "The client notice was held back: it stays listed as an outstanding action until it is sent or you record that you told the client." : result.deferError ? `${result.deferError} The client notice will be sent instead.` : "The client is being told the new details (see Notifications in this card)."}`
      : "Booking confirmed. The client confirmation and the internal notices were recorded (see Notifications in this card). No payment or invoice was created.");
  }, "confirm booking");
}

export async function cancelBookingAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await getCurrentUser();
    if (!user || !isSuperAdmin(user)) return actionFail(NOT_SUPER);                                // authorisation FIRST
    if (!bookingFlagOn()) return actionFail("Booking confirmation is not switched on.");
    const enquiryId = String(formData.get("enquiryId") ?? "");
    const ctx = await loadAcceptedContext(enquiryId);
    if ("reason" in ctx) return actionFail("There is no booking for this enquiry.");
    const live = await loadCurrentBooking(enquiryId);
    if (!live || live.kind === "cancelled") return actionFail("There is no confirmed booking to cancel.");
    if (live.version !== (Number(formData.get("expectedVersion") ?? 0) || 0)) return actionFail("This booking was changed by someone else since you opened it. Reload and review the latest version.");
    if (!sentenceMatches(String(formData.get("confirmSentence") ?? ""), ctx.enquiry.reference, "cancel")) return actionFail(`To cancel the booking, type exactly: ${confirmSentenceFor(ctx.enquiry.reference, "cancel")}`);
    const outcome = parseCancelOutcome(formData); if (!outcome) return actionFail("Choose whether a new date will be agreed or the cancellation is final.");
    const notice = parseNoticeChoice(formData); if (!notice.ok) return actionFail(notice.error);
    const result = await cancelOrdinaryBooking({ actorUserId: user.id, enquiryId, reason: String(formData.get("reason") ?? ""), outcome, deferClientNoticeReason: notice.deferReason });
    if (!result.ok) return actionFail(result.error);
    refresh(enquiryId);
    const state = outcome === "final" ? "The project reads \"Booking Cancelled\" (final)." : "The project reads \"Booking Cancelled — Rescheduling Pending\".";
    return actionOk(`Booking cancelled. The record of the booking is kept, the accepted quotation and every payment are untouched (no refund was made or balance changed: any refund is a separate decision). ${state} ${result.deferred ? "The client notice was held back: it stays listed as an outstanding action." : result.deferError ? `${result.deferError} The client notice will be sent instead.` : "The client is being told (see Notifications in this card)."}`);
  }, "cancel booking");
}

// Super Admin: retry ONE failed / skipped / stale booking notification. A sent one can never be re-sent (the database refuses to claim it).
export async function retryBookingNotificationAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await getCurrentUser();
    if (!user || !isSuperAdmin(user)) return actionFail("Only a Super Admin can retry a booking notification.");     // authorisation FIRST
    const audience = String(formData.get("audience") ?? "");
    if (audience !== "client" && audience !== "internal") return actionFail("Unknown notification.");
    const result = await retryBookingNotification({ actorUserId: user.id, confirmationId: String(formData.get("confirmationId") ?? ""), audience });
    refresh(String(formData.get("enquiryId") ?? ""));
    if (!result.ok) return actionFail(result.error);
    return actionOk(`Retried: now ${result.status}.`);
  }, "retry booking notification");
}

// Super Admin or Admin: the client was told another way (WhatsApp, telephone, e-mail, in person): RECORD it, with the channel and an optional note (no contact details). The recorded message is the CURRENT one.
export async function recordClientNoticeAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await getCurrentUser();
    if (!user || !(isSuperAdmin(user) || user.roles.includes("admin"))) return actionFail("Only an Admin or Super Admin can record that the client was told.");     // authorisation FIRST
    const r = await recordManualClientNotice({ actorUserId: user.id, confirmationId: String(formData.get("confirmationId") ?? ""), channel: String(formData.get("channel") ?? ""), note: String(formData.get("note") ?? "") });
    refresh(String(formData.get("enquiryId") ?? ""));
    return r.ok ? actionOk("Recorded: the client was told. The message and how you delivered it are kept in this card.") : actionFail(r.error);
  }, "record client notice");
}

// FINAL-CANCELLATION MONEY RECORDS. Nothing here moves money or edits a payment, balance, quotation or stage: it keeps the decision trail. Request: Admin or Super Admin. Decide and record execution: Super Admin only,
// and a Super Admin can never decide their own request (the database refuses). The signed-in user is read FIRST.
export async function requestFinancialActionAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await getCurrentUser();
    if (!user || !(isSuperAdmin(user) || user.roles.includes("admin"))) return actionFail("Only an Admin or Super Admin can record a cancellation money request.");
    if (!bookingFlagOn()) return actionFail("Booking confirmation is not switched on.");
    const enquiryId = String(formData.get("enquiryId") ?? ""), kind = String(formData.get("kind") ?? "");
    const raw = String(formData.get("amountUsd") ?? "").trim(), amount = raw === "" ? null : Number(raw);
    if (kind !== "no_adjustment" && (amount === null || !Number.isFinite(amount) || amount <= 0)) return actionFail("A refund or write-off needs an amount above zero.");
    const r = await requestFinancialAction({ actorUserId: user.id, enquiryId, kind, amountUsd: amount, reason: String(formData.get("reason") ?? ""), evidence: String(formData.get("evidence") ?? "") });
    refresh(enquiryId);
    return r.ok ? actionOk("Recorded. It now waits for a different Super Admin to authorise or decline it. No money has moved and no balance has changed.") : actionFail(r.error);
  }, "request cancellation money action");
}
export async function decideFinancialActionAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await getCurrentUser();
    if (!user || !isSuperAdmin(user)) return actionFail("Only a Super Admin can authorise or decline a cancellation money request.");
    if (!bookingFlagOn()) return actionFail("Booking confirmation is not switched on.");
    const r = await decideFinancialAction({ actorUserId: user.id, decisionId: String(formData.get("decisionId") ?? ""), decision: String(formData.get("decision") ?? ""), note: String(formData.get("note") ?? "") });
    refresh(String(formData.get("enquiryId") ?? ""));
    return r.ok ? actionOk("Decision recorded. Authorising does not move money: the refund or write-off is carried out through the finance process, then recorded here with its reference.") : actionFail(r.error);
  }, "decide cancellation money action");
}
export async function recordFinancialExecutionAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await getCurrentUser();
    if (!user || !isSuperAdmin(user)) return actionFail("Only a Super Admin can record that an authorised money action was carried out.");
    if (!bookingFlagOn()) return actionFail("Booking confirmation is not switched on.");
    const r = await recordFinancialExecution({ actorUserId: user.id, decisionId: String(formData.get("decisionId") ?? ""), reference: String(formData.get("reference") ?? "") });
    refresh(String(formData.get("enquiryId") ?? ""));
    return r.ok ? actionOk("Recorded as carried out, with its reference. The ledger itself is changed only through the finance process.") : actionFail(r.error);
  }, "record cancellation money execution");
}
