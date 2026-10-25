// Pure, dependency-free wording and rules about a quotation's state. Kept free of imports so a CLIENT component can use it without pulling server-only code into the browser bundle.

type Q = { status: string; reference: string; version?: number; currency: string; total: number };

export const quotationHref = (id: string) => `/admin/pricing/quotations/${id}`;
const STATUS_WORD: Record<string, string> = { draft: "Draft", ready: "Ready (reviewed, not issued)", sent: "Issued and sent", accepted: "Accepted", declined: "Declined", expired: "Expired", superseded: "Superseded" };
export const quotationStatusWord = (status: string) => STATUS_WORD[status] ?? status;
export const quotationLine = (q: Q) =>
  `${q.reference}${q.version ? ` · version ${q.version}` : ""} · ${q.currency} ${q.total.toFixed(2)} · ${quotationStatusWord(q.status)}`;

// What should happen next, from the quotation alone. Drafting is not issuing: a draft has not been issued or sent, the client has not seen it, and it sets no amount due,
// booking, payment or receivable. Each later step is its own deliberate act.
export function nextActionFor(q: { status: string } | null, amountDue: number | null = null, extra: { delivered?: boolean; expired?: boolean } = {}): string {
  if (!q) return "Save the price you communicated, then choose Proceed to quotation to create a draft quotation.";
  if (q.status === "draft") return "Review the draft quotation and, when you are satisfied, issue it from the quotation page. Creating a draft has not sent anything to the client.";
  if (q.status === "ready") return "The draft has been reviewed. Issue it from the quotation page when you are ready to send it to the client.";
  if (q.status === "sent") {
    if (extra.expired) return "This quotation has expired and can no longer be accepted. Use Revise on the quotation page to create a new version, then issue that.";
    if (extra.delivered === false) return "Deliver the quotation to the client yourself (issuing did not send it), then record the delivery on the quotation page. Record their acceptance when you receive it.";
    if (extra.delivered === undefined) return "Make sure the client has the quotation (issuing does not send it) and record the delivery on the quotation page, then record their acceptance when you receive it.";
    return "Waiting for the client. Record their acceptance on the quotation when you receive it.";
  }
  if (q.status === "accepted") return amountDue != null && amountDue > 0 ? "The amount due is set. Next: payment and booking, each handled in its own step." : "Establish the amount due in the Quotation and amount due panel. Acceptance does not set it automatically.";
  return "This quotation is closed. Create or revise a quotation if the client wants to continue.";
}

