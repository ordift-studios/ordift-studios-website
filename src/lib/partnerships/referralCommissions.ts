import { createAdminClient } from "@/lib/supabase/admin";
import { authorizeWithSuperAdminOverride, STRATEGY_CAPABILITIES } from "@/lib/organization/authority";
import { logActivity } from "@/lib/admin/activityLog";
import { computeEligibleCollectedRevenue, computeReferralCommissionEarned } from "./referralMath";

// Ordift Partnerships & Collaborations V1 (2026-09-07) — referral
// commission EVENTS, each tied to a specific real collected-revenue
// reference. FINANCIAL STOP-GATE: nothing in this file creates a
// payment_obligation, payable, or Paystack transfer, at any status —
// "approved_for_payment" and "paid" here are descriptive labels only.
// Actually paying a referrer remains a separate, deliberate, explicitly
// authorized action outside this module (reuse the existing Payables
// architecture when that step is genuinely authorized) — see the
// migration's own table comment for the same guarantee stated at the
// schema level.

export type CommissionEventStatus = "calculated" | "earned" | "approved_for_payment" | "paid";

export type PartnershipReferralCommissionEvent = {
  id: string;
  referralLeadId: string;
  grossCollectedAmount: number;
  excludedAmount: number;
  eligibleCollectedRevenue: number;
  commissionPercentage: number;
  commissionEarnedAmount: number;
  currency: string;
  collectedReferenceType: string | null;
  collectedReferenceId: string | null;
  status: CommissionEventStatus;
  approvedBy: string | null;
  approvedAt: string | null;
  createdAt: string;
};

async function authorize(actorUserId: string) {
  return authorizeWithSuperAdminOverride(actorUserId, STRATEGY_CAPABILITIES.partnershipReferralAdminister);
}

const SELECT = "id, referral_lead_id, gross_collected_amount, excluded_amount, eligible_collected_revenue, commission_percentage, commission_earned_amount, currency, collected_reference_type, collected_reference_id, status, approved_by, approved_at, created_at";

function mapRow(r: Record<string, unknown>): PartnershipReferralCommissionEvent {
  return {
    id: r.id as string,
    referralLeadId: r.referral_lead_id as string,
    grossCollectedAmount: Number(r.gross_collected_amount),
    excludedAmount: Number(r.excluded_amount),
    eligibleCollectedRevenue: Number(r.eligible_collected_revenue),
    commissionPercentage: Number(r.commission_percentage),
    commissionEarnedAmount: Number(r.commission_earned_amount),
    currency: r.currency as string,
    collectedReferenceType: r.collected_reference_type as string | null,
    collectedReferenceId: r.collected_reference_id as string | null,
    status: r.status as CommissionEventStatus,
    approvedBy: r.approved_by as string | null,
    approvedAt: r.approved_at as string | null,
    createdAt: r.created_at as string,
  };
}

export async function listCommissionEventsForLead(actorUserId: string, referralLeadId: string): Promise<PartnershipReferralCommissionEvent[]> {
  const auth = await authorize(actorUserId);
  if (!auth.ok) return [];

  const admin = createAdminClient();
  const { data, error } = await admin.from("partnership_referral_commission_events").select(SELECT).eq("referral_lead_id", referralLeadId).order("created_at", { ascending: false });
  if (error) {
    console.error("[partnerships] failed to load commission events", error.message);
    return [];
  }
  return (data ?? []).map(mapRow);
}

// Records a commission calculation against a real, already-collected
// amount (collectedReferenceType/Id should point at the actual payment
// record this traces to). This ALWAYS starts at status "calculated" —
// it never jumps straight to "earned"/"paid".
export async function recordCommissionEvent(params: {
  referralLeadId: string;
  grossCollectedAmount: number;
  excludedAmount?: number;
  commissionPercentage: number;
  currency?: string;
  collectedReferenceType?: string | null;
  collectedReferenceId?: string | null;
  actorUserId: string;
}): Promise<{ ok: true; id: string; eligibleCollectedRevenue: number; commissionEarnedAmount: number } | { ok: false; error: string }> {
  const auth = await authorize(params.actorUserId);
  if (!auth.ok) return { ok: false, error: "Not authorized to record referral commission events." };
  if (params.grossCollectedAmount < 0) return { ok: false, error: "Gross collected amount cannot be negative." };

  const excludedAmount = params.excludedAmount ?? 0;
  const eligibleCollectedRevenue = computeEligibleCollectedRevenue(params.grossCollectedAmount, excludedAmount);
  const commissionEarnedAmount = computeReferralCommissionEarned(eligibleCollectedRevenue, params.commissionPercentage);

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("partnership_referral_commission_events")
    .insert({
      referral_lead_id: params.referralLeadId,
      gross_collected_amount: params.grossCollectedAmount,
      excluded_amount: excludedAmount,
      eligible_collected_revenue: eligibleCollectedRevenue,
      commission_percentage: params.commissionPercentage,
      commission_earned_amount: commissionEarnedAmount,
      currency: params.currency ?? "USD",
      collected_reference_type: params.collectedReferenceType ?? null,
      collected_reference_id: params.collectedReferenceId ?? null,
      status: "calculated",
      created_by: params.actorUserId,
    })
    .select("id")
    .maybeSingle();
  if (error || !data) {
    console.error("[partnerships] failed to record commission event", error?.message);
    return { ok: false, error: "Failed to record the commission event." };
  }

  await logActivity({ actorUserId: params.actorUserId, action: "partnerships.referral_commission.calculated", entityType: "partnership_referral_commission_event", entityId: data.id, metadata: { referralLeadId: params.referralLeadId, eligibleCollectedRevenue, commissionEarnedAmount } });
  return { ok: true, id: data.id, eligibleCollectedRevenue, commissionEarnedAmount };
}

// A status transition only — deliberately never creates any financial
// obligation, at any status, including "approved_for_payment"/"paid".
// See module doc comment.
export async function setCommissionEventStatus(params: { eventId: string; status: CommissionEventStatus; actorUserId: string }): Promise<{ ok: true } | { ok: false; error: string }> {
  const auth = await authorize(params.actorUserId);
  if (!auth.ok) return { ok: false, error: "Not authorized to manage referral commission events." };

  const admin = createAdminClient();
  const update: Record<string, unknown> = { status: params.status };
  if (params.status === "approved_for_payment") {
    update.approved_by = params.actorUserId;
    update.approved_at = new Date().toISOString();
  }
  const { error } = await admin.from("partnership_referral_commission_events").update(update).eq("id", params.eventId);
  if (error) {
    console.error("[partnerships] failed to update commission event status", error.message);
    return { ok: false, error: "Failed to update the commission event." };
  }
  await logActivity({ actorUserId: params.actorUserId, action: "partnerships.referral_commission.status_changed", entityType: "partnership_referral_commission_event", entityId: params.eventId, metadata: { status: params.status } });
  return { ok: true };
}
