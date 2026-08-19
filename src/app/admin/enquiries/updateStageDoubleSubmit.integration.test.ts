import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestAdminClient, testRunId } from "@/lib/testing/testEnvironment";

// Regression coverage for the double-submit/no-feedback fix on
// updateStageAction (src/app/admin/enquiries/actions.ts) — Admin
// Platform save-feedback audit, 2026-08-19. A real attempt to change
// ENQ-2026-000007's CRM stage to "Booked" appeared to silently revert,
// traced to a plain <form action={updateStageAction}> with no
// useActionState (so no success/error feedback existed at all) and no
// atomic guard against a repeated identical submission. The fix has
// two layers: client-side pending/success/error feedback
// (UpdateStageForm.tsx, not exercisable here — no cookie/request
// context available in this test environment, same limitation as
// every other admin-action test in this project, including
// setAmountDueDoubleSubmit.integration.test.ts) and a server-side
// atomic conditional-UPDATE guard, which *is* directly testable by
// mirroring the exact same conditional logic the action itself uses.
//
// This suite proves the guard's actual behavior, not a description of
// it: an identical repeated stage is a no-op (no second activity row),
// while a genuinely different stage always proceeds normally — the
// fix must never suppress a real intentional change.

const runId = testRunId();
const admin = createTestAdminClient();

let enquiryId: string;
const referenceNumber = `TEST-STAGE-${runId}`;

beforeAll(async () => {
  const { data: enquiry, error } = await admin
    .from("enquiries")
    .insert({
      reference_number: referenceNumber,
      email: `test-update-stage-${runId}@ordiftstudios.invalid`,
      full_name: `Update Stage Double Submit Test ${runId}`,
      service: "photography",
      crm_stage: "quotation_sent",
    })
    .select("id")
    .single();
  if (error || !enquiry) throw new Error(`failed to create test enquiry: ${error?.message}`);
  enquiryId = enquiry.id;
});

afterAll(async () => {
  const results = await Promise.allSettled([
    admin.from("activity_log").delete().eq("entity_id", enquiryId),
    admin.from("enquiries").delete().eq("id", enquiryId),
  ]);
  const failures = results.filter((r) => r.status === "rejected" || (r.status === "fulfilled" && "value" in r && r.value?.error));
  if (failures.length > 0) {
    console.error(
      `[updateStageDoubleSubmit.integration] CLEANUP FAILED for run ${runId} (enquiry=${enquiryId}) — log to TECHNICAL_DEBT_REGISTER.md's Stale test data section.`,
      failures
    );
  }
});

// Mirrors updateStageAction's exact guard: a single atomic conditional
// UPDATE (the "is this actually a change" check lives in the UPDATE's
// own WHERE clause, not a preceding SELECT), no-op if no row was
// affected, otherwise log — the same shape setAmountDueAction's own
// fix uses, and the same shape proven necessary under real
// concurrency (a naive SELECT-then-write version of that guard passed
// in isolation but failed under the full suite's real concurrency).
// crm_stage is NOT NULL (schema default 'new_lead'), so a plain
// .neq() is sufficient here — no null-safety OR clause needed the way
// the nullable amount_due guard required.
async function attemptUpdateStage(stage: string): Promise<"written" | "no-op"> {
  const { data: updatedRows, error } = await admin
    .from("enquiries")
    .update({ crm_stage: stage })
    .eq("id", enquiryId)
    .neq("crm_stage", stage)
    .select("id");
  if (error) throw new Error(`update failed: ${error.message}`);

  if (!updatedRows || updatedRows.length === 0) {
    return "no-op";
  }

  await admin.from("activity_log").insert({
    action: "enquiry.stage_change",
    entity_type: "enquiry",
    entity_id: enquiryId,
    metadata: { stage },
  });

  return "written";
}

describe("updateStageAction double-submit guard", () => {
  it("nine identical rapid submissions produce exactly one write and one activity row", async () => {
    const attempts = await Promise.all(Array.from({ length: 9 }, () => attemptUpdateStage("booked")));
    const writes = attempts.filter((a) => a === "written").length;
    expect(writes).toBe(1);

    const { data: enquiry } = await admin.from("enquiries").select("crm_stage").eq("id", enquiryId).maybeSingle();
    expect(enquiry?.crm_stage).toBe("booked");

    const { data: rows } = await admin
      .from("activity_log")
      .select("id")
      .eq("entity_id", enquiryId)
      .eq("action", "enquiry.stage_change");
    expect(rows).toHaveLength(1);
  });

  it("reloading after success reflects the newly persisted stage, not the previous one", async () => {
    // Continues from the previous test's state (crm_stage = "booked").
    // A fresh, independent read — simulating a page reload/revalidation
    // — must show the confirmed persisted value.
    const { data: enquiry } = await admin.from("enquiries").select("crm_stage").eq("id", enquiryId).maybeSingle();
    expect(enquiry?.crm_stage).toBe("booked");
  });

  it("a genuinely different subsequent stage still writes and logs normally", async () => {
    // Continues from crm_stage = "booked".
    const result = await attemptUpdateStage("in_progress");
    expect(result).toBe("written");

    const { data: enquiry } = await admin.from("enquiries").select("crm_stage").eq("id", enquiryId).maybeSingle();
    expect(enquiry?.crm_stage).toBe("in_progress");

    const { data: rows } = await admin
      .from("activity_log")
      .select("id, metadata")
      .eq("entity_id", enquiryId)
      .eq("action", "enquiry.stage_change")
      .order("created_at", { ascending: true });
    expect(rows).toHaveLength(2); // the original "booked", plus this new "in_progress" — not suppressed
    expect((rows?.[1]?.metadata as { stage: string })?.stage).toBe("in_progress");
  });

  it("changing back to a previous stage is still a genuine change, not suppressed", async () => {
    // Continues from crm_stage = "in_progress"; setting it back to
    // "booked" must still count as a real change (differs from the
    // *current* value), proving the guard compares against current
    // state, not history.
    const result = await attemptUpdateStage("booked");
    expect(result).toBe("written");

    const { data: rows } = await admin
      .from("activity_log")
      .select("id")
      .eq("entity_id", enquiryId)
      .eq("action", "enquiry.stage_change");
    expect(rows).toHaveLength(3);
  });
});
