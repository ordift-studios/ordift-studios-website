import { createAdminClient } from "@/lib/supabase/admin";
import { logActivity } from "@/lib/admin/activityLog";
import { isSuperAdminId, hasJurisdictionAuthority, isGrantActive, listAuthorityGrants } from "@/lib/organization/authority";
import {
  computeUnsatisfiedRequired,
  type RequirementTemplate,
  type RequirementStatus,
} from "@/lib/organization/onboardingRequirements";
import type { RoleSlug } from "@/lib/portal/roles";

export type { RequirementStatus };

// Workforce lifecycle — separation/offboarding clearance requirements
// (Sequence 1, E.5 Stage 2J). Reuses the requirement TYPE vocabulary
// and the pure gating function (computeUnsatisfiedRequired) directly
// from onboardingRequirements.ts rather than duplicating that logic —
// see the Stage 2J report for the concrete evidence behind keeping the
// STATE persistence (this file's own separation_requirements table)
// separate from onboarding_requirements while sharing the LOGIC.
//
// `RequirementTemplate.stage` is reused as-is (structural typing, zero
// changes to onboardingRequirements.ts) but means something different
// here: a clearance AREA (Department, Finance, Legal, HR, Access,
// Corporate Identity, Authority, Handover) — clearance areas run in
// PARALLEL, unlike onboarding's strictly sequential stages. Comments
// and every user-facing label in this module say "area", never
// "stage", to keep that distinction honest despite the shared field
// name.

export type RelationshipTier = "staff" | "external";

function tierForRoles(roles: RoleSlug[]): RelationshipTier {
  return roles.includes("staff") ? "staff" : "external";
}

async function deriveAuthorityGrantsRevoked(profileId: string): Promise<RequirementStatus | null> {
  // Reuses the existing Authority Grants system directly — satisfied
  // once this profile holds zero currently-ACTIVE grants (revoked/
  // expired/not-yet-effective grants don't count against it). Never
  // itself revokes anything; see Part 11/K — this only reads.
  const grants = await listAuthorityGrants();
  const activeCount = grants.filter((g) => g.profileId === profileId && isGrantActive(g)).length;
  return activeCount === 0 ? "satisfied" : null;
}

function deriveFromFinalSettlementStatus(finalSettlementStatus: string): RequirementStatus | null {
  return finalSettlementStatus !== "not_started" ? "satisfied" : null;
}

// Full clearance set for a genuine staff member. Deliberately does NOT
// include any item that depends on the departing person's own
// participation (no "employee signs exit acknowledgement" required
// item) — this is what lets an exceptional case (death, incapacity,
// abandonment) reach full company-side clearance without ever needing
// to force an employee-participation item to `not_applicable`; there
// simply isn't one to begin with. Company-side acknowledgement of the
// case itself is tracked on separation_cases.company_acknowledged_at,
// not as a blocking requirement row.
export const STAFF_SEPARATION_CLEARANCE_CATALOG: readonly RequirementTemplate[] = [
  { requirementKey: "department_manager_clearance", stage: "department", requirementType: "approval", label: "Department / Manager clearance", required: true, responsibleRole: "super_admin" },
  { requirementKey: "project_handover_completed", stage: "handover", requirementType: "task", label: "Project / work handover completed", required: true, responsibleRole: "super_admin" },
  { requirementKey: "company_assets_returned", stage: "assets", requirementType: "task", label: "Company property / assets / equipment returned", required: true, responsibleRole: "super_admin" },
  { requirementKey: "operations_admin_clearance", stage: "operations", requirementType: "approval", label: "Operations / Admin clearance", required: true, responsibleRole: "super_admin" },
  { requirementKey: "finance_final_review", stage: "finance", requirementType: "approval", label: "Finance / final-obligation review", required: true, responsibleRole: "super_admin" },
  { requirementKey: "legal_confidentiality_review", stage: "legal", requirementType: "approval", label: "Legal / confidentiality & document review", required: true, responsibleRole: "super_admin" },
  { requirementKey: "hr_personnel_document_clearance", stage: "hr", requirementType: "task", label: "HR / personnel-document clearance", required: true, responsibleRole: "super_admin" },
  { requirementKey: "system_access_review", stage: "access", requirementType: "approval", label: "System / access review", required: true, responsibleRole: "super_admin" },
  {
    requirementKey: "authority_grants_revoked",
    stage: "authority",
    requirementType: "external_handoff",
    label: "Authority Grant revocation requirement",
    required: true,
    responsibleRole: "super_admin",
    derive: deriveAuthorityGrantsRevoked,
  },
  { requirementKey: "corporate_identity_work_email_disposition", stage: "corporate_identity", requirementType: "external_handoff", label: "Corporate Identity / Work Email disposition determined", required: true, responsibleRole: "super_admin" },
  {
    requirementKey: "final_settlement_handoff",
    stage: "final_settlement",
    requirementType: "external_handoff",
    label: "Outstanding payment / payroll final-settlement handoff requested",
    required: true,
    responsibleRole: "super_admin",
    // Note: this one is derived from the CASE's own final_settlement_status,
    // not a live external table — see resolveSeparationRequirements()'s
    // caller, which passes the case's status in as the derived source.
  },
  { requirementKey: "final_management_clearance", stage: "final_management", requirementType: "approval", label: "Final management clearance", required: true, responsibleRole: "super_admin" },
] as const;

