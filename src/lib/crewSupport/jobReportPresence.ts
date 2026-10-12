import { createAdminClient } from "@/lib/supabase/admin";

// READ-ONLY. Has the assigned professional already reported this work? Readiness uses the answer only to refuse enrolment and to stop
// reminders for work that is done; it never writes to, or changes, a job report.
export async function hasSubmittedJobReport(engagementId: string): Promise<boolean> {
  const { count } = await createAdminClient().from("assignment_reports").select("id", { count: "exact", head: true }).eq("engagement_id", engagementId);
  return (count ?? 0) > 0;
}
