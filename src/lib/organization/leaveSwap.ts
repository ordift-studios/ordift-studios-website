import { createAdminClient } from "@/lib/supabase/admin";
import { logActivity } from "@/lib/admin/activityLog";
import { canReviewLeaveRequestFor } from "@/lib/organization/leaveRequests";
import { sendEmail } from "@/lib/shared/email/dispatch";

// Ordift Studios Workforce/Schedule & Leave Phase, Part 1 (2026-09-15)
// — Leave Swap. A genuine two-party workflow (leave_swap_requests,
// migration 0119) — deliberately NOT forced into leave_requests' own
// single-requester/single-decider shape, since a swap has a real
// second human decision (the counterpart) before any reviewer ever
// sees it.
//
// SCOPE DECISION, stated explicitly rather than left implicit: this
// phase requires the two original approved leave_requests to have
// EQUAL days_requested. A swap of unequal-length windows would raise a
// genuine, unresolved policy question — what happens to the
// difference? partial balance refund? forfeiture? — that was not
// specified and this module does not invent an answer for. Enforcing
// equal length is what lets the entitlement math stay trivially
// correct with zero new balance logic: each person's leave_balances
// was already correctly decremented by N days at their ORIGINAL
// approval, and a swap only changes WHICH calendar dates those already-
// consumed N days apply to — never the entitlement itself, never a
// transfer between people.
//
// On final approval, the two ORIGINAL leave_requests rows are never
// mutated — two NEW rows are created with the swapped dates
// (status: "approved" directly, since they are the direct, already-
// reviewed consequence of the swap decision) and the originals are
// pointed at their replacement via supersedes_leave_request_id /
// superseded_by_leave_request_id. Every reader of "what is this
// person's current effective approved leave" (attendance.ts's
// findApprovedLeaveForDate, and any future consumer) must exclude a
// superseded row — see attendance.ts's 2026-09-15 update.

export type LeaveSwapStatus = "proposed" | "accepted" | "declined" | "approved" | "rejected" | "cancelled";

export type LeaveSwapRequest = {
  id: string;
  initiatorProfileId: string;
  initiatorLeaveRequestId: string;
  counterpartProfileId: string;
  counterpartLeaveRequestId: string;
  status: LeaveSwapStatus;
  reason: string | null;
  counterpartDecidedAt: string | null;
  counterpartDecisionNotes: string | null;
  reviewerDecidedBy: string | null;
  reviewerDecidedAt: string | null;
  reviewerDecisionNotes: string | null;
  resultingInitiatorLeaveRequestId: string | null;
  resultingCounterpartLeaveRequestId: string | null;
  createdAt: string;
};

function mapSwapRow(r: {
  id: string;
  initiator_profile_id: string;
  initiator_leave_request_id: string;
  counterpart_profile_id: string;
  counterpart_leave_request_id: string;
  status: string;
  reason: string | null;
  counterpart_decided_at: string | null;
  counterpart_decision_notes: string | null;
  reviewer_decided_by: string | null;
  reviewer_decided_at: string | null;
  reviewer_decision_notes: string | null;
  resulting_initiator_leave_request_id: string | null;
  resulting_counterpart_leave_request_id: string | null;
  created_at: string;
}): LeaveSwapRequest {
  return {
    id: r.id,
    initiatorProfileId: r.initiator_profile_id,
    initiatorLeaveRequestId: r.initiator_leave_request_id,
    counterpartProfileId: r.counterpart_profile_id,
    counterpartLeaveRequestId: r.counterpart_leave_request_id,
    status: r.status as LeaveSwapStatus,
    reason: r.reason,
    counterpartDecidedAt: r.counterpart_decided_at,
    counterpartDecisionNotes: r.counterpart_decision_notes,
    reviewerDecidedBy: r.reviewer_decided_by,
    reviewerDecidedAt: r.reviewer_decided_at,
    reviewerDecisionNotes: r.reviewer_decision_notes,
    resultingInitiatorLeaveRequestId: r.resulting_initiator_leave_request_id,
    resultingCounterpartLeaveRequestId: r.resulting_counterpart_leave_request_id,
    createdAt: r.created_at,
  };
}

const SWAP_SELECT =
  "id, initiator_profile_id, initiator_leave_request_id, counterpart_profile_id, counterpart_leave_request_id, status, reason, counterpart_decided_at, counterpart_decision_notes, reviewer_decided_by, reviewer_decided_at, reviewer_decision_notes, resulting_initiator_leave_request_id, resulting_counterpart_leave_request_id, created_at";

