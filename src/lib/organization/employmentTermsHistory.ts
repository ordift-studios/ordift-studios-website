import { createAdminClient } from "@/lib/supabase/admin";
import { logActivity } from "@/lib/admin/activityLog";
import { isSuperAdminId, hasJurisdictionAuthority } from "@/lib/organization/authority";

// Ordift Studios Compliance/COMP-SYS-1, Phase B4 Step 1 (2026-09-14) —
// effective-dated employment-terms history. See migration
// 0086_employment_terms_history.sql for the full design rationale.
//
// Each row is a FULL snapshot, not a sparse delta —
// recordEmploymentTermsSnapshot() merges the caller's partial `changes`
// onto the immediately-prior snapshot for this profile before
// inserting, so every row independently answers "what were this
// person's terms as of this date" without needing to join across rows.
// The very first snapshot for a profile has no prior row to merge onto
// — any field not supplied simply stays null, exactly reflecting that
// it is genuinely not yet known, never fabricated.

export interface EmploymentTermsFields {
  employingEntityId: string | null;
  employmentJurisdictionId: string | null;
  workLocation: string | null;
  positionId: string | null;
  departmentId: string | null;
  gradeId: string | null;
  managerId: string | null;
  workPattern: string | null;
  basicSalary: number | null;
  currency: string | null;
  allowances: Record<string, unknown> | null;
}

export interface EmploymentTermsRow extends EmploymentTermsFields {
  id: string;
  profileId: string;
  effectiveFrom: string;
  source: string;
  recordedAt: string;
  recordedBy: string | null;
  transitionType: EmploymentTransitionType | null;
  notes: string | null;
  enhancedReviewRequired: boolean;
}

const EMPTY_FIELDS: EmploymentTermsFields = {
  employingEntityId: null,
  employmentJurisdictionId: null,
  workLocation: null,
  positionId: null,
  departmentId: null,
  gradeId: null,
  managerId: null,
  workPattern: null,
  basicSalary: null,
  currency: null,
  allowances: null,
};

// International Employment Transitions (Phase B6 Step 2, 2026-09-15) —
// migration 0106. Deliberately excludes role/title, grade, and
// reporting-line changes: Position assignment already drives
// Department/Craft/Grade together as one governed decision
// (assignStaffPosition(), "Position drives Grade" — an existing prior
// Founder decision), and the authoritative reporting line is derived
// from Position's own reporting chain, never from this table's
// manager_id. A country transfer recorded here and a promotion
// recorded via assignStaffPosition() are therefore already two
// structurally separate, independently-audited actions.
export const EMPLOYMENT_TRANSITION_TYPES = [
  "permanent_international_transfer",
  "temporary_international_assignment",
  "secondment_inter_entity_assignment",
  "temporary_relocation",
  "repatriation",
  "employing_entity_change",
  "work_location_change",
  "jurisdiction_change",
  "payroll_currency_change",
  "immigration_work_authorization_dependency",
  "compensation_change",
] as const;
export type EmploymentTransitionType = (typeof EMPLOYMENT_TRANSITION_TYPES)[number];

const INTERNATIONAL_TRANSITION_TYPES: ReadonlySet<EmploymentTransitionType> = new Set([
  "permanent_international_transfer",
  "temporary_international_assignment",
  "secondment_inter_entity_assignment",
  "repatriation",
  "employing_entity_change",
  "jurisdiction_change",
  "immigration_work_authorization_dependency",
]);

// Pure — an international/inter-entity transition must never silently
// inherit the previous jurisdiction's legal/immigration/payroll rules;
// this is the structural gate that makes that a flagged fact rather
// than an aspiration. temporary_relocation, work_location_change,
// payroll_currency_change, and compensation_change do not by
// themselves imply a jurisdiction/entity change, so they are not
// flagged — a caller combining one of those with a genuine jurisdiction
// change records that as its OWN separate jurisdiction_change/
// employing_entity_change transition, which IS flagged.
export function doesTransitionRequireEnhancedReview(type: EmploymentTransitionType): boolean {
  return INTERNATIONAL_TRANSITION_TYPES.has(type);
}

// Pure — exported so the "full snapshot, not a sparse delta" merge
// semantics can be unit-tested without a database. `previous` is the
// prior snapshot's fields (or null for a person's first-ever snapshot,
// in which case every unsupplied field correctly stays null rather than
// being invented).
export function mergeEmploymentTermsFields(
  previous: EmploymentTermsFields | null,
  changes: Partial<EmploymentTermsFields>
): EmploymentTermsFields {
  return { ...(previous ?? EMPTY_FIELDS), ...changes };
}

