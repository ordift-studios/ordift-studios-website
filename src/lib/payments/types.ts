// Payments & Finance Module — shared domain types and the
// gateway-agnostic PaymentProvider interface (architecture proposal §3).
// Ghana/Paystack is the first implementation (src/lib/payments/providers/
// paystack.ts); a Qatar provider is a second class implementing this same
// interface, added only once selected (architecture proposal §13).

export type PaymentEntityType = "enquiry" | "workshop_registration";

export type PaymentType = "deposit" | "partial" | "balance" | "full" | "refund";

export type PaymentMethod = "gateway" | "bank_transfer";

export type PaymentStatus =
  | "pending"
  | "awaiting_verification"
  | "completed"
  | "failed"
  | "refunded"
  | "rejected";

export type PaymentChannel = "mobile_money" | "card" | "bank" | "apple_pay" | "google_pay";

export type ExchangeRateSource = "ordift" | "gateway" | "issuing_bank" | "other";

// One row of public.payments, as read back from the database — mirrors
// the migration 0024 column list exactly.
export type Payment = {
  id: string;
  businessId: string;
  recordId: string | null;
  entityType: PaymentEntityType;
  entityId: string;
  // Optional secondary link to a governing financial construct (a
  // future subscription, installment plan, payment link, gift-card
  // redemption) — distinct from entityType/entityId, which is always
  // required and answers "what is this settling." See the migration's
  // "pre-staging architecture review" comment for the full reasoning.
  relatedType: string | null;
  relatedId: string | null;
  // Lightweight service-line classification for future revenue-by-
  // service reporting (e.g. 'photography', 'royce_model_management') —
  // not a tenant/business boundary.
  businessUnit: string | null;
  userId: string | null;
  referenceAmountUsd: number;
  paymentCurrency: string;
  exchangeRate: number;
  exchangeRateSource: ExchangeRateSource;
  exchangeRateLockedAt: string;
  convertedAmount: number;
  amountCollected: number | null;
  settlementCurrency: string | null;
  gatewayFee: number | null;
  netAmountReceived: number | null;
  conversionPerformedBy: ExchangeRateSource;
  taxAmountUsd: number | null; // reserved, not calculated by any code path yet
  paymentType: PaymentType;
  paymentMethod: PaymentMethod;
  status: PaymentStatus;
  provider: string;
  gatewayReference: string | null;
  idempotencyKey: string | null;
  channel: PaymentChannel | null;
  cardBrand: string | null;
  cardLast4: string | null;
  proofOfPaymentAssetPath: string | null;
  submittedBy: string | null;
  submittedAt: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
  reviewNotes: string | null;
  postedAt: string | null; // reserved for a future general-ledger integration — see migration 0024's bottom section
  createdAt: string;
  updatedAt: string;
};

export type ChargeParams = {
  paymentId: string;
  amount: number; // in payment_currency's minor unit is provider-specific — Paystack adapter handles the pesewa conversion internally
  currency: string;
  email: string; // Paystack requires a customer email for hosted checkout
  reference: string; // Ordift's own record_id, used as the gateway's idempotent reference where supported
  callbackUrl: string; // where the gateway redirects back to after checkout
  metadata?: Record<string, unknown>;
};

export type ChargeResult = {
  checkoutUrl: string;
  providerReference: string;
};

export type RefundParams = {
  gatewayReference: string;
  amount?: number; // omit for a full refund
  reason?: string;
};

export type RefundResult = {
  providerRefundReference: string;
  status: "pending" | "processed";
};

export type PaymentWebhookEvent = {
  eventType: string;
  // For a refund event, this is deliberately the *original transaction's*
  // reference (Paystack's refund.processed payload's transaction_reference),
  // not the refund's own reference — so the existing payment-lookup path
  // (keyed on gateway_reference) finds the original payment unchanged,
  // exactly as it already does for charge events. The refund's own
  // reference lives in refundReference below.
  gatewayReference: string | null;
  // Only ever populated for a refund event — the refund's own reference
  // (Paystack's refund_reference), used as the new refund payments row's
  // own gateway_reference and as the basis for refund-specific
  // idempotency, both at the payments.idempotency_key layer and at the
  // webhook-route idempotency layer (so two separate refunds against the
  // same original transaction never collide on gatewayReference alone).
  refundReference: string | null;
  status: "completed" | "failed" | "refunded" | "unknown";
  amount: number | null; // major currency unit (e.g. GHS, not pesewas)
  currency: string | null;
  channel: PaymentChannel | null;
  cardBrand: string | null;
  cardLast4: string | null;
  gatewayFee: number | null;
  raw: Record<string, unknown>;
};

// The gateway-agnostic interface every provider adapter implements —
// architecture proposal §3. Provider selection is config-driven
// (src/lib/payments/providerRegistry.ts), never hardcoded into
// booking/workshop/checkout code.
export interface PaymentProvider {
  readonly id: string; // "paystack" | future Qatar provider id
  readonly supportedCurrencies: string[];
  initCharge(params: ChargeParams): Promise<ChargeResult>;
  verifyWebhookSignature(rawBody: string, signatureHeader: string | null): boolean;
  parseWebhookEvent(rawBody: string): PaymentWebhookEvent;
  // Active reconciliation counterpart to parseWebhookEvent — queries
  // the gateway directly for a reference's current status. Webhooks
  // are best-effort, not guaranteed (a checkout the customer abandons
  // or that's declined before a full charge attempt may never fire
  // one), so callers use this to resolve a payment stuck at "pending"
  // rather than waiting indefinitely. Returns the same
  // PaymentWebhookEvent shape so both paths share one downstream
  // handler.
  verifyTransaction(reference: string): Promise<PaymentWebhookEvent>;
  refund(params: RefundParams): Promise<RefundResult>;
}
