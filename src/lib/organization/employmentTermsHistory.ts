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

// Structured work-pattern classification (Founder Employment Workspace
// Phase, Part B Sequence 2, 2026-09-15) — deliberately separate from
// the free-text workPattern field below, which remains the source of
// truth for descriptive prose. shift_roster is a classification label
// only at this stage; the real shift/roster assignment data model is a
// separate, later undertaking.
export const WORK_PATTERN_TYPES = ["fixed_schedule", "shift_roster", "flexible_executive"] as const;
export type WorkPatternType = (typeof WORK_PATTERN_TYPES)[number];

// Founder/Director compensation CLASSIFICATION (Founder Employment
// Workspace Phase, Part B Sequence 3, 2026-09-15) — deliberately
// structurally separate from basicSalary/currency below, and from
// grade/title/employment-status/workPatternType/authority elsewhere.
// This is NOT a general employee compensation field: ordinary staff
// compensation is already unambiguous (a wage, recorded via
// basicSalary/currency); this field exists only for the genuinely
// distinct Founder/Director question of whether, and under what
// classification, a Director's compensation may legitimately be zero
// or deferred under Ghanaian law. That is a legal/policy
// determination this codebase does not make — see the Sequence 3
// report. Only "not_yet_determined" is defined for now: an explicit,
// legally-neutral "this decision has been deliberately deferred"
// marker, never a legal characterization of the relationship itself.
// Further values (e.g. distinguishing a Director's-fees arrangement
// from an employment salary) can only be added once that legal
// question is resolved — never guessed.
export const COMPENSATION_STATUSES = ["not_yet_determined"] as const;
export type CompensationStatus = (typeof COMPENSATION_STATUSES)[number];

export interface EmploymentTermsFields {
  employingEntityId: string | null;
  employmentJurisdictionId: string | null;
  workLocation: string | null;
  positionId: string | null;
  departmentId: string | null;
  gradeId: string | null;
  managerId: string | null;
  workPattern: string | null;
  // Classification, not description — see WORK_PATTERN_TYPES above.
  // Never inferred or auto-assigned; null means genuinely unclassified.
  // A "flexible_executive" person may legitimately have workingWeekdays
  // remain null too — this is never forced into a fixed weekday array
  // merely to satisfy the calendar resolver.
  workPatternType: WorkPatternType | null;
  // Classification, not amount — see COMPENSATION_STATUSES above.
  // Never inferred or auto-assigned; null means genuinely
  // unconsidered (distinct from "not_yet_determined", which is an
  // explicit deferred-decision marker someone deliberately recorded).
  compensationStatus: CompensationStatus | null;
  basicSalary: number | null;
  currency: string | null;
  allowances: Record<string, unknown> | null;
  // Structured working-weekday set (Public Holiday / Working-Day
  // Calendar foundation, 2026-09-15) — ISO weekday numbers, 1=Monday..
  // 7=Sunday, e.g. [1,2,3,4,5] for Monday-Friday. Deliberately separate
  // from the free-text workPattern above (which stays the source of
  // truth for hours/breaks prose in the agreement) — this is the one
  // new structured fact the calendar's Working-Day Resolver needs and
  // free text can't safely answer. Never assumed Monday-Friday for
  // anyone: null here means genuinely unconfigured, resolved as
  // UNRESOLVED by the calendar, never guessed.
  workingWeekdays: number[] | null;
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
  workPatternType: null,
  compensationStatus: null,
  basicSalary: null,
  currency: null,
  allowances: null,
  workingWeekdays: null,
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
  work_pattern_type: string | null;
  compensation_status: string | null;
  basic_salary: number | null;
  currency: string | null;
  allowances: Record<string, unknown> | null;
  working_weekdays: number[] | null;
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
    workPatternType: r.work_pattern_type as WorkPatternType | null,
    compensationStatus: r.compensation_status as CompensationStatus | null,
    basicSalary: r.basic_salary,
    currency: r.currency,
    allowances: r.allowances,
    workingWeekdays: r.working_weekdays,
    source: r.source,
    recordedAt: r.recorded_at,
    recordedBy: r.recorded_by,
    transitionType: r.transition_type as EmploymentTransitionType | null,
    notes: r.notes,
    enhancedReviewRequired: r.enhanced_review_required,
  };
}

const SELECT =
  "id, profile_id, effective_from, employing_entity_id, employment_jurisdiction_id, work_location, position_id, department_id, grade_id, manager_id, work_pattern, work_pattern_type, compensation_status, basic_salary, currency, allowances, working_weekdays, source, recorded_at, recorded_by, transition_type, notes, enhanced_review_required";

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

