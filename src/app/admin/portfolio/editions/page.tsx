import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser, isSuperAdmin } from "@/lib/portal/roles";
import { PORTFOLIO_LIBRARY_ENABLED } from "@/lib/portfolio/featureGate";
import { PERMISSION_TEXT_APPROVED } from "@/lib/portfolio/permissionText";
import { DESTINATIONS, DESTINATION_LABEL } from "@/lib/portfolio/destinations";
import { getStandings, listCollectionFileIds, listCollections } from "@/lib/portfolio/library";
import { listPortfolioSourceFiles } from "@/lib/portfolio/sourceFiles";
import { PREVIEW_MAX_PHOTOS } from "@/lib/portfolio/editionPreview";

export const metadata: Metadata = { title: "Portfolio Library & Editions — Ordift Studios Admin", robots: { index: false, follow: false } };

// Super Admin only. Internal curation and WATERMARKED INTERNAL PREVIEWS of the branded portfolio PDF. An external edition cannot be made from this page: it needs
// client permission for every photograph, internal approval, the exact use, a recorded edition approval and an edition label, none of which this page grants.
export default async function PortfolioEditionsPage({ searchParams }: { searchParams: Promise<{ collection?: string }> }) {
  const user = await getCurrentUser();
  if (!user || !isSuperAdmin(user)) redirect("/admin/portfolio");
  const { collection: selectedId } = await searchParams;
  const collections = await listCollections();
  const selected = collections.find((c) => c.id === selectedId) ?? null;

  let rows: { id: string; name: string; job: string; permission: string; internal: string; usable: string[] }[] = [];
  if (selected) {
    const ids = (await listCollectionFileIds(selected.id)).slice(0, 200);
    const [{ files }, standings] = await Promise.all([listPortfolioSourceFiles({ ids }, 200), getStandings(ids)]);
    rows = ids.map((id) => {
      const f = files.find((x) => x.id === id);
      const s = standings[id];
      return { id, name: f?.filename ?? id, job: f?.jobLabel ?? "", permission: s?.permission ?? "No permission on record", internal: s?.internal ?? "Not yet reviewed internally", usable: (s?.usable ?? []).map((d) => DESTINATION_LABEL[d]) };
    });
  }
  const cleared = rows.filter((r) => r.usable.length > 0).length;

  return (
    <div className="space-y-8 max-w-4xl">
      <div>
        <Link href="/admin/portfolio" className="font-sans text-caption text-ordift-ink-muted hover:text-ordift-ink">← Portfolio</Link>
        <h1 className="font-serif font-medium text-section-heading text-ordift-ink mt-3">Portfolio Library &amp; Editions</h1>
        <p className="font-sans text-body-small text-ordift-ink-muted mt-2 max-w-2xl">Curate private collections of delivered photographs and draw watermarked internal previews of the branded portfolio PDF. Nothing here publishes, sends or stores a portfolio.</p>
      </div>

      <section className="rounded-xl border border-black/10 bg-white p-5 space-y-2" aria-labelledby="status">
        <h2 id="status" className="font-serif font-medium text-body text-ordift-ink">Where things stand</h2>
        <ul className="font-sans text-body-small text-ordift-ink space-y-1">
          <li><strong>Internal library:</strong> {PORTFOLIO_LIBRARY_ENABLED ? "on, for internal administration only" : "off"}.</li>
          <li><strong>Client permission requests:</strong> {PERMISSION_TEXT_APPROVED ? "wording approved" : "blocked until management approves the permission wording; none can be sent"}.</li>
          <li><strong>External editions:</strong> not available from this page. One photograph without client permission and internal approval for the exact use blocks the whole edition.</li>
        </ul>
        <p className="font-sans text-caption text-ordift-ink-muted">Build collections in the <Link href="/admin/enquiries/quick-price/portfolio?mode=jobs" className="underline">Quick Portfolio Picker</Link>; record permission and internal approval per job from the same page.</p>
      </section>

      <section aria-labelledby="cols" className="space-y-3">
        <h2 id="cols" className="font-serif font-medium text-body text-ordift-ink">Collections</h2>
        {collections.length === 0 ? (
          <p className="font-sans text-body-small text-ordift-ink-muted rounded-lg bg-black/5 p-4">No collections yet. Add photographs to a new collection from the Quick Portfolio Picker; they stay private and linked to their jobs.</p>
        ) : (
          <ul className="divide-y divide-black/5 rounded-xl border border-black/10 bg-white">
            {collections.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                <span className="font-sans text-body-small text-ordift-ink">{c.name}<span className="ml-2 text-caption text-ordift-ink-muted">{c.count} photograph{c.count === 1 ? "" : "s"}</span></span>
                <Link href={`/admin/portfolio/editions?collection=${c.id}`} className={`font-sans text-caption underline underline-offset-4 ${c.id === selected?.id ? "font-semibold text-ordift-ink" : "text-ordift-gold-pressed"}`}>{c.id === selected?.id ? "Selected" : "Open"}</Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {selected && (
        <>
          <section aria-labelledby="standing" className="space-y-3">
            <h2 id="standing" className="font-serif font-medium text-body text-ordift-ink">{selected.name}: permission status</h2>
            <p className="font-sans text-caption text-ordift-ink-muted">{cleared} of {rows.length} photograph{rows.length === 1 ? "" : "s"} currently cleared for at least one use. Cleared means both the rights holder&apos;s permission and Ordift&apos;s internal approval cover that use today.</p>
            <div className="overflow-x-auto rounded-xl border border-black/10 bg-white">
              <table className="min-w-full font-sans text-caption">
                <thead><tr className="text-left text-ordift-ink-muted"><th className="px-3 py-2">Photograph</th><th className="px-3 py-2">Client permission</th><th className="px-3 py-2">Internal approval</th><th className="px-3 py-2">Cleared for</th></tr></thead>
                <tbody className="divide-y divide-black/5">
                  {rows.map((r) => (
                    <tr key={r.id} className="align-top"><td className="px-3 py-2"><span className="text-ordift-ink">{r.name}</span>{r.job && <span className="block text-ordift-ink-muted">{r.job}</span>}</td><td className="px-3 py-2">{r.permission}</td><td className="px-3 py-2">{r.internal}</td><td className="px-3 py-2">{r.usable.length ? r.usable.join(", ") : "Not cleared"}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section aria-labelledby="preview" className="space-y-3 rounded-xl border border-black/10 bg-white p-5">
            <h2 id="preview" className="font-serif font-medium text-body text-ordift-ink">Internal preview PDF</h2>
            <p className="font-sans text-body-small text-ordift-ink-muted">Every page is marked &ldquo;INTERNAL PREVIEW — NOT FOR DISTRIBUTION&rdquo;, and the final page lists nothing as approved. Up to {PREVIEW_MAX_PHOTOS} JPEG or PNG photographs are drawn. The file opens in your browser and is not saved anywhere by Ordift; do not forward it.</p>
            <form action="/admin/portfolio/editions/preview" method="get" target="_blank" className="grid gap-3 sm:grid-cols-2">
              <input type="hidden" name="collection" value={selected.id} />
              <label className="font-sans text-caption text-ordift-ink-muted" htmlFor="pv-title">Title<input id="pv-title" name="title" defaultValue="Portfolio" maxLength={80} className="mt-1 w-full rounded-lg border border-black/15 px-3 py-2 text-body-small text-ordift-ink" /></label>
              <label className="font-sans text-caption text-ordift-ink-muted" htmlFor="pv-edition">Edition label<input id="pv-edition" name="edition" defaultValue="Portfolio, working draft" maxLength={80} className="mt-1 w-full rounded-lg border border-black/15 px-3 py-2 text-body-small text-ordift-ink" /></label>
              <label className="font-sans text-caption text-ordift-ink-muted sm:col-span-2" htmlFor="pv-dest">Intended use (used only to flag what would block an external edition)
                <select id="pv-dest" name="destination" defaultValue="portfolio" className="mt-1 w-full rounded-lg border border-black/15 px-3 py-2 text-body-small text-ordift-ink">{DESTINATIONS.map((d) => <option key={d.key} value={d.key}>{d.label}</option>)}</select>
              </label>
              <div className="sm:col-span-2"><button type="submit" className="font-sans text-body-small font-semibold px-4 py-2 rounded-md bg-ordift-navy-950 text-white">Open internal preview</button></div>
            </form>
          </section>
        </>
      )}
    </div>
  );
}
