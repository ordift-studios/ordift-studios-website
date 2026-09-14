import { createAdminClient } from "@/lib/supabase/admin";
import { logActivity } from "@/lib/admin/activityLog";
import { isSuperAdminId, hasJurisdictionAuthority } from "@/lib/organization/authority";

// Ordift Studios Compliance/COMP-SYS-1, Phase B4 Step 17 (2026-09-14) —
// fixed-term employment tracking, OS-HR-GH-003 9.1.

async function canManageFixedTermEmployment(actorUserId: string): Promise<boolean> {
  if (await isSuperAdminId(actorUserId)) return true;
  return hasJurisdictionAuthority(actorUserId, "operations", "administer");
}

// --- pure functions --------------------------------------------------

// OS-HR-GH-003 9.1's real approved alert thresholds, never invented.
export const FIXED_TERM_ALERT_DAYS_BEFORE_END = [90, 60, 30] as const;
export type FixedTermAlertDaysBeforeEnd = (typeof FIXED_TERM_ALERT_DAYS_BEFORE_END)[number];

export interface FixedTermAlert {
  daysBeforeEnd: FixedTermAlertDaysBeforeEnd;
  alertDate: string; // YYYY-MM-DD
}

// Pure — computes the three real alert dates (endDate minus 90/60/30
// days) for a fixed-term record.
export function computeFixedTermAlertDates(endDate: string): FixedTermAlert[] {
  return FIXED_TERM_ALERT_DAYS_BEFORE_END.map((daysBeforeEnd) => {
    const end = new Date(`${endDate}T00:00:00.000Z`);
    const alert = new Date(end);
    alert.setUTCDate(alert.getUTCDate() - daysBeforeEnd);
    return { daysBeforeEnd, alertDate: alert.toISOString().slice(0, 10) };
  });
}

// Pure — an alert is due once the current date has reached its alert
// date but the term has not yet ended.
export function isFixedTermAlertDue(endDate: string, daysBeforeEnd: FixedTermAlertDaysBeforeEnd, asOfDate: string): boolean {
  const alert = computeFixedTermAlertDates(endDate).find((a) => a.daysBeforeEnd === daysBeforeEnd);
  if (!alert) return false;
  return asOfDate >= alert.alertDate && asOfDate < endDate;
}

// Pure — sums calendar days across a chain of fixed-term periods
// (inclusive of both start and end date), the concrete expression of
// "service history is preserved across versions." The caller assembles
// the chain (e.g. via listFixedTermServiceHistory() below); this
// function performs no database access itself.
export function computeCumulativeServiceDays(periods: { startDate: string; endDate: string }[]): number {
  return periods.reduce((total, period) => {
    const start = new Date(`${period.startDate}T00:00:00.000Z`);
    const end = new Date(`${period.endDate}T00:00:00.000Z`);
    const days = Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
    return total + days;
  }, 0);
}

// --- DB-dependent functions -------------------------------------------

// When renewedFromId is supplied, the prior record's outcome must
// already be exactly 'renewal' — checked here, not merely documented —
// so a renewal record can never be created before the renewal decision
// that authorizes it.
export async function createFixedTermEmploymentRecord(params: {
  profileId: string;
  startDate: string;
  endDate: string;
  renewedFromId?: string | null;
  actorUserId: string;
}): Promise<{ ok: true; recordId: string } | { ok: false; error: string }> {
  if (!(await canManageFixedTermEmployment(params.actorUserId))) {
    return { ok: false, error: "Not authorized to create a fixed-term employment record." };
  }
  if (!(params.endDate > params.startDate)) return { ok: false, error: "The end date must be after the start date." };

  const admin = createAdminClient();

  if (params.renewedFromId) {
    const { data: prior } = await admin.from("fixed_term_employment_records").select("id, outcome, profile_id").eq("id", params.renewedFromId).maybeSingle();
    if (!prior) return { ok: false, error: "The prior fixed-term record to renew from was not found." };
    if (prior.outcome !== "renewal") return { ok: false, error: "The prior term's outcome must be 'renewal' before creating the renewal record." };
    if (prior.profile_id !== params.profileId) return { ok: false, error: "The renewed record must belong to the same person as the prior term." };
  }

  const { data, error } = await admin
    .from("fixed_term_employment_records")
    .insert({ profile_id: params.profileId, start_date: params.startDate, end_date: params.endDate, renewed_from_id: params.renewedFromId ?? null })
    .select("id")
    .single();
  if (error || !data) {
    if (error?.code === "23505") return { ok: false, error: "The prior term has already been renewed into another record." };
    return { ok: false, error: error?.message ?? "Failed to create the fixed-term employment record." };
  }

  await logActivity({ actorUserId: params.actorUserId, action: "fixed_term_employment_record.created", entityType: "user", entityId: params.profileId, metadata: { recordId: data.id, renewedFromId: params.renewedFromId ?? null } });
  return { ok: true, recordId: data.id };
}

