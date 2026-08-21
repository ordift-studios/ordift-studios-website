import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { applyGatewayEventToPayment } from "./gatewaySync";
import { generateRecordId } from "@/lib/shared/recordId";
import { createTestAdminClient, testRunId } from "@/lib/testing/testEnvironment";

// Part B (2026-08-21) — the "refunded" branch in
// applyGatewayEventToPayment(), replacing the manual procedure this
// session proved necessary and sufficient on a real Production case
// (PAY-2026-000003 / ENQ-2026-000008, see MILESTONES.md and
// TECHNICAL_DEBT_REGISTER.md TD-046). This exercises the exact same
// function every real caller funnels through — the webhook route
// resolves `payment` first (unchanged, pre-existing lookup logic —
// not retested here since it wasn't modified) and passes it in,
// exactly as these tests do directly.
//
// "Unknown/nonexistent original transaction" is deliberately not
// exercised in this file: applyGatewayEventToPayment() always
// receives an *already-resolved* payment — that lookup (by
// gateway_reference, unchanged by this work) lives in
// src/app/api/payments/webhook/paystack/route.ts, which this test
// suite doesn't touch or need to re-prove.

const runId = testRunId();
const admin = createTestAdminClient();

let enquiryId: string;
const referenceNumber = `TEST-REFUND-RECON-${runId}`;
const createdPaymentIds: string[] = [];

type TestPayment = {
  id: string;
  entity_type: string;
  entity_id: string;
  converted_amount: number;
  payment_currency: string;
  exchange_rate: number;
  exchange_rate_source: string;
  exchange_rate_locked_at: string;
  provider: string;
  payment_method: string;
};

async function createCompletedPayment(opts: {
  referenceAmountUsd: number;
  convertedAmount: number;
  exchangeRate?: number | null;
  paymentMethod?: "gateway" | "bank_transfer";
}): Promise<TestPayment> {
  const recordId = await generateRecordId("PAY");
  const { data, error } = await admin
    .from("payments")
    .insert({
      record_id: recordId,
      entity_type: "enquiry",
      entity_id: enquiryId,
      reference_amount_usd: opts.referenceAmountUsd,
      payment_currency: "GHS",
      exchange_rate: opts.exchangeRate === undefined ? 11.0898 : opts.exchangeRate,
      exchange_rate_source: "ordift",
      exchange_rate_locked_at: new Date().toISOString(),
      converted_amount: opts.convertedAmount,
      amount_collected: opts.convertedAmount,
      payment_type: "full",
      payment_method: opts.paymentMethod ?? "gateway",
      status: "completed",
      provider: "paystack",
      gateway_reference: recordId,
    })
    .select("id, entity_type, entity_id, converted_amount, payment_currency, exchange_rate, exchange_rate_source, exchange_rate_locked_at, provider, payment_method")
    .single();
  if (error || !data) throw new Error(`failed to create test payment: ${error?.message}`);
  createdPaymentIds.push(data.id);
  return data as TestPayment;
}

async function refundRowsFor(paymentId: string) {
  const { data } = await admin.from("payments").select("*").eq("related_type", "payment").eq("related_id", paymentId);
  return data ?? [];
}

async function activityCountFor(entityId: string, action: string): Promise<number> {
  const { data } = await admin.from("activity_log").select("id").eq("entity_id", entityId).eq("action", action);
  return data?.length ?? 0;
}

async function getEnquiry() {
  const { data } = await admin.from("enquiries").select("amount_due, amount_paid, payment_status").eq("id", enquiryId).single();
  return data!;
}

beforeAll(async () => {
  const { data: enquiry, error } = await admin
    .from("enquiries")
    .insert({
      reference_number: referenceNumber,
      email: `test-refund-recon-${runId}@ordiftstudios.invalid`,
      full_name: `Refund Reconciliation Test ${runId}`,
      service: "photography",
      amount_due: 10,
    })
    .select("id")
    .single();
  if (error || !enquiry) throw new Error(`failed to create test enquiry: ${error?.message}`);
  enquiryId = enquiry.id;
});

