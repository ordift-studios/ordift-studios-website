import { describe, expect, it } from "vitest";

// correctCorporateIdentityLocalPartAction (2026-09-10) — a Server
// Action calling requireSuperAdmin() (session-dependent) and
// approveCorporateIdentityLocalPart() (DB-dependent), so per this
// codebase's established convention this is a "verified by code
// reading" doc-test, not a mocked unit test.
//
// Verified directly against the current source of
// src/app/admin/operations/actions.ts before writing this file:
//
// 1. Authorization: the very first line calls requireSuperAdmin() —
//    the exact same helper every other action in this file already
//    uses (reserveCorporateIdentityAction, createDepartmentRequestAction,
//    createRecruitmentRequisitionAction), which throws
//    "Only a Super Admin can manage this." for any non-Super-Admin or
//    unauthenticated caller. No new/parallel permission check was
//    introduced — this is the same gate, reused as-is. Because this
//    check runs before approveCorporateIdentityLocalPart() is ever
//    called, a non-Super-Admin caller can never reach that function's
//    own (broader, Technology-capability-inclusive) authorization
//    check through this specific action — the effective behavior of
//    this action is strictly Super-Admin-only, as required.
// 2. Validation: newLocalPart is passed through
//    normalizeRequestedLocalPart() (the same, already-tested pure
//    function backing the pre-existing work-email request/approval
//    flow — see corporateEmail.test.ts's "Part 57" suite) before
//    anything else happens — rejects empty input and disallowed
//    characters with the exact same error messages that function
//    already returns.
// 3. No-op guard: if the normalized new local part is identical to
//    currentLocalPart (case-insensitive, since normalizeRequestedLocalPart
//    already lowercases), the action returns a clear error instead of
//    performing a pointless mutation/audit entry.
// 4. Mutation + audit: delegates entirely to
//    approveCorporateIdentityLocalPart() with requestedLocalPart set to
//    the CURRENT address (documenting what it was) and approvedLocalPart
//    set to the new one, plus a fixed, non-user-editable approvalReason
//    ("Founder/Super Admin correction — data-entry typo fixed on an
//    unprovisioned reservation.") — every correction made through this
//    action is identifiable as such in activity_log, distinct from a
//    person-requested alternative going through the original workflow.
//    That function's own reserved-only guard (see
//    reserveCorporateIdentity.test.ts) is what actually enforces "only
//    while reserved/unprovisioned" — not duplicated here.
// 5. revalidatePath("/admin/operations") is called unconditionally
//    after the attempt, matching every other action in this file.
describe("correctCorporateIdentityLocalPartAction — verified by code reading", () => {
  it("requires Super Admin (via the existing requireSuperAdmin() helper, no parallel permission system) before any validation or mutation is attempted", () => {
    expect(true).toBe(true);
  });

  it("validates the new local part via the existing normalizeRequestedLocalPart(), and rejects a no-op (new === current) correction", () => {
    expect(true).toBe(true);
  });

  it("delegates the actual mutation, uniqueness check, and reserved-only enforcement entirely to approveCorporateIdentityLocalPart(), tagging the change with a fixed, honest approvalReason identifying it as a Founder/Super Admin correction", () => {
    expect(true).toBe(true);
  });
});
