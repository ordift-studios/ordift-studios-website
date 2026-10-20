// Relationship-aware onboarding (2026-10-21) — the ONE pure decision that
// says which kind of working relationship an account has, so that routing,
// wording and vendor-only server actions never again infer it from the
// onboarding PIPELINE alone.
//
// Why this exists: the pipeline ("employee" | "external_contractor") only
// separates employment from everything else. "external_contractor" is
// shared by vendors/suppliers, individual contributors (instructors,
// photographers, designers, editors...), models, interns, volunteers and
// collaborators. Routing every external-pipeline record to the Vendor
// workspace (OnboardingDocumentsWorkspace.workspaceHref) put an individual
// Workshop Instructor in front of a Vendor Company Profile, a Vendor
// Framework Agreement and a vendor-classified payee button.
//
// Pure and import-free on purpose (same discipline as onboardingStages.ts):
// directly unit-testable and safe to import from client components.
//
// ----------------------------------------------------------------------
// PRECEDENCE BETWEEN ENGAGEMENT TYPE AND SYSTEM ROLE
// ----------------------------------------------------------------------
// * The engagement type (staff_details.engagement_type_id -> slug) is the
//   authoritative statement of the WORKING RELATIONSHIP.
// * The system role (user_roles) is the ACCESS boundary and a second,
//   independent signal of the same fact.
// * When the two agree (or only one is present) the answer is direct.
// * When they DISAGREE in a way that matters to the vendor boundary — a
//   vendor signal (vendor_supplier type OR vendor role) together with a
//   contributor/model signal (instructor/freelancer/independent_contractor
//   type OR contractor/model role) — the result is "conflict". A conflict
//   NEVER resolves to the vendor workflow and never to a silent guess:
//   it is routed to the neutral generic workspace with an explicit
//   "classification conflict — Super Admin review required" notice, and
//   every vendor-only server action refuses it.
// * Engagement type does NOT silently override role, and role does NOT
//   silently override engagement type.
// * "Registered contractor business" is NOT a relationship of its own: a
//   contractor who operates through a company keeps the contractor role and
//   a contributor engagement type. Operating through a company never makes
//   anyone a vendor; only the vendor_supplier type / vendor role does.

export const EMPLOYEE_ENGAGEMENT_SLUGS = ["full_time", "part_time", "fixed_term"] as const;

// Individual external contributors (Founder instruction 2026-10-21):
// instructors/facilitators, photographers, videographers, editors, graphic
// designers and other individual creatives are all engaged as one of these
// three engagement types (the operational TITLE records what they do).
export const INDIVIDUAL_CONTRIBUTOR_ENGAGEMENT_SLUGS = ["instructor", "freelancer", "independent_contractor"] as const;

export const VENDOR_ENGAGEMENT_SLUG = "vendor_supplier";
export const MODEL_ENGAGEMENT_SLUG = "model_talent";

export type OnboardingRelationship =
  | "employee"
  | "vendor_supplier"
  | "individual_contributor"
  | "other_external"
  | "conflict";

export type RelationshipInputs = {
  // engagement_types.slug resolved from staff_details (null when unset).
  engagementTypeSlug: string | null;
  // roles.slug values from user_roles.
  roles: readonly string[];
  // staff_onboarding.pipeline when a record exists (null otherwise).
  pipeline?: "employee" | "external_contractor" | null;
};

export type RelationshipResolution = {
  relationship: OnboardingRelationship;
  // Human-readable, never contains personal data.
  reason: string;
};

const isEmployeeSlug = (slug: string | null) => slug !== null && (EMPLOYEE_ENGAGEMENT_SLUGS as readonly string[]).includes(slug);
const isContributorSlug = (slug: string | null) => slug !== null && (INDIVIDUAL_CONTRIBUTOR_ENGAGEMENT_SLUGS as readonly string[]).includes(slug);

export function isIndividualContributorEngagementType(slug: string | null | undefined): boolean {
  return isContributorSlug(slug ?? null);
}

export function resolveOnboardingRelationship(input: RelationshipInputs): RelationshipResolution {
  const slug = input.engagementTypeSlug ?? null;
  const roles = input.roles;

  // Employment is decided by the employee pipeline / employee engagement
  // types and is deliberately left untouched by this module.
  if (input.pipeline === "employee" || isEmployeeSlug(slug)) {
    return { relationship: "employee", reason: "Employee pipeline or employment engagement type." };
  }

  const vendorSignal = slug === VENDOR_ENGAGEMENT_SLUG || roles.includes("vendor");
  const contributorSignal = isContributorSlug(slug) || roles.includes("contractor");
  const modelSignal = slug === MODEL_ENGAGEMENT_SLUG || roles.includes("model");

  if (vendorSignal && (contributorSignal || modelSignal)) {
    return {
      relationship: "conflict",
      reason:
        "Conflicting classification: a vendor/supplier signal (engagement type or Vendor role) is present together with a contractor/model signal. " +
        "Super Admin review is required before any vendor action; no relationship is assumed.",
    };
  }
  if (vendorSignal) {
    return { relationship: "vendor_supplier", reason: "Vendor/supplier engagement type and/or Vendor role." };
  }
  if (contributorSignal) {
    return {
      relationship: "individual_contributor",
      reason: "Contractor / External Contributor (instructor, freelancer or independent contractor), including contractors who operate through a registered business.",
    };
  }
  return { relationship: "other_external", reason: "External relationship that is neither a vendor nor an individual contributor (or not yet classified)." };
}

