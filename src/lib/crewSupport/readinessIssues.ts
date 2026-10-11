import { createAdminClient } from "@/lib/supabase/admin";
import { logActivityAsSystem } from "@/lib/admin/activityLog";
import type { CurrentUser } from "@/lib/portal/roles";
import { getCrewAssignmentForEngagement } from "./crewOffers";
import { canManageCrewSupport } from "./permissions";
import { independentOfAssignee, managementIssueTransition, professionalMayRespond, validateMessage, type IssueAction } from "./readinessRules";

// Management and professional actions on a readiness issue. Everything is appended to the issue's event trail
// (the audit record AND the message thread). Internal notes are management-only and never reach the
// professional; the professional may reply and report "resolved" but never closes an issue.

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

type IssueRow = { id: string; status: string; readiness_id: string };

async function loadIssueWithAssignee(issueId: string): Promise<{ issue: IssueRow; assigneeId: string | null; engagementId: string; requestId: string } | null> {
  const admin = createAdminClient();
  const { data: issue } = await admin.from("assignment_readiness_issues").select("id, status, readiness_id").eq("id", issueId).maybeSingle();
  if (!issue) return null;
  const { data: rd } = await admin.from("assignment_readiness").select("engagement_id, request_id").eq("id", issue.readiness_id as string).maybeSingle();
  if (!rd) return null;
  const { data: eng } = await admin.from("engagements").select("payee_profile_id").eq("id", rd.engagement_id as string).maybeSingle();
  return { issue: issue as IssueRow, assigneeId: (eng?.payee_profile_id as string | null) ?? null, engagementId: rd.engagement_id as string, requestId: rd.request_id as string };
}

async function addEvent(issueId: string, e: { event: string; visibility: "shared" | "internal"; actorId: string | null; actorRole: "management" | "professional" | "system"; body?: string | null }) {
  const { error } = await createAdminClient().from("assignment_readiness_issue_events").insert({ issue_id: issueId, event: e.event, visibility: e.visibility, actor_id: e.actorId, actor_role: e.actorRole, body: e.body ?? null });
  if (error) console.error("[readiness] issue event insert failed", error.message);
}

const EVENT_FOR: Record<IssueAction, string> = { acknowledge: "acknowledged", start_action: "action_started", request_confirmation: "confirmation_requested", resolve: "resolved", reopen: "reopened" };

// Optimistic: the UPDATE only applies if the issue is still in the state we validated against.
async function moveIssue(issueId: string, from: string, patch: Record<string, unknown>): Promise<boolean> {
  const { data, error } = await createAdminClient().from("assignment_readiness_issues").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", issueId).eq("status", from).select("id");
  if (error) console.error("[readiness] issue update failed", error.message);
  return !error && (data?.length ?? 0) === 1;
}

export async function manageIssue(params: { issueId: string; user: CurrentUser; action: IssueAction; note?: string; sharedMessage?: string }): Promise<Result> {
  if (!canManageCrewSupport(params.user)) return { ok: false, error: "You don't have permission to manage Crew Support." };
  const ctx = await loadIssueWithAssignee(params.issueId);
  if (!ctx) return { ok: false, error: "Issue not found." };
  const own = independentOfAssignee(params.user.id, ctx.assigneeId);
  if (own) return { ok: false, error: own };
  const t = managementIssueTransition(ctx.issue.status, params.action);
  if (!t.ok) return t;
  const note = (params.note ?? "").trim();
  if (params.action === "resolve" && note.length < 5) return { ok: false, error: "Record how it was resolved (at least 5 characters)." };
  if (params.action === "reopen" && note.length < 5) return { ok: false, error: "Say why you are reopening it (at least 5 characters)." };
  const shared = validateMessage(params.sharedMessage ?? "", false);
  if (!shared.ok) return shared;

  const patch: Record<string, unknown> = { status: t.to };
  const now = new Date().toISOString();
  if (params.action === "acknowledge") Object.assign(patch, { acknowledged_by: params.user.id, acknowledged_at: now });
  if (params.action === "start_action") Object.assign(patch, { acknowledged_by: params.user.id, acknowledged_at: now });
  if (params.action === "request_confirmation") Object.assign(patch, { professional_confirmed_at: null });
  if (params.action === "resolve") Object.assign(patch, { resolved_by: params.user.id, resolved_at: now, resolution_note: note });
  if (params.action === "reopen") Object.assign(patch, { resolved_by: null, resolved_at: null, resolution_note: null, professional_reported_resolved_at: null, professional_confirmed_at: null });
  if (!(await moveIssue(ctx.issue.id, ctx.issue.status, patch))) return { ok: false, error: "That issue changed while you were updating it — refresh and try again." };

  // the short message the professional sees is separate from any internal note
  await addEvent(ctx.issue.id, { event: EVENT_FOR[params.action], visibility: "shared", actorId: params.user.id, actorRole: "management", body: shared.body || null });
  if (note && params.action !== "resolve") await addEvent(ctx.issue.id, { event: "message", visibility: "internal", actorId: params.user.id, actorRole: "management", body: note });
  if (params.action === "resolve") await addEvent(ctx.issue.id, { event: "message", visibility: "internal", actorId: params.user.id, actorRole: "management", body: `Resolution: ${note}` });
  await logActivityAsSystem({ actorUserId: params.user.id, action: `assignment_readiness.issue_${EVENT_FOR[params.action]}`, entityType: "engagement", entityId: ctx.engagementId, metadata: { issueId: ctx.issue.id, from: ctx.issue.status, to: t.to } });
  return { ok: true };
}

