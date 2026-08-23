import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/portal/roles";
import { canManagePortfolioPresentation } from "@/lib/admin/portfolioPresentationPermissions";
import { getWorkLandingImagesAdmin } from "@/lib/content/sanity/workLandingImagesAdmin";
import { getPublishedPortfolioProjectOptions } from "@/lib/content/sanity/homepageSlideshowAdmin";
import WorkLandingImagesManagerForm from "./WorkLandingImagesManagerForm";

export const metadata: Metadata = {
  title: "Work Landing Images — Portfolio — Ordift Studios Admin",
  robots: { index: false, follow: false },
};

export default async function WorkLandingImagesPage() {
  const user = await getCurrentUser();
  if (!user || !canManagePortfolioPresentation(user)) redirect("/admin/portfolio");

  const [images, projectOptions] = await Promise.all([
    getWorkLandingImagesAdmin(),
    getPublishedPortfolioProjectOptions(),
  ]);

  return (
    <div className="space-y-8 max-w-4xl">
      <div>
        <Link href="/admin/portfolio" className="font-sans text-caption text-ordift-ink-muted hover:text-ordift-ink">
          ← Portfolio
        </Link>
        <h1 className="font-serif font-medium text-section-heading text-ordift-ink mt-3">Work Landing Images</h1>
        <p className="font-sans text-body-small text-ordift-ink-muted mt-2 max-w-2xl">
          Choose the image shown on each discipline&apos;s band on the /work landing page. Leave a discipline unset
          to keep the automatic fallback (a real published project&apos;s own image, or the branded placeholder if
          none exists yet).
        </p>
      </div>

      <WorkLandingImagesManagerForm initialImages={images} projectOptions={projectOptions} />
    </div>
  );
}
