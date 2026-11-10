// Pure finance POSITION for equipment acquisitions (financed in instalments, paid outright, deposit + balance, on supplier credit, unpaid or not yet confirmed). No database access, no I/O.
// It answers "where do we stand?" without ever merging three things that must stay apart:
//   1. the PURCHASE (one supplier invoice, its net price),
//   2. the FINANCING LIABILITY (the provider is owed the unpaid instalments),
//   3. the PAYMENT MOVEMENTS (each instalment paid, and whether a bank/card statement has confirmed it).
// Nothing here recognises an expense, capitalises an asset or depreciates anything: the accounting treatment is a professional decision (see classification flag).
// Amounts are handled in whole minor units (cents/dirhams) so totals are exact. Currencies are never mixed in one total.
import { fromCents, toCents } from "@/lib/organization/equipmentFinancingRules";
import { settlementOf, type Arrangement, type ArrangementState, type Settlement } from "@/lib/organization/acquisitionPaymentRules";

export type InstalmentFact = {
  sequence: number;
  amount: number;
  expectedMonth: string;                 // first of the month; an expectation, not a promised due date
  status: "pending" | "paid" | "void";
  paidOn?: string | null;
  providerEvidence: boolean;             // a stored provider document (or note) supports the payment
  statementEvidence: boolean;            // a bank/card statement document has been linked to this payment
};
export type FinancingFact = {
  provider: string;
  reference: string;
  financedAmount: number;
  instalmentCount: number;
  scheduleBasis: "founder_expected_months" | "provider_schedule";
  status: "active" | "settled" | "void";
  instalments: InstalmentFact[];
};
export type AcquisitionFact = {
  id: string;
  currency: string;
  listPrice: number;
  discount: number;
  net: number;
  classification: "pending_professional_review" | "capital_equipment" | "expensed_small_value";
  funding: "to_confirm" | "company_account" | "founder_personal" | "other_verified";
  fundingStatementVerified?: boolean;    // a statement document has been linked as evidence of who paid (never inferred)
  customerMatch: CustomerMatch;
  financing: FinancingFact | null;
  terms?: { arrangement: Arrangement; balanceDueOn: string | null } | null;       // how a NON-financed purchase is to be paid; absent = to be confirmed
  payments?: { amount: number; paidOn: string; status: "recorded" | "void" }[];  // direct payments of a NON-financed purchase (a financed one is paid through its instalments)
};

export type CustomerMatch = "matches_entity" | "differs_from_entity" | "not_shown";
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\b(w l l|wll|llc|ltd|limited|co|company)\b/g, " ").replace(/\s+/g, " ").trim();
// Does the customer printed on the invoice name the legal entity? Conservative: anything not clearly the entity is "differs" (a human decides).
export function customerMatch(customerAsShown: string | null | undefined, entityLegalName: string): CustomerMatch {
  const c = norm(customerAsShown ?? "");
  if (!c) return "not_shown";
  const e = norm(entityLegalName);
  return e && (c === e || c.includes(e) || e.includes(c)) ? "matches_entity" : "differs_from_entity";
}

export type InstalmentState = "pending" | "paid_awaiting_statement" | "paid_verified_by_statement" | "void";
export function instalmentState(i: InstalmentFact): InstalmentState {
  if (i.status === "void") return "void";
  if (i.status === "pending") return "pending";
  return i.statementEvidence ? "paid_verified_by_statement" : "paid_awaiting_statement";
}

export type PositionFlag =
  | "classification_pending_professional_review"
  | "funding_not_confirmed"
  | "funding_awaiting_statement_verification"
  | "invoice_not_in_entity_name"
  | "schedule_months_are_expected_not_provider"
  | "paid_instalments_awaiting_statement"
  | "paid_without_any_evidence"
  | "instalments_do_not_add_up_to_financed_amount"
  | "financed_amount_differs_from_net_price"
  | "net_price_arithmetic_mismatch"
  | "arrangement_not_confirmed"
  | "arrangement_says_paid_but_balance_open"
  | "supplier_balance_overdue"
  | "payments_awaiting_statement"
  | "payments_exceed_net_price";

export type AcquisitionPosition = {
  acquisitionId: string;
  currency: string;
  purchaseNet: number;                    // what the supplier invoice says was bought, net of discount
  arrangement: ArrangementState;          // derived: financed (a financing agreement exists) / the recorded terms / to be confirmed
  settlement: Settlement;                 // unpaid / partly paid / paid — derived from the money, NOT an accounting classification
  balanceDueOn: string | null;            // supplier balance due date (as stated on the supplier's document)
  financed: number;
  paidTotal: number;                      // financed: instalments marked paid; otherwise: recorded direct payments
  paidVerifiedByStatement: number;        // of which a statement has confirmed
  paidAwaitingStatement: number;          // reported / evidenced but no statement yet ("pending verification")
  outstandingLiability: number;           // financed only: pending instalments owed to the provider
  supplierBalance: number;                // NOT financed only: net price minus recorded payments (owed to the supplier, or not yet evidenced as paid — see the arrangement)
  // Always 0 from this module: an expense is an accounting decision, never inferred from a purchase, a payment or an instalment.
  expenseRecognised: 0;
  flags: PositionFlag[];
};

