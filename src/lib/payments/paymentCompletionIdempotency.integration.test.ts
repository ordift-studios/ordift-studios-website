import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { applyGatewayEventToPayment } from "./gatewaySync";
import { generateRecordId } from "@/lib/shared/recordId";
import { createTestAdminClient, testRunId } from "@/lib/testing/testEnvironment";

// TD-043 idempotency hardening (migration 0029) + database-authoritative
// remediation (migration 0030) — proves, deterministically, what real
// staging testing found twice (PAY-2026-000033, then again on
// PAY-2026-000040 despite migration 0029's claim table): a webhook and an
// on-demand verify reconciliation landing close together on the same
// payment could both run the full completion sequence. Real network
// timing can't be forced on demand, so this calls
// applyGatewayEventToPayment() directly and concurrently — the same
// function every real caller (webhook route, reconcilePendingPayment.ts,
// and any future gateway integration) funnels through — rather than
// trying to race two HTTP requests against each other. The one gap this
// same-process concurrency model cannot exercise — genuine cross-machine
// clock skew — is why the stale-claim decision (migration 0030) was
// moved entirely into Postgres; the test below proves that migration
// directly, using a manually backdated claimed_at rather than relying on
// this process's own clock to ever actually observe skew.

const runId = testRunId();
const admin = createTestAdminClient();

const GATEWAY_EVENT_BASE = {
  amount: 60,
  currency: "GHS",
  gatewayFee: 1.5,
  channel: "card",
  cardBrand: "visa",
  cardLast4: "4081",
  refundReference: null,
} as const;

let enquiryId: string;
const referenceNumber = `TEST-${runId}`;
const createdPaymentIds: string[] = [];

