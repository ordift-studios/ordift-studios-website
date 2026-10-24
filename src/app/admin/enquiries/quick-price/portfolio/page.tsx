import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser, isStaffOrAdmin } from "@/lib/portal/roles";
import { isManagementUser } from "@/lib/crewSupport/management";
import { listPortfolioSourceFiles } from "@/lib/portfolio/sourceFiles";
import { PORTFOLIO_LIBRARY_ENABLED } from "@/lib/portfolio/featureGate";
import { contentRepository } from "@/lib/content";
import { getStandings, listCollectionFileIds, listCollections } from "@/lib/portfolio/library";
import PortfolioPicker from "./PortfolioPicker";

export const metadata: Metadata = { title: "Quick Portfolio Picker — Ordift Studios Admin", robots: { index: false, follow: false } };

const MODES = [
  { key: "final", label: "Final Images" },
  { key: "jobs", label: "Jobs & Projects" },
  { key: "collections", label: "Portfolio Collections" },
] as const;
type Mode = (typeof MODES)[number]["key"];

// Internal, read-only. Open it in its own tab from Enquiries & Quick Pricing so the pricing calculation is not lost. Private job photographs are
// visible only to management (Super Admin / executive admin), the same people who may review job files today. Nothing is stored, shared or published.
export default async function QuickPortfolioPickerPage({ searchParams }: { searchParams: Promise<{ mode?: string; q?: string; kind?: string; service?: string; job?: string; collection?: string }> }) {
  const user = await getCurrentUser();
  if (!user || !isStaffOrAdmin(user)) redirect("/admin/overview");
  const allowed = await isManagementUser(user);
  const sp = await searchParams;
  const mode: Mode = MODES.some((m) => m.key === sp.mode) ? (sp.mode as Mode) : "final";
  const collections = allowed ? await listCollections() : [];
  const openCollection = collections.find((c) => c.id === sp.collection) ?? null;
  const collectionIds = openCollection ? await listCollectionFileIds(openCollection.id) : null;
  const data = allowed ? await listPortfolioSourceFiles({ ids: collectionIds ?? undefined, q: sp.q, service: sp.service, ...(mode === "final" ? { kind: "final_approved" } : mode === "jobs" ? { job: sp.job ?? "__none__", kind: sp.kind } : mode === "collections" && !collectionIds ? { job: "__none__" } : {}) }) : null;
  const standing = PORTFOLIO_LIBRARY_ENABLED && data ? Object.fromEntries(Object.entries(await getStandings(data.files.map((f) => f.id))).map(([id, v]) => [id, { permission: v.permission, internal: v.internal }])) : undefined;
  const selectedJob = data?.jobs.find((j) => j.key === sp.job) ?? null;
  const cms = allowed && mode === "collections" ? await loadCmsCollections() : null;
  const tab = (m: (typeof MODES)[number]) => `?mode=${m.key}`;

  return (
    <div className="space-y-6 max-w-6xl">
      <div>
        <Link href="/admin/enquiries/quick-price" className="font-sans text-body-small text-ordift-gold-pressed underline">← Enquiries &amp; Quick Pricing</Link>
        <h1 className="mt-3 font-serif font-medium text-section-heading text-ordift-ink">Quick Portfolio Picker</h1>
        <p className="mt-2 font-sans text-body-small text-ordift-ink-muted">Photographs already stored for Ordift jobs. This is an <strong>internal</strong> view: the original files stay where they are and nothing is copied, shared or published from here.</p>
        <p className="mt-2 rounded-lg bg-amber-50 p-3 font-sans text-caption text-amber-900"><strong>Two separate approvals are needed before any photograph is used outside Ordift:</strong> the rights holder&apos;s marketing permission, and Ordift&apos;s own internal approval. {PORTFOLIO_LIBRARY_ENABLED ? "Each photograph below shows where it stands on both." : <>Neither is recorded in the platform yet, so every photograph is treated as <strong>not cleared</strong>: delivery, Final Approved status or client acceptance does not give Ordift permission to advertise a client&apos;s photograph.</>} The full <Link href="/admin/portfolio" className="underline">Portfolio administration</Link> page remains separate.</p>
      </div>

      <nav aria-label="Browse by" className="flex flex-wrap gap-2">
        {MODES.map((m) => (
          <Link key={m.key} href={tab(m)} aria-current={m.key === mode ? "page" : undefined} className={`rounded-full px-4 py-2 font-sans text-body-small ${m.key === mode ? "bg-ordift-ink text-white" : "border border-black/15 text-ordift-ink"}`}>{m.label}</Link>
        ))}
      </nav>

      {!data ? <p className="font-sans text-body-small text-ordift-ink-muted">Job photographs are private. They are shown to a Super Admin or executive admin only.</p> : (
        <>
          {mode === "final" && (
            <>
              <p className="font-sans text-body-small text-ordift-ink-muted">Final, approved photographs across jobs. Each shows the job it came from.</p>
              <form method="get" className="grid grid-cols-1 gap-2 sm:grid-cols-4">
                <input type="hidden" name="mode" value="final" />
                <input name="q" defaultValue={sp.q ?? ""} placeholder="Search file, job or reference" aria-label="Search" className="rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small sm:col-span-2" />
                <select name="service" defaultValue={sp.service ?? ""} aria-label="Service" className="rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small"><option value="">Any service</option>{data.services.map((s) => <option key={s} value={s}>{s.replace(/_/g, " ")}</option>)}</select>
                <button className="rounded-md bg-ordift-ink px-4 py-2 font-sans text-body-small text-white">Filter</button>
              </form>
              <PortfolioPicker files={data.files} standing={standing} collections={collections} canPropose={PORTFOLIO_LIBRARY_ENABLED} candidatesNote={PORTFOLIO_LIBRARY_ENABLED ? undefined : "Saving candidates opens once the database release is authorised. Until then the tray is a temporary shortlist."} />
            </>
          )}

          {mode === "jobs" && (
            <>
              <p className="font-sans text-body-small text-ordift-ink-muted">Choose a job to see only its photographs. The list is built from Ordift&apos;s own job records, so a newly completed job appears here by itself.</p>
              <form method="get" className="flex flex-col gap-2 sm:flex-row">
                <input type="hidden" name="mode" value="jobs" />
                <select name="job" defaultValue={sp.job ?? ""} aria-label="Job" className="min-w-0 flex-1 rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small">
                  <option value="">Select a job…</option>
                  {data.jobs.map((j) => <option key={j.key} value={j.key}>{j.title}{j.isTest ? " (test)" : ""} · {j.imageCount} image{j.imageCount === 1 ? "" : "s"}</option>)}
                </select>
                <button className="rounded-md bg-ordift-ink px-4 py-2 font-sans text-body-small text-white">Show photographs</button>
              </form>
              {data.jobs.length === 0 && <p className="font-sans text-body-small text-ordift-ink-muted">No job has photographs yet.</p>}
              <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {data.jobs.map((j) => (
                  <li key={j.key}>
                    <Link href={`?mode=jobs&job=${encodeURIComponent(j.key)}`} className={`block rounded-xl border p-3 ${j.key === sp.job ? "border-ordift-gold-pressed bg-white" : "border-black/10 bg-white"}`}>
                      <p className="font-sans text-body-small font-medium text-ordift-ink">{j.title}{j.isTest ? " (test)" : ""}</p>
                      <p className="font-sans text-caption text-ordift-ink-muted">{j.service ? `${j.service.replace(/_/g, " ")} · ` : ""}{j.date ?? "date not recorded"} · {j.imageCount} image{j.imageCount === 1 ? "" : "s"}{j.finalCount ? ` (${j.finalCount} final)` : ""}</p>
                    </Link>
                  </li>
                ))}
              </ul>
              {selectedJob && (
                <>
                  <h2 className="font-serif font-medium text-body text-ordift-ink">{selectedJob.title}</h2>
                  {PORTFOLIO_LIBRARY_ENABLED && <Link href={`/admin/portfolio-library/${selectedJob.jobType}/${selectedJob.jobId}`} className="font-sans text-body-small text-ordift-gold-pressed underline">Permission &amp; internal approval for this job</Link>}
                  <PortfolioPicker files={data.files} standing={standing} collections={collections} canPropose={PORTFOLIO_LIBRARY_ENABLED} candidatesNote={PORTFOLIO_LIBRARY_ENABLED ? undefined : "Saving candidates opens once the database release is authorised. Until then the tray is a temporary shortlist."} />
                </>
              )}
            </>
          )}

          {mode === "collections" && (
            <div className="space-y-6">
              <section aria-labelledby="cms" className="space-y-2">
                <h2 id="cms" className="font-serif font-medium text-body text-ordift-ink">Existing portfolio categories</h2>
                <p className="font-sans text-body-small text-ordift-ink-muted">Read from the website&apos;s own portfolio content. Nothing here is changed, and nothing is added to the website from this page.</p>
                {cms && cms.length > 0 ? (
                  <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {cms.map((c) => <li key={c.slug} className="rounded-xl border border-black/10 bg-white p-3"><p className="font-sans text-body-small font-medium text-ordift-ink">{c.name}</p><p className="font-sans text-caption text-ordift-ink-muted">{c.projects} published project{c.projects === 1 ? "" : "s"}</p></li>)}
                  </ul>
                ) : <p className="font-sans text-body-small text-ordift-ink-muted">No portfolio categories could be read.</p>}
              </section>
              <section aria-labelledby="mine" className="space-y-2">
                <h2 id="mine" className="font-serif font-medium text-body text-ordift-ink">Internal candidate collections</h2>
                {PORTFOLIO_LIBRARY_ENABLED ? (
                  <>
                    {collections.length === 0 && <p className="font-sans text-body-small text-ordift-ink-muted">No collection yet. Fill the selection tray from any view, then choose &ldquo;Add tray to collection&rdquo;.</p>}
                    <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">{collections.map((c) => <li key={c.id}><Link href={`?mode=collections&collection=${c.id}`} className={`block rounded-xl border bg-white p-3 ${c.id === sp.collection ? "border-ordift-gold-pressed" : "border-black/10"}`}><p className="font-sans text-body-small font-medium text-ordift-ink">{c.name}</p><p className="font-sans text-caption text-ordift-ink-muted">{c.serviceCategory ?? "No category"} · {c.count} photograph{c.count === 1 ? "" : "s"}</p></Link></li>)}</ul>
                    {openCollection && <><h3 className="font-serif font-medium text-body text-ordift-ink">{openCollection.name}</h3><PortfolioPicker files={data.files} standing={standing} collections={collections} canPropose /></>}
                  </>
                ) : <p className="rounded-lg bg-black/5 p-3 font-sans text-body-small text-ordift-ink-muted">Saving photographs from several jobs into a named collection needs a database change that has not been authorised or applied yet. Until then, use the selection tray, which already works across jobs and keeps each photograph linked to its job.</p>}
              </section>
            </div>
          )}
        </>
      )}
    </div>
  );
}

async function loadCmsCollections(): Promise<{ slug: string; name: string; projects: number }[]> {
  try {
    const [cats, projects] = await Promise.all([contentRepository.getPortfolioCategories(), contentRepository.getPortfolioProjects()]);
    const idOf = new Map(cats.map((c) => [c.id, c.slug]));
    const counts = new Map<string, number>();
    for (const p of projects) for (const id of p.categoryIds ?? []) { const slug = idOf.get(id); if (slug) counts.set(slug, (counts.get(slug) ?? 0) + 1); }
    return cats.map((c) => ({ slug: c.slug, name: c.name, projects: counts.get(c.slug) ?? 0 }));
  } catch {
    return [];
  }
}
