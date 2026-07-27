import type { Metadata } from "next";
import Link from "next/link";
import { getAllWorkshopRegistrations } from "@/lib/portal/data";
import { REGISTRATION_STATUSES, PAYMENT_STATUSES } from "@/lib/admin/bookings";
import { contentRepository } from "@/lib/content";
import ReportExportLinks from "@/components/admin/ReportExportLinks";

export const metadata: Metadata = {
  title: "Bookings — Ordift Studios Admin",
  robots: { index: false, follow: false },
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

type BookingsSearchParams = {
  status?: string;
  q?: string;
  workshop?: string;
  paymentStatus?: string;
  dateFrom?: string;
  dateTo?: string;
};

function buildHref(params: BookingsSearchParams) {
  const search = new URLSearchParams();
  if (params.status) search.set("status", params.status);
  if (params.q) search.set("q", params.q);
  if (params.workshop) search.set("workshop", params.workshop);
  if (params.paymentStatus) search.set("paymentStatus", params.paymentStatus);
  if (params.dateFrom) search.set("dateFrom", params.dateFrom);
  if (params.dateTo) search.set("dateTo", params.dateTo);
  const qs = search.toString();
  return qs ? `/admin/bookings?${qs}` : "/admin/bookings";
}

export default async function AdminBookingsPage({
  searchParams,
}: {
  searchParams: Promise<BookingsSearchParams>;
}) {
  const { status, q, workshop, paymentStatus, dateFrom, dateTo } = await searchParams;

  const [registrations, workshops] = await Promise.all([
    getAllWorkshopRegistrations({
      search: q,
      status,
      workshopSlug: workshop,
      paymentStatus,
      dateFrom,
      dateTo,
    }),
    contentRepository.getWorkshops(),
  ]);

  const exportSearchParams = new URLSearchParams();
  if (q) exportSearchParams.set("search", q);
  if (status) exportSearchParams.set("status", status);
  if (workshop) exportSearchParams.set("workshopOrService", workshop);
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
            Bookings
          </h1>
          <p className="font-sans text-body-small text-ordift-ink-muted mt-2">{registrations.length} shown</p>
        </div>
        <ReportExportLinks
          exportBaseHref="/api/admin/reports/workshopRegistrations/export"
          searchParams={exportSearchParams}
        />
      </div>

      <form action="/admin/bookings" className="mb-6 flex flex-wrap gap-3 items-end">
        <div className="flex flex-col gap-1">
          <label htmlFor="bookings-q" className="font-sans text-caption text-ordift-ink-muted">
            Search
          </label>
          <input
            id="bookings-q"
            type="search"
            name="q"
            defaultValue={q}
            placeholder="Name, email, phone, workshop…"
            className="min-h-11 rounded-lg border border-black/15 bg-white px-3 font-sans text-body-small text-ordift-ink min-w-[220px]"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="bookings-workshop" className="font-sans text-caption text-ordift-ink-muted">
            Workshop
          </label>
          <select
            id="bookings-workshop"
            name="workshop"
            defaultValue={workshop ?? ""}
            className="min-h-11 rounded-lg border border-black/15 bg-white px-3 font-sans text-body-small text-ordift-ink"
          >
            <option value="">All workshops</option>
            {workshops.map((w) => (
              <option key={w.slug} value={w.slug}>
                {w.title}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="bookings-payment" className="font-sans text-caption text-ordift-ink-muted">
            Payment Status
          </label>
          <select
            id="bookings-payment"
            name="paymentStatus"
            defaultValue={paymentStatus ?? ""}
            className="min-h-11 rounded-lg border border-black/15 bg-white px-3 font-sans text-body-small text-ordift-ink"
          >
            <option value="">All payment statuses</option>
            {PAYMENT_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="bookings-from" className="font-sans text-caption text-ordift-ink-muted">
            From
          </label>
          <input
            id="bookings-from"
            type="date"
            name="dateFrom"
            defaultValue={dateFrom}
            className="min-h-11 rounded-lg border border-black/15 bg-white px-3 font-sans text-body-small text-ordift-ink"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="bookings-to" className="font-sans text-caption text-ordift-ink-muted">
            To
          </label>
          <input
            id="bookings-to"
            type="date"
            name="dateTo"
            defaultValue={dateTo}
            className="min-h-11 rounded-lg border border-black/15 bg-white px-3 font-sans text-body-small text-ordift-ink"
          />
        </div>
        {status && <input type="hidden" name="status" value={status} />}
        <button
          type="submit"
          className="min-h-11 px-4 rounded-full bg-ordift-navy-950 text-white font-sans text-body-small"
        >
          Apply Filters
        </button>
      </form>

      <div className="mb-8 flex flex-wrap gap-2">
        <Link
          href={buildHref({ q, workshop, paymentStatus, dateFrom, dateTo })}
          className={`px-3 py-1.5 rounded-full font-sans text-caption border ${
            !status ? "bg-ordift-navy-950 text-white border-ordift-navy-950" : "border-black/15 text-ordift-ink"
          }`}
        >
          All Statuses
        </Link>
        {REGISTRATION_STATUSES.map((s) => (
          <Link
            key={s}
            href={buildHref({ status: s, q, workshop, paymentStatus, dateFrom, dateTo })}
            className={`px-3 py-1.5 rounded-full font-sans text-caption border whitespace-nowrap ${
              status === s ? "bg-ordift-navy-950 text-white border-ordift-navy-950" : "border-black/15 text-ordift-ink"
            }`}
          >
            {s}
          </Link>
        ))}
      </div>

      {registrations.length === 0 ? (
        <p className="font-sans text-body-small text-ordift-ink-muted">No bookings match these filters.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-black/10 bg-white">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-black/10">
                <th className="font-sans text-caption uppercase tracking-wide text-ordift-ink-muted py-3 px-4">
                  Contact
                </th>
                <th className="font-sans text-caption uppercase tracking-wide text-ordift-ink-muted py-3 px-4">
                  Workshop
                </th>
                <th className="font-sans text-caption uppercase tracking-wide text-ordift-ink-muted py-3 px-4">
                  Status
                </th>
                <th className="font-sans text-caption uppercase tracking-wide text-ordift-ink-muted py-3 px-4">
                  Payment
                </th>
                <th className="font-sans text-caption uppercase tracking-wide text-ordift-ink-muted py-3 px-4">
                  Registered
                </th>
              </tr>
            </thead>
            <tbody>
              {registrations.map((r) => (
                <tr key={r.id} className="border-b border-black/5 last:border-0 hover:bg-ordift-offwhite">
                  <td className="py-3 px-4">
                    <Link href={`/admin/bookings/${r.id}`} className="block">
                      <p className="font-sans text-body-small text-ordift-ink font-medium">{r.fullName}</p>
                      <p className="font-sans text-caption text-ordift-ink-muted">{r.email}</p>
                      {r.phone && <p className="font-sans text-caption text-ordift-ink-muted">{r.phone}</p>}
                      <p className="font-sans text-caption text-ordift-ink-muted">{r.registrationReference}</p>
                    </Link>
                  </td>
                  <td className="py-3 px-4 font-sans text-body-small text-ordift-ink">{r.workshopTitle}</td>
                  <td className="py-3 px-4 font-sans text-body-small text-ordift-ink-muted">
                    {r.registrationStatus}
                    {r.registrationStatus === "Waitlisted" && r.waitingListPosition
                      ? ` (${r.waitingListPosition})`
                      : ""}
                  </td>
                  <td className="py-3 px-4 font-sans text-body-small text-ordift-ink-muted">{r.paymentStatus}</td>
                  <td className="py-3 px-4 font-sans text-body-small text-ordift-ink-muted whitespace-nowrap">
                    {formatDate(r.registrationDate)}
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
