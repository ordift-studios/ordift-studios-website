import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/portal/roles";
import { canManagePortfolioPresentation } from "@/lib/admin/portfolioPresentationPermissions";
import { getHomepageAboutVisualsAdmin } from "@/lib/content/sanity/homepageAboutVisualsAdmin";
import { getPublishedPortfolioProjectOptions } from "@/lib/content/sanity/homepageSlideshowAdmin";
import HomepageAboutVisualsManagerForm from "./HomepageAboutVisualsManagerForm";

export const metadata: Metadata = {
  title: "Homepage About Visuals — Portfolio — Ordift Studios Admin",
  robots: { index: false, follow: false },
};

export default async function HomepageAboutVisualsPage() {
  const user = await getCurrentUser();
  if (!user || !canManagePortfolioPresentation(user)) redirect("/admin/portfolio");

  const [images, projectOptions] = await Promise.all([
    getHomepageAboutVisualsAdmin(),
    getPublishedPortfolioProjectOptions(),
  ]);

  return (
    <div className="space-y-8 max-w-4xl">
      <div>
        <Link href="/admin/portfolio" className="font-sans text-caption text-ordift-ink-muted hover:text-ordift-ink">
          ← Portfolio
        </Link>
        <h1 className="font-serif font-medium text-section-heading text-ordift-ink mt-3">Homepage About Visuals</h1>
        <p className="font-sans text-body-small text-ordift-ink-muted mt-2 max-w-2xl">
          Choose the background photograph shown behind Our Mission and Our Vision on the Homepage&apos;s About
          Preview. Leave either unset to keep a clean solid-colour treatment — the site never falls back to sample
          or placeholder imagery. Who We Are and Our Values don&apos;t use a background image by design.
        </p>
      </div>

      <HomepageAboutVisualsManagerForm initialImages={images} projectOptions={projectOptions} />
    </div>
  );
}
