import { createAdminClient } from "@/lib/supabase/admin";
import { logActivity } from "@/lib/admin/activityLog";
import { isSuperAdminId, hasJurisdictionAuthority } from "@/lib/organization/authority";
import { submitLeaveRequest, decideLeaveRequest, canReviewLeaveRequestFor, type LeaveRequestStatus } from "@/lib/organization/leaveRequests";
import { countEligibleWorkingDays } from "@/lib/organization/workingDayCalendar";
import { resolveEmployeeLeaveJurisdiction } from "@/lib/organization/leaveTypes";
import { sendEmail } from "@/lib/shared/email/dispatch";
import type { WorkforceJurisdiction } from "@/lib/compliance/requirementClassification";

// Ordift Studios Workforce/Schedule & Leave Phase, Part 1 (2026-09-15)
// — Leave Bidding. Reuses leave_requests/leave_balances wholesale
// (migration 0087): a "bid" IS a leave_requests row with
// half_allocation set, submitted/decided through the SAME
// submitLeaveRequest()/decideLeaveRequest() functions — never a
// parallel request table. What this module adds is the two things
// that genuinely didn't exist: configurable bidding-window data
// (leave_bidding_windows, migration 0119) and a real, checked
// draw-forward-requires-explicit-approval gate. "Remaining planning
// allocation" is always computed live from leave_requests
// (submitted/under_review/approved rows tagged for that half/year) —
// never a second, independently-maintained balance that could drift
// from the real requests.
//
// Jurisdiction-scoped throughout, never a Ghana platform constant:
// every function here takes/resolves a WorkforceJurisdiction, and
// window rows are keyed by it — a future jurisdiction registers its
// own leave_bidding_windows rows (different allocation, different
// draw-forward default) with zero code change here.

export const LEAVE_BIDDING_HALVES = ["H1", "H2"] as const;
export type LeaveBiddingHalf = (typeof LEAVE_BIDDING_HALVES)[number];

export type LeaveBiddingWindow = {
  id: string;
  jurisdiction: WorkforceJurisdiction;
  leaveYear: number;
  half: LeaveBiddingHalf;
  planningAllocationDays: number;
  windowOpensAt: string;
  windowClosesAt: string;
  drawForwardAllowed: boolean;
  notes: string | null;
};

function mapWindowRow(r: {
  id: string;
  jurisdiction: string;
  leave_year: number;
  half: string;
  planning_allocation_days: number;
  window_opens_at: string;
  window_closes_at: string;
  draw_forward_allowed: boolean;
  notes: string | null;
}): LeaveBiddingWindow {
  return {
    id: r.id,
    jurisdiction: r.jurisdiction as WorkforceJurisdiction,
    leaveYear: r.leave_year,
    half: r.half as LeaveBiddingHalf,
    planningAllocationDays: r.planning_allocation_days,
    windowOpensAt: r.window_opens_at,
    windowClosesAt: r.window_closes_at,
    drawForwardAllowed: r.draw_forward_allowed,
    notes: r.notes,
  };
}

const WINDOW_SELECT = "id, jurisdiction, leave_year, half, planning_allocation_days, window_opens_at, window_closes_at, draw_forward_allowed, notes";

export async function listLeaveBiddingWindows(jurisdiction: WorkforceJurisdiction, leaveYear: number): Promise<LeaveBiddingWindow[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("leave_bidding_windows")
    .select(WINDOW_SELECT)
    .eq("jurisdiction", jurisdiction)
    .eq("leave_year", leaveYear)
    .order("half");
  if (error) {
    console.error("[organization] failed to load leave_bidding_windows", error.message);
    return [];
  }
  return (data ?? []).map(mapWindowRow);
}

export async function getLeaveBiddingWindow(jurisdiction: WorkforceJurisdiction, leaveYear: number, half: LeaveBiddingHalf): Promise<LeaveBiddingWindow | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("leave_bidding_windows")
    .select(WINDOW_SELECT)
    .eq("jurisdiction", jurisdiction)
    .eq("leave_year", leaveYear)
    .eq("half", half)
    .maybeSingle();
  return data ? mapWindowRow(data) : null;
}

