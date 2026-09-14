import { createAdminClient } from "@/lib/supabase/admin";
import { logActivity } from "@/lib/admin/activityLog";
import { isSuperAdminId, hasJurisdictionAuthority } from "@/lib/organization/authority";

// Ordift Studios Compliance/COMP-SYS-1, Phase B4 Step 10 (2026-09-14) —
// employee personal portfolio/BTS use requests, OS-HR-GH-005 3.3.
// Deliberately references the existing agreement_releases table
// (migration 0071, LEGAL-SYS-1 Phase G) for client/model release
// rights rather than duplicating usage-rights data — this module only
// adds the request/controlled-approval layer on top of it.

export async function canManagePortfolioUse(actorUserId: string): Promise<boolean> {
  if (await isSuperAdminId(actorUserId)) return true;
  return hasJurisdictionAuthority(actorUserId, "operations", "administer");
}

export interface PortfolioUseApprovalChecks {
  confidentialityChecked: boolean;
  embargoChecked: boolean;
  contractualRestrictionsChecked: boolean;
  releaseRightsChecked: boolean;
}

// Pure — validates that every required check has actually been
// confirmed, never performs any of the checks itself. OS-HR-GH-005 3.3
// names exactly these four things as required before approval; this
// function is the structural gate that makes "employees do not gain
// automatic publication rights" real rather than aspirational.
export function validatePortfolioUseApprovalChecks(checks: PortfolioUseApprovalChecks): { ok: true } | { ok: false; error: string } {
  if (!checks.confidentialityChecked) return { ok: false, error: "Confidentiality must be checked before approval." };
  if (!checks.embargoChecked) return { ok: false, error: "Embargoes must be checked before approval." };
  if (!checks.contractualRestrictionsChecked) return { ok: false, error: "Contractual restrictions must be checked before approval." };
  if (!checks.releaseRightsChecked) return { ok: false, error: "Client/model release rights must be checked before approval." };
  return { ok: true };
}

// Self-submission is normal — an employee requesting to use their own
// captured/edited/created material in a personal portfolio has no
// special authorization requirement; requesting on someone else's
// behalf requires Super Admin or operations.administer.
export async function submitPortfolioUseRequest(params: {
  profileId: string;
  description: string;
  relatedAgreementId?: string | null;
  relatedReleaseId?: string | null;
  actorUserId: string;
}): Promise<{ ok: true; requestId: string } | { ok: false; error: string }> {
  const isSelf = params.actorUserId === params.profileId;
  if (!isSelf && !(await canManagePortfolioUse(params.actorUserId))) {
    return { ok: false, error: "Not authorized to submit a portfolio-use request on behalf of another person." };
  }
  if (!params.description.trim()) return { ok: false, error: "A description of the requested assets/use is required." };

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("portfolio_use_requests")
    .insert({
      profile_id: params.profileId,
      requested_by: params.actorUserId,
      description: params.description,
      related_agreement_id: params.relatedAgreementId ?? null,
      related_release_id: params.relatedReleaseId ?? null,
    })
    .select("id")
    .single();
  if (error || !data) return { ok: false, error: error?.message ?? "Failed to submit the portfolio-use request." };

  await logActivity({ actorUserId: params.actorUserId, action: "portfolio_use_request.submitted", entityType: "user", entityId: params.profileId, metadata: { requestId: data.id } });
  return { ok: true, requestId: data.id };
}

// Requires all four checks to be explicitly true — validated via
// validatePortfolioUseApprovalChecks() before any row is touched. This
// is the ONLY function in this file that can set status='approved',
// and it always requires assets/platforms to be specified per 3.3's
// "Approval can specify assets, platforms, timing and conditions."
export async function approvePortfolioUseRequest(params: {
  requestId: string;
  checks: PortfolioUseApprovalChecks;
  approvedAssets: string;
  approvedPlatforms: string[];
  approvedTiming?: string | null;
  approvedConditions?: string | null;
  decisionNotes?: string | null;
  actorUserId: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!(await canManagePortfolioUse(params.actorUserId))) {
    return { ok: false, error: "Not authorized to approve a portfolio-use request." };
  }
  const validation = validatePortfolioUseApprovalChecks(params.checks);
  if (!validation.ok) return validation;
  if (!params.approvedAssets.trim()) return { ok: false, error: "The approved assets must be specified." };
  if (params.approvedPlatforms.length === 0) return { ok: false, error: "At least one approved platform must be specified." };

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("portfolio_use_requests")
    .update({
      status: "approved",
      confidentiality_checked: params.checks.confidentialityChecked,
      embargo_checked: params.checks.embargoChecked,
      contractual_restrictions_checked: params.checks.contractualRestrictionsChecked,
      release_rights_checked: params.checks.releaseRightsChecked,
      approved_assets: params.approvedAssets,
      approved_platforms: params.approvedPlatforms,
      approved_timing: params.approvedTiming ?? null,
      approved_conditions: params.approvedConditions ?? null,
      decided_by: params.actorUserId,
      decided_at: new Date().toISOString(),
      decision_notes: params.decisionNotes ?? null,
    })
    .eq("id", params.requestId)
    .eq("status", "requested")
    .select("id, profile_id")
    .maybeSingle();
  if (error) return { ok: false, error: "Failed to approve the portfolio-use request." };
  if (!data) return { ok: false, error: "Request not found, or already decided." };

  await logActivity({ actorUserId: params.actorUserId, action: "portfolio_use_request.approved", entityType: "user", entityId: data.profile_id, metadata: { requestId: params.requestId } });
  return { ok: true };
}

export async function declinePortfolioUseRequest(params: { requestId: string; decisionNotes: string; actorUserId: string }): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!(await canManagePortfolioUse(params.actorUserId))) {
    return { ok: false, error: "Not authorized to decline a portfolio-use request." };
  }
  if (!params.decisionNotes.trim()) return { ok: false, error: "Decision notes are required." };

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("portfolio_use_requests")
    .update({ status: "declined", decided_by: params.actorUserId, decided_at: new Date().toISOString(), decision_notes: params.decisionNotes })
    .eq("id", params.requestId)
    .eq("status", "requested")
    .select("id, profile_id")
    .maybeSingle();
  if (error) return { ok: false, error: "Failed to decline the portfolio-use request." };
  if (!data) return { ok: false, error: "Request not found, or already decided." };

  await logActivity({ actorUserId: params.actorUserId, action: "portfolio_use_request.declined", entityType: "user", entityId: data.profile_id, metadata: { requestId: params.requestId } });
  return { ok: true };
}

export async function listPortfolioUseRequestsForProfile(profileId: string): Promise<
  { id: string; description: string; status: string; approvedPlatforms: unknown; createdAt: string }[]
> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("portfolio_use_requests")
    .select("id, description, status, approved_platforms, created_at")
    .eq("profile_id", profileId)
    .order("created_at", { ascending: false });
  if (error) {
    console.error("[organization] failed to load portfolio_use_requests", error.message);
    return [];
  }
  return (data ?? []).map((r) => ({ id: r.id, description: r.description, status: r.status, approvedPlatforms: r.approved_platforms, createdAt: r.created_at }));
}
