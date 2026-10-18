import { CRM_STAGES } from "@/lib/admin/enquiries";
import { channelLabel } from "./staffIntake";

// Consolidated, READ-ONLY workflow summary for an enquiry (M1). Pure.
//
// It only restates facts that already exist, so the four things people tend to blur stay visibly separate:
//   enquiry (a request) -> quotation issued (an offer) -> acceptance recorded (the client said yes) -> booking (the crm_stage "booked" or later).
// An accepted quotation does not set the amount due, create a payment obligation or confirm a booking; "booked" keeps its existing meaning. Nothing here
// changes a stage or a record.

export type StepState = "done" | "current" | "pending" | "not_applicable" | "unknown";
export type SummaryStep = { key: "enquiry" | "quotation" | "acceptance" | "amount_due" | "payment" | "booking" | "entity"; label: string; state: StepState; detail: string };

export type QuotationFact = {
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
};

const ACCEPT_VIA: Record<string, string> = { client_portal: "by the client in the portal", staff_recorded: "recorded by staff" };
const day = (iso: string | null) => (iso ? iso.slice(0, 10) : "");
const usd = (n: number) => `USD ${n.toFixed(2)}`;

export function bookedOrLater(stage: string): boolean {
  const i = CRM_STAGES.indexOf(stage as (typeof CRM_STAGES)[number]);
  return i >= CRM_STAGES.indexOf("booked") && i >= 0 && stage !== "declined" && stage !== "closed";
}

export function summariseWorkflow(f: WorkflowFacts): { steps: SummaryStep[]; notes: string[] } {
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

  if (accepted) steps.push({ key: "quotation", label: "Quotation issued", state: "done", detail: `${accepted.reference} · ${accepted.currency} ${accepted.total.toFixed(2)}${accepted.issuedAt ? ` · issued ${day(accepted.issuedAt)}` : ""}` });
  else if (issued) steps.push({ key: "quotation", label: "Quotation issued", state: "current", detail: `${issued.reference} · ${issued.currency} ${issued.total.toFixed(2)}${issued.issuedAt ? ` · issued ${day(issued.issuedAt)}` : ""} · waiting for the client` });
  else if (preparing) steps.push({ key: "quotation", label: "Quotation issued", state: "pending", detail: `${preparing.reference} is in preparation and has not been issued` });
  else if (closed) steps.push({ key: "quotation", label: "Quotation issued", state: "done", detail: `${closed.reference} was ${closed.status}` });
  else steps.push({ key: "quotation", label: "Quotation issued", state: "pending", detail: "No quotation recorded for this enquiry" });

  if (accepted) {
    const how = accepted.acceptedVia ? ACCEPT_VIA[accepted.acceptedVia] ?? accepted.acceptedVia : "recorded";
    const parts = [`${how}${accepted.acceptanceChannel ? ` (${accepted.acceptanceChannel.replace(/_/g, " ")})` : ""}`, accepted.acceptedByName ? `by ${accepted.acceptedByName}` : "", day(accepted.acceptedAt)].filter(Boolean);
    steps.push({ key: "acceptance", label: "Client acceptance recorded", state: "done", detail: `${parts.join(" · ")} — a recorded acceptance, not a booking` });
  } else {
    steps.push({ key: "acceptance", label: "Client acceptance recorded", state: issued ? "current" : "pending", detail: issued ? "Not yet recorded" : "Needs an issued quotation first" });
  }

  if (f.amountDue != null && f.amountDue > 0) {
    const src = f.amountDueSource === "accepted_quotation" ? "from an accepted quotation" : f.amountDueSource === "manual" ? "typed in by staff" : "recorded before sources were tracked";
    steps.push({ key: "amount_due", label: "Amount due established", state: "done", detail: `${usd(f.amountDue)} · ${src}` });
  } else {
    steps.push({ key: "amount_due", label: "Amount due established", state: "pending", detail: "No amount due set" });
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
  return { steps, notes };
}
