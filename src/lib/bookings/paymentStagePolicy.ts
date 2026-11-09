// PAYMENT vs BOOKING - pure rules (no I/O).
// Payment completion and booking confirmation are two separate, auditable events.
//  * A payment never moves an ordinary enquiry to the stage "booked" once booking confirmation is switched on: only a genuine
//    confirmation (public.confirm_ordinary_booking) does, after the availability / conflict / agreement controls.
//  * What the client and staff see in between is DERIVED from facts that already exist (payment status + whether a live confirmed
//    booking record exists). No new stage, no new payment status, no migration.
//  * With the booking switch OFF the legacy behaviour is unchanged (payment in full still advances the stage), so Production is not affected.

// Independent opt-out for the legacy payment-books-the-project behaviour while booking confirmation is still OFF. DEFAULT = unchanged (anything but the exact word "false" keeps the legacy behaviour),
// so shipping this code changes nothing in Production. Setting PAYMENT_AUTO_BOOKS_ENQUIRY=false is the compatibility-safe correction (needs the Founder's separate authorisation).
export const PAYMENT_AUTO_BOOK_VAR = "PAYMENT_AUTO_BOOKS_ENQUIRY";
export const paymentAutoBookOptedOut = (env: Record<string, string | undefined> = process.env): boolean => env[PAYMENT_AUTO_BOOK_VAR] === "false";

export type PaymentAdvanceInput = { flagOn: boolean; commercialIntent: string | null | undefined; autoBookOff?: boolean };

/** May a completed full payment move this enquiry to "booked" and send the booking e-mails? */
export function paymentMayBookEnquiry(i: PaymentAdvanceInput): boolean {
  if (i.commercialIntent === "creative_crew_support") return false;   // Crew Support is booked only by its own confirmation (existing rule)
  if (i.flagOn) return false;                                         // booking confirmation owns the "booked" stage
  if (i.autoBookOff) return false;                                    // explicit opt-out while the switch is off: staff move the stage to Booked by hand once scheduled
  return true;                                                        // legacy behaviour while the switch is off
}

export type SchedulingStatusInput = {
  flagOn: boolean;
  crmStage: string;
  paymentStatus: string | null | undefined;      // enquiries.payment_status
  amountPaid: number | null | undefined;
  hasLiveBooking: boolean;                       // latest confirmation row exists and is not "cancelled"
  hasCancelledBooking?: boolean;                 // latest confirmation row IS "cancelled" (a booking existed and was cancelled)
  commercialIntent?: string | null;
  autoBookOff?: boolean;                         // payments do not book although booking confirmation is off (PAYMENT_AUTO_BOOKS_ENQUIRY=false)
};
export type SchedulingStatus = { code: "paid_scheduling_pending" | "part_paid_scheduling_pending" | "booked_without_record" | "cancelled_rescheduling_pending"; label: string; detail: string };

const CLOSED = new Set(["declined", "closed"]);
const EARLY = new Set(["new_lead", "contacted", "discovery_meeting", "quotation_sent", "negotiation"]);
const POST_BOOKING = new Set(["in_progress", "delivered", "completed", "repeat_client", "referral"]);

/**
 * The derived status shown beside the stage. null = nothing to add (stage label alone is accurate).
 *  - fully paid, no live booking            -> "Paid — scheduling pending"
 *  - money received (not full), no booking  -> "Payment received — scheduling pending"
 *  - stage "booked" but no live booking     -> "Booked (no booking record)": the integrity anomaly, shown to staff, never hidden
 */
export function schedulingStatus(i: SchedulingStatusInput): SchedulingStatus | null {
  if (!i.flagOn && !i.autoBookOff) return null;                          // legacy: a payment books the project, nothing to add
  if (i.commercialIntent === "creative_crew_support") return null;       // Crew Support has its own request/confirmation flow
  if (!i.flagOn) {                                                        // booking records do not exist: only say "scheduling pending" for a paid project that is not yet marked Booked by hand
    if (!EARLY.has(i.crmStage)) return null;
    const paidNow = (i.paymentStatus ?? "").toLowerCase() === "paid";
    if (paidNow) return { code: "paid_scheduling_pending", label: "Paid — scheduling pending", detail: "Payment is complete. The date and team are not confirmed yet; Ordift will confirm the booking once availability is checked." };
    return Number(i.amountPaid ?? 0) > 0 ? { code: "part_paid_scheduling_pending", label: "Payment received — scheduling pending", detail: "A payment has been received. The date and team are not confirmed yet." } : null;
  }
  if (CLOSED.has(i.crmStage) || i.hasLiveBooking) return null;
  // A booking existed and was cancelled: never leave the client believing it stands. The quotation and every payment are untouched, so this reads the same whatever has been paid.
  if (i.hasCancelledBooking && !POST_BOOKING.has(i.crmStage)) {
    return { code: "cancelled_rescheduling_pending", label: "Booking Cancelled — Rescheduling Pending", detail: "The booking was cancelled and is no longer confirmed. The accepted quotation and any payment are unchanged; a new date has to be agreed and confirmed." };
  }
  const paid = (i.paymentStatus ?? "").toLowerCase() === "paid";
  const some = !paid && Number(i.amountPaid ?? 0) > 0;
  if (i.crmStage === "booked") {
    return { code: "booked_without_record", label: "Booked (no booking record)", detail: "The stage says booked but no confirmed booking exists. Staff should confirm or correct the booking." };
  }
  if (POST_BOOKING.has(i.crmStage)) return null;                         // work already under way: not a scheduling question any more
  if (paid) return { code: "paid_scheduling_pending", label: "Paid — scheduling pending", detail: "Payment is complete. The date and team are not confirmed yet; Ordift will confirm the booking once availability is checked." };
  if (some) return { code: "part_paid_scheduling_pending", label: "Payment received — scheduling pending", detail: "A payment has been received. The date and team are not confirmed yet." };
  return null;
}

/** The wording a CLIENT sees: never exposes the internal anomaly wording. */
export function clientSchedulingLabel(s: SchedulingStatus): string {
  return s.code === "booked_without_record" ? "Scheduling pending" : s.label;
}