// Each test gets a distinct payment_type so its disposable payment
// never collides with migration 0028's "one pending gateway payment
// per entity+payment_type" unique index against a still-pending row
// left behind by an earlier test sharing the same enquiry.
async function createPendingPayment(paymentType: "full" | "balance" | "deposit" | "partial" | "refund" = "full") {
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

async function getReceiptJob(paymentId: string) {
  const { data } = await admin
    .from("payment_receipt_jobs")
    .select("*")
    .eq("payment_id", paymentId)
    .eq("outcome", "completed")
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
    admin.from("payment_receipt_jobs").delete().in(
      "payment_id",
      createdPaymentIds.length > 0 ? createdPaymentIds : ["00000000-0000-0000-0000-000000000000"]
    ),
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

describe("payment completion idempotency — top-level claim (TD-043)", () => {
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

    // Exactly one activity_log row, via the atomic claim_and_log_
    // payment_activity() RPC — this is the exact symptom that
    // recurred on PAY-2026-000040 despite migration 0029 alone.
    expect(await activityCountFor(payment.id, "payment.completed")).toBe(1);

    const claim = await getClaim(payment.id, "completed");
    expect(claim?.completed_at).toBeTruthy();

    // Exactly one durable receipt job, successfully "sent" (Staging
    // suppresses the real Resend call — see receipts.ts — so mode is
    // 'logged', but the outbox row correctly reflects a completed
    // attempt, not an assumption).
    const job = await getReceiptJob(payment.id);
    expect(job).toBeTruthy();
    expect(job?.status).toBe("sent");
    expect(job?.attempt_count).toBe(1);
  });

  it("database-clock stale takeover: a claim backdated past the threshold in the DATABASE (never via this process's Date.now()) is correctly stolen", async () => {
    const payment = await createPendingPayment("balance");

    // Seed a claim whose claimed_at is backdated directly in Postgres —
    // this process's own Date.now() is never consulted by
    // acquire_payment_completion_claim(); only the database's own
    // now() decides staleness (migration 0030).
    const { error: seedError } = await admin.from("payment_completion_claims").insert({
      payment_id: payment.id,
      outcome: "completed",
      source: "webhook",
      claimed_at: new Date(Date.now() - 3 * 60 * 1000).toISOString(), // 3 minutes old, past the 2-minute threshold
    });
    if (seedError) throw new Error(`failed to seed backdated claim: ${seedError.message}`);

    const { data: stolen, error } = await admin.rpc("acquire_payment_completion_claim", {
      p_payment_id: payment.id,
      p_outcome: "completed",
      p_source: "verify",
    });
    expect(error).toBeNull();
    expect(Array.isArray(stolen) && stolen.length).toBe(1);
    expect((stolen as { source: string }[])[0]?.source).toBe("verify");
  });

  it("a genuinely fresh claim (a few seconds old) is NOT stolen", async () => {
    const payment = await createPendingPayment("deposit");

    const { error: seedError } = await admin.from("payment_completion_claims").insert({
      payment_id: payment.id,
      outcome: "completed",
      source: "webhook",
      // default claimed_at = now() — genuinely fresh, well under the
      // 2-minute threshold.
    });
    if (seedError) throw new Error(`failed to seed fresh claim: ${seedError.message}`);

    const { data: stolen, error } = await admin.rpc("acquire_payment_completion_claim", {
      p_payment_id: payment.id,
      p_outcome: "completed",
      p_source: "verify",
    });
    expect(error).toBeNull();
    expect(Array.isArray(stolen) ? stolen.length : -1).toBe(0);

    // The original claim must be untouched — still owned by "webhook".
    const claim = await getClaim(payment.id, "completed");
    expect(claim?.source).toBe("webhook");
  });

  it("recovers a stale/crashed claim without repeating steps that already finished", async () => {
    const payment = await createPendingPayment("partial");

    // Simulate Caller A having actually finished the DB update, entity
    // sync, AND the activity log (a real row, matching what
    // claim_and_log_payment_activity() would have produced) — then
    // crashing immediately before dispatching the receipt or marking
    // completed_at.
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

    const staleClaimedAt = new Date(Date.now() - 3 * 60 * 1000).toISOString();
    const { error: claimSeedError } = await admin.from("payment_completion_claims").insert({
      payment_id: payment.id,
      outcome: "completed",
      source: "webhook",
      claimed_at: staleClaimedAt,
      entity_synced_at: staleClaimedAt,
      activity_logged_at: staleClaimedAt, // matches the real row seeded above
      // receipt_dispatched_at/completed_at intentionally null — the crash point.
    });
    if (claimSeedError) throw new Error(`failed to seed stale claim: ${claimSeedError.message}`);

    // Caller B — e.g. the webhook retrying, or a browser reload
    // triggering verify — reports the same completion again.
    // logPaymentActivity() is called unconditionally by the new design
    // (§ gatewaySync.ts) — this proves it stays safe: the atomic RPC's
    // own UPDATE ... WHERE activity_logged_at IS NULL correctly finds
    // zero rows and never re-inserts.
    const recovery = await applyGatewayEventToPayment(payment, { status: "completed", ...GATEWAY_EVENT_BASE }, "verify");
    expect(recovery.outcome).toBe("completed");

    // Still just the one pre-crash row — recovery must not have re-logged.
    expect(await activityCountFor(payment.id, "payment.completed")).toBe(1);

    const job = await getReceiptJob(payment.id);
    expect(job?.status).toBe("sent"); // the step that never ran before the simulated crash did run now

    const claim = await getClaim(payment.id, "completed");
    expect(claim?.completed_at).toBeTruthy();
  });

  it("does not let a later 'completed' report resurrect a payment already resolved to 'failed', but still surfaces it", async () => {
    const payment = await createPendingPayment("refund");

    const failedResult = await applyGatewayEventToPayment(payment, { status: "failed", ...GATEWAY_EVENT_BASE }, "verify");
    expect(failedResult.outcome).toBe("failed");

    const { data: afterFailed } = await admin.from("payments").select("status").eq("id", payment.id).maybeSingle();
    expect(afterFailed?.status).toBe("failed");

    const completedResult = await applyGatewayEventToPayment(payment, { status: "completed", ...GATEWAY_EVENT_BASE }, "webhook");
    expect(completedResult.outcome).toBe("ignored");

    const { data: finalPayment } = await admin.from("payments").select("status, amount_collected").eq("id", payment.id).maybeSingle();
    expect(finalPayment?.status).toBe("failed");
    expect(finalPayment?.amount_collected).toBeNull();

    expect(await activityCountFor(payment.id, "payment.failed")).toBe(1);
    expect(await activityCountFor(payment.id, "payment.completed")).toBe(0);
    expect(await activityCountFor(payment.id, "payment.completion_conflict")).toBe(1);

    // No receipt job was ever created for a completion that never
    // actually applied.
    const job = await getReceiptJob(payment.id);
    expect(job).toBeFalsy();
  });

  // TD-043 defense-in-depth review — the unconditional-side-effect
  // review concluded 'failed' and 'amount_mismatch' get the identical
  // acquireCompletionClaim()/logPaymentActivity() protection as
  // 'completed', by code inspection; these two tests convert that into
  // the same tested guarantee 'completed' already had above. Reuses
  // payment_type "full" and "refund" — both already resolved away from
  // 'pending' by the first and fifth tests above, by file execution
  // order, so no collision with migration 0028's one-pending-per-
  // entity-and-type index.
  it("lets exactly one of two truly concurrent 'failed' events win, and only it logs activity once", async () => {
    const payment = await createPendingPayment("full");

    const [resultA, resultB] = await Promise.all([
      applyGatewayEventToPayment(payment, { status: "failed", ...GATEWAY_EVENT_BASE }, "verify"),
      applyGatewayEventToPayment(payment, { status: "failed", ...GATEWAY_EVENT_BASE }, "webhook"),
    ]);

    const outcomes = [resultA.outcome, resultB.outcome].sort();
    expect(outcomes).toEqual(["failed", "ignored"]);

    const { data: finalPayment } = await admin.from("payments").select("status").eq("id", payment.id).maybeSingle();
    expect(finalPayment?.status).toBe("failed");

    expect(await activityCountFor(payment.id, "payment.failed")).toBe(1);

    const claim = await getClaim(payment.id, "failed");
    expect(claim?.completed_at).toBeTruthy();

    // No receipt job for a failed payment — dispatchReceiptJob() is
    // never called on this branch.
    const job = await getReceiptJob(payment.id);
    expect(job).toBeFalsy();
  });

  it("lets exactly one of two truly concurrent 'amount_mismatch' events win, and only it logs activity once", async () => {
    const payment = await createPendingPayment("refund");
    // payment.converted_amount is 60 (createPendingPayment's fixed
    // value) — a wildly different reported amount forces the
    // amount/currency-mismatch branch rather than a genuine completion.
    const mismatchedEvent = { ...GATEWAY_EVENT_BASE, amount: 999 };

    const [resultA, resultB] = await Promise.all([
      applyGatewayEventToPayment(payment, { status: "completed", ...mismatchedEvent }, "verify"),
      applyGatewayEventToPayment(payment, { status: "completed", ...mismatchedEvent }, "webhook"),
    ]);

    const outcomes = [resultA.outcome, resultB.outcome].sort();
    expect(outcomes).toEqual(["amount-mismatch", "ignored"]);

    const { data: finalPayment } = await admin.from("payments").select("status").eq("id", payment.id).maybeSingle();
    expect(finalPayment?.status).toBe("failed"); // amount-mismatch resolves payments.status to 'failed'

    expect(await activityCountFor(payment.id, "payment.amount_mismatch")).toBe(1);

    const claim = await getClaim(payment.id, "amount_mismatch");
    expect(claim?.completed_at).toBeTruthy();

    const job = await getReceiptJob(payment.id);
    expect(job).toBeFalsy();
  });
});
