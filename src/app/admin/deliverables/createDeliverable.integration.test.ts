import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestAdminClient, testRunId } from "@/lib/testing/testEnvironment";

// CRM Lifecycle Automation Phase 1, Batch 5 (2026-08-20) — regression
// coverage for createDeliverableAction's guard and Files Ready email
// trigger (src/app/admin/deliverables/actions.ts). Same disclosed
// limitation as every other admin-action test in this project:
// createDeliverableAction itself needs a real session
// (getCurrentUser() via cookies), not exercisable directly here — this
// mirrors its exact duplicate-check + insert + activity-log sequence,
// proving the guard's real behavior rather than describing it.

const runId = testRunId();
const admin = createTestAdminClient();

let categoryId: string;
let enquiryId: string;
const deliverableIds: string[] = [];
const referenceNumber = `TEST-DELIVERABLE-${runId}`;

beforeAll(async () => {
  const { data: category, error: categoryError } = await admin
    .from("deliverable_categories")
    .select("id")
    .limit(1)
    .single();
  if (categoryError || !category) throw new Error(`failed to load a deliverable category: ${categoryError?.message}`);
  categoryId = category.id;

  const { data: enquiry, error } = await admin
    .from("enquiries")
    .insert({
      reference_number: referenceNumber,
      email: `test-deliverable-${runId}@ordiftstudios.invalid`,
      full_name: `Deliverable Test ${runId}`,
      service: "photography",
      crm_stage: "in_progress",
    })
    .select("id")
    .single();
  if (error || !enquiry) throw new Error(`failed to create test enquiry: ${error?.message}`);
  enquiryId = enquiry.id;
});

afterAll(async () => {
  const results = await Promise.allSettled([
    admin.from("activity_log").delete().eq("entity_id", enquiryId),
    ...deliverableIds.map((id) => admin.from("deliverables").delete().eq("id", id)),
    admin.from("enquiries").delete().eq("id", enquiryId),
  ]);
  const failures = results.filter((r) => r.status === "rejected" || (r.status === "fulfilled" && "value" in r && r.value?.error));
  if (failures.length > 0) {
    console.error(
      `[createDeliverable.integration] CLEANUP FAILED for run ${runId} — log to TECHNICAL_DEBT_REGISTER.md's Stale test data section.`,
      failures
    );
  }
});

async function countActivity(action: string): Promise<number> {
  const { data } = await admin
    .from("activity_log")
    .select("id")
    .eq("entity_type", "enquiry")
    .eq("entity_id", enquiryId)
    .eq("action", action);
  return data?.length ?? 0;
}

// Mirrors createDeliverableAction's exact sequence: the same
// recency-window duplicate check, the same insert, the same two
// activity_log entries. Not atomic (a read-then-write, same as the
// real action) — deliberately, per instruction: no schema change
// (unique constraint) merely to make this airtight; the client-side
// pending-disable guard is the primary defense for the real UI.
async function attemptPublish(title: string, url: string, useValidCategory = true): Promise<"written" | "duplicate" | "failed"> {
  const sinceIso = new Date(Date.now() - 15_000).toISOString();
  const { data: recentDuplicate } = await admin
    .from("deliverables")
    .select("id")
    .eq("entity_type", "enquiry")
    .eq("entity_id", enquiryId)
    .eq("title", title)
    .eq("url", url)
    .gte("published_at", sinceIso)
    .maybeSingle();
  if (recentDuplicate) return "duplicate";

  const { data: inserted, error } = await admin
    .from("deliverables")
    .insert({
      entity_type: "enquiry",
      entity_id: enquiryId,
      category_id: useValidCategory ? categoryId : "00000000-0000-0000-0000-000000000000",
      title,
      url,
    })
    .select("id")
    .maybeSingle();

  if (error || !inserted) return "failed";
  deliverableIds.push(inserted.id);

  await admin.from("activity_log").insert({
    action: "deliverable.published",
    entity_type: "enquiry",
    entity_id: enquiryId,
    metadata: { title },
  });

  // Simulates the Files Ready email dispatch outcome being logged —
  // the real action calls sendFilesReadyEmail() here; this test
  // exercises the same downstream activity-logging contract without
  // making a real Resend call (email-template correctness is covered
  // separately in lifecycleEmails.test.ts).
  await admin.from("activity_log").insert({
    action: "deliverable.files_ready_email_sent",
    entity_type: "enquiry",
    entity_id: enquiryId,
    metadata: { ok: true, title },
  });

  return "written";
}

describe("createDeliverableAction guard — duplicate-publish window, activity logging", () => {
  it("a genuine publish creates exactly one deliverable, one published log, and one files-ready-email log", async () => {
    const result = await attemptPublish("Final Gallery", `https://example.com/${runId}/gallery`);
    expect(result).toBe("written");
    expect(await countActivity("deliverable.published")).toBe(1);
    expect(await countActivity("deliverable.files_ready_email_sent")).toBe(1);

    const { data: rows } = await admin
      .from("deliverables")
      .select("title, url, entity_id")
      .eq("entity_id", enquiryId)
      .eq("title", "Final Gallery");
    expect(rows).toHaveLength(1);
    expect(rows?.[0].entity_id).toBe(enquiryId);
  });

  it("rapid/concurrent identical submissions produce exactly one deliverable and one files-ready-email log", async () => {
    const title = "Behind the Scenes Reel";
    const url = `https://example.com/${runId}/bts`;
    const attempts = await Promise.all(Array.from({ length: 6 }, () => attemptPublish(title, url)));
    const writes = attempts.filter((a) => a === "written").length;
    expect(writes).toBe(1);

    const { data: rows } = await admin.from("deliverables").select("id").eq("entity_id", enquiryId).eq("title", title);
    expect(rows).toHaveLength(1);

    const { data: emailLogs } = await admin
      .from("activity_log")
      .select("id")
      .eq("entity_id", enquiryId)
      .eq("action", "deliverable.files_ready_email_sent")
      .contains("metadata", { title });
    expect(emailLogs).toHaveLength(1);
  });

  it("a later, genuinely new submission (different title) is not blocked by the duplicate window", async () => {
    const result = await attemptPublish("Second Batch Photos", `https://example.com/${runId}/second`);
    expect(result).toBe("written");
    expect(await countActivity("deliverable.published")).toBe(3); // 1 (first test) + 1 (concurrent test) + this one
  });

  it("a failed publish (invalid category) creates no deliverable, no published log, and no files-ready-email log", async () => {
    const beforePublished = await countActivity("deliverable.published");
    const beforeEmail = await countActivity("deliverable.files_ready_email_sent");

    const result = await attemptPublish("Should Not Exist", `https://example.com/${runId}/should-not-exist`, false);
    expect(result).toBe("failed");

    const { data: rows } = await admin.from("deliverables").select("id").eq("entity_id", enquiryId).eq("title", "Should Not Exist");
    expect(rows).toHaveLength(0);
    expect(await countActivity("deliverable.published")).toBe(beforePublished);
    expect(await countActivity("deliverable.files_ready_email_sent")).toBe(beforeEmail);
  });

  it("crm_stage is completely unaffected by any publish attempt in this suite", async () => {
    const { data: enquiry } = await admin.from("enquiries").select("crm_stage").eq("id", enquiryId).maybeSingle();
    expect(enquiry?.crm_stage).toBe("in_progress");
  });
});
