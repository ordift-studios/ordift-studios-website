"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/portal/roles";
import { createPaymentInstruction, setPaymentInstructionActive } from "@/lib/payments/payeeInstructions";

// Payee self-service (2026-09-04) — the desired eventual workflow:
// Ordift account -> classified as payee -> signs into their own
// account -> Payment Details -> enters their own destination ->
// becomes pending/unverified -> an authorized admin reviews/verifies
// it. Submission and verification are deliberately separate
// authorities: this file can create/deactivate a payee's OWN
// destination, and can NEVER verify one — verifyPaymentInstruction()
// is not imported here at all, only reachable from the admin surface
// (src/app/admin/payables/actions.ts), gated by
// finance.payment_instruction.verify or Super Admin.
//
// Security: profileId is NEVER read from form data here — every call
// below uses the signed-in user's own id as both the actor and the
// target profile, so a crafted request cannot submit or deactivate a
// destination for anyone else. createPaymentInstruction()/
// setPaymentInstructionActive() also independently re-verify this via
// isOwnPaymentDestination() (payeeInstructions.ts) — defense in depth,
// not reliance on this file alone getting it right.

export type PaymentDestinationState = { ok: boolean; error?: string } | null;

export async function createOwnPaymentInstructionAction(_prevState: PaymentDestinationState, formData: FormData): Promise<PaymentDestinationState> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Not signed in." };

  const method = String(formData.get("method") ?? "").trim();
  const country = String(formData.get("country") ?? "").trim();
  const currency = String(formData.get("currency") ?? "").trim();
  const accountHolderName = String(formData.get("accountHolderName") ?? "").trim();
  const institutionName = String(formData.get("institutionName") ?? "").trim() || null;
  const accountIdentifier = String(formData.get("accountIdentifier") ?? "").trim() || null;
  const routingIdentifier = String(formData.get("routingIdentifier") ?? "").trim() || null;
  const makeDefault = formData.get("makeDefault") === "on";

  const result = await createPaymentInstruction({
    profileId: user.id,
    method,
    country,
    currency,
    accountHolderName,
    institutionName,
    accountIdentifier,
    routingIdentifier,
    makeDefault,
    actorUserId: user.id,
  });
  if (!result.ok) return { ok: false, error: result.error };

  revalidatePath("/portal/payment-details");
  return { ok: true };
}

export async function deactivateOwnPaymentInstructionAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) return;

  const instructionId = String(formData.get("instructionId") ?? "").trim();
  if (!instructionId) return;

  const result = await setPaymentInstructionActive({ instructionId, active: false, actorUserId: user.id });
  if (!result.ok) console.error("[portal payment-details] deactivate failed", result.error);

  revalidatePath("/portal/payment-details");
}
