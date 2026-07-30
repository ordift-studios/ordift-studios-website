import { describe, expect, it } from "vitest";
import { createTestAdminClient } from "./testEnvironment";

// Complements TD-016 in TECHNICAL_DEBT_REGISTER.md — a real cleanup
// race was found and fixed this session via
// scripts/verifyStagingTestCleanup.ts catching orphaned staging users
// that a test suite's own "cleanup succeeded" self-check missed. This
// suite locks in the failure-detection half directly: proves that a
// genuinely failing cleanup operation reports an error rather than
// silently appearing to succeed, so every other suite's
// `results.filter((r) => r.status === "rejected" || r.value?.error)`
// pattern has something real to catch.

const admin = createTestAdminClient();

describe("cleanup failure handling", () => {
  it("deleting a non-existent auth user returns a reportable error, not a silent success", async () => {
    const { error } = await admin.auth.admin.deleteUser("00000000-0000-0000-0000-000000000000");
    expect(error).not.toBeNull();
  });

  it("a Promise.allSettled cleanup batch correctly surfaces a mixed success/failure result", async () => {
    const results = await Promise.allSettled([
      admin.auth.admin.deleteUser("00000000-0000-0000-0000-000000000000"), // guaranteed to fail
      Promise.resolve({ error: null }), // a stand-in for a succeeding step
    ]);

    const failures = results.filter((r) => r.status === "rejected" || (r.status === "fulfilled" && "value" in r && r.value?.error));
    expect(failures.length).toBeGreaterThanOrEqual(1); // the exact detection logic every suite's afterAll relies on
  });
});