// Only a clean vendor_supplier resolution may use vendor-only workspaces
// and server actions. "conflict" is deliberately NOT eligible.
export function isVendorEligible(resolution: RelationshipResolution): boolean {
  return resolution.relationship === "vendor_supplier";
}

// Where "open this person's onboarding" must go. Only genuine vendors go to
// the Vendor workspace; everyone else (employees, individual contributors,
// other externals, conflicts) opens the generic onboarding workspace, which
// is the Contributor / Contractor Onboarding workspace for non-employees.
export function onboardingWorkspaceHref(params: { relationship: OnboardingRelationship; onboardingId: string; profileId: string }): string {
  if (params.relationship === "vendor_supplier") return `/admin/organization/vendors/${params.profileId}`;
  return `/admin/organization/onboarding/${params.onboardingId}`;
}

export const VENDOR_NOT_ELIGIBLE_MESSAGE =
  "This account is not a vendor/supplier, so vendor actions are not available for it. Individual contributors and contractors are onboarded in the Contributor / Contractor Onboarding workspace.";
export const VENDOR_CONFLICT_MESSAGE =
  "This account has conflicting vendor and contractor classifications. No vendor action is available until a Super Admin reviews and corrects the classification.";

export function describeVendorIneligibility(resolution: RelationshipResolution): string {
  return resolution.relationship === "conflict" ? VENDOR_CONFLICT_MESSAGE : VENDOR_NOT_ELIGIBLE_MESSAGE;
}

// ----------------------------------------------------------------------
// Presentation copy — one place so labels cannot drift between screens.
// ----------------------------------------------------------------------
export type OnboardingCopy = {
  // Users & Roles section heading and primary button.
  sectionHeading: string;
  startLabel: string;
  // Caption under the Users & Roles onboarding controls.
  usersCaption: string;
  // Generic onboarding workspace.
  definitionHeading: string;
  organizationCardHeading: string;
  numberLabel: string;
  // Whether employee-only organizational fields (employing entity as
  // "Employer", position, department, grade, hiring manager) apply.
  showEmployeeOrganizationFields: boolean;
};

export function onboardingCopy(relationship: OnboardingRelationship): OnboardingCopy {
  if (relationship === "employee") {
    return {
      sectionHeading: "Internal Staff Onboarding",
      startLabel: "Start Internal Staff Onboarding",
      usersCaption:
        "Tracks the internal-employment onboarding process only — assign Department/Position/Grade above, and set up a payment destination via Payables → Payees if this person will be paid through Ordift.",
      definitionHeading: "Employment / Hire Definition",
      organizationCardHeading: "Organization",
      numberLabel: "Member/staff number",
      showEmployeeOrganizationFields: true,
    };
  }
  if (relationship === "vendor_supplier") {
    return {
      sectionHeading: "Vendor Onboarding",
      startLabel: "Start Onboarding",
      usersCaption: "Vendors and suppliers are onboarded from the dedicated Vendor workspace — company profile, documents, agreements and payment readiness live there.",
      definitionHeading: "Engagement Definition",
      organizationCardHeading: "Engagement",
      numberLabel: "Member number",
      showEmployeeOrganizationFields: false,
    };
  }
  if (relationship === "conflict") {
    return {
      sectionHeading: "Onboarding (classification review required)",
      startLabel: "Start Onboarding",
      usersCaption: "This account's engagement type and system role disagree. A Super Admin must correct the classification before onboarding actions rely on it.",
      definitionHeading: "Engagement Definition",
      organizationCardHeading: "Engagement",
      numberLabel: "Member number",
      showEmployeeOrganizationFields: false,
    };
  }
  // individual_contributor and other_external
  return {
    sectionHeading: relationship === "individual_contributor" ? "Contributor Onboarding" : "External Onboarding",
    startLabel: "Start Onboarding",
    usersCaption:
      "Tracks the external contributor onboarding process (not employment). Payment destinations are handled separately under Payables → Payees and only once engagement terms are agreed.",
    definitionHeading: "Collaboration Definition",
    organizationCardHeading: "Engagement",
    numberLabel: "Member number",
    showEmployeeOrganizationFields: false,
  };
}
