// Pure rules for recording a receipt-backed cost of ONE legal entity through the admin form. No database access here: recordEntityReceipt() applies these.
// Three things are kept apart and never merged: WHO PAID (funding source), WHAT THEY EXPECT (reimbursement intention) and HOW THE BOOKS TREAT IT
// (accounting treatment — always "to be confirmed" at entry; this form never finalises it). Nothing here describes a payable, loan, journal or payment.
import { money, type ReceiptLine } from "@/lib/organization/entityRegistry";

export const EXPENSE_CATEGORIES = [
  { value: "government_fee", label: "Government fee / licensing" },
  { value: "incorporation_registration", label: "Incorporation / registration" },
  { value: "professional_fees", label: "Professional fees" },
  { value: "premises", label: "Premises" },
  { value: "other", label: "Other" },
] as const;
export const EXPENSE_CATEGORY_VALUES = EXPENSE_CATEGORIES.map((c) => c.value) as readonly string[];

export const FUNDING_CHOICES = [
  { value: "to_confirm", label: "Not confirmed yet" },
  { value: "company_account", label: "The company account" },
  { value: "founder_personal", label: "The Founder personally (personal funds)" },
  { value: "other_verified", label: "Someone else (verified)" },
] as const;
export type FundingChoice = (typeof FUNDING_CHOICES)[number]["value"];

export const REIMBURSEMENT_CHOICES = [
  { value: "to_be_confirmed", label: "Not decided yet" },
  { value: "not_applicable", label: "Not applicable (the company account paid)" },
  { value: "not_reimbursable", label: "Not required — a non-reimbursable contribution (not a loan)" },
  { value: "reimbursement_expected", label: "Expected — recorded as an intention only (no payable is created)" },
] as const;
export type ReimbursementIntent = (typeof REIMBURSEMENT_CHOICES)[number]["value"];

export const PAYMENT_METHODS = [
  { value: "card", label: "Card" },
  { value: "bank_transfer", label: "Bank transfer" },
  { value: "cash", label: "Cash" },
  { value: "other", label: "Other" },
] as const;
export const PAYMENT_METHOD_VALUES = PAYMENT_METHODS.map((m) => m.value) as readonly string[];

const ISO = /^\d{4}-\d{2}-\d{2}$/;
export const validIsoDate = (s: string) => ISO.test(s) && !Number.isNaN(Date.parse(s)) && new Date(s).toISOString().slice(0, 10) === s;

// One line per line: "CODE | description | amount". The code is the line exactly as printed on the receipt, so a line can only be recorded once.
// A zero amount is allowed (printed on the receipt, not an expense). Anything that cannot be read is refused, never guessed.
export function parseReceiptLines(text: string): { ok: true; lines: ReceiptLine[] } | { ok: false; error: string } {
  const rows = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (rows.length === 0) return { ok: false, error: "Enter at least one receipt line as: CODE | description | amount." };
  const lines: ReceiptLine[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    const parts = row.split("|").map((p) => p.trim());
    if (parts.length !== 3 || !parts[0] || !parts[1]) return { ok: false, error: `Cannot read the line "${row}". Write each line as: CODE | description | amount.` };
    const amountText = parts[2].replace(/,/g, "");
    if (!/^\d+(\.\d{1,2})?$/.test(amountText)) return { ok: false, error: `The amount in "${row}" is not a valid number (digits with at most two decimals, no currency symbol).` };
    const code = parts[0].toUpperCase();
    if (seen.has(code)) return { ok: false, error: `The line code ${code} appears twice. Each printed line is recorded once.` };
    seen.add(code);
    lines.push({ code, description: parts[1], amount: money(Number(amountText)) });
  }
  return { ok: true, lines };
}

export type FundingInput = { funding: string; reimbursement: string; fundingNote: string | null };

// Who paid and what they expect must agree, and a confirmed funding source needs a stated basis (the Founder's own statement is a valid basis, recorded as such).
export function validateFunding(i: FundingInput): string | null {
  if (!FUNDING_CHOICES.some((c) => c.value === i.funding)) return "Choose who funded this cost.";
  if (!REIMBURSEMENT_CHOICES.some((c) => c.value === i.reimbursement)) return "Choose the reimbursement intention.";
  const note = (i.fundingNote ?? "").trim();
  if (i.funding !== "to_confirm" && note.length < 5) return "Say how the funding source is known (for example the Founder's own statement, or the bank statement line).";
  if (i.funding === "to_confirm" && i.reimbursement !== "to_be_confirmed") return "Confirm who funded this cost before recording a reimbursement intention.";
  if (i.reimbursement === "not_applicable" && i.funding !== "company_account") return "“Not applicable” is only for a cost the company account paid.";
  if (i.funding === "company_account" && i.reimbursement !== "not_applicable" && i.reimbursement !== "to_be_confirmed") return "A cost paid from the company account has nothing to reimburse.";
  if (["not_reimbursable", "reimbursement_expected"].includes(i.reimbursement) && !["founder_personal", "other_verified"].includes(i.funding)) return "A reimbursement intention only applies to a cost paid by a person.";
  return null;
}