// Smaller, relationship-aware set for a non-staff external contributor
// (contractor, vendor/supplier, instructor, model/talent) — per Part 4,
// external contributors must NOT automatically receive the same
// clearance set as staff. No Corporate Identity/Authority/HR-personnel
// items (external contributors don't hold these in this system's
// architecture), and asset return / system access are marked OPTIONAL
// since not every external engagement involves either — a real case
// can still mark either `required` via a manual waiver/override if
// genuinely needed, but the default never falsely blocks on something
// that was never applicable to that engagement.
export const EXTERNAL_SEPARATION_CLEARANCE_CATALOG: readonly RequirementTemplate[] = [
  { requirementKey: "engagement_handover_completed", stage: "handover", requirementType: "task", label: "Engagement / work handover completed", required: true, responsibleRole: "super_admin" },
  { requirementKey: "company_assets_returned", stage: "assets", requirementType: "task", label: "Company property / equipment returned (if any)", required: false, responsibleRole: "super_admin" },
  { requirementKey: "system_access_review", stage: "access", requirementType: "approval", label: "System / access review (if any)", required: false, responsibleRole: "super_admin" },
  { requirementKey: "finance_final_review", stage: "finance", requirementType: "approval", label: "Finance / final-obligation review", required: true, responsibleRole: "super_admin" },
  { requirementKey: "final_settlement_handoff", stage: "final_settlement", requirementType: "external_handoff", label: "Outstanding payment final-settlement handoff requested", required: true, responsibleRole: "super_admin" },
  { requirementKey: "final_management_clearance", stage: "final_management", requirementType: "approval", label: "Final management clearance", required: true, responsibleRole: "super_admin" },
] as const;

export function catalogForRelationship(roles: RoleSlug[]): readonly RequirementTemplate[] {
  return tierForRoles(roles) === "staff" ? STAFF_SEPARATION_CLEARANCE_CATALOG : EXTERNAL_SEPARATION_CLEARANCE_CATALOG;
}

export type SeparationRequirementRow = {
  id: string;
  separationCaseId: string;
  requirementKey: string;
  requirementType: string;
  area: string;
  required: boolean;
  status: RequirementStatus;
  responsibleRole: string | null;
  evidenceReference: string | null;
  notes: string | null;
  completedAt: string | null;
  completedBy: string | null;
  verifiedAt: string | null;
  verifiedBy: string | null;
  updatedAt: string;
};

export type ResolvedSeparationRequirement = RequirementTemplate & {
  status: RequirementStatus;
  row: SeparationRequirementRow | null;
};

function mapRow(r: {
  id: string;
  separation_case_id: string;
  requirement_key: string;
  requirement_type: string;
  area: string;
  required: boolean;
  status: string;
  responsible_role: string | null;
  evidence_reference: string | null;
  notes: string | null;
  completed_at: string | null;
  completed_by: string | null;
  verified_at: string | null;
  verified_by: string | null;
  updated_at: string;
}): SeparationRequirementRow {
  return {
    id: r.id,
    separationCaseId: r.separation_case_id,
    requirementKey: r.requirement_key,
    requirementType: r.requirement_type,
    area: r.area,
    required: r.required,
    status: r.status as RequirementStatus,
    responsibleRole: r.responsible_role,
    evidenceReference: r.evidence_reference,
    notes: r.notes,
    completedAt: r.completed_at,
    completedBy: r.completed_by,
    verifiedAt: r.verified_at,
    verifiedBy: r.verified_by,
    updatedAt: r.updated_at,
  };
}

const SELECT =
  "id, separation_case_id, requirement_key, requirement_type, area, required, status, responsible_role, evidence_reference, notes, completed_at, completed_by, verified_at, verified_by, updated_at";

async function fetchRowsByKey(separationCaseId: string): Promise<Map<string, SeparationRequirementRow>> {
  const admin = createAdminClient();
  const { data, error } = await admin.from("separation_requirements").select(SELECT).eq("separation_case_id", separationCaseId);
  if (error) {
    console.error("[organization] failed to load separation_requirements", error.message);
    return new Map();
  }
  return new Map((data ?? []).map(mapRow).map((r) => [r.requirementKey, r]));
}

