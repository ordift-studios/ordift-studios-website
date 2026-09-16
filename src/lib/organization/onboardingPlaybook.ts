import {
  EMPLOYEE_ONBOARDING_REQUIREMENT_CATALOG,
  VENDOR_SUPPLIER_ONBOARDING_REQUIREMENT_CATALOG,
  CONTRACTOR_FREELANCER_ONBOARDING_REQUIREMENT_CATALOG,
  INSTRUCTOR_ONBOARDING_REQUIREMENT_CATALOG,
  MODEL_TALENT_ONBOARDING_REQUIREMENT_CATALOG,
  type RequirementTemplate,
} from "@/lib/organization/onboardingRequirements";
import { EMPLOYEE_ONBOARDING_STAGES, EXTERNAL_CONTRACTOR_ONBOARDING_STAGES, type OnboardingStage } from "@/lib/organization/onboardingStages";

// Onboarding Guides / Playbook System (2026-09-16) — GENERATED directly
// from the real, live onboarding stage sequences (onboardingStages.ts)
// and requirement catalogs (onboardingRequirements.ts), never a
// separately hand-authored document that can silently drift from the
// actual Production workflow. Every step shown here is a real stage or
// a real requirement definition already governing genuine onboarding
// gating — this module adds zero new steps of its own, only formats
// what already exists for two audiences (Internal Admin/Staff vs.
// External Participant).

export type OnboardingClassification = "employee" | "vendor_supplier" | "contractor_freelancer" | "instructor" | "model_talent";

export const ONBOARDING_CLASSIFICATIONS: { key: OnboardingClassification; label: string; internalGuideTitle: string; externalGuideTitle: string }[] = [
  { key: "employee", label: "Employee / Staff", internalGuideTitle: "Ordift Studios — Staff/Admin Employee Onboarding Guide", externalGuideTitle: "Ordift Studios — New Employee Onboarding Guide" },
  { key: "vendor_supplier", label: "Vendor / Supplier", internalGuideTitle: "Ordift Studios — Staff/Admin Vendor & Supplier Onboarding Guide", externalGuideTitle: "Ordift Studios — Vendor & Supplier Onboarding Guide" },
  { key: "contractor_freelancer", label: "Contractor / Freelancer", internalGuideTitle: "Ordift Studios — Staff/Admin Contractor & Freelancer Onboarding Guide", externalGuideTitle: "Ordift Studios — Contractor & Freelancer Onboarding Guide" },
  { key: "instructor", label: "Instructor / Workshop Facilitator", internalGuideTitle: "Ordift Studios — Staff/Admin Instructor Onboarding Guide", externalGuideTitle: "Ordift Studios — Instructor Onboarding Guide" },
  { key: "model_talent", label: "Model / Talent", internalGuideTitle: "Ordift Studios — Staff/Admin Model & Talent Onboarding Guide", externalGuideTitle: "Ordift Studios — Model & Talent Onboarding Guide" },
];

// Consultant deliberately has no entry of its own — per the approved
// architecture, Consultant reuses the Contractor/Freelancer legal
// structure and requirement pack (no separate engagement type/role
// exists for it). Pointing here rather than duplicating a pack.
export const CONSULTANT_REUSES: OnboardingClassification = "contractor_freelancer";

const CLASSIFICATION_CONFIG: Record<OnboardingClassification, { stages: readonly OnboardingStage[]; catalog: readonly RequirementTemplate[]; engagementTypeSlug: string | null }> = {
  employee: { stages: EMPLOYEE_ONBOARDING_STAGES, catalog: EMPLOYEE_ONBOARDING_REQUIREMENT_CATALOG, engagementTypeSlug: null },
  vendor_supplier: { stages: EXTERNAL_CONTRACTOR_ONBOARDING_STAGES, catalog: VENDOR_SUPPLIER_ONBOARDING_REQUIREMENT_CATALOG, engagementTypeSlug: "vendor_supplier" },
  contractor_freelancer: { stages: EXTERNAL_CONTRACTOR_ONBOARDING_STAGES, catalog: CONTRACTOR_FREELANCER_ONBOARDING_REQUIREMENT_CATALOG, engagementTypeSlug: "independent_contractor" },
  instructor: { stages: EXTERNAL_CONTRACTOR_ONBOARDING_STAGES, catalog: INSTRUCTOR_ONBOARDING_REQUIREMENT_CATALOG, engagementTypeSlug: "instructor" },
  model_talent: { stages: EXTERNAL_CONTRACTOR_ONBOARDING_STAGES, catalog: MODEL_TALENT_ONBOARDING_REQUIREMENT_CATALOG, engagementTypeSlug: "model_talent" },
};

const STAGE_LABELS: Record<string, string> = {
  candidate_proposed: "Candidate Proposed",
  preliminary_approval: "Preliminary Approval",
  background_screening: "Background Screening",
  management_review: "Management Review",
  approved_for_hire: "Approved for Hire",
  invited: "Invited",
  identity_profile: "Identity / Profile",
  work_email: "Work Email",
  documents: "Documents",
  authority_assignment: "Authority Assignment",
  active: "Active / Complete",
  proposed: "Proposed",
  approved: "Approved",
  profile: "Profile",
  payment_setup: "Payment Setup",
  engagement_assigned: "Engagement Assigned",
};

const REQUIREMENT_TYPE_EXTERNAL_VERB: Record<string, string> = {
  agreement: "Sign",
  digital_signature: "Sign",
  physical_document: "Provide",
  document: "Provide",
  task: "Complete",
  approval: "Await approval for",
  external_handoff: "Await",
};

export type PlaybookStep = {
  stageKey: string;
  stageLabel: string;
  internalActions: string[];
  externalActions: string[];
};

export type Playbook = {
  classification: OnboardingClassification;
  label: string;
  internalGuideTitle: string;
  externalGuideTitle: string;
  steps: PlaybookStep[];
};

// Pure — builds both the internal and external step lists for one
// classification directly from the real stage sequence + catalog.
// Directly testable without a database (RequirementTemplate.derive is
// never called here — this only reads the definitions, never live
// per-person status).
export function buildOnboardingPlaybook(classification: OnboardingClassification): Playbook {
  const config = CLASSIFICATION_CONFIG[classification];
  const meta = ONBOARDING_CLASSIFICATIONS.find((c) => c.key === classification)!;
  const relevantCatalog = config.engagementTypeSlug
    ? config.catalog.filter((t) => !t.applicableEngagementTypeSlugs || t.applicableEngagementTypeSlugs.includes(config.engagementTypeSlug!))
    : config.catalog;

  const steps: PlaybookStep[] = config.stages.map((stageKey) => {
    const requirementsAtStage = relevantCatalog.filter((t) => t.stage === stageKey);
    return {
      stageKey,
      stageLabel: STAGE_LABELS[stageKey] ?? stageKey,
      internalActions: requirementsAtStage.map(
        (r) => `Verify: ${r.label}${r.responsibleRole ? ` (${r.responsibleRole.replace(/_/g, " ")})` : ""}${r.required ? "" : " (optional)"}`
      ),
      externalActions: requirementsAtStage.map((r) => `${REQUIREMENT_TYPE_EXTERNAL_VERB[r.requirementType] ?? "Complete"}: ${r.label}`),
    };
  });

  return { classification, label: meta.label, internalGuideTitle: meta.internalGuideTitle, externalGuideTitle: meta.externalGuideTitle, steps };
}
