import { createAdminClient } from "@/lib/supabase/admin";
import { loadConfirmedBookingsForPeople, type ConfirmedBooking } from "@/lib/bookings/crewDirection";
import { bookingFlagOn } from "@/lib/bookings/rules";
import { bookingOverlapsSchedule, schedulesOverlap } from "./schedulePrecision";
import { effectiveTimezone } from "./schedule";

// THE definition of a scheduling conflict for Crew Support. Candidate
// ranking (Availability Review) and the final confirmation gate both call
// loadConflicts(), so "conflict" can never mean two different things.
//
//   firm  = a commitment that already exists: approved leave, or a slot
//           on ANOTHER request that is already Confirmed.
//   soft  = something merely in progress: a slot assigned/proposed on a
//           request that has not been confirmed yet.
//
// Availability Review shows both (soft ones warn). Confirmation refuses
// firm conflicts. Nobody is reserved just for being considered, and
// attendance_records is never read.
export type Conflict = { kind: "crew_slot" | "leave" | "booking"; label: string; firm: boolean };

// start/end are calendar dates. callTime/finishTime/timezone are OPTIONAL (the request's own call_time, finish_time and effective timezone): when all are readable the schedule is a precise daily
// window, otherwise it is treated conservatively as whole dates (schedulePrecision.ts). A confirmed ordinary booking of the same person is a FIRM conflict (booking switch on only).
export type DateRange = { start: string; end: string; callTime?: string | null; finishTime?: string | null; timezone?: string | null };

type SlotRow = {
  assignee_profile_id: string;
  request: { id: string; status: string; start_date: string; end_date: string; reference_number: string; is_test: boolean; call_time?: string | null; finish_time?: string | null; event_timezone?: string | null; payment_country?: string | null };
};

// Pure: turns the raw rows into conflicts. Directly testable.
export function classifyConflicts(params: {
  slots: SlotRow[];
  leave: { profile_id: string; start_date: string; end_date: string }[];
  range: DateRange;
  excludeRequestId: string;
  currentIsTest: boolean;
  bookings?: ConfirmedBooking[];
  // false = judge every schedule by whole calendar dates, exactly as before call/finish times were considered. loadConflicts passes the booking switch here, so Production behaves as it always has until the feature is released.
  precise?: boolean;
}): Map<string, Conflict[]> {
  const out = new Map<string, Conflict[]>();
  const push = (id: string, c: Conflict) => out.set(id, [...(out.get(id) ?? []), c]);
  for (const s of params.slots) {
    const r = s.request;
    if (r.id === params.excludeRequestId || r.status === "declined" || r.status === "cancelled") continue;
    if (r.is_test && !params.currentIsTest) continue; // QA records never block real scheduling
    const other = { start: r.start_date, end: r.end_date, callTime: r.call_time ?? null, finishTime: r.finish_time ?? null, timezone: effectiveTimezone({ override: r.event_timezone ?? null, paymentCountry: r.payment_country ?? null }).timezone };
    const dateOnly = (x: DateRange) => ({ start: x.start, end: x.end });
    if (params.precise === false ? schedulesOverlap(dateOnly(params.range), dateOnly(other)) : schedulesOverlap(params.range, other)) {
      push(s.assignee_profile_id, { kind: "crew_slot", firm: r.status === "confirmed", label: `${r.reference_number} (${r.start_date}${r.start_date === r.end_date ? "" : ` → ${r.end_date}`})${r.status === "confirmed" ? " — confirmed" : ""}` });
    }
  }
  for (const b of params.bookings ?? []) {
    if (b.segments.some((g) => bookingOverlapsSchedule(g, params.precise === false ? { start: params.range.start, end: params.range.end } : params.range))) push(b.assigneeId, { kind: "booking", firm: true, label: `booking ${b.reference} (confirmed)` });
  }
  for (const l of params.leave) push(l.profile_id, { kind: "leave", firm: true, label: `approved leave ${l.start_date} → ${l.end_date}` });
  return out;
}

