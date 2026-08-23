"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/portal/roles";
import { canManageHomepageSlideshow } from "@/lib/admin/homepageSlideshowPermissions";
import { saveHomepageSlideshowSlides, type SlideInput } from "@/lib/content/sanity/homepageSlideshowAdmin";
import { logActivity } from "@/lib/admin/activityLog";

async function requireHomepageSlideshowAdmin() {
  const user = await getCurrentUser();
  if (!user || !canManageHomepageSlideshow(user)) {
    throw new Error("Not authorized.");
  }
  return user;
}

// Whole-array replace, submitted as one JSON payload from the client
// form (add/remove/reorder/edit all happen together, matching how the
// array field itself works) — mirrors the Portfolio admin's own
// server-action pattern (requireX() then a single write call), just
// with one write instead of many field-scoped patches, since this
// feature has one form, not a multi-step wizard.
export async function saveHomepageSlideshowSlidesAction(homepageId: string, slides: SlideInput[]): Promise<void> {
  const user = await requireHomepageSlideshowAdmin();

  // A slide needs at least one usable image to be worth keeping — an
  // empty shell (no landscape, no portrait, no project reference to
  // fall back to) would just be silently dropped by the public-facing
  // fallback resolution anyway (see repository.ts), so reject it here
  // instead, where the admin can see and fix it immediately.
  for (const slide of slides) {
    if (!slide.landscapeAssetId && !slide.portraitAssetId && !slide.projectId) {
      throw new Error("Each slide needs at least a landscape image, a portrait image, or a linked project.");
    }
  }

  await saveHomepageSlideshowSlides(homepageId, slides);

  await logActivity({
    actorUserId: user.id,
    action: "homepage_slideshow.updated",
    metadata: { slideCount: slides.length, enabledCount: slides.filter((s) => s.enabled).length },
  });

  // The public homepage (and this admin page's own re-fetch) both need
  // to see the new content immediately, not after the next natural
  // revalidation.
  revalidatePath("/");
  revalidatePath("/admin/homepage-slideshow");
}
