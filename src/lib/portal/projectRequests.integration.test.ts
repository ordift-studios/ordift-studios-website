import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { generateRecordId } from "@/lib/shared/recordId";
import { saveEnquiryToSupabase } from "@/lib/supabase/primaryWrite";
import type { EnquiryRecord } from "@/lib/enquiry/storage";
import { createTestAdminClient, createTestAnonClient, testEmail, testRunId } from "@/lib/testing/testEnvironment";

// Client-portal workflow: project_requests' RLS is a join-based
// ownership check (via the parent enquiry's user_id), not a direct
// column on project_requests itself — the one RLS shape in this
// codebase genuinely different from the profiles/enquiries "own row"
// pattern, so it deserves its own dedicated test rather than assuming
// the same shape holds.

const runId = testRunId();
const admin = createTestAdminClient();

let clientUserId: string;
let staffUserId: string;
const clientPassword = `Test-${testRunId()}-Cc1!`;
const unrelatedPassword = `Test-${testRunId()}-Uu1!`;
const staffPassword = `Test-${testRunId()}-Ss1!`;
const clientEmail = testEmail(`pr-client-${runId}`, runId);
const unrelatedEmail = testEmail(`pr-unrelated-${runId}`, runId);
const staffEmail = testEmail(`pr-staff-${runId}`, runId);

let enquiryId: string;
let enquiryReferenceNumber: string;
let requestTypeId: string;
let projectRequestId: string;

beforeAll(async () => {
  const [{ data: client, error: clientError }, { data: unrelated, error: unrelatedError }, { data: staff, error: staffError }] =
    await Promise.all([
      admin.auth.admin.createUser({ email: clientEmail, password: clientPassword, email_confirm: true }),
      admin.auth.admin.createUser({ email: unrelatedEmail, password: unrelatedPassword, email_confirm: true }),
      admin.auth.admin.createUser({ email: staffEmail, password: staffPassword, email_confirm: true }),
    ]);
  if (clientError || !client.user) throw new Error(`failed to create client user: ${clientError?.message}`);
  if (unrelatedError || !unrelated.user) throw new Error(`failed to create unrelated user: ${unrelatedError?.message}`);
  if (staffError || !staff.user) throw new Error(`failed to create staff user: ${staffError?.message}`);
  clientUserId = client.user.id;
  staffUserId = staff.user.id;

  const { data: staffRole, error: staffRoleError } = await admin.from("roles").select("id").eq("slug", "staff").single();
  if (staffRoleError || !staffRole) throw new Error(`failed to look up staff role: ${staffRoleError?.message}`);
  const { error: grantError } = await admin.from("user_roles").insert({ user_id: staffUserId, role_id: staffRole.id });
  if (grantError) throw new Error(`failed to grant staff role: ${grantError.message}`);

  // A real enquiry, owned by the client user, is the entity a project
  // request attaches to — reusing the same primary-write path already
  // proven in bookingWorkflow.integration.test.ts.
  enquiryReferenceNumber = await generateRecordId("ENQ");
  const record: EnquiryRecord = {
    service: "photography",
    description: "Integration test enquiry for project-request RLS — safe to delete.",
    fullName: `Project Request Test Client ${runId}`,
    email: clientEmail,
    phone: "+447700900000",
    consent: true,
    marketingConsent: false,
    referenceNumber: enquiryReferenceNumber,
    submittedAt: new Date().toISOString(),
    environment: "staging",
  };
  const writeResult = await saveEnquiryToSupabase(record);
  if (!writeResult.ok) throw new Error(`failed to write test enquiry: ${writeResult.error}`);

  const { data: enquiryRow, error: enquiryLookupError } = await admin
    .from("enquiries")
    .select("id")
    .eq("reference_number", enquiryReferenceNumber)
    .single();
  if (enquiryLookupError || !enquiryRow) throw new Error(`failed to look up test enquiry id: ${enquiryLookupError?.message}`);
  enquiryId = enquiryRow.id;

  const { data: requestType, error: requestTypeError } = await admin
    .from("request_types")
    .select("id")
    .eq("key", "reschedule")
    .single();
  if (requestTypeError || !requestType) throw new Error(`failed to look up reschedule request_type: ${requestTypeError?.message}`);
  requestTypeId = requestType.id;
});

