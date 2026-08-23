import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/portal/roles";
import { canManageHomepageSlideshow } from "@/lib/admin/homepageSlideshowPermissions";
import { getHomepageSlideshowSlidesAdmin, getPublishedPortfolioProjectOptions } from "@/lib/content/sanity/homepageSlideshowAdmin";
import HomepageSlideshowManagerForm from "./HomepageSlideshowManagerForm";

export const metadata: Metadata = {
  title: "Homepage Slideshow — Ordift Studios Admin",
  robots: { index: false, follow: false },
};

export default async function HomepageSlideshowAdminPage() {
  const user = await getCurrentUser();
  if (!user || !canManageHomepageSlideshow(user)) redirect("/admin/overview");

  const [{ homepageId, slides }, projectOptions] = await Promise.all([
    getHomepageSlideshowSlidesAdmin(),
    getPublishedPortfolioProjectOptions(),
  ]);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-serif text-2xl text-ordift-ink">Homepage Slideshow</h1>
        <p className="text-body-small text-ordift-ink-muted mt-1 max-w-2xl">
          Choose which photographs open the public homepage. Each slide can carry a separate Landscape image (shown
          on desktop, laptop, and landscape tablets/phones) and Portrait image (shown on portrait phones and
          tablets) — a visitor&apos;s device automatically gets the correctly framed version. While no slide here is
          enabled, the homepage automatically continues showing recent published Portfolio work instead, so the
          slideshow is never empty.
        </p>
      </div>

      <HomepageSlideshowManagerForm homepageId={homepageId} initialSlides={slides} projectOptions={projectOptions} />
    </div>
  );
}