// The EARLIEST recorded snapshot for a profile — i.e. their real
// employment commencement date, distinct from getEmploymentTermsAsOf()
// (which answers "what applied AS OF a date" and returns null for any
// date before the first snapshot). The Working-Day Calendar
// (workingDayCalendar.ts, 2026-09-15) needs this specific distinction:
// a date before someone's real commencement is PRE_EMPLOYMENT (a
// genuine employment record exists, just not yet effective), never
// the same UNCONFIGURED/UNRESOLVED state as someone with no employment
// record at all.
export async function getEarliestEmploymentTerms(profileId: string): Promise<EmploymentTermsRow | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("employment_terms_history")
    .select(SELECT)
    .eq("profile_id", profileId)
    .order("effective_from", { ascending: true })
    .order("recorded_at", { ascending: true })
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
      work_pattern_type: merged.workPatternType,
      compensation_status: merged.compensationStatus,
      basic_salary: merged.basicSalary,
      currency: merged.currency,
      allowances: merged.allowances,
      working_weekdays: merged.workingWeekdays,
      source: params.source,
      recorded_by: params.recordedBy,
    })
    .select("id")
    .single();
  if (error || !data) return { ok: false, error: error?.message ?? "Failed to record the employment terms snapshot." };
  return { ok: true, id: data.id };
}

// A person's FIRST-EVER employment-terms snapshot — the commencement
// of their present formal employment arrangement, distinct from any
// earlier informal/prior working relationship (which is never
// automatically reinterpreted as continuous statutory employment
// merely by recording this). Refuses if a snapshot already exists for
// this profile: an ongoing change belongs through
// recordEmploymentTransition() instead, never through this function.
export async function recordInitialEmploymentTerms(params: {
  profileId: string;
  effectiveFrom: string;
  changes: Partial<EmploymentTermsFields>;
  actorUserId: string;
}): Promise<RecordEmploymentTermsSnapshotResult> {
  if (!(await canManageEmploymentTransitions(params.actorUserId))) {
    return { ok: false, error: "Not authorized to record employment terms." };
  }
  const existing = await getCurrentEmploymentTerms(params.profileId);
  if (existing) {
    return { ok: false, error: "This person already has employment-terms history — record a change via an employment transition instead." };
  }

  const result = await recordEmploymentTermsSnapshot({
    profileId: params.profileId,
    effectiveFrom: params.effectiveFrom,
    changes: params.changes,
    source: "formal_employment_commencement",
    recordedBy: params.actorUserId,
  });
  if (!result.ok) return result;

  await logActivity({ actorUserId: params.actorUserId, action: "employment_terms.initial_recorded", entityType: "user", entityId: params.profileId, metadata: { employmentTermsHistoryId: result.id } });
  return result;
}