type EligibleLeaveRow = { id: string; profile_id: string; leave_type_id: string; start_date: string; end_date: string; days_requested: number; status: string; superseded_by_leave_request_id: string | null };

async function loadEligibleApprovedLeave(admin: ReturnType<typeof createAdminClient>, leaveRequestId: string, expectedProfileId: string): Promise<EligibleLeaveRow | { error: string }> {
  const { data } = await admin
    .from("leave_requests")
    .select("id, profile_id, leave_type_id, start_date, end_date, days_requested, status, superseded_by_leave_request_id")
    .eq("id", leaveRequestId)
    .maybeSingle();
  if (!data) return { error: "Leave request not found." };
  if (data.profile_id !== expectedProfileId) return { error: "This leave request does not belong to the stated person." };
  if (data.status !== "approved") return { error: "Only genuinely approved leave can be proposed for a swap." };
  if (data.superseded_by_leave_request_id) return { error: "This leave has already been superseded by an earlier swap." };
  return data;
}

export type ProposeLeaveSwapResult = { ok: true; swapId: string } | { ok: false; error: string };

export async function proposeLeaveSwap(params: {
  initiatorProfileId: string;
  initiatorLeaveRequestId: string;
  counterpartProfileId: string;
  counterpartLeaveRequestId: string;
  reason?: string | null;
  actorUserId: string;
}): Promise<ProposeLeaveSwapResult> {
  if (params.initiatorProfileId === params.counterpartProfileId) {
    return { ok: false, error: "A swap requires two different people." };
  }
  if (params.actorUserId !== params.initiatorProfileId && !(await canReviewLeaveRequestFor(params.actorUserId, params.initiatorProfileId))) {
    return { ok: false, error: "Not authorized to propose a swap on behalf of another person." };
  }

  const admin = createAdminClient();
  const [initiatorLeave, counterpartLeave] = await Promise.all([
    loadEligibleApprovedLeave(admin, params.initiatorLeaveRequestId, params.initiatorProfileId),
    loadEligibleApprovedLeave(admin, params.counterpartLeaveRequestId, params.counterpartProfileId),
  ]);
  if ("error" in initiatorLeave) return { ok: false, error: initiatorLeave.error };
  if ("error" in counterpartLeave) return { ok: false, error: counterpartLeave.error };

  // Equal working-day count only — see module header for why this is a
  // deliberate, explicit V1 scope decision, not an oversight.
  if (Number(initiatorLeave.days_requested) !== Number(counterpartLeave.days_requested)) {
    return { ok: false, error: "Both approved leave periods must cover the same number of working days to be eligible for a swap." };
  }

  // Neither leave may already be tied up in another still-live swap
  // (proposed/accepted/approved) — prevents the same approved leave
  // being promised to two different swaps at once.
  const { data: conflicting } = await admin
    .from("leave_swap_requests")
    .select("id")
    .in("status", ["proposed", "accepted"] satisfies LeaveSwapStatus[])
    .or(
      `initiator_leave_request_id.eq.${params.initiatorLeaveRequestId},counterpart_leave_request_id.eq.${params.initiatorLeaveRequestId},initiator_leave_request_id.eq.${params.counterpartLeaveRequestId},counterpart_leave_request_id.eq.${params.counterpartLeaveRequestId}`
    )
    .limit(1);
  if (conflicting && conflicting.length > 0) {
    return { ok: false, error: "One of these leave periods is already part of another pending swap proposal." };
  }

  const { data, error } = await admin
    .from("leave_swap_requests")
    .insert({
      initiator_profile_id: params.initiatorProfileId,
      initiator_leave_request_id: params.initiatorLeaveRequestId,
      counterpart_profile_id: params.counterpartProfileId,
      counterpart_leave_request_id: params.counterpartLeaveRequestId,
      reason: params.reason ?? null,
      status: "proposed",
      created_by: params.actorUserId,
    })
    .select("id")
    .single();
  if (error || !data) {
    console.error("[organization] failed to create leave_swap_requests row", error?.message);
    return { ok: false, error: "Failed to propose the swap." };
  }

  await logActivity({
    actorUserId: params.actorUserId,
    action: "leave_swap.proposed",
    entityType: "user",
    entityId: params.initiatorProfileId,
    metadata: { swapId: data.id, counterpartProfileId: params.counterpartProfileId },
  });

  try {
    await notifySwapProposed({ swapId: data.id, counterpartProfileId: params.counterpartProfileId });
  } catch (err) {
    console.error("[organization] failed to send leave swap proposed notification", err);
  }

  return { ok: true, swapId: data.id };
}

