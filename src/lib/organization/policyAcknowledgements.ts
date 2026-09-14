import { createAdminClient } from "@/lib/supabase/admin";
import { logActivity } from "@/lib/admin/activityLog";
import { isSuperAdminId, hasJurisdictionAuthority } from "@/lib/organization/authority";
import { recordPolicyAcknowledgement as insertPolicyAcknowledgementRow } from "@/lib/compliance/requirementAudit";
import { mapEngagementTypeSlugToWorkforceRelationship, mapEmploymentJurisdictionToWorkforceJurisdiction } from "@/lib/compliance/workforceMappings";
import type { WorkforceRelationship, WorkforceJurisdiction } from "@/lib/compliance/requirementClassification";

// Ordift Studios Compliance/COMP-SYS-1, Phase B5 Step 12 (2026-09-14) —
// Controlled Policy / Acknowledgement UI. The policy_acknowledgements
// table and its insert primitive (recordPolicyAcknowledgement,
// requirementAudit.ts) already existed, purpose-built in an earlier
// phase (migration 0083_requirement_audit_foundation.sql) explicitly
// "pending a real acknowledgement UX" — this module is that UX's
// backend wiring, not a new table. (An initial draft of this module
// mistakenly proposed a competing new table before this was
// discovered; that migration was deleted before ever being applied to
// Production — see git history for this file's first commit.)
//
// References legal_document_masters/legal_document_versions (migration
// 0067) for the document catalog, and resolves relationship/jurisdiction
// from the person's real requisition data the same way
// employeeAgreements.ts does — never invented, never defaulted.

export async function canManagePolicyAcknowledgements(actorUserId: string): Promise<boolean> {
  if (await isSuperAdminId(actorUserId)) return true;
  return hasJurisdictionAuthority(actorUserId, "operations", "administer");
}

export interface ControlledPolicyDocument {
  masterId: string;
  canonicalCode: string;
  title: string;
  documentVersionId: string;
  version: string;
}

// Every currently-active internal_governance document — deliberately
// not hard-coded to a specific list of canonical codes (e.g. only
// OS-HR-GH-002 through 006), so a newly-registered controlled policy
// becomes acknowledgeable automatically rather than requiring a code
// change here.
export async function listControlledPolicyDocuments(): Promise<ControlledPolicyDocument[]> {
  const admin = createAdminClient();
  const { data: masters, error: mastersError } = await admin
    .from("legal_document_masters")
    .select("id, canonical_code, title, current_version_id")
    .eq("classification", "internal_governance")
    .not("current_version_id", "is", null)
    .order("canonical_code", { ascending: true });
  if (mastersError) {
    console.error("[organization] failed to load legal_document_masters", mastersError.message);
    return [];
  }
  const versionIds = (masters ?? []).map((m) => m.current_version_id).filter((id): id is string => id !== null);
  if (versionIds.length === 0) return [];

  const { data: versions, error: versionsError } = await admin.from("legal_document_versions").select("id, version, status").in("id", versionIds);
  if (versionsError) {
    console.error("[organization] failed to load legal_document_versions", versionsError.message);
    return [];
  }
  const versionById = new Map((versions ?? []).map((v) => [v.id, v]));

  return (masters ?? [])
    .filter((m) => m.current_version_id && versionById.get(m.current_version_id)?.status === "active")
    .map((m) => ({
      masterId: m.id,
      canonicalCode: m.canonical_code,
      title: m.title,
      documentVersionId: m.current_version_id as string,
      version: versionById.get(m.current_version_id as string)!.version,
    }));
}

