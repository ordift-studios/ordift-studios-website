import { createAdminClient } from "@/lib/supabase/admin";
import { logActivity } from "@/lib/admin/activityLog";
import { isSuperAdminId, hasJurisdictionAuthority } from "@/lib/organization/authority";

// Ordift Studios Compliance/COMP-SYS-1, Phase B4 Step 2 (2026-09-14) —
// leave balance/request workflow. Reuses the exact "Super Admin, or a
// holder of operations.administer" tier already established for
// comparable routine HR/organizational operations (assignStaffPosition,
// onboarding) — no new authorization concept, per explicit instruction.

export type LeaveBalance = {
  id: string;
  profileId: string;
  leaveTypeId: string;
  leaveYear: number;
  entitlementDays: number;
  carriedOverDays: number;
  protectedCarriedOverDays: number;
  usedDays: number;
  remainingDays: number;
};

function mapBalanceRow(r: {
  id: string;
  profile_id: string;
  leave_type_id: string;
  leave_year: number;
  entitlement_days: number;
  carried_over_days: number;
  protected_carried_over_days: number;
  used_days: number;
}): LeaveBalance {
  const remainingDays = r.entitlement_days + r.carried_over_days + r.protected_carried_over_days - r.used_days;
  return {
    id: r.id,
    profileId: r.profile_id,
    leaveTypeId: r.leave_type_id,
    leaveYear: r.leave_year,
    entitlementDays: r.entitlement_days,
    carriedOverDays: r.carried_over_days,
    protectedCarriedOverDays: r.protected_carried_over_days,
    usedDays: r.used_days,
    remainingDays,
  };
}

const BALANCE_SELECT = "id, profile_id, leave_type_id, leave_year, entitlement_days, carried_over_days, protected_carried_over_days, used_days";

export async function getLeaveBalance(profileId: string, leaveTypeId: string, leaveYear: number): Promise<LeaveBalance | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("leave_balances")
    .select(BALANCE_SELECT)
    .eq("profile_id", profileId)
    .eq("leave_type_id", leaveTypeId)
    .eq("leave_year", leaveYear)
    .maybeSingle();
  return data ? mapBalanceRow(data) : null;
}

// Pure — the standard, most defensible proration method (elapsed
// eligible days in the leave year / days in the leave year), used only
// as the default until Management specifies a different method.
// Documented, not asserted as an approved formula — OS-HR-GH-002 4.6
// requires SOME proration for new joiners without specifying the exact
// calculation, and straight-line day-based proration is the ordinary
// default absent a stated alternative.
export function computeProratedEntitlement(annualEntitlementDays: number, eligibleServiceDaysInYear: number, daysInLeaveYear: number): number {
  if (daysInLeaveYear <= 0) return 0;
  const clampedServiceDays = Math.max(0, Math.min(eligibleServiceDaysInYear, daysInLeaveYear));
  return Math.round((annualEntitlementDays * clampedServiceDays / daysInLeaveYear) * 100) / 100;
}

// Creates the balance row for this (profile, leaveType, leaveYear) ONLY
// if one does not already exist — never overwrites an existing row's
// entitlement_days, matching this whole phase's "historical values
// never overwritten" principle. entitlementDays must be supplied by the
// caller (from leave_types.annual_entitlement_days, or a prorated value
// via computeProratedEntitlement()) — never invented here.
export async function ensureLeaveBalance(params: {
  profileId: string;
  leaveTypeId: string;
  leaveYear: number;
  entitlementDays: number;
}): Promise<{ ok: true; balance: LeaveBalance } | { ok: false; error: string }> {
  const existing = await getLeaveBalance(params.profileId, params.leaveTypeId, params.leaveYear);
  if (existing) return { ok: true, balance: existing };

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("leave_balances")
    .insert({
      profile_id: params.profileId,
      leave_type_id: params.leaveTypeId,
      leave_year: params.leaveYear,
      entitlement_days: params.entitlementDays,
    })
    .select(BALANCE_SELECT)
    .single();
  if (error || !data) return { ok: false, error: error?.message ?? "Failed to create the leave balance." };
  return { ok: true, balance: mapBalanceRow(data) };
}

export async function canManageLeave(actorUserId: string): Promise<boolean> {
  if (await isSuperAdminId(actorUserId)) return true;
  return hasJurisdictionAuthority(actorUserId, "operations", "administer");
}

export type LeaveRequestStatus = "submitted" | "under_review" | "approved" | "alternative_proposed" | "declined" | "cancelled";