export type RespondToLeaveSwapResult = { ok: true } | { ok: false; error: string };

// Counterpart-only (or admin acting on their behalf) — self-service
// acceptance/decline. Explicitly does NOT itself alter either leave
// record; it only moves the swap to "accepted" (awaiting reviewer) or
// terminally "declined".
export async function respondToLeaveSwap(params: {
  swapId: string;
  response: "accepted" | "declined";
  decisionNotes?: string | null;
  actorUserId: string;
}): Promise<RespondToLeaveSwapResult> {
  const admin = createAdminClient();
  const { data: existing } = await admin.from("leave_swap_requests").select("id, counterpart_profile_id, status").eq("id", params.swapId).maybeSingle();
  if (!existing) return { ok: false, error: "Swap request not found." };
  if (existing.counterpart_profile_id !== params.actorUserId && !(await canReviewLeaveRequestFor(params.actorUserId, existing.counterpart_profile_id))) {
    return { ok: false, error: "Not authorized to respond to this swap on behalf of the counterpart." };
  }
  if (existing.status !== "proposed") return { ok: false, error: `Cannot respond to a swap already in status "${existing.status}".` };

  const { error } = await admin
    .from("leave_swap_requests")
    .update({ status: params.response, counterpart_decided_at: new Date().toISOString(), counterpart_decision_notes: params.decisionNotes ?? null })
    .eq("id", params.swapId)
    .eq("status", "proposed");
  if (error) {
    console.error("[organization] failed to record swap counterpart decision", error.message);
    return { ok: false, error: "Failed to record your decision." };
  }

  await logActivity({
    actorUserId: params.actorUserId,
    action: "leave_swap.counterpart_responded",
    entityType: "user",
    entityId: existing.counterpart_profile_id,
    metadata: { swapId: params.swapId, response: params.response },
  });

  try {
    await notifySwapCounterpartResponded(params.swapId, params.response);
  } catch (err) {
    console.error("[organization] failed to send leave swap response notification", err);
  }

  return { ok: true };
}

export type CancelLeaveSwapResult = { ok: true } | { ok: false; error: string };

export async function cancelLeaveSwap(params: { swapId: string; actorUserId: string }): Promise<CancelLeaveSwapResult> {
  const admin = createAdminClient();
  const { data: existing } = await admin.from("leave_swap_requests").select("id, initiator_profile_id, status").eq("id", params.swapId).maybeSingle();
  if (!existing) return { ok: false, error: "Swap request not found." };
  if (existing.initiator_profile_id !== params.actorUserId && !(await canReviewLeaveRequestFor(params.actorUserId, existing.initiator_profile_id))) {
    return { ok: false, error: "Not authorized to cancel this swap." };
  }
  if (existing.status !== "proposed" && existing.status !== "accepted") {
    return { ok: false, error: `Cannot cancel a swap already in status "${existing.status}".` };
  }

  const { error } = await admin
    .from("leave_swap_requests")
    .update({ status: "cancelled" })
    .eq("id", params.swapId)
    .in("status", ["proposed", "accepted"] satisfies LeaveSwapStatus[]);
  if (error) return { ok: false, error: "Failed to cancel the swap." };

  await logActivity({ actorUserId: params.actorUserId, action: "leave_swap.cancelled", entityType: "user", entityId: existing.initiator_profile_id, metadata: { swapId: params.swapId } });
  return { ok: true };
}

export type DecideLeaveSwapResult = { ok: true } | { ok: false; error: string };

