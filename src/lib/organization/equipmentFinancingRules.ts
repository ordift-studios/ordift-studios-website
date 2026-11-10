// Pure rules for recording ONE equipment acquisition and its separately tracked financing obligation. No database access: recordEquipmentAcquisition() applies these.
// Three things stay apart: the PURCHASE (one supplier invoice), the FINANCING (the provider is owed, in instalments) and the ACCOUNTING DECISION (always "pending professional review" at entry).
// An instalment is a settlement of the financing, never a purchase and never a cost. Nothing here creates an expense.
import { validateFunding } from "@/lib/organization/expenseEntry";

export const CLASSIFICATION_PENDING = "pending_professional_review" as const;
export const SCHEDULE_BASES = ["founder_expected_months", "provider_schedule"] as const;
export type ScheduleBasis = (typeof SCHEDULE_BASES)[number];

export const toCents = (n: number): number => Math.round(n * 100);
export const fromCents = (c: number): number => c / 100;
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const isIso = (s: string) => ISO.test(s) && !Number.isNaN(Date.parse(s)) && new Date(s).toISOString().slice(0, 10) === s;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// First day of the month `n` months after `firstMonthIso` (which must itself be a first-of-month date).
export function addMonths(firstMonthIso: string, n: number): string {
  const y = Number(firstMonthIso.slice(0, 4)), m = Number(firstMonthIso.slice(5, 7)) - 1 + n;
  return `${y + Math.floor(m / 12)}-${String((((m % 12) + 12) % 12) + 1).padStart(2, "0")}-01`;
}

export type ScheduledInstalment = { sequence: number; amount: number; expectedMonth: string };

// Equal instalments in whole cents; any odd cents go to the FIRST instalment (a down payment rounds up), so the total is exact. The months are EXPECTED months, never promised due dates.
export function buildInstalmentSchedule(netAmount: number, count: number, firstMonthIso: string): ScheduledInstalment[] {
  const total = toCents(netAmount), base = Math.floor(total / count), extra = total - base * count;
  return Array.from({ length: count }, (_, i) => ({ sequence: i + 1, amount: fromCents(base + (i === 0 ? extra : 0)), expectedMonth: addMonths(firstMonthIso, i) }));
}

export type AcquisitionInput = {
  entityId: string; supplier: string; branch?: string | null; invoiceNumber: string; purchaseDate: string; itemDescription: string; itemCode?: string | null; quantity: number; currency: string;
  listPrice: number; discount: number; net: number; customerAsShown?: string | null; invoiceDocumentId: string; fundingStatus: string; fundingNote?: string | null;
};
export type FinancingInput = {
  provider: string; reference: string; merchant?: string | null; count: number; plannedOn: string; firstMonth: string; confirmationDocumentId: string; scheduleBasis: string;
  firstPaid?: { paidOn: string; evidenceNote: string } | null;       // ONLY the first instalment can be marked paid at entry, and only with evidence
};

export type RecordPayload = {
  entityId: string;
  acquisition: Record<string, unknown>;
  financing: (Record<string, unknown> & { instalments: ScheduledInstalment[] }) | null;
  firstInstalmentPaid: { sequence: 1; paidOn: string; evidenceNote: string } | null;
};

