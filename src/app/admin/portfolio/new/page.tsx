import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/portal/roles";
import { canCreatePortfolioProjectsNatively } from "@/lib/admin/portfolioPermissions";
import {
  getAllPortfolioProjectsAdmin,
  getPortfolioCategoriesAdmin,
  getPortfolioCollectionsAdmin,
  getTestimonialsAdmin,
} from "@/lib/content/sanity/portfolioAdmin";
import PortfolioProjectForm from "../PortfolioProjectForm";

export const metadata: Metadata = {
  title: "New Project — Portfolio — Ordift Studios Admin",
  robots: { index: false, follow: false },
};

export default async function NewPortfolioProjectPage() {
  const user = await getCurrentUser();
  if (!user || !canCreatePortfolioProjectsNatively(user)) redirect("/admin/portfolio");

  const [categories, collections, testimonials, projects] = await Promise.all([
    getPortfolioCategoriesAdmin(),
    getPortfolioCollectionsAdmin(),
    getTestimonialsAdmin(),
    getAllPortfolioProjectsAdmin(),
  ]);

  return (
    <PortfolioProjectForm
      mode="create"
      categories={categories}
      collections={collections}
      testimonials={testimonials}
      otherProjects={projects.map((p) => ({ id: p.id, title: p.title }))}
    />
  );
}
