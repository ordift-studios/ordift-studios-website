import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/portal/roles";
import { canAccessPortfolioAdmin, canCreatePortfolioProjectsNatively } from "@/lib/admin/portfolioPermissions";
import { canManageHomepageSlideshow } from "@/lib/admin/homepageSlideshowPermissions";
import {
  getAllPortfolioProjectsAdmin,
  getPortfolioCategoriesAdmin,
  getPortfolioCollectionsAdmin,
} from "@/lib/content/sanity/portfolioAdmin";
import { getRecentActivityByType } from "@/lib/admin/activityLog";
import type { PortfolioProject, PortfolioStatus } from "@/lib/content/types";

export const metadata: Metadata = {
  title: "Portfolio — Ordift Studios Admin",
  robots: { index: false, follow: false },
};

const STATUS_LABELS: Record<PortfolioStatus, string> = {
  draft: "Draft",
  pending_review: "Pending Review",
  approved: "Approved",
  published: "Published",
  archived: "Archived",
};

const STATUS_BADGE_CLASSES: Record<PortfolioStatus, string> = {
  draft: "bg-black/5 text-ordift-ink-muted",
  pending_review: "bg-amber-100 text-amber-900",
  approved: "bg-sky-100 text-sky-900",
  published: "bg-emerald-100 text-emerald-900",
  archived: "bg-black/10 text-ordift-ink-muted line-through",
};

function StatCard({ label, value, href }: { label: string; value: number; href: string }) {
  return (
    <Link
      href={href}
      className="block rounded-xl border border-black/10 bg-white p-5 hover:border-black/25 transition-colors"
    >
      <p className="font-sans text-caption uppercase tracking-wide text-ordift-ink-muted mb-1">{label}</p>
      <p className="font-serif font-medium text-section-heading text-ordift-ink">{value}</p>
    </Link>
  );
}

