"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/portal/roles";
import { canVerifyBankTransfers } from "@/lib/payments/bankTransferAccess";
import { decideBankTransfer } from "@/lib/payments/bankTransferVerification";
import { finalizeVerifiedBankTransfer } from "@/lib/payments/gatewaySync";
import { logActivity } from "@/lib/admin/activityLog";
import { actionFail, actionOk, runAction, type ActionState } from "@/lib/shared/actionState";

// Authenticated + authorised + audited. Only a Super Admin or someone holding the explicit
// `finance.bank_transfer.verify` grant may verify — a general admin or staff role does not, so
// forging a form post gets nowhere. The database function checks the same rule again.
async function authorizeVerifier() {
  const user = await getCurrentUser();
  return user && (await canVerifyBankTransfers(user.id)) ? user : null;
}

const num = (v: FormDataEntryValue | null) => {
  const n = Number(String(v ?? "").replace(/,/g, "").trim());
  return String(v ?? "").trim() === "" || !Number.isFinite(n) ? null : n;
};
const text = (formData: FormData, key: string) => String(formData.get(key) ?? "");

export async function decideBankTransferAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const decision = text(formData, "decision");
  const user = await authorizeVerifier();
  if (!user) return actionFail("You're not authorised to verify bank transfers.");
  const paymentId = text(formData, "paymentId");
  if (!paymentId) return actionFail("Nothing was saved — the payment wasn't identified.");

  return runAction(async () => {
    const result = await decideBankTransfer({
      paymentId,
      verifierId: user.id,
      today: new Date().toISOString().slice(0, 10),
      input: {
        decision,
        receivedAmount: num(formData.get("receivedAmount")),
        receivedCurrency: text(formData, "receivedCurrency").trim().toUpperCase(),
        bankReference: text(formData, "bankReference"),
        receivedDate: text(formData, "receivedDate"),
        independentCheck: formData.get("independentCheck") === "on",
        internalNotes: text(formData, "internalNotes"),
        clientMessage: text(formData, "clientMessage"),
        acknowledgeExcess: formData.get("acknowledgeExcess") === "on",
      },
    });
    if (!result.ok) return actionFail(result.error);
    revalidatePath("/admin/payments");
    revalidatePath(`/admin/payments/${paymentId}`);
    revalidatePath("/admin/enquiries");
    const tail = result.warnings.length ? ` Note: ${result.warnings.join(" ")}` : "";
    if (result.decision === "approved") {
      const extra = result.excessReceived && result.excessReceived > 0 ? ` USD ${result.creditedReferenceUsd?.toFixed(2)} credited; the excess of ${result.excessReceived.toFixed(2)} is recorded for you to refund or credit manually.` : ` USD ${result.creditedReferenceUsd?.toFixed(2)} credited${result.partial ? " (partial payment — the balance remains outstanding)" : ""}.`;
      return actionOk(`Payment verified and posted.${extra}${tail}`);
    }
    return actionOk(result.decision === "rejected" ? "Payment rejected. The client has been shown the outcome in their portal." : "Additional information requested. The client can see your message in their portal.");
  }, "verify bank transfer");
}

// Safe to repeat: re-runs the existing idempotent completion steps (post to receivable, log once,
// queue receipt) for a payment that is already verified. Never changes status or amounts.
export async function finishBankTransferPostingAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await authorizeVerifier();
  if (!user) return actionFail("You're not authorised to do this.");
  const paymentId = text(formData, "paymentId");
  if (!paymentId) return actionFail("Nothing was saved — the payment wasn't identified.");
  return runAction(async () => {
    const r = await finalizeVerifiedBankTransfer(paymentId);
    await logActivity({ actorUserId: user.id, action: "payment.bank_transfer_posting_retried", entityType: "payment", entityId: paymentId, metadata: { outcome: r.outcome } });
    revalidatePath(`/admin/payments/${paymentId}`);
    revalidatePath("/admin/payments");
    return actionOk(r.outcome === "completed" ? "Posted to the receivable." : r.outcome === "already-handled" ? "Already posted — nothing to repeat." : "Nothing to post for this payment.");
  }, "finish posting");
}
