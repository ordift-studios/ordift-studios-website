import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { generateRecordId } from "@/lib/shared/recordId";
import { saveEnquiryToSupabase, saveWorkshopRegistrationToSupabase } from "@/lib/supabase/primaryWrite";
import type { EnquiryRecord } from "@/lib/enquiry/storage";
import type { WorkshopRegistrationRecord } from "@/lib/workshops/registrationStorage";
import { createTestAdminClient, createTestAnonClient, testEmail, testRunId } from "@/lib/testing/testEnvironment";

// Two things this suite covers that no earlier suite does:
// 1. The same "own row OR staff/admin" RLS shape, but on
//    workshop_registrations rather than enquiries/profiles — proves
//    the pattern holds consistently across tables, not just once.
// 2. private.has_project_access() — the contractor-scoped access grant
//    (migration 0009), a genuinely different mechanism (a real grant
//    row in project_assignments, not an identity match) that no other
//    integration test exercises yet.

const runId = testRunId();
const admin = createTestAdminClient();

let workshopParticipantUserId: string;
let staffUserId: string;
let assignedContractorUserId: string;
let unassignedContractorUserId: string;
const participantPassword = `Test-${testRunId()}-Pp1!`;
const staffPassword = `Test-${testRunId()}-Ss1!`;
const assignedContractorPassword = `Test-${testRunId()}-Ac1!`;
const unassignedContractorPassword = `Test-${testRunId()}-Uc1!`;

const participantEmail = testEmail(`admin-access-participant-${runId}`, runId);
const staffEmail = testEmail(`admin-access-staff-${runId}`, runId);
const assignedContractorEmail = testEmail(`admin-access-assigned-${runId}`, runId);
const unassignedContractorEmail = testEmail(`admin-access-unassigned-${runId}`, runId);

let workshopRegistrationReference: string;
let enquiryReferenceNumber: string;
let enquiryId: string;

beforeAll(async () => {
  const [{ data: participant, error: pErr }, { data: staff, error: sErr }, { data: assigned, error: aErr }, { data: unassigned, error: uErr }] =
    await Promise.all([
      admin.auth.admin.createUser({ email: participantEmail, password: participantPassword, email_confirm: true }),
      admin.auth.admin.createUser({ email: staffEmail, password: staffPassword, email_confirm: true }),
      admin.auth.admin.createUser({ email: assignedContractorEmail, password: assignedContractorPassword, email_confirm: true }),
      admin.auth.admin.createUser({ email: unassignedContractorEmail, password: unassignedContractorPassword, email_confirm: true }),
    ]);
  if (pErr || !participant.user) throw new Error(`failed to create participant: ${pErr?.message}`);
  if (sErr || !staff.user) throw new Error(`failed to create staff: ${sErr?.message}`);
  if (aErr || !assigned.user) throw new Error(`failed to create assigned contractor: ${aErr?.message}`);
  if (uErr || !unassigned.user) throw new Error(`failed to create unassigned contractor: ${uErr?.message}`);
  workshopParticipantUserId = participant.user.id;
  staffUserId = staff.user.id;
  assignedContractorUserId = assigned.user.id;
  unassignedContractorUserId = unassigned.user.id;

  const { data: staffRole, error: staffRoleError } = await admin.from("roles").select("id").eq("slug", "staff").single();
  if (staffRoleError || !staffRole) throw new Error(`failed to look up staff role: ${staffRoleError?.message}`);
  const { error: grantError } = await admin.from("user_roles").insert({ user_id: staffUserId, role_id: staffRole.id });
  if (grantError) throw new Error(`failed to grant staff role: ${grantError.message}`);

  // A real workshop registration owned by the participant.
  workshopRegistrationReference = await generateRecordId("WSH");
  const workshopRecord: WorkshopRegistrationRecord = {
    workshopSlug: `integration-test-${runId}`,
    firstName: "Admin Access Test",
    surname: `Participant ${runId}`,
    email: participantEmail,
    phone: "+447700900000",
    consent: true,
    registrationReference: workshopRegistrationReference,
    workshopId: "00000000-0000-0000-0000-000000000000",
    workshopTitle: "Integration Test Workshop — safe to delete",
    registrationDate: new Date().toISOString(),
    registrationStatus: "Registered",
    waitingListPosition: null,
    paymentStatus: "Not Required",
    amountDueUsd: null,
    environment: "staging",
  };
  const workshopWrite = await saveWorkshopRegistrationToSupabase(workshopRecord);
  if (!workshopWrite.ok) throw new Error(`failed to write test workshop registration: ${workshopWrite.error}`);

  // A real enquiry, for the contractor project-assignment test.
  enquiryReferenceNumber = await generateRecordId("ENQ");
  const enquiryRecord: EnquiryRecord = {
    service: "photography",
    description: "Integration test enquiry for contractor project-access RLS — safe to delete.",
    fullName: `Admin Access Test Enquiry ${runId}`,
    email: testEmail(`admin-access-enquiry-owner-${runId}`, runId),
    phone: "+447700900000",
    consent: true,
    marketingConsent: false,
    referenceNumber: enquiryReferenceNumber,
    submittedAt: new Date().toISOString(),
    environment: "staging",
  };
  const enquiryWrite = await saveEnquiryToSupabase(enquiryRecord);
  if (!enquiryWrite.ok) throw new Error(`failed to write test enquiry: ${enquiryWrite.error}`);
  const { data: enquiryRow, error: enquiryLookupError } = await admin
    .from("enquiries")
    .select("id")
    .eq("reference_number", enquiryReferenceNumber)
    .single();
  if (enquiryLookupError || !enquiryRow) throw new Error(`failed to look up test enquiry id: ${enquiryLookupError?.message}`);
  enquiryId = enquiryRow.id;

  // Grant the assigned contractor an ACTIVE project_assignment on that
  // enquiry — the unassigned contractor deliberately gets none.
  const { error: assignmentError } = await admin.from("project_assignments").insert({
    user_id: assignedContractorUserId,
    entity_type: "enquiry",
    entity_id: enquiryId,
    status: "active",
  });
  if (assignmentError) throw new Error(`failed to create test project_assignment: ${assignmentError.message}`);
});