export interface LeaveRequest {
  id: string;
  profileId: string;
  leaveTypeId: string;
  startDate: string;
  endDate: string;
  daysRequested: number;
  halfAllocation: "H1" | "H2" | null;
  status: LeaveRequestStatus;
  reason: string | null;
  certificateReference: string | null;
  decidedBy: string | null;
  decidedAt: string | null;
  decisionNotes: string | null;
  alternativeStartDate: string | null;
  alternativeEndDate: string | null;
  createdAt: string;
}

function mapRequestRow(r: {
  id: string;
  profile_id: string;
  leave_type_id: string;
  start_date: string;
  end_date: string;
  days_requested: number;
  half_allocation: string | null;
  status: string;
  reason: string | null;
  certificate_reference: string | null;
  decided_by: string | null;
  decided_at: string | null;
  decision_notes: string | null;
  alternative_start_date: string | null;
  alternative_end_date: string | null;
  created_at: string;
}): LeaveRequest {
  return {
    id: r.id,
    profileId: r.profile_id,
    leaveTypeId: r.leave_type_id,
    startDate: r.start_date,
    endDate: r.end_date,
    daysRequested: r.days_requested,
    halfAllocation: r.half_allocation as "H1" | "H2" | null,
    status: r.status as LeaveRequestStatus,
    reason: r.reason,
    certificateReference: r.certificate_reference,
    decidedBy: r.decided_by,
    decidedAt: r.decided_at,
    decisionNotes: r.decision_notes,
    alternativeStartDate: r.alternative_start_date,
    alternativeEndDate: r.alternative_end_date,
    createdAt: r.created_at,
  };
}

const REQUEST_SELECT =
  "id, profile_id, leave_type_id, start_date, end_date, days_requested, half_allocation, status, reason, certificate_reference, decided_by, decided_at, decision_notes, alternative_start_date, alternative_end_date, created_at";

