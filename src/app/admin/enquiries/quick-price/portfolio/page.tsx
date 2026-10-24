import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser, isStaffOrAdmin } from "@/lib/portal/roles";
import { isManagementUser } from "@/lib/crewSupport/management";
import { listPortfolioSourceFiles } from "@/lib/portfolio/sourceFiles";
import PortfolioPicker from "./PortfolioPicker";

export const metadata: Metadata = { title: "Quick Portfolio Picker — Ordift Studios Admin", robots: { index: false, follow: false } };

// Internal, read-only. Open it in its own tab from Enquiries & Quick Pricing so the pricing calculation is not lost. Private job photographs are
// visible only to management (Super Admin / executive admin), the same people who may review job files today. Nothing is stored, shared or published.
export default async function QuickPortfolioPickerPage({ searchParams }: { searchParams: Promise<{ q?: string; kind?: string; service?: string }> }) {
  const user = await getCurrentUser();
  if (!user || !isStaffOrAdmin(user)) redirect("/admin/overview");
  const allowed = await isManagementUser(user);
  const sp = await searchParams;
  const data = allowed ? await listPortfolioSourceFiles({ q: sp.q, kind: sp.kind, service: sp.service }) : null;

  return (
    <div className="space-y-6 max-w-6xl">
      <div>
        <Link href="/admin/enquiries/quick-price" className="font-sans text-body-small text-ordift-gold-pressed underline">← Enquiries &amp; Quick Pricing</Link>
        <h1 className="mt-3 font-serif font-medium text-section-heading text-ordift-ink">Quick Portfolio Picker</h1>
        <p className="mt-2 font-sans text-body-small text-ordift-ink-muted">Photographs already stored for Ordift jobs, Final images first. This is an <strong>internal</strong> view: the original files stay where they are and nothing is copied, shared or published from here.</p>
        <p className="mt-2 rounded-lg bg-amber-50 p-3 font-sans text-caption text-amber-900"><strong>Marketing clearance is not recorded yet</strong>, so every photograph is treated as <strong>not cleared</strong>: delivery, Final Approved status or client acceptance does not give Ordift permission to advertise a client&apos;s photograph. Per-image clearance and authorised sharing need a database change that has not been authorised. The full <Link href="/admin/portfolio" className="underline">Portfolio administration</Link> page remains separate.</p>
      </div>

      {!data ? <p className="font-sans text-body-small text-ordift-ink-muted">Job photographs are private. They are shown to a Super Admin or executive admin only.</p> : (
        <>
          <form method="get" className="grid grid-cols-1 gap-2 sm:grid-cols-4">
            <input name="q" defaultValue={sp.q ?? ""} placeholder="Search file, job or reference" aria-label="Search" className="rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small sm:col-span-2" />
            <select name="kind" defaultValue={sp.kind ?? ""} aria-label="Classification" className="rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small"><option value="">Any classification</option>{data.kinds.map((k) => <option key={k} value={k}>{k.replace(/_/g, " ")}</option>)}</select>
            <select name="service" defaultValue={sp.service ?? ""} aria-label="Service" className="rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small"><option value="">Any service</option>{data.services.map((s) => <option key={s} value={s}>{s.replace(/_/g, " ")}</option>)}</select>
            <button className="rounded-md bg-ordift-ink px-4 py-2 font-sans text-body-small text-white sm:col-span-4 sm:w-40">Filter</button>
          </form>
          <PortfolioPicker files={data.files} />
        </>
      )}
    </div>
  );
}
