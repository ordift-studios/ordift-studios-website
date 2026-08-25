import { createAdminClient } from "@/lib/supabase/admin";
import { logActivity } from "@/lib/admin/activityLog";

// Ordift Organizational & Administrative Architecture V1, Phase 3.3,
// Part I (2026-08-25) — payment-obligation/payout foundation, against
// public.payment_obligations. Deliberately independent of
// src/lib/payments/providers/paystack.ts and the inbound
// PaymentProvider interface (src/lib/payments/types.ts) — never
// imports from either. Inspection confirmed Paystack integration here
// is inbound-collection-only (initialize/verify/refund); no transfer
// or recipient API call exists anywhere in this codebase, live or
// dead. This module therefore defines its own, separate,
// provider-agnostic PayoutProvider boundary and ships zero
// implementations of it — creating an obligation NEVER itself moves
// money; every write here only ever changes this table's own rows.

// A future real integration (Paystack Transfers, or any other
// provider) implements this interface — nothing in this phase does.
// Deliberately not implemented/stubbed with fake success: there is no
// "manual" or "noop" PayoutProvider registered anywhere, so no code
// path in this phase can ever move status past 'approved' into a
// provider-confirmed state.
export type PayoutProvider = {
  name: string;
  initiateTransfer(params: { obligationId: string; amount: number; currency: string; destination: unknown }): Promise<{
    ok: true;
    providerReference: string;
  } | { ok: false; error: string }>;
};

export type PaymentObligation = {
  id: string;
  payeeProfileId: string;
  paymentInstructionId: string | null;
  sourceType: string;
  sourceReference: string | null;
  description: string;
  currency: string;
  amount: number;
  status: string;
  approvedBy: string | null;
  approvedAt: string | null;
  payoutProvider: string | null;
  payoutReference: string | null;
  paidAt: string | null;
  createdAt: string;
};

const SELECT =
  "id, payee_profile_id, payment_instruction_id, source_type, source_reference, description, currency, amount, status, approved_by, approved_at, payout_provider, payout_reference, paid_at, created_at";

export async function listPaymentObligationsForPayee(payeeProfileId: string): Promise<PaymentObligation[]> {
  const admin = createAdminClient();
  const { data, error } = await admin.from("payment_obligations").select(SELECT).eq("payee_profile_id", payeeProfileId).order("created_at", { ascending: false });
  if (error) {
    console.error("[payments] failed to load payment_obligations", error.message);
    return [];
  }
  return (data ?? []).map(mapObligation);
}

export async function listAllPaymentObligations(): Promise<PaymentObligation[]> {
  const admin = createAdminClient();
  const { data, error } = await admin.from("payment_obligations").select(SELECT).order("created_at", { ascending: false });
  if (error) {
    console.error("[payments] failed to load payment_obligations", error.message);
    return [];
  }
  return (data ?? []).map(mapObligation);
}

function mapObligation(r: {
  id: string;
  payee_profile_id: string;
  payment_instruction_id: string | null;
  source_type: string;
  source_reference: string | null;
  description: string;
  currency: string;
  amount: number;
  status: string;
  approved_by: string | null;
  approved_at: string | null;
  payout_provider: string | null;
  payout_reference: string | null;
  paid_at: string | null;
  created_at: string;
}): PaymentObligation {
  return {
    id: r.id,
    payeeProfileId: r.payee_profile_id,
    paymentInstructionId: r.payment_instruction_id,
    sourceType: r.source_type,
    sourceReference: r.source_reference,
    description: r.description,
    currency: r.currency,
    amount: r.amount,
    status: r.status,
    approvedBy: r.approved_by,
    approvedAt: r.approved_at,
    payoutProvider: r.payout_provider,
    payoutReference: r.payout_reference,
    paidAt: r.paid_at,
    createdAt: r.created_at,
  };
}

export type CreateObligationParams = {
  payeeProfileId: string;
  paymentInstructionId?: string | null;
  sourceType: string;
  sourceReference?: string | null;
  description: string;
  currency: string;
  amount: number;
  actorUserId: string;
};

// Only ever creates a 'pending_approval' record — never itself an
// authorization to pay. No amount here was ever populated by system
// logic; every obligation traces back to an explicit human-entered
// description/amount at the call site.
export async function createPaymentObligation(
  params: CreateObligationParams
): Promise<{ ok: true; obligationId: string } | { ok: false; error: string }> {
  if (params.amount <= 0) return { ok: false, error: "Amount must be greater than zero." };

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("payment_obligations")
    .insert({
      payee_profile_id: params.payeeProfileId,
      payment_instruction_id: params.paymentInstructionId ?? null,
      source_type: params.sourceType,
      source_reference: params.sourceReference ?? null,
      description: params.description,
      currency: params.currency,
      amount: params.amount,
      status: "pending_approval",
      created_by: params.actorUserId,
    })
    .select("id")
    .single();
  if (error || !data) {
    console.error("[payments] failed to create payment_obligation", error?.message);
    return { ok: false, error: "Failed to create the payment obligation." };
  }

  await logActivity({
    actorUserId: params.actorUserId,
    action: "payment_obligation.created",
    entityType: "user",
    entityId: params.payeeProfileId,
    metadata: { obligationId: data.id, sourceType: params.sourceType, currency: params.currency, amount: params.amount },
  });

  return { ok: true, obligationId: data.id };
}

// Approval only — moves 'pending_approval' -> 'approved'. Still no
// money movement: payout_provider/payout_reference remain untouched,
// since no PayoutProvider is registered in this phase (see the type
// above). A real payout can only ever be initiated by a future phase
// that actually implements and registers a PayoutProvider.
export async function approvePaymentObligation(params: {
  obligationId: string;
  actorUserId: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const admin = createAdminClient();
  const { data: existing } = await admin.from("payment_obligations").select("status, payee_profile_id, amount, currency").eq("id", params.obligationId).maybeSingle();
  if (!existing) return { ok: false, error: "Payment obligation not found." };
  if (existing.status !== "pending_approval") return { ok: false, error: `Cannot approve — current status is "${existing.status}".` };

  const { error } = await admin
    .from("payment_obligations")
    .update({ status: "approved", approved_by: params.actorUserId, approved_at: new Date().toISOString() })
    .eq("id", params.obligationId);
  if (error) {
    console.error("[payments] failed to approve payment_obligation", error.message);
    return { ok: false, error: "Failed to approve." };
  }

  await logActivity({
    actorUserId: params.actorUserId,
    action: "payment_obligation.approved",
    entityType: "user",
    entityId: existing.payee_profile_id,
    metadata: { obligationId: params.obligationId, currency: existing.currency, amount: existing.amount },
  });

  return { ok: true };
}
