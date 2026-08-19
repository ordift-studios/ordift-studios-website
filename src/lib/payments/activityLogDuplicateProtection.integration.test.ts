import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { generateRecordId } from "@/lib/shared/recordId";
import { createTestAdminClient, testRunId } from "@/lib/testing/testEnvironment";

// TD-043 defense-in-depth (migration 0031) — historical duplicate
// annotation + partial unique indexes on activity_log for the three
// terminal payment-outcome actions.
//
// The two known historical duplicate pairs (PAY-2026-000033,
// PAY-2026-000040) predate migration 0030's atomic
// claim_and_log_payment_activity() and are genuine, independently-
// triggered evidence of the original TD-043 defect — not bad data.
// Migration 0031 never deletes, merges, or rewrites any pre-existing
// value on those 4 rows; it only adds duplicate_of_id/duplicate_reason
// and sets them on exactly the later row of each pair. This suite
// proves, against the real annotated rows (not fixtures), that every
// pre-existing field is still exactly what the read-only investigation
// recorded before the migration ran, and separately proves the new
// indexes actually reject a fresh duplicate for an unrelated payment.

const runId = testRunId();
const admin = createTestAdminClient();

// Exact values re-verified read-only, by exact row id, immediately
// before migration 0031 was written — see the approved decision report
// and migration 0031's own header comment.
const PAY_033_ENTITY_ID = "50de7bfa-3382-4ba4-ae2a-c31ca95a6625";
const PAY_033_EARLIER_ID = "1029f875-fe89-4358-b8b2-54512b985910";
const PAY_033_LATER_ID = "d6cecc78-8753-44ca-83d3-2c77f144c36d";
const PAY_033_EARLIER_CREATED_AT = "2026-08-18T22:08:57.444622+00:00";
const PAY_033_LATER_CREATED_AT = "2026-08-18T22:08:58.460878+00:00";

const PAY_040_ENTITY_ID = "e9bdae00-e555-477f-a083-2cf17e97df0c";
const PAY_040_EARLIER_ID = "ef022fb1-34e6-420d-a669-17c965cc250f";
const PAY_040_LATER_ID = "768cc88f-1b42-4467-8792-6ed491bf2ba4";
const PAY_040_EARLIER_CREATED_AT = "2026-08-18T23:33:32.262604+00:00";
const PAY_040_LATER_CREATED_AT = "2026-08-18T23:33:32.658475+00:00";

