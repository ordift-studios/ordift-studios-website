import { createAdminClient } from "@/lib/supabase/admin";

// Ordift Organizational & Administrative Architecture V1, Phase 3.1,
// Part 6 (2026-08-25) — fixes the staleness limitation Phase 3 flagged:
// staff_details.manager_id was a snapshot taken at Position-assignment
// time, so it could go stale if the occupant of the upstream reporting
// Position later changed. Per explicit direction ("the Position
// reporting relationship must remain authoritative... do not make the
// person-to-person manager link the organizational source of truth"),
// this module makes "who is my manager right now" a LIVE resolution
// through positions.reports_to_position_id every time it's displayed,
// rather than trying to cascade-refresh a cached value whenever anyone
// else's Position changes. staff_details.manager_id itself is kept —
// assignStaffPosition() still writes it — but demoted to an honest
// point-in-time audit snapshot ("who was resolved as manager at the
// moment this Position was assigned"), never read for display anymore.
// This needs no trigger, no cascade, and is correct by construction:
// an unoccupied or vacated reporting Position, or a deactivated
// occupant, simply resolves to null, exactly matching "Empty Positions
// must remain valid" and "an upstream occupant leaves/deactivates".

export type ResolvedManager = { id: string; fullName: string | null } | null;

// Single-person lookup — used by getProfileCard() (self-view).
export async function resolveCurrentManager(positionId: string | null): Promise<ResolvedManager> {
  if (!positionId) return null;
  const admin = createAdminClient();

  const { data: position } = await admin
    .from("positions")
    .select("reports_to_position_id")
    .eq("id", positionId)
    .maybeSingle();
  if (!position?.reports_to_position_id) return null;

  const { data: occupant } = await admin
    .from("staff_details")
    .select("id")
    .eq("position_id", position.reports_to_position_id)
    .maybeSingle();
  if (!occupant) return null;

  const { data: profile } = await admin.from("profiles").select("full_name, access_status").eq("id", occupant.id).maybeSingle();
  if (!profile || profile.access_status !== "active") return null;

  return { id: occupant.id, fullName: profile.full_name };
}

export type PositionReportingRow = { id: string; name: string; reportsToPositionId: string | null };

// Bulk chain fetch for list views (e.g. /admin/users) — callers combine
// this with data they already have (staff_details.position_id per
// person, profiles.access_status per person) to resolve every person's
// current manager in-memory, with zero additional per-row queries. See
// resolveManagersInMemory() below for the shared resolution logic.
// Includes each Position's own name so a caller can show the
// STRUCTURAL reporting relationship (e.g. "Client Services Supervisor")
// even when nobody currently occupies it — never fabricating a manager
// merely because the position is vacant (Mishael Adjei reconciliation,
// 2026-09-15).
export async function listPositionReportingChain(): Promise<PositionReportingRow[]> {
  const admin = createAdminClient();
  const { data, error } = await admin.from("positions").select("id, name, reports_to_position_id");
  if (error) {
    console.error("[organization] failed to load position reporting chain", error.message);
    return [];
  }
  return (data ?? []).map((p) => ({ id: p.id, name: p.name, reportsToPositionId: p.reports_to_position_id }));
}

// Shared in-memory resolution — given the reporting chain, who occupies
// each Position (only active accounts count as a real current
// occupant), and one person's Position, returns their current manager's
// profile id. Exported so both adminData.ts (bulk) and any future
// consumer share one implementation of the walk.
export function resolveManagerInMemory(
  positionId: string | null,
  reportsToByPositionId: Map<string, string | null>,
  activeOccupantProfileIdByPositionId: Map<string, string>
): string | null {
  if (!positionId) return null;
  const reportsTo = reportsToByPositionId.get(positionId);
  if (!reportsTo) return null;
  return activeOccupantProfileIdByPositionId.get(reportsTo) ?? null;
}
