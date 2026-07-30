import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestAdminClient, createTestAnonClient, testEmail, testRunId } from "@/lib/testing/testEnvironment";

// Proves the platform's actual security guarantee (ADR-002): that
// Postgres RLS — not application code — is what stops one client from
// reading another client's data. This can only be tested honestly
// against a real database; a mocked Supabase client would only prove
// the mock behaves as programmed. Runs against staging only, per
// INTEGRATION_TESTING_STRATEGY.md — never production.
//
// Exercises the exact policy in supabase/migrations/0001_init.sql:
//   create policy "profiles: read own" on public.profiles
//     for select to authenticated
//     using ((select auth.uid()) = id or (select public.is_staff_or_admin()));
//
// Two plain `client`-role users (no staff/admin role) are created, so
// the "or is_staff_or_admin()" clause never applies here — a clean
// test of the "own row only" half of the policy.

const runId = testRunId();
const admin = createTestAdminClient();

let userAId: string;
let userBId: string;
const passwordA = `Test-${testRunId()}-Aa1!`;
const passwordB = `Test-${testRunId()}-Bb1!`;

beforeAll(async () => {
  const { data: userA, error: errorA } = await admin.auth.admin.createUser({
    email: testEmail(`rls-a-${runId}`, runId),
    password: passwordA,
    email_confirm: true, // pre-confirmed — skips the public signup flow and its
    // confirmation email entirely, per INTEGRATION_TESTING_STRATEGY.md §2
    // (avoids Supabase's 30-new-users/hour and Resend's 100/day limits).
    user_metadata: { full_name: `RLS Test User A ${runId}` },
  });
  if (errorA || !userA.user) throw new Error(`[rls.integration] failed to create test user A: ${errorA?.message}`);
  userAId = userA.user.id;

  const { data: userB, error: errorB } = await admin.auth.admin.createUser({
    email: testEmail(`rls-b-${runId}`, runId),
    password: passwordB,
    email_confirm: true,
    user_metadata: { full_name: `RLS Test User B ${runId}` },
  });
  if (errorB || !userB.user) throw new Error(`[rls.integration] failed to create test user B: ${errorB?.message}`);
  userBId = userB.user.id;
});

afterAll(async () => {
  // profiles.id references auth.users(id) on delete cascade — deleting
  // the auth user is sufficient, no separate profile cleanup needed.
  // Per INTEGRATION_TESTING_STRATEGY.md §4: a failure here should be
  // treated as tracked debt, not silently swallowed — surfaced loudly
  // so it's not missed.
  const results = await Promise.allSettled([admin.auth.admin.deleteUser(userAId), admin.auth.admin.deleteUser(userBId)]);
  const failures = results.filter((r) => r.status === "rejected");
  if (failures.length > 0) {
    console.error(
      `[rls.integration] CLEANUP FAILED for run ${runId} — orphaned test users remain in staging ` +
        `(userAId=${userAId}, userBId=${userBId}). Log this to TECHNICAL_DEBT_REGISTER.md's ` +
        `"Stale test data" section per INTEGRATION_TESTING_STRATEGY.md §4.`,
      failures
    );
  }
});

describe("profiles RLS: read own row only", () => {
  it("lets a signed-in client read their own profile row", async () => {
    const anon = createTestAnonClient();
    const { error: signInError } = await anon.auth.signInWithPassword({
      email: testEmail(`rls-a-${runId}`, runId),
      password: passwordA,
    });
    expect(signInError).toBeNull();

    const { data, error } = await anon.from("profiles").select("id, full_name").eq("id", userAId);
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
    expect(data![0].id).toBe(userAId);
  });

  it("blocks a signed-in client from reading another client's profile row — the actual security boundary", async () => {
    const anon = createTestAnonClient();
    const { error: signInError } = await anon.auth.signInWithPassword({
      email: testEmail(`rls-a-${runId}`, runId),
      password: passwordA,
    });
    expect(signInError).toBeNull();

    // RLS filters rather than errors — a blocked read returns an empty
    // result set, not a 403/error. Asserting the empty-array shape is
    // the whole point of this test: this is what "silently unauthorized
    // reads are structurally impossible" actually looks like from the
    // caller's side.
    const { data, error } = await anon.from("profiles").select("id, full_name").eq("id", userBId);
    expect(error).toBeNull();
    expect(data).toHaveLength(0);
  });

  it("blocks an anonymous (signed-out) client from reading any profile row", async () => {
    const anon = createTestAnonClient();
    const { data, error } = await anon.from("profiles").select("id, full_name").eq("id", userAId);
    expect(error).toBeNull();
    expect(data).toHaveLength(0);
  });
});
