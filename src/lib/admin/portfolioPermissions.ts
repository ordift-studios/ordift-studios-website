import { createClient } from "@/lib/supabase/server";
import type { CurrentUser } from "@/lib/portal/roles";
import { hasRole } from "@/lib/portal/roles";
import type { WorkflowCapabilityMatrix } from "@/lib/workflow/types";

// Portfolio Management System permission matrix — approved 2026-08-04.
//
// Owner and Super Admin collapse to one tier here: the proposal's
// Owner-exclusive powers (ownership transfer, core system
// configuration) aren't portfolio concerns, so every portfolio
// capability the proposal lists for either tier applies to the
// super_admin role. `admin` is grouped in alongside it, matching how
// admin/super_admin are already treated as one "full access" tier
// everywhere else in the Admin Platform (see isStaffOrAdmin()) —
// the approved proposal never named a distinct "Admin" tier.
//
// `staff` = Editor tier: metadata/captions/SEO, never publish/
// feature/archive/delete/manage categories & collections (the
// proposal reserves those for Owner/Super Admin).
//
// `contractor` = Photographer tier: can upload and edit their own
// draft/pending_review submissions, never anyone else's, never
// publish/feature/delete published content — and only for projects
// they're explicitly assigned to (see requirePortfolioAssignment
// below), per the approved project-assignment scoping decision.
export const PORTFOLIO_CAPABILITIES: WorkflowCapabilityMatrix = {
  super_admin: [
    "upload",
    "edit_own",
    "edit_any",
    "submit",
    "approve",
    "reject",
    "publish",
    "feature",
    "archive",
    "delete",
    "manage_taxonomy",
    "manage_assignments",
  ],
  admin: [
    "upload",
    "edit_own",
    "edit_any",
    "submit",
    "approve",
    "reject",
    "publish",
    "feature",
    "archive",
    "delete",
    "manage_taxonomy",
    "manage_assignments",
  ],
  staff: ["edit_any", "submit"],
  contractor: ["upload", "edit_own", "submit"],
};

// Full admin-side Portfolio Management System (dashboard, all-projects
// list, categories/collections management) is staff/admin/super_admin
// only — same boundary as every other /admin/** module (see
// src/app/admin/layout.tsx). Contractors never see the full Admin
// Platform (0009's own doc comment); their scoped view is
// /portal/collaborator, not /admin/portfolio.
export function canAccessPortfolioAdmin(user: CurrentUser | null): boolean {
  return Boolean(
    user && (hasRole(user, "staff") || hasRole(user, "admin") || hasRole(user, "super_admin"))
  );
}

// Project-scoping check for the Photographer/contractor tier — mirrors
// private.has_workflow_access() (0023) on the app side, for contexts
// that need the answer without relying solely on RLS (e.g. deciding
// whether to render an edit action at all).
export async function isAssignedToProject(userId: string, sanityProjectId: string): Promise<boolean> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("workflow_assignments")
    .select("id")
    .eq("user_id", userId)
    .eq("entity_type", "portfolio_project")
    .eq("entity_id", sanityProjectId)
    .eq("status", "active")
    .maybeSingle();

  if (error) {
    console.error("[admin] failed to check workflow_assignments", error.message);
    return false;
  }
  return Boolean(data);
}
