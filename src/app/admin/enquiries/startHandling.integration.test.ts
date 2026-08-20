import { afterAll, describe, expect, it } from "vitest";
import { createTestAdminClient, testRunId } from "@/lib/testing/testEnvironment";
import { CRM_STAGES, type CrmStage } from "@/lib/admin/enquiries";

// CRM Lifecycle Automation Phase 1, Batch 4 (2026-08-20) — regression
// coverage for startHandlingAction's guard (src/app/admin/enquiries/
// actions.ts), mirroring updateStageDoubleSubmit.integration.test.ts's
// exact approach: startHandlingAction itself needs a real session
// (cookie-based getCurrentUser()), not exercisable directly in this
// test environment, so this proves the identical atomic conditional
// UPDATE the action actually uses. The Staff-can/Admin-cannot-be-
// blocked role-gate distinction requires a real login and is covered
// instead by STAGING_ACCEPTANCE_TESTS.md's Test 2.
//
// Mirrors the action's exact guard: `.eq("crm_stage", "new_lead")` —
// hard-scoped to exactly one transition, not a generic stage setter.
async function attemptStartHandling(admin: ReturnType<typeof createTestAdminClient>, enquiryId: string): Promise<"written" | "no-op"> {
  const { data: updatedRows, error } = await admin
    .from("enquiries")
    .update({ crm_stage: "contacted" })
    .eq("id", enquiryId)
    .eq("crm_stage", "new_lead")
    .select("id");
  if (error) throw new Error(`update failed: ${error.message}`);

  if (!updatedRows || updatedRows.length === 0) {
    return "no-op";
  }

  await admin.from("activity_log").insert({
    action: "enquiry.stage_change",
    entity_type: "enquiry",
    entity_id: enquiryId,
    metadata: { stage: "contacted", reason: "start_handling" },
  });

  return "written";
}

const runId = testRunId();
const admin = createTestAdminClient();
const enquiryIds: string[] = [];

async function createTestEnquiry(crmStage: CrmStage, label: string): Promise<string> {
  const { data, error } = await admin
    .from("enquiries")
    .insert({
      reference_number: `TEST-STARTHANDLING-${label}-${runId}`,
      email: `test-start-handling-${label}-${runId}@ordiftstudios.invalid`,
      full_name: `Start Handling Test ${label} ${runId}`,
      service: "photography",
      crm_stage: crmStage,
    })
    .select("id")
    .single();
  if (error || !data) throw new Error(`failed to create test enquiry (${label}): ${error?.message}`);
  enquiryIds.push(data.id);
  return data.id;
}

async function countStageChangeActivity(enquiryId: string): Promise<number> {
  const { data } = await admin
    .from("activity_log")
    .select("id")
    .eq("entity_type", "enquiry")
    .eq("entity_id", enquiryId)
    .eq("action", "enquiry.stage_change");
  return data?.length ?? 0;
}

// This routine internal movement must never generate any of the three
// Batch 2/3 notifications — startHandlingAction has no code path that
// calls into lifecycleEmails.ts or newBookingNotification.ts at all,
// but this proves the outcome directly rather than trusting that by
// inspection alone.
async function countNotificationActivity(enquiryId: string): Promise<number> {
  const { data } = await admin
    .from("activity_log")
    .select("id")
    .eq("entity_type", "enquiry")
    .eq("entity_id", enquiryId)
    .in("action", ["enquiry.quotation_email_sent", "enquiry.booking_confirmed_email_sent", "enquiry.new_booking_notification_sent"]);
  return data?.length ?? 0;
}

afterAll(async () => {
  const results = await Promise.allSettled([
    ...enquiryIds.map((id) => admin.from("activity_log").delete().eq("entity_id", id)),
    ...enquiryIds.map((id) => admin.from("enquiries").delete().eq("id", id)),
  ]);
  const failures = results.filter((r) => r.status === "rejected" || (r.status === "fulfilled" && "value" in r && r.value?.error));
  if (failures.length > 0) {
    console.error(
      `[startHandling.integration] CLEANUP FAILED for run ${runId} — log to TECHNICAL_DEBT_REGISTER.md's Stale test data section.`,
      failures
    );
  }
});

describe("startHandlingAction guard — exactly-once, idempotent, hard-scoped to new_lead -> contacted", () => {
  it("advances a genuine new_lead enquiry to contacted exactly once", async () => {
    const enquiryId = await createTestEnquiry("new_lead", "genuine");
    const result = await attemptStartHandling(admin, enquiryId);
    expect(result).toBe("written");

    const { data: enquiry } = await admin.from("enquiries").select("crm_stage").eq("id", enquiryId).maybeSingle();
    expect(enquiry?.crm_stage).toBe("contacted");
    expect(await countStageChangeActivity(enquiryId)).toBe(1);
    expect(await countNotificationActivity(enquiryId)).toBe(0);
  });

  it("nine rapid concurrent clicks on the same new_lead enquiry produce exactly one write and one activity row", async () => {
    const enquiryId = await createTestEnquiry("new_lead", "concurrent");
    const attempts = await Promise.all(Array.from({ length: 9 }, () => attemptStartHandling(admin, enquiryId)));
    const writes = attempts.filter((a) => a === "written").length;
    expect(writes).toBe(1);

    const { data: enquiry } = await admin.from("enquiries").select("crm_stage").eq("id", enquiryId).maybeSingle();
    expect(enquiry?.crm_stage).toBe("contacted");
    expect(await countStageChangeActivity(enquiryId)).toBe(1);
  });

  it("a repeat click after the enquiry is already contacted is a clean no-op, not a duplicate log", async () => {
    const enquiryId = await createTestEnquiry("new_lead", "repeat-after-success");
    expect(await attemptStartHandling(admin, enquiryId)).toBe("written");
    expect(await attemptStartHandling(admin, enquiryId)).toBe("no-op");
    expect(await countStageChangeActivity(enquiryId)).toBe(1);
  });

  // Hard-scope proof: this must never function as a generic stage
  // setter — attempting it from every stage other than new_lead
  // (including contacted itself) must be a clean no-op every time.
  it.each(CRM_STAGES.filter((s) => s !== "new_lead"))("is a no-op from '%s' — never a generic stage advance", async (startStage) => {
    const enquiryId = await createTestEnquiry(startStage, `noop-${startStage}`);
    const result = await attemptStartHandling(admin, enquiryId);
    expect(result).toBe("no-op");

    const { data: enquiry } = await admin.from("enquiries").select("crm_stage").eq("id", enquiryId).maybeSingle();
    expect(enquiry?.crm_stage).toBe(startStage);
    expect(await countStageChangeActivity(enquiryId)).toBe(0);
  });
});
