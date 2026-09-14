import { createAdminClient } from "@/lib/supabase/admin";
import { logActivity } from "@/lib/admin/activityLog";
import { isSuperAdminId, hasJurisdictionAuthority } from "@/lib/organization/authority";

// Ordift Studios Compliance/COMP-SYS-1, Phase B4 Step 4 (2026-09-14) —
// appeals against a decided outcome (a disciplinary action, a grievance
// resolution, or any other decided-outcome record). appealedDecisionType/
// appealedDecisionReference is the same polymorphic pointer pattern
// already proven for agreements.primary_context_type/reference
// (src/lib/legal/agreementEngine.ts).

async function canDecideAppeals(actorUserId: string): Promise<boolean> {
  if (await isSuperAdminId(actorUserId)) return true;
  return hasJurisdictionAuthority(actorUserId, "operations", "administer");
}

// filingDeadline reflects OS-HR-GH-004 6.2's normal 5-working-day
// target where the caller supplies the decision date; calendar days
// are used (see grievances.ts submitGrievance for the same, deliberate
// caveat — no working-calendar table exists yet). Passing no
// decisionDate leaves filingDeadline null rather than guessing one.
export function computeAppealFilingDeadline(decisionDateIso: string | null): string | null {
  if (!decisionDateIso) return null;
  const deadline = new Date(decisionDateIso);
  deadline.setUTCDate(deadline.getUTCDate() + 5);
  return deadline.toISOString();
}

export async function submitAppeal(params: {
  profileId: string;
  appealedDecisionType: string;
  appealedDecisionReference: string;
  reason: string;
  decisionDate?: string | null;
  lateSubmissionApproved?: boolean;
  actorUserId: string;
}): Promise<{ ok: true; appealId: string } | { ok: false; error: string }> {
  const isSelf = params.actorUserId === params.profileId;
  if (!isSelf && !(await canDecideAppeals(params.actorUserId))) {
    return { ok: false, error: "Not authorized to file an appeal on behalf of another person." };
  }
  if (!params.reason.trim()) return { ok: false, error: "A reason is required." };

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("appeals")
    .insert({
      profile_id: params.profileId,
      appealed_decision_type: params.appealedDecisionType,
      appealed_decision_reference: params.appealedDecisionReference,
      reason: params.reason,
      filing_deadline: computeAppealFilingDeadline(params.decisionDate ?? null),
      late_submission_approved: params.lateSubmissionApproved ?? false,
    })
    .select("id")
    .single();
  if (error || !data) return { ok: false, error: error?.message ?? "Failed to submit the appeal." };

  await logActivity({ actorUserId: params.actorUserId, action: "appeal.submitted", entityType: "appeal", entityId: data.id, metadata: { appealedDecisionType: params.appealedDecisionType, appealedDecisionReference: params.appealedDecisionReference } });
  return { ok: true, appealId: data.id };
}

export type AppealDecision = "upheld" | "overturned" | "partially_upheld";

export async function decideAppeal(params: { appealId: string; decision: AppealDecision; decisionNotes: string; actorUserId: string }): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!(await canDecideAppeals(params.actorUserId))) {
    return { ok: false, error: "Not authorized to decide an appeal." };
  }
  if (!params.decisionNotes.trim()) return { ok: false, error: "Decision notes are required." };

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("appeals")
    .update({ status: params.decision, decision_notes: params.decisionNotes, decided_at: new Date().toISOString(), reviewer_id: params.actorUserId })
    .eq("id", params.appealId)
    .in("status", ["submitted", "under_review"])
    .select("id")
    .maybeSingle();
  if (error) return { ok: false, error: "Failed to decide the appeal." };
  if (!data) return { ok: false, error: "Appeal not found, or already decided." };

  await logActivity({ actorUserId: params.actorUserId, action: "appeal.decided", entityType: "appeal", entityId: params.appealId, metadata: { decision: params.decision } });
  return { ok: true };
}

export async function listAppealsForProfile(profileId: string): Promise<{ id: string; appealedDecisionType: string; appealedDecisionReference: string; status: string; submittedAt: string }[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("appeals")
    .select("id, appealed_decision_type, appealed_decision_reference, status, submitted_at")
    .eq("profile_id", profileId)
    .order("submitted_at", { ascending: false });
  if (error) {
    console.error("[organization] failed to load appeals", error.message);
    return [];
  }
  return (data ?? []).map((r) => ({
    id: r.id,
    appealedDecisionType: r.appealed_decision_type,
    appealedDecisionReference: r.appealed_decision_reference,
    status: r.status,
    submittedAt: r.submitted_at,
  }));
}