const todayIso = () => new Date().toISOString().slice(0, 10);
export function acquisitionPosition(a: AcquisitionFact, today: string = todayIso()): AcquisitionPosition {
  const live = a.financing && a.financing.status !== "void" ? a.financing : null;
  const rows = live ? live.instalments.filter((i) => i.status !== "void") : [];
  const sum = (pred: (i: InstalmentFact) => boolean) => fromCents(rows.filter(pred).reduce((s, i) => s + toCents(i.amount), 0));
  const direct = live ? [] : (a.payments ?? []).filter((p) => p.status === "recorded");        // a financed purchase never counts direct payments (no double counting)
  const directPaid = fromCents(direct.reduce((s, p) => s + toCents(p.amount), 0));
  const paid = live ? sum((i) => i.status === "paid") : directPaid;
  const verified = live ? sum((i) => instalmentState(i) === "paid_verified_by_statement") : 0;   // direct payments have no statement link yet: never verified here
  const arrangement: ArrangementState = live ? "financed" : a.terms?.arrangement ?? "to_confirm";
  const supplierBalance = live ? 0 : fromCents(toCents(a.net) - toCents(directPaid));
  const flags: PositionFlag[] = [];
  if (toCents(a.net) !== toCents(a.listPrice) - toCents(a.discount)) flags.push("net_price_arithmetic_mismatch");
  if (a.classification === "pending_professional_review") flags.push("classification_pending_professional_review");
  if (a.funding === "to_confirm") flags.push("funding_not_confirmed");
  else if (!a.fundingStatementVerified) flags.push("funding_awaiting_statement_verification");   // stated by a person, not yet seen on a statement
  if (a.customerMatch !== "matches_entity") flags.push("invoice_not_in_entity_name");
  if (live) {
    if (toCents(live.financedAmount) !== toCents(a.net)) flags.push("financed_amount_differs_from_net_price");
    if (rows.length !== live.instalmentCount || sum(() => true) !== toCents(live.financedAmount) / 100) flags.push("instalments_do_not_add_up_to_financed_amount");
    if (live.scheduleBasis === "founder_expected_months" && rows.some((i) => i.status === "pending")) flags.push("schedule_months_are_expected_not_provider");
    if (rows.some((i) => instalmentState(i) === "paid_awaiting_statement")) flags.push("paid_instalments_awaiting_statement");
    if (rows.some((i) => i.status === "paid" && !i.providerEvidence && !i.statementEvidence)) flags.push("paid_without_any_evidence");
  } else {
    if (!a.terms) flags.push("arrangement_not_confirmed");
    if (directPaid > 0 && toCents(directPaid) > toCents(a.net)) flags.push("payments_exceed_net_price");
    if (a.terms?.arrangement === "paid_in_full" && supplierBalance > 0) flags.push("arrangement_says_paid_but_balance_open");
    if (a.terms?.balanceDueOn && supplierBalance > 0 && a.terms.balanceDueOn < today) flags.push("supplier_balance_overdue");
    if (directPaid > 0) flags.push("payments_awaiting_statement");
  }
  return {
    acquisitionId: a.id, currency: a.currency, purchaseNet: a.net, arrangement, settlement: settlementOf(paid, live ? live.financedAmount : a.net), balanceDueOn: live ? null : a.terms?.balanceDueOn ?? null,
    financed: live ? live.financedAmount : 0, paidTotal: paid, paidVerifiedByStatement: verified, paidAwaitingStatement: fromCents(toCents(paid) - toCents(verified)),
    outstandingLiability: sum((i) => i.status === "pending"), supplierBalance, expenseRecognised: 0, flags,
  };
}

export type CurrencyTotals = { currency: string; purchases: number; financed: number; paid: number; paidVerifiedByStatement: number; paidAwaitingStatement: number; outstandingLiability: number; supplierBalance: number; expenseRecognised: 0 };
export type FinanceReport = { perAcquisition: AcquisitionPosition[]; totalsByCurrency: CurrencyTotals[]; openItems: { acquisitionId: string; flag: PositionFlag }[] };

// Totals are per currency. A purchase and its instalments appear ONCE each in their own column — the purchase is never added to the instalments, and no column is an "expense".
export function financeReport(acquisitions: AcquisitionFact[]): FinanceReport {
  const per = acquisitions.map((a) => acquisitionPosition(a));
  const byCur = new Map<string, CurrencyTotals>();
  for (const p of per) {
    const t = byCur.get(p.currency) ?? { currency: p.currency, purchases: 0, financed: 0, paid: 0, paidVerifiedByStatement: 0, paidAwaitingStatement: 0, outstandingLiability: 0, supplierBalance: 0, expenseRecognised: 0 as const };
    const add = (a: number, b: number) => fromCents(toCents(a) + toCents(b));
    t.purchases = add(t.purchases, p.purchaseNet); t.financed = add(t.financed, p.financed); t.paid = add(t.paid, p.paidTotal);
    t.paidVerifiedByStatement = add(t.paidVerifiedByStatement, p.paidVerifiedByStatement); t.paidAwaitingStatement = add(t.paidAwaitingStatement, p.paidAwaitingStatement);
    t.outstandingLiability = add(t.outstandingLiability, p.outstandingLiability); t.supplierBalance = add(t.supplierBalance, p.supplierBalance);
    byCur.set(p.currency, t);
  }
  return { perAcquisition: per, totalsByCurrency: [...byCur.values()], openItems: per.flatMap((p) => p.flags.map((flag) => ({ acquisitionId: p.acquisitionId, flag }))) };
}
