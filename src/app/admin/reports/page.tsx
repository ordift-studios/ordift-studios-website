import type { Metadata } from "next";
import Link from "next/link";
import { listReportModules } from "@/lib/admin/reports/registry";
import { listSummaryReportModules } from "@/lib/admin/reports/summaryModules";
import { emailReportAction } from "./actions";

export const metadata: Metadata = {
  title: "Reports — Ordift Studios Admin",
  robots: { index: false, follow: false },
};

function buildExportHref(
  kind: "module" | "summary",
  key: string,
  format: "csv" | "xlsx",
  dateFrom?: string,
  dateTo?: string
): string {
  const base =
    kind === "summary" ? `/api/admin/reports/summary/${key}/export` : `/api/admin/reports/${key}/export`;
  const search = new URLSearchParams({ format });
  if (dateFrom) search.set("dateFrom", dateFrom);
  if (dateTo) search.set("dateTo", dateTo);
  return `${base}?${search.toString()}`;
}

export default async function AdminReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ sent?: string; error?: string; mode?: string; dateFrom?: string; dateTo?: string }>;
}) {
  const { sent, error, mode, dateFrom, dateTo } = await searchParams;
  const liveModules = listReportModules().filter((m) => m.live);
  const reservedModules = listReportModules().filter((m) => !m.live);
  const summaryModules = listSummaryReportModules();

  return (
    <div>
      <div className="mb-8">
        <p className="font-sans font-semibold uppercase tracking-[0.2em] text-eyebrow text-ordift-gold-pressed mb-2">
          Admin
        </p>
        <h1 className="font-serif font-medium text-section-heading lg:text-section-heading-desktop text-ordift-ink">
          Reports
        </h1>
        <p className="font-sans text-body-small text-ordift-ink-muted mt-2">
          Download or email operational reports. For fine-grained search and filtering, use{" "}
          <Link href="/admin/enquiries" className="underline">
            Enquiries
          </Link>{" "}
          or{" "}
          <Link href="/admin/bookings" className="underline">
            Bookings
          </Link>{" "}
          directly — every list there has its own Export CSV/Excel buttons too.
        </p>
      </div>

      {sent && (
        <div className="mb-6 rounded-lg border border-green-600/30 bg-green-50 px-4 py-3 font-sans text-body-small text-green-900">
          {mode === "sent"
            ? `"${sent}" report emailed to Operations.`
            : `"${sent}" report generated (staging test mode — logged, not actually sent; see server logs).`}
        </div>
      )}
      {error && (
        <div className="mb-6 rounded-lg border border-red-600/30 bg-red-50 px-4 py-3 font-sans text-body-small text-red-900">
          Couldn&apos;t send that report ({error}). Check RESEND_API_KEY / EMAIL_FROM_ADDRESS / OPERATIONS_EMAIL
          are configured, then try again.
        </div>
      )}

      <form
        method="GET"
        className="mb-8 flex flex-wrap items-end gap-3 rounded-xl border border-black/10 bg-white p-4"
      >
        <div className="flex flex-col gap-1">
          <label htmlFor="reports-from" className="font-sans text-caption text-ordift-ink-muted">
            Date range from
          </label>
          <input
            id="reports-from"
            type="date"
            name="dateFrom"
            defaultValue={dateFrom}
            className="min-h-11 rounded-lg border border-black/15 bg-white px-3 font-sans text-body-small text-ordift-ink"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="reports-to" className="font-sans text-caption text-ordift-ink-muted">
            to
          </label>
          <input
            id="reports-to"
            type="date"
            name="dateTo"
            defaultValue={dateTo}
            className="min-h-11 rounded-lg border border-black/15 bg-white px-3 font-sans text-body-small text-ordift-ink"
          />
        </div>
        <button
          type="submit"
          className="min-h-11 px-4 rounded-full bg-ordift-navy-950 text-white font-sans text-body-small"
        >
          Apply to reports below
        </button>
        <p className="font-sans text-caption text-ordift-ink-muted">
          Optional — leave blank for all-time. Applies to every report card below except Monthly Summary, which
          is always grouped by calendar month.
        </p>
      </form>

      <h2 className="font-serif text-body-large text-ordift-ink mb-4">Live Reports</h2>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 mb-10">
        {liveModules.map((m) => (
          <div key={m.key} className="rounded-xl border border-black/10 bg-white p-5 flex flex-col gap-3">
            <h3 className="font-sans font-semibold text-body text-ordift-ink">{m.label}</h3>
            <div className="flex flex-wrap gap-2">
              <a
                href={buildExportHref("module", m.key, "csv", dateFrom, dateTo)}
                className="min-h-11 px-3 inline-flex items-center rounded-full border border-black/15 text-ordift-ink font-sans text-caption hover:border-black/30"
              >
                Download CSV
              </a>
              <a
                href={buildExportHref("module", m.key, "xlsx", dateFrom, dateTo)}
                className="min-h-11 px-3 inline-flex items-center rounded-full border border-black/15 text-ordift-ink font-sans text-caption hover:border-black/30"
              >
                Download Excel
              </a>
            </div>
            <form action={emailReportAction}>
              <input type="hidden" name="kind" value="module" />
              <input type="hidden" name="key" value={m.key} />
              {dateFrom && <input type="hidden" name="dateFrom" value={dateFrom} />}
              {dateTo && <input type="hidden" name="dateTo" value={dateTo} />}
              <button
                type="submit"
                className="min-h-11 w-full px-3 rounded-full bg-ordift-gold text-ordift-navy-950 font-sans font-semibold text-caption hover:bg-ordift-gold-hover"
              >
                Email to Operations
              </button>
            </form>
          </div>
        ))}
      </div>

      <h2 className="font-serif text-body-large text-ordift-ink mb-4">Summary Reports</h2>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 mb-10">
        {summaryModules.map((m) => (
          <div key={m.key} className="rounded-xl border border-black/10 bg-white p-5 flex flex-col gap-3">
            <h3 className="font-sans font-semibold text-body text-ordift-ink">{m.label}</h3>
            <div className="flex flex-wrap gap-2">
              <a
                href={buildExportHref("summary", m.key, "csv")}
                className="min-h-11 px-3 inline-flex items-center rounded-full border border-black/15 text-ordift-ink font-sans text-caption hover:border-black/30"
              >
                Download CSV
              </a>
              <a
                href={buildExportHref("summary", m.key, "xlsx")}
                className="min-h-11 px-3 inline-flex items-center rounded-full border border-black/15 text-ordift-ink font-sans text-caption hover:border-black/30"
              >
                Download Excel
              </a>
            </div>
            <form action={emailReportAction}>
              <input type="hidden" name="kind" value="summary" />
              <input type="hidden" name="key" value={m.key} />
              <button
                type="submit"
                className="min-h-11 w-full px-3 rounded-full bg-ordift-gold text-ordift-navy-950 font-sans font-semibold text-caption hover:bg-ordift-gold-hover"
              >
                Email to Operations
              </button>
            </form>
          </div>
        ))}
      </div>

      <h2 className="font-serif text-body-large text-ordift-ink mb-4">Not Yet Live</h2>
      <p className="font-sans text-body-small text-ordift-ink-muted mb-4">
        The worksheet and record ID prefix are already prepared for each of these — the report will populate
        automatically the moment the corresponding form exists (see RECORD_ID_STANDARD.md, GOOGLE_SHEETS_INTEGRATION.md).
      </p>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {reservedModules.map((m) => (
          <div key={m.key} className="rounded-xl border border-black/10 bg-ordift-offwhite p-5 opacity-60">
            <h3 className="font-sans font-semibold text-body text-ordift-ink">{m.label}</h3>
            <p className="font-sans text-caption text-ordift-ink-muted mt-1">No live form yet.</p>
          </div>
        ))}
      </div>
    </div>
  );
}