afterAll(async () => {
  // Real root cause of two earlier cleanup failures, found and fixed
  // 2026-08-21 (see MILESTONES.md's Part B entry): the "regression"
  // test below exercises the pre-existing "completed" branch, which
  // inserts a row into payment_completion_claims (and
  // payment_receipt_jobs) referencing that payment's id — a genuine
  // foreign key, not previously accounted for here. Deleting from
  // `payments` first — in one batch, covering every row this run
  // created — hit that FK and failed the *entire* statement
  // atomically, silently leaving every payments row (refund rows
  // included) behind despite no visible test failure. Deleting the
  // dependent tables first, exactly the order
  // paymentCompletionIdempotency.integration.test.ts's own afterAll
  // already established, fixes this at its actual source.
  const claimsDelete = await admin
    .from("payment_completion_claims")
    .delete()
    .in("payment_id", createdPaymentIds.length > 0 ? createdPaymentIds : ["00000000-0000-0000-0000-000000000000"])
    .select("payment_id");
  const receiptJobsDelete = await admin
    .from("payment_receipt_jobs")
    .delete()
    .in("payment_id", createdPaymentIds.length > 0 ? createdPaymentIds : ["00000000-0000-0000-0000-000000000000"])
    .select("payment_id");
  const paymentsDelete = await admin.from("payments").delete().eq("entity_type", "enquiry").eq("entity_id", enquiryId).select("id");
  const activityDelete = await admin.from("activity_log").delete().eq("entity_id", enquiryId).select("id");
  const enquiryDelete = await admin.from("enquiries").delete().eq("id", enquiryId).select("id");

  if (claimsDelete.error || receiptJobsDelete.error || paymentsDelete.error || activityDelete.error || enquiryDelete.error) {
    console.error(`[refundReconciliation.integration] CLEANUP FAILED for run ${runId}`, {
      claimsError: claimsDelete.error,
      receiptJobsError: receiptJobsDelete.error,
      paymentsError: paymentsDelete.error,
      activityError: activityDelete.error,
      enquiryError: enquiryDelete.error,
    });
  }

  // Explicit, always-visible confirmation of exactly what was removed
  // — not just "no error" — so a partial/incomplete cleanup can't pass
  // silently the way the bug above did.
  console.log(
    `[refundReconciliation.integration] cleanup for run ${runId}: deleted ${paymentsDelete.data?.length ?? 0} payments row(s), ${activityDelete.data?.length ?? 0} activity_log row(s), ${enquiryDelete.data?.length ?? 0} enquiry row(s), ${claimsDelete.data?.length ?? 0} claim row(s), ${receiptJobsDelete.data?.length ?? 0} receipt job row(s)`
  );
});

