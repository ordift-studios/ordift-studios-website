// Reusable "Export CSV / Export XLSX" pair — used by /admin/enquiries,
// /admin/bookings, and /admin/reports so every filterable list gets the
// same export affordance for free. Plain links, not a form: the
// current filters are already in the page's own URL, so building the
// export URL is just swapping the path and adding `format`.
export default function ReportExportLinks({
  exportBaseHref,
  searchParams,
}: {
  exportBaseHref: string;
  searchParams: URLSearchParams;
}) {
  const csvHref = `${exportBaseHref}?${new URLSearchParams([...searchParams, ["format", "csv"]]).toString()}`;
  const xlsxHref = `${exportBaseHref}?${new URLSearchParams([...searchParams, ["format", "xlsx"]]).toString()}`;

  return (
    <div className="flex gap-2">
      <a
        href={csvHref}
        className="min-h-11 px-4 inline-flex items-center rounded-full border border-black/15 text-ordift-ink font-sans text-body-small hover:border-black/30"
      >
        Export CSV
      </a>
      <a
        href={xlsxHref}
        className="min-h-11 px-4 inline-flex items-center rounded-full border border-black/15 text-ordift-ink font-sans text-body-small hover:border-black/30"
      >
        Export Excel
      </a>
    </div>
  );
}
