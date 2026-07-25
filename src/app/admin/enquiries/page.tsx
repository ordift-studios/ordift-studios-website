import type { Metadata } from "next";
import Link from "next/link";
import { getAllEnquiries, crmStageLabel } from "@/lib/portal/data";
import { CRM_STAGES } from "@/lib/admin/enquiries";

export const metadata: Metadata = {
  title: "Enquiries — Ordift Studios Admin",
  robots: { index: false, follow: false },
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function buildHref(params: { stage?: string; q?: string }) {
  const search = new URLSearchParams();
  if (params.stage) search.set("stage", params.stage);
  if (params.q) search.set("q", params.q);
  const qs = search.toString();
  return qs ? `/admin/enquiries?${qs}` : "/admin/enquiries";
}

export default async function AdminEnquiriesPage({
  searchParams,
}: {
  searchParams: Promise<{ stage?: string; q?: string }>;
}) {
  const { stage, q } = await searchParams;
  const enquiries = await getAllEnquiries();

  const filtered = enquiries.filter((e) => {
    if (stage && e.crmStage !== stage) return false;
    if (q) {
      const needle = q.toLowerCase();
      const haystack = `${e.referenceNumber} ${e.fullName} ${e.email} ${e.service}`.toLowerCase();
      if (!haystack.includes(needle)) return false;
    }
    return true;
  });

  return (
    <div>
      <div className="mb-8">
        <p className="font-sans font-semibold uppercase tracking-[0.2em] text-eyebrow text-ordift-gold-pressed mb-2">
          Admin
        </p>
        <h1 className="font-serif font-medium text-section-heading lg:text-section-heading-desktop text-ordift-ink">
          Enquiries
        </h1>
        <p className="font-sans text-body-small text-ordift-ink-muted mt-2">
          {filtered.length} of {enquiries.length} shown
        </p>
      </div>

      <form action="/admin/enquiries" className="mb-6 flex flex-wrap gap-3 items-center">
        <input
          type="search"
          name="q"
          defaultValue={q}
          placeholder="Search name, email, reference…"
          className="min-h-11 rounded-lg border border-black/15 bg-white px-3 font-sans text-body-small text-ordift-ink flex-1 min-w-[240px]"
        />
        {stage && <input type="hidden" name="stage" value={stage} />}
        <button
          type="submit"
          className="min-h-11 px-4 rounded-full bg-ordift-navy-950 text-white font-sans text-body-small"
        >
          Search
        </button>
      </form>

      <div className="mb-8 flex flex-wrap gap-2">
        <Link
          href={buildHref({ q })}
          className={`px-3 py-1.5 rounded-full font-sans text-caption border ${
            !stage ? "bg-ordift-navy-950 text-white border-ordift-navy-950" : "border-black/15 text-ordift-ink"
          }`}
        >
          All Stages
        </Link>
        {CRM_STAGES.map((s) => (
          <Link
            key={s}
            href={buildHref({ stage: s, q })}
            className={`px-3 py-1.5 rounded-full font-sans text-caption border whitespace-nowrap ${
              stage === s ? "bg-ordift-navy-950 text-white border-ordift-navy-950" : "border-black/15 text-ordift-ink"
            }`}
          >
            {crmStageLabel(s)}
          </Link>
        ))}
      </div>

      {filtered.length === 0 ? (
        <p className="font-sans text-body-small text-ordift-ink-muted">No enquiries match these filters.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-black/10 bg-white">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-black/10">
                <th className="font-sans text-caption uppercase tracking-wide text-ordift-ink-muted py-3 px-4">
                  Contact
                </th>
                <th className="font-sans text-caption uppercase tracking-wide text-ordift-ink-muted py-3 px-4">
                  Service
                </th>
                <th className="font-sans text-caption uppercase tracking-wide text-ordift-ink-muted py-3 px-4">
                  Stage
                </th>
                <th className="font-sans text-caption uppercase tracking-wide text-ordift-ink-muted py-3 px-4">
                  Submitted
                </th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((e) => (
                <tr key={e.id} className="border-b border-black/5 last:border-0 hover:bg-ordift-offwhite">
                  <td className="py-3 px-4">
                    <Link href={`/admin/enquiries/${e.id}`} className="block">
                      <p className="font-sans text-body-small text-ordift-ink font-medium">{e.fullName}</p>
                      <p className="font-sans text-caption text-ordift-ink-muted">{e.email}</p>
                      <p className="font-sans text-caption text-ordift-ink-muted">{e.referenceNumber}</p>
                    </Link>
                  </td>
                  <td className="py-3 px-4 font-sans text-body-small text-ordift-ink capitalize">
                    {e.service.replace(/-/g, " ")}
                  </td>
                  <td className="py-3 px-4 font-sans text-body-small text-ordift-ink-muted">
                    {crmStageLabel(e.crmStage)}
                  </td>
                  <td className="py-3 px-4 font-sans text-body-small text-ordift-ink-muted whitespace-nowrap">
                    {formatDate(e.submittedAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
