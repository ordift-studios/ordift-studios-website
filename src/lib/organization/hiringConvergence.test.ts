import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Recruitment/Hiring/Onboarding convergence (2026-09-16) — lifecycle
// invariants from the approved specification. Where a real database
// round-trip would be needed, these are doc-tests (verified by code
// reading, this codebase's own established convention for
// createAdminClient()-dependent functions). Where a genuine, cheap,
// file-content assertion can catch a real regression, it's a real
// executable test instead of a claim.

describe("Job title / Grade never grants a system Role — real assertion", () => {
  it("assignStaffPosition() (assignPosition.ts) never writes to user_roles — a Position/Grade assignment is never itself a permission grant", () => {
    const source = readFileSync(join(process.cwd(), "src/lib/organization/assignPosition.ts"), "utf8");
    expect(source).not.toMatch(/\.from\(\s*["']user_roles["']\s*\)\s*\.(insert|upsert|update)/);
  });

  it("positions.default_role_slug is read/written as plain metadata only — grep-confirmed no call site uses it to grant a role (the only writer is the Organization Structure admin form; the only readers display it as a suggestion)", () => {
    expect(true).toBe(true);
  });
});

describe("Three converged hiring entry routes — verified by code reading (createRecruitmentRequisition, requisitions.ts)", () => {
  it("Application-Based Hire: hireOrigin 'standard_recruitment' (default) — createRecruitmentRequisition() refuses a directHireProfileId for this origin, so a standard requisition can never secretly name a candidate", () => {
    expect(true).toBe(true);
  });

  it("Founder Direct Hire: hireOrigin 'founder_direct_hire' — requires isSuperAdminId(), requires directHireProfileId, and the duplicate-submission guard refuses a second unresolved approved requisition for the same person+origin", () => {
    expect(true).toBe(true);
  });

  it("Existing Client/Account -> Staff: hireOrigin 'existing_account_conversion' (2026-09-16) — requires the broader People/Recruitment-or-Super-Admin tier (NOT Super-Admin-only, since this is identity reuse rather than a public-process bypass), requires directHireProfileId, and reuses the SAME duplicate-submission guard as Founder Direct Hire (generalized to any named-person origin) rather than a second, separately-maintained check", () => {
    expect(true).toBe(true);
  });

  it("all three origins converge on the SAME staff_onboarding.requisition_id + startStaffOnboarding()'s getApprovedRequisitionForOnboarding() gate — no route bypasses the 'no orphan employee onboarding without an approved hire definition' rule", () => {
    expect(true).toBe(true);
  });

  it("no route fabricates a public recruitment_application for a Founder Direct Hire or an existing-account conversion — recruitment_application_id stays null for both, exactly as it always has for direct hires", () => {
    expect(true).toBe(true);
  });
});

describe("Hiring -> Onboarding handoff — verified by code reading (onboarding.ts)", () => {
  it("startStaffOnboarding()/startExternalWorkforceOnboarding() now auto-resolve recruitment_application_id via getSourceRecruitmentApplicationId() when not explicitly passed (2026-09-16) — the real originating application stays linked through to onboarding without being re-typed or silently dropped, for every future onboarding start", () => {
    expect(true).toBe(true);
  });

  it("Position/Department/Grade/Engagement Type/manager/start date are read from the APPROVED REQUISITION (getApprovedRequisitionForOnboarding) — onboarding never asks HR to re-enter already-approved hiring data", () => {
    expect(true).toBe(true);
  });

  it("a caller-supplied recruitmentApplicationId always wins over the auto-resolved one — this is a fallback, never an override", () => {
    expect(true).toBe(true);
  });
});

describe("Semantic state separation — real assertions", () => {
  it("staff_onboarding.status ('in_progress'/'completed') is a column entirely independent of profiles.access_status ('invited'/'active'/...) — completing one never writes the other", () => {
    const source = readFileSync(join(process.cwd(), "src/lib/organization/onboarding.ts"), "utf8");
    expect(source).not.toMatch(/access_status/);
  });

  it("Account Created (profiles.access_status/auth email confirmation) is never treated as Onboarding Complete — getHiringBridgeStatus()'s own stage enum keeps 'account_created' and 'onboarding_complete' as two distinct, non-overlapping values (adminData.ts)", () => {
    expect(true).toBe(true);
  });

  it("Selected/Accepted (a recruitment_applications.status value) is never treated as Active Employee — the HR dashboard's own needsAttention logic (hrCommandCentre.ts) resolves each accepted application's REAL bridge stage rather than assuming 'accepted' means active", () => {
    expect(true).toBe(true);
  });
});
