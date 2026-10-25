"use client";

import Link from "next/link";
import { useActionState } from "react";
import { conversionFacts, conversionNext, conversionNotice, type ConversionResult, type ExistingConversion } from "@/lib/enquiry/conversionNotice";
import { convertAction } from "./pricingActions";

const TONE = { success: "border-green-300 bg-green-50 text-green-900", info: "border-black/15 bg-ordift-offwhite text-ordift-ink", error: "border-red-300 bg-red-50 text-red-900" } as const;

// "Proceed to quotation". The panel stays mounted across the refresh that follows a successful press, so the confirmation is never lost; once a draft exists the button
// is replaced by the facts of that draft and a direct link to it. While the request runs the button is disabled and says so, and a failure says nothing was created and
// that trying again is safe (the server can only ever create one quotation per enquiry).
export default function ConvertPanel({ enquiryId, existing }: { enquiryId: string; existing: ExistingConversion | null }) {
  const [result, act, pending] = useActionState(convertAction as (p: ConversionResult, f: FormData) => Promise<ConversionResult>, null as ConversionResult);
  const notice = conversionNotice(result, existing);
  return (
    <div className="space-y-3">
      <div aria-live="polite" aria-atomic="true" role={notice?.tone === "error" ? "alert" : "status"}>
        {notice && (
          <div className={`rounded-lg border p-3 ${TONE[notice.tone]}`}>
            <p className="font-sans text-body-small font-semibold">{notice.title}</p>
            <p className="font-sans text-body-small">{notice.body}</p>
          </div>
        )}
      </div>
      {existing ? (
        <div className="space-y-3 rounded-lg border border-black/10 p-3">
          <dl className="grid grid-cols-1 gap-x-6 gap-y-1 sm:grid-cols-2">
            {conversionFacts(existing).map((f) => (
              <div key={f.label} className="flex items-baseline justify-between gap-3 border-b border-black/5 py-1 sm:block sm:border-0">
                <dt className="font-sans text-caption text-ordift-ink-muted">{f.label}</dt>
                <dd className="font-sans text-body-small font-medium text-ordift-ink">{f.value}</dd>
              </div>
            ))}
          </dl>
          <p className="font-sans text-body-small text-ordift-ink"><span className="font-semibold">Next:</span> {conversionNext(existing)}</p>
          <Link href={`/admin/pricing/quotations/${existing.quotationId}`} className="inline-flex min-h-11 w-full items-center justify-center rounded-md bg-ordift-ink px-4 py-2 font-sans text-body-small text-white sm:w-auto">
            {existing.status === "draft" ? "View draft quotation" : "View quotation"}
          </Link>
        </div>
      ) : (
        <form action={act} className="space-y-2">
          <input type="hidden" name="enquiryId" value={enquiryId} />
          <button disabled={pending} aria-busy={pending} className="inline-flex min-h-11 w-full items-center justify-center rounded-md bg-ordift-ink px-4 py-2 font-sans text-body-small text-white disabled:opacity-60 sm:w-auto">
            {pending ? "Creating the draft…" : result && !result.ok ? "Try again" : "Proceed to quotation"}
          </button>
          <p className="font-sans text-caption text-ordift-ink-muted">Creates one DRAFT quotation from the latest communicated price. It is not issued or sent. No booking, payment, revenue, agreement or payable is created, and pressing it again never makes a second one.</p>
        </form>
      )}
    </div>
  );
}