function mapRow(r: {
  id: string;
  profile_id: string;
  effective_from: string;
  employing_entity_id: string | null;
  employment_jurisdiction_id: string | null;
  work_location: string | null;
  position_id: string | null;
  department_id: string | null;
  grade_id: string | null;
  manager_id: string | null;
  work_pattern: string | null;
  basic_salary: number | null;
  currency: string | null;
  allowances: Record<string, unknown> | null;
  source: string;
  recorded_at: string;
  recorded_by: string | null;
  transition_type: string | null;
  notes: string | null;
  enhanced_review_required: boolean;
}): EmploymentTermsRow {
  return {
    id: r.id,
    profileId: r.profile_id,
    effectiveFrom: r.effective_from,
    employingEntityId: r.employing_entity_id,
    employmentJurisdictionId: r.employment_jurisdiction_id,
    workLocation: r.work_location,
    positionId: r.position_id,
    departmentId: r.department_id,
    gradeId: r.grade_id,
    managerId: r.manager_id,
    workPattern: r.work_pattern,
    basicSalary: r.basic_salary,
    currency: r.currency,
    allowances: r.allowances,
    source: r.source,
    recordedAt: r.recorded_at,
    recordedBy: r.recorded_by,
    transitionType: r.transition_type as EmploymentTransitionType | null,
    notes: r.notes,
    enhancedReviewRequired: r.enhanced_review_required,
  };
}

const SELECT =
  "id, profile_id, effective_from, employing_entity_id, employment_jurisdiction_id, work_location, position_id, department_id, grade_id, manager_id, work_pattern, basic_salary, currency, allowances, source, recorded_at, recorded_by, transition_type, notes, enhanced_review_required";

export async function getCurrentEmploymentTerms(profileId: string): Promise<EmploymentTermsRow | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("employment_terms_history")
    .select(SELECT)
    .eq("profile_id", profileId)
    .order("effective_from", { ascending: false })
    .order("recorded_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data ? mapRow(data) : null;
}

export async function getEmploymentTermsAsOf(profileId: string, asOfDate: string): Promise<EmploymentTermsRow | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("employment_terms_history")
    .select(SELECT)
    .eq("profile_id", profileId)
    .lte("effective_from", asOfDate)
    .order("effective_from", { ascending: false })
    .order("recorded_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data ? mapRow(data) : null;
}

export async function listEmploymentTermsHistory(profileId: string): Promise<EmploymentTermsRow[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("employment_terms_history")
    .select(SELECT)
    .eq("profile_id", profileId)
    .order("effective_from", { ascending: false })
    .order("recorded_at", { ascending: false });
  if (error) {
    console.error("[organization] failed to load employment_terms_history", error.message);
    return [];
  }
  return (data ?? []).map(mapRow);
}

export type RecordEmploymentTermsSnapshotResult = { ok: true; id: string } | { ok: false; error: string };

// Merges `changes` onto the immediately-prior snapshot (or an all-null
// baseline, for a person's first-ever snapshot) and inserts a new row —
// never updates an existing one. `source` identifies what triggered
// this snapshot (e.g. "position_assignment") for audit purposes; it is
// free text by this codebase's own established convention for this kind
// of field (see activity_log.action).
export async function recordEmploymentTermsSnapshot(params: {
  profileId: string;
  effectiveFrom?: string;
  changes: Partial<EmploymentTermsFields>;
  source: string;
  recordedBy: string | null;
}): Promise<RecordEmploymentTermsSnapshotResult> {
  if (!params.profileId.trim()) return { ok: false, error: "profileId is required." };
  if (!params.source.trim()) return { ok: false, error: "source is required." };

  const admin = createAdminClient();
  const previous = await getCurrentEmploymentTerms(params.profileId);
  const merged = mergeEmploymentTermsFields(previous, params.changes);

  const { data, error } = await admin
    .from("employment_terms_history")
    .insert({
      profile_id: params.profileId,
      effective_from: params.effectiveFrom ?? new Date().toISOString().slice(0, 10),
      employing_entity_id: merged.employingEntityId,
      employment_jurisdiction_id: merged.employmentJurisdictionId,
      work_location: merged.workLocation,
      position_id: merged.positionId,
      department_id: merged.departmentId,
      grade_id: merged.gradeId,
      manager_id: merged.managerId,
      work_pattern: merged.workPattern,
      basic_salary: merged.basicSalary,
      currency: merged.currency,
      allowances: merged.allowances,
      source: params.source,
      recorded_by: params.recordedBy,
    })
    .select("id")
    .single();
  if (error || !data) return { ok: false, error: error?.message ?? "Failed to record the employment terms snapshot." };
  return { ok: true, id: data.id };
}

async function canManageEmploymentTransitions(actorUserId: string): Promise<boolean> {
  if (await isSuperAdminId(actorUserId)) return true;
  return hasJurisdictionAuthority(actorUserId, "operations", "administer");
}

export type RecordEmploymentTransitionResult = { ok: true; id: string; enhancedReviewRequired: boolean } | { ok: false; error: string };

