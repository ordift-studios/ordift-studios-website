import { createAdminClient } from "@/lib/supabase/admin";
import { logActivity } from "@/lib/admin/activityLog";
import { finalizeVerifiedBankTransfer } from "@/lib/payments/gatewaySync";
import { describeVerificationError, validateVerificationInput, type VerificationInput } from "@/lib/payments/bankTransferRules";

// Server side of the Pending Verification workflow. The decision itself is ONE atomic, row-locked
// database call (verify_bank_transfer_payment); this module wraps it with authorization context,
// the audit trail, and the existing completion side effects. Callers must already have checked
// that the user may verify payments (page gate + approve_bank_transfer capability).

export type VerificationResult =
  | { ok: true; decision: "approved" | "rejected" | "info_requested"; creditedReferenceUsd?: number; excessReceived?: number; partial?: boolean; warnings: string[] }
  | { ok: false; error: string };

export async function decideBankTransfer(params: { paymentId: string; verifierId: string; input: VerificationInput; today: string }): Promise<VerificationResult> {
  const check = validateVerificationInput(params.input, params.today);
  if (!check.ok) return { ok: false, error: check.error };
  const i = params.input;
  const admin = createAdminClient();

  const { data, error } = await admin.rpc("verify_bank_transfer_payment", {
    p_payment_id: params.paymentId,
    p_decision: check.decision,
    p_verifier: params.verifierId,
    p_received_amount: check.decision === "approved" ? i.receivedAmount : null,
    p_received_currency: check.decision === "approved" ? i.receivedCurrency : null,
    p_bank_reference: check.decision === "approved" ? i.bankReference.trim() : null,
    p_received_date: check.decision === "approved" ? i.receivedDate : null,
    p_independent_check: i.independentCheck,
    p_internal_notes: i.internalNotes.trim() || null,
    p_client_message: i.clientMessage.trim() || null,
    p_acknowledge_excess: i.acknowledgeExcess,
  });
  if (error) return { ok: false, error: describeVerificationError(error.message) };

  const result = (data ?? {}) as { decision?: string; credited_reference_usd?: number; excess_received?: number; partial?: boolean };
  const warnings: string[] = [];
  const action = check.decision === "approved" ? "payment.bank_transfer_verified" : check.decision === "rejected" ? "payment.bank_transfer_rejected" : "payment.bank_transfer_info_requested";
  await logActivity({
    actorUserId: params.verifierId,
    action,
    entityType: "payment",
    entityId: params.paymentId,
    metadata:
      check.decision === "approved"
        ? { receivedAmount: i.receivedAmount, receivedCurrency: i.receivedCurrency, bankReference: i.bankReference.trim(), receivedDate: i.receivedDate, creditedReferenceUsd: result.credited_reference_usd, excessReceived: result.excess_received, partial: result.partial, independentCheckConfirmed: true }
        : { reason: i.internalNotes.trim() || undefined, clientMessage: i.clientMessage.trim() || undefined },
  });

  if (check.decision === "approved") {
    // Post to the receivable, log once, queue the receipt. Idempotent; if it fails the payment is
    // already (correctly) completed and "Finish posting" on the payment page re-runs it safely.
    try {
      await finalizeVerifiedBankTransfer(params.paymentId);
    } catch (err) {
      console.error("[payments] finalizing verified bank transfer failed", params.paymentId, err);
      warnings.push("The payment is verified, but posting it to the receivable didn't finish. Use “Finish posting” on the payment page — it is safe to repeat.");
    }
  }
  return { ok: true, decision: check.decision, creditedReferenceUsd: result.credited_reference_usd, excessReceived: result.excess_received, partial: result.partial, warnings };
}

// Short-lived signed link to the client's proof file. The caller must have authorised the user
// (admin/super_admin); each view is audited. The bucket is private and never publicly listable.
export async function createProofViewUrl(params: { paymentId: string; viewerId: string }): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const admin = createAdminClient();
  const { data: payment } = await admin.from("payments").select("id, proof_of_payment_asset_path").eq("id", params.paymentId).maybeSingle();
  if (!payment?.proof_of_payment_asset_path) return { ok: false, error: "No proof of payment has been uploaded for this payment." };
  const { data, error } = await admin.storage.from("payment-proofs").createSignedUrl(payment.proof_of_payment_asset_path as string, 120);
  if (error || !data?.signedUrl) return { ok: false, error: "Couldn't open the file. Please try again." };
  await logActivity({ actorUserId: params.viewerId, action: "payment.proof_viewed", entityType: "payment", entityId: params.paymentId });
  return { ok: true, url: data.signedUrl };
}

export type VerificationHistoryItem = {
  id: string; decision: string; decidedAt: string; decidedBy: string | null; decidedByLabel: string | null;
  expectedAmount: number; expectedCurrency: string; receivedAmount: number | null; receivedCurrency: string | null;
  bankReference: string | null; receivedDate: string | null; creditedReferenceUsd: number | null; excessReceived: number | null;
  internalNotes: string | null; clientMessage: string | null;
};

// Audit identity standard: member number is the authoritative actor label.
export async function listVerificationHistory(paymentId: string): Promise<VerificationHistoryItem[]> {
  const admin = createAdminClient();
  const { data } = await admin.from("bank_transfer_verifications").select("*").eq("payment_id", paymentId).order("decided_at", { ascending: true });
  const rows = data ?? [];
  const ids = [...new Set(rows.map((r) => r.decided_by as string))];
  const labels = new Map<string, string>();
  if (ids.length) {
    const { data: profiles } = await admin.from("profiles").select("id, full_name, member_number").in("id", ids);
    for (const p of profiles ?? []) labels.set(p.id as string, (p.member_number as string | null) ?? (p.full_name as string | null) ?? "Unnamed profile");
  }
  const num = (v: unknown) => (v == null ? null : Number(v));
  return rows.map((r) => ({
    id: r.id as string, decision: r.decision as string, decidedAt: r.decided_at as string, decidedBy: r.decided_by as string, decidedByLabel: labels.get(r.decided_by as string) ?? null,
    expectedAmount: Number(r.expected_amount), expectedCurrency: r.expected_currency as string, receivedAmount: num(r.received_amount), receivedCurrency: (r.received_currency as string | null) ?? null,
    bankReference: (r.bank_reference as string | null) ?? null, receivedDate: (r.received_date as string | null) ?? null, creditedReferenceUsd: num(r.credited_reference_usd), excessReceived: num(r.excess_received),
    internalNotes: (r.internal_notes as string | null) ?? null, clientMessage: (r.client_message as string | null) ?? null,
  }));
}
