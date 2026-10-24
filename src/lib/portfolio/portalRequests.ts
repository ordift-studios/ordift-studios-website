import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { PORTFOLIO_LIBRARY_ENABLED } from "./featureGate";
import { PERMISSION_TEXT_APPROVED } from "./permissionText";

// What the signed-in client sees: ONLY requests addressed to them and permissions they gave themselves. Read through the authenticated client, so the
// database's own row-level security (migration 0170) is the boundary, not a filter written here. Off while the portfolio library is not switched on.
export type MyRequest = { id: string; jobTitle: string; destinations: string[]; createdAt: string };
export type MyPermission = { id: string; jobTitle: string; destinations: string[]; restrictions: string | null; recordedAt: string; withdrawn: boolean };

async function titleOf(jobType: string, jobId: string): Promise<string> {
  if (jobType !== "crew_support_request") return "Your project";
  const { data } = await createAdminClient().from("crew_support_requests").select("project_name, reference_number").eq("id", jobId).maybeSingle();
  return data ? `${data.project_name as string} (${data.reference_number as string})` : "Your project";
}

export async function userHasPermissionRequests(userId: string): Promise<boolean> {
  if (!PORTFOLIO_LIBRARY_ENABLED || !PERMISSION_TEXT_APPROVED) return false;
  const { data } = await (await createClient()).from("marketing_permission_requests").select("id").eq("addressed_to", userId).limit(1);
  return (data ?? []).length > 0;
}

export async function getMyPermissionView(userId: string): Promise<{ requests: MyRequest[]; given: MyPermission[] }> {
  if (!PORTFOLIO_LIBRARY_ENABLED || !PERMISSION_TEXT_APPROVED) return { requests: [], given: [] };
  const supabase = await createClient();
  const [{ data: reqs }, { data: recs }] = await Promise.all([
    supabase.from("marketing_permission_requests").select("id, job_type, job_id, proposed_destinations, created_at, status").eq("addressed_to", userId).eq("status", "open").order("created_at", { ascending: false }),
    supabase.from("marketing_permission_records").select("id, job_type, job_id, decision, allowed_destinations, restrictions, recorded_at, supersedes_id").eq("grantor_profile_id", userId).order("seq", { ascending: false }),
  ]);
  const withdrawn = new Set((recs ?? []).filter((r) => r.decision === "withdrawn" && r.supersedes_id).map((r) => r.supersedes_id as string));
  return {
    requests: await Promise.all((reqs ?? []).map(async (r) => ({ id: r.id as string, jobTitle: await titleOf(r.job_type as string, r.job_id as string), destinations: r.proposed_destinations as string[], createdAt: r.created_at as string }))),
    given: await Promise.all((recs ?? []).filter((r) => r.decision === "granted").map(async (r) => ({ id: r.id as string, jobTitle: await titleOf(r.job_type as string, r.job_id as string), destinations: r.allowed_destinations as string[], restrictions: (r.restrictions as string | null) ?? null, recordedAt: r.recorded_at as string, withdrawn: withdrawn.has(r.id as string) }))),
  };
}