// Founder/CEO self-administration (Workforce/Employee Self-Service
// Phase, 2026-09-15) — the Founder has no internal reporting authority
// above him, so the ordinary "someone else records your employment
// terms" model has no independent approver to fill that role for his
// OWN record. This is deliberately its own function, not a relaxed
// path through recordInitialEmploymentTerms(), for two reasons: (1) it
// is strictly narrower — actorUserId must equal profileId, so no
// Super Admin can use this to self-administer on someone ELSE's
// behalf, which would defeat the entire point; (2) the source value is
// distinct ("founder_self_administered_commencement" vs. the ordinary
// "formal_employment_commencement") specifically so this NEVER reads,
// in any report or audit trail, as if an independent HR review took
// place — the instruction's own words are "must not masquerade as
// independent HR approval." Still refuses if a record already exists
// (delegates the same first-ever-snapshot guard to
// recordEmploymentTermsSnapshot's caller pattern), still fully audited.
export async function recordFounderSelfAdministeredEmploymentTerms(params: {
  profileId: string;
  effectiveFrom: string;
  changes: Partial<EmploymentTermsFields>;
  actorUserId: string;
}): Promise<RecordEmploymentTermsSnapshotResult> {
  if (params.actorUserId !== params.profileId) {
    return { ok: false, error: "Self-administered employment terms can only be recorded by the person they belong to." };
  }
  if (!(await isSuperAdminId(params.actorUserId))) {
    return { ok: false, error: "Not authorized to self-administer employment terms." };
  }
  const existing = await getCurrentEmploymentTerms(params.profileId);
  if (existing) {
    return { ok: false, error: "An employment-terms record already exists — record a change via an employment transition instead." };
  }

  const result = await recordEmploymentTermsSnapshot({
    profileId: params.profileId,
    effectiveFrom: params.effectiveFrom,
    changes: params.changes,
    source: "founder_self_administered_commencement",
    recordedBy: params.actorUserId,
  });
  if (!result.ok) return result;

  await logActivity({
    actorUserId: params.actorUserId,
    action: "employment_terms.founder_self_administered",
    entityType: "user",
    entityId: params.profileId,
    metadata: { employmentTermsHistoryId: result.id, selfAdministered: true },
  });
  return result;
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
      work_pattern_type: merged.workPatternType,
      compensation_status: merged.compensationStatus,
      basic_salary: merged.basicSalary,
      currency: merged.currency,
      allowances: merged.allowances,
      working_weekdays: merged.workingWeekdays,
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

export interface CurrentEmploymentContext {
  employingEntityId: string | null;
  employingEntityName: string | null;
  employmentJurisdictionId: string | null;
  employmentJurisdictionName: string | null;
  workLocation: string | null;
  startDate: string | null;
  // True when at least one of the fields above was actually sourced
  // from this person's current employment_terms_history rather than
  // the caller's fallback — lets a UI note that the shown value
  // reflects a later fact than whatever the original fallback source
  // (e.g. a hire-time requisition) ever captured.
  resolvedFromCurrentTerms: boolean;
}

// Pure decision core of the id/name pairing bug fixed 2026-09-17 (see
// resolveCurrentEmploymentContext() below) — independently testable
// without a database. A lookup is needed whenever there IS a resolved
// id but no name already known to correspond to that EXACT id — never
// merely "did current terms override the fallback's id", which is what
// silently dropped a real, governed fallback-only id's name before.
export function needsNameLookup(resolvedId: string | null, knownName: string | null, knownNameId: string | null): boolean {
  if (!resolvedId) return false;
  if (knownName !== null && knownNameId === resolvedId) return false;
  return true;
}

// THE canonical "what is actually true for this person right now"
// resolver for employing entity / jurisdiction / work location / start
// date — used by BOTH the Agreement Readiness resolver
// (resolveEmployeeAgreementVariables(), employeeAgreements.ts) and the
// Onboarding Workspace's "Employment / Hire Definition" summary
// (src/app/admin/organization/onboarding/[onboardingId]/page.tsx), so
// the two views can never again show two different answers for the
// same real fact. A caller's `fallback` (typically resolved from a
// hire-time recruitment_requisitions row) is used ONLY for whichever
// field this person's current employment_terms_history has not (yet)
// recorded — never the reverse, and never a fabricated merge of the
// two into one incoherent record. Position/Department/Grade/Engagement
// Type/Reporting Manager are deliberately NOT part of this resolver —
// those remain governed exclusively by assignStaffPosition() (see
// migration 0106's own header comment).
export async function resolveCurrentEmploymentContext(params: {
  profileId: string;
  fallback?: Partial<{
    employingEntityId: string | null;
    employingEntityName: string | null;
    employmentJurisdictionId: string | null;
    employmentJurisdictionName: string | null;
    workLocation: string | null;
    startDate: string | null;
  }> | null;
}): Promise<CurrentEmploymentContext> {
  const fallback = params.fallback ?? {};
  const currentTerms = await getCurrentEmploymentTerms(params.profileId);

  const employingEntityId = currentTerms?.employingEntityId ?? fallback.employingEntityId ?? null;
  const employmentJurisdictionId = currentTerms?.employmentJurisdictionId ?? fallback.employmentJurisdictionId ?? null;
  const workLocation = currentTerms?.workLocation ?? fallback.workLocation ?? null;
  const startDate = currentTerms?.effectiveFrom ?? fallback.startDate ?? null;
  const resolvedFromCurrentTerms = Boolean(
    currentTerms?.employingEntityId || currentTerms?.employmentJurisdictionId || currentTerms?.workLocation || currentTerms?.effectiveFrom
  );

  // MISSING_JURISDICTION root-cause fix (2026-09-17) — the previous
  // condition only re-resolved a name when CURRENT TERMS supplied a
  // *different* id than the fallback's own id, silently assuming that
  // whenever the fallback's id was the one actually used, the
  // fallback's name (if any) was already trustworthy for it. That's
  // false for a caller whose fallback carries an id with NO
  // corresponding name (exactly what resolveEmployeeAgreementVariables()
  // used to do): the final resolved id correctly fell back to the
  // fallback's real, governed id, but its name silently stayed null —
  // a genuine jurisdiction on file was read as no jurisdiction at all.
  // needsNameLookup() is keyed off the FINAL resolved id, not merely
  // "did current terms override" — a lookup fires whenever we don't
  // already hold a name that's actually paired with that exact id,
  // regardless of which source (current terms or fallback) supplied it.
  let employingEntityName = fallback.employingEntityName ?? null;
  if (needsNameLookup(employingEntityId, employingEntityName, fallback.employingEntityId ?? null)) {
    const admin = createAdminClient();
    const { data } = await admin.from("employing_entities").select("name, legal_name").eq("id", employingEntityId as string).maybeSingle();
    employingEntityName = data ? (data.legal_name ?? data.name) : null;
  }

  let employmentJurisdictionName = fallback.employmentJurisdictionName ?? null;
  if (needsNameLookup(employmentJurisdictionId, employmentJurisdictionName, fallback.employmentJurisdictionId ?? null)) {
    const admin = createAdminClient();
    const { data } = await admin.from("employment_jurisdictions").select("name").eq("id", employmentJurisdictionId as string).maybeSingle();
    employmentJurisdictionName = data?.name ?? null;
  }

  return {
    employingEntityId,
    employingEntityName,
    employmentJurisdictionId,
    employmentJurisdictionName,
    workLocation,
    startDate,
    resolvedFromCurrentTerms,
  };
}
