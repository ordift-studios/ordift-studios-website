"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/portal/roles";
import {
  canAccessPortfolioAdmin,
  canCreatePortfolioProjectsNatively,
  PORTFOLIO_CAPABILITIES,
} from "@/lib/admin/portfolioPermissions";
import { canToggleFeatured, canTransition, getGrantedCapabilities, hasCapability } from "@/lib/workflow/engine";
import type { WorkflowStatus } from "@/lib/workflow/types";
import { getPublishReadiness } from "@/lib/admin/portfolioValidation";
import {
  createPortfolioCategory,
  createPortfolioCollection,
  createPortfolioProjectDraft,
  deletePortfolioCategory,
  deletePortfolioCollection,
  deletePortfolioProjectFully,
  getPortfolioProjectByIdAdmin,
  isSlugAvailable,
  patchPortfolioProject,
  setPortfolioProjectFeatured,
  setPortfolioProjectStatus,
} from "@/lib/content/sanity/portfolioAdmin";
import {
  assignPortfolioCollaborator,
  deletePortfolioWorkflowData,
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

async function requireNativeCreator() {
  const user = await getCurrentUser();
  if (!user || !canCreatePortfolioProjectsNatively(user)) {
    throw new Error("Not authorized.");
  }
  return user;
}

export type ActionResult = { ok: true } | { ok: false; error: string };
export type ActionResultWithId = { ok: true; id: string } | { ok: false; error: string };

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

  // Publish Readiness Checklist enforcement (2026-08-05) — re-checked
  // here, not just shown in the wizard's Review step, so a request
  // crafted outside the UI can't skip it. Only blocking items stop the
  // transition; warnings are informational only (see
  // src/lib/admin/portfolioValidation.ts).
  if (to === "pending_review" || to === "published") {
    const readiness = getPublishReadiness(project, {
      skipAltTextCheck: hasCapability(user, PORTFOLIO_CAPABILITIES, "publish"),
    });
    if (readiness.blocking.length > 0) {
      throw new Error(`Not ready: ${readiness.blocking.join(" ")}`);
    }
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

// ============================================================
// Native project creation/editing (2026-08-05) — called directly as
// plain async functions from PortfolioProjectForm.tsx (a Client
// Component), not via <form action>, so they take typed arguments and
// return a discriminated result instead of throwing on user-facing
// failures (a missing/duplicate slug is not a permission error, and
// deserves an inline message, not a Next.js error boundary). All still
// gated Super-Admin-only via requireNativeCreator() — capability checks
// happen here, server-side, regardless of what the client UI shows or
// hides.
// ============================================================

export async function createProjectDraftAction(title: string, slug: string): Promise<ActionResultWithId> {
  const user = await requireNativeCreator();

  const trimmedTitle = title.trim();
  const trimmedSlug = slug.trim();
  if (!trimmedTitle || !trimmedSlug) {
    return { ok: false, error: "Title and slug are both required." };
  }
  if (!(await isSlugAvailable(trimmedSlug))) {
    return { ok: false, error: "That slug is already in use by another project." };
  }

  const id = await createPortfolioProjectDraft(trimmedTitle, trimmedSlug);

  await logActivity({
    actorUserId: user.id,
    action: "portfolio.created",
    entityType: "portfolio_project",
    entityId: id,
    metadata: { title: trimmedTitle },
  });

  revalidatePath("/admin/portfolio");
  return { ok: true, id };
}

export async function checkSlugAvailableAction(slug: string, excludeId?: string): Promise<boolean> {
  await requireNativeCreator();
  const trimmed = slug.trim();
  if (!trimmed) return false;
  return isSlugAvailable(trimmed, excludeId);
}

// `fields` is a raw Sanity-shaped partial document, built by the wizard
// (see PortfolioProjectForm.tsx's toSanityFields()). Re-validates slug
// uniqueness server-side if the slug is part of this save, since the
// wizard's own live check can't fully protect against a race between
// two tabs/editors.
export async function saveProjectFieldsAction(id: string, fields: Record<string, unknown>): Promise<ActionResult> {
  const user = await requireNativeCreator();

  const slugField = fields.slug as { current?: string } | undefined;
  if (slugField?.current) {
    if (!(await isSlugAvailable(slugField.current, id))) {
      return { ok: false, error: "That slug is already in use by another project." };
    }
  }

  await patchPortfolioProject(id, fields);

  await logActivity({
    actorUserId: user.id,
    action: "portfolio.updated",
    entityType: "portfolio_project",
    entityId: id,
    metadata: { fields: Object.keys(fields) },
  });

  revalidatePath(`/admin/portfolio/${id}`);
  revalidatePath(`/admin/portfolio/${id}/edit`);
  return { ok: true };
}

// Returns the new document's id so the wizard can auto-select it — the
// existing createPortfolioCategoryAction/createPortfolioCollectionAction
// (FormData-shaped, no return value) stay as-is for the standalone
// /admin/portfolio/categories & /collections pages; these are the
// wizard's own "create inline while filling the form" path.
export async function createCategoryInlineAction(name: string): Promise<ActionResultWithId> {
  const user = await requirePortfolioAdmin();
  if (!hasCapability(user, PORTFOLIO_CAPABILITIES, "manage_taxonomy")) {
    return { ok: false, error: "Not authorized." };
  }
  const trimmed = name.trim();
  if (!trimmed) return { ok: false, error: "Name is required." };
  const id = await createPortfolioCategory(trimmed, "");
  await logActivity({ actorUserId: user.id, action: "portfolio.category_created", metadata: { name: trimmed } });
  revalidatePath("/admin/portfolio/categories");
  return { ok: true, id };
}

export async function createCollectionInlineAction(name: string): Promise<ActionResultWithId> {
  const user = await requirePortfolioAdmin();
  if (!hasCapability(user, PORTFOLIO_CAPABILITIES, "manage_taxonomy")) {
    return { ok: false, error: "Not authorized." };
  }
  const trimmed = name.trim();
  if (!trimmed) return { ok: false, error: "Name is required." };
  const id = await createPortfolioCollection(trimmed, "", false);
  await logActivity({ actorUserId: user.id, action: "portfolio.collection_created", metadata: { name: trimmed } });
  revalidatePath("/admin/portfolio/collections");
  return { ok: true, id };
}

export async function deletePortfolioProjectAction(id: string, title: string): Promise<ActionResult> {
  const user = await requirePortfolioAdmin();
  if (!hasCapability(user, PORTFOLIO_CAPABILITIES, "delete")) {
    return { ok: false, error: "You do not have permission to delete projects." };
  }

  await deletePortfolioProjectFully(id);
  await deletePortfolioWorkflowData(id);

  await logActivity({
    actorUserId: user.id,
    action: "portfolio.deleted",
    entityType: "portfolio_project",
    entityId: id,
    metadata: { title },
  });

  revalidatePath("/admin/portfolio");
  return { ok: true };
}
