// Pure rules for HOW an equipment acquisition is paid (the ARRANGEMENT) and the PAYMENTS made against it (each with a METHOD). No database access, no I/O.
// Arrangement and method are different things: the arrangement says how the price is to be settled (in full, deposit then balance, on supplier credit, not yet paid, or financed in instalments);
// the method says how one payment was made (cash, company card, bank transfer, cheque, other). Nothing here creates an expense, a classification or a bank verification.
import { toCents } from "@/lib/organization/equipmentFinancingRules";

export const ARRANGEMENTS = ["paid_in_full", "deposit_and_balance", "supplier_credit", "unpaid"] as const;
export type Arrangement = (typeof ARRANGEMENTS)[number];
// "financed" is DERIVED (an instalment financing agreement exists); "to_confirm" is DERIVED (no terms recorded yet). Neither can be chosen as terms.
export type ArrangementState = Arrangement | "financed" | "to_confirm";
export const ARRANGEMENT_LABEL: Record<ArrangementState, string> = {
  paid_in_full: "Paid in full (outright purchase)",
  deposit_and_balance: "Deposit now, balance later",
  supplier_credit: "Supplier credit (pay by a due date)",
  unpaid: "Not yet paid",
  financed: "Financed in instalments",
  to_confirm: "Arrangement to be confirmed",
};
export const PAYMENT_METHODS = [
  { value: "cash", label: "Cash" },
  { value: "company_credit_card", label: "Company credit card" },
  { value: "company_debit_card", label: "Company debit card" },
  { value: "bank_transfer", label: "Bank transfer" },
  { value: "cheque", label: "Cheque" },
  { value: "other", label: "Other (describe)" },
] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number]["value"];
export const PAYMENT_KINDS = [
  { value: "full", label: "Full payment" },
  { value: "deposit", label: "Deposit" },
  { value: "balance", label: "Balance" },
  { value: "part", label: "Part payment" },
] as const;
export type PaymentKind = (typeof PAYMENT_KINDS)[number]["value"];
export const methodLabel = (m: string) => PAYMENT_METHODS.find((x) => x.value === m)?.label ?? m;
export const kindLabel = (k: string) => PAYMENT_KINDS.find((x) => x.value === k)?.label ?? k;

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const isIso = (s: string) => ISO.test(s) && !Number.isNaN(Date.parse(s)) && new Date(s).toISOString().slice(0, 10) === s;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const t = (s: string | null | undefined) => (s ?? "").trim();

export type TermsInput = { arrangement: string; balanceDueOn?: string | null; supplierTerms?: string | null; note?: string | null };
export type TermsValue = { arrangement: Arrangement; balanceDueOn: string | null; supplierTerms: string | null; note: string | null };
export function validateTerms(i: TermsInput): { ok: true; value: TermsValue } | { ok: false; error: string } {
  if (!(ARRANGEMENTS as readonly string[]).includes(i.arrangement)) return { ok: false, error: "Choose how the purchase is paid: in full, deposit and balance, supplier credit or not yet paid." };
  const due = t(i.balanceDueOn) || null;
  if (due && !isIso(due)) return { ok: false, error: "The balance due date must be a real date." };
  if (i.arrangement === "supplier_credit" && !due) return { ok: false, error: "Supplier credit needs the due date shown on the supplier's document." };
  if ((i.arrangement === "paid_in_full" || i.arrangement === "unpaid") && due) return { ok: false, error: "A purchase paid in full, or not yet paid, has no balance due date." };
  if (t(i.supplierTerms).length > 500 || t(i.note).length > 1000) return { ok: false, error: "The supplier terms or the note are too long." };
  if (t(i.supplierTerms) && t(i.supplierTerms).length < 3) return { ok: false, error: "Write the supplier's terms as printed, or leave them empty." };
  return { ok: true, value: { arrangement: i.arrangement as Arrangement, balanceDueOn: due, supplierTerms: t(i.supplierTerms) || null, note: t(i.note) || null } };
}

export type PaymentInput = { kind: string; amount: number; paidOn: string; method: string; methodNote?: string | null; reference?: string | null; evidenceDocumentId?: string | null; evidenceNote?: string | null };
export type PaymentValue = { kind: PaymentKind; amount: number; paidOn: string; method: PaymentMethod; methodNote: string | null; reference: string | null; evidenceDocumentId: string | null; evidenceNote: string | null };
// ctx.alreadyPaid is the total of RECORDED payments; the database re-checks the cap under a row lock, so this early check only gives a friendly message.
export function validatePayment(i: PaymentInput, ctx: { net: number; alreadyPaid: number; today: string }): { ok: true; value: PaymentValue } | { ok: false; error: string } {
  if (!PAYMENT_KINDS.some((k) => k.value === i.kind)) return { ok: false, error: "Choose the kind of payment." };
  if (!Number.isFinite(i.amount) || i.amount <= 0 || Math.abs(i.amount * 100 - Math.round(i.amount * 100)) > 1e-6) return { ok: false, error: "The amount must be above zero with at most two decimals." };
  if (!isIso(i.paidOn) || i.paidOn > ctx.today) return { ok: false, error: "The payment date must be a real date that is not in the future." };
  if (!PAYMENT_METHODS.some((m) => m.value === i.method)) return { ok: false, error: "Choose how it was paid." };
  const methodNote = t(i.methodNote) || null;
  if (i.method === "other" && (methodNote ?? "").length < 3) return { ok: false, error: "Describe the payment method." };
  const docId = t(i.evidenceDocumentId) || null, note = t(i.evidenceNote) || null;
  if (docId && !UUID.test(docId)) return { ok: false, error: "Choose the stored evidence document from the list." };
  if (!docId && (note ?? "").length < 10) return { ok: false, error: "A payment needs evidence: a stored document, or a written note of what you saw (at least 10 characters)." };
  const remaining = toCents(ctx.net) - toCents(ctx.alreadyPaid);
  if (toCents(i.amount) > remaining) return { ok: false, error: `This payment would exceed the net price: ${(remaining / 100).toFixed(2)} remains unpaid.` };
  if (i.kind === "full" && (ctx.alreadyPaid > 0 || toCents(i.amount) !== toCents(ctx.net))) return { ok: false, error: "A full payment must equal the net price and be the only payment." };
  return { ok: true, value: { kind: i.kind as PaymentKind, amount: i.amount, paidOn: i.paidOn, method: i.method as PaymentMethod, methodNote, reference: t(i.reference) || null, evidenceDocumentId: docId, evidenceNote: note } };
}

// Payment STATUS is derived from the money, never stored and never an accounting classification. VERIFICATION is a separate question (see financePosition).
export type Settlement = "unpaid" | "partially_paid" | "paid";
export const SETTLEMENT_LABEL: Record<Settlement, string> = { unpaid: "Unpaid", partially_paid: "Partly paid", paid: "Paid" };
export function settlementOf(paid: number, total: number): Settlement {
  const p = toCents(paid), n = toCents(total);
  return p <= 0 ? "unpaid" : p >= n ? "paid" : "partially_paid";
}
