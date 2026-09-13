import { createAdminClient } from "@/lib/supabase/admin";
import { authorizeWithSuperAdminOverride, GOVERNANCE_CAPABILITIES } from "@/lib/organization/authority";
import {
  WORKFORCE_RELATIONSHIPS,
  WORKFORCE_JURISDICTIONS,
  type WorkforceRelationship,
  type WorkforceJurisdiction,
  type RequirementDomain,
  type ClassificationResult,
  type ConflictingRuleRef,
} from "./requirementClassification";

// Ordift Studios Compliance/COMP-SYS-1, Phase A2 (2026-09-13) —
// requirement-audit PERSISTENCE FOUNDATION ONLY. Nothing exported from
// this file is called by any live onboarding/agreement/financial
// workflow yet — that wiring is a separate, later, separately
// authorized phase. These functions exist so a real evaluation, review
// resolution, or policy acknowledgement has somewhere durable and
// correctly-shaped to be recorded once a real caller is authorized.
//
// classification (what classifyRequirement() determined) and
// resolution (what an authorized reviewer subsequently decided about
// progression) are kept strictly separate — recordReviewResolution()
// never rewrites requirement_evaluations.classification, and no
// function in this file allows that.
//
// Pre-migration provenance checkpoint (same date): buildRequirementEvaluationRow()
// now also validates and persists ClassificationResult.outcome/reason/
// conflictingRules, mirroring the CHECK constraints added to migration
// 0083 — a matched_rule result must carry a complete rule snapshot, a
// fail-closed result must not, and only conflicting_rules carries
// competing-rule identities. This is application-level defense in depth;
// the database constraints remain the authoritative backstop.

function isKnownWorkforceRelationship(value: string): value is WorkforceRelationship {
  return (WORKFORCE_RELATIONSHIPS as readonly string[]).includes(value);
}

function isKnownWorkforceJurisdiction(value: string): value is WorkforceJurisdiction {
  return (WORKFORCE_JURISDICTIONS as readonly string[]).includes(value);
}

// ============================================================
// requirement_evaluations
// ============================================================

export interface RequirementEvaluationRow {
  subjectType: string;
  subjectReference: string;
  domain: RequirementDomain;
  relationship: WorkforceRelationship;
  jurisdiction: WorkforceJurisdiction;
  classification: ClassificationResult["classification"];
  outcome: ClassificationResult["outcome"];
  ruleKey: string | null;
  ruleVersion: number | null;
  ruleEffectiveFrom: string | null;
  reason: string;
  conflictingRules: ConflictingRuleRef[] | null;
  evaluatedBy: string | null;
}

export interface RecordRequirementEvaluationParams {
  subjectType: string;
  subjectReference: string;
  domain: RequirementDomain;
  relationship: WorkforceRelationship;
  jurisdiction: WorkforceJurisdiction;
  /** The exact, unmodified return value of classifyRequirement() — never hand-typed,
   * so the persisted ruleKey/ruleVersion/ruleEffectiveFrom can never drift from what
   * the resolver actually produced. */
  result: ClassificationResult;
  /** Profile id of the human actor in whose context this evaluation ran, or null for
   * a system-derived evaluation with no human actor in the loop. */
  evaluatedBy?: string | null;
}

export type RecordRequirementEvaluationResult = { ok: true; evaluationId: string } | { ok: false; error: string };

/** Pure — builds the exact row this function will persist, without touching the
 * database. Exported so the shaping logic (in particular: that outcome/ruleKey/
 * ruleVersion/ruleEffectiveFrom/reason/conflictingRules are copied verbatim from
 * the resolver's own result, never re-derived or fabricated) can be unit-tested
 * without a live database connection.
 *
 * Mirrors the migration's own CHECK constraints as an early, clearer-error
 * defense-in-depth layer — the database remains the authoritative backstop
 * (per the pre-migration checkpoint's explicit instruction not to rely solely
 * on TypeScript validation), but a caller gets a specific application-level
 * error here rather than a raw constraint-violation from Postgres. */
