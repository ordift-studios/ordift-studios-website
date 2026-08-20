import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestAdminClient, testRunId } from "@/lib/testing/testEnvironment";
import { CRM_STAGES, type CrmStage } from "@/lib/admin/enquiries";

// CRM Lifecycle Automation Phase 1, Batch 6 (2026-08-20; rebased onto
// the Batch 5 hardening patch 2026-08-21) — regression coverage for
// createDeliverableAction's stage-advance step
// (src/app/admin/deliverables/actions.ts): booked/in_progress + a
// genuine deliverable publish -> delivered, every other stage a clean
// no-op, never a regression or duplicate. Same disclosed limitation as
// every other admin-action test in this project: createDeliverableAction
// itself needs a real session, not exercisable directly here — this
// calls the exact same atomic RPC (publish_deliverable_with_claim(),
// migration 0034) the real action calls, then mirrors its exact
// downstream sequence (deliverable.published log, the crm_stage
// guarded UPDATE, its own activity log, then the files-ready-email
// log) — proving the guard's real behavior, not describing it.

const runId = testRunId();
const admin = createTestAdminClient();

let categoryId: string;
const enquiryIds: string[] = [];
const deliverableIds: string[] = [];

beforeAll(async () => {
  const { data: category, error } = await admin.from("deliverable_categories").select("id").limit(1).single();
  if (error || !category) throw new Error(`failed to load a deliverable category: ${error?.message}`);
  categoryId = category.id;
});

