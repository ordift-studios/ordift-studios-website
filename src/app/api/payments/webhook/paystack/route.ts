import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { paystackProvider } from "@/lib/payments/providers/paystack";
import { checkAndMarkWebhookEvent } from "@/lib/payments/paymentIdempotency";
import { applyGatewayEventToPayment } from "@/lib/payments/gatewaySync";

// Paystack webhook handler — Ghana, Phase 2 (sandbox/test mode until
// go-live authorization). Every step here maps directly to a numbered
// section of PAYMENT_SECURITY_REVIEW.md:
//
// 1. Read the RAW body (§5) — signature verification must run over the
//    exact bytes Paystack sent, before any JSON.parse.
// 2. Verify signature (§5) — fail closed (401) on any failure.
// 3. Replay/age check (§6) — reject webhooks older than a bounded window.
// 4. Idempotency (§7) — fail closed on a store outage, not open.
// 5. Log to payment_webhook_events unconditionally (§17/§19) — even a
//    webhook that fails to match a known payment is recorded.
// 6. Amount/currency validation (§9) — a mismatch marks the payment
//    failed, never silently accepted.
// 7. Update payments + the payable entity's amount_paid/payment_status.
// 8. activity_log via logActivityAsSystem() — no human session exists
//    in this request.
//
// Uses the admin/secret-key client throughout (createAdminClient()) —
// a webhook request carries no user session or cookies at all.

const REPLAY_WINDOW_MS = 5 * 60 * 1000; // 5 minutes — Security Review §6

export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const signatureHeader = request.headers.get("x-paystack-signature");

  // Wrapped in try/catch so any failure mode — a bad signature, or the
  // secret key itself being unset/misconfigured — fails closed with the
  // intended 401 rather than propagating as an unhandled 500.
  let signatureValid: boolean;
  try {
    signatureValid = paystackProvider.verifyWebhookSignature(rawBody, signatureHeader);
  } catch (err) {
    console.error("[payments] paystack webhook: signature verification threw", err);
    signatureValid = false;
  }
  if (!signatureValid) {
    console.error("[payments] paystack webhook: invalid signature");
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  let event: ReturnType<typeof paystackProvider.parseWebhookEvent>;
  try {
    event = paystackProvider.parseWebhookEvent(rawBody);
  } catch (err) {
    console.error("[payments] paystack webhook: failed to parse body", err);
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const admin = createAdminClient();

  // Log every webhook unconditionally, signature-valid path only
  // (an invalid signature never reaches this far) — the full audit
  // trail this table exists for (architecture proposal §4).
  const { data: loggedEvent } = await admin
    .from("payment_webhook_events")
    .insert({
      provider: "paystack",
      event_type: event.eventType,
      gateway_reference: event.gatewayReference,
      signature_valid: true,
      raw_payload: event.raw,
    })
    .select("id, received_at")
    .single();

  // Replay/age check — Paystack doesn't embed a timestamp in the
  // signed payload itself, so this checks against when *we* first saw
  // this exact event, using payment_webhook_events as the age anchor.
  // A genuinely new event has no prior row with the same
  // gateway_reference + event_type older than the window; if one
  // exists, this is either a legitimate fast retry (handled by the
  // idempotency check below) or a delayed replay (rejected here).
  if (loggedEvent && event.gatewayReference) {
    const { data: priorEvents } = await admin
      .from("payment_webhook_events")
      .select("received_at")
      .eq("gateway_reference", event.gatewayReference)
      .eq("event_type", event.eventType)
      .neq("id", loggedEvent.id)
      .order("received_at", { ascending: true })
      .limit(1);

    const firstSeenAt = priorEvents?.[0]?.received_at;
    if (firstSeenAt && Date.now() - new Date(firstSeenAt).getTime() > REPLAY_WINDOW_MS) {
      console.warn("[payments] paystack webhook: outside replay window, treating as stale", {
        gatewayReference: event.gatewayReference,
      });
      // Still 200 — Paystack should not retry a stale event forever;
      // it's logged (above) for investigation, just not processed.
      return NextResponse.json({ ok: true, processed: false, reason: "outside-replay-window" });
    }
  }

  // Idempotency — fails closed (Security Review §7): a store outage
  // returns a retriable error rather than risking double-processing.
  const idempotencyKey = `${event.eventType}:${event.gatewayReference ?? "unknown"}`;
  const idempotency = await checkAndMarkWebhookEvent(idempotencyKey);
  if (idempotency.outcome === "store_unavailable") {
    return NextResponse.json({ ok: false, error: "idempotency-store-unavailable" }, { status: 503 });
  }
  if (idempotency.outcome === "duplicate") {
    return NextResponse.json({ ok: true, processed: false, reason: "duplicate" });
  }

  if (!event.gatewayReference) {
    return NextResponse.json({ ok: true, processed: false, reason: "no-gateway-reference" });
  }

  const { data: payment } = await admin
    .from("payments")
    .select(
      "id, entity_type, entity_id, user_id, converted_amount, payment_currency, reference_amount_usd, payment_type, status"
    )
    .eq("gateway_reference", event.gatewayReference)
    .maybeSingle();

  if (!payment) {
    console.error("[payments] paystack webhook: no matching payment for reference", event.gatewayReference);
    return NextResponse.json({ ok: true, processed: false, reason: "no-matching-payment" });
  }

  if (loggedEvent) {
    // processed_at marks when this event's business logic actually ran
    // (as opposed to received_at, when it merely arrived) — distinct
    // moments once retries/replay-window rejection can delay
    // processing. Set once here, at the point processing genuinely
    // begins, not left null (a gap in the original implementation,
    // caught during the pre-migration architecture review).
    await admin
      .from("payment_webhook_events")
      .update({ payment_id: payment.id, processed_at: new Date().toISOString() })
      .eq("id", loggedEvent.id);
  }

  // Amount/currency validation, payments row update, entity sync,
  // activity logging, and the receipt email all live in
  // applyGatewayEventToPayment() — shared with the active-reconciliation
  // path (reconcilePendingPayment.ts) used from the payment status page,
  // since a webhook is only one of two ways this outcome can be learned.
  const result = await applyGatewayEventToPayment(payment, event, "webhook");

  return NextResponse.json({ ok: true, processed: true, result: result.outcome });
}
