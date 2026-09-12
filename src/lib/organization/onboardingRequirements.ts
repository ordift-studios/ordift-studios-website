import { createAdminClient } from "@/lib/supabase/admin";
import { logActivity } from "@/lib/admin/activityLog";
import { isSuperAdminId, hasJurisdictionAuthority } from "@/lib/organization/authority";
import type { OnboardingPipeline } from "@/lib/organization/onboardingStages";
import { deriveEmploymentAgreementExecuted } from "@/lib/legal/employeeAgreements";

// Internal Staff Onboarding — requirement/gating foundation (Sequence
// 1, E.5 Stage 2I, 2026-09-11). Deliberately thin: this is NOT a
// generic workflow engine. A requirement's DEFINITION (key, type,
// stage, label, required, responsible role, and — for a derived
// requirement — how its status is computed) lives here in code, in the
// same style as this codebase's own BACKGROUND_SCREENING_CATEGORIES/
// EMPLOYEE_ONBOARDING_STAGES. Its per-person STATE lives in
// public.onboarding_requirements (migration 0078), and only once a
// human has actually acted on it — an applicable requirement with no
// row is simply "pending", never fabricated as a row to display it.
//
// IMPORTANT — the starter catalog below (EMPLOYEE_ONBOARDING_REQUIREMENT_CATALOG)
// is a minimal, deliberately conservative SCAFFOLD to make stage/completion
// gating mean something, not an asserted, Founder-approved statement of
// Ordift's actual HR policy. Its five entries are either the exact
// example given in the authorizing instruction (Employment Agreement)
// or self-evidently universal for any employer (identity verification,
// policy acknowledgement) or directly reused from an existing Ordift
// system rather than invented (background screening, Corporate
// Identity). The Founder should review/adjust this list before relying
// on it operationally — see the Stage 2I report.

export const REQUIREMENT_TYPES = [
  "task",
  "document",
  "agreement",
  "digital_signature",
  "physical_document",
  "approval",
  "external_handoff",
] as const;
export type RequirementType = (typeof REQUIREMENT_TYPES)[number];

export const REQUIREMENT_STATUSES = ["pending", "satisfied", "waived", "not_applicable"] as const;
export type RequirementStatus = (typeof REQUIREMENT_STATUSES)[number];

export type RequirementTemplate = {
  requirementKey: string;
  stage: string;
  requirementType: RequirementType;
  label: string;
  required: boolean;
  responsibleRole?: string;
  // Derived requirements compute their live status from an existing
  // Ordift system rather than a manual click — e.g. background
  // screening outcome, or whether a Corporate Identity has been
  // reserved. A persisted onboarding_requirements row (a real human
  // action: waived, or a manual override) always takes precedence over
  // a derived result. Returning null means "no live opinion — fall
  // back to a persisted row, or pending."
  derive?: (profileId: string) => Promise<RequirementStatus | null>;
  // TD-071, B1 (E.5 Stage 2K) — an agreement/document requirement may
  // need digital execution, physical-original execution, both, or
  // neither; the REQUIREMENT DEFINITION decides which, never assumed.
  // When either flag is set, a manual "satisfied"/"pending" status is
  // no longer trusted as-is — see applyConfiguredEvidenceStatus():
  // this requirement's effective status is instead computed from the
  // row's own digitalExecutionStatus/physicalOriginalReceived fields,
  // so a requirement can only genuinely read "satisfied" once its
  // actually-configured evidence exists. "waived"/"not_applicable"
  // remain valid manual overrides regardless (a real human decision
  // that a requirement doesn't apply), never silently bypassed.
  requiresDigitalExecution?: boolean;
  requiresPhysicalExecution?: boolean;
};

