import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { resolveNewBookingRecipients } from "./recipients";
import { createTestAdminClient, createTestAnonClient, testEmail, testRunId } from "@/lib/testing/testEnvironment";

// CRM Lifecycle Automation Phase 1, Batch 3 refinement (2026-08-20) —
// proves the notification_preferences-driven recipient resolution
// end-to-end against a real staging database, per INTEGRATION_TESTING_
// STRATEGY.md's "RLS/authorization can only be tested honestly against
// a real database" principle (see rls.integration.test.ts). Requires
// migration 0033_notification_preferences.sql to already be applied —
// manually applied to Staging 2026-08-20.

const runId = testRunId();
const admin = createTestAdminClient();

let superAdminId: string;
let superAdminWithStrayDisabledRowId: string;
let optedInAdminId: string;
let optedOutAdminId: string;
let newAdminId: string; // holds admin role, no preference row at all
let suspendedOptedInAdminId: string;
let staffId: string;
let clientId: string;

const password = (label: string) => `Test-${runId}-${label}1!`;

async function createTestUser(label: string): Promise<string> {
  const { data, error } = await admin.auth.admin.createUser({
    email: testEmail(`notif-recipients-${label}-${runId}`, runId),
    password: password(label),
    email_confirm: true,
    user_metadata: { full_name: `Notification Recipients Test ${label} ${runId}` },
  });
  if (error || !data.user) throw new Error(`failed to create test user (${label}): ${error?.message}`);
  return data.user.id;
}

async function grantRole(userId: string, roleSlug: string): Promise<void> {
  const { data: role, error: roleError } = await admin.from("roles").select("id").eq("slug", roleSlug).single();
  if (roleError || !role) throw new Error(`failed to look up role ${roleSlug}: ${roleError?.message}`);
  const { error } = await admin.from("user_roles").insert({ user_id: userId, role_id: role.id });
  if (error) throw new Error(`failed to grant role ${roleSlug} to ${userId}: ${error.message}`);
}

async function setPreference(userId: string, enabled: boolean): Promise<void> {
  const { error } = await admin
    .from("notification_preferences")
    .upsert({ user_id: userId, category: "new_booking", enabled }, { onConflict: "user_id,category" });
  if (error) throw new Error(`failed to set preference for ${userId}: ${error.message}`);
}

beforeAll(async () => {
  [
    superAdminId,
    superAdminWithStrayDisabledRowId,
    optedInAdminId,
    optedOutAdminId,
    newAdminId,
    suspendedOptedInAdminId,
    staffId,
    clientId,
  ] = await Promise.all([
    createTestUser("superadmin"),
    createTestUser("superadmin-strayrow"),
    createTestUser("optedin"),
    createTestUser("optedout"),
    createTestUser("newadmin"),
    createTestUser("suspended"),
    createTestUser("staff"),
    createTestUser("client"),
  ]);

  await Promise.all([
    grantRole(superAdminId, "super_admin"),
    grantRole(superAdminWithStrayDisabledRowId, "super_admin"),
    grantRole(optedInAdminId, "admin"),
    grantRole(optedOutAdminId, "admin"),
    grantRole(newAdminId, "admin"),
    grantRole(suspendedOptedInAdminId, "admin"),
    grantRole(staffId, "staff"),
    // clientId gets no role grant — self-signup already defaults to `client`-equivalent (no role row at all
    // is also a valid "not admin/super_admin" state, but staff proves the role-gate; client proves "no role
    // at all" is equally excluded).
  ]);

  await Promise.all([
    setPreference(optedInAdminId, true),
    setPreference(optedOutAdminId, false),
    // newAdminId: deliberately no preference row at all.
    setPreference(suspendedOptedInAdminId, true),
    // A Super Admin can never be "disabled" through this mechanism —
    // resolveNewBookingRecipients() never even queries the preference
    // table for a Super Admin, so a stray disabled row (however it got
    // there) must have zero effect on whether they're notified.
    setPreference(superAdminWithStrayDisabledRowId, false),
    // Stray rows on non-admin/-super_admin users — proves the role gate
    // is checked independently of whatever the preference table says.
    setPreference(staffId, true),
    setPreference(clientId, true),
  ]);

  const { error: suspendError } = await admin
    .from("profiles")
    .update({ access_status: "suspended" })
    .eq("id", suspendedOptedInAdminId);
  if (suspendError) throw new Error(`failed to suspend test admin: ${suspendError.message}`);
});

