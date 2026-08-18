import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { generateRecordId } from "@/lib/shared/recordId";
import { lockExchangeRate, convertedAmountsMatch } from "@/lib/payments/currency";
import { getActiveCountryConfig, getProvider } from "@/lib/payments/providerRegistry";
import type { PaymentEntityType, PaymentType } from "@/lib/payments/types";

// Checkout initiation — the one place that resolves an authoritative
// USD price server-side (PAYMENT_SECURITY_REVIEW.md §9/§10: never
// trust a client-supplied amount), locks the admin-controlled exchange
// rate, prevents a duplicate concurrent checkout for the same
// entity+payment_type (§8), and creates the payments row before
// calling out to the gateway.

export type InitiateCheckoutParams = {
  entityType: PaymentEntityType;
  entityId: string;
  paymentType: PaymentType;
  country: string; // 'GH' for Phase 2 — resolves currency + provider via payment_country_config
  userId: string | null;
  email: string;
  // A callback URL BASE (e.g. "https://.../payments") — the actual
  // payment id isn't known until the row below is created, so this
  // function appends "/{payment.id}/status" itself rather than
  // requiring the caller to somehow know the id in advance.
  callbackUrlBase: string;
  // Only meaningful for payment_type = 'deposit' or 'partial' — the
  // staff/client-chosen amount, still validated below against what's
  // actually still owed. 'balance' and 'full' are always computed
  // server-side, never accepted from the caller.
  requestedAmountUsd?: number;
  // TD-036 — the converted amount the customer actually saw on the
  // checkout page immediately before submitting. Required, not
  // optional: the one legitimate caller (startGatewayCheckoutAction)
  // always has this, and the whole point of the guard below is that
  // it can't be silently skipped by a caller that simply omits it.
  // Never trusted as the source of truth — only ever compared against
  // a freshly-locked rate, never used to compute the actual charge.
  quotedConvertedAmount: number;
};

export type InitiateCheckoutResult =
  | { ok: true; checkoutUrl: string; paymentId: string }
  | { ok: false; error: "rate_changed"; currentRateToUsd: number; currentConvertedAmount: number; currencyCode: string }
  | { ok: false; error: string };

// Exported so the bank-transfer initiation route can reuse the exact
// same ownership-scoped lookup and balance-bounding logic rather than
// re-deriving amounts from a client-supplied value (Security Review
// §9/§10 applies equally to bank transfers, not just gateway checkout).
export async function resolveEntityAmounts(
  entityType: PaymentEntityType,
  entityId: string
): Promise<{ amountDueUsd: number; amountPaidUsd: number } | null> {
  const supabase = await createClient();
  const table = entityType === "enquiry" ? "enquiries" : "workshop_registrations";

  const { data, error } = await supabase
    .from(table)
    .select("amount_due, amount_paid")
    .eq("id", entityId)
    .maybeSingle();

  if (error || !data) {
    console.error(`[payments] failed to resolve ${table} amounts`, error?.message);
    return null;
  }

  return {
    amountDueUsd: Number(data.amount_due ?? 0),
    amountPaidUsd: Number(data.amount_paid ?? 0),
  };
}

export function resolveAmountToCharge(
  paymentType: PaymentType,
  amountDueUsd: number,
  amountPaidUsd: number,
  requestedAmountUsd: number | undefined
): number | null {
  const balanceRemaining = Math.round((amountDueUsd - amountPaidUsd) * 100) / 100;

  if (paymentType === "full" || paymentType === "balance") {
    // Always server-computed — a client-supplied amount is never
    // trusted for these two types (Security Review §10).
    return balanceRemaining > 0 ? balanceRemaining : null;
  }

  if (paymentType === "deposit" || paymentType === "partial") {
    if (requestedAmountUsd == null || requestedAmountUsd <= 0) return null;
    // Still bounded by what's actually owed — a requested amount
    // greater than the remaining balance is rejected, not clamped
    // silently (clamping would let a manipulated request quietly
    // succeed at a different amount than what it asked for).
    if (requestedAmountUsd > balanceRemaining) return null;
    return Math.round(requestedAmountUsd * 100) / 100;
  }

  return null;
}