// Submission itself never touches leave_balances — "Only Approved leave
// reserves/deducts entitlement" (OS-HR-GH-002 4.3). Self-submission is
// always allowed; submitting on someone else's behalf requires the same
// operational-HR tier as decideLeaveRequest().
export async function submitLeaveRequest(params: {
  profileId: string;
  leaveTypeId: string;
  startDate: string;
  endDate: string;
  daysRequested: number;
  halfAllocation?: "H1" | "H2" | null;
  reason?: string | null;
  certificateReference?: string | null;
  actorUserId: string;
}): Promise<{ ok: true; requestId: string } | { ok: false; error: string }> {
  if (params.daysRequested <= 0) return { ok: false, error: "daysRequested must be greater than zero." };
  if (params.actorUserId !== params.profileId && !(await canManageLeave(params.actorUserId))) {
    return { ok: false, error: "Not authorized to submit a leave request on behalf of another person." };
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("leave_requests")
    .insert({
      profile_id: params.profileId,
      leave_type_id: params.leaveTypeId,
      start_date: params.startDate,
      end_date: params.endDate,
      days_requested: params.daysRequested,
      half_allocation: params.halfAllocation ?? null,
      reason: params.reason ?? null,
      certificate_reference: params.certificateReference ?? null,
      status: "submitted",
      created_by: params.actorUserId,
    })
    .select("id")
    .single();
  if (error || !data) return { ok: false, error: error?.message ?? "Failed to submit the leave request." };

  await logActivity({
    actorUserId: params.actorUserId,
    action: "leave_request.submitted",
    entityType: "user",
    entityId: params.profileId,
    metadata: { requestId: data.id, leaveTypeId: params.leaveTypeId, startDate: params.startDate, endDate: params.endDate, daysRequested: params.daysRequested },
  });

  return { ok: true, requestId: data.id };
}

// Only a transition to "approved" deducts from leave_balances.used_days
// — via a single atomic UPDATE (used_days = used_days + N), never a
// read-then-write, so two concurrent approvals can never silently lose
// an increment. "declined"/"alternative_proposed"/"cancelled" never
// touch the balance at all.
export async function decideLeaveRequest(params: {
  requestId: string;
  decision: "approved" | "declined" | "alternative_proposed";
  alternativeStartDate?: string | null;
  alternativeEndDate?: string | null;
  decisionNotes?: string | null;
  actorUserId: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!(await canManageLeave(params.actorUserId))) {
    return { ok: false, error: "Not authorized to decide leave requests." };
  }

  const admin = createAdminClient();
  const { data: existing } = await admin
    .from("leave_requests")
    .select("id, profile_id, leave_type_id, start_date, days_requested, status")
    .eq("id", params.requestId)
    .maybeSingle();
  if (!existing) return { ok: false, error: "Leave request not found." };
  if (existing.status !== "submitted" && existing.status !== "under_review") {
    return { ok: false, error: `Cannot decide a leave request already in status "${existing.status}".` };
  }

  const statusMap: Record<typeof params.decision, LeaveRequestStatus> = {
    approved: "approved",
    declined: "declined",
    alternative_proposed: "alternative_proposed",
  };

  // Ordering matters: for "approved" specifically, the balance
  // increment runs FIRST, before the request's own status flips. If the
  // increment fails or matches no row, this function returns early with
  // the request still "submitted"/"under_review" — never left saying
  // "approved" while the balance was never actually deducted. The other
  // two decisions touch no balance, so they update status directly.
  if (params.decision === "approved") {
    const leaveYear = new Date(existing.start_date).getFullYear();
    const { data: rowsUpdated, error: balanceError } = await admin.rpc("increment_leave_balance_used_days", {
      p_profile_id: existing.profile_id,
      p_leave_type_id: existing.leave_type_id,
      p_leave_year: leaveYear,
      p_days: existing.days_requested,
    });
    if (balanceError || rowsUpdated !== 1) {
      console.error("[organization] failed to increment leave_balances.used_days", balanceError?.message ?? `rowsUpdated=${rowsUpdated}`);
      return {
        ok: false,
        error:
          rowsUpdated === 0
            ? "This person has no leave balance recorded for this type/year yet — create one (ensureLeaveBalance) before approving this request."
            : "Failed to update the leave balance — the request was not approved.",
      };
    }
  }

  const { error } = await admin
    .from("leave_requests")
    .update({
      status: statusMap[params.decision],
      decided_by: params.actorUserId,
      decided_at: new Date().toISOString(),
      decision_notes: params.decisionNotes ?? null,
      alternative_start_date: params.alternativeStartDate ?? null,
      alternative_end_date: params.alternativeEndDate ?? null,
    })
    .eq("id", params.requestId)
    .in("status", ["submitted", "under_review"]); // atomic: only decides a request still awaiting decision
  if (error) {
    console.error("[organization] failed to decide leave_request", error.message);
    if (params.decision === "approved") {
      console.error(
        `[organization] leave_balances.used_days was already incremented for profile ${existing.profile_id} before this failure — requires manual reconciliation`
      );
    }
    return { ok: false, error: "Failed to record the decision." };
  }

  await logActivity({
    actorUserId: params.actorUserId,
    action: "leave_request.decided",
    entityType: "user",
    entityId: existing.profile_id,
    metadata: { requestId: params.requestId, decision: params.decision, decisionNotes: params.decisionNotes ?? null },
  });

  return { ok: true };
}

export async function listLeaveRequestsForProfile(profileId: string): Promise<LeaveRequest[]> {
  const admin = createAdminClient();
  const { data, error } = await admin.from("leave_requests").select(REQUEST_SELECT).eq("profile_id", profileId).order("created_at", { ascending: false });
  if (error) {
    console.error("[organization] failed to load leave_requests", error.message);
    return [];
  }
  return (data ?? []).map(mapRequestRow);
}

export interface PendingLeaveRequest extends LeaveRequest {
  profileFullName: string | null;
}

// Ordift Studios Compliance/COMP-SYS-1, Phase B5 Step 2 (2026-09-14) —
// the Admin-wide queue: every request still awaiting a decision, across
// every person, for the Leave workspace. profileFullName is read
// alongside the request row (not a separate N+1 lookup) purely for
// display — the request itself remains the authoritative record.
export async function listPendingLeaveRequestsAcrossStaff(): Promise<PendingLeaveRequest[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("leave_requests")
    .select(`${REQUEST_SELECT}, profiles!leave_requests_profile_id_fkey(full_name)`)
    .in("status", ["submitted", "under_review"])
    .order("created_at", { ascending: true });
  if (error) {
    console.error("[organization] failed to load pending leave_requests", error.message);
    return [];
  }
  return (data ?? []).map((r) => {
    const row = r as unknown as Parameters<typeof mapRequestRow>[0] & { profiles: { full_name: string | null } | null };
    return { ...mapRequestRow(row), profileFullName: row.profiles?.full_name ?? null };
  });
}
