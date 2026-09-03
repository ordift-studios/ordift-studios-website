import { createAdminClient } from "@/lib/supabase/admin";
import { logActivity } from "@/lib/admin/activityLog";
import { isSuperAdminId, hasAuthority, authorizeWithSuperAdminOverride, FINANCE_CAPABILITIES } from "@/lib/organization/authority";

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

export async function getPaymentObligation(obligationId: string): Promise<PaymentObligation | null> {
  const admin = createAdminClient();
  const { data, error } = await admin.from("payment_obligations").select(SELECT).eq("id", obligationId).maybeSingle();
  if (error || !data) {
    if (error) console.error("[payments] failed to load payment_obligation", error.message);
    return null;
  }
  return mapObligation(data);
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
// Phase 3.4, Part 4 — the real enforcement point for
// finance.payment_obligation.approve (VAULT's capability). A restricted
// (non-Super-Admin) caller without that exact global authority is
// refused outright before anything is read or written.
export async function approvePaymentObligation(params: {
  obligationId: string;
  actorUserId: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const isSuperAdmin = await isSuperAdminId(params.actorUserId);
  if (!isSuperAdmin) {
    const authorized = await hasAuthority(params.actorUserId, FINANCE_CAPABILITIES.paymentObligationApprove, null);
    if (!authorized) return { ok: false, error: "Not authorized to approve payment obligations." };
  }

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

// ============================================================
// Universal Payables System (2026-09-03) — manual/external payment
// recording, and the PayoutProvider registry foundation.
// ============================================================

// Registry, not a hardcoded call — a future real provider registers
// itself here (e.g. registerPayoutProvider(paystackTransferProvider)),
// and initiateProviderPayout() below looks it up by name. Nothing
// registers anything today; the registry starts empty on purpose. This
// is the "safe foundation" requested — no live transfer/recipient
// logic, no assumption about any specific provider's account
// capability, is implemented here.
const payoutProviderRegistry = new Map<string, PayoutProvider>();

export function registerPayoutProvider(provider: PayoutProvider): void {
  payoutProviderRegistry.set(provider.name, provider);
}

// Deliberately NOT called by recordManualPayment() below — a manual
// payment is recorded by a human, never routed through a
// PayoutProvider. This function exists only so a future integrated-
// payout action path has a single, safe place to look up a registered
// provider; calling it today with any name always fails closed, since
// the registry is empty.
export async function initiateProviderPayout(params: {
  obligationId: string;
  providerName: string;
  amount: number;
  currency: string;
  destination: unknown;
}): Promise<{ ok: true; providerReference: string } | { ok: false; error: string }> {
  const provider = payoutProviderRegistry.get(params.providerName);
  if (!provider) return { ok: false, error: `No payout provider named "${params.providerName}" is registered.` };
  const result = await provider.initiateTransfer({
    obligationId: params.obligationId,
    amount: params.amount,
    currency: params.currency,
    destination: params.destination,
  });
  if (!result.ok) return result;
  return { ok: true, providerReference: result.providerReference };
}

// The ONLY controlled path from 'approved' to 'paid' when Ordift pays
// someone outside any integrated provider (bank transfer, mobile
// money, cash, or any other legitimate external method). A payable
// never becomes 'paid' by a bare status edit — this function requires
// the amount, method, date, and a reference, and always writes
// activity_log. payout_provider is set to the literal string 'manual'
// so a future report can distinguish manually-recorded payments from
// a genuine PayoutProvider-executed one at a glance.
// Pure, directly unit-testable guard — the actual thing that stops a
// payable becoming 'paid' via the wrong amount, the wrong currency, or
// a status that isn't 'approved'. Split out from recordManualPayment()
// below the same way canDelegate()/validateDelegationAuthority() in
// src/lib/organization/authority.ts separate a pure validator from its
// DB-backed wrapper — this is the money-safety-critical logic, worth
// verifying directly rather than only through the (DB-dependent, not
// locally runnable) async function.
export function validateManualPaymentAgainstObligation(params: {
  amount: number;
  currency: string;
  reference: string;
  obligation: { status: string; amount: number; currency: string };
}): { ok: true } | { ok: false; error: string } {
  if (params.amount <= 0) return { ok: false, error: "Amount must be greater than zero." };
  if (!params.reference.trim()) return { ok: false, error: "A payment reference is required." };
  if (params.obligation.status !== "approved") {
    return { ok: false, error: `Cannot record payment — current status is "${params.obligation.status}", not "approved".` };
  }
  // Guards against recording a payment for the wrong amount/currency by
  // accident — the obligation's own amount/currency (already
  // reconciled from its payable_items, if any) is the single source of
  // truth, never re-derived from the form input alone.
  if (params.amount !== params.obligation.amount || params.currency !== params.obligation.currency) {
    return { ok: false, error: `Amount/currency must match the payable exactly (${params.obligation.currency} ${params.obligation.amount}).` };
  }
  return { ok: true };
}

export async function recordManualPayment(params: {
  obligationId: string;
  method: string;
  amount: number;
  currency: string;
  paidAt: string;
  reference: string;
  actorUserId: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const auth = await authorizeWithSuperAdminOverride(params.actorUserId, FINANCE_CAPABILITIES.paymentObligationRecordPayment);
  if (!auth.ok) return { ok: false, error: "Not authorized to record a payment." };

  const admin = createAdminClient();
  const { data: existing } = await admin.from("payment_obligations").select("status, payee_profile_id, amount, currency").eq("id", params.obligationId).maybeSingle();
  if (!existing) return { ok: false, error: "Payment obligation not found." };

  const validation = validateManualPaymentAgainstObligation({ amount: params.amount, currency: params.currency, reference: params.reference, obligation: existing });
  if (!validation.ok) return validation;

  const { error } = await admin
    .from("payment_obligations")
    .update({
      status: "paid",
      payout_provider: "manual",
      payout_reference: `${params.method}:${params.reference}`,
      payout_initiated_at: params.paidAt,
      paid_at: params.paidAt,
    })
    .eq("id", params.obligationId);
  if (error) {
    console.error("[payments] failed to record manual payment", error.message);
    return { ok: false, error: "Failed to record the payment." };
  }

  await logActivity({
    actorUserId: params.actorUserId,
    action: "payment_obligation.paid_manually",
    entityType: "user",
    entityId: existing.payee_profile_id,
    metadata: { obligationId: params.obligationId, method: params.method, currency: existing.currency, amount: existing.amount, actedAsSuperAdminOverride: auth.actedAsOverride },
  });

  return { ok: true };
}