// Final reviewer decision — requires genuine review authority over
// BOTH the initiator AND the counterpart (canReviewLeaveRequestFor for
// each), never just one: a manager who only manages one of the two
// people cannot approve a cross-team swap alone — it falls through to
// requiring the existing global HR tier, which always passes both
// checks. Only on "approved" are the two new, swapped-date
// leave_requests rows created; "rejected" changes nothing about either
// original leave record.
export async function decideLeaveSwap(params: {
  swapId: string;
  decision: "approved" | "rejected";
  decisionNotes?: string | null;
  actorUserId: string;
}): Promise<DecideLeaveSwapResult> {
  const admin = createAdminClient();
  const { data: existing } = await admin.from("leave_swap_requests").select(SWAP_SELECT).eq("id", params.swapId).maybeSingle();
  if (!existing) return { ok: false, error: "Swap request not found." };
  const swap = mapSwapRow(existing);
  if (swap.status !== "accepted") return { ok: false, error: `Cannot decide a swap in status "${swap.status}" — the counterpart must accept it first.` };

  const [canReviewInitiator, canReviewCounterpart] = await Promise.all([
    canReviewLeaveRequestFor(params.actorUserId, swap.initiatorProfileId),
    canReviewLeaveRequestFor(params.actorUserId, swap.counterpartProfileId),
  ]);
  if (!canReviewInitiator || !canReviewCounterpart) {
    return { ok: false, error: "Not authorized to decide this swap — review authority over both people is required." };
  }

  if (params.decision === "rejected") {
    const { error } = await admin
      .from("leave_swap_requests")
      .update({ status: "rejected", reviewer_decided_by: params.actorUserId, reviewer_decided_at: new Date().toISOString(), reviewer_decision_notes: params.decisionNotes ?? null })
      .eq("id", params.swapId)
      .eq("status", "accepted");
    if (error) return { ok: false, error: "Failed to record the decision." };
    await logActivity({ actorUserId: params.actorUserId, action: "leave_swap.rejected", entityType: "user", entityId: swap.initiatorProfileId, metadata: { swapId: params.swapId } });
    try {
      await notifySwapDecided(swap, "rejected");
    } catch (err) {
      console.error("[organization] failed to send leave swap rejected notification", err);
    }
    return { ok: true };
  }

  const [initiatorLeave, counterpartLeave] = await Promise.all([
    loadEligibleApprovedLeave(admin, swap.initiatorLeaveRequestId, swap.initiatorProfileId),
    loadEligibleApprovedLeave(admin, swap.counterpartLeaveRequestId, swap.counterpartProfileId),
  ]);
  if ("error" in initiatorLeave) return { ok: false, error: `Initiator's leave is no longer eligible: ${initiatorLeave.error}` };
  if ("error" in counterpartLeave) return { ok: false, error: `Counterpart's leave is no longer eligible: ${counterpartLeave.error}` };

  // Create the two resulting rows FIRST (never mutate an original until
  // its replacement genuinely exists), then point the originals at
  // them, then close out the swap row — if any step fails partway, the
  // originals remain the effective record (fail closed, never half-swapped).
  const { data: newForInitiator, error: initiatorInsertError } = await admin
    .from("leave_requests")
    .insert({
      profile_id: swap.initiatorProfileId,
      leave_type_id: initiatorLeave.leave_type_id,
      start_date: counterpartLeave.start_date,
      end_date: counterpartLeave.end_date,
      days_requested: initiatorLeave.days_requested,
      status: "approved",
      decided_by: params.actorUserId,
      decided_at: new Date().toISOString(),
      decision_notes: `Resulting leave from approved Leave Swap ${params.swapId}.`,
      supersedes_leave_request_id: swap.initiatorLeaveRequestId,
      created_by: params.actorUserId,
    })
    .select("id")
    .single();
  if (initiatorInsertError || !newForInitiator) {
    console.error("[organization] failed to create resulting leave for swap initiator", initiatorInsertError?.message);
    return { ok: false, error: "Failed to apply the swap." };
  }

  const { data: newForCounterpart, error: counterpartInsertError } = await admin
    .from("leave_requests")
    .insert({
      profile_id: swap.counterpartProfileId,
      leave_type_id: counterpartLeave.leave_type_id,
      start_date: initiatorLeave.start_date,
      end_date: initiatorLeave.end_date,
      days_requested: counterpartLeave.days_requested,
      status: "approved",
      decided_by: params.actorUserId,
      decided_at: new Date().toISOString(),
      decision_notes: `Resulting leave from approved Leave Swap ${params.swapId}.`,
      supersedes_leave_request_id: swap.counterpartLeaveRequestId,
      created_by: params.actorUserId,
    })
    .select("id")
    .single();
  if (counterpartInsertError || !newForCounterpart) {
    console.error("[organization] failed to create resulting leave for swap counterpart", counterpartInsertError?.message);
    return { ok: false, error: "Failed to apply the swap — the initiator's resulting leave was created; manual reconciliation is required." };
  }

  await Promise.all([
    admin.from("leave_requests").update({ superseded_by_leave_request_id: newForInitiator.id }).eq("id", swap.initiatorLeaveRequestId),
    admin.from("leave_requests").update({ superseded_by_leave_request_id: newForCounterpart.id }).eq("id", swap.counterpartLeaveRequestId),
  ]);

  const { error: swapUpdateError } = await admin
    .from("leave_swap_requests")
    .update({
      status: "approved",
      reviewer_decided_by: params.actorUserId,
      reviewer_decided_at: new Date().toISOString(),
      reviewer_decision_notes: params.decisionNotes ?? null,
      resulting_initiator_leave_request_id: newForInitiator.id,
      resulting_counterpart_leave_request_id: newForCounterpart.id,
    })
    .eq("id", params.swapId)
    .eq("status", "accepted");
  if (swapUpdateError) {
    console.error("[organization] failed to finalize leave_swap_requests row", swapUpdateError.message);
    return { ok: false, error: "The swap was applied to both leave records, but finalizing the swap request itself failed — manual reconciliation is required." };
  }

  await logActivity({
    actorUserId: params.actorUserId,
    action: "leave_swap.approved",
    entityType: "user",
    entityId: swap.initiatorProfileId,
    metadata: { swapId: params.swapId, counterpartProfileId: swap.counterpartProfileId, resultingInitiatorLeaveRequestId: newForInitiator.id, resultingCounterpartLeaveRequestId: newForCounterpart.id },
  });

  try {
    await notifySwapDecided(swap, "approved");
  } catch (err) {
    console.error("[organization] failed to send leave swap approved notification", err);
  }

  return { ok: true };
}

