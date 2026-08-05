import type { RoleSlug } from "@/lib/portal/roles";

// Generic review/approval workflow engine — first consumer is the
// Portfolio Management System (src/lib/admin/portfolioPermissions.ts,
// src/app/admin/portfolio/**), built reusable from day one so
// workshop-assignment review, talent applications, and vendor
// submissions can plug into the same engine later without touching
// this module. See supabase/migrations/0023_workflow_engine.sql for
// the Supabase side (workflow_statuses/workflow_assignments) this
// pairs with.

export type WorkflowStatus = "draft" | "pending_review" | "approved" | "published" | "archived";

export type WorkflowCapability =
  | "upload" // create a new submission
  | "edit_own" // edit a submission you authored, while still draft/pending_review
  | "edit_any" // edit any submission regardless of author, at any stage
  | "submit" // draft -> pending_review
  | "approve" // pending_review -> approved
  | "reject" // pending_review/approved -> draft (send back for revision)
  | "publish" // approved -> published
  | "feature" // toggle the independent "featured" flag on a published item
  | "archive" // published -> archived
  | "delete" // remove entirely
  | "manage_taxonomy" // categories/collections or equivalent groupings
  | "manage_assignments"; // scope collaborators to specific entities (Photographer-tier access)

// Extend as future consumers land — kept a literal union (not a bare
// `string`) so a typo in a future entity_type is a compile error, not
// a silent no-op capability check.
export type WorkflowEntityType = "portfolio_project";

export type WorkflowCapabilityMatrix = Partial<Record<RoleSlug, WorkflowCapability[]>>;
