// Pure parsing of the panel's two forms into the inputs validated by equipmentFinancingRules / equipmentFinancing. No I/O.
// Fields the Founder has not evidenced are never defaulted into a claim: funding is "to_confirm" unless a source AND a basis are given, and a payment is only "paid" with evidence.
import type { AcquisitionInput, FinancingInput } from "@/lib/organization/equipmentFinancingRules";
import { ARRANGEMENTS, type PaymentInput, type TermsInput } from "@/lib/organization/acquisitionPaymentRules";

type Get = (k: string) => string;
const getter = (f: { get(k: string): unknown }): Get => (k) => String(f.get(k) ?? "").trim();
const num = (s: string) => (s === "" ? NaN : Number(s.replace(/,/g, "")));

// How the purchase is paid: one of the four recorded arrangements, "financed" (an instalment agreement is entered) or "to_confirm" (nothing is assumed).
export type ArrangementChoice = (typeof ARRANGEMENTS)[number] | "financed" | "to_confirm";
export type ParsedAcquisitionForm = { ok: true; acquisition: AcquisitionInput; financing: FinancingInput | null; arrangement: ArrangementChoice; terms: TermsInput | null; payment: PaymentInput | null } | { ok: false; error: string };
export function parseAcquisitionForm(f: { get(k: string): unknown }): ParsedAcquisitionForm {
  const t = getter(f);
  const entityId = t("entityId");
  if (!entityId) return { ok: false, error: "Invalid request." };
  const listPrice = num(t("listPrice")), discount = t("discount") === "" ? 0 : num(t("discount")), net = num(t("net")), quantity = t("quantity") === "" ? 1 : Number(t("quantity"));
  if ([listPrice, discount, net].some((v) => Number.isNaN(v))) return { ok: false, error: "Enter the list price, discount and net price as numbers." };
  const acquisition: AcquisitionInput = {
    entityId, supplier: t("supplier"), branch: t("branch") || null, invoiceNumber: t("invoiceNumber"), purchaseDate: t("purchaseDate"), itemDescription: t("itemDescription"), itemCode: t("itemCode") || null,
    quantity, currency: t("currency").toUpperCase(), listPrice, discount, net, customerAsShown: t("customerAsShown") || null, invoiceDocumentId: t("invoiceDocumentId"),
    fundingStatus: t("fundingStatus") || "to_confirm", fundingNote: t("fundingNote") || null,
  };
  const chosen = t("arrangement") || (t("hasFinancing") === "yes" ? "financed" : "to_confirm");
  if (!["to_confirm", "financed", ...ARRANGEMENTS].includes(chosen)) return { ok: false, error: "Choose how the purchase is paid." };
  const arrangement = chosen as ArrangementChoice;
  if (arrangement !== "financed") {
    const terms: TermsInput | null = (ARRANGEMENTS as readonly string[]).includes(arrangement) ? { arrangement, balanceDueOn: t("balanceDueOn") || null, supplierTerms: t("supplierTerms") || null } : null;
    const hasPayment = t("paymentAmount") !== "";
    if (hasPayment && arrangement === "unpaid") return { ok: false, error: "A purchase marked 'not yet paid' cannot have a payment: choose another arrangement or leave the payment empty." };
    if (hasPayment && t("paymentConfirmUnverified") !== "yes") return { ok: false, error: "Tick the box to confirm the payment is recorded as REPORTED and NOT bank-reconciled." };
    const amount = num(t("paymentAmount"));
    if (hasPayment && Number.isNaN(amount)) return { ok: false, error: "Enter the payment amount as a number." };
    const payment: PaymentInput | null = hasPayment ? {
      kind: t("paymentKind") || (arrangement === "paid_in_full" ? "full" : arrangement === "deposit_and_balance" ? "deposit" : "part"), amount, paidOn: t("paymentPaidOn"), method: t("paymentMethod"),
      methodNote: t("paymentMethodNote") || null, reference: t("paymentReference") || null, evidenceDocumentId: t("paymentEvidenceDocumentId") || null, evidenceNote: t("paymentEvidenceNote") || null,
    } : null;
    return { ok: true, acquisition, financing: null, arrangement, terms, payment };
  }
  const count = Number(t("instalmentCount"));
  const paidOn = t("firstPaidOn"), paidNote = t("firstPaidEvidenceNote");
  if ((paidOn && !paidNote) || (!paidOn && paidNote)) return { ok: false, error: "To record the first instalment as paid, give BOTH the payment date and what the evidence shows. Otherwise leave both empty." };
  const financing: FinancingInput = {
    provider: t("provider"), reference: t("providerReference"), merchant: t("merchant") || null, count, plannedOn: t("plannedOn"), firstMonth: t("firstMonth"),
    confirmationDocumentId: t("confirmationDocumentId"), scheduleBasis: t("scheduleBasis") || "founder_expected_months", firstPaid: paidOn ? { paidOn, evidenceNote: paidNote } : null,
  };
  return { ok: true, acquisition, financing, arrangement: "financed", terms: null, payment: null };
}