export function buildRequirementEvaluationRow(params: RecordRequirementEvaluationParams): RequirementEvaluationRow | { ok: false; error: string } {
  if (!params.subjectType.trim()) return { ok: false, error: "subjectType is required." };
  if (!params.subjectReference.trim()) return { ok: false, error: "subjectReference is required." };
  if (!params.domain.trim()) return { ok: false, error: "domain is required." };
  if (!isKnownWorkforceRelationship(params.relationship)) {
    return { ok: false, error: `Unknown workforce relationship: "${params.relationship}".` };
  }
  if (!isKnownWorkforceJurisdiction(params.jurisdiction)) {
    return { ok: false, error: `Unknown workforce jurisdiction: "${params.jurisdiction}".` };
  }

  const { result } = params;
  const hasCompleteRuleSnapshot = result.ruleKey !== null && result.ruleVersion !== null && result.effectiveFrom !== null;
  const hasAnyRuleSnapshot = result.ruleKey !== null || result.ruleVersion !== null || result.effectiveFrom !== null;

  if (result.outcome === "matched_rule") {
    if (!hasCompleteRuleSnapshot) {
      return { ok: false, error: "A matched_rule result must carry a complete ruleKey/ruleVersion/effectiveFrom snapshot." };
    }
  } else {
    if (hasAnyRuleSnapshot) {
      return { ok: false, error: `A fail-closed outcome ("${result.outcome}") must not carry a rule identity — it would fabricate provenance.` };
    }
    if (result.classification !== "REVIEW_REQUIRED") {
      return { ok: false, error: `A fail-closed outcome ("${result.outcome}") must resolve to REVIEW_REQUIRED, not "${result.classification}".` };
    }
  }
  if (result.outcome === "conflicting_rules" && (!result.conflictingRules || result.conflictingRules.length === 0)) {
    return { ok: false, error: "A conflicting_rules outcome must carry the competing rules' identities." };
  }
  if (result.outcome !== "conflicting_rules" && result.conflictingRules) {
    return { ok: false, error: `conflictingRules must only be present for outcome "conflicting_rules", not "${result.outcome}".` };
  }

  return {
    subjectType: params.subjectType,
    subjectReference: params.subjectReference,
    domain: params.domain,
    relationship: params.relationship,
    jurisdiction: params.jurisdiction,
    classification: result.classification,
    outcome: result.outcome,
    ruleKey: result.ruleKey,
    ruleVersion: result.ruleVersion,
    ruleEffectiveFrom: result.effectiveFrom,
    reason: result.reason,
    conflictingRules: result.conflictingRules ?? null,
    evaluatedBy: params.evaluatedBy ?? null,
  };
}

// DB-dependent — verified by code reading (this codebase's established
// convention for this exact class of function; see
// src/lib/legal/employeeAgreements.test.ts). Persists exactly the row
// buildRequirementEvaluationRow() shapes; makes zero writes if shaping
// fails validation.
export async function recordRequirementEvaluation(params: RecordRequirementEvaluationParams): Promise<RecordRequirementEvaluationResult> {
  const row = buildRequirementEvaluationRow(params);
  if ("ok" in row) return row;

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("requirement_evaluations")
    .insert({
      subject_type: row.subjectType,
      subject_reference: row.subjectReference,
      domain: row.domain,
      relationship: row.relationship,
      jurisdiction: row.jurisdiction,
      classification: row.classification,
      outcome: row.outcome,
      rule_key: row.ruleKey,
      rule_version: row.ruleVersion,
      rule_effective_from: row.ruleEffectiveFrom,
      reason: row.reason,
      conflicting_rules: row.conflictingRules,
      evaluated_by: row.evaluatedBy,
    })
    .select("id")
    .single();
  if (error || !data) return { ok: false, error: error?.message ?? "Failed to record the requirement evaluation." };
  return { ok: true, evaluationId: data.id };
}

// ============================================================
// requirement_review_resolutions
// ============================================================

export const REVIEW_RESOLUTION_OUTCOMES = ["approved_to_proceed", "blocked", "escalated"] as const;
export type ReviewResolutionOutcome = (typeof REVIEW_RESOLUTION_OUTCOMES)[number];

export function isValidReviewResolutionOutcome(value: string): value is ReviewResolutionOutcome {
  return (REVIEW_RESOLUTION_OUTCOMES as readonly string[]).includes(value);
}

export interface RecordReviewResolutionParams {
  evaluationId: string;
  resolution: string;
  resolvedBy: string;
  notes?: string | null;
  actorUserId: string;
}

export type RecordReviewResolutionResult = { ok: true; resolutionId: string } | { ok: false; error: string };

// governance.compliance.track is DORMANT (zero authority_grants rows
// exist for it in Production) — only Super Admin can pass today via
// authorizeWithSuperAdminOverride(), same posture as
// governance.contract.administer in agreementEngine.ts. This is an
// EXISTING capability (src/lib/organization/authority.ts,
// GOVERNANCE_CAPABILITIES.complianceTrack) — nothing new is invented
// here.
async function requireComplianceTrack(actorUserId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const auth = await authorizeWithSuperAdminOverride(actorUserId, GOVERNANCE_CAPABILITIES.complianceTrack);
  if (!auth.ok) return { ok: false, error: "Not authorized to record a compliance review resolution." };
  return { ok: true };
}

