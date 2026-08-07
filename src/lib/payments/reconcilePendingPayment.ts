import { createAdminClient } from "@/lib/supabase/admin";
import { getProvider } from "@/lib/payments/providerRegistry";
import { applyGatewayEventToPayment } from "@/lib/payments/gatewaySync";
import type { PaymentStatus } from "@/lib/payments/types";

// Active safety net for gateway checkouts stuck at "pending" —
// webhooks are best-effort, not guaranteed. A checkout the customer
// abandons, or one a card issuer declines before Paystack's backend
// ever completes a full charge attempt, can leave us with no webhook
// at all (confirmed on staging 2026-08-07: two separate declined test
// attempts, including Paystack's own documented "Declined" test card,
// produced zero payment_webhook_events rows). Without this, the
// payment status page shows "Confirming Your Payment" forever, and
// checkoutService.ts's duplicate-checkout guard blocks the customer
// from starting a new attempt of the same payment_type while the
// stale row exists.
//
// Called from the status page whenever it renders a payment still at
// "pending" — idempotent and safe to call on every page load/refresh,
// since it no-ops immediately once the payment resolves.
export async function reconcilePendingGatewayPayment(paymentId: string): Promise<PaymentStatus> {
  const admin = createAdminClient();

  const { data: payment } = await admin
    .from("payments")
    .select(
      "id, entity_type, entity_id, converted_amount, payment_currency, provider, payment_method, status, gateway_reference"
    )
    .eq("id", paymentId)
    .maybeSingle();

  if (!payment) return "pending";
  if (payment.status !== "pending") return payment.status as PaymentStatus;
  if (payment.payment_method !== "gateway" || !payment.gateway_reference) return "pending";

  let provider;
  try {
    provider = getProvider(payment.provider);
  } catch {
    return "pending";
  }

  const event = await provider.verifyTransaction(payment.gateway_reference);
  if (event.status !== "completed" && event.status !== "failed") {
    // Still genuinely in progress on the gateway's side (e.g. mobile
    // money awaiting the customer's phone approval), or an unrecognized
    // status — leave it pending rather than resolving prematurely.
    return "pending";
  }

  const result = await applyGatewayEventToPayment(payment, event, "verify");
  if (result.outcome === "completed") return "completed";
  if (result.outcome === "failed" || result.outcome === "amount-mismatch") return "failed";
  return "pending";
}