export type OnboardingRequirementRow = {
  id: string;
  onboardingId: string;
  requirementKey: string;
  requirementType: RequirementType;
  stage: string;
  required: boolean;
  status: RequirementStatus;
  responsibleRole: string | null;
  digitalExecutionStatus: string | null;
  physicalOriginalRequired: boolean;
  physicalOriginalReceived: boolean;
  evidenceReference: string | null;
  notes: string | null;
  completedAt: string | null;
  completedBy: string | null;
  verifiedAt: string | null;
  verifiedBy: string | null;
  updatedAt: string;
};

// A requirement as resolved for display/gating — the catalog template
// merged with whatever state actually exists (persisted row, derived
// result, or the "pending" default), so callers never need to reason
// about the three sources separately.
//
// Deliberately Omit<..., "derive"> — this type crosses the Server
// Component -> Client Component boundary as a page prop (the
// Onboarding Workspace), and a plain JS function (a catalog template's
// `derive`) cannot be serialized across that boundary. React throws
// "Functions cannot be passed directly to Client Components" at
// render time — which Next.js returns as an HTTP 200 with a broken RSC
// payload, not a clean error page, which is exactly what produced the
// Founder's "loads/spins forever" symptom in Production (E.5 Stage 2K,
// found via Vercel runtime logs, not speculation). `isDerived` carries
// the one boolean bit of that information the UI actually needs.
export type ResolvedRequirement = Omit<RequirementTemplate, "derive"> & {
  status: RequirementStatus;
  row: OnboardingRequirementRow | null;
  isDerived: boolean;
};

// Pure — the one place that strips `derive` before a resolved
// requirement is ever allowed to cross into a Client Component prop.
// Reused as-is by separationRequirements.ts (E.5 Stage 2K) for the
// identical reason. Directly unit-tested (onboardingRequirements.test.ts)
// specifically to prove the Production defect this fixes can't recur:
// the returned object must never carry a `derive` key.
export function toClientSafeResolvedRequirement<T extends RequirementTemplate, R>(
  template: T,
  status: RequirementStatus,
  row: R
): Omit<T, "derive"> & { status: RequirementStatus; row: R; isDerived: boolean } {
  const { derive, ...rest } = template;
  return { ...rest, status, row, isDerived: Boolean(derive) } as Omit<T, "derive"> & { status: RequirementStatus; row: R; isDerived: boolean };
}

// TD-071, B2 fix (E.5 Stage 2K, 2026-09-12) — the original version of
// this function checked whether ANY ONE screening category qualified
// (`.limit(1).maybeSingle()`), so a single cleared category (e.g.
// `education`) could satisfy this requirement even while other
// recorded categories for the same profile were `pending`,
// `review_required`, or `adverse_information_identified`. Fixed to
// fail closed: every category actually recorded for this profile must
// qualify, and at least one must exist — a single non-qualifying
// recorded category, or no screening at all, now correctly leaves this
// requirement unsatisfied. This still doesn't decide WHICH categories
// are mandatory for a given role/jurisdiction — that remains a real
// future policy decision (see TD-071's own note) — it only ensures
// that whatever has genuinely been checked must have genuinely passed,
// never that one lucky category papers over others. Background
// Screening itself remains the untouched source of truth — this
// function only reads it, exactly as before.
async function deriveFromBackgroundScreening(profileId: string): Promise<RequirementStatus | null> {
  const admin = createAdminClient();
  const { data, error } = await admin.from("background_screenings").select("status").eq("profile_id", profileId);
  if (error || !data || data.length === 0) return null;
  const QUALIFYING_STATUSES = new Set(["clear", "management_approved_following_review"]);
  const everyRecordedCategoryQualifies = data.every((row) => QUALIFYING_STATUSES.has(row.status));
  return everyRecordedCategoryQualifies ? "satisfied" : null;
}

