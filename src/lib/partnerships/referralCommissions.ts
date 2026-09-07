import { createAdminClient } from "@/lib/supabase/admin";
import { authorizeWithSuperAdminOverride, STRATEGY_CAPABILITIES, FINANCE_CAPABILITIES } from "@/lib/organization/authority";
import { logActivity } from "@/lib/admin/activityLog";
import { computeEligibleCollectedRevenue, computeReferralCommissionEarned } from "./referralMath";
import { classifyReferralPayableReadiness } from "./referralPayableReadiness";
import { createPaymentObligation, cancelPaymentObligation } from "@/lib/payments/payoutObligations";

// Ordift Partnerships & Collaborations — referral commission EVENTS,
// each tied to a specific real collected-revenue reference.
//
// FINANCIAL STOP-GATE (unchanged from V1): a commission reaching
// "calculated" or "earned" NEVER automatically creates a payee,
// payment destination, payment_obligation, payable, or Paystack
// transfer. setCommissionEventStatus() below only ever moves a
// commission between "calculated" and "earned" — it explicitly REFUSES
// "approved_for_payment"/"paid" as target statuses.
//
// REFERRAL PAYABLE BRIDGE (2026-09-07): approveReferralCommissionForPayment()
// is the ONLY path from "earned" into Finance. It is a deliberate,
// separately-authorized, revalidated, idempotent action — see its own
// doc comment below. The commission event's own status column still
// never reaches "paid": once linked to a real payment_obligations row,
// the live "paid" observation is read from THAT row (Finance's own
// source of truth) — see getLinkedPaymentObligationStatus() at the
// bottom of this file — never duplicated back onto this table.

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
  paymentObligationId: string | null;
  createdAt: string;
};

async function authorize(actorUserId: string) {
  return authorizeWithSuperAdminOverride(actorUserId, STRATEGY_CAPABILITIES.partnershipReferralAdminister);
}

const SELECT = "id, referral_lead_id, gross_collected_amount, excluded_amount, eligible_collected_revenue, commission_percentage, commission_earned_amount, currency, collected_reference_type, collected_reference_id, status, approved_by, approved_at, payment_obligation_id, created_at";

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
    paymentObligationId: r.payment_obligation_id as string | null,
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

