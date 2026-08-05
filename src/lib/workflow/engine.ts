import type { CurrentUser } from "@/lib/portal/roles";
import type { WorkflowCapability, WorkflowCapabilityMatrix, WorkflowStatus } from "./types";

type Transition = { to: WorkflowStatus; capability: WorkflowCapability };

// The approved lifecycle: Draft -> Pending Review -> Approved ->
// Published -> Archived, with "reject" as the revision path back to
// Draft from either review stage, and "Featured" deliberately NOT a
// stage here — it's an independent flag checked separately
// (canToggleFeatured), so a published item doesn't have to leave
// "published" to become featured or vice versa. "Scheduled" isn't a
// distinct status either: a published item with a future
// scheduledFor stays hidden from the public site until that time
// (see portfolioVisibilityFilter in src/lib/content/sanity/queries.ts)
// — same pattern already used for Journal/Pulse, so no extra state
// or cron job is needed for it.
const TRANSITIONS: Record<WorkflowStatus, Transition[]> = {
  draft: [{ to: "pending_review", capability: "submit" }],
  pending_review: [
    { to: "approved", capability: "approve" },
    { to: "draft", capability: "reject" },
  ],
  approved: [
    { to: "published", capability: "publish" },
    { to: "draft", capability: "reject" },
  ],
  published: [{ to: "archived", capability: "archive" }],
  archived: [{ to: "draft", capability: "edit_any" }],
};

export function allowedTransitions(from: WorkflowStatus): Transition[] {
  return TRANSITIONS[from] ?? [];
}

export function canTransition(
  from: WorkflowStatus,
  to: WorkflowStatus,
  grantedCapabilities: WorkflowCapability[]
): boolean {
  return allowedTransitions(from).some((t) => t.to === to && grantedCapabilities.includes(t.capability));
}

export function canToggleFeatured(status: WorkflowStatus, grantedCapabilities: WorkflowCapability[]): boolean {
  return status === "published" && grantedCapabilities.includes("feature");
}

// Union of every capability granted by any role the user holds — a
// user with multiple roles (e.g. Staff + Contractor) gets the union,
// same "any matching role wins" principle as hasRole()/isStaffOrAdmin()
// elsewhere in the portal auth layer.
export function getGrantedCapabilities(
  user: CurrentUser | null,
  matrix: WorkflowCapabilityMatrix
): WorkflowCapability[] {
  if (!user) return [];
  const granted = new Set<WorkflowCapability>();
  for (const role of user.roles) {
    for (const capability of matrix[role] ?? []) granted.add(capability);
  }
  return [...granted];
}

export function hasCapability(
  user: CurrentUser | null,
  matrix: WorkflowCapabilityMatrix,
  capability: WorkflowCapability
): boolean {
  return getGrantedCapabilities(user, matrix).includes(capability);
}
