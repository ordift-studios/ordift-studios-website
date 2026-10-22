import { getEngagementTypeSlug } from "@/lib/organization/engagementTypeLookup";
import { hasFullyExecutedAgreement } from "@/lib/legal/agreementEngine";

// Eligibility gate (Founder decision, 2026-10-23): a person classified as an Instructor may not be assigned to real workshop work until
// their Instructor / Workshop Facilitator Agreement (OS-LGL-010) is genuinely executed. Test agreements never count. People of other
// engagement types (for example employees facilitating internally, who are covered by their own agreements) are not affected.
// Returns a refusal message, or null when the assignment may proceed. Every path that assigns an instructor must call this.
export async function instructorAssignmentRefusal(profileId: string | null | undefined): Promise<string | null> {
  if (!profileId) return null;
  if ((await getEngagementTypeSlug(profileId)) !== "instructor") return null;
  const executed = await hasFullyExecutedAgreement({ canonicalCode: "OS-LGL-010", primaryContextType: "instructor_profile", primaryContextReference: profileId });
  return executed ? null : "This instructor cannot be assigned yet: their Instructor / Workshop Facilitator Agreement (OS-LGL-010) is not fully executed.";
}
