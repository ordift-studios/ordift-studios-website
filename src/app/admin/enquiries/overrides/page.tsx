import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser, isSuperAdmin } from "@/lib/portal/roles";
import { listAmountEvents } from "@/lib/commercial/amountDue";
import AmountEventsTable from "../[id]/AmountEventsTable";

export const metadata: Metadata = {
  title: "Amount-due register — Ordift Studios Admin",
  robots: { index: false, follow: false },
};

// Enquiry-to-booking M2a — the reviewable register of every amount-due establishment and Super Admin override. Read-only; the underlying ledger is append-only.
export default async function AmountDueRegisterPage({ searchParams }: { searchParams: Promise<{ enquiry?: string; kind?: string; from?: string; to?: string }> }) {
  const user = await getCurrentUser();
  if (!user || !isSuperAdmin(user)) redirect("/admin/overview");
  const sp = await searchParams;
  const kind = sp.kind === "override" || sp.kind === "established" ? sp.kind : undefined;
  const from = sp.from && /^\d{4}-\d{2}-\d{2}$/.test(sp.from) ? `${sp.from}T00:00:00Z` : undefined;
  const to = sp.to && /^\d{4}-\d{2}-\d{2}$/.test(sp.to) ? `${sp.to}T23:59:59Z` : undefined;
  const result = await listAmountEvents({ enquiryReference: sp.enquiry, kind, from, to });

  return (
    <div className="space-y-6 max-w-6xl">
      <div>
        <Link href="/admin/enquiries" className="font-sans text-body-small text-ordift-gold-pressed underline">← All Enquiries</Link>
        <h1 className="font-serif font-medium text-section-heading text-ordift-ink mt-3">Amount-due register</h1>
        <p className="font-sans text-body-small text-ordift-ink-muted mt-1">Every amount due established from an accepted quotation and every Super Admin override, with before and after values. Records here cannot be edited or deleted.</p>
      </div>
      <form method="get" className="flex flex-wrap items-end gap-3">
        <div>
          <label htmlFor="f-enquiry" className="font-sans text-caption text-ordift-ink-muted block mb-1">Enquiry reference</label>
          <input id="f-enquiry" name="enquiry" defaultValue={sp.enquiry ?? ""} className="rounded-lg border border-black/15 bg-white px-3 py-2 font-sans text-body-small" />
        </div>
        <div>
          <label htmlFor="f-kind" className="font-sans text-caption text-ordift-ink-muted block mb-1">Kind</label>
          <select id="f-kind" name="kind" defaultValue={kind ?? ""} className="rounded-lg border border-black/15 bg-white px-3 py-2 font-sans text-body-small">
            <option value="">All</option>
            <option value="override">Overrides</option>
            <option value="established">Established</option>
          </select>
        </div>
        <div>
          <label htmlFor="f-from" className="font-sans text-caption text-ordift-ink-muted block mb-1">From</label>
          <input id="f-from" name="from" type="date" defaultValue={sp.from ?? ""} className="rounded-lg border border-black/15 bg-white px-3 py-2 font-sans text-body-small" />
        </div>
        <div>
          <label htmlFor="f-to" className="font-sans text-caption text-ordift-ink-muted block mb-1">To</label>
          <input id="f-to" name="to" type="date" defaultValue={sp.to ?? ""} className="rounded-lg border border-black/15 bg-white px-3 py-2 font-sans text-body-small" />
        </div>
        <button type="submit" className="min-h-11 px-5 rounded-full bg-ordift-navy-950 text-white font-sans text-body-small">Filter</button>
      </form>
      {result.ok ? <AmountEventsTable rows={result.value} showEnquiry /> : <p role="alert" className="font-sans text-body-small text-red-700">{result.error}</p>}
    </div>
  );
}
