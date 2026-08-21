import crypto from "node:crypto";
import type {
  ChargeParams,
  ChargeResult,
  PaymentChannel,
  PaymentProvider,
  PaymentWebhookEvent,
  RefundParams,
  RefundResult,
} from "@/lib/payments/types";

// Paystack adapter — Ghana, Phase 2 (sandbox/test mode only until
// explicit go-live authorization). Hand-rolled REST client against
// Paystack's documented API (https://paystack.com/docs/api/), not an
// npm SDK — deliberate, avoids adding a new dependency for a small,
// stable API surface (initialize/verify/refund + one webhook shape).
//
// Correction (2026-08-06, caught while implementing): PAYMENT_SECURITY_
// REVIEW.md §5 stated Paystack signs webhooks with HMAC-SHA256 — that
// was wrong. Paystack's own documented algorithm is HMAC-SHA512. Fixed
// here in the actual verification code; the doc should be corrected to
// match (flagged in this session's delivery, not silently left
// inconsistent).
//
// Amounts: Paystack's API takes/returns amounts in the currency's
// smallest unit (pesewas for GHS, 100 pesewas = GHS 1) — every method
// below converts at the boundary so the rest of the payments module
// only ever deals in major-unit currency (matches `payments.converted_amount`'s
// numeric(12,2) shape).

const PAYSTACK_API_BASE = "https://api.paystack.co";

function requireSecretKey(): string {
  const key = process.env.PAYSTACK_SECRET_KEY;
  if (!key) {
    throw new Error("[paystack] PAYSTACK_SECRET_KEY is not set — cannot call the Paystack API");
  }
  return key;
}

function toMinorUnit(amount: number): number {
  return Math.round(amount * 100);
}

function toMajorUnit(amount: number): number {
  return amount / 100;
}

type PaystackInitializeResponse = {
  status: boolean;
  message: string;
  data?: { authorization_url: string; access_code: string; reference: string };
};

type PaystackRefundResponse = {
  status: boolean;
  message: string;
  data?: { status: string; id: number };
};

// GET /transaction/verify/:reference response shape — data.status here
// is Paystack's transaction status ('success' | 'failed' | 'abandoned'
// | 'reversed' | ...), distinct from the top-level 'status: boolean'
// (which only means "did this API call itself succeed").
type PaystackVerifyResponse = {
  status: boolean;
  message: string;
  data?: PaystackChargeEventData & { status: string };
};

// Paystack's charge.success webhook payload shape — only the fields
// this adapter actually reads are typed; the full raw payload is still
// stored verbatim in payment_webhook_events.raw_payload for anything
// not modeled here.
type PaystackChargeEventData = {
  reference: string;
  amount: number; // minor unit
  currency: string;
  channel?: string; // 'card' | 'mobile_money' | 'bank' | 'apple_pay', etc.
  fees?: number; // minor unit
  authorization?: { card_type?: string; bin?: string; last4?: string; channel?: string };
};

// Paystack's refund.processed webhook payload shape — a genuinely
// different shape from a charge event, not a variant of it. Confirmed
// directly against a real captured Production payload (2026-08-21,
// PAY-2026-000003's GHS 11.09 partial refund), not inferred from
// documentation: transaction_reference is the *original* transaction's
// reference (the same value Ordift's own initCharge() supplied as
// `reference`, later echoed back — the same field a charge.success
// event's own `reference` carries), while refund_reference is the
// refund's own, separate identifier. amount is minor-unit, same
// convention as charge events.
type PaystackRefundEventData = {
  id: string;
  amount: number; // minor unit
  currency: string;
  status: string;
  refund_reference: string;
  transaction_reference: string;
  customer_note?: string;
  merchant_note?: string;
};

type PaystackWebhookPayload = {
  event: string; // 'charge.success' | 'charge.failed' | 'refund.processed' | ...
  data: PaystackChargeEventData | PaystackRefundEventData;
};

function mapChannel(raw: string | undefined): PaymentChannel | null {
  switch (raw) {
    case "mobile_money":
      return "mobile_money";
    case "card":
      return "card";
    case "bank":
    case "bank_transfer":
      return "bank";
    case "apple_pay":
      return "apple_pay";
    case "google_pay":
      return "google_pay";
    default:
      return null;
  }
}

