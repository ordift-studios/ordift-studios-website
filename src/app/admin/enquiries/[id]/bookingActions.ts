"use server";

import { revalidatePath } from "next/cache";
import { actionFail, actionOk, runAction, type ActionState } from "@/lib/shared/actionState";
import { getCurrentUser, isSuperAdmin } from "@/lib/portal/roles";
import { listOverridePool } from "@/lib/crewSupport/candidates";
import { bookingFlagOn, type Conflict, type Resolution } from "@/lib/bookings/rules";
import { confirmOrdinaryBooking, cancelOrdinaryBooking, loadBookingSettings, previewConflicts } from "@/lib/bookings/service";
import { confirmSentenceFor, parseBookingForm, sentenceMatches } from "@/lib/bookings/form";
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
  // who verified is the ASSIGNED PERSON, set here; the form only says whether the Super Admin confirms having verified it with them
  const resolutions: Resolution[] = form.resolutions.filter((r) => r.confirmedWithPerson && form.assignedProfileId).map(({ confirmedWithPerson: _c, ...r }) => ({ ...r, verifiedWithProfileId: form.assignedProfileId as string }));
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
    if (!sentenceMatches(p.form.confirmSentence, p.ctx.enquiry.reference, verb)) return actionFail(`To ${verb} the booking, type exactly: ${confirmSentenceFor(p.ctx.enquiry.reference, verb)}`);
    if (p.assessment.blockers.length > 0) return actionFail(`Not ready to ${verb}: ${p.assessment.blockers.join(" ")}`);
    const result = await confirmOrdinaryBooking({
      actorUserId: p.userId, enquiryId: p.ctx.enquiry.id, quotationId: p.ctx.quotation.id, supersedes: p.live?.id ?? null, assignedProfileId: p.form.assignedProfileId, segments: p.form.segments, escalators: p.escalators,
      agreementId: p.assessment.agreement.required ? p.ctx.executedAgreement?.id ?? null : null, clarification: p.form.clarification, conflictResolutions: p.resolutions, basis: p.form.basis,
    });
    if (!result.ok) return actionFail(result.error);
    refresh(p.ctx.enquiry.id);
    return actionOk(p.live ? "Booking changed. The previous version stays in the record. No payment, invoice or email was created." : "Booking confirmed. No payment, invoice or email was created.");
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
    const result = await cancelOrdinaryBooking({ actorUserId: user.id, enquiryId, reason: String(formData.get("reason") ?? "") });
    if (!result.ok) return actionFail(result.error);
    refresh(enquiryId);
    return actionOk("Booking cancelled. The record of the booking is kept. Any refund or payment decision is a separate step.");
  }, "cancel booking");
}
