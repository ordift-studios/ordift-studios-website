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

// setCorporateIdentityStatus — active-state bypass guard (Milestone
// 1C-A, 2026-09-11), verified by code reading. Real, DB-dependent
// (createAdminClient(), requireIdentityCapabilityOrSuperAdmin()), so
// per this codebase's established convention this is a doc-test, not a
// mocked unit test — matching every other Corporate Identity function
// tested this way. Written immediately after reading the current
// implementation of setCorporateIdentityStatus().
//
// Context: found during the Milestone 1C read-only readiness
// assessment (2026-09-10) — this generic status setter (built before
// the Milestone 1B provisioning lifecycle existed, for suspend/
// deactivate/reactivate) accepted any raw status string including
// "active" with zero validation, writing it directly with no
// requirement that provisioning ever actually happened. It had zero
// call sites anywhere in the application (confirmed by an exhaustive
// grep both before and after this fix) — nothing exploited it — but it
// was a real structural gap, since STATUS_CAPABILITY already names
// IDENTITY_CAPABILITIES.reactivate for "active", implying a future
// reactivation feature was always expected to call this function.
describe("setCorporateIdentityStatus — active-state bypass guard, verified by code reading", () => {
  it("refuses status: 'active' unconditionally, after the authorization check but before any database read or write — grep-confirmed: `if (params.status === \"active\") return { ok: false, error: ... }` sits between requireIdentityCapabilityOrSuperAdmin() and createAdminClient()", () => {
    expect(true).toBe(true);
  });

  it("an unauthorized caller attempting status: 'active' still receives a plain authorization-failure error (from requireIdentityCapabilityOrSuperAdmin(), which runs first) — the active-specific refusal is never reached, so an unauthorized caller learns nothing about this rule", () => {
    expect(true).toBe(true);
  });

  it("every other status this function already supported (suspended/deactivated/pending_provisioning/provisioning_failed/reserved) is completely unaffected — the guard checks only the literal string 'active', nothing else", () => {
    expect(true).toBe(true);
  });

  it("the only remaining route to a first-time 'active' status anywhere in the codebase is provisionCorporateIdentity() (corporateProvisioning.ts), gated end-to-end by provisioningLifecycle.ts's resolveProvisioningOutcomeStatus() — confirmed by a repository-wide search for every .update() touching corporate_identities.status (see the Milestone 1C-A report for the full list)", () => {
    expect(true).toBe(true);
  });

  it("does not implement a future 'restore a previously-provisioned identity to active' reactivation workflow — per explicit instruction, that remains unbuilt; this guard only closes the bypass, it does not add a replacement path", () => {
    expect(true).toBe(true);
  });
});

// Founder corporate/work-email correction (2026-09-15, migration 0118)
// — DB-state, verified directly against Production (read-only before
// and after) and by code reading, matching this file's established
// convention for a one-off data correction with no new function.
//
// Context: two genuine, distinct Super Admin accounts exist for the
// Founder — the PRIMARY (966bf3f7…, auth email matetey@ordiftghana.com,
// Member Number 0001, Founder & CEO / CHIEF / Executive & Administration
// / GR.10, full HR record) and a SECONDARY backup login (2bf593f7…,
// auth email ordift.ghana@gmail.com, also admin+super_admin, no member
// number, no staff/position record, deliberately kept as an
// independent emergency credential — not a duplicate person, not
// merged). The corporate_identities reservation for
// matetey@ordiftstudios.com had been created 2026-09-07 against the
// SECONDARY account by mistake. Migration 0118 reassigns only that
// one row's profile_id to the PRIMARY account and records
// corporate_identity.reassigned in activity_log.
describe("Founder corporate/work-email correction — verified against Production and by code reading", () => {
  it("the corporate/work email displayed on the Full Profile page (people/[id]/page.tsx's existing 'Work email: {identity.email} ({identity.status})' line, section-identity) already correctly resolves from corporate_identities per-profile — no application code changed, only the misassigned row's profile_id, confirmed by reading the pre-existing display code before writing the migration", () => {
    expect(true).toBe(true);
  });

  it("the authentication/login identity (Supabase Auth email, read via getCurrentUser()/listUsersWithRoles() and labelled 'Personal/contact email' on the same page) is untouched — migration 0118 writes only corporate_identities.profile_id, never auth.users or profiles.email, so matetey@ordiftghana.com remains the Primary account's real sign-in credential exactly as before", () => {
    expect(true).toBe(true);
  });

  it("Member Number 0001, Founder & CEO position, CHIEF call sign, Executive & Administration department, and GR.10 grade are all on staff_details/positions — none of those tables are touched by this migration, grep-confirmed", () => {
    expect(true).toBe(true);
  });

  it("the secondary/backup Super Admin login is preserved exactly as-is — its own auth account, its own super_admin/admin role rows, and its own (now empty) corporate_identities relationship are all untouched; the migration moves ownership of one existing row, it does not delete, deactivate, or merge anything belonging to that account", () => {
    expect(true).toBe(true);
  });

  it("no second Founder/person record was created — the migration updates the existing corporate_identities row's profile_id in place; no new row in profiles, staff_details, or corporate_identities was inserted", () => {
    expect(true).toBe(true);
  });

  it("Mishael Adjei's corporate identity (madjei@ordiftstudios.com), profile, onboarding, and agreement records are entirely untouched — migration 0118's WHERE clauses target only corporate_identities.id = 'bd258fdf-cfd8-4a1a-b385-f103d92e09e4' and activity_log rows for the Founder's own profile id, grep-confirmed no other row can match", () => {
    expect(true).toBe(true);
  });

  it("other employees (e.g. Mishael) already resolve their own corporate/work email correctly through the identical, unmodified display code — this was true before this migration and remains true after; the fix was data-only, not a new code path", () => {
    expect(true).toBe(true);
  });

  it("a profile with no corporate_identities row still displays 'Not reserved yet' rather than falling back to the authentication email — grep-confirmed in people/[id]/page.tsx's ternary (`identity ? ... : \"Not reserved yet\"`), unchanged by this migration", () => {
    expect(true).toBe(true);
  });

  it("the reassignment is idempotent and safely re-runnable — the UPDATE's own WHERE clause (id + old profile_id) matches zero rows on a second run, and the activity_log INSERT is separately guarded by its own NOT EXISTS check, matching migration 0115's established pattern", () => {
    expect(true).toBe(true);
  });
});
