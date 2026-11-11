// Pure rules for linking ONE company bank/card statement line to a reported payment (migration 0191). No I/O.
// A payment stays "reported by the Founder" until a Super Admin states what a stored statement shows and the database checks it against the records. These rules mirror the database checks so the person gets a plain message before the call;
// the database repeats every one of them (it never trusts this module). Nothing here decides an accounting treatment, and nothing is ever inferred: a personal instrument is refused, never assumed to be the company's.
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const isIso = (s: string) => ISO.test(s) && !Number.isNaN(Date.parse(s)) && new Date(s).toISOString().slice(0, 10) === s;
const t = (s: string | null | undefined) => (s ?? "").trim();
const days = (a: string, b: string) => Math.round((Date.parse(a) - Date.parse(b)) / 86_400_000);

export const INSTRUMENT_KINDS = [{ value: "credit_card", label: "Credit card" }, { value: "bank_account", label: "Bank account" }] as const;
export const HOLDER_KINDS = [{ value: "company", label: "Company instrument (held in the legal entity's name)" }, { value: "personal", label: "Personal instrument (held by a person)" }] as const;
export const DATE_TOLERANCE_DAYS = 7;

// A full card or account number must never be entered: 12+ digits in a row (spaces and hyphens ignored) or an IBAN-shaped value.
export function looksUnmasked(s: string): boolean {
  const compact = s.replace(/[ -]/g, "");
  return /[0-9]{12,}/.test(compact) || /[A-Z]{2}[0-9]{2}[A-Z0-9]{11,}/.test(compact.toUpperCase());
}
// The same normalisation as the database: case, punctuation and legal-form words (W.L.L., LLC, Ltd ...) are ignored when comparing the account holder with the legal entity.
export function holderKey(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\b(wll|w l l|llc|ltd|limited|co|company|qatar|qsc)\b/g, " ").replace(/\s+/g, " ").trim();
}
export function holderMatchesEntity(holderAsPrinted: string, entityLegalName: string | null, entityName: string): boolean {
  const h = holderKey(holderAsPrinted);
  return h !== "" && (h === holderKey(entityLegalName ?? "") || h === holderKey(entityName));
}