export type SwapEligibleLeave = { leaveRequestId: string; profileId: string; fullName: string | null; startDate: string; endDate: string; daysRequested: number };

// Privacy-safe colleague listing for proposing a swap (2026-09-15) —
// deliberately returns ONLY name + date range + day count, never leave
// type, reason, or any other HR detail, matching the explicit "only
// expose the minimum information required to facilitate a legitimate
// swap" instruction. Excludes the caller's own leave, anything already
// superseded, and anything already tied up in a live (proposed/
// accepted) swap.
export async function listSwapEligibleApprovedLeave(excludingProfileId: string): Promise<SwapEligibleLeave[]> {
  const admin = createAdminClient();
  const { data: liveSwapLeaveIds } = await admin
    .from("leave_swap_requests")
    .select("initiator_leave_request_id, counterpart_leave_request_id")
    .in("status", ["proposed", "accepted"] satisfies LeaveSwapStatus[]);
  const excludedLeaveIds = new Set((liveSwapLeaveIds ?? []).flatMap((r) => [r.initiator_leave_request_id, r.counterpart_leave_request_id]));

  const { data, error } = await admin
    .from("leave_requests")
    .select("id, profile_id, start_date, end_date, days_requested, profiles!leave_requests_profile_id_fkey(full_name)")
    .eq("status", "approved")
    .is("superseded_by_leave_request_id", null)
    .neq("profile_id", excludingProfileId)
    .gte("end_date", new Date().toISOString().slice(0, 10)) // only still-upcoming/ongoing leave is realistically swappable
    .order("start_date");
  if (error) {
    console.error("[organization] failed to load swap-eligible leave", error.message);
    return [];
  }
  return (data ?? [])
    .filter((r) => !excludedLeaveIds.has(r.id))
    .map((r) => {
      const profile = r.profiles as unknown as { full_name: string | null } | null;
      return { leaveRequestId: r.id, profileId: r.profile_id, fullName: profile?.full_name ?? null, startDate: r.start_date, endDate: r.end_date, daysRequested: Number(r.days_requested) };
    });
}

export async function listLeaveSwapsForProfile(profileId: string): Promise<LeaveSwapRequest[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("leave_swap_requests")
    .select(SWAP_SELECT)
    .or(`initiator_profile_id.eq.${profileId},counterpart_profile_id.eq.${profileId}`)
    .order("created_at", { ascending: false });
  if (error) {
    console.error("[organization] failed to load leave_swap_requests", error.message);
    return [];
  }
  return (data ?? []).map(mapSwapRow);
}

export type PendingLeaveSwap = LeaveSwapRequest & { initiatorFullName: string | null; counterpartFullName: string | null };

