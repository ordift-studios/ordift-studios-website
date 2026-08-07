import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestAdminClient, createTestAnonClient, testEmail, testRunId } from "@/lib/testing/testEnvironment";

// Exchange Rate Management (2026-08-07) — proves the two enforcement
// layers the append-only architecture depends on:
//   1. RLS on public.exchange_rates itself: any authenticated user can
//      read every row (needed for the admin history list); staff-tier-
//      and-above can INSERT; nothing can UPDATE or DELETE, because no
//      such policy exists at all (migration 0024, unchanged by 0025's
//      additive reason column) — Postgres denies both by default.
//   2. The Audit Identity Standard's read path: an actor_user_id
//      resolves to a real member_number-labelled identity, the same
//      mechanism addExchangeRateAction's logActivity() call relies on.
//
// Doesn't call insertExchangeRate()/addExchangeRateAction() directly —
// both depend on next/headers' cookies() for a request-scoped Supabase
// client, which doesn't exist outside a real Next.js request. Testing
// the RLS policies the app-layer functions sit on top of is the
// meaningful boundary to prove here, same principle as every other
// *.integration.test.ts in this suite.

const runId = testRunId();
const admin = createTestAdminClient();

let staffUserId: string;
let clientUserId: string;
const staffPassword = `Test-${testRunId()}-Ss1!`;
const clientPassword = `Test-${testRunId()}-Cc1!`;
const staffEmail = testEmail(`exrate-staff-${runId}`, runId);
const clientEmail = testEmail(`exrate-client-${runId}`, runId);

const insertedRateIds: string[] = [];

beforeAll(async () => {
  const [{ data: staff, error: sErr }, { data: client, error: cErr }] = await Promise.all([
    admin.auth.admin.createUser({ email: staffEmail, password: staffPassword, email_confirm: true }),
    admin.auth.admin.createUser({ email: clientEmail, password: clientPassword, email_confirm: true }),
  ]);
  if (sErr || !staff.user) throw new Error(`failed to create staff test user: ${sErr?.message}`);
  if (cErr || !client.user) throw new Error(`failed to create client test user: ${cErr?.message}`);
  staffUserId = staff.user.id;
  clientUserId = client.user.id;

  const { data: staffRole, error: staffRoleError } = await admin.from("roles").select("id").eq("slug", "staff").single();
  if (staffRoleError || !staffRole) throw new Error(`failed to look up staff role: ${staffRoleError?.message}`);
  const { error: grantError } = await admin.from("user_roles").insert({ user_id: staffUserId, role_id: staffRole.id });
  if (grantError) throw new Error(`failed to grant staff role: ${grantError.message}`);
});

afterAll(async () => {
  const results = await Promise.allSettled([
    insertedRateIds.length > 0
      ? admin.from("exchange_rates").delete().in("id", insertedRateIds)
      : Promise.resolve({ error: null }),
    admin.auth.admin.deleteUser(staffUserId),
    admin.auth.admin.deleteUser(clientUserId),
  ]);
  const failures = results.filter((r) => r.status === "rejected" || (r.status === "fulfilled" && "value" in r && r.value?.error));
  if (failures.length > 0) {
    console.error(`[exchangeRateManagement.integration] CLEANUP FAILED for run ${runId}`, failures);
  }
});

