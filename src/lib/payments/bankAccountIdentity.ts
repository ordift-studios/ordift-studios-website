import { createHash } from "node:crypto";

// BANK ACCOUNT IDENTITY (pure). Two receiving accounts can look alike: in Production the Founder's PERSONAL retail account and the company's CORPORATE account at the same bank have different IBANs that both END IN THE SAME FOUR DIGITS.
// So an account is never recognised, matched or reconciled by its last four digits. It is identified by its full normalised IBAN (or, where a bank issues none, bank + full account number), and every display names who holds it.
export type BankAccountLike = {
  id: string; accountClassification: "personal" | "corporate"; accountName: string; bankName: string; countryCode?: string | null; currencyCode: string; iban?: string | null; accountNumber?: string | null;
};

export const normaliseIban = (iban: string | null | undefined): string => (iban ?? "").replace(/[\s-]+/g, "").toUpperCase();
export const normaliseAccountNumber = (n: string | null | undefined): string => (n ?? "").replace(/[\s-]+/g, "").toUpperCase();

// The identity key. Full IBAN when there is one; otherwise bank + full account number; otherwise NOTHING (an account with neither can never be matched automatically).
export function accountIdentityKey(a: Pick<BankAccountLike, "iban" | "accountNumber" | "bankName">): string | null {
  const iban = normaliseIban(a.iban);
  if (iban.length >= 15) return `iban:${iban}`;
  const no = normaliseAccountNumber(a.accountNumber);
  return no.length >= 6 ? `acct:${a.bankName.trim().toLowerCase()}:${no}` : null;
}
export const accountFingerprint = (a: Pick<BankAccountLike, "iban" | "accountNumber" | "bankName">): string | null => {
  const k = accountIdentityKey(a); return k ? createHash("sha256").update(k).digest("hex") : null;
};

// Same account only if the FULL identity matches. Last four digits are deliberately not an input.
export function sameBankAccount(a: BankAccountLike, b: BankAccountLike): boolean {
  const ka = accountIdentityKey(a), kb = accountIdentityKey(b);
  return ka !== null && ka === kb;
}

// Reconciliation: find the account a statement belongs to using the full IBAN printed on it. No match, or more than one, is returned as such: a person must decide, never a guess.
export function matchStatementToAccount(statementIban: string, accounts: BankAccountLike[]): { kind: "match"; account: BankAccountLike } | { kind: "none" } | { kind: "ambiguous"; accounts: BankAccountLike[] } {
  const want = normaliseIban(statementIban);
  if (want.length < 15) return { kind: "none" };
  const hits = accounts.filter((a) => normaliseIban(a.iban) === want);
  return hits.length === 1 ? { kind: "match", account: hits[0] } : hits.length === 0 ? { kind: "none" } : { kind: "ambiguous", accounts: hits };
}

// Do any two DIFFERENT accounts share their last four digits? (a warning to show, never a basis for matching)
export function lastFourCollisions(accounts: BankAccountLike[]): { lastFour: string; accounts: BankAccountLike[] }[] {
  const by = new Map<string, BankAccountLike[]>();
  for (const a of accounts) { const t = normaliseIban(a.iban).slice(-4) || normaliseAccountNumber(a.accountNumber).slice(-4); if (t.length === 4) by.set(t, [...(by.get(t) ?? []), a]); }
  return [...by.entries()].filter(([, v]) => new Set(v.map((x) => accountIdentityKey(x) ?? x.id)).size > 1).map(([lastFour, v]) => ({ lastFour, accounts: v }));
}

// How an account is named everywhere a person chooses or reads one: WHO holds it comes first, in capitals, so a personal and a corporate account can never be mistaken for each other.
export function describeBankAccount(a: BankAccountLike): string {
  const who = a.accountClassification === "personal" ? "PERSONAL account of" : "CORPORATE account of";
  return `${who} ${a.accountName.trim()} · ${a.bankName.trim()} · ${a.currencyCode}${a.countryCode ? " · " + a.countryCode : ""}`;
}