// Pure — whether `now` falls within [opensAt, closesAt). Isolated from
// the DB read so it's directly unit-testable.
export function isWindowOpen(window: Pick<LeaveBiddingWindow, "windowOpensAt" | "windowClosesAt">, now: Date): boolean {
  const opens = new Date(window.windowOpensAt).getTime();
  const closes = new Date(window.windowClosesAt).getTime();
  const t = now.getTime();
  return t >= opens && t < closes;
}

async function canManageLeaveBiddingWindows(actorUserId: string): Promise<boolean> {
  if (await isSuperAdminId(actorUserId)) return true;
  return hasJurisdictionAuthority(actorUserId, "operations", "administer");
}

// The only write path for window configuration — HR/Super Admin only.
// Upserts on (jurisdiction, leave_year, half) — the real unique
// constraint (migration 0119) — so re-running this for the same
// period updates it in place rather than creating a duplicate.
export async function configureLeaveBiddingWindow(params: {
  jurisdiction: WorkforceJurisdiction;
  leaveYear: number;
  half: LeaveBiddingHalf;
  planningAllocationDays: number;
  windowOpensAt: string;
  windowClosesAt: string;
  drawForwardAllowed: boolean;
  notes?: string | null;
  actorUserId: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!(await canManageLeaveBiddingWindows(params.actorUserId))) {
    return { ok: false, error: "Not authorized to configure Leave Bidding windows." };
  }
  if (new Date(params.windowClosesAt).getTime() <= new Date(params.windowOpensAt).getTime()) {
    return { ok: false, error: "The window's close date must be after its open date." };
  }
  if (params.planningAllocationDays <= 0) {
    return { ok: false, error: "Planning allocation must be greater than zero." };
  }

  const admin = createAdminClient();
  const { data: existing } = await admin
    .from("leave_bidding_windows")
    .select("id")
    .eq("jurisdiction", params.jurisdiction)
    .eq("leave_year", params.leaveYear)
    .eq("half", params.half)
    .maybeSingle();

  const row = {
    jurisdiction: params.jurisdiction,
    leave_year: params.leaveYear,
    half: params.half,
    planning_allocation_days: params.planningAllocationDays,
    window_opens_at: params.windowOpensAt,
    window_closes_at: params.windowClosesAt,
    draw_forward_allowed: params.drawForwardAllowed,
    notes: params.notes ?? null,
  };

  const { error } = existing
    ? await admin.from("leave_bidding_windows").update(row).eq("id", existing.id)
    : await admin.from("leave_bidding_windows").insert({ ...row, created_by: params.actorUserId });
  if (error) {
    console.error("[organization] failed to configure leave_bidding_windows", error.message);
    return { ok: false, error: "Failed to save the bidding window." };
  }

  await logActivity({
    actorUserId: params.actorUserId,
    action: "leave_bidding_window.configured",
    entityType: "leave_bidding_window",
    metadata: { jurisdiction: params.jurisdiction, leaveYear: params.leaveYear, half: params.half },
  });

  return { ok: true };
}

export type PlanningAllocationSummary = {
  half: LeaveBiddingHalf;
  allocationDays: number;
  committedDays: number; // sum of submitted + under_review + approved requests tagged this half/year
  remainingDays: number;
  windowOpen: boolean;
  window: LeaveBiddingWindow | null;
};

// Always computed live — never a stored/incrementing counter — so it
// can never drift from the real leave_requests rows it derives from.
// "Committed" intentionally includes PENDING (submitted/under_review)
// requests, not only approved ones: this is the pacing/conflict check
// ("remaining planning allocation" the employee sees before bidding),
// entirely separate from leave_balances.used_days, which — unchanged —
// still only ever increments on genuine approval.
export async function getPlanningAllocationSummary(params: {
  profileId: string;
  jurisdiction: WorkforceJurisdiction;
  leaveYear: number;
  half: LeaveBiddingHalf;
}): Promise<PlanningAllocationSummary> {
  const admin = createAdminClient();
  const window = await getLeaveBiddingWindow(params.jurisdiction, params.leaveYear, params.half);

  const yearStart = `${params.leaveYear}-01-01`;
  const yearEnd = `${params.leaveYear}-12-31`;
  const { data } = await admin
    .from("leave_requests")
    .select("days_requested")
    .eq("profile_id", params.profileId)
    .eq("half_allocation", params.half)
    .in("status", ["submitted", "under_review", "approved"] satisfies LeaveRequestStatus[])
    .gte("start_date", yearStart)
    .lte("start_date", yearEnd);

  const committedDays = (data ?? []).reduce((sum, r) => sum + Number(r.days_requested), 0);
  const allocationDays = window?.planningAllocationDays ?? 0;

  return {
    half: params.half,
    allocationDays,
    committedDays,
    remainingDays: allocationDays - committedDays,
    windowOpen: window ? isWindowOpen(window, new Date()) : false,
    window,
  };
}

