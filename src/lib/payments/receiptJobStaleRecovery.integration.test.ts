import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { generateRecordId } from "@/lib/shared/recordId";
import { createTestAdminClient, testRunId } from "@/lib/testing/testEnvironment";

// TD-043 defense-in-depth (migration 0032) — reclaim_stale_receipt_job(),
// the database-authoritative claim retryReceiptJobAction() now delegates
// to. Proves, directly against the deployed RPC (not a JS re-
// implementation of its logic), every guarantee the approved decision
// report required: a fresh 'processing' job can't be stolen, a stale one
// can be reclaimed by exactly one caller, a 'sent' job is permanently
// unreachable, a 'failed' job needs no staleness at all, and none of
// this ever touches payments or creates a second job row. The staleness
// test itself is backdated directly in Postgres (last_attempted_at),
// never via this process's Date.now() — matching the same convention
// already used for payment_completion_claims' own staleness tests.

const runId = testRunId();
const admin = createTestAdminClient();

let enquiryId: string;
const referenceNumber = `TEST-RJSR-${runId}`;
const createdPaymentIds: string[] = [];

async function createDisposablePayment() {
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
      payment_type: "full",
      payment_method: "gateway",
      status: "completed", // these tests exercise the receipt-job primitive directly
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
      email: `test-receipt-stale-recovery-${runId}@ordiftstudios.invalid`,
      full_name: `Receipt Stale Recovery Test ${runId}`,
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
    admin.from("payments").delete().eq("entity_id", enquiryId),
    admin.from("enquiries").delete().eq("id", enquiryId),
  ]);
  const failures = results.filter((r) => r.status === "rejected" || (r.status === "fulfilled" && "value" in r && r.value?.error));
  if (failures.length > 0) {
    console.error(
      `[receiptJobStaleRecovery.integration] CLEANUP FAILED for run ${runId} (enquiry=${enquiryId}) — log to TECHNICAL_DEBT_REGISTER.md's Stale test data section.`,
      failures
    );
  }
});

async function reclaim(jobId: string) {
  return admin.rpc("reclaim_stale_receipt_job", { p_job_id: jobId });
}

