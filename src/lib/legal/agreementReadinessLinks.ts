import type { EmploymentAgreementVariableKey } from "@/lib/legal/documents/os-lgl-007-employee-employment-agreement";

// Task 2 (2026-09-18) — Agreement Readiness actionability. Pure
// mapping only: which EXISTING governed editor resolves a given
// Employee Employment Agreement variable. No new editors are created
// here — every href below points at a real, already-built form
// (Employment Terms Setup, reused from Task 1/3A; Position assignment
// on Users & Roles). A key with no entry here has no independent
// editor (it's policy-derived or otherwise not directly settable) —
// callers must not fabricate a link for it.
type LinkCategory = "employment-terms" | "position-assignment";

const FIELD_LINK_CATEGORY: Partial<Record<EmploymentAgreementVariableKey, LinkCategory>> = {
  employerLegalName: "employment-terms",
  startDate: "employment-terms",
  primaryWorkLocation: "employment-terms",
  normalWorkingHours: "employment-terms",
  basicWageSalary: "employment-terms",
  allowances: "employment-terms",
  jurisdiction: "employment-terms",
  jobTitle: "position-assignment",
  organizationalGrade: "position-assignment",
  department: "position-assignment",
  employmentType: "position-assignment",
};

// probation/annualLeave/notice are deliberately absent — these are
// policy-derived from jurisdiction + start date (see
// employeeAgreements.ts), never independently entered; a missing
// value there means jurisdiction or startDate is what's actually
// missing, not a separate "probation editor" that doesn't exist.
// employeeLegalName is absent — it comes from profiles.full_name,
// not an employment-terms field. reportingTo is absent — it's
// resolved from the live Position reporting chain, not directly
// settable at all (see resolveCurrentManager()).

export function agreementReadinessFieldHref(
  key: EmploymentAgreementVariableKey,
  params: { profileId: string; onboardingId: string | null }
): string | null {
  const category = FIELD_LINK_CATEGORY[key];
  if (!category) return null;
  if (category === "employment-terms") {
    return params.onboardingId
      ? `/admin/organization/onboarding/${params.onboardingId}#section-employment-terms`
      : `/admin/organization/people/${params.profileId}#section-transitions`;
  }
  // position-assignment: Users & Roles' expandable per-person row —
  // the real, only place Position/Department/Grade/Engagement Type
  // are assigned (assignStaffPositionAction).
  return `/admin/users?expandUserId=${params.profileId}`;
}
