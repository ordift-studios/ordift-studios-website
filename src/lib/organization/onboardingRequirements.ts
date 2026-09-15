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

// "deferred" (2026-09-15, controlled onboarding override) is
// deliberately distinct from "waived": a waiver is a real human
// decision that the requirement doesn't apply at all; a deferral is an
// authorized, temporary permission to let onboarding progress while
// the underlying requirement is genuinely still outstanding and must
// still be completed when practicable. Never set directly through
// updateOnboardingRequirement()'s generic manual dropdown — reachable
// only through authorizeOnboardingRequirementOverride() below, which
// requires a reason and writes a permanent, structured audit record
// (onboarding_requirement_overrides, migration 0117).
export const REQUIREMENT_STATUSES = ["pending", "satisfied", "waived", "not_applicable", "deferred"] as const;
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
    if (row) return row.status !== "satisfied" && row.status !== "waived" && row.status !== "not_applicable" && row.status !== "deferred";
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
    if (row.status === "waived" || row.status === "not_applicable" || row.status === "deferred") continue;
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
    const derived = derivedByKey.get(template.requirementKey) ?? null;
    // A "deferred" row is a temporary administrative permission, not a
    // human decision like "waived" — genuine derived evidence (e.g. the
    // employee's own real signature completing) always supersedes a
    // stale deferral the moment it exists, so the display never keeps
    // showing "deferred" once the real requirement is actually
    // satisfied. "waived"/"not_applicable" are real human decisions and
    // are never overridden this way (unchanged from existing behavior).
    const status: RequirementStatus = row?.status === "deferred" && derived === "satisfied" ? "satisfied" : (row?.status ?? derived ?? "pending");
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

// ============================================================
// Controlled onboarding requirement override/deferral (2026-09-15)
// ============================================================
// Real example: Mishael Adjei's ORD-AGR-2026-000004 is genuinely
// "sent" for signature but he cannot presently complete it himself.
// This is NOT satisfaction of employment_agreement_executed — that
// remains governed solely by deriveEmploymentAgreementExecuted()
// (employeeAgreements.ts), reading the real agreement lifecycle — and
// never by anything in this section. This only records a controlled,
// reason-required, permanently-audited administrative permission to
// let onboarding progress with the requirement still genuinely
// outstanding, matching every other onboarding_requirements status
// change in one respect (an activity_log entry) but going further:
// onboarding_requirement_overrides (migration 0117) is a dedicated,
// append-only, richly-structured record — who authorized it, why, what
// the real status was at that moment, and (later) how it was genuinely
// resolved — because a bare status/notes column can't hold that
// structure or guarantee it's never silently overwritten.

export type OnboardingRequirementOverrideRow = {
  id: string;
  onboardingId: string;
  requirementKey: string;
  agreementId: string | null;
  originalStatus: RequirementStatus;
  reason: string;
  authorizedBy: string;
  authorizedAt: string;
  onboardingTreatment: string;
  followUpRequired: boolean;
  resolvedAt: string | null;
  resolutionNote: string | null;
  createdAt: string;
};

function mapOverrideRow(r: {
  id: string;
  onboarding_id: string;
  requirement_key: string;
  agreement_id: string | null;
  original_status: string;
  reason: string;
  authorized_by: string;
  authorized_at: string;
  onboarding_treatment: string;
  follow_up_required: boolean;
  resolved_at: string | null;
  resolution_note: string | null;
  created_at: string;
}): OnboardingRequirementOverrideRow {
  return {
    id: r.id,
    onboardingId: r.onboarding_id,
    requirementKey: r.requirement_key,
    agreementId: r.agreement_id,
    originalStatus: r.original_status as RequirementStatus,
    reason: r.reason,
    authorizedBy: r.authorized_by,
    authorizedAt: r.authorized_at,
    onboardingTreatment: r.onboarding_treatment,
    followUpRequired: r.follow_up_required,
    resolvedAt: r.resolved_at,
    resolutionNote: r.resolution_note,
    createdAt: r.created_at,
  };
}

