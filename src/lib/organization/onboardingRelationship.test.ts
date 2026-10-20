import { describe, expect, it } from "vitest";
import {
  resolveOnboardingRelationship,
  isVendorEligible,
  onboardingWorkspaceHref,
  describeVendorIneligibility,
  onboardingCopy,
  isIndividualContributorEngagementType,
  VENDOR_CONFLICT_MESSAGE,
  VENDOR_NOT_ELIGIBLE_MESSAGE,
  type OnboardingRelationship,
} from "./onboardingRelationship";
import { resolveOnboardingPipeline } from "./onboardingStages";

const resolve = (engagementTypeSlug: string | null, roles: string[], pipeline?: "employee" | "external_contractor" | null) =>
  resolveOnboardingRelationship({ engagementTypeSlug, roles, pipeline });

describe("resolveOnboardingRelationship — individual contributors (Founder instruction 2026-10-21)", () => {
  it("instructor + contractor role (the real Kwaku Darko Gyimah case) is an individual contributor, never a vendor", () => {
    const r = resolve("instructor", ["contractor"], "external_contractor");
    expect(r.relationship).toBe("individual_contributor");
    expect(isVendorEligible(r)).toBe(false);
  });
  it.each(["instructor", "freelancer", "independent_contractor"])("%s with the contractor role is an individual contributor", (slug) => {
    expect(resolve(slug, ["contractor"]).relationship).toBe("individual_contributor");
  });
  it("a contractor who operates through a registered business keeps the contractor classification (independent_contractor + contractor) — not a vendor", () => {
    const r = resolve("independent_contractor", ["contractor"], "external_contractor");
    expect(r.relationship).toBe("individual_contributor");
    expect(isVendorEligible(r)).toBe(false);
  });
  it("a contributor engagement type with no role yet is still an individual contributor (engagement type is authoritative)", () => {
    expect(resolve("freelancer", []).relationship).toBe("individual_contributor");
  });
  it("the contractor role with no engagement type yet is treated as a contributor, never a vendor", () => {
    const r = resolve(null, ["contractor"]);
    expect(r.relationship).toBe("individual_contributor");
    expect(isVendorEligible(r)).toBe(false);
  });
  it("isIndividualContributorEngagementType covers exactly the three contributor types", () => {
    for (const slug of ["instructor", "freelancer", "independent_contractor"]) expect(isIndividualContributorEngagementType(slug)).toBe(true);
    for (const slug of ["vendor_supplier", "model_talent", "full_time", "intern", "volunteer", "collaborator_partner", "project_based", null, undefined]) {
      expect(isIndividualContributorEngagementType(slug as string | null | undefined)).toBe(false);
    }
  });
});

describe("resolveOnboardingRelationship — vendors keep their workflow", () => {
  it("vendor_supplier + vendor role (the existing Production vendor) is a vendor and eligible", () => {
    const r = resolve("vendor_supplier", ["client", "vendor"], "external_contractor");
    expect(r.relationship).toBe("vendor_supplier");
    expect(isVendorEligible(r)).toBe(true);
  });
  it("the vendor role with no engagement type yet (startVendorOnboardingAction's real entry point) is a vendor", () => {
    const r = resolve(null, ["vendor"]);
    expect(r.relationship).toBe("vendor_supplier");
    expect(isVendorEligible(r)).toBe(true);
  });
  it("the vendor_supplier engagement type with no vendor role yet is a vendor", () => {
    expect(resolve("vendor_supplier", []).relationship).toBe("vendor_supplier");
  });
});

describe("resolveOnboardingRelationship — conflicting classifications fail safely (precedence rule)", () => {
  it("vendor_supplier engagement type + contractor role => conflict, NOT silently a vendor and NOT silently a contributor", () => {
    const r = resolve("vendor_supplier", ["contractor"]);
    expect(r.relationship).toBe("conflict");
    expect(isVendorEligible(r)).toBe(false);
  });
  it("instructor engagement type + vendor role => conflict, never routed into the vendor workflow", () => {
    const r = resolve("instructor", ["vendor"]);
    expect(r.relationship).toBe("conflict");
    expect(isVendorEligible(r)).toBe(false);
  });
  it("contractor role + vendor role together (no engagement type) => conflict", () => {
    expect(resolve(null, ["contractor", "vendor"]).relationship).toBe("conflict");
  });
  it("model signal + vendor signal => conflict", () => {
    expect(resolve("model_talent", ["vendor"]).relationship).toBe("conflict");
    expect(resolve("vendor_supplier", ["model"]).relationship).toBe("conflict");
  });
  it("conflict explains itself and is rendered with the review copy", () => {
    const r = resolve("freelancer", ["vendor", "contractor"]);
    expect(describeVendorIneligibility(r)).toBe(VENDOR_CONFLICT_MESSAGE);
    expect(onboardingCopy("conflict").sectionHeading).toMatch(/review required/i);
    expect(r.reason).toMatch(/review/i);
  });
  it("a non-conflicting ineligible account gets the plain not-a-vendor message", () => {
    expect(describeVendorIneligibility(resolve("instructor", ["contractor"]))).toBe(VENDOR_NOT_ELIGIBLE_MESSAGE);
  });
  it("engagement type never overrides role and role never overrides type: each alone is honoured, disagreement is a conflict", () => {
    expect(resolve("instructor", []).relationship).toBe("individual_contributor"); // type only
    expect(resolve(null, ["contractor"]).relationship).toBe("individual_contributor"); // role only
    expect(resolve("instructor", ["vendor"]).relationship).toBe("conflict"); // disagreement
  });
});

