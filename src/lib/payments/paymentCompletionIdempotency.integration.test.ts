import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { applyGatewayEventToPayment } from "./gatewaySync";
import { generateRecordId } from "@/lib/shared/recordId";
import { createTestAdminClient, testRunId } from "@/lib/testing/testEnvironment";

// TD-043 idempotency hardening (migration 0029) — proves, deterministically,
// what real staging testing found by accident: a webhook and an on-demand
// verify reconciliation landing within about a second of each other on the
// same payment both used to run the full completion sequence (entity sync,
// activity log, receipt email). Real network timing can't be forced on
// demand, so this calls applyGatewayEventToPayment() directly and
// concurrently — the same function every real caller (webhook route,
// reconcilePendingPayment.ts, and any future gateway integration) funnels
// through — rather than trying to race two HTTP requests against each other.

const runId = testRunId();
const admin = createTestAdminClient();

const GATEWAY_EVENT_BASE = {
  amount: 60,
  currency: "GHS",
  gatewayFee: 1.5,
  channel: "card",
  cardBrand: "visa",
  cardLast4: "4081",
} as const;

let enquiryId: string;
const referenceNumber = `TEST-${runId}`;
const createdPaymentIds: string[] = [];

async function createPendingPayment(paymentType: "full" | "balance" = "full") {
  const recordId = await generateRecordId("PAY");
  const { data, error } = await admin
    .from("payments")
    .insert({
      record_id: recordId,
      entity_type: "enquiry",
      entity_id: enquiryId,
      reference_amount_usd: 5,
      payment_currency: "GHS",
      exchange_rate: 12,
      exchange_rate_source: "ordift",
      exchange_rate_locked_at: new Date().toISOString(),
      converted_amount: 60,
      payment_type: paymentType,
      payment_method: "gateway",
      status: "pending",
      provider: "paystack",
      gateway_reference: recordId,
    })
    .select("id, entity_type, entity_id, converted_amount, payment_currency")
    .single();
  if (error || !data) throw new Error(`failed to create test payment: ${error?.message}`);
  createdPaymentIds.push(data.id);
  return data as { id: string; entity_type: string; entity_id: string; converted_amount: number; payment_currency: string };
}

async function activityCountFor(paymentId: string, action: string): Promise<number> {
  const { data } = await admin.from("activity_log").select("id").eq("entity_id", paymentId).eq("action", action);
  return data?.length ?? 0;
}

async function getClaim(paymentId: string, outcome: string) {
  const { data } = await admin
    .from("payment_completion_claims")
    .select("*")
    .eq("payment_id", paymentId)
    .eq("outcome", outcome)
    .maybeSingle();
  return data;
}

beforeAll(async () => {
  const { data: enquiry, error } = await admin
    .from("enquiries")
    .insert({
      reference_number: referenceNumber,
      email: `test-completion-idempotency-${runId}@ordiftstudios.invalid`,
      full_name: `Completion Idempotency Test ${runId}`,
      service: "photography",
      amount_due: 5,
    })
    .select("id")
    .single();
  if (error || !enquiry) throw new Error(`failed to create test enquiry: ${error?.message}`);
  enquiryId = enquiry.id;
});

afterAll(async () => {
  const results = await Promise.allSettled([
    admin.from("payment_completion_claims").delete().in(
      "payment_id",
      createdPaymentIds.length > 0 ? createdPaymentIds : ["00000000-0000-0000-0000-000000000000"]
    ),
    admin.from("activity_log").delete().in(
      "entity_id",
      createdPaymentIds.length > 0 ? createdPaymentIds : ["00000000-0000-0000-0000-000000000000"]
    ),
    admin.from("payments").delete().eq("entity_id", enquiryId),
    admin.from("enquiries").delete().eq("id", enquiryId),
  ]);
  const failures = results.filter((r) => r.status === "rejected" || (r.status === "fulfilled" && "value" in r && r.value?.error));
  if (failures.length > 0) {
    console.error(
      `[paymentCompletionIdempotency.integration] CLEANUP FAILED for run ${runId} (enquiry=${enquiryId}) — log to TECHNICAL_DEBT_REGISTER.md's Stale test data section.`,
      failures
    );
  }
});

