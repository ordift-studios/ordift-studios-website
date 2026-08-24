"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/portal/roles";
import { canManagePortfolioPresentation } from "@/lib/admin/portfolioPresentationPermissions";
import { setHomepageAboutImage, type HomepageAboutImageField } from "@/lib/content/sanity/homepageAboutVisualsAdmin";
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

export async function getProjectImagesForAboutVisualsPickerAction(projectId: string): Promise<ProjectPickableImages> {
  await requirePortfolioPresentationManager();
  return getPortfolioProjectImagesForPicker(projectId);
}

export type ActionResult = { ok: true } | { ok: false; error: string };

export async function saveHomepageAboutImageAction(
  fieldKey: HomepageAboutImageField,
  label: string,
  image: { assetId: string; alt: string; focalX?: number; focalY?: number } | null
): Promise<ActionResult> {
  const user = await requirePortfolioPresentationManager();

  await setHomepageAboutImage(fieldKey, image);

  await logActivity({
    actorUserId: user.id,
    action: image ? "homepage.about_image_updated" : "homepage.about_image_removed",
    entityType: "homepage",
    entityId: "homepage",
    metadata: { field: fieldKey, label },
  });

  revalidatePath("/");
  return { ok: true };
}
