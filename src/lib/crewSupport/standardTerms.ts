import { getLegalDocument } from "@/lib/legal/registry";
import { siteUrl } from "@/lib/shared/env";

// Reference to Ordift's APPROVED Master Booking Terms & Conditions
// (OS-LGL-004). This only POINTS at the existing approved document (title,
// code, version and its live URL, read from the legal registry) — it never
// restates or invents legal terms. Whether those terms apply to a given
// Creative Crew Support engagement is the business owner's decision, so the
// sentence is offered as an explicit "insert" action in the quotation
// editor, never added silently. Returns null if the document isn't
// registered as approved.
export function approvedBookingTermsReference(): string | null {
  const doc = getLegalDocument("booking");
  if (!doc || doc.control.status !== "approved") return null;
  const c = doc.control;
  return `This quotation is subject to Ordift Studios' ${c.documentTitle} (${c.documentCode}, version ${c.version}), available at ${siteUrl()}/legal/booking.`;
}
