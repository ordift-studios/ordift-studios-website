import { createAdminClient } from "@/lib/supabase/admin";
import { logActivity } from "@/lib/admin/activityLog";
import { isSuperAdminId, hasJurisdictionAuthority } from "@/lib/organization/authority";

// Ordift Studios Compliance/COMP-SYS-1, Phase B4 Step 8 (2026-09-14) —
// training and professional development, OS-HR-GH-003 section 7.
// Deliberately three separate concepts: required/funded training (7.1,
// never carries a repayment obligation), employee-requested development
// (7.2), and sponsored development with an optional pre-agreed written
// repayment obligation (7.3).

// --- pure functions --------------------------------------------------

export interface SponsoredDevelopmentRepaymentTermsInput {
  repaymentRequired: boolean;
  repaymentTermsText?: string | null;
  repaymentTimeLimitMonths?: number | null;
}

// Pure — validates completeness only, never computes an amount or
// schedule. OS-HR-GH-003 7.3: repayment must be "proportionate,
// declining over time, time-limited and lawful" and "pre-agreed" —
// this function only checks that a human has actually supplied written
// terms and an explicit time limit when repayment is required; it
// never derives either value itself, since "exact thresholds/formulas
// are configured before use" and no such formula exists in this system.
export function validateSponsoredDevelopmentRepaymentTerms(input: SponsoredDevelopmentRepaymentTermsInput): { ok: true } | { ok: false; error: string } {
  if (!input.repaymentRequired) return { ok: true };
  if (!input.repaymentTermsText || !input.repaymentTermsText.trim()) {
    return { ok: false, error: "Written repayment terms are required when repayment is required (OS-HR-GH-003 7.3: must be pre-agreed in writing)." };
  }
  if (!input.repaymentTimeLimitMonths || input.repaymentTimeLimitMonths <= 0) {
    return { ok: false, error: "A positive repayment time limit (in months) is required when repayment is required (OS-HR-GH-003 7.3: must be time-limited)." };
  }
  return { ok: true };
}

// --- DB-dependent functions -------------------------------------------

async function canManageDevelopment(actorUserId: string): Promise<boolean> {
  if (await isSuperAdminId(actorUserId)) return true;
  return hasJurisdictionAuthority(actorUserId, "operations", "administer");
}

export async function recordRequiredTraining(params: {
  profileId: string;
  trainingType: string;
  title: string;
  provider?: string | null;
  fundedByOrdift?: boolean;
  treatedAsWorkingTime?: boolean;
  scheduledDate?: string | null;
  completedDate?: string | null;
  hours?: number | null;
  cost?: number | null;
  actorUserId: string;
}): Promise<{ ok: true; trainingId: string } | { ok: false; error: string }> {
  if (!(await canManageDevelopment(params.actorUserId))) {
    return { ok: false, error: "Not authorized to record a training record." };
  }
  if (!params.title.trim()) return { ok: false, error: "A title is required." };

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("training_records")
    .insert({
      profile_id: params.profileId,
      training_type: params.trainingType,
      title: params.title,
      provider: params.provider ?? null,
      funded_by_ordift: params.fundedByOrdift ?? true,
      treated_as_working_time: params.treatedAsWorkingTime ?? false,
      scheduled_date: params.scheduledDate ?? null,
      completed_date: params.completedDate ?? null,
      hours: params.hours ?? null,
      cost: params.cost ?? null,
      recorded_by: params.actorUserId,
    })
    .select("id")
    .single();
  if (error || !data) return { ok: false, error: error?.message ?? "Failed to record the training." };

  await logActivity({ actorUserId: params.actorUserId, action: "training_record.recorded", entityType: "user", entityId: params.profileId, metadata: { trainingId: data.id, trainingType: params.trainingType } });
  return { ok: true, trainingId: data.id };
}

export async function listTrainingRecordsForProfile(profileId: string): Promise<
  { id: string; trainingType: string; title: string; completedDate: string | null; treatedAsWorkingTime: boolean }[]
> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("training_records")
    .select("id, training_type, title, completed_date, treated_as_working_time")
    .eq("profile_id", profileId)
    .order("created_at", { ascending: false });
  if (error) {
    console.error("[organization] failed to load training_records", error.message);
    return [];
  }
  return (data ?? []).map((r) => ({ id: r.id, trainingType: r.training_type, title: r.title, completedDate: r.completed_date, treatedAsWorkingTime: r.treated_as_working_time }));
}

