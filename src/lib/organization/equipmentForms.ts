// Pure parsing of the panel's two forms into the inputs validated by equipmentFinancingRules / equipmentFinancing. No I/O.
// Fields the Founder has not evidenced are never defaulted into a claim: funding is "to_confirm" unless a source AND a basis are given, and a payment is only "paid" with evidence.
import type { AcquisitionInput, FinancingInput } from "@/lib/organization/equipmentFinancingRules";

type Get = (k: string) => string;
const getter = (f: { get(k: string): unknown }): Get => (k) => String(f.get(k) ?? "").trim();
const num = (s: string) => (s === "" ? NaN : Number(s.replace(/,/g, "")));

export type ParsedAcquisitionForm = { ok: true; acquisition: AcquisitionInput; financing: FinancingInput | null } | { ok: false; error: string };
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
  if (t("hasFinancing") !== "yes") return { ok: true, acquisition, financing: null };
  const count = Number(t("instalmentCount"));
  const paidOn = t("firstPaidOn"), paidNote = t("firstPaidEvidenceNote");
  if ((paidOn && !paidNote) || (!paidOn && paidNote)) return { ok: false, error: "To record the first instalment as paid, give BOTH the payment date and what the evidence shows. Otherwise leave both empty." };
  const financing: FinancingInput = {
    provider: t("provider"), reference: t("providerReference"), merchant: t("merchant") || null, count, plannedOn: t("plannedOn"), firstMonth: t("firstMonth"),
    confirmationDocumentId: t("confirmationDocumentId"), scheduleBasis: t("scheduleBasis") || "founder_expected_months", firstPaid: paidOn ? { paidOn, evidenceNote: paidNote } : null,
  };
  return { ok: true, acquisition, financing };
}

export type ParsedMarkPaid = { ok: true; entityId: string; instalmentId: string; paidOn: string; evidenceDocumentId: string | null; evidenceNote: string | null } | { ok: false; error: string };
export function parseMarkPaidForm(f: { get(k: string): unknown }): ParsedMarkPaid {
  const t = getter(f);
  if (!t("entityId") || !t("instalmentId")) return { ok: false, error: "Invalid request." };
  if (t("confirmUnverified") !== "yes") return { ok: false, error: "Tick the box to confirm this is recorded as reported-paid and NOT bank-reconciled." };
  return { ok: true, entityId: t("entityId"), instalmentId: t("instalmentId"), paidOn: t("paidOn"), evidenceDocumentId: t("evidenceDocumentId") || null, evidenceNote: t("evidenceNote") || null };
}