export type SubmitLeaveBidResult =
  | { ok: true; requestId: string; drawForwardRequired: boolean }
  | { ok: false; error: string };

// Submits a genuine bid: a leave_requests row with half_allocation set,
// gated on a currently-open window for the person's REAL resolved
// jurisdiction (never hardcoded), with the day-count independently
// computed from the canonical working-day/public-holiday calendar
// (never trusted from the caller) — Section 4.2/B3's explicit
// requirement. Exceeding the remaining planning allocation does NOT
// block submission (an employee can still bid — the reviewer decides,
// per "no automatic approval/decline"); it only marks the result
// drawForwardRequired so the UI can surface it honestly, and
// decideLeaveBid() below refuses to approve it without an explicit
// draw-forward acknowledgement.
export async function submitLeaveBid(params: {
  profileId: string;
  leaveTypeId: string;
  startDate: string;
  endDate: string;
  half: LeaveBiddingHalf;
  reason?: string | null;
  actorUserId: string;
}): Promise<SubmitLeaveBidResult> {
  const jurisdiction = await resolveEmployeeLeaveJurisdiction(params.profileId);
  if (!jurisdiction) return { ok: false, error: "This person's employment jurisdiction is not yet recorded — cannot resolve Leave Bidding rules." };

  const leaveYear = new Date(params.startDate).getFullYear();
  const window = await getLeaveBiddingWindow(jurisdiction, leaveYear, params.half);
  if (!window) return { ok: false, error: `No Leave Bidding window is configured for ${params.half} ${leaveYear} in this jurisdiction yet.` };
  if (!isWindowOpen(window, new Date())) {
    return { ok: false, error: `The ${params.half} ${leaveYear} bidding window is not currently open (opens ${window.windowOpensAt}, closes ${window.windowClosesAt}).` };
  }

  const daysRequested = await countEligibleWorkingDays({ profileId: params.profileId, startDate: params.startDate, endDate: params.endDate });
  if (daysRequested <= 0) {
    return { ok: false, error: "The selected dates contain no eligible working days — nothing to bid." };
  }

  const summary = await getPlanningAllocationSummary({ profileId: params.profileId, jurisdiction, leaveYear, half: params.half });
  const drawForwardRequired = daysRequested > summary.remainingDays;

  const result = await submitLeaveRequest({
    profileId: params.profileId,
    leaveTypeId: params.leaveTypeId,
    startDate: params.startDate,
    endDate: params.endDate,
    daysRequested,
    halfAllocation: params.half,
    reason: params.reason ?? null,
    actorUserId: params.actorUserId,
  });
  if (!result.ok) return result;

  try {
    await notifyLeaveBidSubmitted({ requestId: result.requestId, profileId: params.profileId, half: params.half, daysRequested, drawForwardRequired });
  } catch (err) {
    console.error("[organization] failed to send leave bid submitted notification", err);
  }

  return { ok: true, requestId: result.requestId, drawForwardRequired };
}

export type DecideLeaveBidResult = { ok: true } | { ok: false; error: string };