// The authorized way to record an international/inter-entity/
// compensation transition. Performs its own single INSERT (rather than
// insert-then-update via recordEmploymentTermsSnapshot()) because
// employment_terms_history grants service_role INSERT only — never
// UPDATE — so transition_type/notes/enhanced_review_required must be
// set in the same statement that creates the row. Intentionally
// accepts exactly ONE transitionType per call: recording a country move
// AND a promotion "at the same time" means calling this once and
// assignStaffPosition() once — two separate, separately-audited calls,
// never one combined action.
export async function recordEmploymentTransition(params: {
  profileId: string;
  transitionType: EmploymentTransitionType;
  effectiveFrom?: string;
  changes: Partial<EmploymentTermsFields>;
  notes?: string | null;
  actorUserId: string;
}): Promise<RecordEmploymentTransitionResult> {
  if (!(await canManageEmploymentTransitions(params.actorUserId))) {
    return { ok: false, error: "Not authorized to record an employment transition." };
  }
  if (!(EMPLOYMENT_TRANSITION_TYPES as readonly string[]).includes(params.transitionType)) {
    return { ok: false, error: "Unknown transition type." };
  }

  const admin = createAdminClient();
  const previous = await getCurrentEmploymentTerms(params.profileId);
  const merged = mergeEmploymentTermsFields(previous, params.changes);
  const enhancedReviewRequired = doesTransitionRequireEnhancedReview(params.transitionType);

  const { data, error } = await admin
    .from("employment_terms_history")
    .insert({
      profile_id: params.profileId,
      effective_from: params.effectiveFrom ?? new Date().toISOString().slice(0, 10),
      employing_entity_id: merged.employingEntityId,
      employment_jurisdiction_id: merged.employmentJurisdictionId,
      work_location: merged.workLocation,
      position_id: merged.positionId,
      department_id: merged.departmentId,
      grade_id: merged.gradeId,
      manager_id: merged.managerId,
      work_pattern: merged.workPattern,
      basic_salary: merged.basicSalary,
      currency: merged.currency,
      allowances: merged.allowances,
      source: `transition:${params.transitionType}`,
      recorded_by: params.actorUserId,
      transition_type: params.transitionType,
      notes: params.notes ?? null,
      enhanced_review_required: enhancedReviewRequired,
    })
    .select("id")
    .single();
  if (error || !data) return { ok: false, error: error?.message ?? "Failed to record the employment transition." };

  await logActivity({
    actorUserId: params.actorUserId,
    action: "employment_transition.recorded",
    entityType: "user",
    entityId: params.profileId,
    metadata: { employmentTermsHistoryId: data.id, transitionType: params.transitionType, enhancedReviewRequired },
  });
  return { ok: true, id: data.id, enhancedReviewRequired };
}

// Completion is its OWN append-only event (employment_transition_reviews,
// migration 0106) rather than an update to the transition row itself —
// employment_terms_history can never be updated once inserted. The
// unique constraint on employment_terms_history_id is what actually
// enforces "at most once", not merely this function's own pre-check.
export async function completeEnhancedReview(params: { employmentTermsHistoryId: string; notes?: string | null; actorUserId: string }): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!(await canManageEmploymentTransitions(params.actorUserId))) {
    return { ok: false, error: "Not authorized to complete an enhanced review." };
  }

  const admin = createAdminClient();
  const { data: transition } = await admin
    .from("employment_terms_history")
    .select("id, profile_id, enhanced_review_required")
    .eq("id", params.employmentTermsHistoryId)
    .maybeSingle();
  if (!transition) return { ok: false, error: "Transition not found." };
  if (!transition.enhanced_review_required) return { ok: false, error: "This transition does not require enhanced review." };

  const { error } = await admin
    .from("employment_transition_reviews")
    .insert({ employment_terms_history_id: params.employmentTermsHistoryId, completed_by: params.actorUserId, notes: params.notes ?? null });
  if (error) {
    if (error.code === "23505") return { ok: false, error: "This transition's enhanced review was already completed." };
    return { ok: false, error: "Failed to record the enhanced review completion." };
  }

  await logActivity({ actorUserId: params.actorUserId, action: "employment_transition.enhanced_review_completed", entityType: "user", entityId: transition.profile_id, metadata: { employmentTermsHistoryId: params.employmentTermsHistoryId } });
  return { ok: true };
}

export interface EnhancedReviewCompletion {
  employmentTermsHistoryId: string;
  completedAt: string;
  completedBy: string;
}

// Batch lookup so a history-listing UI can show completion status
// without one query per row.
export async function listEnhancedReviewCompletions(employmentTermsHistoryIds: string[]): Promise<EnhancedReviewCompletion[]> {
  if (employmentTermsHistoryIds.length === 0) return [];
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("employment_transition_reviews")
    .select("employment_terms_history_id, completed_at, completed_by")
    .in("employment_terms_history_id", employmentTermsHistoryIds);
  if (error) {
    console.error("[organization] failed to load employment_transition_reviews", error.message);
    return [];
  }
  return (data ?? []).map((r) => ({ employmentTermsHistoryId: r.employment_terms_history_id, completedAt: r.completed_at, completedBy: r.completed_by }));
}
