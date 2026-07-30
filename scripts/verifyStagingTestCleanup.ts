// Stale-data verification tooling for the integration-test suite (see
// INTEGRATION_TESTING_STRATEGY.md §4). Every integration test cleans up
// after itself in its own afterAll(), but per that strategy's own
// admission, cleanup can fail (network blip, a temporarily-down API).
// This script is the independent, standalone check — run it after any
// integration-test session to confirm nothing was left behind, rather
// than trusting the test run's own "cleanup succeeded" self-report.
//
// Scans staging for anything carrying this project's test-identity
// markers (`TEST-` prefixed record/reference numbers, `.invalid`
// email addresses — see src/lib/testing/testEnvironment.ts) across
// every table an integration test writes to.
//
// Usage:
//   npx tsx scripts/verifyStagingTestCleanup.ts
//
// Exits with a non-zero code if anything stale is found, so it can be
// wired into a CI step (Workstream B) later without extra work.

import { config } from "dotenv";
config({ path: ".env.local" });

import { createTestAdminClient } from "@/lib/testing/testEnvironment";

async function main() {
  const admin = createTestAdminClient();
  let staleCount = 0;

  console.log("Scanning staging for leftover integration-test artifacts...\n");

  // Auth users
  const { data: usersPage, error: usersError } = await admin.auth.admin.listUsers({ perPage: 1000 });
  if (usersError) {
    console.error("  ✗ failed to list auth users:", usersError.message);
  } else {
    const staleUsers = usersPage.users.filter((u) => u.email?.endsWith(".invalid"));
    if (staleUsers.length > 0) {
      staleCount += staleUsers.length;
      console.log(`  ✗ ${staleUsers.length} stale auth user(s):`);
      staleUsers.forEach((u) => console.log(`      ${u.email}  (${u.id})`));
    } else {
      console.log("  ✓ no stale auth users (*.invalid)");
    }
  }

  // Tables carrying a TEST-prefixed record/reference number, or a
  // record_id/reference_number field that starts with TEST-.
  const tableChecks: Array<{ table: string; column: string }> = [
    { table: "enquiries", column: "reference_number" },
    { table: "workshop_registrations", column: "registration_reference" },
    { table: "sheet_sync_failures", column: "record_id" },
    { table: "email_send_failures", column: "reference_number" },
  ];

  for (const { table, column } of tableChecks) {
    const { data, error } = await admin
      .from(table)
      .select("*")
      .like(column, "TEST-%")
      .returns<Array<Record<string, unknown>>>();
    if (error) {
      console.error(`  ✗ failed to query ${table}:`, error.message);
      continue;
    }
    if (data && data.length > 0) {
      staleCount += data.length;
      console.log(`  ✗ ${data.length} stale row(s) in ${table}:`);
      data.forEach((row) => console.log(`      ${row[column]}  (${row.id})`));
    } else {
      console.log(`  ✓ no stale rows in ${table} (${column} like TEST-%)`);
    }
  }

  // project_requests has no direct TEST- marker column — check via its
  // client_notes text instead, the marker every integration test uses.
  const { data: staleRequests, error: requestsError } = await admin
    .from("project_requests")
    .select("id, client_notes")
    .ilike("client_notes", "%integration test%");
  if (requestsError) {
    console.error("  ✗ failed to query project_requests:", requestsError.message);
  } else if (staleRequests && staleRequests.length > 0) {
    staleCount += staleRequests.length;
    console.log(`  ✗ ${staleRequests.length} stale row(s) in project_requests:`);
    staleRequests.forEach((r) => console.log(`      ${r.id} — "${r.client_notes}"`));
  } else {
    console.log("  ✓ no stale rows in project_requests (client_notes mentioning 'integration test')");
  }

  console.log("");
  if (staleCount > 0) {
    console.error(
      `FAILED: ${staleCount} stale test artifact(s) found in staging. ` +
        `Log each to TECHNICAL_DEBT_REGISTER.md's "Stale test data" section per INTEGRATION_TESTING_STRATEGY.md §4, ` +
        `then clean up manually or re-run the offending test suite.`
    );
    process.exit(1);
  } else {
    console.log("PASSED: staging is clean — no leftover integration-test artifacts found.");
  }
}

main().catch((err) => {
  console.error("verifyStagingTestCleanup.ts threw:", err);
  process.exit(1);
});
