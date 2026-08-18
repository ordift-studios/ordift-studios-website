"use server";

import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/portal/roles";
import { isProjectKind, type ProjectKind } from "@/lib/portal/workspace";
import { initiateGatewayCheckout } from "@/lib/payments/checkoutService";
import type { PaymentEntityType, PaymentType } from "@/lib/payments/types";
import { checkRateLimit } from "@/lib/shared/rateLimit";

// Ghana-first (architecture proposal §6/§13) — no country selector in
// the UI yet since payment_country_config has exactly one active row.
// Adding Qatar later is a UI addition here, not a rewrite of this
// action — the same reasoning as every other "config row, not code
// change" point in the architecture.
const ACTIVE_COUNTRY = "GH";

function toPaymentEntityType(kind: ProjectKind): PaymentEntityType {
  return kind === "enquiry" ? "enquiry" : "workshop_registration";
}

// TD-036 — state shape for the useActionState-driven confirm-gateway
// form. Every field beyond `error` is only ever populated for the
// "rate_changed" case, giving CheckoutForm the fresh rate/amount to
// re-render with in place, without a page navigation.
export type GatewayCheckoutState = {
  error: string | null;
  currentRateToUsd?: number;
  currentConvertedAmount?: number;
  currencyCode?: string;
};

// Initiates a real Paystack checkout session and redirects the browser
// to the hosted checkout URL — UX Spec §4. useActionState (not a
// plain <form action> as before TD-036) because a rate_changed result
// must re-render this form in place with the fresh amount rather than
// navigate away and lose the customer's amount/method selection —
// every other outcome (success, or any pre-existing error) still
// redirects exactly as before.
export async function startGatewayCheckoutAction(
  _prevState: GatewayCheckoutState,
  formData: FormData
): Promise<GatewayCheckoutState> {
  const user = await getCurrentUser();
  if (!user || !user.email) redirect("/portal/login");

  const kind = String(formData.get("kind") ?? "");
  const id = String(formData.get("id") ?? "");
  const paymentType = String(formData.get("paymentType") ?? "") as PaymentType;
  const requestedAmountRaw = formData.get("requestedAmountUsd");
  const requestedAmountUsd = requestedAmountRaw ? Number(requestedAmountRaw) : undefined;
  const quotedConvertedAmount = Number(formData.get("quotedConvertedAmount"));

  if (!isProjectKind(kind) || !id || !paymentType || !Number.isFinite(quotedConvertedAmount)) {
    redirect(`/portal/client/projects/${kind}/${id}/payments/checkout?error=invalid-request`);
  }

  const rateLimit = await checkRateLimit(`checkout-init:${user.id}`);
  if (!rateLimit.allowed) {
    redirect(`/portal/client/projects/${kind}/${id}/payments/checkout?error=rate-limited`);
  }

  const origin = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const callbackUrlBase = `${origin}/portal/client/projects/${kind}/${id}/payments`;

  const result = await initiateGatewayCheckout({
    entityType: toPaymentEntityType(kind as ProjectKind),
    entityId: id,
    paymentType,
    country: ACTIVE_COUNTRY,
    userId: user.id,
    email: user.email,
    callbackUrlBase,
    requestedAmountUsd,
    quotedConvertedAmount,
  });

  if (!result.ok) {
    // "in" checks, not `result.error === "..."` — the fallback
    // variant's error is a wide `string`, so TS can't prove narrowing
    // from a literal comparison alone; property presence narrows
    // reliably regardless.
    if ("currentRateToUsd" in result) {
      return {
        error: "rate_changed",
        currentRateToUsd: result.currentRateToUsd,
        currentConvertedAmount: result.currentConvertedAmount,
        currencyCode: result.currencyCode,
      };
    }
    // TD-043 — an earlier attempt for this same balance was found to
    // already be paid (reconciled against Paystack's own record, not
    // guessed). Route to that payment's receipt rather than erroring
    // or silently letting the customer open a second charge.
    if ("paymentId" in result) {
      redirect(`/portal/client/projects/${kind}/${id}/payments/${result.paymentId}/receipt`);
    }
    redirect(`/portal/client/projects/${kind}/${id}/payments/checkout?error=${encodeURIComponent(result.error)}`);
  }

  redirect(result.checkoutUrl);
}