// Decision wrapper around decideLeaveRequest() specifically for a
// half_allocation-tagged request — adds the one rule that's genuinely
// different for a bid: approving a request that exceeds the
// requester's remaining planning allocation for that half REQUIRES the
// reviewer to pass drawForwardApproved: true, AND the governing
// window's own draw_forward_allowed configuration must permit it —
// both, never either alone. Never automatic; never inferred from an
// algorithmic score.
export async function decideLeaveBid(params: {
  requestId: string;
  decision: "approved" | "declined" | "alternative_proposed";
  drawForwardApproved?: boolean;
  alternativeStartDate?: string | null;
  alternativeEndDate?: string | null;
  decisionNotes?: string | null;
  actorUserId: string;
}): Promise<DecideLeaveBidResult> {
  const admin = createAdminClient();
  const { data: existing } = await admin
    .from("leave_requests")
    .select("id, profile_id, start_date, days_requested, half_allocation")
    .eq("id", params.requestId)
    .maybeSingle();
  if (!existing) return { ok: false, error: "Leave request not found." };
  if (!existing.half_allocation) return { ok: false, error: "This request is not a Leave Bidding request." };

  if (!(await canReviewLeaveRequestFor(params.actorUserId, existing.profile_id))) {
    return { ok: false, error: "Not authorized to decide this leave request." };
  }

  let requiresDrawForward = false;
  if (params.decision === "approved") {
    const jurisdiction = await resolveEmployeeLeaveJurisdiction(existing.profile_id);
    const leaveYear = new Date(existing.start_date).getFullYear();
    const half = existing.half_allocation as LeaveBiddingHalf;
    if (jurisdiction) {
      const summary = await getPlanningAllocationSummary({ profileId: existing.profile_id, jurisdiction, leaveYear, half });
      // The pending request's own days are already included in
      // summary.committedDays (it is itself submitted/under_review) —
      // so "exceeds allocation" is simply a negative remainder.
      requiresDrawForward = summary.remainingDays < 0;
      if (requiresDrawForward) {
        if (!summary.window?.drawForwardAllowed) {
          return { ok: false, error: `This ${half} bid exceeds the remaining planning allocation, and draw-forward is not configured as permitted for this window.` };
        }
        if (!params.drawForwardApproved) {
          return { ok: false, error: `This ${half} bid exceeds the remaining planning allocation — approving it requires explicit draw-forward approval.` };
        }
      }
    }
  }

  const decision = await decideLeaveRequest({
    requestId: params.requestId,
    decision: params.decision,
    alternativeStartDate: params.alternativeStartDate,
    alternativeEndDate: params.alternativeEndDate,
    decisionNotes: params.decisionNotes,
    actorUserId: params.actorUserId,
  });
  if (!decision.ok) return decision;

  if (params.decision === "approved" && requiresDrawForward) {
    const { error } = await admin.from("leave_requests").update({ draw_forward_approved: true }).eq("id", params.requestId);
    if (error) console.error("[organization] failed to record draw_forward_approved", error.message);
  }

  try {
    await notifyLeaveBidDecided({ requestId: params.requestId, profileId: existing.profile_id, decision: params.decision });
  } catch (err) {
    console.error("[organization] failed to send leave bid decided notification", err);
  }

  return { ok: true };
}

// ============================================================
// Notifications — best-effort, never block the underlying decision.
// ============================================================

async function resolveRecipientEmail(profileId: string): Promise<string | null> {
  const admin = createAdminClient();
  const { data } = await admin.auth.admin.getUserById(profileId);
  return data.user?.email ?? null;
}

async function notifyLeaveBidSubmitted(params: { requestId: string; profileId: string; half: LeaveBiddingHalf; daysRequested: number; drawForwardRequired: boolean }): Promise<void> {
  const email = await resolveRecipientEmail(params.profileId);
  if (!email) return;
  await sendEmail({
    to: email,
    subject: `Leave bid submitted (${params.half})`,
    html: `<p>Your ${params.half} leave bid for ${params.daysRequested} working day(s) has been submitted and is awaiting review.${params.drawForwardRequired ? " This bid exceeds your remaining planning allocation and requires draw-forward approval." : ""}</p>`,
    text: `Your ${params.half} leave bid for ${params.daysRequested} working day(s) has been submitted and is awaiting review.${params.drawForwardRequired ? " This bid exceeds your remaining planning allocation and requires draw-forward approval." : ""}`,
    logPrefix: "[leave bidding]",
    emailType: "leave_bid_submitted",
    referenceNumber: params.requestId,
  });
}

async function notifyLeaveBidDecided(params: { requestId: string; profileId: string; decision: "approved" | "declined" | "alternative_proposed" }): Promise<void> {
  const email = await resolveRecipientEmail(params.profileId);
  if (!email) return;
  const label = params.decision === "approved" ? "approved" : params.decision === "declined" ? "declined" : "returned with alternative dates proposed";
  await sendEmail({
    to: email,
    subject: `Leave bid ${label}`,
    html: `<p>Your leave bid has been ${label}. Sign in to Ordift Studios to view the details.</p>`,
    text: `Your leave bid has been ${label}. Sign in to Ordift Studios to view the details.`,
    logPrefix: "[leave bidding]",
    emailType: "leave_bid_decided",
    referenceNumber: params.requestId,
  });
}