export const paystackProvider: PaymentProvider = {
  id: "paystack",
  supportedCurrencies: ["GHS"],

  async initCharge(params: ChargeParams): Promise<ChargeResult> {
    const response = await fetch(`${PAYSTACK_API_BASE}/transaction/initialize`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${requireSecretKey()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email: params.email,
        amount: toMinorUnit(params.amount),
        currency: params.currency,
        reference: params.reference,
        callback_url: params.callbackUrl,
        metadata: params.metadata ?? {},
      }),
    });

    const body = (await response.json()) as PaystackInitializeResponse;
    if (!response.ok || !body.status || !body.data) {
      throw new Error(`[paystack] initCharge failed: ${body.message ?? response.statusText}`);
    }

    return {
      checkoutUrl: body.data.authorization_url,
      providerReference: body.data.reference,
    };
  },

  verifyWebhookSignature(rawBody: string, signatureHeader: string | null): boolean {
    if (!signatureHeader) return false;
    const expected = crypto.createHmac("sha512", requireSecretKey()).update(rawBody).digest("hex");
    // Constant-time comparison — a plain === would leak timing
    // information about how many leading bytes matched, which a
    // determined attacker could use to forge a valid signature byte by
    // byte. Both buffers must be equal length for timingSafeEqual, so
    // a length mismatch is checked first and treated as invalid.
    const expectedBuf = Buffer.from(expected, "hex");
    const actualBuf = Buffer.from(signatureHeader, "hex");
    if (expectedBuf.length !== actualBuf.length) return false;
    return crypto.timingSafeEqual(expectedBuf, actualBuf);
  },

  parseWebhookEvent(rawBody: string): PaymentWebhookEvent {
    const payload = JSON.parse(rawBody) as PaystackWebhookPayload;

    if (payload.event === "refund.processed") {
      // A genuinely different payload shape from a charge event — see
      // PaystackRefundEventData's own comment for how this was
      // confirmed. gatewayReference is deliberately the *original*
      // transaction's reference (transaction_reference), not the
      // refund's own — so the existing gateway_reference-based payment
      // lookup (src/app/api/payments/webhook/paystack/route.ts) finds
      // the original payment unchanged, exactly as it already does for
      // charge events. The refund's own reference goes in
      // refundReference, kept separate so it can't be confused with
      // the lookup key.
      const data = payload.data as PaystackRefundEventData;
      return {
        eventType: payload.event,
        gatewayReference: data?.transaction_reference ?? null,
        refundReference: data?.refund_reference ?? null,
        status: "refunded",
        amount: data?.amount != null ? toMajorUnit(data.amount) : null,
        currency: data?.currency ?? null,
        channel: null,
        cardBrand: null,
        cardLast4: null,
        gatewayFee: null,
        raw: payload as unknown as Record<string, unknown>,
      };
    }

    const data = payload.data as PaystackChargeEventData;
    const status: PaymentWebhookEvent["status"] =
      payload.event === "charge.success" ? "completed" : payload.event === "charge.failed" ? "failed" : "unknown";

    return {
      eventType: payload.event,
      gatewayReference: data?.reference ?? null,
      refundReference: null,
      status,
      amount: data?.amount != null ? toMajorUnit(data.amount) : null,
      currency: data?.currency ?? null,
      channel: mapChannel(data?.channel ?? data?.authorization?.channel),
      cardBrand: data?.authorization?.card_type ?? null,
      cardLast4: data?.authorization?.last4 ?? null,
      gatewayFee: data?.fees != null ? toMajorUnit(data.fees) : null,
      raw: payload as unknown as Record<string, unknown>,
    };
  },

  async verifyTransaction(reference: string): Promise<PaymentWebhookEvent> {
    const response = await fetch(`${PAYSTACK_API_BASE}/transaction/verify/${encodeURIComponent(reference)}`, {
      headers: { Authorization: `Bearer ${requireSecretKey()}` },
    });

    const body = (await response.json()) as PaystackVerifyResponse;
    const data = body.data;

    // A non-ok/unsuccessful response (most commonly "Transaction
    // reference not found") means Paystack never created a transaction
    // record for this reference at all — the checkout widget rejected
    // it client-side before a charge attempt reached their backend.
    // That's a decisive, permanent "failed": no webhook or later verify
    // call will ever resolve it either, since there's nothing on
    // Paystack's side to resolve. Logged, not swallowed silently — a
    // gap the first version of this method had.
    if (!response.ok || !body.status) {
      console.error("[paystack] verifyTransaction: API call unsuccessful, treating as failed", {
        reference,
        httpStatus: response.status,
        message: body.message,
      });
      return {
        eventType: "transaction.verify",
        gatewayReference: reference,
        refundReference: null,
        status: "failed",
        amount: null,
        currency: null,
        channel: null,
        cardBrand: null,
        cardLast4: null,
        gatewayFee: null,
        raw: body as unknown as Record<string, unknown>,
      };
    }

    // "abandoned"/"failed" both mean no charge will ever land — the
    // customer sees the same "Payment Failed, try again" outcome
    // either way. "reversed" is Paystack's own refund-equivalent
    // status. Anything else (e.g. a mobile-money charge still awaiting
    // the customer's phone-side approval) stays "unknown" so the
    // caller leaves the payment pending rather than resolving early.
    const status: PaymentWebhookEvent["status"] =
      data?.status === "success"
        ? "completed"
        : data?.status === "failed" || data?.status === "abandoned"
          ? "failed"
          : data?.status === "reversed"
            ? "refunded"
            : "unknown";

    return {
      eventType: "transaction.verify",
      gatewayReference: data?.reference ?? reference,
      // The verify endpoint returns transaction state, not a refund
      // object — it has no refund-specific reference to offer even
      // when status resolves to "refunded" (Paystack's "reversed").
      // applyGatewayEventToPayment() treats a "refunded" outcome with
      // no refundReference as unable to safely reconcile (idempotency
      // depends on it) rather than guessing one.
      refundReference: null,
      status,
      amount: data?.amount != null ? toMajorUnit(data.amount) : null,
      currency: data?.currency ?? null,
      channel: mapChannel(data?.channel ?? data?.authorization?.channel),
      cardBrand: data?.authorization?.card_type ?? null,
      cardLast4: data?.authorization?.last4 ?? null,
      gatewayFee: data?.fees != null ? toMajorUnit(data.fees) : null,
      raw: body as unknown as Record<string, unknown>,
    };
  },

  async refund(params: RefundParams): Promise<RefundResult> {
    const response = await fetch(`${PAYSTACK_API_BASE}/refund`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${requireSecretKey()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        transaction: params.gatewayReference,
        amount: params.amount != null ? toMinorUnit(params.amount) : undefined,
        customer_note: params.reason,
      }),
    });

    const body = (await response.json()) as PaystackRefundResponse;
    if (!response.ok || !body.status || !body.data) {
      throw new Error(`[paystack] refund failed: ${body.message ?? response.statusText}`);
    }

    return {
      providerRefundReference: String(body.data.id),
      status: body.data.status === "processed" ? "processed" : "pending",
    };
  },
};