const OVERRIDE_SELECT =
  "id, onboarding_id, requirement_key, agreement_id, original_status, reason, authorized_by, authorized_at, onboarding_treatment, follow_up_required, resolved_at, resolution_note, created_at";

// Full override history for an onboarding record — including already-
// resolved overrides, never hidden once resolved, so the Onboarding
// Workspace can show both the historical authorization and (once it
// exists) its later genuine resolution together, per the explicit
// requirement to preserve both.
export async function listOnboardingRequirementOverrides(onboardingId: string): Promise<OnboardingRequirementOverrideRow[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("onboarding_requirement_overrides")
    .select(OVERRIDE_SELECT)
    .eq("onboarding_id", onboardingId)
    .order("authorized_at", { ascending: false });
  if (error) {
    console.error("[organization] failed to load onboarding_requirement_overrides", error.message);
    return [];
  }
  return (data ?? []).map(mapOverrideRow);
}

// Delegation hook (explicit instruction: inspect the existing
// authority model before hard-coding role strings). "people" is
// authority.ts's existing HR jurisdiction (already used by
// actingAssignments.ts's "people.administer"); "override" is one of
// AUTHORITY_VERBS. "people.override" lets a future delegated HR
// authority grant reach this specific action without any code change
// here — today, in Production, zero non-Super-Admin holds it, so Super
// Admin remains the only actor who can pass, exactly matching every
// other capability-gated function in this Legal/Onboarding suite.
async function canAuthorizeOnboardingOverride(actorUserId: string): Promise<boolean> {
  if (await isSuperAdminId(actorUserId)) return true;
  return hasJurisdictionAuthority(actorUserId, "people", "override");
}

// The single write path for authorizing a controlled deferral. Never
// callable to reach "satisfied" (that would just be
// updateOnboardingRequirement() under a different name) — only ever
// transitions a requirement INTO "deferred", from whatever its real,
// freshly-resolved status actually is right now (never trusting a
// client-submitted "original status").
export async function authorizeOnboardingRequirementOverride(params: {
  onboardingId: string;
  pipeline: OnboardingPipeline;
  requirementKey: string;
  agreementId?: string | null;
  reason: string;
  actorUserId: string;
}): Promise<{ ok: true; overrideId: string } | { ok: false; error: string }> {
  if (!(await canAuthorizeOnboardingOverride(params.actorUserId))) {
    return { ok: false, error: "Not authorized to authorize an onboarding requirement override." };
  }
  const reason = params.reason.trim();
  if (!reason) {
    return { ok: false, error: "A reason is required to authorize this override." };
  }

  const template = catalogForPipeline(params.pipeline).find((t) => t.requirementKey === params.requirementKey);
  if (!template) {
    return { ok: false, error: "Unknown onboarding requirement for this pipeline." };
  }

  const admin = createAdminClient();
  const { data: onboarding } = await admin.from("staff_onboarding").select("id, profile_id").eq("id", params.onboardingId).maybeSingle();
  if (!onboarding) return { ok: false, error: "Onboarding record not found." };

  // The TRUE current status, from the same resolver the workspace
  // itself reads — never a client-submitted claim.
  const resolved = await listResolvedRequirements({ onboardingId: params.onboardingId, profileId: onboarding.profile_id, pipeline: params.pipeline });
  const current = resolved.find((r) => r.requirementKey === params.requirementKey);
  if (!current) return { ok: false, error: "Unable to resolve this requirement's current status." };
  if (current.status === "satisfied") {
    return { ok: false, error: "This requirement is already genuinely satisfied — no override is needed or permitted." };
  }
  if (current.status === "deferred") {
    return { ok: false, error: "This requirement already has an active administrative deferral." };
  }

  const now = new Date().toISOString();
  const { data: override, error: overrideError } = await admin
    .from("onboarding_requirement_overrides")
    .insert({
      onboarding_id: params.onboardingId,
      requirement_key: params.requirementKey,
      agreement_id: params.agreementId ?? null,
      original_status: current.status,
      reason,
      authorized_by: params.actorUserId,
      authorized_at: now,
      onboarding_treatment: "progression_authorized",
      follow_up_required: true,
      created_by: params.actorUserId,
    })
    .select("id")
    .single();
  if (overrideError || !override) {
    console.error("[organization] failed to record onboarding requirement override", overrideError?.message);
    return { ok: false, error: "Failed to record this override." };
  }

  const updateResult = await updateOnboardingRequirement({
    onboardingId: params.onboardingId,
    pipeline: params.pipeline,
    requirementKey: params.requirementKey,
    status: "deferred",
    actorUserId: params.actorUserId,
    notes: `Administratively deferred (override ${override.id}): ${reason}`,
  });
  if (!updateResult.ok) return { ok: false, error: updateResult.error };

  await logActivity({
    actorUserId: params.actorUserId,
    action: "onboarding_requirement.override_authorized",
    entityType: "user",
    entityId: onboarding.profile_id,
    metadata: { onboardingId: params.onboardingId, requirementKey: params.requirementKey, agreementId: params.agreementId ?? null, overrideId: override.id, reason },
  });

  return { ok: true, overrideId: override.id };
}