export function validateAcquisition(a: AcquisitionInput, f: FinancingInput | null, today: string): { ok: true; payload: RecordPayload } | { ok: false; error: string } {
  const t = (s: string | null | undefined) => (s ?? "").trim();
  if (!UUID.test(a.entityId) || !UUID.test(a.invoiceDocumentId)) return { ok: false, error: "Choose the legal entity and the stored invoice document." };
  if (t(a.supplier).length < 2) return { ok: false, error: "Enter the supplier." };
  if (!t(a.invoiceNumber)) return { ok: false, error: "Enter the invoice number exactly as printed." };
  if (t(a.itemDescription).length < 3) return { ok: false, error: "Describe the equipment." };
  if (!isIso(a.purchaseDate) || a.purchaseDate > today) return { ok: false, error: "The purchase date must be a real date that is not in the future." };
  if (!/^[A-Z]{3}$/.test(a.currency)) return { ok: false, error: "Enter the three-letter currency code." };
  if (!Number.isInteger(a.quantity) || a.quantity < 1) return { ok: false, error: "The quantity must be a whole number of at least 1." };
  for (const [label, v] of [["list price", a.listPrice], ["discount", a.discount], ["net price", a.net]] as const) if (!Number.isFinite(v) || v < 0 || Math.abs(v * 100 - Math.round(v * 100)) > 1e-6) return { ok: false, error: `The ${label} must be a non-negative amount with at most two decimals.` };
  if (a.listPrice <= 0 || a.net <= 0) return { ok: false, error: "The list price and the net price must be above zero." };
  if (toCents(a.net) !== toCents(a.listPrice) - toCents(a.discount)) return { ok: false, error: `The net price (${a.net}) must equal the list price (${a.listPrice}) minus the discount (${a.discount}).` };
  // who paid: the same rule the expense form uses (a confirmed source needs a stated basis). Reimbursement is not decided by this form.
  const fundingError = validateFunding({ funding: a.fundingStatus, reimbursement: a.fundingStatus === "company_account" ? "not_applicable" : "to_be_confirmed", fundingNote: a.fundingNote ?? null });
  if (fundingError) return { ok: false, error: fundingError };
  let financing: RecordPayload["financing"] = null, firstPaid: RecordPayload["firstInstalmentPaid"] = null;
  if (f) {
    if (t(f.provider).length < 2 || t(f.reference).length < 4) return { ok: false, error: "Enter the financing provider and its reference exactly as printed." };
    if (!Number.isInteger(f.count) || f.count < 2 || f.count > 24) return { ok: false, error: "The number of instalments must be between 2 and 24." };
    if (!UUID.test(f.confirmationDocumentId)) return { ok: false, error: "Choose the stored financing confirmation document." };
    if (f.confirmationDocumentId === a.invoiceDocumentId) return { ok: false, error: "The invoice and the financing confirmation are two different documents." };
    if (!isIso(f.plannedOn) || !isIso(f.firstMonth) || f.firstMonth.slice(8) !== "01") return { ok: false, error: "Enter the plan start date and the first expected month (the 1st)." };
    if (!(SCHEDULE_BASES as readonly string[]).includes(f.scheduleBasis)) return { ok: false, error: "Say whether the months come from the provider's own schedule or are only expected." };
    if (f.firstPaid) {
      if (!isIso(f.firstPaid.paidOn) || f.firstPaid.paidOn > today) return { ok: false, error: "The payment date must be a real date that is not in the future." };
      if (t(f.firstPaid.evidenceNote).length < 10) return { ok: false, error: "A payment can only be marked paid with its evidence: say what the document shows." };
      firstPaid = { sequence: 1, paidOn: f.firstPaid.paidOn, evidenceNote: t(f.firstPaid.evidenceNote) };
    }
    financing = { provider: t(f.provider), reference: t(f.reference), merchant: t(f.merchant) || null, count: f.count, plannedOn: f.plannedOn, confirmationDocumentId: f.confirmationDocumentId, scheduleBasis: f.scheduleBasis,
      instalments: buildInstalmentSchedule(a.net, f.count, f.firstMonth) };
  }
  return { ok: true, payload: {
    entityId: a.entityId,
    acquisition: { supplier: t(a.supplier), branch: t(a.branch) || null, invoiceNumber: t(a.invoiceNumber), purchaseDate: a.purchaseDate, itemDescription: t(a.itemDescription), itemCode: t(a.itemCode) || null, quantity: a.quantity,
      currency: a.currency, listPrice: a.listPrice, discount: a.discount, net: a.net, customerAsShown: t(a.customerAsShown) || null, invoiceDocumentId: a.invoiceDocumentId, fundingStatus: a.fundingStatus, fundingNote: t(a.fundingNote) || null },
    financing, firstInstalmentPaid: firstPaid } };
}

export type InstalmentRow = { status: string; amount: number };
export const paidTotal = (rows: InstalmentRow[]) => fromCents(rows.filter((r) => r.status === "paid").reduce((s, r) => s + toCents(r.amount), 0));
// What is still owed to the provider: only PENDING instalments count. Nothing here is a cost.
export const outstandingBalance = (rows: InstalmentRow[]) => fromCents(rows.filter((r) => r.status === "pending").reduce((s, r) => s + toCents(r.amount), 0));
