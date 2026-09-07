import { createAdminClient } from "@/lib/supabase/admin";
import { authorizeWithSuperAdminOverride, isSuperAdminId, STRATEGY_CAPABILITIES } from "@/lib/organization/authority";
import { logActivity } from "@/lib/admin/activityLog";
import { commissionRequiresDocumentedReason, commissionRequiresFounderApproval, durationRequiresFounderApproval, DEFAULT_ATTRIBUTION_WINDOW_DAYS, type ReferralDurationPreset } from "./referralMath";
import { assessReferralEligibility, type ReferralEligibilityFlags } from "./referralEligibility";

// Ordift Partnerships & Collaborations V1 (2026-09-07) — referral
// commission-term records (APPEND-ONLY, same versioning pattern as
// value assessments) and the introduced-prospect (lead) records that
// track attribution/anti-gaming per referral relationship.

export type PartnershipReferral = {
  id: string;
  opportunityId: string;
  commissionPercentage: number;
  durationPreset: ReferralDurationPreset;
  customDurationMonths: number | null;
  attributionWindowDays: number;
  reasonForElevatedRate: string | null;
  requiresFounderApproval: boolean;
  approvalStatus: "pending" | "approved" | "rejected";
  approvedBy: string | null;
  approvedAt: string | null;
  supersedesId: string | null;
  createdAt: string;
};

export type PartnershipReferralLead = {
  id: string;
  referralId: string;
  prospectName: string;
  prospectEmail: string | null;
  prospectReference: string | null;
  introducedAt: string;
  referenceType: string | null;
  referenceId: string | null;
  eligibilityStatus: "eligible" | "ineligible" | "under_review";
  ineligibilityReasons: string[];
  relatedPartyDisclosed: boolean;
  attributionExpiresAt: string | null;
  status: "attributed" | "expired" | "converted" | "disputed";
  disputeNotes: string | null;
  createdAt: string;
};

async function authorize(actorUserId: string) {
  return authorizeWithSuperAdminOverride(actorUserId, STRATEGY_CAPABILITIES.partnershipReferralAdminister);
}

const REFERRAL_SELECT = "id, opportunity_id, commission_percentage, duration_preset, custom_duration_months, attribution_window_days, reason_for_elevated_rate, requires_founder_approval, approval_status, approved_by, approved_at, supersedes_id, created_at";

function mapReferralRow(r: Record<string, unknown>): PartnershipReferral {
  return {
    id: r.id as string,
    opportunityId: r.opportunity_id as string,
    commissionPercentage: Number(r.commission_percentage),
    durationPreset: r.duration_preset as ReferralDurationPreset,
    customDurationMonths: r.custom_duration_months === null ? null : Number(r.custom_duration_months),
    attributionWindowDays: r.attribution_window_days as number,
    reasonForElevatedRate: r.reason_for_elevated_rate as string | null,
    requiresFounderApproval: r.requires_founder_approval as boolean,
    approvalStatus: r.approval_status as "pending" | "approved" | "rejected",
    approvedBy: r.approved_by as string | null,
    approvedAt: r.approved_at as string | null,
    supersedesId: r.supersedes_id as string | null,
    createdAt: r.created_at as string,
  };
}

export async function getLatestReferralTerms(actorUserId: string, opportunityId: string): Promise<PartnershipReferral | null> {
  const auth = await authorize(actorUserId);
  if (!auth.ok) return null;

  const admin = createAdminClient();
  const { data, error } = await admin.from("partnership_referrals").select(REFERRAL_SELECT).eq("opportunity_id", opportunityId).order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (error) {
    console.error("[partnerships] failed to load latest referral terms", error.message);
    return null;
  }
  return data ? mapReferralRow(data) : null;
}

export async function listReferralsForAdmin(actorUserId: string): Promise<PartnershipReferral[]> {
  const auth = await authorize(actorUserId);
  if (!auth.ok) return [];

  const admin = createAdminClient();
  const { data, error } = await admin.from("partnership_referrals").select(REFERRAL_SELECT).order("created_at", { ascending: false });
  if (error) {
    console.error("[partnerships] failed to load referrals", error.message);
    return [];
  }
  return (data ?? []).map(mapReferralRow);
}

