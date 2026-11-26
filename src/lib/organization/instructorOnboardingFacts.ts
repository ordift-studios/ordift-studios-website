import { createAdminClient } from "@/lib/supabase/admin";
import { getStaffOnboardingByProfileId } from "@/lib/organization/onboarding";
import { listResolvedRequirements } from "@/lib/organization/onboardingRequirements";
import { getCurrentInstructorAgreement } from "@/lib/legal/instructorAgreements";
import { loadStandardsStateFor } from "@/lib/instructors/standards";
import { INSTRUCTOR_FRAMEWORK_ENABLED } from "@/lib/instructors/featureGate";
import { loadInstructorAgreementTerms } from "@/lib/instructors/contractTerm";
import { getOwnPayeeProfile } from "@/lib/payables/payeeProfiles";
import { listPaymentInstructionsForProfile } from "@/lib/payments/payeeInstructions";
import type { InstructorOnboardingFacts } from "./instructorOnboardingView";

// Reads the records the portal view is built from, for the SIGNED-IN person only (the caller passes their own id). Read-only; fails soft per source so one unreadable source never hides the rest.
export async function loadInstructorOnboardingFacts(profileId: string): Promise<InstructorOnboardingFacts> {
  const onboarding = await getStaffOnboardingByProfileId(profileId).catch(() => null);
  const [requirements, draft, terms, standards, payee, instructions] = await Promise.all([
    onboarding ? listResolvedRequirements({ onboardingId: onboarding.id, profileId, pipeline: onboarding.pipeline }).catch(() => []) : Promise.resolve([]),
    getCurrentInstructorAgreement(profileId).catch(() => null),
    loadInstructorAgreementTerms(profileId).catch(() => []),
    INSTRUCTOR_FRAMEWORK_ENABLED ? loadStandardsStateFor(profileId).catch(() => ({ state: "not_available" as const })) : Promise.resolve({ state: "not_available" as const }),
    getOwnPayeeProfile(profileId).catch(() => null),
    listPaymentInstructionsForProfile(profileId).catch(() => []),
  ]);
  const executedTerm = terms[0] ?? null;
  const identity = requirements.find((r) => r.requirementKey === "instructor_identity_verified");
  let schedules = { total: 0, approved: 0 };
  if (INSTRUCTOR_FRAMEWORK_ENABLED) {
    const { data } = await createAdminClient().from("instructor_session_schedules").select("status").eq("instructor_profile_id", profileId);
    schedules = { total: data?.length ?? 0, approved: (data ?? []).filter((r) => r.status === "approved").length };
  }
  return {
    onboarding: onboarding ? { stage: onboarding.stage, status: onboarding.status } : null,
    representativeName: null, // the onboarding-representative record needs migration 0193, which this code-only release does not depend on
    agreement: { reference: executedTerm?.reference ?? draft?.agreementReference ?? null, status: executedTerm?.status ?? draft?.status ?? null, executed: Boolean(executedTerm), effectiveDate: executedTerm && executedTerm.problems.length === 0 ? executedTerm.effectiveDate : null, expiryDate: executedTerm && executedTerm.problems.length === 0 ? executedTerm.expiryDate : null, ongoing: Boolean(executedTerm && executedTerm.problems.length === 0 && executedTerm.ongoing), copyAvailable: false },
    standards: standards.state === "acknowledged" ? { state: "acknowledged", versionLabel: standards.version.versionLabel } : standards.state === "pending" ? { state: "pending", versionLabel: standards.version.versionLabel } : { state: "not_available", versionLabel: null },
    payment: { profileExists: Boolean(payee), instructionCount: instructions.length, verifiedCount: instructions.filter((i) => i.verificationStatus === "verified").length },
    identity: { applicable: Boolean(identity), done: identity ? ["satisfied", "waived"].includes(identity.status) : false },
    schedules,
  };
}