describe("resolveOnboardingRelationship — employees are untouched", () => {
  it.each(["full_time", "part_time", "fixed_term"])("%s resolves to employee regardless of roles", (slug) => {
    expect(resolve(slug, ["staff"]).relationship).toBe("employee");
    expect(resolve(slug, ["admin", "super_admin", "staff"]).relationship).toBe("employee");
  });
  it("the employee pipeline resolves to employee even before an engagement type is recorded", () => {
    expect(resolve(null, ["staff"], "employee").relationship).toBe("employee");
  });
  it("stays consistent with resolveOnboardingPipeline for every known engagement type", () => {
    for (const slug of ["full_time", "part_time", "fixed_term"]) expect(resolveOnboardingPipeline(slug)).toBe("employee");
    for (const slug of ["instructor", "freelancer", "independent_contractor", "vendor_supplier", "model_talent", "collaborator_partner", "intern", "volunteer", "project_based"]) {
      expect(resolveOnboardingPipeline(slug)).toBe("external_contractor");
    }
  });
});

describe("resolveOnboardingRelationship — other external relationships", () => {
  it.each(["intern", "volunteer", "collaborator_partner", "project_based"])("%s is other_external and not vendor-eligible", (slug) => {
    const r = resolve(slug, []);
    expect(r.relationship).toBe("other_external");
    expect(isVendorEligible(r)).toBe(false);
  });
  it("model_talent with the model role is other_external (model workflow untouched, but never a vendor)", () => {
    const r = resolve("model_talent", ["model"]);
    expect(r.relationship).toBe("other_external");
    expect(isVendorEligible(r)).toBe(false);
  });
  it("an unclassified account (no type, no relevant role) is other_external and not vendor-eligible", () => {
    const r = resolve(null, ["client"]);
    expect(r.relationship).toBe("other_external");
    expect(isVendorEligible(r)).toBe(false);
  });
});

describe("onboardingWorkspaceHref — routing decision uses relationship, not pipeline alone", () => {
  const ids = { onboardingId: "ob-1", profileId: "pr-1" };
  it("only genuine vendors go to the Vendor workspace", () => {
    expect(onboardingWorkspaceHref({ relationship: "vendor_supplier", ...ids })).toBe("/admin/organization/vendors/pr-1");
  });
  it.each<OnboardingRelationship>(["employee", "individual_contributor", "other_external", "conflict"])("%s opens the generic onboarding workspace", (relationship) => {
    expect(onboardingWorkspaceHref({ relationship, ...ids })).toBe("/admin/organization/onboarding/ob-1");
  });
  it("an external-pipeline individual contributor is NOT sent to /vendors (the reported defect)", () => {
    const relationship = resolve("instructor", ["contractor"], "external_contractor").relationship;
    expect(onboardingWorkspaceHref({ relationship, ...ids })).not.toContain("/vendors/");
  });
});

describe("onboardingCopy — relationship-appropriate wording", () => {
  it("employees keep the original wording exactly (no unintended change)", () => {
    const c = onboardingCopy("employee");
    expect(c.sectionHeading).toBe("Internal Staff Onboarding");
    expect(c.startLabel).toBe("Start Internal Staff Onboarding");
    expect(c.definitionHeading).toBe("Employment / Hire Definition");
    expect(c.showEmployeeOrganizationFields).toBe(true);
  });
  it("contributors never see employee/internal-staff wording or employee-only fields", () => {
    for (const rel of ["individual_contributor", "other_external", "conflict", "vendor_supplier"] as const) {
      const c = onboardingCopy(rel);
      expect(c.sectionHeading).not.toMatch(/internal staff/i);
      expect(c.startLabel).not.toMatch(/internal staff/i);
      expect(c.usersCaption).not.toMatch(/internal-employment onboarding process only/i);
      expect(c.definitionHeading).not.toMatch(/employment/i);
      expect(c.showEmployeeOrganizationFields).toBe(false);
    }
    expect(onboardingCopy("individual_contributor").sectionHeading).toBe("Contributor Onboarding");
    expect(onboardingCopy("individual_contributor").definitionHeading).toBe("Collaboration Definition");
  });
  it("contributor copy states payment is separate and only after engagement terms are agreed", () => {
    expect(onboardingCopy("individual_contributor").usersCaption).toMatch(/only once engagement terms are agreed/i);
  });
});
