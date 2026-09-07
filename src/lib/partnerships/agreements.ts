import { createAdminClient } from "@/lib/supabase/admin";
import { authorizeWithSuperAdminOverride, STRATEGY_CAPABILITIES } from "@/lib/organization/authority";
import { logActivity } from "@/lib/admin/activityLog";
import type { PartnershipUsageRights } from "./rightsGovernance";

// Ordift Partnerships & Collaborations V1 (2026-09-07) — the governed
// agreement/acceptance stage. APPEND-ONLY: an amendment is always a
// new row (supersedes_id chains to the version it replaces), never an
// in-place edit. acceptance_recorded_at/acceptance_method/
// signature_reference are only ever written by createAgreementVersion()
// itself when the caller explicitly supplies them — they are NEVER
// defaulted to "now"/"accepted" automatically, so client/partner
// acceptance can never be fabricated by merely creating a draft.

export type PartnershipAgreementStatus = "draft" | "sent" | "signed" | "active" | "amended" | "terminated";

export type PartnershipExclusivityTerms = { category: string; territory: string; startDate: string; endDate: string | null; scope: string };

export type PartnershipAgreementTerms = {
  parties: string;
  scope: string;
  deliverables: string;
  directCostResponsibility: string;
  rights: PartnershipUsageRights;
  ipNotes: string;
  exclusivity: PartnershipExclusivityTerms | null;
  revisionsApprovals: string;
  timeline: string;
  cancellationTerms: string;
  credits: string;
  confidentiality: string;
  referralTerms: string | null;
  approvalAuthority: string;
};

export type PartnershipAgreement = {
  id: string;
  opportunityId: string;
  valueAssessmentId: string | null;
  status: PartnershipAgreementStatus;
  termsSnapshot: Partial<PartnershipAgreementTerms>;
  acceptanceRecordedAt: string | null;
  acceptanceMethod: string | null;
  signatureReference: string | null;
  supersedesId: string | null;
  createdAt: string;
};

async function authorize(actorUserId: string) {
  return authorizeWithSuperAdminOverride(actorUserId, STRATEGY_CAPABILITIES.partnershipOpportunityAdminister);
}

const STATUSES: PartnershipAgreementStatus[] = ["draft", "sent", "signed", "active", "amended", "terminated"];
const SELECT = "id, opportunity_id, value_assessment_id, status, terms_snapshot, acceptance_recorded_at, acceptance_method, signature_reference, supersedes_id, created_at";

function mapRow(a: Record<string, unknown>): PartnershipAgreement {
  return {
    id: a.id as string,
    opportunityId: a.opportunity_id as string,
    valueAssessmentId: a.value_assessment_id as string | null,
    status: a.status as PartnershipAgreementStatus,
    termsSnapshot: (a.terms_snapshot as Partial<PartnershipAgreementTerms>) ?? {},
    acceptanceRecordedAt: a.acceptance_recorded_at as string | null,
    acceptanceMethod: a.acceptance_method as string | null,
    signatureReference: a.signature_reference as string | null,
    supersedesId: a.supersedes_id as string | null,
    createdAt: a.created_at as string,
  };
}

export async function getLatestAgreement(actorUserId: string, opportunityId: string): Promise<PartnershipAgreement | null> {
  const auth = await authorize(actorUserId);
  if (!auth.ok) return null;

  const admin = createAdminClient();
  const { data, error } = await admin.from("partnership_agreements").select(SELECT).eq("opportunity_id", opportunityId).order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (error) {
    console.error("[partnerships] failed to load latest agreement", error.message);
    return null;
  }
  return data ? mapRow(data) : null;
}

export async function listAgreementHistory(actorUserId: string, opportunityId: string): Promise<PartnershipAgreement[]> {
  const auth = await authorize(actorUserId);
  if (!auth.ok) return [];

  const admin = createAdminClient();
  const { data, error } = await admin.from("partnership_agreements").select(SELECT).eq("opportunity_id", opportunityId).order("created_at", { ascending: false });
  if (error) {
    console.error("[partnerships] failed to load agreement history", error.message);
    return [];
  }
  return (data ?? []).map(mapRow);
}

export async function createAgreementVersion(params: {
  opportunityId: string;
  valueAssessmentId?: string | null;
  status: PartnershipAgreementStatus;
  termsSnapshot: Partial<PartnershipAgreementTerms>;
  acceptanceRecordedAt?: string | null;
  acceptanceMethod?: string | null;
  signatureReference?: string | null;
  actorUserId: string;
}): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const auth = await authorize(params.actorUserId);
  if (!auth.ok) return { ok: false, error: "Not authorized to manage partnership agreements." };
  if (!STATUSES.includes(params.status)) return { ok: false, error: "Unknown agreement status." };

  const admin = createAdminClient();
  const { data: previous } = await admin.from("partnership_agreements").select("id").eq("opportunity_id", params.opportunityId).order("created_at", { ascending: false }).limit(1).maybeSingle();

  const { data, error } = await admin
    .from("partnership_agreements")
    .insert({
      opportunity_id: params.opportunityId,
      value_assessment_id: params.valueAssessmentId ?? null,
      status: params.status,
      terms_snapshot: params.termsSnapshot,
      acceptance_recorded_at: params.acceptanceRecordedAt ?? null,
      acceptance_method: params.acceptanceMethod ?? null,
      signature_reference: params.signatureReference ?? null,
      supersedes_id: previous?.id ?? null,
      created_by: params.actorUserId,
    })
    .select("id")
    .maybeSingle();
  if (error || !data) {
    console.error("[partnerships] failed to create agreement version", error?.message);
    return { ok: false, error: "Failed to save the agreement." };
  }

  await logActivity({ actorUserId: params.actorUserId, action: "partnerships.agreement.created", entityType: "partnership_agreement", entityId: data.id, metadata: { opportunityId: params.opportunityId, status: params.status, supersedesId: previous?.id ?? null } });
  return { ok: true, id: data.id };
}
