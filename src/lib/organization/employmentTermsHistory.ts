import { createAdminClient } from "@/lib/supabase/admin";

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
  allowances: Record<string, unknown> | null;
}

export interface EmploymentTermsRow extends EmploymentTermsFields {
  id: string;
  profileId: string;
  effectiveFrom: string;
  source: string;
  recordedAt: string;
  recordedBy: string | null;
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
  allowances: null,
};

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
  allowances: Record<string, unknown> | null;
  source: string;
  recorded_at: string;
  recorded_by: string | null;
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
    allowances: r.allowances,
    source: r.source,
    recordedAt: r.recorded_at,
    recordedBy: r.recorded_by,
  };
}

const SELECT =
  "id, profile_id, effective_from, employing_entity_id, employment_jurisdiction_id, work_location, position_id, department_id, grade_id, manager_id, work_pattern, basic_salary, allowances, source, recorded_at, recorded_by";

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
      allowances: merged.allowances,
      source: params.source,
      recorded_by: params.recordedBy,
    })
    .select("id")
    .single();
  if (error || !data) return { ok: false, error: error?.message ?? "Failed to record the employment terms snapshot." };
  return { ok: true, id: data.id };
}
