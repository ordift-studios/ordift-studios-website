import { createAdminClient } from "@/lib/supabase/admin";
import { logActivity } from "@/lib/admin/activityLog";
import { isSuperAdminId, hasJurisdictionAuthority } from "@/lib/organization/authority";

// Ordift Studios Compliance/COMP-SYS-1, Phase B4 Step 5 (2026-09-14) —
// performance review / Performance Improvement Plan (PIP), OS-HR-GH-003
// section 6. Deliberately separate from discipline (discipline.ts) —
// nothing here writes to disciplinary_actions or investigations, and a
// failed PIP never automatically terminates employment (6.3).

export const PIP_ALLOWED_DURATIONS_DAYS = [30, 60, 90] as const;
export type PipDurationDays = (typeof PIP_ALLOWED_DURATIONS_DAYS)[number];

// Pure — OS-HR-GH-003 6.1's real approved review cadence ("ordinarily
// every six months"), never invented. Returns a date-only string.
export function computeNextReviewDueDate(conductedAtIso: string): string {
  const conducted = new Date(conductedAtIso);
  const dueDate = new Date(conducted);
  dueDate.setUTCMonth(dueDate.getUTCMonth() + 6);
  return dueDate.toISOString().slice(0, 10);
}

// Pure — startDate is a "YYYY-MM-DD" date-only string. durationDays must
// be one of the real approved values (30/60/90, OS-HR-GH-003 6.3);
// the caller (initiatePip) is responsible for that choice, never
// defaulted silently past the standard 30.
export function computePipPlannedEndDate(startDate: string, durationDays: PipDurationDays): string {
  const start = new Date(`${startDate}T00:00:00.000Z`);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + durationDays);
  return end.toISOString().slice(0, 10);
}

async function canManagePerformance(actorUserId: string): Promise<boolean> {
  if (await isSuperAdminId(actorUserId)) return true;
  return hasJurisdictionAuthority(actorUserId, "operations", "administer");
}

// Append-only — mirrors issueDisciplinaryAction()'s shape. reviewerId
// need not equal actorUserId (an admin may record a review conducted by
// someone else), but the actor performing the write is still checked.
export async function recordPerformanceReview(params: {
  profileId: string;
  reviewerId: string;
  reviewPeriodStart?: string | null;
  reviewPeriodEnd?: string | null;
  competencyNotes?: string | null;
  kpiNotes?: string | null;
  outcomeSummary: string;
  actorUserId: string;
}): Promise<{ ok: true; reviewId: string } | { ok: false; error: string }> {
  if (!(await canManagePerformance(params.actorUserId))) {
    return { ok: false, error: "Not authorized to record a performance review." };
  }
  if (!params.outcomeSummary.trim()) return { ok: false, error: "An outcome summary is required." };

  const conductedAt = new Date().toISOString();
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("performance_reviews")
    .insert({
      profile_id: params.profileId,
      reviewer_id: params.reviewerId,
      review_period_start: params.reviewPeriodStart ?? null,
      review_period_end: params.reviewPeriodEnd ?? null,
      conducted_at: conductedAt,
      competency_notes: params.competencyNotes ?? null,
      kpi_notes: params.kpiNotes ?? null,
      outcome_summary: params.outcomeSummary,
      next_review_due_at: computeNextReviewDueDate(conductedAt),
    })
    .select("id")
    .single();
  if (error || !data) return { ok: false, error: error?.message ?? "Failed to record the performance review." };

  await logActivity({ actorUserId: params.actorUserId, action: "performance_review.recorded", entityType: "user", entityId: params.profileId, metadata: { reviewId: data.id } });
  return { ok: true, reviewId: data.id };
}

export async function listPerformanceReviewsForProfile(profileId: string): Promise<
  { id: string; reviewerId: string; conductedAt: string; outcomeSummary: string; nextReviewDueAt: string | null }[]
> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("performance_reviews")
    .select("id, reviewer_id, conducted_at, outcome_summary, next_review_due_at")
    .eq("profile_id", profileId)
    .order("conducted_at", { ascending: false });
  if (error) {
    console.error("[organization] failed to load performance_reviews", error.message);
    return [];
  }
  return (data ?? []).map((r) => ({
    id: r.id,
    reviewerId: r.reviewer_id,
    conductedAt: r.conducted_at,
    outcomeSummary: r.outcome_summary,
    nextReviewDueAt: r.next_review_due_at,
  }));
}