async function deriveFromCorporateIdentityReserved(profileId: string): Promise<RequirementStatus | null> {
  // "Satisfied" here means the handoff has been REQUESTED — a
  // Corporate Identity row exists at all (reserved or beyond) — never
  // that provisioning/activation has completed. Onboarding may only
  // display/request this handoff, never drive real provisioning
  // itself (Part K) — see reserveCorporateIdentity.ts for the actual
  // provisioning workflow, untouched by this module.
  const admin = createAdminClient();
  const { data } = await admin.from("corporate_identities").select("id").eq("profile_id", profileId).limit(1).maybeSingle();
  return data ? "satisfied" : null;
}

export const EMPLOYEE_ONBOARDING_REQUIREMENT_CATALOG: readonly RequirementTemplate[] = [
  {
    requirementKey: "identity_documents_verified",
    stage: "identity_profile",
    requirementType: "physical_document",
    label: "Identity documents verified",
    required: true,
    responsibleRole: "super_admin",
  },
  {
    requirementKey: "background_screening_cleared",
    stage: "background_screening",
    requirementType: "approval",
    label: "Background screening cleared or management-approved",
    required: true,
    responsibleRole: "super_admin",
    derive: deriveFromBackgroundScreening,
  },
  {
    requirementKey: "employment_agreement_executed",
    stage: "documents",
    requirementType: "agreement",
    label: "Employment Agreement executed",
    required: true,
    responsibleRole: "super_admin",
    // E.5 Stage 3C — now derived ONLY from genuine completed signature
    // evidence via the real OS-LGL-007 document-import/Signature Engine
    // pipeline (deriveEmploymentAgreementExecuted(), src/lib/legal/employeeAgreements.ts).
    // Superseded the earlier TD-071 manual requiresDigitalExecution
    // attestation for this specific key — a manual "digital execution
    // completed" claim would have let this be marked satisfied without
    // real signature evidence, contradicting the explicit requirement
    // that this key must never be satisfied any other way. The
    // requiresDigitalExecution/requiresPhysicalExecution mechanism
    // itself remains available for any future requirement that
    // genuinely needs manual attestation.
    derive: deriveEmploymentAgreementExecuted,
  },
  {
    requirementKey: "policies_acknowledged",
    stage: "documents",
    requirementType: "agreement",
    label: "Company policies acknowledged",
    required: true,
    responsibleRole: "super_admin",
  },
  {
    requirementKey: "work_email_handoff_requested",
    stage: "work_email",
    requirementType: "external_handoff",
    label: "Work Email / Corporate Identity handoff requested",
    required: true,
    responsibleRole: "super_admin",
    derive: deriveFromCorporateIdentityReserved,
  },
] as const;

// External-contractor pipeline requirements are deliberately not
// defined yet (Part C — implement only what's needed for the current
// Internal Staff validation). An empty catalog means gating for that
// pipeline is a no-op today, i.e. unchanged from its pre-existing
// behavior — not a regression, just not yet built out.
export const EXTERNAL_CONTRACTOR_ONBOARDING_REQUIREMENT_CATALOG: readonly RequirementTemplate[] = [];

export function catalogForPipeline(pipeline: OnboardingPipeline): readonly RequirementTemplate[] {
  return pipeline === "employee" ? EMPLOYEE_ONBOARDING_REQUIREMENT_CATALOG : EXTERNAL_CONTRACTOR_ONBOARDING_REQUIREMENT_CATALOG;
}