export async function loadConflicts(profileIds: string[], range: DateRange, excludeRequestId: string, currentIsTest: boolean): Promise<Map<string, Conflict[]>> {
  if (profileIds.length === 0) return new Map();
  const admin = createAdminClient();
  // the schedule of the request being checked: its own call/finish times and timezone unless the caller supplies new ones (rescheduling)
  let current: DateRange = range;
  if (range.callTime === undefined && range.finishTime === undefined && range.timezone === undefined && excludeRequestId) {
    const { data: cur } = await admin.from("crew_support_requests").select("call_time, finish_time, event_timezone, enquiry_id").eq("id", excludeRequestId).maybeSingle();
    if (cur) {
      const { data: enq } = cur.enquiry_id ? await admin.from("enquiries").select("payment_country").eq("id", cur.enquiry_id as string).maybeSingle() : { data: null };
      current = { ...range, callTime: (cur.call_time as string | null) ?? null, finishTime: (cur.finish_time as string | null) ?? null, timezone: effectiveTimezone({ override: (cur.event_timezone as string | null) ?? null, paymentCountry: (enq?.payment_country as string | null) ?? null }).timezone };
    }
  }
  const [slots, leave, bookings] = await Promise.all([
    admin
      .from("crew_support_slots")
      .select("assignee_profile_id, request:crew_support_requests!inner(id, status, start_date, end_date, reference_number, is_test, call_time, finish_time, event_timezone, enquiry_id)")
      .in("assignee_profile_id", profileIds)
      .in("status", ["assigned", "proposed"]),
    admin.from("leave_requests").select("profile_id, start_date, end_date").in("profile_id", profileIds).eq("status", "approved").lte("start_date", range.end).gte("end_date", range.start),
    loadConfirmedBookingsForPeople(profileIds),                                  // [] unless the booking switch is on and the booking tables exist
  ]);
  if (slots.error) throw new Error(slots.error.message);
  if (leave.error) throw new Error(leave.error.message);
  const rows = (slots.data ?? []) as unknown as (SlotRow & { request: SlotRow["request"] & { enquiry_id?: string | null } })[];
  const enquiryIds = [...new Set(rows.map((r) => r.request.enquiry_id).filter((x): x is string => Boolean(x)))];
  const country = new Map<string, string | null>();
  if (enquiryIds.length) { const { data: enqs } = await admin.from("enquiries").select("id, payment_country").in("id", enquiryIds); for (const e of enqs ?? []) country.set(e.id as string, (e.payment_country as string | null) ?? null); }
  const withCountry: SlotRow[] = rows.map((r) => ({ ...r, request: { ...r.request, payment_country: r.request.enquiry_id ? country.get(r.request.enquiry_id) ?? null : null } }));
  return classifyConflicts({ slots: withCountry, leave: (leave.data ?? []) as { profile_id: string; start_date: string; end_date: string }[], range: current, excludeRequestId, currentIsTest, bookings, precise: bookingFlagOn() });
}

// The database refuses a Crew Support confirmation, a reschedule of a confirmed assignment, or an assignment that overlaps the same person's confirmed ordinary booking (booking switch on). There is no override:
// the person is reassigned or the schedule is changed. This turns that refusal into a plain message; any other message is left alone.
export function crewOverlapMessage(dbMessage: string | null | undefined): string | null {
  const m = /crew_confirm_overlaps_booking(?::\s*([A-Za-z0-9-]+))?/.exec(dbMessage ?? "");
  if (!m) return null;
  return `This person already has a confirmed booking${m[1] ? ` (${m[1]})` : ""} that overlaps these dates and times. Reassign the person or change the schedule: a justification cannot clear it. Nothing was changed.`;
}

// Used by the confirmation gate: only FIRM conflicts block.
export function firmConflicts(conflicts: Conflict[]): Conflict[] {
  return conflicts.filter((c) => c.firm);
}
