import type { Metadata } from "next";
import Link from "next/link";
import { getAllEnquiries, crmStageLabel } from "@/lib/portal/data";
import { CRM_STAGES } from "@/lib/admin/enquiries";
import { PATHWAYS, pathwayLabel } from "@/lib/enquiry/pathways";
import ReportExportLinks from "@/components/admin/ReportExportLinks";

export const metadata: Metadata = {
  title: "Enquiries — Ordift Studios Admin",
  robots: { index: false, follow: false },
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

type EnquiriesSearchParams = {
  stage?: string;
  q?: string;
  service?: string;
  paymentStatus?: string;
  dateFrom?: string;
  dateTo?: string;
};

function buildHref(params: EnquiriesSearchParams) {
  const search = new URLSearchParams();
  if (params.stage) search.set("stage", params.stage);
  if (params.q) search.set("q", params.q);
  if (params.service) search.set("service", params.service);
  if (params.paymentStatus) search.set("paymentStatus", params.paymentStatus);
  if (params.dateFrom) search.set("dateFrom", params.dateFrom);
  if (params.dateTo) search.set("dateTo", params.dateTo);
  const qs = search.toString();
  return qs ? `/admin/enquiries?${qs}` : "/admin/enquiries";
}

export default async function AdminEnquiriesPage({
  searchParams,
}: {
  searchParams: Promise<EnquiriesSearchParams>;
}) {
  const { stage, q, service, paymentStatus, dateFrom, dateTo } = await searchParams;

  const enquiries = await getAllEnquiries({
    search: q,
    stage,
    service,
    paymentStatus,
    dateFrom,
    dateTo,
  });

  const exportSearchParams = new URLSearchParams();
  if (q) exportSearchParams.set("search", q);
  if (stage) exportSearchParams.set("status", stage);
  if (service) exportSearchParams.set("workshopOrService", service);
  if (paymentStatus) exportSearchParams.set("paymentStatus", paymentStatus);
  if (dateFrom) exportSearchParams.set("dateFrom", dateFrom);
  if (dateTo) exportSearchParams.set("dateTo", dateTo);

  return (
    <div>
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-sans font-semibold uppercase tracking-[0.2em] text-eyebrow text-ordift-gold-pressed mb-2">
            Admin
          </p>
          <h1 className="font-serif font-medium text-section-heading lg:text-section-heading-desktop text-ordift-ink">
            Enquiries
          </h1>
          <p className="font-sans text-body-small text-ordift-ink-muted mt-2">{enquiries.length} shown</p>
        </div>
        <ReportExportLinks
          exportBaseHref="/api/admin/reports/contactEnquiries/export"
          searchParams={exportSearchParams}
        />
      </div>

      <form action="/admin/enquiries" className="mb-6 flex flex-wrap gap-3 items-end">
        <div className="flex flex-col gap-1">
          <label htmlFor="enquiries-q" className="font-sans text-caption text-ordift-ink-muted">
            Search
          </label>
          <input
            id="enquiries-q"
            type="search"
            name="q"
            defaultValue={q}
            placeholder="Name, email, phone, reference…"
            className="min-h-11 rounded-lg border border-black/15 bg-white px-3 font-sans text-body-small text-ordift-ink min-w-[220px]"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="enquiries-service" className="font-sans text-caption text-ordift-ink-muted">
            Service
          </label>
          <select
            id="enquiries-service"
            name="service"
            defaultValue={service ?? ""}
            className="min-h-11 rounded-lg border border-black/15 bg-white px-3 font-sans text-body-small text-ordift-ink"
          >
            <option value="">All services</option>
            {PATHWAYS.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="enquiries-payment" className="font-sans text-caption text-ordift-ink-muted">
            Payment Status
          </label>
          <input
            id="enquiries-payment"
            type="text"
            name="paymentStatus"
            defaultValue={paymentStatus}
            placeholder="e.g. Paid"
            className="min-h-11 rounded-lg border border-black/15 bg-white px-3 font-sans text-body-small text-ordift-ink w-36"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="enquiries-from" className="font-sans text-caption text-ordift-ink-muted">
            From
          </label>
          <input
            id="enquiries-from"
            type="date"
            name="dateFrom"
            defaultValue={dateFrom}
            className="min-h-11 rounded-lg border border-black/15 bg-white px-3 font-sans text-body-small text-ordift-ink"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="enquiries-to" className="font-sans text-caption text-ordift-ink-muted">
            To
          </label>
          <input
            id="enquiries-to"
            type="date"
            name="dateTo"
            defaultValue={dateTo}
            className="min-h-11 rounded-lg border border-black/15 bg-white px-3 font-sans text-body-small text-ordift-ink"
          />
        </div>
        {stage && <input type="hidden" name="stage" value={stage} />}
        <button
          type="submit"
          className="min-h-11 px-4 rounded-full bg-ordift-navy-950 text-white font-sans text-body-small"
        >
          Apply Filters
        </button>
      </form>

      <div className="mb-8 flex flex-wrap gap-2">
        <Link
          href={buildHref({ q, service, paymentStatus, dateFrom, dateTo })}
          className={`px-3 py-1.5 rounded-full font-sans text-caption border ${
            !stage ? "bg-ordift-navy-950 text-white border-ordift-navy-950" : "border-black/15 text-ordift-ink"
          }`}
        >
          All Stages
        </Link>
        {CRM_STAGES.map((s) => (
          <Link
            key={s}
            href={buildHref({ stage: s, q, service, paymentStatus, dateFrom, dateTo })}
            className={`px-3 py-1.5 rounded-full font-sans text-caption border whitespace-nowrap ${
              stage === s ? "bg-ordift-navy-950 text-white border-ordift-navy-950" : "border-black/15 text-ordift-ink"
            }`}
          >
            {crmStageLabel(s)}
          </Link>
        ))}
      </div>

      {enquiries.length === 0 ? (
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
                  Payment
                </th>
                <th className="font-sans text-caption uppercase tracking-wide text-ordift-ink-muted py-3 px-4">
                  Submitted
                </th>
              </tr>
            </thead>
            <tbody>
              {enquiries.map((e) => (
                <tr key={e.id} className="border-b border-black/5 last:border-0 hover:bg-ordift-offwhite">
                  <td className="py-3 px-4">
                    <Link href={`/admin/enquiries/${e.id}`} className="block">
                      <p className="font-sans text-body-small text-ordift-ink font-medium">{e.fullName}</p>
                      <p className="font-sans text-caption text-ordift-ink-muted">{e.email}</p>
                      {e.phone && <p className="font-sans text-caption text-ordift-ink-muted">{e.phone}</p>}
                      <p className="font-sans text-caption text-ordift-ink-muted">{e.referenceNumber}</p>
                    </Link>
                  </td>
                  <td className="py-3 px-4 font-sans text-body-small text-ordift-ink">
                    {pathwayLabel(e.service)}
                  </td>
                  <td className="py-3 px-4 font-sans text-body-small text-ordift-ink-muted">
                    {crmStageLabel(e.crmStage)}
                  </td>
                  <td className="py-3 px-4 font-sans text-body-small text-ordift-ink-muted">
                    {e.paymentStatus ?? "—"}
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