// The reviewer queue equivalent of listPendingLeaveRequestsAcrossStaff()
// — every swap awaiting a reviewer decision ("accepted", i.e. the
// counterpart has already said yes), across every person. A caller
// combines this with its own canReviewLeaveRequestFor() check per row
// to narrow it to a manager's own scope (see the manager review UI) —
// this function itself does not filter by reviewer, matching
// listPendingLeaveRequestsAcrossStaff()'s own precedent.
export async function listSwapsAwaitingReviewerDecision(): Promise<PendingLeaveSwap[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("leave_swap_requests")
    .select(`${SWAP_SELECT}, initiator:profiles!leave_swap_requests_initiator_profile_id_fkey(full_name), counterpart:profiles!leave_swap_requests_counterpart_profile_id_fkey(full_name)`)
    .eq("status", "accepted")
    .order("counterpart_decided_at", { ascending: true });
  if (error) {
    console.error("[organization] failed to load pending leave_swap_requests", error.message);
    return [];
  }
  return (data ?? []).map((r) => {
    const row = r as unknown as Parameters<typeof mapSwapRow>[0] & { initiator: { full_name: string | null } | null; counterpart: { full_name: string | null } | null };
    return { ...mapSwapRow(row), initiatorFullName: row.initiator?.full_name ?? null, counterpartFullName: row.counterpart?.full_name ?? null };
  });
}

// Manager-scoped equivalent (2026-09-15) — decideLeaveSwap() itself
// already requires review authority over BOTH parties; this listing
// mirrors that exact rule so a manager's queue never shows a swap they
// could not actually decide.
export async function listSwapsAwaitingReviewerDecisionFor(actorUserId: string): Promise<PendingLeaveSwap[]> {
  const all = await listSwapsAwaitingReviewerDecision();
  const scoped = await Promise.all(
    all.map(async (s) => {
      const [canInitiator, canCounterpart] = await Promise.all([canReviewLeaveRequestFor(actorUserId, s.initiatorProfileId), canReviewLeaveRequestFor(actorUserId, s.counterpartProfileId)]);
      return canInitiator && canCounterpart ? s : null;
    })
  );
  return scoped.filter((s): s is PendingLeaveSwap => s !== null);
}

// ============================================================
// Notifications — best-effort, never block the underlying decision.
// ============================================================

async function resolveRecipientEmail(profileId: string): Promise<string | null> {
  const admin = createAdminClient();
  const { data } = await admin.auth.admin.getUserById(profileId);
  return data.user?.email ?? null;
}

async function notifySwapProposed(params: { swapId: string; counterpartProfileId: string }): Promise<void> {
  const email = await resolveRecipientEmail(params.counterpartProfileId);
  if (!email) return;
  await sendEmail({
    to: email,
    subject: "A colleague has proposed a leave swap",
    html: "<p>A colleague has proposed swapping approved leave dates with you. Sign in to Ordift Studios to review and respond.</p>",
    text: "A colleague has proposed swapping approved leave dates with you. Sign in to Ordift Studios to review and respond.",
    logPrefix: "[leave swap]",
    emailType: "leave_swap_proposed",
    referenceNumber: params.swapId,
  });
}

async function notifySwapCounterpartResponded(swapId: string, response: "accepted" | "declined"): Promise<void> {
  const admin = createAdminClient();
  const { data } = await admin.from("leave_swap_requests").select("initiator_profile_id").eq("id", swapId).maybeSingle();
  if (!data) return;
  const email = await resolveRecipientEmail(data.initiator_profile_id);
  if (!email) return;
  await sendEmail({
    to: email,
    subject: `Your leave swap proposal was ${response}`,
    html: `<p>Your leave swap proposal was ${response} by your colleague.${response === "accepted" ? " It now awaits manager/HR approval." : ""}</p>`,
    text: `Your leave swap proposal was ${response} by your colleague.${response === "accepted" ? " It now awaits manager/HR approval." : ""}`,
    logPrefix: "[leave swap]",
    emailType: "leave_swap_counterpart_responded",
    referenceNumber: swapId,
  });
}

async function notifySwapDecided(swap: LeaveSwapRequest, decision: "approved" | "rejected"): Promise<void> {
  const [initiatorEmail, counterpartEmail] = await Promise.all([resolveRecipientEmail(swap.initiatorProfileId), resolveRecipientEmail(swap.counterpartProfileId)]);
  const subject = `Leave swap ${decision}`;
  const body = `Your leave swap has been ${decision}.${decision === "approved" ? " Your approved leave dates have been updated." : ""}`;
  for (const email of [initiatorEmail, counterpartEmail]) {
    if (!email) continue;
    await sendEmail({ to: email, subject, html: `<p>${body}</p>`, text: body, logPrefix: "[leave swap]", emailType: "leave_swap_decided", referenceNumber: swap.id });
  }
}