// DB-dependent — verified by code reading. Never updates the
// referenced requirement_evaluations row (no such call exists anywhere
// in this function or this file); always inserts a new, separate
// requirement_review_resolutions row. Confirms the referenced
// evaluation actually exists before inserting, so a bad evaluationId
// fails with a clear application-level error rather than a raw FK
// violation.
export async function recordReviewResolution(params: RecordReviewResolutionParams): Promise<RecordReviewResolutionResult> {
  // Cheap, pure format checks run first — no DB round trip is spent
  // validating input that is malformed regardless of who is asking.
  // This does not weaken the authorization guarantee: no DB WRITE
  // happens until requireComplianceTrack() below also passes.
  if (!isValidReviewResolutionOutcome(params.resolution)) {
    return { ok: false, error: `Unknown review resolution outcome: "${params.resolution}".` };
  }
  if (!params.evaluationId.trim()) return { ok: false, error: "evaluationId is required." };
  if (!params.resolvedBy.trim()) return { ok: false, error: "resolvedBy is required — a review resolution must always name a specific accountable person." };

  const auth = await requireComplianceTrack(params.actorUserId);
  if (!auth.ok) return auth;

  const admin = createAdminClient();
  const { data: evaluation } = await admin.from("requirement_evaluations").select("id").eq("id", params.evaluationId).maybeSingle();
  if (!evaluation) return { ok: false, error: "Referenced requirement evaluation was not found." };

  const { data, error } = await admin
    .from("requirement_review_resolutions")
    .insert({
      evaluation_id: params.evaluationId,
      resolution: params.resolution,
      resolved_by: params.resolvedBy,
      notes: params.notes ?? null,
    })
    .select("id")
    .single();
  if (error || !data) return { ok: false, error: error?.message ?? "Failed to record the review resolution." };
  return { ok: true, resolutionId: data.id };
}

// ============================================================
// policy_acknowledgements
// ============================================================

export interface RecordPolicyAcknowledgementParams {
  policyVersionId: string;
  profileId: string;
  relationship: WorkforceRelationship;
  jurisdiction: WorkforceJurisdiction;
  presentedAt: string;
  acknowledgedAt: string;
  acknowledgementMethod: string;
  evidenceReference?: string | null;
}

export type RecordPolicyAcknowledgementResult = { ok: true; acknowledgementId: string } | { ok: false; error: string };

// DB-dependent — verified by code reading. Confirms policyVersionId
// resolves to a real legal_document_versions row before inserting —
// an acknowledgement must always reference an actual controlled
// version, never a bare/unversioned master. Stores no policy text: the
// row this inserts has no content-bearing column at all (see the
// RequirementEvaluationRow-style shape below and migration
// 0083_requirement_audit_foundation.sql).
export async function recordPolicyAcknowledgement(params: RecordPolicyAcknowledgementParams): Promise<RecordPolicyAcknowledgementResult> {
  if (!isKnownWorkforceRelationship(params.relationship)) {
    return { ok: false, error: `Unknown workforce relationship: "${params.relationship}".` };
  }
  if (!isKnownWorkforceJurisdiction(params.jurisdiction)) {
    return { ok: false, error: `Unknown workforce jurisdiction: "${params.jurisdiction}".` };
  }
  if (!params.acknowledgementMethod.trim()) return { ok: false, error: "acknowledgementMethod is required." };

  const admin = createAdminClient();
  const { data: version } = await admin.from("legal_document_versions").select("id").eq("id", params.policyVersionId).maybeSingle();
  if (!version) return { ok: false, error: "Referenced legal document version was not found." };

  const { data, error } = await admin
    .from("policy_acknowledgements")
    .insert({
      policy_version_id: params.policyVersionId,
      profile_id: params.profileId,
      relationship: params.relationship,
      jurisdiction: params.jurisdiction,
      presented_at: params.presentedAt,
      acknowledged_at: params.acknowledgedAt,
      acknowledgement_method: params.acknowledgementMethod,
      evidence_reference: params.evidenceReference ?? null,
    })
    .select("id")
    .single();
  if (error || !data) return { ok: false, error: error?.message ?? "Failed to record the policy acknowledgement." };
  return { ok: true, acknowledgementId: data.id };
}
