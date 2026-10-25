import { nextActionFor, quotationStatusWord } from "./quotationState";
import { isExpired, quotationDates, utcDate } from "../commercial/quotationValidity";

// Pure wording for the "Proceed to quotation" step. Creating a DRAFT is not issuing: the draft has not been sent, the client has not seen it, and it sets no amount due,
// booking, payment, receivable or revenue. The same facts are shown whether the draft was just created, found already existing, or looked at later.

export type ConversionResult = { ok: boolean; message: string; kind?: "created" | "found"; reference?: string; quotationId?: string } | null;
export type ExistingConversion = { quotationId: string; quotationReference: string; version: number; status: string; currency: string; total: number; issuedAt: string | null; acceptedAt: string | null; createdAt?: string; validUntil?: string | null };
export type Notice = { tone: "success" | "info" | "error"; title: string; body: string };

export const NOT_CREATED = "Creating a draft does not issue or email the quotation, record client acceptance, set an amount due, or create a booking, payment, receivable or revenue.";

export function conversionNotice(result: ConversionResult, existing: ExistingConversion | null): Notice | null {
  if (result && !result.ok) return { tone: "error", title: "The draft quotation could not be created", body: `${result.message} Nothing was created. You can try again: pressing the button again can never create a second quotation.` };
  if (result?.ok && result.kind === "created") return { tone: "success", title: "Draft quotation created", body: `${result.reference ?? existing?.quotationReference ?? "The draft quotation"} was created for this enquiry from the latest communicated price. ${NOT_CREATED}` };
  if (result?.ok && result.kind === "found") return { tone: "info", title: "A quotation already exists for this enquiry", body: `${result.reference ?? existing?.quotationReference ?? "The quotation"} was found and no duplicate was created. Nothing was changed.` };
  if (existing) return { tone: "info", title: existing.status === "draft" ? "Draft quotation on this enquiry" : "Quotation on this enquiry", body: existing.status === "draft" ? NOT_CREATED : "It was created from this enquiry's communicated price and is now handled on the quotation page." };
  return null;
}

export function conversionFacts(c: ExistingConversion, today: string = utcDate(new Date())): { label: string; value: string }[] {
  const issued = c.issuedAt != null || c.status === "sent" || c.status === "accepted";
  const d = c.createdAt ? quotationDates({ createdAt: c.createdAt, issuedAt: c.issuedAt, validUntil: c.validUntil ?? null, status: c.status }, today) : null;
  return [
    { label: "Reference", value: c.quotationReference },
    { label: "Version", value: String(c.version) },
    { label: "Status", value: quotationStatusWord(c.status) },
    { label: "Amount", value: `${c.currency} ${c.total.toFixed(2)}` },
    ...(d ? [{ label: "Created on", value: d.createdText }, { label: "Issued on", value: d.issuedText }, { label: "Valid until", value: d.validText }] : []),
    { label: "Issued or sent", value: issued ? "Yes" : "No" },
    { label: "Client acceptance", value: c.acceptedAt ? "Accepted" : "Not yet" },
  ];
}

export const conversionNext = (c: ExistingConversion, today: string = utcDate(new Date())) => nextActionFor({ status: c.status }, null, { expired: isExpired(c.status, c.validUntil, today) });
