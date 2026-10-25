import { CRM_STAGES } from "@/lib/admin/enquiries";
import { channelLabel } from "./staffIntake";
import { nextActionFor, quotationHref, quotationLine } from "./quotationState";
import { formatDate, isExpired, utcDate } from "../commercial/quotationValidity";

export { nextActionFor, quotationHref, quotationLine, quotationStatusWord } from "./quotationState";

// Consolidated, READ-ONLY workflow summary for an enquiry (M1). Pure.
//
// It only restates facts that already exist, so the four things people tend to blur stay visibly separate:
//   enquiry (a request) -> quotation issued (an offer) -> acceptance recorded (the client said yes) -> booking (the crm_stage "booked" or later).
// An accepted quotation does not set the amount due, create a payment obligation or confirm a booking; "booked" keeps its existing meaning. Nothing here
// changes a stage or a record.

export type StepState = "done" | "current" | "pending" | "not_applicable" | "unknown";
export type SummaryStep = {
  key: "enquiry" | "draft" | "quotation" | "delivery" | "acceptance" | "amount_due" | "payment" | "booking" | "entity";
  label: string;
  state: StepState;
  detail: string;
  answer?: "Yes" | "No"; // for the plain yes/no facts (draft created, issued or sent)
  href?: string;         // where to look at the record behind the line
  hrefLabel?: string;
};

export type QuotationFact = {
  id?: string;
  createdAt?: string;
  validUntil?: string | null;
  version?: number;
  reference: string;
  status: string; // draft | ready | sent | accepted | declined | expired | superseded
  issuedAt: string | null;
  acceptedAt: string | null;
  acceptedVia: string | null; // client_portal | staff_recorded
  acceptanceChannel: string | null;
  acceptedByName: string | null;
  currency: string;
  total: number;
  isTest: boolean;
};

export type WorkflowFacts = {
  stage: string;
  sourceChannel: string | null;
  receivedAt: string | null;
  submittedAt: string;
  staffRecorded: boolean;
  commercialIntent: string | null;
  amountDue: number | null;
  amountDueSource: string | null;
  amountPaid: number | null;
  paymentStatus: string | null;
  paymentCountry: "GH" | "QA" | null;
  quotations: QuotationFact[]; // newest first, superseded excluded
  contractingEntity: { name: string; version: number } | null | "hidden";
  emailsSuppressed: boolean;
  quotationDelivery?: { channel: string; deliveredAt: string } | null; // a person's record of delivering the quotation; the system never sends it
};

const ACCEPT_VIA: Record<string, string> = { client_portal: "by the client in the portal", staff_recorded: "recorded by staff" };
const day = (iso: string | null) => (iso ? iso.slice(0, 10) : "");
const usd = (n: number) => `USD ${n.toFixed(2)}`;

export function bookedOrLater(stage: string): boolean {
  const i = CRM_STAGES.indexOf(stage as (typeof CRM_STAGES)[number]);
  return i >= CRM_STAGES.indexOf("booked") && i >= 0 && stage !== "declined" && stage !== "closed";
}

