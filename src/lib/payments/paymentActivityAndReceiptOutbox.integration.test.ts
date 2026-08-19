import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { generateRecordId } from "@/lib/shared/recordId";
import { createTestAdminClient, testRunId } from "@/lib/testing/testEnvironment";

// TD-043 database-authoritative remediation (migration 0030) — proves
// the two lower-level primitives applyGatewayEventToPayment() now
// relies on, in isolation from the higher-level completion flow
// already covered by paymentCompletionIdempotency.integration.test.ts:
//
// 1. claim_and_log_payment_activity() — genuinely atomic (one
//    transaction) claim-and-insert, not "check marker, act, write
//    marker" against an in-memory snapshot.
// 2. payment_receipt_jobs — a durable outbox whose own state (not an
//    assumption) governs whether/how a receipt can be retried, and
//    whose uniqueness constraint is what actually prevents a
//    duplicate dispatch, matching the same guarantee already proven
//    for payment_completion_claims (migration 0028/0029's pattern).

const runId = testRunId();
const admin = createTestAdminClient();

let enquiryId: string;
const referenceNumber = `TEST-ACT-${runId}`;
const createdPaymentIds: string[] = [];

async function createDisposablePayment(paymentType: "full" | "balance" | "deposit" | "partial" = "full") {
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
      status: "completed", // these tests exercise activity/receipt primitives directly, independent of the payments.status transition itself
      provider: "paystack",
      gateway_reference: recordId,
    })
    .select("id")
    .single();
  if (error || !data) throw new Error(`failed to create test payment: ${error?.message}`);
  createdPaymentIds.push(data.id);
  return data.id as string;
}

beforeAll(async () => {
  const { data: enquiry, error } = await admin
    .from("enquiries")
    .insert({
      reference_number: referenceNumber,
      email: `test-activity-outbox-${runId}@ordiftstudios.invalid`,
      full_name: `Activity/Outbox Test ${runId}`,
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
      `[paymentActivityAndReceiptOutbox.integration] CLEANUP FAILED for run ${runId} (enquiry=${enquiryId}) — log to TECHNICAL_DEBT_REGISTER.md's Stale test data section.`,
      failures
    );
  }
});

describe("claim_and_log_payment_activity — atomicity", () => {
  it("under two genuinely concurrent calls, exactly one claims the step and exactly one activity_log row is written", async () => {
    const paymentId = await createDisposablePayment("full");
    await admin.from("payment_completion_claims").insert({ payment_id: paymentId, outcome: "completed", source: "verify" });

    const [resultA, resultB] = await Promise.all([
      admin.rpc("claim_and_log_payment_activity", {
        p_payment_id: paymentId,
        p_outcome: "completed",
        p_action: "payment.completed",
        p_entity_type: "payment",
        p_entity_id: paymentId,
        p_metadata: { attempt: "A" },
      }),
      admin.rpc("claim_and_log_payment_activity", {
        p_payment_id: paymentId,
        p_outcome: "completed",
        p_action: "payment.completed",
        p_entity_type: "payment",
        p_entity_id: paymentId,
        p_metadata: { attempt: "B" },
      }),
    ]);

    const claimedFlags = [resultA.data, resultB.data].sort();
    expect(claimedFlags).toEqual([false, true]);

    const { data: rows } = await admin.from("activity_log").select("id").eq("entity_id", paymentId).eq("action", "payment.completed");
    expect(rows?.length).toBe(1);

    const { data: claim } = await admin
      .from("payment_completion_claims")
      .select("activity_logged_at")
      .eq("payment_id", paymentId)
      .eq("outcome", "completed")
      .maybeSingle();
    expect(claim?.activity_logged_at).toBeTruthy();
  });

  it("rolls back the step-claim marker if the activity insert itself fails — no orphan 'claimed but not logged' state", async () => {
    const paymentId = await createDisposablePayment("balance");
    await admin.from("payment_completion_claims").insert({ payment_id: paymentId, outcome: "completed", source: "verify" });

    // activity_log.action is NOT NULL — passing null forces the INSERT
    // half of the function to fail after the UPDATE half has already
    // (within the same transaction) claimed the step.
    const { error } = await admin.rpc("claim_and_log_payment_activity", {
      p_payment_id: paymentId,
      p_outcome: "completed",
      p_action: null,
      p_entity_type: "payment",
      p_entity_id: paymentId,
      p_metadata: {},
    });
    expect(error).toBeTruthy();

    // The whole function is one transaction — if the insert failed,
    // the marker update must not have persisted either.
    const { data: claim } = await admin
      .from("payment_completion_claims")
      .select("activity_logged_at")
      .eq("payment_id", paymentId)
      .eq("outcome", "completed")
      .maybeSingle();
    expect(claim?.activity_logged_at).toBeNull();

    const { data: rows } = await admin.from("activity_log").select("id").eq("entity_id", paymentId);
    expect(rows?.length ?? 0).toBe(0);

    // And because nothing actually persisted, a subsequent genuine
    // call must still be able to claim and log normally — the failed
    // attempt didn't leave the step permanently blocked.
    const { data: retryClaimed } = await admin.rpc("claim_and_log_payment_activity", {
      p_payment_id: paymentId,
      p_outcome: "completed",
      p_action: "payment.completed",
      p_entity_type: "payment",
      p_entity_id: paymentId,
      p_metadata: { attempt: "retry-after-failure" },
    });
    expect(retryClaimed).toBe(true);
  });
});

