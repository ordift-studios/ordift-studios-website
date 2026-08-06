import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/portal/roles";
import { canCreatePortfolioProjectsNatively, PORTFOLIO_CAPABILITIES } from "@/lib/admin/portfolioPermissions";
import { hasCapability } from "@/lib/workflow/engine";
import {
  getAllPortfolioProjectsAdmin,
  getPortfolioCategoriesAdmin,
  getPortfolioCollectionsAdmin,
  getPortfolioProjectForEdit,
  getTestimonialsAdmin,
} from "@/lib/content/sanity/portfolioAdmin";
import PortfolioProjectForm from "../../PortfolioProjectForm";
import { mapEditDataToFormState } from "../../mapEditDataToFormState";

export const metadata: Metadata = {
  title: "Edit Project — Portfolio — Ordift Studios Admin",
  robots: { index: false, follow: false },
};

export default async function EditPortfolioProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user || !canCreatePortfolioProjectsNatively(user)) redirect("/admin/portfolio");

  const { id } = await params;
  const [raw, categories, collections, testimonials, projects] = await Promise.all([
    getPortfolioProjectForEdit(id),
    getPortfolioCategoriesAdmin(),
    getPortfolioCollectionsAdmin(),
    getTestimonialsAdmin(),
    getAllPortfolioProjectsAdmin(),
  ]);
  if (!raw) notFound();

  return (
    <PortfolioProjectForm
      mode="edit"
      projectId={id}
      initialState={mapEditDataToFormState(raw)}
      categories={categories}
      collections={collections}
      testimonials={testimonials}
      otherProjects={projects.filter((p) => p.id !== id).map((p) => ({ id: p.id, title: p.title }))}
      canPublish={hasCapability(user, PORTFOLIO_CAPABILITIES, "publish")}
    />
  );
}