export type FixedTermOutcome = "renewal" | "conversion_to_indefinite" | "expiry" | "other_lawful_outcome";

// Deliberately selected, never inferred from the end date passing —
// OS-HR-GH-003 9.1: "Renewal, conversion to indefinite employment,
// expiry or another lawful outcome must be deliberately selected."
export async function decideFixedTermOutcome(params: { recordId: string; outcome: FixedTermOutcome; outcomeNotes: string; actorUserId: string }): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!(await canManageFixedTermEmployment(params.actorUserId))) {
    return { ok: false, error: "Not authorized to decide a fixed-term employment outcome." };
  }
  if (!params.outcomeNotes.trim()) return { ok: false, error: "Outcome notes are required." };

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("fixed_term_employment_records")
    .update({ outcome: params.outcome, outcome_decided_by: params.actorUserId, outcome_decided_at: new Date().toISOString(), outcome_notes: params.outcomeNotes, status: "concluded" })
    .eq("id", params.recordId)
    .is("outcome", null)
    .select("id, profile_id")
    .maybeSingle();
  if (error) return { ok: false, error: "Failed to decide the fixed-term outcome." };
  if (!data) return { ok: false, error: "Record not found, or its outcome was already decided." };

  await logActivity({ actorUserId: params.actorUserId, action: "fixed_term_employment_record.outcome_decided", entityType: "user", entityId: data.profile_id, metadata: { recordId: params.recordId, outcome: params.outcome } });
  return { ok: true };
}

export async function listFixedTermRecordsForProfile(profileId: string): Promise<
  { id: string; startDate: string; endDate: string; outcome: string | null; status: string; renewedFromId: string | null }[]
> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("fixed_term_employment_records")
    .select("id, start_date, end_date, outcome, status, renewed_from_id")
    .eq("profile_id", profileId)
    .order("start_date", { ascending: true });
  if (error) {
    console.error("[organization] failed to load fixed_term_employment_records", error.message);
    return [];
  }
  return (data ?? []).map((r) => ({ id: r.id, startDate: r.start_date, endDate: r.end_date, outcome: r.outcome, status: r.status, renewedFromId: r.renewed_from_id }));
}

// Walks the renewed_from_id chain backward from the given record to
// assemble the full service history — the concrete realization of 9.1's
// "Service history is preserved across versions."
interface FixedTermChainRow {
  id: string;
  start_date: string;
  end_date: string;
  renewed_from_id: string | null;
}

async function fetchFixedTermChainRow(admin: ReturnType<typeof createAdminClient>, id: string): Promise<FixedTermChainRow | null> {
  const { data } = await admin.from("fixed_term_employment_records").select("id, start_date, end_date, renewed_from_id").eq("id", id).maybeSingle();
  return data;
}

export async function getFixedTermServiceHistory(recordId: string): Promise<{ periods: { id: string; startDate: string; endDate: string }[]; cumulativeServiceDays: number }> {
  const admin = createAdminClient();
  const periods: { id: string; startDate: string; endDate: string }[] = [];
  let currentId: string | null = recordId;

  while (currentId) {
    const row = await fetchFixedTermChainRow(admin, currentId);
    if (!row) break;
    periods.unshift({ id: row.id, startDate: row.start_date, endDate: row.end_date });
    currentId = row.renewed_from_id;
  }

  return { periods, cumulativeServiceDays: computeCumulativeServiceDays(periods) };
}
