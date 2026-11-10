// Pure view-model for the Equipment & Financing panel. No database, no I/O: the loader in equipmentFinancing.ts reads rows, this turns them into what the screen shows.
// The four things the screen keeps apart — ACQUISITION COST, FINANCING LIABILITY, ACTUAL PAYMENTS and ACCOUNTING EXPENSE — are separate fields here, never one number.
import { acquisitionPosition, customerMatch, instalmentState, type AcquisitionFact, type AcquisitionPosition, type CustomerMatch, type InstalmentState } from "@/lib/organization/financePosition";

export type DocRef = { id: string; filename: string | null; sha256: string | null; documentType: string };
export type RawAcquisition = {
  id: string; supplier_name: string; supplier_branch: string | null; invoice_number: string; purchase_date: string; item_description: string; quantity: number; currency: string;
  list_price_total: number | string; discount_total: number | string; net_amount: number | string; customer_as_shown: string | null; invoice_document_id: string;
  funding_source_status: AcquisitionFact["funding"]; funding_source_note: string | null; accounting_classification: AcquisitionFact["classification"]; bank_evidence_document_id: string | null; created_at: string;
};
export type RawObligation = {
  id: string; acquisition_id: string; provider: string; provider_reference: string; instalment_count: number; financed_amount: number | string; plan_started_on: string;
  confirmation_document_id: string; schedule_basis: "founder_expected_months" | "provider_schedule"; status: "active" | "settled" | "void";
};
export type RawInstalment = {
  id: string; obligation_id: string; sequence: number; amount: number | string; expected_month: string; status: "pending" | "paid" | "void"; paid_on: string | null;
  evidence_document_id: string | null; bank_evidence_document_id: string | null; evidence_note: string | null;
};

export const CLASSIFICATION_LABEL: Record<string, string> = {
  pending_professional_review: "Pending professional review — no accounting treatment decided",
  capital_equipment: "Capital equipment (decided)",
  expensed_small_value: "Expensed as small value (decided)",
};
export const FUNDING_LABEL: Record<string, string> = {
  to_confirm: "Payer / payment instrument to be confirmed (not verified)",
  company_account: "Company account (confirmed)",
  founder_personal: "Paid personally by the Founder (confirmed)",
  other_verified: "Someone else (verified)",
};
export const INSTALMENT_STATE_LABEL: Record<InstalmentState, string> = {
  pending: "Pending — not paid",
  paid_awaiting_statement: "Reported paid — awaiting statement reconciliation (not bank-verified)",
  paid_verified_by_statement: "Paid — verified against a statement",
  void: "Voided",
};

export type InstalmentView = { id: string; sequence: number; amount: number; expectedMonth: string; state: InstalmentState; paidOn: string | null; evidenceNote: string | null; evidenceDoc: DocRef | null; statementDoc: DocRef | null };
export type EquipmentView = {
  id: string; supplier: string; branch: string | null; invoiceNumber: string; purchaseDate: string; itemDescription: string; quantity: number; currency: string;
  listPrice: number; discount: number; net: number; customerAsShown: string | null; customerMatch: CustomerMatch;
  classification: string; classificationLabel: string; funding: string; fundingLabel: string; fundingNote: string | null;
  invoiceDoc: DocRef | null; fundingStatementDoc: DocRef | null;
  financing: { id: string; provider: string; reference: string; status: string; scheduleBasis: string; plannedOn: string; instalmentCount: number; financed: number; confirmationDoc: DocRef | null; instalments: InstalmentView[] } | null;
  position: AcquisitionPosition;
};

const n = (v: number | string) => Number(v);
export function buildEquipmentViews(a: { acquisitions: RawAcquisition[]; obligations: RawObligation[]; instalments: RawInstalment[]; docs: DocRef[]; entityLegalName: string }): EquipmentView[] {
  const doc = (id: string | null): DocRef | null => (id ? a.docs.find((d) => d.id === id) ?? null : null);
  return a.acquisitions.map((r) => {
    const ob = a.obligations.find((o) => o.acquisition_id === r.id && o.status !== "void") ?? null;
    const ins = ob ? a.instalments.filter((i) => i.obligation_id === ob.id).sort((x, y) => x.sequence - y.sequence) : [];
    const match = customerMatch(r.customer_as_shown, a.entityLegalName);
    const fact: AcquisitionFact = {
      id: r.id, currency: r.currency, listPrice: n(r.list_price_total), discount: n(r.discount_total), net: n(r.net_amount), classification: r.accounting_classification, funding: r.funding_source_status, customerMatch: match,
      financing: ob ? { provider: ob.provider, reference: ob.provider_reference, financedAmount: n(ob.financed_amount), instalmentCount: ob.instalment_count, scheduleBasis: ob.schedule_basis, status: ob.status,
        instalments: ins.map((i) => ({ sequence: i.sequence, amount: n(i.amount), expectedMonth: i.expected_month, status: i.status, paidOn: i.paid_on, providerEvidence: Boolean(i.evidence_document_id) || (i.evidence_note ?? "").trim().length >= 10, statementEvidence: Boolean(i.bank_evidence_document_id) })) } : null,
    };
    return {
      id: r.id, supplier: r.supplier_name, branch: r.supplier_branch, invoiceNumber: r.invoice_number, purchaseDate: r.purchase_date, itemDescription: r.item_description, quantity: r.quantity, currency: r.currency,
      listPrice: fact.listPrice, discount: fact.discount, net: fact.net, customerAsShown: r.customer_as_shown, customerMatch: match,
      classification: r.accounting_classification, classificationLabel: CLASSIFICATION_LABEL[r.accounting_classification] ?? r.accounting_classification,
      funding: r.funding_source_status, fundingLabel: FUNDING_LABEL[r.funding_source_status] ?? r.funding_source_status, fundingNote: r.funding_source_note,
      invoiceDoc: doc(r.invoice_document_id), fundingStatementDoc: doc(r.bank_evidence_document_id),
      financing: ob ? { id: ob.id, provider: ob.provider, reference: ob.provider_reference, status: ob.status, scheduleBasis: ob.schedule_basis, plannedOn: ob.plan_started_on, instalmentCount: ob.instalment_count, financed: n(ob.financed_amount), confirmationDoc: doc(ob.confirmation_document_id),
        instalments: ins.map((i, k) => ({ id: i.id, sequence: i.sequence, amount: n(i.amount), expectedMonth: i.expected_month, state: instalmentState(fact.financing!.instalments[k]), paidOn: i.paid_on, evidenceNote: i.evidence_note, evidenceDoc: doc(i.evidence_document_id), statementDoc: doc(i.bank_evidence_document_id) })) } : null,
      position: acquisitionPosition(fact),
    };
  });
}