export async function initiateGatewayCheckout(
  params: InitiateCheckoutParams
): Promise<InitiateCheckoutResult> {
  // TD-036 — fail safe rather than silently proceeding without
  // reconciliation if the quote is missing or malformed. The type
  // signature already makes this required for the one legitimate
  // caller; this is the runtime backstop for a malformed/tampered
  // request reaching this function some other way.
  if (!Number.isFinite(params.quotedConvertedAmount)) {
    return { ok: false, error: "missing-quote" };
  }

  const countryConfig = await getActiveCountryConfig(params.country);
  if (!countryConfig) {
    return { ok: false, error: "no-active-payment-config-for-country" };
  }

  const amounts = await resolveEntityAmounts(params.entityType, params.entityId);
  if (!amounts) {
    return { ok: false, error: "entity-not-found" };
  }

  const amountToCharge = resolveAmountToCharge(
    params.paymentType,
    amounts.amountDueUsd,
    amounts.amountPaidUsd,
    params.requestedAmountUsd
  );
  if (amountToCharge == null) {
    return { ok: false, error: "invalid-or-unavailable-amount" };
  }

  const lockedRate = await lockExchangeRate(amountToCharge, countryConfig.defaultCurrencyCode);
  if (!lockedRate) {
    return { ok: false, error: "no-exchange-rate-set" };
  }

  // TD-036 — server-authoritative compare-and-reconfirm. lockedRate is
  // the one fresh read of the current rate; comparison and the
  // eventual payments insert below both use this exact same value, so
  // there is no gap between "decided the quote is still valid" and
  // "created the payment" for a rate change to slip through. On a
  // mismatch, nothing below this point runs — no duplicate-checkout
  // check, no insert, no gateway call — the caller gets the fresh
  // rate back and must resubmit, which re-runs this identical check
  // against whatever is current at that later moment. Never a
  // privileged second attempt.
  if (!convertedAmountsMatch(params.quotedConvertedAmount, lockedRate.convertedAmount)) {
    return {
      ok: false,
      error: "rate_changed",
      currentRateToUsd: lockedRate.rateToUsd,
      currentConvertedAmount: lockedRate.convertedAmount,
      currencyCode: lockedRate.currencyCode,
    };
  }

  // Duplicate-checkout prevention (Security Review §8) — an existing
  // pending gateway payment for the same entity+payment_type is
  // reused rather than starting a second one. Uses the admin client
  // since this check spans a table clients can't SELECT beyond their
  // own rows, and this runs regardless of who's checking out.
  const admin = createAdminClient();
  const { data: existing } = await admin
    .from("payments")
    .select("id, gateway_reference, status")
    .eq("entity_type", params.entityType)
    .eq("entity_id", params.entityId)
    .eq("payment_type", params.paymentType)
    .eq("payment_method", "gateway")
    .eq("status", "pending")
    .maybeSingle();

  if (existing?.gateway_reference) {
    // Re-resolve the same checkout URL from Paystack would require a
    // second API call; simplest correct behavior for Phase 2 is to
    // tell the caller a session is already in progress and let the
    // UI re-poll/re-fetch rather than silently opening a second one.
    return { ok: false, error: "checkout-already-in-progress" };
  }

  const provider = getProvider(countryConfig.gatewayProvider);
  const recordId = await generateRecordId("PAY");

  const { data: payment, error: insertError } = await admin
    .from("payments")
    .insert({
      record_id: recordId,
      entity_type: params.entityType,
      entity_id: params.entityId,
      user_id: params.userId,
      reference_amount_usd: amountToCharge,
      payment_currency: lockedRate.currencyCode,
      exchange_rate: lockedRate.rateToUsd,
      exchange_rate_source: lockedRate.source,
      exchange_rate_locked_at: lockedRate.lockedAt,
      converted_amount: lockedRate.convertedAmount,
      payment_type: params.paymentType,
      payment_method: "gateway",
      status: "pending",
      provider: provider.id,
    })
    .select("id")
    .single();

  if (insertError || !payment) {
    console.error("[payments] failed to create payments row", insertError?.message);
    return { ok: false, error: "failed-to-create-payment" };
  }

  try {
    const charge = await provider.initCharge({
      paymentId: payment.id,
      amount: lockedRate.convertedAmount,
      currency: lockedRate.currencyCode,
      email: params.email,
      reference: recordId,
      callbackUrl: `${params.callbackUrlBase}/${payment.id}/status`,
      metadata: { paymentId: payment.id, entityType: params.entityType, entityId: params.entityId },
    });

    await admin.from("payments").update({ gateway_reference: charge.providerReference }).eq("id", payment.id);

    return { ok: true, checkoutUrl: charge.checkoutUrl, paymentId: payment.id };
  } catch (err) {
    console.error("[payments] initCharge failed", err);
    await admin.from("payments").update({ status: "failed" }).eq("id", payment.id);
    return { ok: false, error: "gateway-init-failed" };
  }
}
