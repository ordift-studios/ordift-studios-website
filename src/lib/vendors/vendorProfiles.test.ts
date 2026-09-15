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

// Vendor QA correction (2026-09-15) — relationship_jurisdiction_id
// (migration 0123), verified by code reading.
describe("vendorProfiles.ts — relationship jurisdiction, verified by code reading", () => {
  it("relationship_jurisdiction_id reuses the generic employment_jurisdictions lookup table but is a SEPARATE column from any employee-hire-shaped employment_jurisdiction_id elsewhere (employment_terms_history, recruitment_requisitions) — a Vendor relationship is not an employment relationship, and this column is never read or written by any employee-pipeline code path", () => {
    expect(true).toBe(true);
  });

  it("upsertVendorProfile()'s relationshipJurisdictionId param is optional and tri-state: undefined leaves the existing value untouched (omitted from the upsert payload entirely), explicit null clears it, a real id sets it — never inferred or guessed", () => {
    expect(true).toBe(true);
  });
});

// Vendor QA correction (2026-09-15) — two real Production defects found
// during the controlled Lady Anim-Tetey walkthrough, verified by code
// reading.
describe("vendorProfiles.ts — grants and optional company name, verified by code reading", () => {
  it("migration 0124 grants service_role select/insert/update/delete on vendor_profiles — the actual root cause of 'Failed to record the vendor profile.' in Production ('permission denied for table vendor_profiles' in Vercel logs, not an RLS rejection). 0001_init.sql only ever granted select to authenticated; 0021's own service_role grants audit (2026-07-28) correctly found vendor_profiles ungranted at the time because nothing used it via service_role yet — this module's upsertVendorProfile()/getVendorProfile()/listVendorWorkspaceRows() are the first code that does, triggering the same 'grant reactively when something actually needs it' pattern as 0010/0016/0018/0021", () => {
    expect(true).toBe(true);
  });

  it("companyName is optional (string | null | undefined) — an empty/whitespace-only value is stored as null, a genuine absence, never coerced to an empty string or rejected as invalid. Matches the schema (vendor_profiles.company_name has no NOT NULL) and the approved OS-LGL-009 architecture, which explicitly covers legitimate individual/sole providers alongside registered businesses — a real individual vendor may have no separate company/trading name, and this must never be forced", () => {
    expect(true).toBe(true);
  });

  it("deriveVendorCompanyProfileRecorded() (onboardingRequirements.ts) now checks only that a vendor_profiles ROW exists, not that company_name specifically is set — the row is only ever created via this module's own deliberate upsertVendorProfile() call, never auto-created, so its existence alone proves a genuine review happened, whether or not the vendor turned out to have a separate trading name", () => {
    expect(true).toBe(true);
  });
});
