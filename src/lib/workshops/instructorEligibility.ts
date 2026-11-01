import { getEngagementTypeSlug } from "@/lib/organization/engagementTypeLookup";
import { hasFullyExecutedAgreement } from "@/lib/legal/agreementEngine";
import { INSTRUCTOR_FRAMEWORK_ENABLED } from "@/lib/instructors/featureGate";
import { instructorStandardsRefusal } from "@/lib/instructors/standards";

// Eligibility gate (Founder decision, 2026-10-23): a person classified as an Instructor may not be assigned to real workshop work until
// their Instructor / Workshop Facilitator Agreement (OS-LGL-010) is genuinely executed. Test agreements never count. People of other
// engagement types (for example employees facilitating internally, who are covered by their own agreements) are not affected.
// Returns a refusal message, or null when the assignment may proceed. (Approving a specific assignment additionally needs an approved Session Schedule and Rights Matrix - src/lib/instructors/assignments.ts.) Every path that assigns an instructor must call this.
export async function instructorAssignmentRefusal(profileId: string | null | undefined): Promise<string | null> {
  if (!profileId) return null;
  if ((await getEngagementTypeSlug(profileId)) !== "instructor") return null;
  const executed = await hasFullyExecutedAgreement({ canonicalCode: "OS-LGL-010", primaryContextType: "instructor_profile", primaryContextReference: profileId });
  if (!executed) return "This instructor cannot be assigned yet: their Instructor / Workshop Facilitator Agreement (OS-LGL-010) is not fully executed.";
  // A signed agreement alone is not enough: the adopted Independent Instructor Standards must also be acknowledged (framework enabled by migration 0180; fails closed).
  if (INSTRUCTOR_FRAMEWORK_ENABLED) return instructorStandardsRefusal(profileId);
  return null;
}