describe("payment completion idempotency (TD-043 claim table)", () => {
  it("lets exactly one of two truly concurrent 'completed' events win, and only it runs side effects", async () => {
    const payment = await createPendingPayment();

    const [resultA, resultB] = await Promise.all([
      applyGatewayEventToPayment(payment, { status: "completed", ...GATEWAY_EVENT_BASE }, "verify"),
      applyGatewayEventToPayment(payment, { status: "completed", ...GATEWAY_EVENT_BASE }, "webhook"),
    ]);

    const outcomes = [resultA.outcome, resultB.outcome].sort();
    expect(outcomes).toEqual(["completed", "ignored"]);

    const { data: finalPayment } = await admin
      .from("payments")
      .select("status, amount_collected, payment_currency")
      .eq("id", payment.id)
      .maybeSingle();
    expect(finalPayment?.status).toBe("completed");
    expect(Number(finalPayment?.amount_collected)).toBe(60);

    const { data: entity } = await admin.from("enquiries").select("amount_paid, payment_status").eq("id", enquiryId).maybeSingle();
    expect(Number(entity?.amount_paid)).toBeGreaterThanOrEqual(5);
    expect(entity?.payment_status).toBe("Paid");

    expect(await activityCountFor(payment.id, "payment.completed")).toBe(1);

    const claim = await getClaim(payment.id, "completed");
    expect(claim?.completed_at).toBeTruthy();
    expect(claim?.receipt_dispatched_at).toBeTruthy(); // dispatch was attempted exactly once (Staging suppresses the actual send — see receipts.ts)
  });

  it("recovers a stale/crashed claim without repeating steps that already finished", async () => {
    const payment = await createPendingPayment();

    // Simulate Caller A having actually finished the DB update, entity
    // sync, and activity log — then crashing immediately before marking
    // receipt_dispatched_at/completed_at (the exact scenario flagged in
    // review: completed_at alone must not be trusted as proof nothing
    // happened).
    await admin
      .from("payments")
      .update({ status: "completed", amount_collected: 60, settlement_currency: "GHS", channel: "card" })
      .eq("id", payment.id)
      .eq("status", "pending");
    await admin.from("enquiries").update({ amount_paid: 5, payment_status: "Paid" }).eq("id", enquiryId);
    const { error: preLogError } = await admin
      .from("activity_log")
      .insert({ action: "payment.completed", entity_type: "payment", entity_id: payment.id, metadata: { simulated: "pre-crash", source: "webhook" } });
    if (preLogError) throw new Error(`failed to seed pre-crash activity row: ${preLogError.message}`);

    const staleClaimedAt = new Date(Date.now() - 3 * 60 * 1000).toISOString(); // older than STALE_CLAIM_MS
    const { error: claimSeedError } = await admin.from("payment_completion_claims").insert({
      payment_id: payment.id,
      outcome: "completed",
      source: "webhook",
      claimed_at: staleClaimedAt,
      entity_synced_at: staleClaimedAt,
      activity_logged_at: staleClaimedAt,
      // receipt_dispatched_at and completed_at intentionally left null — the crash point.
    });
    if (claimSeedError) throw new Error(`failed to seed stale claim: ${claimSeedError.message}`);

    // Caller B — e.g. the webhook retrying, or a browser reload triggering
    // verify — reports the same completion again.
    const recovery = await applyGatewayEventToPayment(payment, { status: "completed", ...GATEWAY_EVENT_BASE }, "verify");
    expect(recovery.outcome).toBe("completed");

    // The pre-crash activity_log row must still be the only one — recovery
    // must not have re-logged.
    expect(await activityCountFor(payment.id, "payment.completed")).toBe(1);

    const claim = await getClaim(payment.id, "completed");
    expect(claim?.receipt_dispatched_at).toBeTruthy(); // the step that never ran before the simulated crash did run now
    expect(claim?.completed_at).toBeTruthy();
    expect(claim?.source).toBe("verify"); // reflects the recovering caller, confirming the steal actually happened
  });

  it("does not let a later 'completed' report resurrect a payment already resolved to 'failed', but still surfaces it", async () => {
    const payment = await createPendingPayment();

    const failedResult = await applyGatewayEventToPayment(payment, { status: "failed", ...GATEWAY_EVENT_BASE }, "verify");
    expect(failedResult.outcome).toBe("failed");

    const { data: afterFailed } = await admin.from("payments").select("status").eq("id", payment.id).maybeSingle();
    expect(afterFailed?.status).toBe("failed");

    // A later, authoritative report says it actually succeeded (e.g. the
    // earlier 'abandoned' read was premature — see Test 4's investigation).
    const completedResult = await applyGatewayEventToPayment(payment, { status: "completed", ...GATEWAY_EVENT_BASE }, "webhook");
    expect(completedResult.outcome).toBe("ignored");

    // The payment must NOT be silently resurrected to completed.
    const { data: finalPayment } = await admin.from("payments").select("status, amount_collected").eq("id", payment.id).maybeSingle();
    expect(finalPayment?.status).toBe("failed");
    expect(finalPayment?.amount_collected).toBeNull();

    // No duplicate/incorrect side effects.
    expect(await activityCountFor(payment.id, "payment.failed")).toBe(1);
    expect(await activityCountFor(payment.id, "payment.completed")).toBe(0);

    // But the conflict must be surfaced, not silently dropped.
    expect(await activityCountFor(payment.id, "payment.completion_conflict")).toBe(1);

    const completedClaim = await getClaim(payment.id, "completed");
    expect(completedClaim?.completed_at).toBeTruthy(); // claim itself resolved (so a future retry doesn't hang), but...
    expect(completedClaim?.entity_synced_at).toBeNull(); // ...no side effects actually ran for it
    expect(completedClaim?.receipt_dispatched_at).toBeNull();
  });
});