// Resolution hook, called by the REAL completion event — not a
// generic admin action. signatureEngine.ts's recordSignatorySignature()
// calls this (best-effort, never able to block or undo the genuine
// signature it just recorded) immediately after an agreement
// genuinely transitions to fully_executed, so a previously deferred
// employment_agreement_executed requirement is promptly and durably
// marked resolved rather than relying solely on the read-time
// "deferred + derived satisfied => satisfied" correction in
// listResolvedRequirements() above (that correction keeps the display
// honest even if this hook is never reached; this hook is what makes
// the resolution a permanent, timestamped fact instead of only a
// live computation). Resolves every still-open override recorded
// against this specific agreement — today that's just
// employment_agreement_executed, never more than one real row in
// practice, but this is not hardcoded to that single key.
export async function resolveDeferredRequirementsForAgreement(params: { agreementId: string }): Promise<void> {
  const admin = createAdminClient();
  const { data: overrides } = await admin
    .from("onboarding_requirement_overrides")
    .select("id, onboarding_id, requirement_key")
    .eq("agreement_id", params.agreementId)
    .is("resolved_at", null);
  if (!overrides || overrides.length === 0) return;

  const now = new Date().toISOString();
  for (const override of overrides) {
    const { data: row } = await admin
      .from("onboarding_requirements")
      .select("id, status")
      .eq("onboarding_id", override.onboarding_id)
      .eq("requirement_key", override.requirement_key)
      .maybeSingle();
    // Only resolve what is still genuinely deferred — if it's already
    // "satisfied" some other way, or was reset back to "pending",
    // there is nothing for this hook to do.
    if (!row || row.status !== "deferred") continue;

    const { error: rowError } = await admin
      .from("onboarding_requirements")
      .update({ status: "satisfied", updated_at: now, completed_at: now, completed_by: null })
      .eq("id", row.id);
    if (rowError) {
      console.error("[organization] failed to resolve deferred onboarding_requirements row", rowError.message);
      continue;
    }

    const { error: overrideError } = await admin
      .from("onboarding_requirement_overrides")
      .update({ resolved_at: now, resolution_note: "Resolved by genuine employee signature completion." })
      .eq("id", override.id);
    if (overrideError) {
      console.error("[organization] failed to mark onboarding_requirement_override resolved", overrideError.message);
    }

    const { data: onboarding } = await admin.from("staff_onboarding").select("profile_id").eq("id", override.onboarding_id).maybeSingle();
    await logActivity({
      actorUserId: null,
      action: "onboarding_requirement.deferred_override_resolved",
      entityType: "user",
      entityId: onboarding?.profile_id ?? override.onboarding_id,
      metadata: { onboardingId: override.onboarding_id, requirementKey: override.requirement_key, agreementId: params.agreementId, overrideId: override.id },
    });
  }
}