afterAll(async () => {
  const results = await Promise.allSettled([
    admin.from("project_assignments").delete().eq("entity_id", enquiryId).eq("user_id", assignedContractorUserId),
    admin.from("enquiries").delete().eq("reference_number", enquiryReferenceNumber),
    admin.from("workshop_registrations").delete().eq("registration_reference", workshopRegistrationReference),
    admin.auth.admin.deleteUser(workshopParticipantUserId),
    admin.auth.admin.deleteUser(staffUserId),
    admin.auth.admin.deleteUser(assignedContractorUserId),
    admin.auth.admin.deleteUser(unassignedContractorUserId),
  ]);
  const failures = results.filter((r) => r.status === "rejected" || (r.status === "fulfilled" && "value" in r && r.value?.error));
  if (failures.length > 0) {
    console.error(
      `[adminAccess.integration] CLEANUP FAILED for run ${runId} — log to TECHNICAL_DEBT_REGISTER.md's Stale test data section.`,
      failures
    );
  }
});

describe("workshop_registrations: read own OR staff/admin (same shape as enquiries/profiles)", () => {
  it("lets the participant read their own registration", async () => {
    const anon = createTestAnonClient();
    await anon.auth.signInWithPassword({ email: participantEmail, password: participantPassword });

    const { data, error } = await anon
      .from("workshop_registrations")
      .select("id, registration_reference")
      .eq("registration_reference", workshopRegistrationReference);
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
  });

  it("lets staff read it via is_staff_or_admin(), even though it isn't their own", async () => {
    const anon = createTestAnonClient();
    await anon.auth.signInWithPassword({ email: staffEmail, password: staffPassword });

    const { data, error } = await anon
      .from("workshop_registrations")
      .select("id")
      .eq("registration_reference", workshopRegistrationReference);
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
  });

  it("blocks an unrelated user (unassigned contractor) from reading it", async () => {
    const anon = createTestAnonClient();
    await anon.auth.signInWithPassword({ email: unassignedContractorEmail, password: unassignedContractorPassword });

    const { data, error } = await anon
      .from("workshop_registrations")
      .select("id")
      .eq("registration_reference", workshopRegistrationReference);
    expect(error).toBeNull();
    expect(data).toHaveLength(0);
  });
});

describe("enquiries: contractor project-scoped access via private.has_project_access()", () => {
  it("lets a contractor with an active project_assignment read the assigned enquiry", async () => {
    const anon = createTestAnonClient();
    await anon.auth.signInWithPassword({ email: assignedContractorEmail, password: assignedContractorPassword });

    const { data, error } = await anon.from("enquiries").select("id").eq("id", enquiryId);
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
  });

  it("blocks a contractor with no project_assignment at all from reading the same enquiry", async () => {
    const anon = createTestAnonClient();
    await anon.auth.signInWithPassword({ email: unassignedContractorEmail, password: unassignedContractorPassword });

    const { data, error } = await anon.from("enquiries").select("id").eq("id", enquiryId);
    expect(error).toBeNull();
    expect(data).toHaveLength(0);
  });
});
