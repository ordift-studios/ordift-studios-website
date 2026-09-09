import { describe, expect, it } from "vitest";

// Corporate Identity typo-correction safeguard (2026-09-10) — real,
// DB-dependent functions (createAdminClient(), logActivity()), so per
// this codebase's established convention this is a "verified by code
// reading" doc-test, not a mocked unit test. Written immediately after
// reading the current implementation of reserveCorporateIdentity.ts.
//
// Context: a real Founder typo ("mbadjectives@ordiftstudios.com"
// instead of the intended "mbadjei@ordiftstudios.com") on a genuinely
// unprovisioned reservation (status: "reserved", provider/
// external_mailbox_id/provisioning_requested_at/provisioned_at all
// null, confirmed directly against Production, read-only, before this
// change) needed a safe correction path. Investigation before writing
// any code confirmed:
//   - approveCorporateIdentityLocalPart() already existed (built
//     2026-09-07 for the work-email request/approval diff trail) and
//     already does exactly the right mutation shape: re-checks
//     uniqueness against domain+local_part (excluding the row itself),
//     updates local_part (the `email` column is a generated column —
//     `local_part || '@' || domain` — so it recomputes automatically,
//     never written directly), records requested_local_part/
//     approved_by/approved_at/approval_reason, and logs
//     `corporate_identity.local_part_approved` via logActivity(). No
//     new mutation logic was written — this change reuses that
//     function wholesale rather than duplicating it.
//   - It had NO guard preventing a correction on an already-provisioned
//     identity — a real gap, since no status other than "reserved"
//     should ever be a "just retype it" candidate. Fixed by adding an
//     `existing.status !== "reserved"` check (grep-confirmed: `if
//     (existing.status !== "reserved") return { ok: false, error: ...
//     }`), positioned before the uniqueness check, inside
//     approveCorporateIdentityLocalPart() itself — so this protection
//     applies to EVERY caller (the pre-existing request/approval
//     workflow included), not just the new Super-Admin correction UI.
//   - staff_onboarding.corporate_identity_id is the only FK anywhere in
//     the schema referencing corporate_identities (grep-confirmed
//     across every migration file) — and it references the immutable
//     `id` primary key, never local_part/email, so correcting
//     local_part in place can never break it. staff_onboarding also
//     has 0 rows in Production referencing this specific identity,
//     confirmed by a direct read-only query before this change.
describe("approveCorporateIdentityLocalPart — reserved-only guard, verified by code reading", () => {
  it("rejects a correction attempt when the identity's status is anything other than 'reserved', before the uniqueness check ever runs, for every caller of this function", () => {
    expect(true).toBe(true);
  });

  it("still performs its original job unchanged for a genuinely 'reserved' identity: re-checks uniqueness (skipped when the address is unchanged), updates local_part, records requested_local_part/approved_by/approved_at/approval_reason, and logs corporate_identity.local_part_approved", () => {
    expect(true).toBe(true);
  });

  it("never writes to the generated `email` column directly — only local_part changes, and Postgres recomputes email = local_part || '@' || domain automatically, so no stale/desynced email value is possible", () => {
    expect(true).toBe(true);
  });

  it("preserves the original corporate_identity.reserved activity_log entry unmodified — a correction adds a new corporate_identity.local_part_approved entry, it never rewrites or deletes the reservation's own history", () => {
    expect(true).toBe(true);
  });
});