export type ParsedMarkPaid = { ok: true; entityId: string; instalmentId: string; paidOn: string; evidenceDocumentId: string | null; evidenceNote: string | null } | { ok: false; error: string };
export function parseMarkPaidForm(f: { get(k: string): unknown }): ParsedMarkPaid {
  const t = getter(f);
  if (!t("entityId") || !t("instalmentId")) return { ok: false, error: "Invalid request." };
  if (t("confirmUnverified") !== "yes") return { ok: false, error: "Tick the box to confirm this is recorded as reported-paid and NOT bank-reconciled." };
  return { ok: true, entityId: t("entityId"), instalmentId: t("instalmentId"), paidOn: t("paidOn"), evidenceDocumentId: t("evidenceDocumentId") || null, evidenceNote: t("evidenceNote") || null };
}

// A payment entered on an existing purchase (non-financed). The confirmation keeps "reported" and "bank-reconciled" apart, as for instalments.
export type ParsedPaymentForm = { ok: true; entityId: string; acquisitionId: string; payment: PaymentInput } | { ok: false; error: string };
export function parsePaymentForm(f: { get(k: string): unknown }): ParsedPaymentForm {
  const t = getter(f);
  if (!t("entityId") || !t("acquisitionId")) return { ok: false, error: "Invalid request." };
  if (t("confirmUnverified") !== "yes") return { ok: false, error: "Tick the box to confirm this is recorded as REPORTED and NOT bank-reconciled." };
  const amount = num(t("amount"));
  if (Number.isNaN(amount)) return { ok: false, error: "Enter the payment amount as a number." };
  return { ok: true, entityId: t("entityId"), acquisitionId: t("acquisitionId"), payment: { kind: t("kind"), amount, paidOn: t("paidOn"), method: t("method"), methodNote: t("methodNote") || null, reference: t("reference") || null, evidenceDocumentId: t("evidenceDocumentId") || null, evidenceNote: t("evidenceNote") || null } };
}

export type ParsedTermsForm = { ok: true; entityId: string; acquisitionId: string; terms: TermsInput } | { ok: false; error: string };
export function parseTermsForm(f: { get(k: string): unknown }): ParsedTermsForm {
  const t = getter(f);
  if (!t("entityId") || !t("acquisitionId")) return { ok: false, error: "Invalid request." };
  return { ok: true, entityId: t("entityId"), acquisitionId: t("acquisitionId"), terms: { arrangement: t("arrangement"), balanceDueOn: t("balanceDueOn") || null, supplierTerms: t("supplierTerms") || null, note: t("note") || null } };
}

export type ParsedVoidForm = { ok: true; entityId: string; paymentId: string; reason: string } | { ok: false; error: string };
export function parseVoidPaymentForm(f: { get(k: string): unknown }): ParsedVoidForm {
  const t = getter(f);
  if (!t("entityId") || !t("paymentId")) return { ok: false, error: "Invalid request." };
  if (t("reason").length < 10) return { ok: false, error: "Give a written reason of at least 10 characters." };
  return { ok: true, entityId: t("entityId"), paymentId: t("paymentId"), reason: t("reason") };
}

