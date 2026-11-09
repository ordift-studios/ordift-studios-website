// PAYMENT vs BOOKING - pure rules (no I/O).
// Payment completion and booking confirmation are two separate, auditable events.
//  * A payment never moves an ordinary enquiry to the stage "booked" once booking confirmation is switched on: only a genuine
//    confirmation (public.confirm_ordinary_booking) does, after the availability / conflict / agreement controls.
//  * What the client and staff see in between is DERIVED from facts that already exist (payment status + whether a live confirmed
//    booking record exists). No new stage, no new payment status, no migration.
//  * With the booking switch OFF the legacy behaviour is unchanged (payment in full still advances the stage), so Production is not affected.

export type PaymentAdvanceInput = { flagOn: boolean; commercialIntent: string | null | undefined };

/** May a completed full payment move this enquiry to "booked" and send the booking e-mails? */
export function paymentMayBookEnquiry(i: PaymentAdvanceInput): boolean {
  if (i.commercialIntent === "creative_crew_support") return false;   // Crew Support is booked only by its own confirmation (existing rule)
  if (i.flagOn) return false;                                         // booking confirmation owns the "booked" stage
  return true;                                                        // legacy behaviour while the switch is off
}

export type SchedulingStatusInput = {
  flagOn: boolean;
  crmStage: string;
  paymentStatus: string | null | undefined;      // enquiries.payment_status
  amountPaid: number | null | undefined;
  hasLiveBooking: boolean;                       // latest confirmation row exists and is not "cancelled"
  commercialIntent?: string | null;
};
export type SchedulingStatus = { code: "paid_scheduling_pending" | "part_paid_scheduling_pending" | "booked_without_record"; label: string; detail: string };

const CLOSED = new Set(["declined", "closed"]);
const POST_BOOKING = new Set(["in_progress", "delivered", "completed", "repeat_client", "referral"]);

/**
 * The derived status shown beside the stage. null = nothing to add (stage label alone is accurate).
 *  - fully paid, no live booking            -> "Paid — scheduling pending"
 *  - money received (not full), no booking  -> "Payment received — scheduling pending"
 *  - stage "booked" but no live booking     -> "Booked (no booking record)": the integrity anomaly, shown to staff, never hidden
 */
export function schedulingStatus(i: SchedulingStatusInput): SchedulingStatus | null {
  if (!i.flagOn) return null;
  if (i.commercialIntent === "creative_crew_support") return null;       // Crew Support has its own request/confirmation flow
  if (CLOSED.has(i.crmStage) || i.hasLiveBooking) return null;
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
