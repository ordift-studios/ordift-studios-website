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
  | "manage_assignments" // scope collaborators to specific entities (Photographer-tier access)
  // Payments & Finance Module (2026-08-06) — second consumer of this
  // engine, per its own doc comment above. approve/reject already exist
  // above but are deliberately not reused here: bank-transfer review is
  // its own distinct action space (it doesn't move a Portfolio-style
  // draft/pending_review/approved status), so it gets its own capability
  // names rather than overloading Portfolio's semantics.
  | "view_all_payments" // staff read access to every client's payment history, not just their own
  | "approve_bank_transfer"
  | "reject_bank_transfer"
  | "issue_refund"
  | "manage_bank_accounts"
  | "manage_currencies"
  // Sets/amends the agreed amount_due on an enquiry or workshop
  // registration — i.e. turning a mere enquiry into a payable
  // obligation (2026-08-07). Grouped with the other direct-financial-
  // consequence capabilities (issue_refund, manage_currencies), not
  // view_all_payments — same admin/super_admin-only tier.
  | "manage_project_amount"
  // TD-043 (2026-08-18) — triggers reconcilePendingGatewayPayment()
  // for a specific stuck-"pending" gateway payment: pulls Paystack's
  // own authoritative verify result and applies it exactly as the
  // customer's own status page already would. Deliberately grouped
  // with the same tier as approve/reject_bank_transfer, not the
  // higher issue_refund/manage_currencies tier — this can only ever
  // sync state with what Paystack already reports, never choose or
  // force an outcome, so it carries none of the financial-decision
  // risk those capabilities do.
  | "reconcile_payment";

// Extend as future consumers land — kept a literal union (not a bare
// `string`) so a typo in a future entity_type is a compile error, not
// a silent no-op capability check.
export type WorkflowEntityType = "portfolio_project" | "payment";

export type WorkflowCapabilityMatrix = Partial<Record<RoleSlug, WorkflowCapability[]>>;
