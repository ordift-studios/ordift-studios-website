import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { saveEnquiryToSupabase } from "./primaryWrite";
import { generateRecordId } from "@/lib/shared/recordId";
import type { EnquiryRecord } from "@/lib/enquiry/storage";
import { createTestAdminClient, testEmail, testRunId } from "@/lib/testing/testEnvironment";

// Client-workspace ownership fix (2026-08-19) — real Staging enquiries
// ENQ-2026-000034/035 proved that submitting the public booking form
// while logged in did NOT attach the session's own account: ownership
// was determined purely by matching the *typed* email against
// find_user_id_by_email, so a logged-in client who entered a different
// contact email got a silent, unowned guest row instead. This proves
// the fix: an authenticated session is now authoritative for
// ownership regardless of what email is typed, while a genuine guest
// (no session) keeps the exact prior email-match behavior unchanged.

const runId = testRunId();
const admin = createTestAdminClient();

let accountUserId: string;
const accountEmail = testEmail(`enquiry-ownership-account-${runId}`, runId);
const accountPassword = `Test-${testRunId()}-Cc1!`;
const createdReferenceNumbers: string[] = [];

function baseRecord(email: string, referenceNumber: string): EnquiryRecord {
  return {
    service: "photography",
    description: "Integration test enquiry — safe to delete. Not a real client request.",
    fullName: `Enquiry Ownership Test ${runId}`,
    email,
    phone: "+447700900000",
    consent: true,
    marketingConsent: false,
    referenceNumber,
    submittedAt: new Date().toISOString(),
    environment: "staging",
  };
}

beforeAll(async () => {
  const { data: account, error } = await admin.auth.admin.createUser({
    email: accountEmail,
    password: accountPassword,
    email_confirm: true,
    user_metadata: { full_name: `Enquiry Ownership Test Account ${runId}` },
  });
  if (error || !account.user) throw new Error(`failed to create test account: ${error?.message}`);
  accountUserId = account.user.id;
});

afterAll(async () => {
  const results = await Promise.allSettled([
    createdReferenceNumbers.length > 0
      ? admin.from("enquiries").delete().in("reference_number", createdReferenceNumbers)
      : Promise.resolve({ error: null }),
    admin.auth.admin.deleteUser(accountUserId),
  ]);
  const failures = results.filter((r) => r.status === "rejected" || (r.status === "fulfilled" && "value" in r && r.value?.error));
  if (failures.length > 0) {
    console.error(
      `[enquiryOwnership.integration] CLEANUP FAILED for run ${runId} (account=${accountUserId}) — log to TECHNICAL_DEBT_REGISTER.md's Stale test data section.`,
      failures
    );
  }
});

describe("enquiry ownership: authenticated session vs. contact email", () => {
  it("A: logged-in submission with the account's own email — owned by the account, as before", async () => {
    const referenceNumber = await generateRecordId("ENQ");
    createdReferenceNumbers.push(referenceNumber);
    const record = baseRecord(accountEmail, referenceNumber);

    const result = await saveEnquiryToSupabase(record, accountUserId);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.userId).toBe(accountUserId);
  });

  it("B: logged-in submission with a DIFFERENT contact email — still owned by the authenticated account, contact email preserved as typed", async () => {
    const referenceNumber = await generateRecordId("ENQ");
    createdReferenceNumbers.push(referenceNumber);
    const differentEmail = testEmail(`enquiry-ownership-contact-${runId}`, runId);
    const record = baseRecord(differentEmail, referenceNumber);

    const result = await saveEnquiryToSupabase(record, accountUserId);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.userId).toBe(accountUserId); // ownership from the session, not the email

    const { data: saved } = await admin.from("enquiries").select("user_id, email").eq("reference_number", referenceNumber).maybeSingle();
    expect(saved?.user_id).toBe(accountUserId);
    expect(saved?.email).toBe(differentEmail); // contact email stored exactly as submitted, untouched
  });

  it("C: logged-out guest submission with a matching account email — existing email-match auto-link unchanged", async () => {
    const referenceNumber = await generateRecordId("ENQ");
    createdReferenceNumbers.push(referenceNumber);
    const record = baseRecord(accountEmail, referenceNumber);

    const result = await saveEnquiryToSupabase(record); // no authenticatedUserId — genuine guest path
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.userId).toBe(accountUserId); // still auto-linked by email, exactly as before
  });

  it("C: logged-out guest submission with no matching account — stays unowned, exactly as before (the original ENQ-034/035 behavior)", async () => {
    const referenceNumber = await generateRecordId("ENQ");
    createdReferenceNumbers.push(referenceNumber);
    const unmatchedEmail = testEmail(`enquiry-ownership-unmatched-${runId}`, runId);
    const record = baseRecord(unmatchedEmail, referenceNumber);

    const result = await saveEnquiryToSupabase(record); // no authenticatedUserId, no matching account
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.userId).toBeNull();
  });
});