function StatusBadge({ status }: { status: PortfolioStatus }) {
  return (
    <span
      className={`inline-block rounded-full px-2.5 py-0.5 font-sans text-caption font-medium ${STATUS_BADGE_CLASSES[status]}`}
    >
      {STATUS_LABELS[status]}
    </span>
  );
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

function matchesQuery(project: PortfolioProject, q: string): boolean {
  const query = q.trim().toLowerCase();
  if (!query) return true;
  return [project.title, project.client ?? "", project.location ?? ""].join(" ").toLowerCase().includes(query);
}

export default async function AdminPortfolioPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user || !canAccessPortfolioAdmin(user)) redirect("/admin/overview");
  const canCreateNatively = canCreatePortfolioProjectsNatively(user);
  const canManageSlideshow = canManageHomepageSlideshow(user);

  const { status: statusFilter, q } = await searchParams;

  const [projects, categories, collections, recentActivity] = await Promise.all([
    getAllPortfolioProjectsAdmin(),
    getPortfolioCategoriesAdmin(),
    getPortfolioCollectionsAdmin(),
    getRecentActivityByType("portfolio_project"),
  ]);

  const counts = projects.reduce(
    (acc, p) => {
      acc.total += 1;
      acc[p.status] = (acc[p.status] ?? 0) + 1;
      if (p.featured) acc.featured += 1;
      return acc;
    },
    { total: 0, featured: 0 } as Record<string, number>
  );

  const filtered = projects
    .filter((p) => !statusFilter || p.status === statusFilter)
    .filter((p) => matchesQuery(p, q ?? ""));

  function filterHref(nextStatus?: string) {
    const params = new URLSearchParams();
    if (nextStatus) params.set("status", nextStatus);
    if (q) params.set("q", q);
    const qs = params.toString();
    return qs ? `/admin/portfolio?${qs}` : "/admin/portfolio";
  }

  return (
    <div className="space-y-12">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-sans font-semibold uppercase tracking-[0.2em] text-eyebrow text-ordift-gold-pressed mb-2">
            Admin
          </p>
          <h1 className="font-serif font-medium text-section-heading lg:text-section-heading-desktop text-ordift-ink">
            Portfolio
          </h1>
          <p className="font-sans text-body-small text-ordift-ink-muted mt-2 max-w-2xl">
            Review, approve, and publish portfolio projects. Content itself (galleries, case-study text, media) is
            still authored in{" "}
            <a href="/studio" target="_blank" rel="noopener noreferrer" className="underline text-ordift-gold-pressed">
              Sanity Studio →
            </a>
            — this dashboard manages the review workflow on top of it.
          </p>
        </div>
        <div className="flex gap-3">
          {canManageSlideshow && (
            <Link
              href="/admin/homepage-slideshow"
              className="font-sans text-body-small font-semibold px-4 py-2 rounded-md border border-ordift-gold text-ordift-gold-pressed hover:bg-ordift-gold/10"
            >
              Homepage Slideshow
            </Link>
          )}
          <Link
            href="/admin/portfolio/categories"
            className="font-sans text-body-small font-medium px-4 py-2 rounded-md border border-black/15 text-ordift-ink hover:border-black/30"
          >
            Categories
          </Link>
          <Link
            href="/admin/portfolio/collections"
            className="font-sans text-body-small font-medium px-4 py-2 rounded-md border border-black/15 text-ordift-ink hover:border-black/30"
          >
            Collections
          </Link>
          {canCreateNatively && (
            <Link
              href="/admin/portfolio/new"
              className="font-sans text-body-small font-semibold px-4 py-2 rounded-md bg-ordift-navy-950 text-white"
            >
              New Project
            </Link>
          )}
          <a
            href="/studio/structure/portfolioProject"
            target="_blank"
            rel="noopener noreferrer"
            className="font-sans text-body-small font-medium px-4 py-2 rounded-md border border-black/15 text-ordift-ink hover:border-black/30"
          >
            Open Advanced Editor in Sanity Studio →
          </a>
        </div>
      </div>

      <section className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
        <StatCard label="Total Projects" value={counts.total ?? 0} href={filterHref()} />
        <StatCard label="Drafts" value={counts.draft ?? 0} href={filterHref("draft")} />
        <StatCard label="Pending Review" value={counts.pending_review ?? 0} href={filterHref("pending_review")} />
        <StatCard label="Approved" value={counts.approved ?? 0} href={filterHref("approved")} />
        <StatCard label="Published" value={counts.published ?? 0} href={filterHref("published")} />
        <StatCard label="Archived" value={counts.archived ?? 0} href={filterHref("archived")} />
        <StatCard label="Featured" value={counts.featured ?? 0} href={filterHref()} />
        <StatCard label="Categories" value={categories.length} href="/admin/portfolio/categories" />
        <StatCard label="Collections" value={collections.length} href="/admin/portfolio/collections" />
      </section>

      <section>
        <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
          <h2 className="font-serif font-medium text-body text-ordift-ink">Projects</h2>
          <form className="flex items-center gap-2" action="/admin/portfolio">
            {statusFilter && <input type="hidden" name="status" value={statusFilter} />}
            <input
              type="search"
              name="q"
              defaultValue={q ?? ""}
              placeholder="Search title, client, location…"
              aria-label="Search portfolio projects"
              className="rounded-lg border border-black/15 px-3 py-1.5 font-sans text-body-small w-64"
            />
            <button type="submit" className="font-sans text-body-small font-medium px-3 py-1.5 rounded-md border border-black/15">
              Search
            </button>
          </form>
        </div>

        <div className="flex flex-wrap gap-2 mb-4">
          <Link
            href={filterHref()}
            className={`font-sans text-caption font-medium px-3 py-1 rounded-full border ${!statusFilter ? "border-ordift-navy-950 bg-ordift-navy-950 text-white" : "border-black/15 text-ordift-ink-muted"}`}
          >
            All
          </Link>
          {(Object.keys(STATUS_LABELS) as PortfolioStatus[]).map((s) => (
            <Link
              key={s}
              href={filterHref(s)}
              className={`font-sans text-caption font-medium px-3 py-1 rounded-full border ${statusFilter === s ? "border-ordift-navy-950 bg-ordift-navy-950 text-white" : "border-black/15 text-ordift-ink-muted"}`}
            >
              {STATUS_LABELS[s]}
            </Link>
          ))}
        </div>

        {filtered.length === 0 ? (
          <p className="font-sans text-body-small text-ordift-ink-muted">No projects match.</p>
        ) : (
          <div className="rounded-xl border border-black/10 bg-white divide-y divide-black/5">
            {filtered.map((project) => (
              <Link
                key={project.id}
                href={`/admin/portfolio/${project.id}`}
                className="px-5 py-4 flex items-center justify-between gap-4 hover:bg-black/[0.02]"
              >
                <div className="min-w-0">
                  <p className="font-sans text-body-small text-ordift-ink font-medium truncate">
                    {project.title}
                    {project.featured && (
                      <span className="ml-2 font-sans text-caption text-ordift-gold-pressed">★ Featured</span>
                    )}
                  </p>
                  <p className="font-sans text-caption text-ordift-ink-muted truncate">
                    {[project.client, project.location, project.year].filter(Boolean).join(" · ") || "—"}
                  </p>
                </div>
                <StatusBadge status={project.status} />
              </Link>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="font-serif font-medium text-body text-ordift-ink mb-4">Recently Edited</h2>
        {recentActivity.length === 0 ? (
          <p className="font-sans text-body-small text-ordift-ink-muted">No portfolio activity recorded yet.</p>
        ) : (
          <div className="rounded-xl border border-black/10 bg-white divide-y divide-black/5">
            {recentActivity.map((entry) => (
              <div key={entry.id} className="px-5 py-4 flex items-center justify-between gap-4">
                <div>
                  <p className="font-sans text-body-small text-ordift-ink">
                    {entry.action.replace("portfolio.", "").replace(/_/g, " ")}
                    {entry.actorUserId ? ` — ${entry.actorLabel}` : ""}
                  </p>
                  {typeof entry.metadata.title === "string" && (
                    <p className="font-sans text-caption text-ordift-ink-muted">{entry.metadata.title}</p>
                  )}
                </div>
                <p className="font-sans text-caption text-ordift-ink-muted whitespace-nowrap">
                  {formatDateTime(entry.createdAt)}
                </p>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