function mapRow(r: {
  id: string;
  onboarding_id: string;
  requirement_key: string;
  requirement_type: string;
  stage: string;
  required: boolean;
  status: string;
  responsible_role: string | null;
  digital_execution_status: string | null;
  physical_original_required: boolean;
  physical_original_received: boolean;
  evidence_reference: string | null;
  notes: string | null;
  completed_at: string | null;
  completed_by: string | null;
  verified_at: string | null;
  verified_by: string | null;
  updated_at: string;
}): OnboardingRequirementRow {
  return {
    id: r.id,
    onboardingId: r.onboarding_id,
    requirementKey: r.requirement_key,
    requirementType: r.requirement_type as RequirementType,
    stage: r.stage,
    required: r.required,
    status: r.status as RequirementStatus,
    responsibleRole: r.responsible_role,
    digitalExecutionStatus: r.digital_execution_status,
    physicalOriginalRequired: r.physical_original_required,
    physicalOriginalReceived: r.physical_original_received,
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
  "id, onboarding_id, requirement_key, requirement_type, stage, required, status, responsible_role, digital_execution_status, physical_original_required, physical_original_received, evidence_reference, notes, completed_at, completed_by, verified_at, verified_by, updated_at";

// Pure — the actual gating logic, isolated from I/O so it's directly
// unit-testable (see onboardingRequirements.test.ts) without a live
// Supabase session, matching this project's standing preference for
// separating a pure decision from its DB-dependent wiring wherever
// possible (e.g. describeOnboardingStartError() in onboarding.ts).
// rowsByKey's value type is intentionally the minimal shape this
// function actually reads (just `.status`), not the full
// OnboardingRequirementRow — this is what lets
// separationRequirements.ts (E.5 Stage 2J) reuse this exact function
// against its own, differently-shaped SeparationRequirementRow without
// any change here. Any row type with a `status` field (which every
// requirement-row type in this codebase has) satisfies it structurally.
export function computeUnsatisfiedRequired(
  catalog: readonly RequirementTemplate[],
  rowsByKey: ReadonlyMap<string, { status: RequirementStatus }>,
  derivedByKey: ReadonlyMap<string, RequirementStatus | null>,
  stage?: string
): RequirementTemplate[] {
  return catalog.filter((template) => {
    if (!template.required) return false;
    if (stage !== undefined && template.stage !== stage) return false;
    const row = rowsByKey.get(template.requirementKey);
    if (row) return row.status !== "satisfied" && row.status !== "waived" && row.status !== "not_applicable";
    const derived = derivedByKey.get(template.requirementKey);
    if (derived) return derived !== "satisfied";
    return true; // no row, no derived opinion — a required item defaults to pending, never silently satisfied
  });
}

// Pure — TD-071, B1 fix (E.5 Stage 2K). A requirement whose DEFINITION
// configures digital and/or physical execution (requiresDigitalExecution/
// requiresPhysicalExecution) can no longer be marked "satisfied" merely
// by a manually-chosen status — its effective status is recomputed here
// from the row's own evidence fields, so "final requirement satisfaction
// only when the configured required components are satisfied" (the
// authorizing instruction's own words) is enforced structurally, not by
// admin discipline. "waived"/"not_applicable" are real human decisions
// and always pass through unchanged — this never overrides a deliberate
// exemption, only a bare "satisfied"/"pending" claim.
export function applyConfiguredEvidenceStatus(
  catalog: readonly RequirementTemplate[],
  rowsByKey: ReadonlyMap<string, OnboardingRequirementRow>
): Map<string, OnboardingRequirementRow> {
  const result = new Map(rowsByKey);
  for (const template of catalog) {
    if (!template.requiresDigitalExecution && !template.requiresPhysicalExecution) continue;
    const row = result.get(template.requirementKey);
    if (!row) continue;
    if (row.status === "waived" || row.status === "not_applicable") continue;
    const digitalOk = !template.requiresDigitalExecution || row.digitalExecutionStatus === "completed";
    const physicalOk = !template.requiresPhysicalExecution || row.physicalOriginalReceived === true;
    result.set(template.requirementKey, { ...row, status: digitalOk && physicalOk ? "satisfied" : "pending" });
  }
  return result;
}

async function fetchRowsByKey(onboardingId: string): Promise<Map<string, OnboardingRequirementRow>> {
  const admin = createAdminClient();
  const { data, error } = await admin.from("onboarding_requirements").select(SELECT).eq("onboarding_id", onboardingId);
  if (error) {
    console.error("[organization] failed to load onboarding_requirements", error.message);
    return new Map();
  }
  return new Map((data ?? []).map(mapRow).map((r) => [r.requirementKey, r]));
}

async function fetchDerivedByKey(
  catalog: readonly RequirementTemplate[],
  profileId: string
): Promise<Map<string, RequirementStatus | null>> {
  const entries = await Promise.all(
    catalog
      .filter((t) => t.derive)
      .map(async (t) => [t.requirementKey, await t.derive!(profileId)] as const)
  );
  return new Map(entries);
}

// Full resolved view for the onboarding workspace — every catalog
// requirement for this pipeline, merged with real state. Read-only.
export async function listResolvedRequirements(params: {
  onboardingId: string;
  profileId: string;
  pipeline: OnboardingPipeline;
}): Promise<ResolvedRequirement[]> {
  const catalog = catalogForPipeline(params.pipeline);
  const [rawRowsByKey, derivedByKey] = await Promise.all([
    fetchRowsByKey(params.onboardingId),
    fetchDerivedByKey(catalog, params.profileId),
  ]);
  const rowsByKey = applyConfiguredEvidenceStatus(catalog, rawRowsByKey);
  return catalog.map((template) => {
    const row = rowsByKey.get(template.requirementKey) ?? null;
    const status: RequirementStatus = row?.status ?? derivedByKey.get(template.requirementKey) ?? "pending";
    return toClientSafeResolvedRequirement(template, status, row);
  });
}

// Used by completion gating (Part G) — every REQUIRED item across the
// whole pipeline, regardless of stage, must be satisfied/waived/n-a.
export async function getUnsatisfiedRequiredRequirements(params: {
  onboardingId: string;
  profileId: string;
  pipeline: OnboardingPipeline;
}): Promise<RequirementTemplate[]> {
  const catalog = catalogForPipeline(params.pipeline);
  const [rawRowsByKey, derivedByKey] = await Promise.all([
    fetchRowsByKey(params.onboardingId),
    fetchDerivedByKey(catalog, params.profileId),
  ]);
  return computeUnsatisfiedRequired(catalog, applyConfiguredEvidenceStatus(catalog, rawRowsByKey), derivedByKey);
}

// Used by stage-advance gating (Part J) — only requirements that gate
// the CURRENT stage must be satisfied before moving past it; a
// requirement belonging to a later stage never blocks an earlier one.
export async function getUnsatisfiedRequiredForStage(params: {
  onboardingId: string;
  profileId: string;
  pipeline: OnboardingPipeline;
  stage: string;
}): Promise<RequirementTemplate[]> {
  const catalog = catalogForPipeline(params.pipeline);
  const [rawRowsByKey, derivedByKey] = await Promise.all([
    fetchRowsByKey(params.onboardingId),
    fetchDerivedByKey(catalog, params.profileId),
  ]);
  return computeUnsatisfiedRequired(catalog, applyConfiguredEvidenceStatus(catalog, rawRowsByKey), derivedByKey, params.stage);
}

// Same coarse authorization boundary as every other onboarding action
// (Super Admin, or a holder of operations.administer) — deliberately
// duplicated in-module rather than imported from onboarding.ts to
// avoid a circular import between the two files; matches this
// codebase's own established tolerance for this exact duplication
// (e.g. src/app/admin/organization/people/[id]/actions.ts's own local
// requireAdmin()), not a new or divergent authorization concept.
async function canManageOnboardingRequirements(actorUserId: string): Promise<boolean> {
  if (await isSuperAdminId(actorUserId)) return true;
  return hasJurisdictionAuthority(actorUserId, "operations", "administer");
}

// The single write path for requirement state. Upserts on
// (onboarding_id, requirement_key) — the first real action on a
// catalog requirement creates its row; a later action updates it in
// place. Every call is one activity_log entry, so a requirement's
// history is always attributable, matching this project's universal
// audit convention (never a separate parallel audit table).
export async function updateOnboardingRequirement(params: {
  onboardingId: string;
  pipeline: OnboardingPipeline;
  requirementKey: string;
  status: RequirementStatus;
  actorUserId: string;
  digitalExecutionStatus?: string | null;
  physicalOriginalRequired?: boolean;
  physicalOriginalReceived?: boolean;
  evidenceReference?: string | null;
  notes?: string | null;
  verifiedNow?: boolean; // marks verifiedAt/verifiedBy = now/actor, for physical-document verification
}): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!(await canManageOnboardingRequirements(params.actorUserId))) {
    return { ok: false, error: "Not authorized to update onboarding requirements." };
  }

  const template = catalogForPipeline(params.pipeline).find((t) => t.requirementKey === params.requirementKey);
  if (!template) {
    return { ok: false, error: "Unknown onboarding requirement for this pipeline." };
  }

  const admin = createAdminClient();
  const now = new Date().toISOString();

  const { data: existing } = await admin
    .from("onboarding_requirements")
    .select("id, digital_execution_status, physical_original_received")
    .eq("onboarding_id", params.onboardingId)
    .eq("requirement_key", params.requirementKey)
    .maybeSingle();

  // TD-071, B1 fail-closed enforcement (E.5 Stage 2K) — this is the
  // authoritative write path, so the same rule applied for display
  // (applyConfiguredEvidenceStatus()) is re-applied here against
  // whatever is ACTUALLY submitted/on record, never trusting a
  // client-submitted "satisfied" at face value for a requirement whose
  // definition configures digital/physical execution. A manual
  // "waived"/"not_applicable" is a real human decision and is never
  // overridden.
  let effectiveStatus = params.status;
  if (
    (template.requiresDigitalExecution || template.requiresPhysicalExecution) &&
    params.status !== "waived" &&
    params.status !== "not_applicable"
  ) {
    const effectiveDigitalStatus = params.digitalExecutionStatus !== undefined ? params.digitalExecutionStatus : (existing?.digital_execution_status ?? null);
    const effectivePhysicalReceived = params.physicalOriginalReceived !== undefined ? params.physicalOriginalReceived : (existing?.physical_original_received ?? false);
    const digitalOk = !template.requiresDigitalExecution || effectiveDigitalStatus === "completed";
    const physicalOk = !template.requiresPhysicalExecution || effectivePhysicalReceived === true;
    effectiveStatus = digitalOk && physicalOk ? "satisfied" : "pending";
  }

  const isTerminalStatus = effectiveStatus === "satisfied" || effectiveStatus === "waived" || effectiveStatus === "not_applicable";

  const row: Record<string, unknown> = {
    onboarding_id: params.onboardingId,
    requirement_key: params.requirementKey,
    requirement_type: template.requirementType,
    stage: template.stage,
    required: template.required,
    responsible_role: template.responsibleRole ?? null,
    status: effectiveStatus,
    updated_at: now,
  };
  if (params.digitalExecutionStatus !== undefined) row.digital_execution_status = params.digitalExecutionStatus;
  if (params.physicalOriginalRequired !== undefined) row.physical_original_required = params.physicalOriginalRequired;
  if (params.physicalOriginalReceived !== undefined) row.physical_original_received = params.physicalOriginalReceived;
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

  const { error } = existing
    ? await admin.from("onboarding_requirements").update(row).eq("id", existing.id)
    : await admin.from("onboarding_requirements").insert({ ...row, created_by: params.actorUserId });

  if (error) {
    console.error("[organization] failed to update onboarding_requirements", error.message);
    return { ok: false, error: "Failed to update this requirement." };
  }

  const { data: onboarding } = await admin.from("staff_onboarding").select("profile_id").eq("id", params.onboardingId).maybeSingle();
  await logActivity({
    actorUserId: params.actorUserId,
    action: "onboarding_requirement.updated",
    entityType: "user",
    entityId: onboarding?.profile_id ?? params.onboardingId,
    metadata: { onboardingId: params.onboardingId, requirementKey: params.requirementKey, requestedStatus: params.status, effectiveStatus },
  });

  return { ok: true };
}