export async function createReferralTerms(params: {
  opportunityId: string;
  commissionPercentage?: number;
  durationPreset?: ReferralDurationPreset;
  customDurationMonths?: number | null;
  attributionWindowDays?: number;
  reasonForElevatedRate?: string | null;
  actorUserId: string;
}): Promise<{ ok: true; id: string; requiresFounderApproval: boolean } | { ok: false; error: string }> {
  const auth = await authorize(params.actorUserId);
  if (!auth.ok) return { ok: false, error: "Not authorized to manage referral terms." };

  const commissionPercentage = params.commissionPercentage ?? 10;
  const durationPreset = params.durationPreset ?? "first_engagement";
  if (commissionPercentage <= 0) return { ok: false, error: "Commission percentage must be greater than zero." };
  if (commissionRequiresDocumentedReason(commissionPercentage) && !params.reasonForElevatedRate?.trim()) {
    return { ok: false, error: "A 15% or higher commission rate requires a documented commercial reason." };
  }

  const requiresFounder = commissionRequiresFounderApproval(commissionPercentage) || durationRequiresFounderApproval(durationPreset, params.customDurationMonths ?? undefined);

  const admin = createAdminClient();
  const { data: previous } = await admin.from("partnership_referrals").select("id").eq("opportunity_id", params.opportunityId).order("created_at", { ascending: false }).limit(1).maybeSingle();

  const { data, error } = await admin
    .from("partnership_referrals")
    .insert({
      opportunity_id: params.opportunityId,
      commission_percentage: commissionPercentage,
      duration_preset: durationPreset,
      custom_duration_months: params.customDurationMonths ?? null,
      attribution_window_days: params.attributionWindowDays ?? DEFAULT_ATTRIBUTION_WINDOW_DAYS,
      reason_for_elevated_rate: params.reasonForElevatedRate ?? null,
      requires_founder_approval: requiresFounder,
      approval_status: "pending",
      supersedes_id: previous?.id ?? null,
      created_by: params.actorUserId,
    })
    .select("id")
    .maybeSingle();
  if (error || !data) {
    console.error("[partnerships] failed to create referral terms", error?.message);
    return { ok: false, error: "Failed to save the referral terms." };
  }

  await logActivity({ actorUserId: params.actorUserId, action: "partnerships.referral.rate_set", entityType: "partnership_referral", entityId: data.id, metadata: { opportunityId: params.opportunityId, commissionPercentage, durationPreset, requiresFounderApproval: requiresFounder } });
  return { ok: true, id: data.id, requiresFounderApproval: requiresFounder };
}

export async function approveReferralTerms(params: { referralId: string; actorUserId: string }): Promise<{ ok: true } | { ok: false; error: string }> {
  const admin = createAdminClient();
  const { data: referral, error: fetchError } = await admin.from("partnership_referrals").select("id, requires_founder_approval, approval_status").eq("id", params.referralId).maybeSingle();
  if (fetchError || !referral) return { ok: false, error: "Referral terms not found." };
  if (referral.approval_status !== "pending") return { ok: false, error: `Already ${referral.approval_status}.` };

  const authorized = referral.requires_founder_approval ? await isSuperAdminId(params.actorUserId) : (await authorize(params.actorUserId)).ok;
  if (!authorized) return { ok: false, error: "Not authorized to approve these referral terms." };

  const { error } = await admin.from("partnership_referrals").update({ approval_status: "approved", approved_by: params.actorUserId, approved_at: new Date().toISOString() }).eq("id", params.referralId);
  if (error) {
    console.error("[partnerships] failed to approve referral terms", error.message);
    return { ok: false, error: "Failed to approve the referral terms." };
  }
  await logActivity({ actorUserId: params.actorUserId, action: "partnerships.referral.approved", entityType: "partnership_referral", entityId: params.referralId, metadata: {} });
  return { ok: true };
}

// ---- Referral leads ----

const LEAD_SELECT = "id, referral_id, prospect_name, prospect_email, prospect_reference, introduced_at, reference_type, reference_id, eligibility_status, ineligibility_reasons, related_party_disclosed, attribution_expires_at, status, dispute_notes, created_at";

