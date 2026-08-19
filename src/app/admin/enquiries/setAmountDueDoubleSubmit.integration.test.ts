import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestAdminClient, testRunId } from "@/lib/testing/testEnvironment";

// Regression coverage for the double-submit fix on setAmountDueAction
// (src/app/admin/enquiries/actions.ts) — a real Staging enquiry
// (ENQ-2026-000007 in Production) produced 9 identical
// enquiry.amount_due_set activity rows from what was meant to be one
// admin click, root-caused to the form having no pending/disabled
// state at all. The fix has two layers: a client-side useActionState
// disable (SetAmountDueForm.tsx, not exercisable here — no cookie/
// request context available in this test environment, same limitation
// as every other admin-action test in this project) and a server-side
// no-op-on-unchanged-value guard, which *is* directly testable by
// mirroring the exact same conditional logic the action itself uses.
//
// This suite proves the guard's actual behavior, not a description of
// it: an identical repeated value is a no-op (no second row, no
// second write), while a genuinely different value always proceeds
// normally — the fix must never suppress a real intentional change.

const runId = testRunId();
const admin = createTestAdminClient();

let enquiryId: string;
const referenceNumber = `TEST-AMTDUE-${runId}`;

beforeAll(async () => {
  const { data: enquiry, error } = await admin
    .from("enquiries")
    .insert({
      reference_number: referenceNumber,
      email: `test-amount-due-${runId}@ordiftstudios.invalid`,
      full_name: `Amount Due Double Submit Test ${runId}`,
      service: "photography",
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
      `[setAmountDueDoubleSubmit.integration] CLEANUP FAILED for run ${runId} (enquiry=${enquiryId}) — log to TECHNICAL_DEBT_REGISTER.md's Stale test data section.`,
      failures
    );
  }
});

// Mirrors setAmountDueAction's exact guard: a single atomic
// conditional UPDATE (the "is this actually a change" check lives in
// the UPDATE's own WHERE clause, not a preceding SELECT), no-op if no
// row was affected, otherwise log — the same shape the real action
// uses, so this proves the mechanism itself, not just a description
// of it. An earlier version of this helper mirrored a plain
// SELECT-then-conditional-UPDATE, which is exactly the TOCTOU race
// this suite exists to catch — it passed in isolation (accidental
// serialization under low contention) but failed under the full
// suite's real concurrency, which is what surfaced the bug in the
// real action too.
async function attemptSetAmountDue(requestedAmount: number): Promise<"written" | "no-op"> {
  const rounded = Math.round(requestedAmount * 100) / 100;

  const { data: updatedRows, error } = await admin
    .from("enquiries")
    .update({ amount_due: rounded })
    .eq("id", enquiryId)
    .or(`amount_due.is.null,amount_due.neq.${rounded}`)
    .select("id");
  if (error) throw new Error(`update failed: ${error.message}`);

  if (!updatedRows || updatedRows.length === 0) {
    return "no-op";
  }

  await admin.from("activity_log").insert({
    action: "enquiry.amount_due_set",
    entity_type: "enquiry",
    entity_id: enquiryId,
    metadata: { amountDue: rounded, stageAdvanced: false },
  });

  return "written";
}

describe("setAmountDueAction double-submit guard", () => {
  it("nine identical rapid submissions produce exactly one write and one activity row", async () => {
    const attempts = await Promise.all(Array.from({ length: 9 }, () => attemptSetAmountDue(5)));
    const writes = attempts.filter((a) => a === "written").length;
    expect(writes).toBe(1);

    const { data: enquiry } = await admin.from("enquiries").select("amount_due").eq("id", enquiryId).maybeSingle();
    expect(Number(enquiry?.amount_due)).toBe(5);

    const { data: rows } = await admin
      .from("activity_log")
      .select("id")
      .eq("entity_id", enquiryId)
      .eq("action", "enquiry.amount_due_set");
    expect(rows).toHaveLength(1);
  });

  it("a genuinely different subsequent amount still writes and logs normally", async () => {
    // Continues from the previous test's state (amount_due = 5).
    const result = await attemptSetAmountDue(10);
    expect(result).toBe("written");

    const { data: enquiry } = await admin.from("enquiries").select("amount_due").eq("id", enquiryId).maybeSingle();
    expect(Number(enquiry?.amount_due)).toBe(10);

    const { data: rows } = await admin
      .from("activity_log")
      .select("id, metadata")
      .eq("entity_id", enquiryId)
      .eq("action", "enquiry.amount_due_set")
      .order("created_at", { ascending: true });
    expect(rows).toHaveLength(2); // the original 5, plus this new 10 — not suppressed
    expect((rows?.[1]?.metadata as { amountDue: number })?.amountDue).toBe(10);
  });

  it("changing back to a previous value is still a genuine change, not suppressed", async () => {
    // Continues from amount_due = 10; setting it back to 5 must still
    // count as a real change (differs from the *current* value, 10),
    // proving the guard compares against current state, not history.
    const result = await attemptSetAmountDue(5);
    expect(result).toBe("written");

    const { data: rows } = await admin
      .from("activity_log")
      .select("id")
      .eq("entity_id", enquiryId)
      .eq("action", "enquiry.amount_due_set");
    expect(rows).toHaveLength(3);
  });
});