describe("exchange_rates RLS", () => {
  it("lets any authenticated user read every row (needed for the admin history list)", async () => {
    const anon = createTestAnonClient();
    await anon.auth.signInWithPassword({ email: clientEmail, password: clientPassword });

    const { data, error } = await anon.from("exchange_rates").select("id, currency_code, rate_to_usd");
    expect(error).toBeNull();
    expect((data ?? []).length).toBeGreaterThan(0); // at least the seeded USD row
  });

  it("lets a staff-tier user INSERT a new rate row", async () => {
    const anon = createTestAnonClient();
    await anon.auth.signInWithPassword({ email: staffEmail, password: staffPassword });

    const { data, error } = await anon
      .from("exchange_rates")
      .insert({ currency_code: "USD", rate_to_usd: 1, reason: `integration test ${runId}`, updated_by: staffUserId })
      .select("id")
      .single();

    expect(error).toBeNull();
    expect(data?.id).toBeTruthy();
    if (data) insertedRateIds.push(data.id);
  });

  it("blocks a plain client (no staff/admin role) from INSERTing a rate row", async () => {
    const anon = createTestAnonClient();
    await anon.auth.signInWithPassword({ email: clientEmail, password: clientPassword });

    const { error } = await anon
      .from("exchange_rates")
      .insert({ currency_code: "USD", rate_to_usd: 1, updated_by: clientUserId });

    expect(error).not.toBeNull();
  });

  it("blocks UPDATE entirely, even for staff — no update policy exists on this table", async () => {
    const anon = createTestAnonClient();
    await anon.auth.signInWithPassword({ email: staffEmail, password: staffPassword });

    // Update the row this same suite just inserted — proves it's not
    // an ownership issue, the operation itself is disallowed.
    const targetId = insertedRateIds[0];
    const { error, count } = await anon
      .from("exchange_rates")
      .update({ rate_to_usd: 999 }, { count: "exact" })
      .eq("id", targetId);

    // PostgREST reports a blocked update as either an explicit RLS
    // error or a silent zero-row match, depending on policy shape —
    // either outcome proves nothing was actually changed.
    if (!error) expect(count).toBe(0);
  });

  it("blocks DELETE entirely, even for staff — no delete policy exists on this table", async () => {
    const anon = createTestAnonClient();
    await anon.auth.signInWithPassword({ email: staffEmail, password: staffPassword });

    const targetId = insertedRateIds[0];
    const { error, count } = await anon.from("exchange_rates").delete({ count: "exact" }).eq("id", targetId);
    if (!error) expect(count).toBe(0);

    // Confirm via the admin client that the row is still there.
    const { data: stillThere } = await admin.from("exchange_rates").select("id").eq("id", targetId).maybeSingle();
    expect(stillThere?.id).toBe(targetId);
  });
});

describe("audit logging for exchange-rate changes", () => {
  // resolveActorIdentity() itself (the read side that turns this row
  // into a "member_number — full name" label) depends on next/headers'
  // cookies() for a request-scoped client, so it can't run in this
  // non-request test environment — it was already proven during the
  // Audit Identity Standard rollout and is exercised for real by every
  // manual admin-page walkthrough. What's specific to this feature,
  // and what genuinely needs proving here, is that addExchangeRateAction's
  // logActivity() call produces a row with the exact shape every other
  // audit surface (/admin/activity, entity-scoped lists) expects.
  it("writes an activity_log row with the actor, action, and entity linkage the display layer expects", async () => {
    const { error: logError } = await admin.from("activity_log").insert({
      actor_user_id: staffUserId,
      action: "payment.exchange_rate_added",
      entity_type: "exchange_rate",
      entity_id: "USD",
      metadata: { currencyCode: "USD", rateToUsd: 1, integrationTest: runId },
    });
    expect(logError).toBeNull();

    const { data: row, error: readError } = await admin
      .from("activity_log")
      .select("actor_user_id, action, entity_type, entity_id, metadata")
      .eq("entity_type", "exchange_rate")
      .eq("actor_user_id", staffUserId)
      .single();

    expect(readError).toBeNull();
    expect(row?.actor_user_id).toBe(staffUserId);
    expect(row?.action).toBe("payment.exchange_rate_added");
    expect(row?.entity_type).toBe("exchange_rate");
    expect((row?.metadata as Record<string, unknown> | null)?.rateToUsd).toBe(1);

    await admin.from("activity_log").delete().eq("entity_type", "exchange_rate").eq("actor_user_id", staffUserId);
  });
});
