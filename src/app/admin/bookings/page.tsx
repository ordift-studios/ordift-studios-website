import type { Metadata } from "next";
import Link from "next/link";
import { getAllWorkshopRegistrations } from "@/lib/portal/data";
import { REGISTRATION_STATUSES } from "@/lib/admin/bookings";

export const metadata: Metadata = {
  title: "Bookings — Ordift Studios Admin",
  robots: { index: false, follow: false },
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function buildHref(params: { status?: string; q?: string }) {
  const search = new URLSearchParams();
  if (params.status) search.set("status", params.status);
  if (params.q) search.set("q", params.q);
  const qs = search.toString();
  return qs ? `/admin/bookings?${qs}` : "/admin/bookings";
}

export default async function AdminBookingsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string }>;
}) {
  const { status, q } = await searchParams;
  const registrations = await getAllWorkshopRegistrations();

  const filtered = registrations.filter((r) => {
    if (status && r.registrationStatus !== status) return false;
    if (q) {
      const needle = q.toLowerCase();
      const haystack = `${r.registrationReference} ${r.fullName} ${r.email} ${r.workshopTitle}`.toLowerCase();
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
          Bookings
        </h1>
        <p className="font-sans text-body-small text-ordift-ink-muted mt-2">
          {filtered.length} of {registrations.length} shown
        </p>
      </div>

      <form action="/admin/bookings" className="mb-6 flex flex-wrap gap-3 items-center">
        <input
          type="search"
          name="q"
          defaultValue={q}
          placeholder="Search name, email, workshop…"
          className="min-h-11 rounded-lg border border-black/15 bg-white px-3 font-sans text-body-small text-ordift-ink flex-1 min-w-[240px]"
        />
        {status && <input type="hidden" name="status" value={status} />}
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
            !status ? "bg-ordift-navy-950 text-white border-ordift-navy-950" : "border-black/15 text-ordift-ink"
          }`}
        >
          All Statuses
        </Link>
        {REGISTRATION_STATUSES.map((s) => (
          <Link
            key={s}
            href={buildHref({ status: s, q })}
            className={`px-3 py-1.5 rounded-full font-sans text-caption border whitespace-nowrap ${
              status === s ? "bg-ordift-navy-950 text-white border-ordift-navy-950" : "border-black/15 text-ordift-ink"
            }`}
          >
            {s}
          </Link>
        ))}
      </div>

      {filtered.length === 0 ? (
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
              {filtered.map((r) => (
                <tr key={r.id} className="border-b border-black/5 last:border-0 hover:bg-ordift-offwhite">
                  <td className="py-3 px-4">
                    <Link href={`/admin/bookings/${r.id}`} className="block">
                      <p className="font-sans text-body-small text-ordift-ink font-medium">{r.fullName}</p>
                      <p className="font-sans text-caption text-ordift-ink-muted">{r.email}</p>
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
