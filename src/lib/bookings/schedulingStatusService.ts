import { createAdminClient } from "@/lib/supabase/admin";
import { bookingFlagOn } from "./rules";
import { clientSchedulingLabel, paymentAutoBookOptedOut, schedulingStatus, type SchedulingStatus } from "./paymentStagePolicy";

// Derived "Paid — scheduling pending" status (read-only; no writes). Server only. Returns null while booking confirmation is off,
// when the booking tables are not there (Production today), or when nothing needs saying. A read failure NEVER invents a status.
export async function loadSchedulingStatus(
  e: { id: string; crmStage: string; paymentStatus: string | null; amountPaid: number | null; commercialIntent?: string | null },
  env: Record<string, string | undefined> = process.env,
): Promise<SchedulingStatus | null> {
  const flagOn = bookingFlagOn(env), autoBookOff = paymentAutoBookOptedOut(env);
  if (!flagOn && !autoBookOff) return null;
  if (!flagOn) return schedulingStatus({ flagOn: false, autoBookOff, crmStage: e.crmStage, paymentStatus: e.paymentStatus, amountPaid: e.amountPaid, hasLiveBooking: false, commercialIntent: e.commercialIntent });   // no booking tables to read
  try {
    const db = createAdminClient();
    let { data, error } = await db.from("enquiry_booking_confirmations").select("kind, cancellation_outcome").eq("enquiry_id", e.id).order("version", { ascending: false }).limit(1).maybeSingle();
    if (error) ({ data, error } = await db.from("enquiry_booking_confirmations").select("kind").eq("enquiry_id", e.id).order("version", { ascending: false }).limit(1).maybeSingle());   // a database without the outcome column (notices update not applied)
    if (error) return null;
    const kind = data ? (data as { kind: string }).kind : null; const cancellationOutcome = ((data as { cancellation_outcome?: string | null } | null)?.cancellation_outcome ?? null) as "rescheduling_pending" | "final" | null; const hasLiveBooking = kind !== null && kind !== "cancelled"; const hasCancelledBooking = kind === "cancelled";
    return schedulingStatus({ flagOn: true, crmStage: e.crmStage, paymentStatus: e.paymentStatus, amountPaid: e.amountPaid, hasLiveBooking, hasCancelledBooking, cancellationOutcome, commercialIntent: e.commercialIntent });
  } catch { return null; }
}

export const NEXT_AFTER_PAYMENT = "Booking confirmation";   // what actually comes next for a paid, unscheduled project (the pipeline's own "next stage" would be misleading)

// Overlay the derived label on dashboard cards (client wording). Cards for projects with nothing to add are returned unchanged.
export async function withSchedulingLabels<C extends { id: string; statusLabel: string; nextMilestoneLabel?: string | null }>(
  cards: C[],
  enquiries: { id: string; crmStage: string; paymentStatus: string | null; amountPaid: number | null }[],
  env: Record<string, string | undefined> = process.env,
): Promise<C[]> {
  if ((!bookingFlagOn(env) && !paymentAutoBookOptedOut(env)) || cards.length === 0) return cards;
  const byId = new Map(enquiries.map((e) => [e.id, e]));
  return Promise.all(cards.map(async (c) => {
    const e = byId.get(c.id); if (!e) return c;
    const s = await loadSchedulingStatus(e, env);
    return s ? { ...c, statusLabel: clientSchedulingLabel(s), ...("nextMilestoneLabel" in c ? { nextMilestoneLabel: s.code === "cancelled_final" ? null : NEXT_AFTER_PAYMENT } : {}) } : c;
  }));
}

// ---- the Admin list: the derived status of MANY enquiries at once (one extra query), for the "Needs scheduling" filter and badges. Nothing is stored; the same rule as the single-project status.
export type SchedulingFilter = "pending" | "cancelled";
export const schedulingFilterOf = (v: string | undefined): SchedulingFilter | null => (v === "pending" || v === "cancelled" ? v : null);
export const matchesSchedulingFilter = (s: SchedulingStatus | null | undefined, f: SchedulingFilter): boolean =>
  Boolean(s) && (f === "pending" ? s!.code === "paid_scheduling_pending" || s!.code === "part_paid_scheduling_pending" : s!.code === "cancelled_rescheduling_pending" || s!.code === "cancelled_final");

export async function loadSchedulingStatuses(
  rows: { id: string; crmStage: string; paymentStatus: string | null; amountPaid: number | null }[],
  env: Record<string, string | undefined> = process.env,
): Promise<Map<string, SchedulingStatus | null>> {
  const out = new Map<string, SchedulingStatus | null>();
  const flagOn = bookingFlagOn(env), autoBookOff = paymentAutoBookOptedOut(env);
  if ((!flagOn && !autoBookOff) || rows.length === 0) return out;
  const latest = new Map<string, { kind: string; outcome: string | null }>();
  if (flagOn) {
    const db = createAdminClient();
    const ids = rows.map((r) => r.id);
    let data: unknown[] | null; let error: { message: string } | null;
    ({ data, error } = await db.from("enquiry_booking_confirmations").select("enquiry_id, version, kind, cancellation_outcome").in("enquiry_id", ids).order("version", { ascending: false }));
    if (error) ({ data, error } = await db.from("enquiry_booking_confirmations").select("enquiry_id, version, kind").in("enquiry_id", ids).order("version", { ascending: false }));
    if (error) return out;                                                                                  // booking tables unreadable: show no derived status rather than a wrong one
    for (const r of (data ?? []) as { enquiry_id: string; kind: string; cancellation_outcome?: string | null }[]) if (!latest.has(r.enquiry_id)) latest.set(r.enquiry_id, { kind: r.kind, outcome: r.cancellation_outcome ?? null });
  }
  for (const r of rows) {
    const l = latest.get(r.id);
    out.set(r.id, schedulingStatus({ flagOn, autoBookOff, crmStage: r.crmStage, paymentStatus: r.paymentStatus, amountPaid: r.amountPaid, hasLiveBooking: Boolean(l) && l!.kind !== "cancelled", hasCancelledBooking: l?.kind === "cancelled", cancellationOutcome: (l?.outcome ?? null) as "rescheduling_pending" | "final" | null }));
  }
  return out;
}