// planned_end_date is always computed here (never accepted as a
// caller-supplied field), and plannedDurationDays defaults to the
// standard 30 (OS-HR-GH-003 6.3) — a caller must explicitly choose 60
// or 90, never a silent default past the standard.
export async function initiatePip(params: {
  profileId: string;
  performanceReviewId?: string | null;
  deficientStandard: string;
  requiredImprovement: string;
  measurableObjectives: string[];
  supportResources?: string | null;
  plannedDurationDays?: PipDurationDays;
  actorUserId: string;
}): Promise<{ ok: true; pipId: string } | { ok: false; error: string }> {
  if (!(await canManagePerformance(params.actorUserId))) {
    return { ok: false, error: "Not authorized to initiate a Performance Improvement Plan." };
  }
  if (!params.deficientStandard.trim()) return { ok: false, error: "The deficient standard must be documented." };
  if (!params.requiredImprovement.trim()) return { ok: false, error: "The required improvement must be documented." };
  if (params.measurableObjectives.length === 0) return { ok: false, error: "At least one measurable objective is required." };

  const durationDays = params.plannedDurationDays ?? 30;
  const startDate = new Date().toISOString().slice(0, 10);

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("performance_improvement_plans")
    .insert({
      profile_id: params.profileId,
      performance_review_id: params.performanceReviewId ?? null,
      initiated_by: params.actorUserId,
      deficient_standard: params.deficientStandard,
      required_improvement: params.requiredImprovement,
      measurable_objectives: params.measurableObjectives,
      support_resources: params.supportResources ?? null,
      planned_duration_days: durationDays,
      start_date: startDate,
      planned_end_date: computePipPlannedEndDate(startDate, durationDays),
    })
    .select("id")
    .single();
  if (error || !data) return { ok: false, error: error?.message ?? "Failed to initiate the Performance Improvement Plan." };

  await logActivity({ actorUserId: params.actorUserId, action: "performance_improvement_plan.initiated", entityType: "user", entityId: params.profileId, metadata: { pipId: data.id, plannedDurationDays: durationDays } });
  return { ok: true, pipId: data.id };
}

// Append-only — mirrors recordSuspensionReview()'s shape for the
// "check-ins... as necessary" requirement in OS-HR-GH-003 6.3.
export async function recordPipCheckin(params: { pipId: string; notes: string; actorUserId: string }): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!(await canManagePerformance(params.actorUserId))) {
    return { ok: false, error: "Not authorized to record a PIP check-in." };
  }
  if (!params.notes.trim()) return { ok: false, error: "Check-in notes are required." };

  const admin = createAdminClient();
  const { error } = await admin.from("performance_improvement_plan_checkins").insert({
    pip_id: params.pipId,
    reviewed_by: params.actorUserId,
    notes: params.notes,
  });
  if (error) return { ok: false, error: "Failed to record the check-in." };

  await logActivity({ actorUserId: params.actorUserId, action: "performance_improvement_plan.checkin_recorded", entityType: "performance_improvement_plan", entityId: params.pipId });
  return { ok: true };
}

// OS-HR-GH-003 6.3 permits exactly "one documented extension" — the
// new end date and its length are a human decision (the document states
// no formula for how long an extension may run), never computed or
// guessed here. The atomic .is('extended_end_date', null) guard is what
// actually enforces "at most once", not merely application convention.
export async function extendPip(params: { pipId: string; newEndDate: string; reason: string; actorUserId: string }): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!(await canManagePerformance(params.actorUserId))) {
    return { ok: false, error: "Not authorized to extend a Performance Improvement Plan." };
  }
  if (!params.reason.trim()) return { ok: false, error: "A documented reason for the extension is required." };

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("performance_improvement_plans")
    .update({
      status: "extended",
      extended_end_date: params.newEndDate,
      extension_reason: params.reason,
      extended_by: params.actorUserId,
      extended_at: new Date().toISOString(),
    })
    .eq("id", params.pipId)
    .eq("status", "active")
    .is("extended_end_date", null)
    .select("id")
    .maybeSingle();
  if (error) return { ok: false, error: "Failed to extend the plan." };
  if (!data) return { ok: false, error: "Plan not found, not active, or already extended once (only one documented extension is permitted)." };

  await logActivity({ actorUserId: params.actorUserId, action: "performance_improvement_plan.extended", entityType: "performance_improvement_plan", entityId: params.pipId });
  return { ok: true };
}

export type PipOutcome = "completed_improved" | "completed_failed_escalated";

// A failed PIP only ever records escalated status here — it never
// itself terminates employment (OS-HR-GH-003 6.3) or writes to
// disciplinary_actions/investigations (6.2: serious misconduct is
// handled separately through discipline).
export async function decidePip(params: { pipId: string; outcome: PipOutcome; outcomeNotes: string; actorUserId: string }): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!(await canManagePerformance(params.actorUserId))) {
    return { ok: false, error: "Not authorized to decide a Performance Improvement Plan outcome." };
  }
  if (!params.outcomeNotes.trim()) return { ok: false, error: "Outcome notes are required." };

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("performance_improvement_plans")
    .update({ status: params.outcome, outcome_notes: params.outcomeNotes, decided_by: params.actorUserId, decided_at: new Date().toISOString() })
    .eq("id", params.pipId)
    .in("status", ["active", "extended"])
    .select("id")
    .maybeSingle();
  if (error) return { ok: false, error: "Failed to decide the plan outcome." };
  if (!data) return { ok: false, error: "Plan not found, or already decided." };

  await logActivity({ actorUserId: params.actorUserId, action: "performance_improvement_plan.decided", entityType: "performance_improvement_plan", entityId: params.pipId, metadata: { outcome: params.outcome } });
  return { ok: true };
}

export async function listPipsForProfile(profileId: string): Promise<
  { id: string; status: string; startDate: string; plannedEndDate: string; extendedEndDate: string | null }[]
> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("performance_improvement_plans")
    .select("id, status, start_date, planned_end_date, extended_end_date")
    .eq("profile_id", profileId)
    .order("start_date", { ascending: false });
  if (error) {
    console.error("[organization] failed to load performance_improvement_plans", error.message);
    return [];
  }
  return (data ?? []).map((r) => ({
    id: r.id,
    status: r.status,
    startDate: r.start_date,
    plannedEndDate: r.planned_end_date,
    extendedEndDate: r.extended_end_date,
  }));
}
