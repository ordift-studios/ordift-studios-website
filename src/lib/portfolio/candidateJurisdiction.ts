import { createAdminClient } from "@/lib/supabase/admin";
import { logActivity } from "@/lib/admin/activityLog";
import type { CurrentUser } from "@/lib/portal/roles";
import { isManagementUser } from "@/lib/crewSupport/management";
import { PORTFOLIO_LIBRARY_ENABLED } from "./featureGate";
import { SUBJECT_PERMISSIONS_ENABLED } from "./subjectGate";
import { addPortfolioCandidates } from "./library";
import { ORIGINS } from "./subjectRules";

// Records where a photograph originates (candidate.jurisdiction). Only this one column is written. Needed before a child can be listed on a photograph; an unknown origin is treated as Qatar by the interim restriction.
export async function setCandidateOrigin(user: CurrentUser, fileId: string, origin: string): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!PORTFOLIO_LIBRARY_ENABLED || !SUBJECT_PERMISSIONS_ENABLED) return { ok: false, error: "Recording permission evidence for people shown is not switched on yet." };
  if (!(await isManagementUser(user))) return { ok: false, error: "Only the Founder or an authorised executive admin can do this." };
  if (!ORIGINS.some((o) => o.key === origin)) return { ok: false, error: "Choose Ghana, Qatar or elsewhere." };
  const added = await addPortfolioCandidates(user, [fileId], "job_page"); if (!added.ok) return added;
  const { data, error } = await createAdminClient().from("portfolio_candidates").update({ jurisdiction: origin }).eq("project_file_id", fileId).select("id");
  if (error || !data?.length) return { ok: false, error: "The origin could not be saved." };
  await logActivity({ actorUserId: user.id, action: "portfolio.origin_recorded", entityType: "project_file", entityId: fileId, metadata: { origin } });
  return { ok: true };
}
