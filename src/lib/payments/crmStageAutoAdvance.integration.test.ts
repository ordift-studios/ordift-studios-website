import { afterAll, describe, expect, it } from "vitest";
import { advanceStageOnFullPayment } from "./crmStageSync";
import { applyGatewayEventToPayment } from "./gatewaySync";
import { syncEntityAfterBankTransferDecision } from "@/app/admin/payments/actions";
import { generateRecordId } from "@/lib/shared/recordId";
import { createTestAdminClient, testRunId } from "@/lib/testing/testEnvironment";
import type { CrmStage } from "@/lib/admin/enquiries";

// Item 3 (TD-043 follow-up, 2026-08-19) — a real Production enquiry
// (ENQ-2026-000007) was fully paid but stayed stuck at "quotation_sent"
// because nothing in the payment-completion path ever touched
// crm_stage. This suite covers the fix, advanceStageOnFullPayment()
// (./crmStageSync.ts), from two angles:
//
//   Part A exercises the shared function directly against every stage
//   in the canonical pipeline (src/lib/admin/enquiries.ts's
//   CRM_STAGES) to prove the "before booked -> advance" / "at-or-after
//   booked -> never regress" guard is exhaustively correct, plus its
//   own idempotency under repeated/concurrent calls.
//
//   Part B exercises the two real call sites that actually invoke it
//   — gatewaySync.ts's syncEntityPaymentStatus() (via
//   applyGatewayEventToPayment(), the Paystack path) and
//   admin/payments/actions.ts's syncEntityAfterBankTransferDecision()
//   (the bank-transfer path) — proving the wiring itself is correct,
//   not just the shared function in isolation.
//
// Every enquiry/workshop row here is disposable and created fresh per
// test (rather than one shared fixture), because each test needs a
// distinct starting crm_stage — sharing one row across stage
// assertions would make tests order-dependent.

const runId = testRunId();
const admin = createTestAdminClient();

const enquiryIds: string[] = [];
const workshopIds: string[] = [];
const paymentIds: string[] = [];

async function createTestEnquiry(crmStage: CrmStage, label: string): Promise<string> {
  const { data, error } = await admin
    .from("enquiries")
    .insert({
      reference_number: `TEST-CRMADV-${label}-${runId}`,
      email: `test-crm-advance-${label}-${runId}@ordiftstudios.invalid`,
      full_name: `CRM Stage Advance Test ${label} ${runId}`,
      service: "photography",
      amount_due: 5,
      crm_stage: crmStage,
    })
    .select("id")
    .single();
  if (error || !data) throw new Error(`failed to create test enquiry (${label}): ${error?.message}`);
  enquiryIds.push(data.id);
  return data.id;
}

async function createTestWorkshopRegistration(label: string): Promise<string> {
  const { data, error } = await admin
    .from("workshop_registrations")
    .insert({
      registration_reference: `TEST-CRMADV-WSH-${label}-${runId}`,
      email: `test-crm-advance-wsh-${label}-${runId}@ordiftstudios.invalid`,
      full_name: `CRM Stage Advance Workshop Test ${label} ${runId}`,
      workshop_id: "00000000-0000-0000-0000-000000000000",
      workshop_slug: `crm-advance-test-${label}-${runId}`,
      workshop_title: "CRM Stage Advance Test Workshop — safe to delete",
      registration_status: "Registered",
      payment_status: "Pending",
      amount_due: 5,
    })
    .select("id")
    .single();
  if (error || !data) throw new Error(`failed to create test workshop registration (${label}): ${error?.message}`);
  workshopIds.push(data.id);
  return data.id;
}

async function getEnquiryStage(enquiryId: string): Promise<string | null> {
  const { data } = await admin.from("enquiries").select("crm_stage").eq("id", enquiryId).maybeSingle();
  return data?.crm_stage ?? null;
}

async function countAutomatedStageChangeActivity(enquiryId: string): Promise<number> {
  const { data } = await admin
    .from("activity_log")
    .select("id")
    .eq("entity_type", "enquiry")
    .eq("entity_id", enquiryId)
    .eq("action", "enquiry.stage_change");
  return data?.length ?? 0;
}

// CRM Lifecycle Automation Phase 1, Batch 2 (2026-08-20) — the Booking
// Confirmed client email is dispatched from inside the exact same
// guarded branch as the stage-change activity log above, so it should
// share its idempotency exactly: one genuine "booked" transition, one
// email attempt (logged here as staging always logs instead of really
// sending — see productionSendingEnabled()), zero for a repeat/no-op
// call or a never-regress case.
async function countBookingConfirmedEmailActivity(enquiryId: string): Promise<number> {
  const { data } = await admin
    .from("activity_log")
    .select("id")
    .eq("entity_type", "enquiry")
    .eq("entity_id", enquiryId)
    .eq("action", "enquiry.booking_confirmed_email_sent");
  return data?.length ?? 0;
}