export async function submitDevelopmentRequest(params: { profileId: string; requestType: string; description: string; estimatedCost?: number | null; actorUserId: string }): Promise<{ ok: true; requestId: string } | { ok: false; error: string }> {
  const isSelf = params.actorUserId === params.profileId;
  if (!isSelf && !(await canManageDevelopment(params.actorUserId))) {
    return { ok: false, error: "Not authorized to submit a development request on behalf of another person." };
  }
  if (!params.description.trim()) return { ok: false, error: "A description is required." };

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("development_requests")
    .insert({ profile_id: params.profileId, requested_by: params.actorUserId, request_type: params.requestType, description: params.description, estimated_cost: params.estimatedCost ?? null })
    .select("id")
    .single();
  if (error || !data) return { ok: false, error: error?.message ?? "Failed to submit the development request." };

  await logActivity({ actorUserId: params.actorUserId, action: "development_request.submitted", entityType: "user", entityId: params.profileId, metadata: { requestId: data.id } });
  return { ok: true, requestId: data.id };
}

export type DevelopmentRequestDecision = "approved" | "declined";

export async function decideDevelopmentRequest(params: { requestId: string; decision: DevelopmentRequestDecision; decisionNotes?: string | null; actorUserId: string }): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!(await canManageDevelopment(params.actorUserId))) {
    return { ok: false, error: "Not authorized to decide a development request." };
  }
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("development_requests")
    .update({ status: params.decision, decided_by: params.actorUserId, decided_at: new Date().toISOString(), decision_notes: params.decisionNotes ?? null })
    .eq("id", params.requestId)
    .eq("status", "requested")
    .select("id")
    .maybeSingle();
  if (error) return { ok: false, error: "Failed to decide the development request." };
  if (!data) return { ok: false, error: "Request not found, or already decided." };

  await logActivity({ actorUserId: params.actorUserId, action: "development_request.decided", entityType: "development_request", entityId: params.requestId, metadata: { decision: params.decision } });
  return { ok: true };
}

export async function listDevelopmentRequestsForProfile(profileId: string): Promise<{ id: string; requestType: string; description: string; status: string }[]> {
  const admin = createAdminClient();
  const { data, error } = await admin.from("development_requests").select("id, request_type, description, status").eq("profile_id", profileId).order("created_at", { ascending: false });
  if (error) {
    console.error("[organization] failed to load development_requests", error.message);
    return [];
  }
  return (data ?? []).map((r) => ({ id: r.id, requestType: r.request_type, description: r.description, status: r.status }));
}

// Repayment terms are validated for completeness (never computed) via
// validateSponsoredDevelopmentRepaymentTerms() before the row is ever
// inserted.
export async function proposeSponsoredDevelopmentAgreement(params: {
  profileId: string;
  developmentRequestId?: string | null;
  description: string;
  totalCost: number;
  externallyTransferable: boolean;
  repaymentRequired: boolean;
  repaymentTermsText?: string | null;
  repaymentTimeLimitMonths?: number | null;
  actorUserId: string;
}): Promise<{ ok: true; agreementId: string } | { ok: false; error: string }> {
  if (!(await canManageDevelopment(params.actorUserId))) {
    return { ok: false, error: "Not authorized to propose a sponsored development agreement." };
  }
  if (!params.description.trim()) return { ok: false, error: "A description is required." };
  if (!(params.totalCost > 0)) return { ok: false, error: "The total cost must be greater than zero." };

  const validation = validateSponsoredDevelopmentRepaymentTerms(params);
  if (!validation.ok) return validation;

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("sponsored_development_agreements")
    .insert({
      profile_id: params.profileId,
      development_request_id: params.developmentRequestId ?? null,
      description: params.description,
      total_cost: params.totalCost,
      externally_transferable: params.externallyTransferable,
      repayment_required: params.repaymentRequired,
      repayment_terms_text: params.repaymentTermsText ?? null,
      repayment_time_limit_months: params.repaymentTimeLimitMonths ?? null,
    })
    .select("id")
    .single();
  if (error || !data) return { ok: false, error: error?.message ?? "Failed to propose the sponsored development agreement." };

  await logActivity({ actorUserId: params.actorUserId, action: "sponsored_development_agreement.proposed", entityType: "user", entityId: params.profileId, metadata: { agreementId: data.id, repaymentRequired: params.repaymentRequired } });
  return { ok: true, agreementId: data.id };
}

