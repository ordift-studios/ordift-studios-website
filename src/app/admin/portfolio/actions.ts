"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/portal/roles";
import { canAccessPortfolioAdmin, PORTFOLIO_CAPABILITIES } from "@/lib/admin/portfolioPermissions";
import { canToggleFeatured, canTransition, getGrantedCapabilities, hasCapability } from "@/lib/workflow/engine";
import type { WorkflowStatus } from "@/lib/workflow/types";
import {
  createPortfolioCategory,
  createPortfolioCollection,
  deletePortfolioCategory,
  deletePortfolioCollection,
  getPortfolioProjectByIdAdmin,
  setPortfolioProjectFeatured,
  setPortfolioProjectStatus,
} from "@/lib/content/sanity/portfolioAdmin";
import {
  assignPortfolioCollaborator,
  recordPortfolioWorkflowTransition,
  removePortfolioCollaborator,
} from "@/lib/admin/portfolioWorkflow";
import { logActivity } from "@/lib/admin/activityLog";

async function requirePortfolioAdmin() {
  const user = await getCurrentUser();
  if (!user || !canAccessPortfolioAdmin(user)) {
    throw new Error("Not authorized.");
  }
  return user;
}

const TRANSITION_ACTION_LABELS: Record<WorkflowStatus, string> = {
  draft: "portfolio.sent_back",
  pending_review: "portfolio.submitted",
  approved: "portfolio.approved",
  published: "portfolio.published",
  archived: "portfolio.archived",
};

export async function transitionPortfolioProjectAction(formData: FormData): Promise<void> {
  const user = await requirePortfolioAdmin();

  const id = String(formData.get("id") ?? "");
  const to = String(formData.get("to") ?? "") as WorkflowStatus;
  const reviewNotes = String(formData.get("reviewNotes") ?? "").trim();
  if (!id || !to) return;

  const project = await getPortfolioProjectByIdAdmin(id);
  if (!project) return;

  const from = project.status as WorkflowStatus;
  const granted = getGrantedCapabilities(user, PORTFOLIO_CAPABILITIES);
  if (!canTransition(from, to, granted)) {
    throw new Error("You do not have permission to make this change.");
  }

  await setPortfolioProjectStatus(id, to);

  await recordPortfolioWorkflowTransition({
    entityId: id,
    status: to,
    actorId: user.id,
    isSubmission: to === "pending_review",
    isReview: to === "approved" || to === "published" || (to === "draft" && from !== "draft"),
    reviewNotes: reviewNotes || undefined,
  });

  await logActivity({
    actorUserId: user.id,
    action: TRANSITION_ACTION_LABELS[to] ?? "portfolio.status_change",
    entityType: "portfolio_project",
    entityId: id,
    metadata: { title: project.title, from, to },
  });

  revalidatePath("/admin/portfolio");
  revalidatePath(`/admin/portfolio/${id}`);
}

export async function toggleFeaturedAction(formData: FormData): Promise<void> {
  const user = await requirePortfolioAdmin();

  const id = String(formData.get("id") ?? "");
  const next = formData.get("next") === "true";
  if (!id) return;

  const project = await getPortfolioProjectByIdAdmin(id);
  if (!project) return;

  const granted = getGrantedCapabilities(user, PORTFOLIO_CAPABILITIES);
  if (!canToggleFeatured(project.status as WorkflowStatus, granted)) {
    throw new Error("You do not have permission to change the featured flag.");
  }

  await setPortfolioProjectFeatured(id, next);

  await logActivity({
    actorUserId: user.id,
    action: next ? "portfolio.featured" : "portfolio.unfeatured",
    entityType: "portfolio_project",
    entityId: id,
    metadata: { title: project.title },
  });

  revalidatePath("/admin/portfolio");
  revalidatePath(`/admin/portfolio/${id}`);
}

export async function assignCollaboratorAction(formData: FormData): Promise<void> {
  const user = await requirePortfolioAdmin();
  if (!hasCapability(user, PORTFOLIO_CAPABILITIES, "manage_assignments")) throw new Error("Not authorized.");

  const entityId = String(formData.get("entityId") ?? "");
  const userId = String(formData.get("userId") ?? "");
  if (!entityId || !userId) return;

  await assignPortfolioCollaborator(entityId, userId, user.id);
  await logActivity({
    actorUserId: user.id,
    action: "portfolio.collaborator_assigned",
    entityType: "portfolio_project",
    entityId,
    metadata: { userId },
  });
  revalidatePath(`/admin/portfolio/${entityId}`);
}

export async function removeCollaboratorAction(formData: FormData): Promise<void> {
  const user = await requirePortfolioAdmin();
  if (!hasCapability(user, PORTFOLIO_CAPABILITIES, "manage_assignments")) throw new Error("Not authorized.");

  const assignmentId = String(formData.get("assignmentId") ?? "");
  const entityId = String(formData.get("entityId") ?? "");
  if (!assignmentId) return;

  await removePortfolioCollaborator(assignmentId, user.id);
  await logActivity({
    actorUserId: user.id,
    action: "portfolio.collaborator_removed",
    entityType: "portfolio_project",
    entityId,
  });
  if (entityId) revalidatePath(`/admin/portfolio/${entityId}`);
}

export async function createPortfolioCategoryAction(formData: FormData): Promise<void> {
  const user = await requirePortfolioAdmin();
  if (!hasCapability(user, PORTFOLIO_CAPABILITIES, "manage_taxonomy")) throw new Error("Not authorized.");

  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  if (!name) return;

  await createPortfolioCategory(name, description);
  await logActivity({ actorUserId: user.id, action: "portfolio.category_created", metadata: { name } });
  revalidatePath("/admin/portfolio/categories");
}

export async function deletePortfolioCategoryAction(formData: FormData): Promise<void> {
  const user = await requirePortfolioAdmin();
  if (!hasCapability(user, PORTFOLIO_CAPABILITIES, "manage_taxonomy")) throw new Error("Not authorized.");

  const id = String(formData.get("id") ?? "");
  if (!id) return;

  await deletePortfolioCategory(id);
  await logActivity({ actorUserId: user.id, action: "portfolio.category_deleted", metadata: { id } });
  revalidatePath("/admin/portfolio/categories");
}

export async function createPortfolioCollectionAction(formData: FormData): Promise<void> {
  const user = await requirePortfolioAdmin();
  if (!hasCapability(user, PORTFOLIO_CAPABILITIES, "manage_taxonomy")) throw new Error("Not authorized.");

  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const isOrdered = formData.get("isOrdered") === "on";
  if (!name) return;

  await createPortfolioCollection(name, description, isOrdered);
  await logActivity({ actorUserId: user.id, action: "portfolio.collection_created", metadata: { name } });
  revalidatePath("/admin/portfolio/collections");
}

export async function deletePortfolioCollectionAction(formData: FormData): Promise<void> {
  const user = await requirePortfolioAdmin();
  if (!hasCapability(user, PORTFOLIO_CAPABILITIES, "manage_taxonomy")) throw new Error("Not authorized.");

  const id = String(formData.get("id") ?? "");
  if (!id) return;

  await deletePortfolioCollection(id);
  await logActivity({ actorUserId: user.id, action: "portfolio.collection_deleted", metadata: { id } });
  revalidatePath("/admin/portfolio/collections");
}