afterAll(async () => {
  const ids = [
    superAdminId,
    superAdminWithStrayDisabledRowId,
    optedInAdminId,
    optedOutAdminId,
    newAdminId,
    suspendedOptedInAdminId,
    staffId,
    clientId,
  ].filter(Boolean);
  // profiles/notification_preferences both reference auth.users(id) with
  // on delete cascade — deleting the auth user is sufficient.
  const results = await Promise.allSettled(ids.map((id) => admin.auth.admin.deleteUser(id)));
  const failures = results.filter((r) => r.status === "rejected");
  if (failures.length > 0) {
    console.error(
      `[recipients.integration] CLEANUP FAILED for run ${runId} — log to TECHNICAL_DEBT_REGISTER.md's Stale test data section.`,
      failures
    );
  }
});

describe("resolveNewBookingRecipients", () => {
  it("includes an Admin who has explicitly opted in", async () => {
    const recipients = await resolveNewBookingRecipients("enquiry", "irrelevant-for-this-test");
    expect(recipients.map((r) => r.userId)).toContain(optedInAdminId);
  });

  it("excludes an Admin who has explicitly opted out", async () => {
    const recipients = await resolveNewBookingRecipients("enquiry", "irrelevant-for-this-test");
    expect(recipients.map((r) => r.userId)).not.toContain(optedOutAdminId);
  });

  it("excludes a newly-granted Admin with no preference row at all — role grant never implies opt-in", async () => {
    const recipients = await resolveNewBookingRecipients("enquiry", "irrelevant-for-this-test");
    expect(recipients.map((r) => r.userId)).not.toContain(newAdminId);
  });

  it("always includes an active Super Admin, with no preference row required", async () => {
    const recipients = await resolveNewBookingRecipients("enquiry", "irrelevant-for-this-test");
    expect(recipients.map((r) => r.userId)).toContain(superAdminId);
  });

  it("a Super Admin cannot be disabled even by a stray preference row set to false", async () => {
    const recipients = await resolveNewBookingRecipients("enquiry", "irrelevant-for-this-test");
    expect(recipients.map((r) => r.userId)).toContain(superAdminWithStrayDisabledRowId);
  });

  it("never includes Staff or Client even with a stray opted-in preference row", async () => {
    const recipients = await resolveNewBookingRecipients("enquiry", "irrelevant-for-this-test");
    const ids = recipients.map((r) => r.userId);
    expect(ids).not.toContain(staffId);
    expect(ids).not.toContain(clientId);
  });

  it("excludes a suspended Admin even though they're opted in", async () => {
    const recipients = await resolveNewBookingRecipients("enquiry", "irrelevant-for-this-test");
    expect(recipients.map((r) => r.userId)).not.toContain(suspendedOptedInAdminId);
  });
});

describe("notification_preferences RLS/grants: only the service role can write", () => {
  it("blocks a signed-in user (even one holding admin) from writing their own preference row directly", async () => {
    const anon = createTestAnonClient();
    const { error: signInError } = await anon.auth.signInWithPassword({
      email: testEmail(`notif-recipients-optedin-${runId}`, runId),
      password: password("optedin"),
    });
    expect(signInError).toBeNull();

    const { data: updateData, error } = await anon
      .from("notification_preferences")
      .update({ enabled: false })
      .eq("user_id", optedInAdminId)
      .eq("category", "new_booking")
      .select();

    // Corrected 2026-08-20 against real Staging behavior: this
    // project's Supabase instance grants broad table privileges
    // (INSERT/UPDATE/DELETE) to `authenticated`/`anon` by default on
    // every new table — confirmed identical on payment_completion_claims
    // (migration 0029, applied via the normal CLI path), so this is a
    // pre-existing project-wide baseline, not specific to this table or
    // to how 0033 was applied. Real protection here comes from Postgres
    // RLS's own default-deny: this table has RLS enabled with only a
    // SELECT policy, so UPDATE has zero applicable policies and matches
    // zero rows — the same "RLS filters, doesn't error" behavior already
    // documented in rls.integration.test.ts for reads. An UPDATE
    // matching no rows is not an error condition, so `error` stays
    // null; `updateData` (returned via .select()) is the real signal —
    // an authorized update returns the changed row, an RLS-blocked one
    // returns none.
    expect(error).toBeNull();
    expect(updateData).toEqual([]);

    // Confirm the value was genuinely untouched, not just that no rows
    // were returned.
    const { data } = await admin
      .from("notification_preferences")
      .select("enabled")
      .eq("user_id", optedInAdminId)
      .eq("category", "new_booking")
      .single();
    expect(data?.enabled).toBe(true);
  });

  it("lets a signed-in user read their own preference row", async () => {
    const anon = createTestAnonClient();
    const { error: signInError } = await anon.auth.signInWithPassword({
      email: testEmail(`notif-recipients-optedin-${runId}`, runId),
      password: password("optedin"),
    });
    expect(signInError).toBeNull();

    const { data, error } = await anon
      .from("notification_preferences")
      .select("enabled")
      .eq("user_id", optedInAdminId)
      .eq("category", "new_booking");
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
  });
});