describe("historical duplicate rows are preserved, annotated only (TD-043, migration 0031)", () => {
  it("PAY-2026-000033's two rows keep every pre-existing field unchanged, annotated only on the later row", async () => {
    const { data: rows, error } = await admin
      .from("activity_log")
      .select("id, action, entity_type, entity_id, created_at, metadata, duplicate_of_id, duplicate_reason")
      .in("id", [PAY_033_EARLIER_ID, PAY_033_LATER_ID]);
    expect(error).toBeNull();
    expect(rows).toHaveLength(2);

    const earlier = rows!.find((r) => r.id === PAY_033_EARLIER_ID)!;
    const later = rows!.find((r) => r.id === PAY_033_LATER_ID)!;

    expect(earlier.action).toBe("payment.completed");
    expect(earlier.entity_type).toBe("payment");
    expect(earlier.entity_id).toBe(PAY_033_ENTITY_ID);
    expect(earlier.created_at).toBe(PAY_033_EARLIER_CREATED_AT);
    expect((earlier.metadata as Record<string, unknown>)?.source).toBe("verify");
    // The earlier row is deliberately left unmarked — it's the row that
    // continues to occupy the uniqueness slot for this payment.
    expect(earlier.duplicate_of_id).toBeNull();

    expect(later.action).toBe("payment.completed");
    expect(later.entity_type).toBe("payment");
    expect(later.entity_id).toBe(PAY_033_ENTITY_ID);
    expect(later.created_at).toBe(PAY_033_LATER_CREATED_AT);
    expect((later.metadata as Record<string, unknown>)?.source).toBe("webhook");
    expect(later.duplicate_of_id).toBe(PAY_033_EARLIER_ID);
    expect(later.duplicate_reason).toContain("TD-043");
  });

  it("PAY-2026-000040's two rows keep every pre-existing field unchanged, annotated only on the later row", async () => {
    const { data: rows, error } = await admin
      .from("activity_log")
      .select("id, action, entity_type, entity_id, created_at, metadata, duplicate_of_id, duplicate_reason")
      .in("id", [PAY_040_EARLIER_ID, PAY_040_LATER_ID]);
    expect(error).toBeNull();
    expect(rows).toHaveLength(2);

    const earlier = rows!.find((r) => r.id === PAY_040_EARLIER_ID)!;
    const later = rows!.find((r) => r.id === PAY_040_LATER_ID)!;

    expect(earlier.action).toBe("payment.completed");
    expect(earlier.entity_type).toBe("payment");
    expect(earlier.entity_id).toBe(PAY_040_ENTITY_ID);
    expect(earlier.created_at).toBe(PAY_040_EARLIER_CREATED_AT);
    expect((earlier.metadata as Record<string, unknown>)?.source).toBe("verify");
    expect(earlier.duplicate_of_id).toBeNull();

    expect(later.action).toBe("payment.completed");
    expect(later.entity_type).toBe("payment");
    expect(later.entity_id).toBe(PAY_040_ENTITY_ID);
    expect(later.created_at).toBe(PAY_040_LATER_CREATED_AT);
    expect((later.metadata as Record<string, unknown>)?.source).toBe("webhook");
    expect(later.duplicate_of_id).toBe(PAY_040_EARLIER_ID);
    expect(later.duplicate_reason).toContain("TD-043");
  });

  it("the historical payments remain protected against a hypothetical future duplicate too (the unmarked earlier row still holds the constraint)", async () => {
    const attempt033 = await admin.from("activity_log").insert({
      action: "payment.completed",
      entity_type: "payment",
      entity_id: PAY_033_ENTITY_ID,
      metadata: { source: "test-hypothetical-third-attempt" },
    });
    expect(attempt033.error).not.toBeNull();
    expect(attempt033.error?.message).toMatch(/duplicate key value violates unique constraint/i);

    const attempt040 = await admin.from("activity_log").insert({
      action: "payment.completed",
      entity_type: "payment",
      entity_id: PAY_040_ENTITY_ID,
      metadata: { source: "test-hypothetical-third-attempt" },
    });
    expect(attempt040.error).not.toBeNull();
    expect(attempt040.error?.message).toMatch(/duplicate key value violates unique constraint/i);

    // Confirm no stray third row was actually created by either attempt.
    const { data: countRows033 } = await admin
      .from("activity_log")
      .select("id")
      .eq("entity_id", PAY_033_ENTITY_ID)
      .eq("action", "payment.completed");
    expect(countRows033).toHaveLength(2);

    const { data: countRows040 } = await admin
      .from("activity_log")
      .select("id")
      .eq("entity_id", PAY_040_ENTITY_ID)
      .eq("action", "payment.completed");
    expect(countRows040).toHaveLength(2);
  });
});