describe("applyGatewayEventToPayment — 'refunded' outcome", () => {
  it("a genuine partial refund creates exactly one refund row, correctly converted, and recomputes amount_paid", async () => {
    // USD 2.00 original, GHS 22.18 at 11.0898 — the exact real-world
    // numbers from PAY-2026-000003, refunded by exactly half.
    const payment = await createCompletedPayment({ referenceAmountUsd: 2.0, convertedAmount: 22.18 });

    const result = await applyGatewayEventToPayment(
      payment,
      { status: "refunded", amount: 11.09, currency: "GHS", gatewayFee: null, channel: null, cardBrand: null, cardLast4: null, refundReference: `refund-partial-test-${runId}` },
      "webhook"
    );

    expect(result.outcome).toBe("refunded");

    const rows = await refundRowsFor(payment.id);
    expect(rows).toHaveLength(1);
    const refundRow = rows[0];
    expect(refundRow.payment_type).toBe("refund");
    expect(refundRow.status).toBe("completed");
    expect(refundRow.reference_amount_usd).toBeCloseTo(1.0, 2); // 11.09 / 11.0898 ≈ 1.00
    expect(refundRow.converted_amount).toBe(11.09);
    expect(refundRow.gateway_reference).toBe(`refund-partial-test-${runId}`);
    expect(refundRow.idempotency_key).toBe(`paystack-refund:refund-partial-test-${runId}`);
    expect(refundRow.entity_type).toBe("enquiry");
    expect(refundRow.entity_id).toBe(enquiryId);

    const enquiry = await getEnquiry();
    expect(Number(enquiry.amount_paid)).toBeCloseTo(1.0, 2); // 2.00 - 1.00
    expect(Number(enquiry.amount_due)).toBe(10); // unchanged

    expect(await activityCountFor(enquiryId, "payment.refund_reconciled")).toBe(1);
  });

  it("the refund row's provider and payment_method are read from the real payment record, not defaulted", async () => {
    // Deliberately bank_transfer, not gateway — a value that differs
    // from applyGatewayEventToPayment()'s own fallback ("gateway"),
    // so a passing assertion here can only mean the real value was
    // actually read from `payment`, not coincidentally matching a
    // default. provider stays "paystack" (the schema's only real
    // gateway-refund-capable provider today), so this specifically
    // isolates payment_method — the field the fallback most plausibly
    // could have masked.
    const payment = await createCompletedPayment({ referenceAmountUsd: 1.0, convertedAmount: 11.09, paymentMethod: "bank_transfer" });

    const result = await applyGatewayEventToPayment(
      payment,
      { status: "refunded", amount: 11.09, currency: "GHS", gatewayFee: null, channel: null, cardBrand: null, cardLast4: null, refundReference: `refund-provider-method-test-${runId}` },
      "webhook"
    );
    expect(result.outcome).toBe("refunded");

    const rows = await refundRowsFor(payment.id);
    expect(rows).toHaveLength(1);
    expect(rows[0].provider).toBe("paystack");
    expect(rows[0].payment_method).toBe("bank_transfer");
  });

  it("a full refund correctly zeroes out amount_paid for that payment", async () => {
    const payment = await createCompletedPayment({ referenceAmountUsd: 3.0, convertedAmount: 33.27 });

    const result = await applyGatewayEventToPayment(
      payment,
      { status: "refunded", amount: 33.27, currency: "GHS", gatewayFee: null, channel: null, cardBrand: null, cardLast4: null, refundReference: `refund-full-test-${runId}` },
      "webhook"
    );

    expect(result.outcome).toBe("refunded");
    const rows = await refundRowsFor(payment.id);
    expect(rows).toHaveLength(1);
    expect(rows[0].reference_amount_usd).toBeCloseTo(3.0, 2);
  });

  it("a redelivered/duplicate refund.processed webhook does not create a second row or double-count the balance", async () => {
    const payment = await createCompletedPayment({ referenceAmountUsd: 4.0, convertedAmount: 44.36 });
    const event = {
      status: "refunded" as const,
      amount: 22.18,
      currency: "GHS",
      gatewayFee: null,
      channel: null,
      cardBrand: null,
      cardLast4: null,
      refundReference: `refund-duplicate-test-${runId}`,
    };

    const first = await applyGatewayEventToPayment(payment, event, "webhook");
    const second = await applyGatewayEventToPayment(payment, event, "webhook"); // simulated redelivery

    expect(first.outcome).toBe("refunded");
    expect(second.outcome).toBe("ignored");

    const rows = await refundRowsFor(payment.id);
    expect(rows).toHaveLength(1); // not two

    expect(await activityCountFor(enquiryId, "payment.refund_reconciled")).toBeGreaterThanOrEqual(1);
    // Exactly one entry attributable to *this* refund reference:
    const { data: activityRows } = await admin
      .from("activity_log")
      .select("metadata")
      .eq("entity_id", enquiryId)
      .eq("action", "payment.refund_reconciled");
    const matching = (activityRows ?? []).filter(
      (r) => (r.metadata as { gatewayRefundReference?: string })?.gatewayRefundReference === `refund-duplicate-test-${runId}`
    );
    expect(matching).toHaveLength(1);
  });

  it("two genuinely separate refunds against the same original payment both succeed independently", async () => {
    const payment = await createCompletedPayment({ referenceAmountUsd: 10.0, convertedAmount: 110.9 });

    const first = await applyGatewayEventToPayment(
      payment,
      { status: "refunded", amount: 22.18, currency: "GHS", gatewayFee: null, channel: null, cardBrand: null, cardLast4: null, refundReference: `refund-multi-1-${runId}` },
      "webhook"
    );
    const second = await applyGatewayEventToPayment(
      payment,
      { status: "refunded", amount: 11.09, currency: "GHS", gatewayFee: null, channel: null, cardBrand: null, cardLast4: null, refundReference: `refund-multi-2-${runId}` },
      "webhook"
    );

    expect(first.outcome).toBe("refunded");
    expect(second.outcome).toBe("refunded"); // not "ignored" — a genuinely different refund, not a duplicate

    const rows = await refundRowsFor(payment.id);
    expect(rows).toHaveLength(2);
  });

  it("a malformed event — missing refundReference — is safely ignored, no row created", async () => {
    const payment = await createCompletedPayment({ referenceAmountUsd: 1.0, convertedAmount: 11.09 });

    const result = await applyGatewayEventToPayment(
      payment,
      { status: "refunded", amount: 11.09, currency: "GHS", gatewayFee: null, channel: null, cardBrand: null, cardLast4: null, refundReference: null },
      "webhook"
    );

    expect(result.outcome).toBe("ignored");
    expect(await refundRowsFor(payment.id)).toHaveLength(0);
  });

  it("a malformed event — missing amount — is safely ignored, no row created", async () => {
    const payment = await createCompletedPayment({ referenceAmountUsd: 1.0, convertedAmount: 11.09 });

    const result = await applyGatewayEventToPayment(
      payment,
      { status: "refunded", amount: null, currency: "GHS", gatewayFee: null, channel: null, cardBrand: null, cardLast4: null, refundReference: "refund-no-amount" },
      "webhook"
    );

    expect(result.outcome).toBe("ignored");
    expect(await refundRowsFor(payment.id)).toHaveLength(0);
  });

  it("an original payment with no usable exchange_rate is safely ignored rather than guessing a conversion", async () => {
    const payment = await createCompletedPayment({ referenceAmountUsd: 1.0, convertedAmount: 11.09, exchangeRate: 0 });

    const result = await applyGatewayEventToPayment(
      payment,
      { status: "refunded", amount: 11.09, currency: "GHS", gatewayFee: null, channel: null, cardBrand: null, cardLast4: null, refundReference: "refund-no-rate" },
      "webhook"
    );

    expect(result.outcome).toBe("ignored");
    expect(await refundRowsFor(payment.id)).toHaveLength(0);
  });

  it("regression: 'completed' and 'failed' outcomes are unaffected by the new refund branch", async () => {
    const completedPayment = await createCompletedPayment({ referenceAmountUsd: 1.0, convertedAmount: 11.09 });
    // Reset to pending so the "completed" branch's own guard (which
    // only transitions a *pending* row) has something real to do.
    await admin.from("payments").update({ status: "pending" }).eq("id", completedPayment.id);

    const result = await applyGatewayEventToPayment(
      completedPayment,
      { status: "completed", amount: 11.09, currency: "GHS", gatewayFee: 0.2, channel: "card", cardBrand: "visa", cardLast4: "4081", refundReference: null },
      "webhook"
    );
    expect(result.outcome).toBe("completed");

    const { data: row } = await admin.from("payments").select("status").eq("id", completedPayment.id).single();
    expect(row?.status).toBe("completed");
  });
});
