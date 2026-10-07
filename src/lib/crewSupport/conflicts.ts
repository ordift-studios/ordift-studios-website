import { createAdminClient } from "@/lib/supabase/admin";

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
export type Conflict = { kind: "crew_slot" | "leave"; label: string; firm: boolean };

export type DateRange = { start: string; end: string };

type SlotRow = {
  assignee_profile_id: string;
  request: { id: string; status: string; start_date: string; end_date: string; reference_number: string; is_test: boolean };
};

// Pure: turns the raw rows into conflicts. Directly testable.
export function classifyConflicts(params: {
  slots: SlotRow[];
  leave: { profile_id: string; start_date: string; end_date: string }[];
  range: DateRange;
  excludeRequestId: string;
  currentIsTest: boolean;
}): Map<string, Conflict[]> {
  const out = new Map<string, Conflict[]>();
  const push = (id: string, c: Conflict) => out.set(id, [...(out.get(id) ?? []), c]);
  for (const s of params.slots) {
    const r = s.request;
    if (r.id === params.excludeRequestId || r.status === "declined" || r.status === "cancelled") continue;
    if (r.is_test && !params.currentIsTest) continue; // QA records never block real scheduling
    if (r.start_date <= params.range.end && r.end_date >= params.range.start) {
      push(s.assignee_profile_id, { kind: "crew_slot", firm: r.status === "confirmed", label: `${r.reference_number} (${r.start_date}${r.start_date === r.end_date ? "" : ` → ${r.end_date}`})${r.status === "confirmed" ? " — confirmed" : ""}` });
    }
  }
  for (const l of params.leave) push(l.profile_id, { kind: "leave", firm: true, label: `approved leave ${l.start_date} → ${l.end_date}` });
  return out;
}

export async function loadConflicts(profileIds: string[], range: DateRange, excludeRequestId: string, currentIsTest: boolean): Promise<Map<string, Conflict[]>> {
  if (profileIds.length === 0) return new Map();
  const admin = createAdminClient();
  const [slots, leave] = await Promise.all([
    admin
      .from("crew_support_slots")
      .select("assignee_profile_id, request:crew_support_requests!inner(id, status, start_date, end_date, reference_number, is_test)")
      .in("assignee_profile_id", profileIds)
      .in("status", ["assigned", "proposed"]),
    admin.from("leave_requests").select("profile_id, start_date, end_date").in("profile_id", profileIds).eq("status", "approved").lte("start_date", range.end).gte("end_date", range.start),
  ]);
  if (slots.error) throw new Error(slots.error.message);
  if (leave.error) throw new Error(leave.error.message);
  return classifyConflicts({ slots: (slots.data ?? []) as unknown as SlotRow[], leave: (leave.data ?? []) as { profile_id: string; start_date: string; end_date: string }[], range, excludeRequestId, currentIsTest });
}

// Used by the confirmation gate: only FIRM conflicts block.
export function firmConflicts(conflicts: Conflict[]): Conflict[] {
  return conflicts.filter((c) => c.firm);
}
