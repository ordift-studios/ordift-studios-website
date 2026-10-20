import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Source-level regression guards (this repository's established
// "verified by code reading" convention for server-rendered screens that
// cannot be mounted in the node-only unit layer). They pin the specific
// defects behind the Jema Studios routing discrepancy so they cannot be
// reintroduced silently.

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

describe("Onboarding Documents row routing", () => {
  const src = read("src/app/admin/hr/onboarding-documents/OnboardingDocumentsWorkspace.tsx");
  it("routes through the relationship-aware helper", () => {
    expect(src).toContain("onboardingWorkspaceHref(");
  });
  it("no longer decides the Vendor workspace link from the pipeline alone", () => {
    expect(src).not.toMatch(/row\.pipeline\s*===\s*"employee"/);
    expect(src).not.toContain("/admin/organization/vendors/");
  });
});

describe("Vendor workspace page", () => {
  const src = read("src/app/admin/organization/vendors/[vendorId]/page.tsx");
  it("redirects every non-vendor (including conflicting classifications) before rendering any vendor section", () => {
    expect(src).toContain("isVendorEligible(relationship)");
    const guardAt = src.indexOf("isVendorEligible(relationship)");
    const renderAt = src.indexOf("<VendorDetailWorkspace");
    expect(guardAt).toBeGreaterThan(-1);
    expect(guardAt).toBeLessThan(renderAt);
  });
});

describe("Vendor server actions", () => {
  const src = read("src/app/admin/organization/vendors/[vendorId]/actions.ts");
  const exported = (src.match(/^export async function /gm) ?? []).length;
  it("every exported action calls the vendor-eligibility guard exactly once", () => {
    expect(exported).toBe(21);
    const calls = (src.match(/await guardVendorTarget\(/g) ?? []).length;
    expect(calls).toBe(exported);
  });
  it("the guard runs before the first underlying write in every action", () => {
    const parts = src.split(/^export async function /m).slice(1);
    for (const part of parts) {
      const guardAt = part.indexOf("await guardVendorTarget(");
      expect(guardAt, part.slice(0, 60)).toBeGreaterThan(-1);
      // Nothing that writes or sends may appear before the guard.
      const before = part.slice(part.indexOf("\n"), guardAt); // skip the function's own signature line
      expect(before).not.toMatch(/upsertVendorProfile\(|createPayeeProfile\(|createVendor\w*DraftAgreement\(|issueVendor\w*\(|transitionAgreementStatus\(|advanceOnboardingStage\(|completeStaffOnboarding\(|updateOnboardingRequirement\(|\.upsert\(|\.insert\(|\.update\(/);
    }
  });
  it("failures use the eligibility-aware message helper, not a blanket swallow", () => {
    expect(src).not.toMatch(/catch \{\s*return \{ ok: false, error: "You are not authorized to do this\." \};/);
    expect((src.match(/vendorActionFailureMessage\(error\)/g) ?? []).length).toBe(exported);
  });
});

describe("Users & Roles and the generic workspace use relationship-aware wording", () => {
  const users = read("src/app/admin/users/UsersManager.tsx");
  const workspace = read("src/app/admin/organization/onboarding/[onboardingId]/OnboardingWorkspace.tsx");
  it("no hard-coded employee-only onboarding labels remain in the Users & Roles section", () => {
    expect(users).not.toMatch(/"Start Internal Staff Onboarding"/);
    expect(users).not.toMatch(/Tracks the internal-employment onboarding process only/);
    expect(users).toContain("copy.sectionHeading");
    expect(users).toContain("copy.startLabel");
  });
  it("the internal-employment warning only shows for a real employment path", () => {
    expect(users).toContain("hasExternalWorkforceRelationship && startsEmploymentPath");
  });
  it("the generic workspace headings come from the relationship copy", () => {
    expect(workspace).not.toMatch(/>Employment \/ Hire Definition</);
    expect(workspace).toContain("copy.definitionHeading");
    expect(workspace).toContain("copy.showEmployeeOrganizationFields");
  });
});

describe("onboarding never creates payees, payments, agreements or emails as a side effect", () => {
  for (const file of ["src/lib/organization/onboarding.ts", "src/lib/organization/onboardingRequirements.ts", "src/lib/organization/onboardingRelationship.ts", "src/lib/organization/vendorEligibility.ts"]) {
    it(`${file} has no write path to payee_profiles / payment_instructions / payment_obligations / agreements and imports no email or payment module`, () => {
      const src = read(file);
      expect(src).not.toMatch(/from\("(payee_profiles|payment_instructions|payment_obligations|agreements|agreement_parties|agreement_snapshots)"\)\s*\.(insert|update|upsert|delete)/);
      expect(src).not.toMatch(/from "@\/lib\/(payables|payments)\//);
      expect(src).not.toMatch(/sendEmail|dispatch\/|notifications\//);
      expect(src).not.toMatch(/issue\w*Agreement/);
    });
  }
});
