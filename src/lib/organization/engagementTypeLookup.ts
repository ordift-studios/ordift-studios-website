import { createAdminClient } from "@/lib/supabase/admin";

// A person's engagement type (instructor, employee, freelancer ...) lives on staff_details, exactly as onboardingRequirements.ts resolves it
// (there is no engagement_type_id on profiles).
export async function getEngagementTypeSlug(profileId: string): Promise<string | null> {
  const admin = createAdminClient();
  const { data: sd } = await admin.from("staff_details").select("engagement_type_id").eq("id", profileId).maybeSingle();
  if (!sd?.engagement_type_id) return null;
  const { data: t } = await admin.from("engagement_types").select("slug").eq("id", sd.engagement_type_id as string).maybeSingle();
  return (t?.slug as string | null) ?? null;
}
