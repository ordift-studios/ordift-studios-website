"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/portal/roles";
import { canManagePortfolioPresentation } from "@/lib/admin/portfolioPresentationPermissions";
import { setServiceWorkLandingImage } from "@/lib/content/sanity/workLandingImagesAdmin";
import {
  getPortfolioProjectImagesForPicker,
  type ProjectPickableImages,
} from "@/lib/content/sanity/homepageSlideshowAdmin";
import { logActivity } from "@/lib/admin/activityLog";

async function requirePortfolioPresentationManager() {
  const user = await getCurrentUser();
  if (!user || !canManagePortfolioPresentation(user)) {
    throw new Error("Not authorized.");
  }
  return user;
}

export async function getProjectImagesForWorkLandingPickerAction(projectId: string): Promise<ProjectPickableImages> {
  await requirePortfolioPresentationManager();
  return getPortfolioProjectImagesForPicker(projectId);
}

export type ActionResult = { ok: true } | { ok: false; error: string };

export async function saveWorkLandingImageAction(
  serviceId: string,
  serviceName: string,
  image: { assetId: string; alt: string } | null
): Promise<ActionResult> {
  const user = await requirePortfolioPresentationManager();

  await setServiceWorkLandingImage(serviceId, image);

  await logActivity({
    actorUserId: user.id,
    action: image ? "service.work_landing_image_updated" : "service.work_landing_image_removed",
    entityType: "service",
    entityId: serviceId,
    metadata: { name: serviceName },
  });

  revalidatePath("/work");
  return { ok: true };
}
