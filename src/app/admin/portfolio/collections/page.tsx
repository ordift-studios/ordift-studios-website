import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/portal/roles";
import { PORTFOLIO_CAPABILITIES } from "@/lib/admin/portfolioPermissions";
import { hasCapability } from "@/lib/workflow/engine";
import { getPortfolioCollectionsAdmin } from "@/lib/content/sanity/portfolioAdmin";
import { createPortfolioCollectionAction, deletePortfolioCollectionAction } from "../actions";

export const metadata: Metadata = {
  title: "Portfolio Collections — Ordift Studios Admin",
  robots: { index: false, follow: false },
};

export default async function AdminPortfolioCollectionsPage() {
  const user = await getCurrentUser();
  const canManage = hasCapability(user, PORTFOLIO_CAPABILITIES, "manage_taxonomy");
  if (!user || !canManage) redirect("/admin/portfolio");

  const collections = await getPortfolioCollectionsAdmin();

  return (
    <div className="space-y-8 max-w-2xl">
      <div>
        <Link href="/admin/portfolio" className="font-sans text-caption text-ordift-ink-muted hover:text-ordift-ink">
          ← Portfolio
        </Link>
        <h1 className="font-serif font-medium text-section-heading text-ordift-ink mt-3">Portfolio Collections / Series</h1>
        <p className="font-sans text-body-small text-ordift-ink-muted mt-2">
          A Collection groups related projects. Mark one as Ordered to treat it as a Series — projects within it use
          their Series Order field (set in Sanity Studio) to control sequence.
        </p>
      </div>

      <section className="rounded-xl border border-black/10 bg-white p-6 space-y-4">
        <ul className="divide-y divide-black/5">
          {collections.map((c) => (
            <li key={c.id} className="flex items-center justify-between py-2.5">
              <div>
                <p className="font-sans text-body-small text-ordift-ink font-medium">
                  {c.name}
                  {c.isOrdered && <span className="ml-2 font-sans text-caption text-ordift-gold-pressed">Series</span>}
                </p>
                {c.description && <p className="font-sans text-caption text-ordift-ink-muted">{c.description}</p>}
              </div>
              <form action={deletePortfolioCollectionAction}>
                <input type="hidden" name="id" value={c.id} />
                <button type="submit" className="font-sans text-caption text-ordift-ink-muted hover:text-red-700 underline underline-offset-4">
                  Delete
                </button>
              </form>
            </li>
          ))}
          {collections.length === 0 && <p className="font-sans text-body-small text-ordift-ink-muted py-2">None yet.</p>}
        </ul>

        <form action={createPortfolioCollectionAction} className="space-y-3 pt-4 border-t border-black/5">
          <input
            type="text"
            name="name"
            placeholder="Collection name"
            required
            className="w-full rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small"
          />
          <input
            type="text"
            name="description"
            placeholder="Description (optional)"
            className="w-full rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small"
          />
          <label className="flex items-center gap-2 font-sans text-body-small text-ordift-ink">
            <input type="checkbox" name="isOrdered" />
            Ordered (Series)
          </label>
          <button type="submit" className="font-sans text-body-small font-semibold px-4 py-2 rounded-md bg-ordift-navy-950 text-white">
            Add Collection
          </button>
        </form>
      </section>
    </div>
  );
}