export type StatementEvidenceInput = {
  kind: "instalment" | "funding"; targetId: string; documentId: string; holderKind: string; instrumentKind: string; accountHolderAsPrinted: string; cardholderAsPrinted?: string | null; instrumentIdentityAsPrinted: string;
  periodFrom: string; periodTo: string; lineDate: string; lineAmount: number; lineCurrency: string; lineDescriptionAsPrinted: string; page?: string | null; paymentReference?: string | null; basisNote: string; confirmCompanyInstrument: boolean;
};
export type StatementEvidenceValue = Omit<StatementEvidenceInput, "confirmCompanyInstrument" | "cardholderAsPrinted" | "page" | "paymentReference"> & { cardholderAsPrinted: string | null; page: string | null; paymentReference: string | null };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// `reported` is the payment the line must support (instalment: its paid date, amount and currency). For the funding source the matching is done by the database against every reported payment of the purchase.
export function validateStatementEvidence(i: StatementEvidenceInput, today: string, reported?: { paidOn: string; amount: number; currency: string; entityLegalName: string | null; entityName: string }): { ok: true; value: StatementEvidenceValue } | { ok: false; error: string } {
  if (i.kind !== "instalment" && i.kind !== "funding") return { ok: false, error: "Choose what the statement is evidence for." };
  if (!UUID.test(t(i.targetId)) || !UUID.test(t(i.documentId))) return { ok: false, error: "Choose the payment and the stored statement." };
  if (i.holderKind !== "company") return { ok: false, error: "Only a COMPANY instrument can be linked. A personal account or card is never attached to a company entity, even if it was used for a company purchase." };
  if (!i.confirmCompanyInstrument) return { ok: false, error: "Tick the box to confirm the instrument is held in this legal entity's name." };
  if (!INSTRUMENT_KINDS.some((k) => k.value === i.instrumentKind)) return { ok: false, error: "Say whether the statement is for a credit card or a bank account." };
  const holder = t(i.accountHolderAsPrinted), identity = t(i.instrumentIdentityAsPrinted), desc = t(i.lineDescriptionAsPrinted), basis = t(i.basisNote), ref = t(i.paymentReference) || null, cardholder = t(i.cardholderAsPrinted) || null;
  if (holder.length < 3 || holder.length > 200) return { ok: false, error: "Enter the account holder exactly as printed on the statement." };
  if (identity.length < 3 || identity.length > 60) return { ok: false, error: "Enter the masked card or account identity as printed (for example the last four digits)." };
  for (const [label, v] of [["masked identity", identity], ["cardholder", cardholder ?? ""], ["line description", desc], ["payment reference", ref ?? ""]] as const)
    if (looksUnmasked(v)) return { ok: false, error: `A full card or account number must not be entered (${label}): use the masked identity only.` };
  if (desc.length < 3 || desc.length > 200) return { ok: false, error: "Enter the statement line description exactly as printed." };
  if (basis.length < 10 || basis.length > 500) return { ok: false, error: "Say how the statement line was identified (10 to 500 characters)." };
  if (ref && ref.length > 80) return { ok: false, error: "The payment reference is too long." };
  for (const [label, d] of [["statement period start", i.periodFrom], ["statement period end", i.periodTo], ["line date", i.lineDate]] as const) if (!isIso(d)) return { ok: false, error: `The ${label} must be a real date.` };
  if (i.periodFrom > i.periodTo || i.periodTo > today) return { ok: false, error: "The statement period must be valid and not in the future." };
  if (i.lineDate < i.periodFrom || i.lineDate > i.periodTo) return { ok: false, error: "The statement line date is outside the statement period." };
  if (!Number.isFinite(i.lineAmount) || i.lineAmount <= 0 || Math.abs(i.lineAmount * 100 - Math.round(i.lineAmount * 100)) > 1e-6) return { ok: false, error: "Enter the statement amount with at most two decimals." };
  const cur = t(i.lineCurrency).toUpperCase();
  if (!/^[A-Z]{3}$/.test(cur)) return { ok: false, error: "Enter the three-letter currency code." };
  if (reported) {
    if (!holderMatchesEntity(holder, reported.entityLegalName, reported.entityName)) return { ok: false, error: "The account holder on the statement does not match this legal entity. An instrument in another name (for example the Founder personally) is never attached to a company entity." };
    if (cur !== reported.currency) return { ok: false, error: `The statement currency (${cur}) differs from the reported payment currency (${reported.currency}).` };
    if (i.kind === "instalment") {
      if (Math.round(i.lineAmount * 100) !== Math.round(reported.amount * 100)) return { ok: false, error: `The statement amount (${i.lineAmount}) differs from the reported payment (${reported.amount}). A variance is not linked here.` };
      if (Math.abs(days(i.lineDate, reported.paidOn)) > DATE_TOLERANCE_DAYS) return { ok: false, error: `The statement line date is more than ${DATE_TOLERANCE_DAYS} days from the reported payment date (${reported.paidOn}), so it does not support that payment.` };
    }
  }
  return { ok: true, value: { kind: i.kind, targetId: t(i.targetId), documentId: t(i.documentId), holderKind: "company", instrumentKind: i.instrumentKind, accountHolderAsPrinted: holder, cardholderAsPrinted: cardholder, instrumentIdentityAsPrinted: identity,
    periodFrom: i.periodFrom, periodTo: i.periodTo, lineDate: i.lineDate, lineAmount: i.lineAmount, lineCurrency: cur, lineDescriptionAsPrinted: desc, page: t(i.page) || null, paymentReference: ref, basisNote: basis } };
}

// The evidence object exactly as the database function expects it.
export function toDbEvidence(v: StatementEvidenceValue): Record<string, unknown> {
  return { holderKind: v.holderKind, instrumentKind: v.instrumentKind, accountHolderAsPrinted: v.accountHolderAsPrinted, cardholderAsPrinted: v.cardholderAsPrinted, instrumentIdentityAsPrinted: v.instrumentIdentityAsPrinted,
    periodFrom: v.periodFrom, periodTo: v.periodTo, lineDate: v.lineDate, lineAmount: v.lineAmount, lineCurrency: v.lineCurrency, lineDescriptionAsPrinted: v.lineDescriptionAsPrinted, page: v.page, paymentReference: v.paymentReference, basisNote: v.basisNote };
}

// What a statement check looks like on screen (built from the audit event; never from a guess).
export type StatementCheck = { documentId: string; instrumentKind: string; holder: string; cardholder: string | null; identity: string; periodFrom: string; periodTo: string; lineDate: string; amount: number; currency: string; description: string; page: string | null;
  paymentReference: string | null; referenceMatchesFinancing: boolean | null; dateDifferenceDays: number | null; basisNote: string; linkedAt: string };
