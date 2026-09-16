import { listUsersWithRoles, type AdminUserRow } from "@/lib/portal/adminData";
import { listResolvedRequirements } from "@/lib/organization/onboardingRequirements";
import { resolveCurrentEmploymentContext } from "@/lib/organization/employmentTermsHistory";
import { checkEmployeeAgreementReadiness, getEmployeeEmploymentAgreementSummary } from "@/lib/legal/employeeAgreements";

// HR Onboarding Documents (Task 2, 2026-09-17) — an operational HR
// surface over the SAME universal, classification-driven onboarding
// architecture already built (listResolvedRequirements()'s
// catalogForPipeline() selects the right document set per relationship
// — employee vs vendor/contractor/instructor/model — never a second
// requirement catalog here). Reuses listUsersWithRoles() exactly as
// the People Directory and HR Command Centre already do — never a
// second roster query — and the exact same Employee Employment
// Agreement functions Task 1 wired into the Onboarding Workspace, so
// the status shown here can never disagree with that page's own.

const DOCUMENT_REQUIREMENT_TYPES = new Set(["document", "agreement", "digital_signature", "physical_document"]);

export type OnboardingDocumentsRow = {
  onboardingId: string;
  profileId: string;
  fullName: string | null;
  memberNumber: string | null;
  departmentName: string | null;
  relationshipLabel: string;
  jurisdictionName: string | null;
  pipeline: "employee" | "external_contractor";
  stage: string;
  status: string;
  documentsComplete: number;
  documentsTotal: number;
  employmentAgreementStatus: string | null;
};

function statusIsComplete(status: string): boolean {
  return status === "satisfied" || status === "waived" || status === "not_applicable";
}

async function resolveEmploymentAgreementStatus(onboardingId: string, ready: boolean | null, error: string | undefined): Promise<string> {
  if (error) return "Not Ready";
  const summary = await getEmployeeEmploymentAgreementSummary(onboardingId);
  if (!summary) return ready ? "Ready to Draft" : "Not Ready";
  if (!summary.isIssued) return "Draft";
  return summary.status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export async function getOnboardingDocumentsOverview(): Promise<OnboardingDocumentsRow[]> {
  const usersResult = await listUsersWithRoles();
  if (!usersResult.ok) return [];

  const inProgress: AdminUserRow[] = usersResult.users.filter((u) => u.onboardingId && u.onboardingStatus === "in_progress" && u.onboardingPipeline);

  const rows = await Promise.all(
    inProgress.map(async (u): Promise<OnboardingDocumentsRow> => {
      const pipeline = u.onboardingPipeline as "employee" | "external_contractor";
      const onboardingId = u.onboardingId as string;

      const [requirements, employmentContext] = await Promise.all([
        listResolvedRequirements({ onboardingId, profileId: u.id, pipeline }),
        resolveCurrentEmploymentContext({ profileId: u.id, fallback: null }),
      ]);

      const documentRequirements = requirements.filter((r) => DOCUMENT_REQUIREMENT_TYPES.has(r.requirementType) && r.required);
      const documentsComplete = documentRequirements.filter((r) => statusIsComplete(r.status)).length;

      let employmentAgreementStatus: string | null = null;
      if (pipeline === "employee") {
        const readiness = await checkEmployeeAgreementReadiness(onboardingId);
        employmentAgreementStatus = await resolveEmploymentAgreementStatus(
          onboardingId,
          readiness.ok ? readiness.ready : null,
          readiness.ok ? undefined : readiness.error
        );
      }

      return {
        onboardingId,
        profileId: u.id,
        fullName: u.fullName,
        memberNumber: u.memberNumber,
        departmentName: u.departmentName,
        relationshipLabel: pipeline === "employee" ? "Employee" : (u.engagementTypeName ?? "External Workforce"),
        jurisdictionName: employmentContext.employmentJurisdictionName,
        pipeline,
        stage: u.onboardingStage ?? "—",
        status: u.onboardingStatus ?? "—",
        documentsComplete,
        documentsTotal: documentRequirements.length,
        employmentAgreementStatus,
      };
    })
  );

  return rows.sort((a, b) => (a.fullName ?? "").localeCompare(b.fullName ?? ""));
}