export async function postIssueMessage(params: { issueId: string; user: CurrentUser; visibility: "shared" | "internal"; body: string }): Promise<Result> {
  if (!canManageCrewSupport(params.user)) return { ok: false, error: "You don't have permission to manage Crew Support." };
  const ctx = await loadIssueWithAssignee(params.issueId);
  if (!ctx) return { ok: false, error: "Issue not found." };
  const own = independentOfAssignee(params.user.id, ctx.assigneeId);
  if (own) return { ok: false, error: own };
  const m = validateMessage(params.body);
  if (!m.ok) return m;
  await addEvent(ctx.issue.id, { event: "message", visibility: params.visibility, actorId: params.user.id, actorRole: "management", body: m.body });
  await logActivityAsSystem({ actorUserId: params.user.id, action: "assignment_readiness.issue_message", entityType: "engagement", entityId: ctx.engagementId, metadata: { issueId: ctx.issue.id, visibility: params.visibility } });
  return { ok: true };
}

export async function assignFollowUp(params: { issueId: string; user: CurrentUser; assignedTo: string | null; followUpAction: string }): Promise<Result> {
  if (!canManageCrewSupport(params.user)) return { ok: false, error: "You don't have permission to manage Crew Support." };
  const ctx = await loadIssueWithAssignee(params.issueId);
  if (!ctx) return { ok: false, error: "Issue not found." };
  const own = independentOfAssignee(params.user.id, ctx.assigneeId);
  if (own) return { ok: false, error: own };
  if (ctx.issue.status === "resolved") return { ok: false, error: "This issue is already resolved." };
  const action = params.followUpAction.trim();
  if (action.length > 500) return { ok: false, error: "Keep the follow-up action to 500 characters." };
  if (params.assignedTo && params.assignedTo === ctx.assigneeId) return { ok: false, error: "Follow-up can't be assigned to the professional the issue is about." };
  const { error } = await createAdminClient().from("assignment_readiness_issues").update({ assigned_to: params.assignedTo, follow_up_action: action || null, updated_at: new Date().toISOString() }).eq("id", ctx.issue.id);
  if (error) return { ok: false, error: "Could not save the follow-up." };
  await addEvent(ctx.issue.id, { event: "follow_up_assigned", visibility: "internal", actorId: params.user.id, actorRole: "management", body: action || null });
  await logActivityAsSystem({ actorUserId: params.user.id, action: "assignment_readiness.issue_follow_up", entityType: "engagement", entityId: ctx.engagementId, metadata: { issueId: ctx.issue.id, assignedTo: params.assignedTo } });
  return { ok: true };
}

// ---- the professional's side
export async function professionalIssueAction(params: { issueId: string; userId: string; action: "reply" | "report_resolved"; body: string }): Promise<Result> {
  const ctx = await loadIssueWithAssignee(params.issueId);
  if (!ctx || !ctx.assigneeId || ctx.assigneeId !== params.userId || !(await getCrewAssignmentForEngagement(ctx.engagementId, params.userId))) return { ok: false, error: "Only the professional this issue is about can reply to it." };
  if (!professionalMayRespond(ctx.issue.status)) return { ok: false, error: "This issue is already resolved." };
  const m = validateMessage(params.body, params.action === "reply");
  if (!m.ok) return m;
  if (params.action === "reply") {
    await addEvent(ctx.issue.id, { event: "message", visibility: "shared", actorId: params.userId, actorRole: "professional", body: m.body });
  } else {
    // Reports the issue is sorted. It does NOT close it: management verifies and closes.
    const now = new Date().toISOString();
    const patch: Record<string, unknown> = { professional_reported_resolved_at: now, updated_at: now };
    if (ctx.issue.status === "awaiting_professional") patch.professional_confirmed_at = now;
    const { error } = await createAdminClient().from("assignment_readiness_issues").update(patch).eq("id", ctx.issue.id).eq("status", ctx.issue.status);
    if (error) return { ok: false, error: "Could not record that." };
    await addEvent(ctx.issue.id, { event: "professional_reported_resolved", visibility: "shared", actorId: params.userId, actorRole: "professional", body: m.body || "The professional reports this is now sorted — management to verify and close." });
  }
  await logActivityAsSystem({ actorUserId: params.userId, action: params.action === "reply" ? "assignment_readiness.issue_reply" : "assignment_readiness.issue_reported_resolved", entityType: "engagement", entityId: ctx.engagementId, metadata: { issueId: ctx.issue.id } });
  return { ok: true };
}
