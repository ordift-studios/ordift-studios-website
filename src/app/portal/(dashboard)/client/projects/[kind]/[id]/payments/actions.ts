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

// Initiates a real Paystack checkout session and redirects the browser
// to the hosted checkout URL — UX Spec §4. Server Action rather than a
// Route Handler: this is a plain form submission that always ends in a
// redirect, no client-side fetch/JSON handling needed.
export async function startGatewayCheckoutAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user || !user.email) redirect("/portal/login");

  const kind = String(formData.get("kind") ?? "");
  const id = String(formData.get("id") ?? "");
  const paymentType = String(formData.get("paymentType") ?? "") as PaymentType;
  const requestedAmountRaw = formData.get("requestedAmountUsd");
  const requestedAmountUsd = requestedAmountRaw ? Number(requestedAmountRaw) : undefined;

  if (!isProjectKind(kind) || !id || !paymentType) {
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
  });

  if (!result.ok) {
    redirect(`/portal/client/projects/${kind}/${id}/payments/checkout?error=${encodeURIComponent(result.error)}`);
  }

  redirect(result.checkoutUrl);
}