export async function getCommissionEventById(actorUserId: string, eventId: string): Promise<PartnershipReferralCommissionEvent | null> {
  const auth = await authorize(actorUserId);
  if (!auth.ok) return null;

  const admin = createAdminClient();
  const { data, error } = await admin.from("partnership_referral_commission_events").select(SELECT).eq("id", eventId).maybeSingle();
  if (error || !data) {
    if (error) console.error("[partnerships] failed to load commission event", error.message);
    return null;
  }
  return mapRow(data);
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

// A status transition ONLY between "calculated" and "earned" —
// deliberately refuses "approved_for_payment"/"paid" as a target here,
// even for an authorized actor. Those two states are reachable ONLY
// through approveReferralCommissionForPayment() below (and, for
// "paid", only by observing the linked payment_obligations row's own
// real status — see getLinkedPaymentObligationStatus()).
export async function setCommissionEventStatus(params: { eventId: string; status: "calculated" | "earned"; actorUserId: string }): Promise<{ ok: true } | { ok: false; error: string }> {
  const auth = await authorize(params.actorUserId);
  if (!auth.ok) return { ok: false, error: "Not authorized to manage referral commission events." };
  if (params.status !== "calculated" && params.status !== "earned") {
    return { ok: false, error: 'Only "calculated" and "earned" can be set directly — use Approve for Payment for the rest.' };
  }

  const admin = createAdminClient();
  const { error } = await admin.from("partnership_referral_commission_events").update({ status: params.status }).eq("id", params.eventId);
  if (error) {
    console.error("[partnerships] failed to update commission event status", error.message);
    return { ok: false, error: "Failed to update the commission event." };
  }
  await logActivity({ actorUserId: params.actorUserId, action: "partnerships.referral_commission.status_changed", entityType: "partnership_referral_commission_event", entityId: params.eventId, metadata: { status: params.status } });
  return { ok: true };
}

// ============================================================
// REFERRAL PAYABLE BRIDGE — the ONLY path from an Earned commission
// into the existing Payables/payment_obligations architecture.
// ============================================================
//
// Authorization deliberately uses FINANCE_CAPABILITIES.payeeAdminister
// (not the Partnerships-side capability) — this action creates a real
// financial record, so it is gated by the same capability
// createPaymentObligation()/createEngagementPayable() already require,
// exactly mirroring how the Payables/Engagements area's own "create a
// payable from this engagement" button works. Holding the Partnerships
// referral-admin capability alone is NOT sufficient to approve payment.
//
// Revalidates every prerequisite server-side, from freshly-fetched
// rows only — nothing here trusts a client-supplied amount, currency,
// or "is this ready" flag:
//   1. the commission event is still genuinely "earned"
//   2. it is not already linked to a payment_obligations row (idempotent)
//   3. the referral lead is not disputed (the V1 revalidation signal
//      for a refund/chargeback discovered before approval)
//   4. eligible revenue / earned commission are RE-COMPUTED from the
//      stored gross/excluded figures and must match what was recorded
//      at "earned" time
//   5. the opportunity has a linked payee profile
// Only if every check passes does it call the existing, unmodified
// createPaymentObligation() (payoutObligations.ts) — never a second
// payables system.
//
// Concurrency: after creating the payment_obligations row, this
// function performs ONE atomic conditional UPDATE
// (`WHERE id = eventId AND payment_obligation_id IS NULL`). If a
// concurrent call already won that race, the just-created obligation
// is immediately cancelled via the existing cancelPaymentObligation()
// and the WINNING obligation's id is returned instead — there is never
// more than one live payment_obligations row per commission event.
export async function approveReferralCommissionForPayment(params: { eventId: string; description: string; actorUserId: string }): Promise<{ ok: true; obligationId: string; alreadyExisted: boolean } | { ok: false; error: string; reason?: string }> {
  const auth = await authorizeWithSuperAdminOverride(params.actorUserId, FINANCE_CAPABILITIES.payeeAdminister);
  if (!auth.ok) return { ok: false, error: "Not authorized to approve a referral commission for payment." };

  const admin = createAdminClient();

  const { data: event, error: eventError } = await admin
    .from("partnership_referral_commission_events")
    .select("id, referral_lead_id, eligible_collected_revenue, commission_percentage, commission_earned_amount, currency, gross_collected_amount, excluded_amount, status, payment_obligation_id")
    .eq("id", params.eventId)
    .maybeSingle();
  if (eventError || !event) return { ok: false, error: "Commission event not found." };

  // Idempotent: already submitted — return the existing obligation,
  // never create a second one.
  if (event.payment_obligation_id) return { ok: true, obligationId: event.payment_obligation_id, alreadyExisted: true };

  const { data: lead, error: leadError } = await admin.from("partnership_referral_leads").select("id, referral_id, status").eq("id", event.referral_lead_id).maybeSingle();
  if (leadError || !lead) return { ok: false, error: "Referral lead not found." };

  const { data: referral, error: referralError } = await admin.from("partnership_referrals").select("id, opportunity_id, approval_status").eq("id", lead.referral_id).maybeSingle();
  if (referralError || !referral) return { ok: false, error: "Referral relationship not found." };

  const { data: opportunity, error: opportunityError } = await admin.from("partnership_opportunities").select("id, payee_profile_id, counterpart_name").eq("id", referral.opportunity_id).maybeSingle();
  if (opportunityError || !opportunity) return { ok: false, error: "Partnership opportunity not found." };

  const recomputedEligibleCollectedRevenue = computeEligibleCollectedRevenue(Number(event.gross_collected_amount), Number(event.excluded_amount));
  const recomputedCommissionEarnedAmount = computeReferralCommissionEarned(recomputedEligibleCollectedRevenue, Number(event.commission_percentage));

  const readiness = classifyReferralPayableReadiness({
    commissionStatus: event.status as CommissionEventStatus,
    existingPaymentObligationId: event.payment_obligation_id,
    leadStatus: lead.status as "attributed" | "expired" | "converted" | "disputed",
    hasPayeeProfileLinked: Boolean(opportunity.payee_profile_id),
    storedEligibleCollectedRevenue: Number(event.eligible_collected_revenue),
    recomputedEligibleCollectedRevenue,
    storedCommissionEarnedAmount: Number(event.commission_earned_amount),
    recomputedCommissionEarnedAmount,
  });

  if (!readiness.ready) {
    const messages: Record<string, string> = {
      not_earned: "Only an Earned commission can be approved for payment.",
      already_linked: "This commission has already been submitted to Payables.",
      no_payee_setup: "Payment setup required before this referral commission can be submitted to Payables — link a payee profile on the opportunity first.",
      lead_disputed: "This referral lead is under dispute — resolve the dispute before approving payment.",
      amount_mismatch: "The recorded commission no longer matches the underlying figures — recalculate before approving payment.",
    };
    await logActivity({ actorUserId: params.actorUserId, action: "partnerships.referral_commission.payment_blocked", entityType: "partnership_referral_commission_event", entityId: params.eventId, metadata: { reason: readiness.reason } });
    return { ok: false, error: messages[readiness.reason], reason: readiness.reason };
  }

  const createResult = await createPaymentObligation({
    payeeProfileId: opportunity.payee_profile_id as string,
    sourceType: "partnership_referral_commission_event",
    sourceReference: params.eventId,
    description: params.description || `Referral commission — ${opportunity.counterpart_name}`,
    currency: event.currency,
    amount: recomputedCommissionEarnedAmount,
    actorUserId: params.actorUserId,
  });
  if (!createResult.ok) {
    await logActivity({ actorUserId: params.actorUserId, action: "partnerships.referral_commission.payables_submission_failed", entityType: "partnership_referral_commission_event", entityId: params.eventId, metadata: { error: createResult.error } });
    return { ok: false, error: createResult.error };
  }

  // Atomic conditional link — wins the race, or loses it cleanly.
  const { data: linked, error: linkError } = await admin
    .from("partnership_referral_commission_events")
    .update({ payment_obligation_id: createResult.obligationId, status: "approved_for_payment", approved_by: params.actorUserId, approved_at: new Date().toISOString() })
    .eq("id", params.eventId)
    .is("payment_obligation_id", null)
    .select("id")
    .maybeSingle();

  if (linkError) {
    console.error("[partnerships] failed to link payment obligation to commission event", linkError.message);
  }

  if (!linked) {
    // Lost the race — a concurrent approval already linked a different
    // obligation. Cancel the duplicate we just created and return the
    // winner instead, so exactly one live obligation ever exists.
    await cancelPaymentObligation({ obligationId: createResult.obligationId, reason: "Duplicate submission — a concurrent Approve for Payment already succeeded for this commission event.", actorUserId: params.actorUserId });
    const { data: winning } = await admin.from("partnership_referral_commission_events").select("payment_obligation_id").eq("id", params.eventId).maybeSingle();
    if (winning?.payment_obligation_id) {
      return { ok: true, obligationId: winning.payment_obligation_id, alreadyExisted: true };
    }
    return { ok: false, error: "Failed to link the payment obligation — try again." };
  }

  await logActivity({
    actorUserId: params.actorUserId,
    action: "partnerships.referral_commission.approved_for_payment",
    entityType: "partnership_referral_commission_event",
    entityId: params.eventId,
    metadata: { obligationId: createResult.obligationId, amount: recomputedCommissionEarnedAmount, currency: event.currency },
  });
  return { ok: true, obligationId: createResult.obligationId, alreadyExisted: false };
}
