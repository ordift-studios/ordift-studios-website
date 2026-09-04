import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestAdminClient, createTestAnonClient, testEmail, testRunId } from "@/lib/testing/testEnvironment";

// Phase F.1 (2026-09-04) — proves the exact RLS/GRANT mechanism
// isSupportedCurrency() (src/lib/payments/currency.ts) now depends on,
// traced live against Production after a real rejection of "GHS" — a
// genuinely active currency — for Sylvia's first real engagement.
//
// Root cause, confirmed via Vercel runtime logs and direct inspection
// of information_schema.role_table_grants: migration 0024 never
// granted SELECT on public.currencies to service_role (every other
// table this codebase's admin client reads does have that grant) —
// service_role's BYPASSRLS is irrelevant here, because a missing
// table-level GRANT is checked before RLS is ever evaluated, so the
// admin client got a hard "permission denied for table currencies" on
// every call, for every currency code, unconditionally.
//
// The fix switches isSupportedCurrency() to the session-scoped client
// — the exact one listActiveCurrencies() already used successfully to
// populate the very dropdown Sylvia's admin selected "GHS" from — so
// this suite doesn't call isSupportedCurrency() directly (like every
// other *.integration.test.ts here, it depends on next/headers'
// cookies() for a request-scoped client, unavailable outside a real
// Next.js request). What's meaningful and actually provable here is
// the RLS+GRANT boundary isSupportedCurrency() now sits on top of:
//   1. an `authenticated` role CAN read an active currency row
//      (the mechanism the fix relies on);
//   2. `service_role` still CANNOT (locks in the root cause, so a
//      future "helpful" revert back to the admin client fails loudly
//      in this suite instead of silently in Production again);
//   3. GHS specifically is present and active (the actual data fact);
//   4. an inactive/unsupported code correctly returns no row even for
//      `authenticated` (proves the is_active filter, not just blanket
//      table access).

const runId = testRunId();
const admin = createTestAdminClient();

let userId: string;
const password = `Test-${testRunId()}-Cc1!`;
const email = testEmail(`currency-${runId}`, runId);

beforeAll(async () => {
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error || !data.user) throw new Error(`failed to create test user: ${error?.message}`);
  userId = data.user.id;
});

afterAll(async () => {
  const { error } = await admin.auth.admin.deleteUser(userId);
  if (error) console.error(`[currencyValidation.integration] CLEANUP FAILED for run ${runId}`, error.message);
});

describe("public.currencies RLS/GRANT boundary (Phase F.1 root cause)", () => {
  it("an authenticated user can read an active currency by code — the mechanism isSupportedCurrency() now relies on", async () => {
    const anon = createTestAnonClient();
    await anon.auth.signInWithPassword({ email, password });

    const { data, error } = await anon.from("currencies").select("code").eq("code", "GHS").eq("is_active", true).maybeSingle();
    expect(error).toBeNull();
    expect(data?.code).toBe("GHS");
  });

  it("GHS specifically is active — the exact currency Sylvia's real engagement needs", async () => {
    const { data, error } = await admin.from("currencies").select("code, is_active").eq("code", "GHS").maybeSingle();
    expect(error).toBeNull();
    expect(data?.is_active).toBe(true);
  });

  it("an unsupported/garbage code returns no row for an authenticated user (the filter works, not just table access)", async () => {
    const anon = createTestAnonClient();
    await anon.auth.signInWithPassword({ email, password });

    const { data, error } = await anon.from("currencies").select("code").eq("code", "ZZZ-NOT-REAL").eq("is_active", true).maybeSingle();
    expect(error).toBeNull();
    expect(data).toBeNull();
  });

  it("service_role is STILL denied table-level access to currencies — locks in the root cause; isSupportedCurrency() must never move back to the admin client without first fixing this grant", async () => {
    const { error } = await admin.from("currencies").select("code").eq("code", "GHS").maybeSingle();
    expect(error).not.toBeNull();
    expect(error?.message).toContain("permission denied for table currencies");
  });
});