describe("new duplicate terminal payment activity is rejected at the database level (TD-043, migration 0031)", () => {
  let enquiryId: string;
  const referenceNumber = `TEST-DUPCHECK-${runId}`;
  const createdPaymentIds: string[] = [];

  beforeAll(async () => {
    const { data: enquiry, error } = await admin
      .from("enquiries")
      .insert({
        reference_number: referenceNumber,
        email: `test-dup-check-${runId}@ordiftstudios.invalid`,
        full_name: `Dup Check Test ${runId}`,
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
      admin
        .from("activity_log")
        .delete()
        .in("entity_id", createdPaymentIds.length > 0 ? createdPaymentIds : ["00000000-0000-0000-0000-000000000000"]),
      admin.from("payments").delete().eq("entity_id", enquiryId),
      admin.from("enquiries").delete().eq("id", enquiryId),
    ]);
    const failures = results.filter((r) => r.status === "rejected" || (r.status === "fulfilled" && "value" in r && r.value?.error));
    if (failures.length > 0) {
      console.error(
        `[activityLogDuplicateProtection.integration] CLEANUP FAILED for run ${runId} (enquiry=${enquiryId}) — log to TECHNICAL_DEBT_REGISTER.md's Stale test data section.`,
        failures
      );
    }
  });

  async function createDisposablePayment(paymentType: "full" | "balance" | "deposit" | "partial" | "refund") {
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
        status: "completed",
        provider: "paystack",
        gateway_reference: recordId,
      })
      .select("id")
      .single();
    if (error || !data) throw new Error(`failed to create disposable payment: ${error?.message}`);
    createdPaymentIds.push(data.id);
    return data.id as string;
  }

  it("rejects a second payment.completed row for the same payment", async () => {
    const paymentId = await createDisposablePayment("full");

    const first = await admin
      .from("activity_log")
      .insert({ action: "payment.completed", entity_type: "payment", entity_id: paymentId, metadata: { source: "verify" } });
    expect(first.error).toBeNull();

    const second = await admin
      .from("activity_log")
      .insert({ action: "payment.completed", entity_type: "payment", entity_id: paymentId, metadata: { source: "webhook" } });
    expect(second.error).not.toBeNull();
    expect(second.error?.message).toMatch(/duplicate key value violates unique constraint/i);

    const { data: rows } = await admin.from("activity_log").select("id").eq("entity_id", paymentId).eq("action", "payment.completed");
    expect(rows).toHaveLength(1);
  });

  it("rejects a second payment.failed row for the same payment", async () => {
    const paymentId = await createDisposablePayment("balance");

    const first = await admin
      .from("activity_log")
      .insert({ action: "payment.failed", entity_type: "payment", entity_id: paymentId, metadata: { source: "verify" } });
    expect(first.error).toBeNull();

    const second = await admin
      .from("activity_log")
      .insert({ action: "payment.failed", entity_type: "payment", entity_id: paymentId, metadata: { source: "webhook" } });
    expect(second.error).not.toBeNull();
    expect(second.error?.message).toMatch(/duplicate key value violates unique constraint/i);
  });

  it("rejects a second payment.amount_mismatch row for the same payment", async () => {
    const paymentId = await createDisposablePayment("deposit");

    const first = await admin
      .from("activity_log")
      .insert({ action: "payment.amount_mismatch", entity_type: "payment", entity_id: paymentId, metadata: { source: "verify" } });
    expect(first.error).toBeNull();

    const second = await admin
      .from("activity_log")
      .insert({ action: "payment.amount_mismatch", entity_type: "payment", entity_id: paymentId, metadata: { source: "webhook" } });
    expect(second.error).not.toBeNull();
    expect(second.error?.message).toMatch(/duplicate key value violates unique constraint/i);
  });

  it("does not affect legitimately-repeatable activity_log actions for the same payment", async () => {
    const paymentId = await createDisposablePayment("partial");

    const first = await admin
      .from("activity_log")
      .insert({ action: "payment.receipt_retry", entity_type: "payment", entity_id: paymentId, metadata: { attempt: 1 } });
    expect(first.error).toBeNull();

    const second = await admin
      .from("activity_log")
      .insert({ action: "payment.receipt_retry", entity_type: "payment", entity_id: paymentId, metadata: { attempt: 2 } });
    expect(second.error).toBeNull();

    const { data: rows } = await admin.from("activity_log").select("id").eq("entity_id", paymentId).eq("action", "payment.receipt_retry");
    expect(rows).toHaveLength(2);
  });
});