async function fetchDerivedByKey(
  catalog: readonly RequirementTemplate[],
  profileId: string,
  finalSettlementStatus: string
): Promise<Map<string, RequirementStatus | null>> {
  const entries = await Promise.all(
    catalog.map(async (t): Promise<readonly [string, RequirementStatus | null]> => {
      if (t.requirementKey === "final_settlement_handoff") return [t.requirementKey, deriveFromFinalSettlementStatus(finalSettlementStatus)];
      if (t.derive) return [t.requirementKey, await t.derive(profileId)];
      return [t.requirementKey, null];
    })
  );
  return new Map(entries);
}

export async function listResolvedSeparationRequirements(params: {
  separationCaseId: string;
  profileId: string;
  roles: RoleSlug[];
  finalSettlementStatus: string;
}): Promise<ResolvedSeparationRequirement[]> {
  const catalog = catalogForRelationship(params.roles);
  const [rowsByKey, derivedByKey] = await Promise.all([
    fetchRowsByKey(params.separationCaseId),
    fetchDerivedByKey(catalog, params.profileId, params.finalSettlementStatus),
  ]);
  return catalog.map((template) => {
    const row = rowsByKey.get(template.requirementKey) ?? null;
    const status: RequirementStatus = row?.status ?? derivedByKey.get(template.requirementKey) ?? "pending";
    return { ...template, status, row };
  });
}

export async function getUnsatisfiedRequiredSeparationRequirements(params: {
  separationCaseId: string;
  profileId: string;
  roles: RoleSlug[];
  finalSettlementStatus: string;
}): Promise<RequirementTemplate[]> {
  const catalog = catalogForRelationship(params.roles);
  const [rowsByKey, derivedByKey] = await Promise.all([
    fetchRowsByKey(params.separationCaseId),
    fetchDerivedByKey(catalog, params.profileId, params.finalSettlementStatus),
  ]);
  return computeUnsatisfiedRequired(catalog, rowsByKey, derivedByKey);
}

// Same coarse authorization boundary as onboarding (Super Admin, or a
// holder of operations.administer) — deliberately duplicated in-module
// rather than imported, matching this codebase's own established
// tolerance for this exact duplication (see the identical comment in
// onboardingRequirements.ts). No new authorization concept, and
// certainly no NEW standing authority granted by this stage.
async function canManageSeparationRequirements(actorUserId: string): Promise<boolean> {
  if (await isSuperAdminId(actorUserId)) return true;
  return hasJurisdictionAuthority(actorUserId, "operations", "administer");
}

export async function updateSeparationRequirement(params: {
  separationCaseId: string;
  roles: RoleSlug[];
  requirementKey: string;
  status: RequirementStatus;
  actorUserId: string;
  evidenceReference?: string | null;
  notes?: string | null;
  verifiedNow?: boolean;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!(await canManageSeparationRequirements(params.actorUserId))) {
    return { ok: false, error: "Not authorized to update separation clearance requirements." };
  }

  const template = catalogForRelationship(params.roles).find((t) => t.requirementKey === params.requirementKey);
  if (!template) {
    return { ok: false, error: "Unknown clearance requirement for this relationship type." };
  }

  const admin = createAdminClient();
  const now = new Date().toISOString();
  const isTerminalStatus = params.status === "satisfied" || params.status === "waived" || params.status === "not_applicable";

  const row: Record<string, unknown> = {
    separation_case_id: params.separationCaseId,
    requirement_key: params.requirementKey,
    requirement_type: template.requirementType,
    area: template.stage,
    required: template.required,
    responsible_role: template.responsibleRole ?? null,
    status: params.status,
    updated_at: now,
  };
  if (params.evidenceReference !== undefined) row.evidence_reference = params.evidenceReference;
  if (params.notes !== undefined) row.notes = params.notes;
  if (isTerminalStatus) {
    row.completed_at = now;
    row.completed_by = params.actorUserId;
  }
  if (params.verifiedNow) {
    row.verified_at = now;
    row.verified_by = params.actorUserId;
  }

  const { data: existing } = await admin
    .from("separation_requirements")
    .select("id")
    .eq("separation_case_id", params.separationCaseId)
    .eq("requirement_key", params.requirementKey)
    .maybeSingle();

  const { error } = existing
    ? await admin.from("separation_requirements").update(row).eq("id", existing.id)
    : await admin.from("separation_requirements").insert({ ...row, created_by: params.actorUserId });

  if (error) {
    console.error("[organization] failed to update separation_requirements", error.message);
    return { ok: false, error: "Failed to update this clearance requirement." };
  }

  const { data: sepCase } = await admin.from("separation_cases").select("profile_id").eq("id", params.separationCaseId).maybeSingle();
  await logActivity({
    actorUserId: params.actorUserId,
    action: "separation_requirement.updated",
    entityType: "user",
    entityId: sepCase?.profile_id ?? params.separationCaseId,
    metadata: { separationCaseId: params.separationCaseId, requirementKey: params.requirementKey, newStatus: params.status },
  });

  return { ok: true };
}
