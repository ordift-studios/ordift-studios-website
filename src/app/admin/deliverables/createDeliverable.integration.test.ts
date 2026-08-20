import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestAdminClient, testRunId } from "@/lib/testing/testEnvironment";

// CRM Lifecycle Automation Phase 1, Batch 5 + hardening patch
// (2026-08-20) — regression coverage for createDeliverableAction's
// guard and Files Ready email trigger (src/app/admin/deliverables/
// actions.ts). Same disclosed limitation as every other admin-action
// test in this project: createDeliverableAction itself needs a real
// session, not exercisable directly here — this calls the exact same
// atomic RPC (publish_deliverable_with_claim(), migration 0034) the
// real action calls, then mirrors the same activity-log sequence,
// proving the real guarantee rather than re-describing it.
//
// The original (pre-hardening) version of this file mirrored the
// SELECT-then-INSERT duplicate check in application code. That check
// was proven, empirically, not to be safe under genuine concurrency —
// re-running its own "6 concurrent identical submissions" test
// reproducibly showed 6 writes, not 1. This version calls the real,
// atomically-guaranteed database function instead, so its assertions
// hold by construction, not by luck of timing.

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
    admin.from("deliverable_publish_claims").delete().eq("entity_id", enquiryId),
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

type PublishOutcome = { outcome: "published"; deliverableId: string } | { outcome: "duplicate" } | { outcome: "failed" };

// Calls the exact same atomic RPC createDeliverableAction calls, then
// mirrors its exact downstream activity-logging sequence (which stays
// in TypeScript, not SQL, since it involves the Resend email dispatch)
// — the real end-to-end contract, not a re-implementation of the part
// that matters most (the claim + insert atomicity).
async function attemptPublish(title: string, url: string, useValidCategory = true): Promise<PublishOutcome> {
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

  if (error) return { outcome: "failed" };

  const result = claimResult?.[0];
  if (!result || result.claim_status === "duplicate") return { outcome: "duplicate" };

  const deliverableId = result.deliverable_id as string;
  deliverableIds.push(deliverableId);

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

  return { outcome: "published", deliverableId };
}

describe("publish_deliverable_with_claim — atomic duplicate-publish guard", () => {
  it("a genuine publish creates exactly one deliverable, one published log, and one files-ready-email log", async () => {
    const result = await attemptPublish("Final Gallery", `https://example.com/${runId}/gallery`);
    expect(result.outcome).toBe("published");
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

  it("6 truly simultaneous identical submissions produce exactly one deliverable, one published log, one files-ready-email log — losers create nothing", async () => {
    const title = "Behind the Scenes Reel";
    const url = `https://example.com/${runId}/bts`;
    const results = await Promise.all(Array.from({ length: 6 }, () => attemptPublish(title, url)));

    const published = results.filter((r) => r.outcome === "published");
    const duplicates = results.filter((r) => r.outcome === "duplicate");
    expect(published).toHaveLength(1);
    expect(duplicates).toHaveLength(5);

    const { data: rows } = await admin.from("deliverables").select("id").eq("entity_id", enquiryId).eq("title", title);
    expect(rows).toHaveLength(1); // the losers created nothing at all — not even an orphaned row

    const { data: publishedLogs } = await admin
      .from("activity_log")
      .select("id")
      .eq("entity_id", enquiryId)
      .eq("action", "deliverable.published")
      .contains("metadata", { title });
    expect(publishedLogs).toHaveLength(1);

    const { data: emailLogs } = await admin
      .from("activity_log")
      .select("id")
      .eq("entity_id", enquiryId)
      .eq("action", "deliverable.files_ready_email_sent")
      .contains("metadata", { title });
    expect(emailLogs).toHaveLength(1);
  });

  it("a later, genuinely new submission (different title) is not blocked by another key's duplicate window", async () => {
    const result = await attemptPublish("Second Batch Photos", `https://example.com/${runId}/second`);
    expect(result.outcome).toBe("published");
    expect(await countActivity("deliverable.published")).toBe(3); // 1 (first test) + 1 (concurrent test) + this one
  });

  it("an identical publish is blocked immediately after the window, but succeeds again once the window has genuinely passed", async () => {
    const title = "Reclaim Window Test";
    const url = `https://example.com/${runId}/reclaim`;

    const first = await attemptPublish(title, url);
    expect(first.outcome).toBe("published");

    const immediateRepeat = await attemptPublish(title, url);
    expect(immediateRepeat.outcome).toBe("duplicate");

    // Simulate the passage of time by backdating the claim directly,
    // rather than a real 15-second sleep in the suite — the function's
    // own reclaim logic only cares about claimed_at's actual value.
    const { error: backdateError } = await admin
      .from("deliverable_publish_claims")
      .update({ claimed_at: new Date(Date.now() - 20_000).toISOString() })
      .eq("entity_type", "enquiry")
      .eq("entity_id", enquiryId)
      .eq("title", title)
      .eq("url", url);
    expect(backdateError).toBeNull();

    const afterWindow = await attemptPublish(title, url);
    expect(afterWindow.outcome).toBe("published"); // requirement 5: legitimate later republish stays possible

    const { data: rows } = await admin.from("deliverables").select("id").eq("entity_id", enquiryId).eq("title", title);
    expect(rows).toHaveLength(2); // the original genuine publish, plus the legitimate later one — never blocked forever
  });

  it("a failed publish (invalid category) creates no deliverable, no claim, no published log, no files-ready-email log — and can be retried immediately", async () => {
    const title = "Should Not Exist Until Retried";
    const url = `https://example.com/${runId}/should-not-exist`;
    const beforePublished = await countActivity("deliverable.published");
    const beforeEmail = await countActivity("deliverable.files_ready_email_sent");

    const failedAttempt = await attemptPublish(title, url, false);
    expect(failedAttempt.outcome).toBe("failed");

    const { data: rows } = await admin.from("deliverables").select("id").eq("entity_id", enquiryId).eq("title", title);
    expect(rows).toHaveLength(0);
    expect(await countActivity("deliverable.published")).toBe(beforePublished);
    expect(await countActivity("deliverable.files_ready_email_sent")).toBe(beforeEmail);

    // Requirement: a failed publish must not leave a stale claim
    // blocking an immediate legitimate retry — the whole function call
    // (claim included) rolled back as one transaction, so no claim row
    // survives at all for this key.
    const { data: claimRows } = await admin
      .from("deliverable_publish_claims")
      .select("id")
      .eq("entity_type", "enquiry")
      .eq("entity_id", enquiryId)
      .eq("title", title)
      .eq("url", url);
    expect(claimRows).toHaveLength(0);

    // The immediate retry, now with a valid category, must succeed —
    // proving the failure genuinely left nothing behind to block it.
    const retry = await attemptPublish(title, url, true);
    expect(retry.outcome).toBe("published");
    expect(await countActivity("deliverable.published")).toBe(beforePublished + 1);
    expect(await countActivity("deliverable.files_ready_email_sent")).toBe(beforeEmail + 1);
  });

  it("crm_stage is completely unaffected by any publish attempt in this suite", async () => {
    const { data: enquiry } = await admin.from("enquiries").select("crm_stage").eq("id", enquiryId).maybeSingle();
    expect(enquiry?.crm_stage).toBe("in_progress");
  });
});
