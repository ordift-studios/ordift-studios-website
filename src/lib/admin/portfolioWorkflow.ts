import { createClient } from "@/lib/supabase/server";

// Supabase-side companion to the Sanity portfolioProject.status field
// (supabase/migrations/0023_workflow_engine.sql, workflow_statuses
// table). Sanity's own `status` field stays authoritative for what's
// publicly visible — every status change goes through
// setPortfolioProjectStatus() (src/lib/content/sanity/portfolioAdmin.ts)
// first. This table exists purely for review metadata Sanity has no
// fields for (who submitted, who reviewed, review notes, when) —
// keeping the Sanity schema focused on content, not admin bookkeeping.

const ENTITY_TYPE = "portfolio_project";

export type PortfolioWorkflowRow = {
  entityId: string;
  status: string;
  submittedBy: string | null;
  submittedAt: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
  reviewNotes: string | null;
};

export async function getPortfolioWorkflowStatus(entityId: string): Promise<PortfolioWorkflowRow | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("workflow_statuses")
    .select("entity_id, status, submitted_by, submitted_at, reviewed_by, reviewed_at, review_notes")
    .eq("entity_type", ENTITY_TYPE)
    .eq("entity_id", entityId)
    .maybeSingle();

  if (error) {
    console.error("[admin] failed to load workflow_statuses", error.message);
    return null;
  }
  if (!data) return null;

  return {
    entityId: data.entity_id,
    status: data.status,
    submittedBy: data.submitted_by,
    submittedAt: data.submitted_at,
    reviewedBy: data.reviewed_by,
    reviewedAt: data.reviewed_at,
    reviewNotes: data.review_notes,
  };
}

// Best-effort, same principle as logActivity(): the Sanity status
// patch (source of truth for what renders publicly) must already have
// succeeded by the time this is called — a failure here should never
// roll that back or block the action, only leave the review-metadata
// companion record out of sync until the next transition retries it.
export async function recordPortfolioWorkflowTransition(params: {
  entityId: string;
  status: string;
  actorId: string;
  isSubmission?: boolean; // stamps submitted_by/submitted_at (moving into pending_review)
  isReview?: boolean; // stamps reviewed_by/reviewed_at (approve/reject/publish)
  reviewNotes?: string;
}): Promise<void> {
  const supabase = await createClient();
  const existing = await getPortfolioWorkflowStatus(params.entityId);
  const now = new Date().toISOString();

  const row = {
    entity_type: ENTITY_TYPE,
    entity_id: params.entityId,
    status: params.status,
    submitted_by: params.isSubmission ? params.actorId : (existing?.submittedBy ?? null),
    submitted_at: params.isSubmission ? now : (existing?.submittedAt ?? null),
    reviewed_by: params.isReview ? params.actorId : (existing?.reviewedBy ?? null),
    reviewed_at: params.isReview ? now : (existing?.reviewedAt ?? null),
    review_notes: params.reviewNotes ?? existing?.reviewNotes ?? null,
  };

  const { error } = existing
    ? await supabase.from("workflow_statuses").update(row).eq("entity_type", ENTITY_TYPE).eq("entity_id", params.entityId)
    : await supabase.from("workflow_statuses").insert(row);

  if (error) {
    console.error("[admin] failed to record workflow_statuses transition", error.message);
  }
}

export type PortfolioAssignment = {
  id: string;
  userId: string;
  fullName: string | null;
};

// Active (Photographer-tier) collaborator assignments for one project —
// backs both the Admin Portal's "assign a collaborator" panel and, once
// built, a contractor's own scoped view (private.has_workflow_access(),
// 0023, is what actually enforces the RLS boundary; this is just a
// read for display).
export async function listPortfolioAssignments(entityId: string): Promise<PortfolioAssignment[]> {
  const supabase = await createClient();
  // workflow_assignments has three FKs to profiles (user_id, assigned_by,
  // removed_by) — the embed must name which one, or PostgREST rejects the
  // query as ambiguous. Found live testing this page (2026-08-05).
  const { data, error } = await supabase
    .from("workflow_assignments")
    .select("id, user_id, profiles!workflow_assignments_user_id_fkey(full_name)")
    .eq("entity_type", ENTITY_TYPE)
    .eq("entity_id", entityId)
    .eq("status", "active");

  if (error) {
    console.error("[admin] failed to load workflow_assignments", error.message);
    return [];
  }

  return (data ?? []).map((row) => ({
    id: row.id,
    userId: row.user_id,
    fullName: (row.profiles as unknown as { full_name: string | null } | null)?.full_name ?? null,
  }));
}

export async function assignPortfolioCollaborator(entityId: string, userId: string, assignedBy: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("workflow_assignments")
    .insert({ entity_type: ENTITY_TYPE, entity_id: entityId, user_id: userId, assigned_by: assignedBy });
  if (error) {
    console.error("[admin] failed to insert workflow_assignments", error.message);
  }
}

export async function removePortfolioCollaborator(assignmentId: string, removedBy: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("workflow_assignments")
    .update({ status: "removed", removed_at: new Date().toISOString(), removed_by: removedBy })
    .eq("id", assignmentId);
  if (error) {
    console.error("[admin] failed to remove workflow_assignments row", error.message);
  }
}