afterAll(async () => {
  // project_requests has no delete policy for anyone but service_role
  // (append-only by design, migration 0008) — cleanup must use the
  // admin client, which bypasses RLS entirely.
  //
  // Ordering matters here, unlike the other suites' cleanup: this was
  // originally written as one Promise.allSettled firing every delete
  // concurrently, which raced project_requests.created_by/decided_by
  // (both `references public.profiles(id)` with the Postgres default
  // RESTRICT — no cascade/set-null) against deleteUser()'s cascade
  // through profiles. When the user-delete reached the database before
  // the project_requests row was gone, the FK constraint silently
  // failed the deleteUser call, leaving an orphaned auth user in
  // staging — caught by scripts/verifyStagingTestCleanup.ts, not by
  // this suite's own "did cleanup succeed" self-check, which is
  // exactly the scenario that tool exists for. Fixed by deleting every
  // row that references a profile first (sequential, awaited), then
  // deleting the users only once those are confirmed gone.
  const { error: prDeleteError } = projectRequestId
    ? await admin.from("project_requests").delete().eq("id", projectRequestId)
    : { error: null };
  const { error: enquiryDeleteError } = await admin.from("enquiries").delete().eq("reference_number", enquiryReferenceNumber);

  const { data: usersPage } = await admin.auth.admin.listUsers({ perPage: 1000 });
  const unrelatedUserId = usersPage.users.find((u) => u.email === unrelatedEmail)?.id ?? "";

  const results = await Promise.allSettled([
    Promise.resolve({ error: prDeleteError }),
    Promise.resolve({ error: enquiryDeleteError }),
    admin.auth.admin.deleteUser(clientUserId),
    admin.auth.admin.deleteUser(staffUserId),
    admin.auth.admin.deleteUser(unrelatedUserId),
  ]);
  const failures = results.filter((r) => r.status === "rejected" || (r.status === "fulfilled" && "value" in r && r.value?.error));
  if (failures.length > 0) {
    console.error(
      `[projectRequests.integration] CLEANUP FAILED for run ${runId} — log to TECHNICAL_DEBT_REGISTER.md's Stale test data section.`,
      failures
    );
  }
});

describe("project_requests: join-based ownership RLS", () => {
  it("lets the owning client insert a project request against their own enquiry", async () => {
    const anon = createTestAnonClient();
    await anon.auth.signInWithPassword({ email: clientEmail, password: clientPassword });

    const { data, error } = await anon
      .from("project_requests")
      .insert({
        entity_type: "enquiry",
        entity_id: enquiryId,
        request_type_id: requestTypeId,
        client_notes: "Integration test — safe to delete.",
        created_by: clientUserId,
      })
      .select("id")
      .single();

    expect(error).toBeNull();
    expect(data?.id).toBeDefined();
    projectRequestId = data!.id;
  });

  it("blocks an unrelated client from inserting a project request against someone else's enquiry", async () => {
    const anon = createTestAnonClient();
    await anon.auth.signInWithPassword({ email: unrelatedEmail, password: unrelatedPassword });

    const { error } = await anon.from("project_requests").insert({
      entity_type: "enquiry",
      entity_id: enquiryId,
      request_type_id: requestTypeId,
      client_notes: "Should never be allowed.",
      created_by: (await anon.auth.getUser()).data.user!.id,
    });

    expect(error).not.toBeNull(); // RLS insert violation — the with-check clause fails
  });

  it("lets the owning client read their own project request", async () => {
    const anon = createTestAnonClient();
    await anon.auth.signInWithPassword({ email: clientEmail, password: clientPassword });

    const { data, error } = await anon.from("project_requests").select("id, status").eq("id", projectRequestId);
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
  });

  it("blocks an unrelated client from reading it", async () => {
    const anon = createTestAnonClient();
    await anon.auth.signInWithPassword({ email: unrelatedEmail, password: unrelatedPassword });

    const { data, error } = await anon.from("project_requests").select("id").eq("id", projectRequestId);
    expect(error).toBeNull();
    expect(data).toHaveLength(0);
  });

  it("lets staff read every project request via is_staff_or_admin(), not just their own", async () => {
    const anon = createTestAnonClient();
    await anon.auth.signInWithPassword({ email: staffEmail, password: staffPassword });

    const { data, error } = await anon.from("project_requests").select("id").eq("id", projectRequestId);
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
  });

  it("lets staff decide (update) the request, but blocks the client from updating their own", async () => {
    const staffAnon = createTestAnonClient();
    await staffAnon.auth.signInWithPassword({ email: staffEmail, password: staffPassword });

    const { data: staffUpdate, error: staffError } = await staffAnon
      .from("project_requests")
      .update({ status: "approved", staff_decision: "approved", staff_response: "Approved — integration test." })
      .eq("id", projectRequestId)
      .select("status")
      .single();
    expect(staffError).toBeNull();
    expect(staffUpdate?.status).toBe("approved");

    const clientAnon = createTestAnonClient();
    await clientAnon.auth.signInWithPassword({ email: clientEmail, password: clientPassword });

    const { data: clientUpdate, error: clientUpdateError } = await clientAnon
      .from("project_requests")
      .update({ status: "completed" })
      .eq("id", projectRequestId)
      .select("id");
    // No client-update policy exists — RLS silently matches zero rows
    // rather than erroring, the same "filter, don't 403" shape as reads.
    expect(clientUpdateError).toBeNull();
    expect(clientUpdate).toHaveLength(0);
  });
});
