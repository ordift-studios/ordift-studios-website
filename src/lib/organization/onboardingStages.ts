// Organizational Structure, Authority Grants, Staff Onboarding & Work
// Email V1 — closure addition (2026-09-07), Part 26/56. Pure,
// zero-import onboarding-stage sequencing. Two distinct pipelines —
// never one generic sequence forced onto everyone — chosen at
// onboarding start based on the person's actual engagement
// classification, never implied by Grade/capability/Financial
// Authority. Persisted on public.staff_onboarding.stage/.pipeline
// (migration 0066); this module is the single source of truth for
// what each pipeline's valid stages and ordering actually are.

export const EMPLOYEE_ONBOARDING_STAGES = [
  "candidate_proposed",
  "preliminary_approval",
  "background_screening",
  "management_review",
  "approved_for_hire",
  "invited",
  "identity_profile",
  "work_email",
  "documents",
  "authority_assignment",
  "active",
] as const;
export type EmployeeOnboardingStage = (typeof EMPLOYEE_ONBOARDING_STAGES)[number];

// Shorter external/contractor track — per explicit instruction, an
// external contractor/vendor is never forced through employee-only
// stages (e.g. there is no "background_screening" stage here; a
// screening record can still exist against background_screenings for
// a contractor where genuinely appropriate, tracked independently of
// this sequence rather than gating it).
export const EXTERNAL_CONTRACTOR_ONBOARDING_STAGES = [
  "proposed",
  "approved",
  "invited",
  "profile",
  "payment_setup",
  "engagement_assigned",
  "active",
] as const;
export type ExternalContractorOnboardingStage = (typeof EXTERNAL_CONTRACTOR_ONBOARDING_STAGES)[number];

export type OnboardingPipeline = "employee" | "external_contractor";
export type OnboardingStage = EmployeeOnboardingStage | ExternalContractorOnboardingStage;

export function stagesForPipeline(pipeline: OnboardingPipeline): readonly OnboardingStage[] {
  return pipeline === "employee" ? EMPLOYEE_ONBOARDING_STAGES : EXTERNAL_CONTRACTOR_ONBOARDING_STAGES;
}

// Pipeline selection is explicit and deliberate — engagementTypeSlug is
// the caller's already-known engagement_types.slug (e.g. 'full_time',
// 'independent_contractor'). Every genuinely-employment slug maps to
// the full employee pipeline; everything else (contractor/freelancer/
// vendor/instructor/model-talent/collaborator-partner/project-based/
// intern/volunteer) gets the shorter external track. 'intern'/'volunteer'
// are deliberately treated as the shorter track too — they are not
// forced through background screening/management review by default,
// though a specific engagement can still record a background_screenings
// row independently if genuinely warranted.
export function resolveOnboardingPipeline(engagementTypeSlug: string): OnboardingPipeline {
  const EMPLOYEE_SLUGS = new Set(["full_time", "part_time", "fixed_term"]);
  return EMPLOYEE_SLUGS.has(engagementTypeSlug) ? "employee" : "external_contractor";
}

export function isValidStage(pipeline: OnboardingPipeline, stage: string): stage is OnboardingStage {
  return (stagesForPipeline(pipeline) as readonly string[]).includes(stage);
}

export function isTerminalStage(pipeline: OnboardingPipeline, stage: string): boolean {
  const stages = stagesForPipeline(pipeline);
  return stages[stages.length - 1] === stage;
}

// The next stage in sequence — never skips, never wraps. Returns null
// if already at (or past/invalid relative to) the terminal stage. The
// "management_review" stage is explicitly "where needed" (Part 26) —
// this pure function does not decide that; the caller (a real
// screening-outcome check, e.g. requiresManagementDecision() in
// backgroundScreening.ts) decides whether to advance through it or
// skip straight past it to approved_for_hire, keeping the two concerns
// (stage sequencing vs. screening-outcome interpretation) separate.
export function nextStage(pipeline: OnboardingPipeline, currentStage: string): OnboardingStage | null {
  const stages = stagesForPipeline(pipeline);
  const index = (stages as readonly string[]).indexOf(currentStage);
  if (index === -1 || index === stages.length - 1) return null;
  return stages[index + 1];
}

// A stage transition is valid only if it moves strictly forward within
// the SAME pipeline (never backward, never across pipelines, never an
// arbitrary jump) — mirrors this codebase's other append-only/
// forward-only lifecycle guards (e.g. requiresGovernedChangeRecord()).
export function canAdvanceToStage(pipeline: OnboardingPipeline, fromStage: string, toStage: string): boolean {
  const stages = stagesForPipeline(pipeline);
  const fromIndex = (stages as readonly string[]).indexOf(fromStage);
  const toIndex = (stages as readonly string[]).indexOf(toStage);
  if (fromIndex === -1 || toIndex === -1) return false;
  return toIndex === fromIndex + 1;
}