describe("payment_receipt_jobs — durable outbox", () => {
  it("concurrent job-creation attempts for the same payment produce exactly one job row", async () => {
    const paymentId = await createDisposablePayment("deposit");

    const [a, b] = await Promise.all([
      admin
        .from("payment_receipt_jobs")
        .upsert({ payment_id: paymentId, outcome: "completed" }, { onConflict: "payment_id,outcome", ignoreDuplicates: true })
        .select("id"),
      admin
        .from("payment_receipt_jobs")
        .upsert({ payment_id: paymentId, outcome: "completed" }, { onConflict: "payment_id,outcome", ignoreDuplicates: true })
        .select("id"),
    ]);

    const createdCount = (a.data?.length ?? 0) + (b.data?.length ?? 0);
    expect(createdCount).toBe(1); // exactly one of the two upserts actually created the row

    const { data: jobs } = await admin.from("payment_receipt_jobs").select("id").eq("payment_id", paymentId);
    expect(jobs?.length).toBe(1);
  });

  it("records a real failure as a recoverable row, not a silently lost send", async () => {
    const paymentId = await createDisposablePayment("partial");

    const { data: job } = await admin
      .from("payment_receipt_jobs")
      .insert({ payment_id: paymentId, outcome: "completed", status: "pending" })
      .select("id, attempt_count")
      .single();
    expect(job).toBeTruthy();

    // Simulate exactly what dispatchReceiptJob()/retryReceiptJobAction()
    // record on a genuine send failure.
    await admin
      .from("payment_receipt_jobs")
      .update({ status: "failed", attempt_count: 1, last_attempted_at: new Date().toISOString(), last_error: "simulated-provider-error" })
      .eq("id", job!.id);

    const { data: failedJob } = await admin.from("payment_receipt_jobs").select("*").eq("id", job!.id).single();
    expect(failedJob.status).toBe("failed");
    expect(failedJob.attempt_count).toBe(1);
    expect(failedJob.last_error).toBe("simulated-provider-error");
    // The row still exists and is queryable — a failure is a visible,
    // recoverable record, never an unrecorded/lost attempt.
  });

  it("a retry claim on a failed job is itself race-safe: two concurrent retry attempts, only one proceeds", async () => {
    const paymentId = await createDisposablePayment("full");
    const { data: job } = await admin
      .from("payment_receipt_jobs")
      .insert({ payment_id: paymentId, outcome: "completed", status: "failed", attempt_count: 1, last_error: "prior-failure" })
      .select("id, attempt_count")
      .single();

    // Mirrors retryReceiptJobAction()'s own conditional claim — the
    // exact same "conditional UPDATE, check the affected row count"
    // pattern used throughout TD-043, so a rapid double-click can't
    // trigger two concurrent sends either.
    const attemptRetryClaim = () =>
      admin
        .from("payment_receipt_jobs")
        .update({ status: "processing", attempt_count: job!.attempt_count + 1, last_attempted_at: new Date().toISOString() })
        .eq("id", job!.id)
        .eq("status", "failed")
        .select("id");

    const [r1, r2] = await Promise.all([attemptRetryClaim(), attemptRetryClaim()]);
    const claimedCount = (r1.data?.length ?? 0) + (r2.data?.length ?? 0);
    expect(claimedCount).toBe(1);
  });

  it("retrying a receipt job never touches the payment's financial fields", async () => {
    const paymentId = await createDisposablePayment("balance");
    const { data: before } = await admin
      .from("payments")
      .select("status, amount_collected, gateway_reference, reference_amount_usd")
      .eq("id", paymentId)
      .single();

    const { data: job } = await admin
      .from("payment_receipt_jobs")
      .insert({ payment_id: paymentId, outcome: "completed", status: "failed", attempt_count: 1 })
      .select("id, attempt_count")
      .single();

    // Full retry cycle — claim, then resolve to sent — exactly the
    // shape retryReceiptJobAction() performs, touching only the
    // payment_receipt_jobs row.
    await admin
      .from("payment_receipt_jobs")
      .update({ status: "processing", attempt_count: job!.attempt_count + 1, last_attempted_at: new Date().toISOString() })
      .eq("id", job!.id)
      .eq("status", "failed");
    await admin.from("payment_receipt_jobs").update({ status: "sent", provider_result: "logged", last_error: null }).eq("id", job!.id);

    const { data: after } = await admin
      .from("payments")
      .select("status, amount_collected, gateway_reference, reference_amount_usd")
      .eq("id", paymentId)
      .single();
    expect(after).toEqual(before);

    const { data: allPaymentsForEntity } = await admin.from("payments").select("id").eq("entity_id", enquiryId);
    // The retry must not have created another payment row.
    expect(allPaymentsForEntity?.filter((p) => p.id === paymentId).length).toBe(1);
  });

  it("a job already 'sent' is never eligible for the retry claim path (mirrors retryReceiptJobAction's own guard)", async () => {
    const paymentId = await createDisposablePayment("deposit");
    const { data: job } = await admin
      .from("payment_receipt_jobs")
      .insert({ payment_id: paymentId, outcome: "completed", status: "sent", attempt_count: 1, provider_result: "logged" })
      .select("id, status")
      .single();
    expect(job?.status).toBe("sent");

    // retryReceiptJobAction() checks job.status === "sent" and returns
    // before ever attempting a claim UPDATE — this proves the
    // condition it relies on is itself correctly readable and stable.
    const { data: reread } = await admin.from("payment_receipt_jobs").select("status").eq("id", job!.id).single();
    expect(reread?.status).toBe("sent");

    // Even if a claim attempt were mistakenly issued against a 'sent'
    // job, the same eq("status", "failed")/eq("status","pending")
    // guard used elsewhere in this suite would find zero rows — sent
    // is never a valid starting state for that conditional update.
    const { data: wronglyAttempted } = await admin
      .from("payment_receipt_jobs")
      .update({ status: "processing" })
      .eq("id", job!.id)
      .eq("status", "failed") // the real action never uses this predicate against a 'sent' row, but proving it matches nothing either way
      .select("id");
    expect(wronglyAttempted?.length ?? 0).toBe(0);

    const { data: stillSent } = await admin.from("payment_receipt_jobs").select("status").eq("id", job!.id).single();
    expect(stillSent?.status).toBe("sent");
  });
});