// The written-agreement gate: repayment terms must already be complete
// (re-validated here, not re-trusted from proposal time) before the
// agreement can be marked signed — OS-HR-GH-003 7.3's "pre-agreed
// written repayment obligation" requirement.
export async function signSponsoredDevelopmentAgreement(params: { agreementId: string; actorUserId: string }): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!(await canManageDevelopment(params.actorUserId))) {
    return { ok: false, error: "Not authorized to sign a sponsored development agreement." };
  }

  const admin = createAdminClient();
  const { data: existing } = await admin
    .from("sponsored_development_agreements")
    .select("id, status, repayment_required, repayment_terms_text, repayment_time_limit_months")
    .eq("id", params.agreementId)
    .maybeSingle();
  if (!existing) return { ok: false, error: "Agreement not found." };
  if (existing.status !== "proposed") return { ok: false, error: `Cannot sign an agreement already in status "${existing.status}".` };

  const validation = validateSponsoredDevelopmentRepaymentTerms({
    repaymentRequired: existing.repayment_required,
    repaymentTermsText: existing.repayment_terms_text,
    repaymentTimeLimitMonths: existing.repayment_time_limit_months,
  });
  if (!validation.ok) return validation;

  const { data, error } = await admin
    .from("sponsored_development_agreements")
    .update({ status: "written_agreement_signed", written_agreement_signed_at: new Date().toISOString(), approved_by: params.actorUserId, approved_at: new Date().toISOString() })
    .eq("id", params.agreementId)
    .eq("status", "proposed")
    .select("id")
    .maybeSingle();
  if (error) return { ok: false, error: "Failed to sign the agreement." };
  if (!data) return { ok: false, error: "The agreement changed concurrently — please retry." };

  await logActivity({ actorUserId: params.actorUserId, action: "sponsored_development_agreement.signed", entityType: "sponsored_development_agreement", entityId: params.agreementId });
  return { ok: true };
}

// Funding may only follow a signed written agreement — "pre-agreed" is
// enforced by ordering (the atomic .eq('status','written_agreement_signed')
// guard), not merely a field name.
export async function fundSponsoredDevelopmentAgreement(params: { agreementId: string; actorUserId: string }): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!(await canManageDevelopment(params.actorUserId))) {
    return { ok: false, error: "Not authorized to fund a sponsored development agreement." };
  }
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("sponsored_development_agreements")
    .update({ status: "funded", funded_at: new Date().toISOString() })
    .eq("id", params.agreementId)
    .eq("status", "written_agreement_signed")
    .select("id")
    .maybeSingle();
  if (error) return { ok: false, error: "Failed to fund the agreement." };
  if (!data) return { ok: false, error: "Agreement not found, or the written agreement has not yet been signed." };

  await logActivity({ actorUserId: params.actorUserId, action: "sponsored_development_agreement.funded", entityType: "sponsored_development_agreement", entityId: params.agreementId });
  return { ok: true };
}

export async function completeSponsoredDevelopmentAgreement(params: { agreementId: string; actorUserId: string }): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!(await canManageDevelopment(params.actorUserId))) {
    return { ok: false, error: "Not authorized to complete a sponsored development agreement." };
  }
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("sponsored_development_agreements")
    .update({ status: "completed" })
    .eq("id", params.agreementId)
    .eq("status", "funded")
    .select("id")
    .maybeSingle();
  if (error) return { ok: false, error: "Failed to complete the agreement." };
  if (!data) return { ok: false, error: "Agreement not found, or not currently funded." };

  await logActivity({ actorUserId: params.actorUserId, action: "sponsored_development_agreement.completed", entityType: "sponsored_development_agreement", entityId: params.agreementId });
  return { ok: true };
}

export async function listSponsoredDevelopmentAgreementsForProfile(profileId: string): Promise<
  { id: string; description: string; totalCost: number; repaymentRequired: boolean; status: string }[]
> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("sponsored_development_agreements")
    .select("id, description, total_cost, repayment_required, status")
    .eq("profile_id", profileId)
    .order("created_at", { ascending: false });
  if (error) {
    console.error("[organization] failed to load sponsored_development_agreements", error.message);
    return [];
  }
  return (data ?? []).map((r) => ({ id: r.id, description: r.description, totalCost: r.total_cost, repaymentRequired: r.repayment_required, status: r.status }));
}
