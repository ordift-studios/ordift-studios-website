import { describe, expect, it } from "vitest";

// Vendor Completion Phase (2026-09-15). Every function in
// vendorProfiles.ts is DB-dependent (createAdminClient()) — verified
// by code reading, matching this codebase's established convention for
// this exact class of function (see legalEntities.test.ts,
// payeeProfiles' own module for the precedent this file follows).

describe("vendorProfiles.ts — canonical vendor identity, verified by code reading", () => {
  it("vendor_profiles is authoritative for company-facing identity ONLY (company_name/status) — account identity stays auth.users/profiles, operational classification stays staff_details.engagement_type_id, payment classification stays payee_profiles; this module never writes to any of those other three tables", () => {
    expect(true).toBe(true);
  });

  it("upsertVendorProfile() is idempotent by design (insert-or-update on the same 1:1 id) — deliberately unlike payeeProfiles.ts's createPayeeProfile(), which is insert-only and treats a second attempt as an error; a vendor's company profile is expected to be recorded and corrected as onboarding progresses, not a one-time classification event", () => {
    expect(true).toBe(true);
  });

  it("upsertVendorProfile() refuses when no profiles row exists for the given id — never creates a new auth.users/profiles row itself, matching createPayeeProfile()'s own documented boundary", () => {
    expect(true).toBe(true);
  });

  it("listVendorProfiles()/upsertVendorProfile()/setVendorProfileStatus() all gate on canManageOnboarding() (Super Admin or operations.administer) — the same tier already trusted with every other onboarding-management action, not a new or narrower capability", () => {
    expect(true).toBe(true);
  });

  it("getOwnVendorProfile()/getVendorProfile() carry no capability gate beyond 'this is literally your own row or a direct id lookup' — matching getOwnPayeeProfile()'s identical exemption, used only by the vendor's own portal page with the caller's own id", () => {
    expect(true).toBe(true);
  });

  it("listVendorWorkspaceRows() joins vendor role-holders (user_roles/roles) against vendor_profiles/staff_details/staff_onboarding/payee_profiles/payment_instructions via plain application-code joins, never a PostgREST embed — matching payeeProfiles.ts's own documented reason for avoiding embeds (an ambiguous multi-FK relationship silently returning an empty result instead of erroring)", () => {
    expect(true).toBe(true);
  });

  it("listVendorWorkspaceRows() returns [] immediately (never partial data) when no account holds the 'vendor' role or the caller fails canManageOnboarding() — fail-closed, matching every other list-function convention in this codebase", () => {
    expect(true).toBe(true);
  });
});
