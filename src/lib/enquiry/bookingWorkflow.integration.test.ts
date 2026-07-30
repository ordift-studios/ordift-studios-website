import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { generateRecordId } from "@/lib/shared/recordId";
import { saveEnquiryToSupabase } from "@/lib/supabase/primaryWrite";
import type { EnquiryRecord } from "./storage";
import { createTestAdminClient, createTestAnonClient, testEmail, testRunId } from "@/lib/testing/testEnvironment";

// Exercises the actual booking/enquiry service layer (not the HTTP
// route — this is confidence in the business logic, not a full E2E
// harness) against real staging: record-ID generation, the primary
// Supabase write (TDR-003: Supabase is primary, Sheets is secondary),
// the email-to-account auto-linking RPC, and the "enquiries: read own"
// RLS policy (same auth.uid()=user_id OR is_staff_or_admin() shape as
// profiles, proven in rls.integration.test.ts).

const runId = testRunId();
const admin = createTestAdminClient();

let clientUserId: string;
let staffUserId: string;
let unrelatedUserId: string;
const clientPassword = `Test-${testRunId()}-Cc1!`;
const staffPassword = `Test-${testRunId()}-Ss1!`;
const unrelatedPassword = `Test-${testRunId()}-Uu1!`;
const clientEmail = testEmail(`booking-client-${runId}`, runId);
let referenceNumber: string;

beforeAll(async () => {
  const { data: client, error: clientError } = await admin.auth.admin.createUser({
    email: clientEmail,
    password: clientPassword,
    email_confirm: true,
    user_metadata: { full_name: `Booking Test Client ${runId}` },
  });
  if (clientError || !client.user) throw new Error(`failed to create client test user: ${clientError?.message}`);
  clientUserId = client.user.id;

  const { data: unrelated, error: unrelatedError } = await admin.auth.admin.createUser({
    email: testEmail(`booking-unrelated-${runId}`, runId),
    password: unrelatedPassword,
    email_confirm: true,
    user_metadata: { full_name: `Booking Test Unrelated ${runId}` },
  });
  if (unrelatedError || !unrelated.user) throw new Error(`failed to create unrelated test user: ${unrelatedError?.message}`);
  unrelatedUserId = unrelated.user.id;

  const { data: staff, error: staffError } = await admin.auth.admin.createUser({
    email: testEmail(`booking-staff-${runId}`, runId),
    password: staffPassword,
    email_confirm: true,
    user_metadata: { full_name: `Booking Test Staff ${runId}` },
  });
  if (staffError || !staff.user) throw new Error(`failed to create staff test user: ${staffError?.message}`);
  staffUserId = staff.user.id;

  const { data: staffRole, error: staffRoleError } = await admin.from("roles").select("id").eq("slug", "staff").single();
  if (staffRoleError || !staffRole) throw new Error(`failed to look up staff role: ${staffRoleError?.message}`);
  const { error: grantError } = await admin.from("user_roles").insert({ user_id: staffUserId, role_id: staffRole.id });
  if (grantError) throw new Error(`failed to grant staff role: ${grantError.message}`);
});

afterAll(async () => {
  // enquiries.user_id is `on delete set null` (unlike project_requests'
  // created_by/decided_by — see TD-016), so deleting it concurrently
  // with the users it references is safe; still sequenced first for
  // consistency with the pattern the other suites now use.
  const enquiryDelete = referenceNumber
    ? await admin.from("enquiries").delete().eq("reference_number", referenceNumber)
    : { error: null };

  const results = await Promise.allSettled([
    Promise.resolve(enquiryDelete),
    admin.auth.admin.deleteUser(clientUserId),
    admin.auth.admin.deleteUser(unrelatedUserId),
    admin.auth.admin.deleteUser(staffUserId),
  ]);
  const failures = results.filter((r) => r.status === "rejected" || (r.status === "fulfilled" && "value" in r && r.value?.error));
  if (failures.length > 0) {
    console.error(
      `[bookingWorkflow.integration] CLEANUP FAILED for run ${runId} (reference=${referenceNumber}) — ` +
        `log to TECHNICAL_DEBT_REGISTER.md's Stale test data section.`,
      failures
    );
  }
});

describe("Booking/enquiry workflow: record ID + primary write + email-linking", () => {
  it("generates a well-formed ENQ-YYYY-NNNNNN record ID", async () => {
    referenceNumber = await generateRecordId("ENQ");
    expect(referenceNumber).toMatch(/^ENQ-\d{4}-\d{6}$/);
  });

  it("saves the enquiry to Supabase and auto-links it to the matching account by email", async () => {
    const record: EnquiryRecord = {
      service: "photography",
      description: "Integration test enquiry — safe to delete. Not a real client request.",
      fullName: `Booking Test Client ${runId}`,
      email: clientEmail,
      phone: "+447700900000",
      consent: true,
      marketingConsent: false,
      referenceNumber,
      submittedAt: new Date().toISOString(),
      environment: "staging",
    };

    const result = await saveEnquiryToSupabase(record);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.userId).toBe(clientUserId); // proves the find_user_id_by_email auto-link worked
    }
  });
});

describe("Booking/enquiry workflow: RLS boundary on the resulting row", () => {
  it("lets the linked client read their own enquiry", async () => {
    const anon = createTestAnonClient();
    await anon.auth.signInWithPassword({ email: clientEmail, password: clientPassword });

    const { data, error } = await anon.from("enquiries").select("id, reference_number").eq("reference_number", referenceNumber);
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
  });

  it("blocks an unrelated client from reading it", async () => {
    const anon = createTestAnonClient();
    await anon.auth.signInWithPassword({
      email: testEmail(`booking-unrelated-${runId}`, runId),
      password: unrelatedPassword,
    });

    const { data, error } = await anon.from("enquiries").select("id").eq("reference_number", referenceNumber);
    expect(error).toBeNull();
    expect(data).toHaveLength(0);
  });

  it("lets staff read it via is_staff_or_admin(), even though it isn't their own", async () => {
    const anon = createTestAnonClient();
    await anon.auth.signInWithPassword({
      email: testEmail(`booking-staff-${runId}`, runId),
      password: staffPassword,
    });

    const { data, error } = await anon.from("enquiries").select("id, reference_number").eq("reference_number", referenceNumber);
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
  });

  it("blocks an anonymous (signed-out) client entirely", async () => {
    const anon = createTestAnonClient();
    const { data, error } = await anon.from("enquiries").select("id").eq("reference_number", referenceNumber);
    expect(error).toBeNull();
    expect(data).toHaveLength(0);
  });
});
