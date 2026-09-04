// Phase H.1/H.2 (2026-09-04) — the canonical External Workforce
// classification model. Corrects the presentation/routing layer only —
// no existing profiles/payee_profiles/user_roles row is touched or
// re-onboarded by this file or anything that imports it.
//
// Four axes stay deliberately separate, per instruction:
//   1. account/auth role       — roles.slug (contractor/vendor/model/…)
//   2. payee/category          — payee_profiles.category
//   3. operational title       — operational_titles.name (what they do)
//   4. capabilities            — which portal modules render
//
// The umbrella individual-contributor role is `contractor` — photo
// editors, retouchers, photographers, videographers, video editors,
// graphic designers, and workshop instructors all authenticate under
// it. `vendor` is reserved for company-level suppliers. This module
// answers "given what we already know about this account, which
// portal experience should render" without inventing a fifth
// classification system or a new auth role per operational title.
//
// Zero server-only imports (no createAdminClient/next-headers) — this
// codebase has twice broken a Turbopack Production build by letting a
// "use client" component transitively import a server-only module
// (payeeProfileShared.ts, paymentDestinationShared.ts both carry the
// same warning) — kept pure so any future client component can import
// it directly without risk.

export type ExternalRelationship = "contractor" | "vendor" | "model" | "unclassified";

// Which portal modules a relationship should render. Not every module
// applies to every relationship — a vendor doesn't get a creative
// Files workflow unless the engagement actually needs one; a model
// gets bookings/compensation, not deliverable upload.
export type PortalModules = {
  myWork: boolean; // engagement list
  files: boolean; // source/deliverable upload + download
  feedback: boolean; // project_updates thread
  compensation: boolean; // engagement + payable status
  paymentDetails: boolean; // existing /portal/payment-details
};

// Determines the umbrella relationship from whatever we already know
// about the account — role first (the actual auth/access boundary),
// falling back to payee category only if no role signal exists yet
// (e.g. an invite mid-flight). `vendor` payee category always maps to
// the vendor relationship regardless of role, since "true vendor" is a
// commercial classification independent of which role happened to be
// granted at invite time.
export function classifyExternalRelationship(params: {
  roles: string[];
  payeeCategory: string | null;
}): ExternalRelationship {
  if (params.payeeCategory === "vendor") return "vendor";
  if (params.roles.includes("vendor")) return "vendor";
  if (params.roles.includes("model")) return "model";
  if (params.roles.includes("contractor")) return "contractor";
  // A payee categorized as an individual creative type but not yet
  // granted the `contractor` role (e.g. mid-invite) still gets the
  // contractor experience rather than falling through to "unclassified".
  if (params.payeeCategory && ["contractor", "freelancer", "instructor", "talent", "consultant"].includes(params.payeeCategory)) {
    return "contractor";
  }
  return "unclassified";
}

export function modulesForRelationship(relationship: ExternalRelationship): PortalModules {
  switch (relationship) {
    case "contractor":
      return { myWork: true, files: true, feedback: true, compensation: true, paymentDetails: true };
    case "vendor":
      return { myWork: true, files: false, feedback: true, compensation: true, paymentDetails: true };
    case "model":
      return { myWork: true, files: false, feedback: false, compensation: true, paymentDetails: true };
    case "unclassified":
      return { myWork: false, files: false, feedback: false, compensation: false, paymentDetails: false };
  }
}

// Instructor is an operational title under the contractor umbrella,
// never a separate role — this just controls display framing (e.g.
// "Session" vs "Assignment" language), not access.
const INSTRUCTOR_OPERATIONAL_TITLES = ["workshop instructor", "instructor"];

export function isInstructorEngagement(operationalTitleName: string | null): boolean {
  if (!operationalTitleName) return false;
  return INSTRUCTOR_OPERATIONAL_TITLES.includes(operationalTitleName.trim().toLowerCase());
}