// Resolves the SAME two real facts (engagement type -> WorkforceRelationship,
// employment jurisdiction -> WorkforceJurisdiction) that
// employeeAgreements.ts resolves for agreement drafting — via the
// person's onboarding -> requisition, never invented or defaulted.
// Returns null for either field the data genuinely doesn't support,
// matching workforceMappings.ts's fail-closed contract.
async function resolveWorkforceContextForProfile(profileId: string): Promise<{ relationship: WorkforceRelationship; jurisdiction: WorkforceJurisdiction } | { error: string }> {
  const admin = createAdminClient();
  const { data: onboarding } = await admin.from("staff_onboarding").select("requisition_id").eq("profile_id", profileId).maybeSingle();
  if (!onboarding) return { error: "No onboarding record on file for this person." };
  if (!onboarding.requisition_id) return { error: "This person's onboarding has no linked requisition — relationship/jurisdiction cannot be resolved." };

  const { data: requisition } = await admin
    .from("recruitment_requisitions")
    .select("engagement_type_id, employment_jurisdiction_id")
    .eq("id", onboarding.requisition_id)
    .maybeSingle();
  if (!requisition) return { error: "Linked requisition not found." };

  const [engagementType, jurisdiction] = await Promise.all([
    requisition.engagement_type_id ? admin.from("engagement_types").select("slug").eq("id", requisition.engagement_type_id).maybeSingle() : Promise.resolve(null),
    requisition.employment_jurisdiction_id ? admin.from("employment_jurisdictions").select("name").eq("id", requisition.employment_jurisdiction_id).maybeSingle() : Promise.resolve(null),
  ]);

  const relationship = mapEngagementTypeSlugToWorkforceRelationship(engagementType?.data?.slug ?? null);
  if (!relationship) return { error: "This person's workforce relationship is not yet recognized by the compliance system." };

  const workforceJurisdiction = mapEmploymentJurisdictionToWorkforceJurisdiction(jurisdiction?.data?.name ?? null);
  if (!workforceJurisdiction) return { error: "This person's employment jurisdiction is not yet recognized by the compliance system." };

  return { relationship, jurisdiction: workforceJurisdiction };
}

export type PolicyAcknowledgementMethod = "digital_click_through" | "physical_signature";

// Self-acknowledgement is normal (a person acknowledging their own
// reading of a policy has no special authorization requirement);
// recording on someone else's behalf (e.g. transcribing a physical
// signature captured at onboarding) requires Super Admin or
// operations.administer — same self-or-admin pattern as
// acknowledgeAssetAssignment(). presentedAt/acknowledgedAt are both the
// moment of this call — this module has no "presented earlier, signed
// later" workflow yet.
export async function recordPolicyAcknowledgement(params: {
  profileId: string;
  documentVersionId: string;
  method: PolicyAcknowledgementMethod;
  evidenceReference?: string | null;
  actorUserId: string;
}): Promise<{ ok: true; acknowledgementId: string } | { ok: false; error: string }> {
  const isSelf = params.actorUserId === params.profileId;
  if (!isSelf && !(await canManagePolicyAcknowledgements(params.actorUserId))) {
    return { ok: false, error: "Not authorized to record a policy acknowledgement on behalf of another person." };
  }
  if (params.method === "physical_signature" && !params.evidenceReference?.trim()) {
    return { ok: false, error: "A physical signature acknowledgement requires an evidence reference (where the scanned document is filed)." };
  }

  const context = await resolveWorkforceContextForProfile(params.profileId);
  if ("error" in context) return { ok: false, error: context.error };

  const now = new Date().toISOString();
  const result = await insertPolicyAcknowledgementRow({
    policyVersionId: params.documentVersionId,
    profileId: params.profileId,
    relationship: context.relationship,
    jurisdiction: context.jurisdiction,
    presentedAt: now,
    acknowledgedAt: now,
    acknowledgementMethod: params.method,
    evidenceReference: params.evidenceReference ?? null,
  });
  if (!result.ok) return result;

  await logActivity({ actorUserId: params.actorUserId, action: "policy_acknowledgement.recorded", entityType: "user", entityId: params.profileId, metadata: { acknowledgementId: result.acknowledgementId, documentVersionId: params.documentVersionId } });
  return { ok: true, acknowledgementId: result.acknowledgementId };
}

export async function listPolicyAcknowledgementsForProfile(profileId: string): Promise<
  { id: string; policyVersionId: string; acknowledgedAt: string; acknowledgementMethod: string }[]
> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("policy_acknowledgements")
    .select("id, policy_version_id, acknowledged_at, acknowledgement_method")
    .eq("profile_id", profileId)
    .order("acknowledged_at", { ascending: false });
  if (error) {
    console.error("[organization] failed to load policy_acknowledgements", error.message);
    return [];
  }
  return (data ?? []).map((r) => ({ id: r.id, policyVersionId: r.policy_version_id, acknowledgedAt: r.acknowledged_at, acknowledgementMethod: r.acknowledgement_method }));
}