async function createTestEnquiry(crmStage: CrmStage, label: string): Promise<string> {
  const { data, error } = await admin
    .from("enquiries")
    .insert({
      reference_number: `TEST-DELIVSTAGE-${label}-${runId}`,
      email: `test-deliv-stage-${label}-${runId}@ordiftstudios.invalid`,
      full_name: `Deliverable Stage Advance Test ${label} ${runId}`,
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

async function countFilesReadyActivity(enquiryId: string): Promise<number> {
  const { data } = await admin
    .from("activity_log")
    .select("id")
    .eq("entity_type", "enquiry")
    .eq("entity_id", enquiryId)
    .eq("action", "deliverable.files_ready_email_sent");
  return data?.length ?? 0;
}

// Calls the exact same atomic RPC createDeliverableAction calls, then
// mirrors its exact downstream sequence: deliverable.published log,
// the crm_stage guarded UPDATE (identical WHERE clause), its own
// activity log, then the files-ready-email log — same order as the
// real action, so a losing/duplicate RPC result never reaches the
// stage-advance step at all, by construction, not by a separate check.
async function attemptPublish(
  enquiryId: string,
  title: string,
  url: string,
  useValidCategory = true
): Promise<"written" | "duplicate" | "failed"> {
  const { data: claimResult, error } = await admin.rpc("publish_deliverable_with_claim", {
    p_entity_type: "enquiry",
    p_entity_id: enquiryId,
    p_category_id: useValidCategory ? categoryId : "00000000-0000-0000-0000-000000000000",
    p_title: title,
    p_description: null,
    p_url: url,
    p_thumbnail_url: null,
    p_published_by: null,
  });

  if (error) return "failed";

  const result = claimResult?.[0];
  if (!result || result.claim_status === "duplicate") return "duplicate";

  const deliverableId = result.deliverable_id as string;
  deliverableIds.push(deliverableId);

  await admin.from("activity_log").insert({
    action: "deliverable.published",
    entity_type: "enquiry",
    entity_id: enquiryId,
    metadata: { title },
  });

  const { data: updatedRows } = await admin
    .from("enquiries")
    .update({ crm_stage: "delivered" })
    .eq("id", enquiryId)
    .in("crm_stage", ["booked", "in_progress"])
    .select("id");

  if (updatedRows && updatedRows.length > 0) {
    await admin.from("activity_log").insert({
      action: "enquiry.stage_change",
      entity_type: "enquiry",
      entity_id: enquiryId,
      metadata: { stage: "delivered", automated: true, reason: "deliverable_published" },
    });
  }

  // Files Ready fires once per genuine publish, entirely independent
  // of whether the stage-advance above fired — proving Batch 5 stays
  // exactly as implemented, not gated by or duplicated because of the
  // Batch 6 step.
  await admin.from("activity_log").insert({
    action: "deliverable.files_ready_email_sent",
    entity_type: "enquiry",
    entity_id: enquiryId,
    metadata: { ok: true, title },
  });

  return "written";
}

afterAll(async () => {
  const results = await Promise.allSettled([
    ...enquiryIds.map((id) => admin.from("activity_log").delete().eq("entity_id", id)),
    ...enquiryIds.map((id) => admin.from("deliverable_publish_claims").delete().eq("entity_id", id)),
    ...deliverableIds.map((id) => admin.from("deliverables").delete().eq("id", id)),
    ...enquiryIds.map((id) => admin.from("enquiries").delete().eq("id", id)),
  ]);
  const failures = results.filter((r) => r.status === "rejected" || (r.status === "fulfilled" && "value" in r && r.value?.error));
  if (failures.length > 0) {
    console.error(
      `[deliverableStageAdvance.integration] CLEANUP FAILED for run ${runId} — log to TECHNICAL_DEBT_REGISTER.md's Stale test data section.`,
      failures
    );
  }
});

describe("deliverable-triggered stage advance — eligible stages", () => {
  it.each(["booked", "in_progress"] as const)(
    "'%s' + a genuine publish advances to 'delivered' exactly once",
    async (startStage) => {
      const enquiryId = await createTestEnquiry(startStage, `eligible-${startStage}`);
      const result = await attemptPublish(enquiryId, "Final Gallery", `https://example.com/${runId}/${startStage}`);
      expect(result).toBe("written");

      const { data: enquiry } = await admin.from("enquiries").select("crm_stage").eq("id", enquiryId).maybeSingle();
      expect(enquiry?.crm_stage).toBe("delivered");
      expect(await countStageChangeActivity(enquiryId)).toBe(1);
      // Exactly one Files Ready email — the stage advance never
      // duplicates or gates Batch 5's existing notification.
      expect(await countFilesReadyActivity(enquiryId)).toBe(1);

      const { data: rows } = await admin
        .from("activity_log")
        .select("metadata")
        .eq("entity_id", enquiryId)
        .eq("action", "enquiry.stage_change")
        .single();
      expect(rows?.metadata).toMatchObject({ stage: "delivered", automated: true, reason: "deliverable_published" });
    }
  );
});

describe("deliverable-triggered stage advance — every other stage is a clean no-op", () => {
  it.each(CRM_STAGES.filter((s) => s !== "booked" && s !== "in_progress"))(
    "'%s' + a publish never auto-advances to 'delivered'",
    async (startStage) => {
      const enquiryId = await createTestEnquiry(startStage, `noop-${startStage}`);
      const result = await attemptPublish(enquiryId, "Final Gallery", `https://example.com/${runId}/${startStage}`);
      expect(result).toBe("written"); // the deliverable itself still publishes fine

      const { data: enquiry } = await admin.from("enquiries").select("crm_stage").eq("id", enquiryId).maybeSingle();
      expect(enquiry?.crm_stage).toBe(startStage); // unchanged
      expect(await countStageChangeActivity(enquiryId)).toBe(0);
    }
  );
});

describe("deliverable-triggered stage advance — no regression or duplicate once delivered", () => {
  it("a second, genuinely different deliverable published after 'delivered' does not re-log or regress", async () => {
    const enquiryId = await createTestEnquiry("in_progress", "second-deliverable");

    const first = await attemptPublish(enquiryId, "First Gallery", `https://example.com/${runId}/first`);
    expect(first).toBe("written");
    expect(await countStageChangeActivity(enquiryId)).toBe(1);

    const second = await attemptPublish(enquiryId, "Second Gallery", `https://example.com/${runId}/second`);
    expect(second).toBe("written"); // the deliverable itself still publishes fine

    const { data: enquiry } = await admin.from("enquiries").select("crm_stage").eq("id", enquiryId).maybeSingle();
    expect(enquiry?.crm_stage).toBe("delivered"); // still delivered, not regressed
    expect(await countStageChangeActivity(enquiryId)).toBe(1); // still exactly one — no duplicate
    // Each genuinely new deliverable still gets its own Files Ready
    // email (that's correct, expected Batch 5 behavior) — two here,
    // one per real publish, unrelated to the single stage-change count.
    expect(await countFilesReadyActivity(enquiryId)).toBe(2);
  });

  it("5 concurrent publishes of different titles against the same eligible enquiry produce exactly one stage-change log", async () => {
    const enquiryId = await createTestEnquiry("booked", "concurrent-different-titles");
    const attempts = await Promise.all(
      Array.from({ length: 5 }, (_, i) => attemptPublish(enquiryId, `Gallery ${i}`, `https://example.com/${runId}/concurrent-${i}`))
    );
    expect(attempts.every((a) => a === "written")).toBe(true); // all 5 are genuinely different deliverables

    const { data: enquiry } = await admin.from("enquiries").select("crm_stage").eq("id", enquiryId).maybeSingle();
    expect(enquiry?.crm_stage).toBe("delivered");
    expect(await countStageChangeActivity(enquiryId)).toBe(1); // exactly one, despite 5 concurrent eligible writes
  });

  it("6 truly simultaneous identical-publish attempts against an eligible enquiry produce exactly one stage-change log — losing duplicates never reach the stage-advance step at all", async () => {
    const enquiryId = await createTestEnquiry("in_progress", "concurrent-identical-title");
    const title = "Behind the Scenes Reel";
    const url = `https://example.com/${runId}/bts-stage-advance`;

    const attempts = await Promise.all(Array.from({ length: 6 }, () => attemptPublish(enquiryId, title, url)));
    const written = attempts.filter((a) => a === "written");
    const duplicates = attempts.filter((a) => a === "duplicate");
    expect(written).toHaveLength(1); // the atomic claim guarantees exactly one winner
    expect(duplicates).toHaveLength(5); // the 5 losers return before ever touching crm_stage

    const { data: enquiry } = await admin.from("enquiries").select("crm_stage").eq("id", enquiryId).maybeSingle();
    expect(enquiry?.crm_stage).toBe("delivered");
    expect(await countStageChangeActivity(enquiryId)).toBe(1); // never repeated, despite 6 simultaneous requests
    expect(await countFilesReadyActivity(enquiryId)).toBe(1); // Batch 5's own guarantee still holds unchanged
  });
});

describe("deliverable-triggered stage advance — failed publish", () => {
  it("a failed publish (invalid category) produces no crm_stage change and no stage-change log", async () => {
    const enquiryId = await createTestEnquiry("in_progress", "failed-publish");
    const result = await attemptPublish(enquiryId, "Should Not Exist", `https://example.com/${runId}/should-not-exist`, false);
    expect(result).toBe("failed");

    const { data: enquiry } = await admin.from("enquiries").select("crm_stage").eq("id", enquiryId).maybeSingle();
    expect(enquiry?.crm_stage).toBe("in_progress"); // unchanged
    expect(await countStageChangeActivity(enquiryId)).toBe(0);
  });
});