export function summariseWorkflow(f: WorkflowFacts, today: string = utcDate(new Date())): { steps: SummaryStep[]; notes: string[]; next: string } {
  const steps: SummaryStep[] = [];
  const notes: string[] = [];
  const quotes = f.quotations.filter((q) => !q.isTest || f.quotations.every((x) => x.isTest));
  const accepted = quotes.find((q) => q.status === "accepted") ?? null;
  const issued = quotes.find((q) => q.status === "sent") ?? null;
  const preparing = quotes.find((q) => q.status === "draft" || q.status === "ready") ?? null;
  const closed = quotes.find((q) => q.status === "declined" || q.status === "expired") ?? null;
  const crew = f.commercialIntent === "creative_crew_support";

  steps.push({
    key: "enquiry",
    label: "Enquiry received",
    state: "done",
    detail: `${channelLabel(f.sourceChannel)}${f.staffRecorded ? ", recorded by staff" : ""} · ${day(f.receivedAt ?? f.submittedAt)}`,
  });

  // 1. Was a draft (or any quotation) created? Independent of whether it was issued.
  const primary = accepted ?? issued ?? preparing ?? closed ?? null;
  steps.push(primary
    ? { key: "draft", label: "Draft quotation created", state: "done", answer: "Yes", detail: `${quotationLine(primary)}${primary.createdAt ? ` · created ${formatDate(primary.createdAt)}` : ""}`, href: primary.id ? quotationHref(primary.id) : undefined, hrefLabel: primary.status === "draft" ? "View draft quotation" : "View quotation" }
    : { key: "draft", label: "Draft quotation created", state: "pending", answer: "No", detail: "No quotation exists for this enquiry yet" });

  // 2. Was it issued / sent to the client? A draft is not an issued quotation.
  const when = (q: QuotationFact) => `Issued on ${q.issuedAt ? formatDate(q.issuedAt) : "date not recorded"} · Valid until ${q.validUntil ? formatDate(q.validUntil) : "not recorded"}${isExpired(q.status, q.validUntil, today) ? " (expired)" : ""}`;
  const amount = (q: QuotationFact) => `${q.currency} ${q.total.toFixed(2)}`;
  if (accepted) steps.push({ key: "quotation", label: "Quotation issued or sent", state: "done", answer: "Yes", detail: `${accepted.reference} · ${amount(accepted)} · ${when(accepted)}` });
  else if (issued) steps.push({ key: "quotation", label: "Quotation issued or sent", state: "current", answer: "Yes", detail: `${issued.reference} · ${amount(issued)} · ${when(issued)}${isExpired(issued.status, issued.validUntil, today) ? " · cannot be accepted" : " · waiting for the client"}` });
  else if (preparing) steps.push({ key: "quotation", label: "Quotation issued or sent", state: "pending", answer: "No", detail: `${preparing.reference} is still ${preparing.status === "ready" ? "ready but not issued" : "a draft"}: it has not been issued or sent, and the client has not seen it. Issued on: not yet issued. Valid until: ${crew ? "set before it is issued (Crew Support has its own validity rule)" : "set when issued (30 calendar days from the issue date)"}.` });
  else if (closed) steps.push({ key: "quotation", label: "Quotation issued or sent", state: "done", answer: "Yes", detail: `${closed.reference} was ${closed.status}` });
  else steps.push({ key: "quotation", label: "Quotation issued or sent", state: "pending", answer: "No", detail: "No quotation recorded for this enquiry" });

  // 3. Delivered to the client? Recorded by a person; issuing never sends anything.
  const deliveredNA = !primary || (preparing != null && !issued && !accepted);
  const dv = f.quotationDelivery ?? null;
  steps.push(deliveredNA
    ? { key: "delivery", label: "Delivered to client", state: "not_applicable", answer: "No", detail: "Not applicable until the quotation is issued. The system never sends a quotation: a person delivers it and records that." }
    : dv
      ? { key: "delivery", label: "Delivered to client", state: "done", answer: "Yes", detail: `${dv.channel.replace(/_/g, " ")} on ${formatDate(dv.deliveredAt)} (recorded by staff)` }
      : { key: "delivery", label: "Delivered to client", state: "pending", answer: "No", detail: "Not recorded. Issuing does not email or notify the client." });

  if (accepted) {
    const how = accepted.acceptedVia ? ACCEPT_VIA[accepted.acceptedVia] ?? accepted.acceptedVia : "recorded";
    const parts = [`${how}${accepted.acceptanceChannel ? ` (${accepted.acceptanceChannel.replace(/_/g, " ")})` : ""}`, accepted.acceptedByName ? `by ${accepted.acceptedByName}` : "", day(accepted.acceptedAt)].filter(Boolean);
    steps.push({ key: "acceptance", label: "Client acceptance recorded", state: "done", detail: `${parts.join(" · ")} — a recorded acceptance, not a booking` });
  } else {
    steps.push({ key: "acceptance", label: "Client acceptance recorded", state: issued ? "current" : "pending", detail: issued ? "Not yet recorded" : preparing ? "Not yet: the quotation has to be issued before the client can accept it" : "Needs an issued quotation first" });
  }

  if (f.amountDue != null && f.amountDue > 0) {
    const src = f.amountDueSource === "accepted_quotation" ? "from an accepted quotation" : f.amountDueSource === "manual" ? "typed in by staff" : "recorded before sources were tracked";
    steps.push({ key: "amount_due", label: "Amount due established", state: "done", detail: `${usd(f.amountDue)} · ${src}` });
  } else {
    steps.push({ key: "amount_due", label: "Amount due established", state: "pending", detail: preparing ? "No amount due set. A draft quotation never creates one" : "No amount due set" });
  }

  const paid = f.amountPaid ?? 0;
  if (f.paymentStatus === "Paid") steps.push({ key: "payment", label: "Payment", state: "done", detail: `Paid in full (${usd(paid)})` });
  else if (paid > 0) steps.push({ key: "payment", label: "Payment", state: "current", detail: `${usd(paid)} received${f.amountDue ? ` of ${usd(f.amountDue)}` : ""}` });
  else steps.push({ key: "payment", label: "Payment", state: "pending", detail: f.paymentCountry ? `None received · ${f.paymentCountry === "QA" ? "Qatar" : "Ghana"} payment market` : "None received" });

  if (bookedOrLater(f.stage)) steps.push({ key: "booking", label: "Booking", state: "done", detail: `Stage is “${f.stage.replace(/_/g, " ")}”. The stage is the booking record; no separate confirmation record exists yet` });
  else steps.push({ key: "booking", label: "Booking", state: "pending", detail: `Not booked (stage: ${f.stage.replace(/_/g, " ")})` });

  if (f.contractingEntity !== "hidden") {
    steps.push({ key: "entity", label: "Contracting legal entity", state: f.contractingEntity ? "done" : "pending", detail: f.contractingEntity ? `${f.contractingEntity.name} (chosen explicitly, version ${f.contractingEntity.version})` : "Not chosen. It is never inferred from currency or location" });
  }

  if (accepted && !(f.amountDue != null && f.amountDue > 0)) notes.push("An accepted quotation does not set the amount due, create a payment obligation or confirm a booking. Those remain separate steps.");
  if (bookedOrLater(f.stage) && !accepted && !crew) notes.push("This enquiry is booked without a recorded quotation acceptance (booked by payment or by hand, as before). Nothing about it has changed.");
  if (f.emailsSuppressed) notes.push("Automatic client emails are switched off for this enquiry. Nothing is sent to the client unless staff send it.");
  if (crew) notes.push("Creative Crew Support has its own quotation, agreement and confirmation workflow. Manage it from the Crew Support request.");
  return { steps, notes, next: nextActionFor(primary, f.amountDue, { delivered: Boolean(f.quotationDelivery), expired: primary ? isExpired(primary.status, primary.validUntil, today) : false }) };
}