// CRM Lifecycle Automation Phase 1, Batch 3 (2026-08-20) — the internal
// New Booking notification is dispatched from the exact same guarded
// branch, so it shares the same idempotency proof.
async function countNewBookingNotificationActivity(enquiryId: string): Promise<number> {
  const { data } = await admin
    .from("activity_log")
    .select("id")
    .eq("entity_type", "enquiry")
    .eq("entity_id", enquiryId)
    .eq("action", "enquiry.new_booking_notification_sent");
  return data?.length ?? 0;
}

async function completeGatewayPayment(entityType: string, entityId: string, paymentType: "full" | "balance" = "full") {
  const recordId = await generateRecordId("PAY");
  const { data: payment, error } = await admin
    .from("payments")
    .insert({
      record_id: recordId,
      entity_type: entityType,
      entity_id: entityId,
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
  if (error || !payment) throw new Error(`failed to create test payment: ${error?.message}`);
  paymentIds.push(payment.id as string);

  const result = await applyGatewayEventToPayment(
    payment,
    {
      status: "completed",
      amount: 60,
      currency: "GHS",
      gatewayFee: 1.5,
      channel: "card",
      cardBrand: "visa",
      cardLast4: "4081",
      refundReference: null,
    },
    "webhook"
  );
  return { paymentId: payment.id as string, result };
}

async function completeBankTransferPayment(entityType: string, entityId: string) {
  const recordId = await generateRecordId("PAY");
  const { data: payment, error } = await admin
    .from("payments")
    .insert({
      record_id: recordId,
      entity_type: entityType,
      entity_id: entityId,
      reference_amount_usd: 5,
      payment_currency: "GHS",
      exchange_rate: 12,
      exchange_rate_source: "ordift",
      exchange_rate_locked_at: new Date().toISOString(),
      converted_amount: 60,
      payment_type: "full",
      payment_method: "bank_transfer",
      status: "completed",
      provider: "manual",
    })
    .select("id")
    .single();
  if (error || !payment) throw new Error(`failed to create completed bank-transfer test payment: ${error?.message}`);
  paymentIds.push(payment.id as string);

  await syncEntityAfterBankTransferDecision(entityType, entityId);
}

afterAll(async () => {
  const safePaymentIds = paymentIds.length > 0 ? paymentIds : ["00000000-0000-0000-0000-000000000000"];
  const results = await Promise.allSettled([
    admin.from("payment_receipt_jobs").delete().in("payment_id", safePaymentIds),
    admin.from("payment_completion_claims").delete().in("payment_id", safePaymentIds),
    admin.from("activity_log").delete().in("entity_id", safePaymentIds), // payment.completed rows (entity_type="payment")
    ...enquiryIds.map((id) => admin.from("activity_log").delete().eq("entity_id", id)), // enquiry.stage_change rows
    ...enquiryIds.map((id) => admin.from("payments").delete().eq("entity_id", id)),
    ...enquiryIds.map((id) => admin.from("enquiries").delete().eq("id", id)),
    ...workshopIds.map((id) => admin.from("payments").delete().eq("entity_id", id)),
    ...workshopIds.map((id) => admin.from("workshop_registrations").delete().eq("id", id)),
  ]);
  const failures = results.filter((r) => r.status === "rejected" || (r.status === "fulfilled" && "value" in r && r.value?.error));
  if (failures.length > 0) {
    console.error(
      `[crmStageAutoAdvance.integration] CLEANUP FAILED for run ${runId} — log to TECHNICAL_DEBT_REGISTER.md's Stale test data section.`,
      failures
    );
  }
});

describe("advanceStageOnFullPayment — direct guard coverage (Part A)", () => {
  it.each(["new_lead", "contacted", "quotation_sent", "negotiation"] as const)(
    "advances '%s' to 'booked' once payment is fully Paid",
    async (startStage) => {
      const enquiryId = await createTestEnquiry(startStage, `advance-${startStage}`);
      await advanceStageOnFullPayment(admin, "enquiry", enquiryId, "Paid");
      expect(await getEnquiryStage(enquiryId)).toBe("booked");
      expect(await countAutomatedStageChangeActivity(enquiryId)).toBe(1);
      expect(await countBookingConfirmedEmailActivity(enquiryId)).toBe(1);
      expect(await countNewBookingNotificationActivity(enquiryId)).toBe(1);
    }
  );

  it.each(["booked", "in_progress", "delivered", "completed", "repeat_client", "referral", "declined", "closed"] as const)(
    "never regresses '%s' back to 'booked'",
    async (startStage) => {
      const enquiryId = await createTestEnquiry(startStage, `noregress-${startStage}`);
      await advanceStageOnFullPayment(admin, "enquiry", enquiryId, "Paid");
      expect(await getEnquiryStage(enquiryId)).toBe(startStage);
      expect(await countAutomatedStageChangeActivity(enquiryId)).toBe(0);
      expect(await countBookingConfirmedEmailActivity(enquiryId)).toBe(0);
      expect(await countNewBookingNotificationActivity(enquiryId)).toBe(0);
    }
  );

  it("does nothing when the aggregate payment status is not yet 'Paid'", async () => {
    const enquiryId = await createTestEnquiry("quotation_sent", "still-pending");
    await advanceStageOnFullPayment(admin, "enquiry", enquiryId, "Pending");
    expect(await getEnquiryStage(enquiryId)).toBe("quotation_sent");
    expect(await countAutomatedStageChangeActivity(enquiryId)).toBe(0);
  });

  it("is a safe no-op for a workshop entity (no crm_stage column exists there)", async () => {
    const workshopId = await createTestWorkshopRegistration("guard");
    await expect(advanceStageOnFullPayment(admin, "workshop_registration", workshopId, "Paid")).resolves.not.toThrow();
  });

  // CRM Lifecycle Automation Phase 1, Batch 3 — a manual admin edit to
  // "booked" (updateStageAction, src/app/admin/enquiries/actions.ts)
  // never calls advanceStageOnFullPayment at all; this proves that
  // empirically by performing the exact plain UPDATE updateStageAction
  // itself issues (mirroring the same approach already used by
  // updateStageDoubleSubmit.integration.test.ts) and confirming no
  // notification activity results — only a genuine payment-driven
  // transition through advanceStageOnFullPayment ever notifies anyone.
  it("a manual stage edit directly to 'booked' produces no client email and no internal notification", async () => {
    const enquiryId = await createTestEnquiry("negotiation", "manual-edit");

    const { data: updatedRows, error } = await admin
      .from("enquiries")
      .update({ crm_stage: "booked" })
      .eq("id", enquiryId)
      .neq("crm_stage", "booked")
      .select("id");
    if (error) throw new Error(`manual update failed: ${error.message}`);
    expect(updatedRows).toHaveLength(1);

    expect(await getEnquiryStage(enquiryId)).toBe("booked");
    expect(await countBookingConfirmedEmailActivity(enquiryId)).toBe(0);
    expect(await countNewBookingNotificationActivity(enquiryId)).toBe(0);
  });

  it("repeated/concurrent calls for the same already-fully-paid enquiry produce exactly one write, one activity row, one client email attempt, and one internal notification attempt", async () => {
    const enquiryId = await createTestEnquiry("negotiation", "repeated");
    await Promise.all(Array.from({ length: 5 }, () => advanceStageOnFullPayment(admin, "enquiry", enquiryId, "Paid")));
    expect(await getEnquiryStage(enquiryId)).toBe("booked");
    expect(await countAutomatedStageChangeActivity(enquiryId)).toBe(1);
    expect(await countBookingConfirmedEmailActivity(enquiryId)).toBe(1);
    expect(await countNewBookingNotificationActivity(enquiryId)).toBe(1);

    // A further call after it's already booked must still be a clean no-op —
    // no duplicate write, activity row, or notification attempt (proves this
    // is safe against a genuinely duplicated webhook delivery or a repeated
    // reconciliation, not just concurrent requests within the same batch).
    await advanceStageOnFullPayment(admin, "enquiry", enquiryId, "Paid");
    expect(await getEnquiryStage(enquiryId)).toBe("booked");
    expect(await countAutomatedStageChangeActivity(enquiryId)).toBe(1);
    expect(await countBookingConfirmedEmailActivity(enquiryId)).toBe(1);
    expect(await countNewBookingNotificationActivity(enquiryId)).toBe(1);
  });
});

describe("gateway (Paystack) payment completion — real wiring (Part B)", () => {
  it("a full payment completing via applyGatewayEventToPayment advances 'quotation_sent' to 'booked'", async () => {
    const enquiryId = await createTestEnquiry("quotation_sent", "gateway-advance");
    const { result } = await completeGatewayPayment("enquiry", enquiryId);
    expect(result.outcome).toBe("completed");
    expect(await getEnquiryStage(enquiryId)).toBe("booked");
  });

  it("a full payment completing via applyGatewayEventToPayment never regresses 'in_progress'", async () => {
    const enquiryId = await createTestEnquiry("in_progress", "gateway-noregress");
    const { result } = await completeGatewayPayment("enquiry", enquiryId);
    expect(result.outcome).toBe("completed");
    expect(await getEnquiryStage(enquiryId)).toBe("in_progress");
  });

  it("a workshop payment completes normally with no crm_stage side effect or error", async () => {
    const workshopId = await createTestWorkshopRegistration("gateway");
    const { result } = await completeGatewayPayment("workshop_registration", workshopId);
    expect(result.outcome).toBe("completed");
    const { data: workshop } = await admin.from("workshop_registrations").select("payment_status").eq("id", workshopId).maybeSingle();
    expect(workshop?.payment_status).toBe("Paid");
  });
});

describe("bank-transfer payment completion — real wiring (Part B)", () => {
  it("an approved bank-transfer payment advances 'negotiation' to 'booked'", async () => {
    const enquiryId = await createTestEnquiry("negotiation", "banktransfer-advance");
    await completeBankTransferPayment("enquiry", enquiryId);
    expect(await getEnquiryStage(enquiryId)).toBe("booked");
  });

  it("an approved bank-transfer payment never regresses 'delivered'", async () => {
    const enquiryId = await createTestEnquiry("delivered", "banktransfer-noregress");
    await completeBankTransferPayment("enquiry", enquiryId);
    expect(await getEnquiryStage(enquiryId)).toBe("delivered");
  });
});