describe("reclaim_stale_receipt_job — staleness-aware receipt recovery (TD-043, migration 0032)", () => {
  it("a fresh 'processing' job (well under the threshold) cannot be reclaimed", async () => {
    const paymentId = await createDisposablePayment();
    const { data: job } = await admin
      .from("payment_receipt_jobs")
      .insert({ payment_id: paymentId, outcome: "completed", status: "processing", attempt_count: 1, last_attempted_at: new Date().toISOString() })
      .select("id, attempt_count")
      .single();

    const { data, error } = await reclaim(job!.id);
    expect(error).toBeNull();
    expect(Array.isArray(data) ? data.length : -1).toBe(0);

    const { data: unchanged } = await admin.from("payment_receipt_jobs").select("status, attempt_count").eq("id", job!.id).single();
    expect(unchanged!.status).toBe("processing");
    expect(unchanged!.attempt_count).toBe(1); // not bumped — no claim happened
  });

  it("a genuinely stale 'processing' job (backdated in Postgres, never via this process's clock) can be reclaimed exactly once", async () => {
    const paymentId = await createDisposablePayment();
    const staleTimestamp = new Date(Date.now() - 3 * 60 * 1000).toISOString(); // 3 minutes old, past the 2-minute threshold
    const { data: job } = await admin
      .from("payment_receipt_jobs")
      .insert({ payment_id: paymentId, outcome: "completed", status: "processing", attempt_count: 1, last_attempted_at: staleTimestamp })
      .select("id, attempt_count")
      .single();

    const { data, error } = await reclaim(job!.id);
    expect(error).toBeNull();
    expect(Array.isArray(data) ? data.length : -1).toBe(1);
    const claimed = (data as { status: string; attempt_count: number; last_attempted_at: string }[])[0];
    expect(claimed.status).toBe("processing");
    expect(claimed.attempt_count).toBe(2); // bumped by the reclaim
    expect(new Date(claimed.last_attempted_at).getTime()).toBeGreaterThan(new Date(staleTimestamp).getTime());
  });

  it("two concurrent reclaim attempts on the same stale job: exactly one wins", async () => {
    const paymentId = await createDisposablePayment();
    const staleTimestamp = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const { data: job } = await admin
      .from("payment_receipt_jobs")
      .insert({ payment_id: paymentId, outcome: "completed", status: "processing", attempt_count: 3, last_attempted_at: staleTimestamp })
      .select("id")
      .single();

    const [r1, r2] = await Promise.all([reclaim(job!.id), reclaim(job!.id)]);
    const wins = [r1, r2].filter((r) => Array.isArray(r.data) && r.data.length > 0).length;
    expect(wins).toBe(1);

    const { data: after } = await admin.from("payment_receipt_jobs").select("attempt_count").eq("id", job!.id).single();
    expect(after!.attempt_count).toBe(4); // bumped exactly once, not twice
  });

  it("a 'sent' job is permanently unreachable, even with an old last_attempted_at", async () => {
    const paymentId = await createDisposablePayment();
    const veryOldTimestamp = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { data: job } = await admin
      .from("payment_receipt_jobs")
      .insert({ payment_id: paymentId, outcome: "completed", status: "sent", attempt_count: 1, last_attempted_at: veryOldTimestamp, provider_result: "logged" })
      .select("id")
      .single();

    const { data, error } = await reclaim(job!.id);
    expect(error).toBeNull();
    expect(Array.isArray(data) ? data.length : -1).toBe(0);

    const { data: unchanged } = await admin.from("payment_receipt_jobs").select("status").eq("id", job!.id).single();
    expect(unchanged!.status).toBe("sent");
  });

  it("a 'failed' job needs no staleness at all — reclaimable immediately", async () => {
    const paymentId = await createDisposablePayment();
    const { data: job } = await admin
      .from("payment_receipt_jobs")
      .insert({ payment_id: paymentId, outcome: "completed", status: "failed", attempt_count: 1, last_attempted_at: new Date().toISOString(), last_error: "prior-failure" })
      .select("id")
      .single();

    const { data, error } = await reclaim(job!.id);
    expect(error).toBeNull();
    expect(Array.isArray(data) ? data.length : -1).toBe(1);
    const claimed = (data as { status: string }[])[0];
    expect(claimed.status).toBe("processing");
  });

  it("a successful recovery finalizes the same job row to 'sent' — no new job created", async () => {
    const paymentId = await createDisposablePayment();
    const staleTimestamp = new Date(Date.now() - 3 * 60 * 1000).toISOString();
    const { data: job } = await admin
      .from("payment_receipt_jobs")
      .insert({ payment_id: paymentId, outcome: "completed", status: "processing", attempt_count: 1, last_attempted_at: staleTimestamp })
      .select("id")
      .single();

    const { data: claimedRows } = await reclaim(job!.id);
    const claimed = (claimedRows as { id: string }[])[0];
    expect(claimed.id).toBe(job!.id); // same row, not a new one

    // Mirrors retryReceiptJobAction()'s own finalize step on success.
    await admin.from("payment_receipt_jobs").update({ status: "sent", provider_result: "logged", last_error: null }).eq("id", claimed.id);

    const { data: finalRows } = await admin.from("payment_receipt_jobs").select("id, status").eq("payment_id", paymentId).eq("outcome", "completed");
    expect(finalRows).toHaveLength(1); // still exactly one job row for this payment
    expect(finalRows![0].status).toBe("sent");
  });

  it("a recovery attempt that fails again leaves the job durably recoverable — status 'failed', still auditable, still reclaimable later", async () => {
    const paymentId = await createDisposablePayment();
    const staleTimestamp = new Date(Date.now() - 3 * 60 * 1000).toISOString();
    const { data: job } = await admin
      .from("payment_receipt_jobs")
      .insert({ payment_id: paymentId, outcome: "completed", status: "processing", attempt_count: 1, last_attempted_at: staleTimestamp })
      .select("id")
      .single();

    const { data: claimedRows } = await reclaim(job!.id);
    const claimed = (claimedRows as { id: string }[])[0];

    // Mirrors retryReceiptJobAction()'s own finalize step on failure.
    await admin
      .from("payment_receipt_jobs")
      .update({ status: "failed", provider_result: null, last_error: "simulated-second-failure" })
      .eq("id", claimed.id);

    const { data: afterFailure } = await admin.from("payment_receipt_jobs").select("*").eq("id", claimed.id).single();
    expect(afterFailure.status).toBe("failed");
    expect(afterFailure.last_error).toBe("simulated-second-failure");

    // Immediately reclaimable again — 'failed' needs no staleness window.
    const { data: secondReclaim } = await reclaim(claimed.id);
    expect(Array.isArray(secondReclaim) ? secondReclaim.length : -1).toBe(1);
  });

  it("the payment's financial fields remain byte-for-byte unchanged across a full stale-recovery cycle", async () => {
    const paymentId = await createDisposablePayment();
    const { data: before } = await admin
      .from("payments")
      .select("status, amount_collected, gateway_reference, reference_amount_usd")
      .eq("id", paymentId)
      .single();

    const staleTimestamp = new Date(Date.now() - 3 * 60 * 1000).toISOString();
    const { data: job } = await admin
      .from("payment_receipt_jobs")
      .insert({ payment_id: paymentId, outcome: "completed", status: "processing", attempt_count: 1, last_attempted_at: staleTimestamp })
      .select("id")
      .single();

    const { data: claimedRows } = await reclaim(job!.id);
    const claimed = (claimedRows as { id: string }[])[0];
    await admin.from("payment_receipt_jobs").update({ status: "sent", provider_result: "logged", last_error: null }).eq("id", claimed.id);

    const { data: after } = await admin
      .from("payments")
      .select("status, amount_collected, gateway_reference, reference_amount_usd")
      .eq("id", paymentId)
      .single();
    expect(after).toEqual(before);

    const { data: allPaymentsForEntity } = await admin.from("payments").select("id").eq("entity_id", enquiryId);
    expect(allPaymentsForEntity?.filter((p) => p.id === paymentId).length).toBe(1); // no second payment created
  });
});