function mapLeadRow(l: Record<string, unknown>): PartnershipReferralLead {
  return {
    id: l.id as string,
    referralId: l.referral_id as string,
    prospectName: l.prospect_name as string,
    prospectEmail: l.prospect_email as string | null,
    prospectReference: l.prospect_reference as string | null,
    introducedAt: l.introduced_at as string,
    referenceType: l.reference_type as string | null,
    referenceId: l.reference_id as string | null,
    eligibilityStatus: l.eligibility_status as "eligible" | "ineligible" | "under_review",
    ineligibilityReasons: (l.ineligibility_reasons as string[]) ?? [],
    relatedPartyDisclosed: l.related_party_disclosed as boolean,
    attributionExpiresAt: l.attribution_expires_at as string | null,
    status: l.status as "attributed" | "expired" | "converted" | "disputed",
    disputeNotes: l.dispute_notes as string | null,
    createdAt: l.created_at as string,
  };
}

export async function listLeadsForReferral(actorUserId: string, referralId: string): Promise<PartnershipReferralLead[]> {
  const auth = await authorize(actorUserId);
  if (!auth.ok) return [];

  const admin = createAdminClient();
  const { data, error } = await admin.from("partnership_referral_leads").select(LEAD_SELECT).eq("referral_id", referralId).order("created_at", { ascending: false });
  if (error) {
    console.error("[partnerships] failed to load referral leads", error.message);
    return [];
  }
  return (data ?? []).map(mapLeadRow);
}

export async function createReferralLead(params: {
  referralId: string;
  prospectName: string;
  prospectEmail?: string | null;
  prospectReference?: string | null;
  eligibilityFlags: ReferralEligibilityFlags;
  attributionWindowDays: number;
  actorUserId: string;
}): Promise<{ ok: true; id: string; eligibilityStatus: string; blockingReasons: string[] } | { ok: false; error: string }> {
  const auth = await authorize(params.actorUserId);
  if (!auth.ok) return { ok: false, error: "Not authorized to record referral leads." };
  if (!params.prospectName.trim()) return { ok: false, error: "Prospect name is required." };

  const eligibility = assessReferralEligibility(params.eligibilityFlags);
  const eligibilityStatus = eligibility.eligible ? (eligibility.requiresDisclosureReview ? "under_review" : "eligible") : "ineligible";
  const introducedAt = new Date();
  const attributionExpiresAt = new Date(introducedAt.getTime() + params.attributionWindowDays * 24 * 60 * 60 * 1000);

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("partnership_referral_leads")
    .insert({
      referral_id: params.referralId,
      prospect_name: params.prospectName.trim(),
      prospect_email: params.prospectEmail ?? null,
      prospect_reference: params.prospectReference ?? null,
      introduced_at: introducedAt.toISOString(),
      eligibility_status: eligibilityStatus,
      ineligibility_reasons: eligibility.blockingReasons,
      related_party_disclosed: params.eligibilityFlags.relatedPartyDisclosed ?? false,
      attribution_expires_at: attributionExpiresAt.toISOString(),
      status: "attributed",
      created_by: params.actorUserId,
    })
    .select("id")
    .maybeSingle();
  if (error || !data) {
    console.error("[partnerships] failed to create referral lead", error?.message);
    return { ok: false, error: "Failed to record the referral lead." };
  }

  await logActivity({ actorUserId: params.actorUserId, action: "partnerships.referral_lead.created", entityType: "partnership_referral_lead", entityId: data.id, metadata: { referralId: params.referralId, eligibilityStatus, blockingReasons: eligibility.blockingReasons } });
  return { ok: true, id: data.id, eligibilityStatus, blockingReasons: eligibility.blockingReasons };
}

export async function disputeReferralLead(params: { leadId: string; disputeNotes: string; actorUserId: string }): Promise<{ ok: true } | { ok: false; error: string }> {
  const auth = await authorize(params.actorUserId);
  if (!auth.ok) return { ok: false, error: "Not authorized to manage referral leads." };
  if (!params.disputeNotes.trim()) return { ok: false, error: "Dispute notes are required." };

  const admin = createAdminClient();
  // Never overwrites introduced_at/reference_id — only records the
  // dispute state and notes, preserving original attribution.
  const { error } = await admin.from("partnership_referral_leads").update({ status: "disputed", dispute_notes: params.disputeNotes }).eq("id", params.leadId);
  if (error) {
    console.error("[partnerships] failed to record referral lead dispute", error.message);
    return { ok: false, error: "Failed to record the dispute." };
  }
  await logActivity({ actorUserId: params.actorUserId, action: "partnerships.referral_lead.disputed", entityType: "partnership_referral_lead", entityId: params.leadId, metadata: { disputeNotes: params.disputeNotes } });
  return { ok: true };
}
