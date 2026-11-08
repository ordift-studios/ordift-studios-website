import { describe, expect, it } from "vitest";
import { accountFingerprint, describeBankAccount, lastFourCollisions, matchStatementToAccount, sameBankAccount, type BankAccountLike } from "./bankAccountIdentity";

// synthetic IBANs that, like the real pair, are different but END IN THE SAME FOUR DIGITS
const personal: BankAccountLike = { id: "p", accountClassification: "personal", accountName: "Synthetic Person", bankName: "Commercial Bank of Qatar", countryCode: "QA", currencyCode: "QAR", iban: "QA11 TEST 0000 0000 0000 0000 3001" };
const corporate: BankAccountLike = { id: "c", accountClassification: "corporate", accountName: "SYNTHETIC COMPANY", bankName: "The Commercial Bank (P.S.Q.C.)", countryCode: "QA", currencyCode: "QAR", iban: "QA22TEST000000000000000003001" };

describe("bank account identity never rests on the last four digits", () => {
  it("two accounts that end in the same four digits are different accounts", () => {
    expect(sameBankAccount(personal, corporate)).toBe(false);
    expect(accountFingerprint(personal)).not.toEqual(accountFingerprint(corporate));
  });
  it("the same IBAN written with spaces, dashes or lower case is the same account", () => {
    expect(sameBankAccount(personal, { ...personal, id: "x", iban: "qa11-test-0000-0000-0000-0000-3001" })).toBe(true);
  });
  it("an account with no IBAN and no usable account number can never be matched automatically", () => {
    const none = { ...corporate, iban: null, accountNumber: "12" };
    expect(accountFingerprint(none)).toBeNull();
    expect(sameBankAccount(none, none)).toBe(false);
  });
  it("a statement is matched by its FULL IBAN; a wrong or partial one matches nothing", () => {
    expect(matchStatementToAccount("QA22TEST000000000000000003001", [personal, corporate])).toMatchObject({ kind: "match", account: { id: "c" } });
    expect(matchStatementToAccount("3001", [personal, corporate])).toEqual({ kind: "none" });
    expect(matchStatementToAccount("QA33TEST000000000000000003001", [personal, corporate])).toEqual({ kind: "none" });
  });
  it("duplicate full IBANs are reported as ambiguous, never guessed", () => {
    expect(matchStatementToAccount(personal.iban!, [personal, { ...personal, id: "dup" }])).toMatchObject({ kind: "ambiguous" });
  });
  it("shows the last-four collision as a warning", () => {
    expect(lastFourCollisions([personal, corporate])).toHaveLength(1);
    expect(lastFourCollisions([personal, { ...personal, id: "same" }])).toHaveLength(0);
  });
  it("names who holds the account first", () => {
    expect(describeBankAccount(personal)).toMatch(/^PERSONAL account of Synthetic Person/);
    expect(describeBankAccount(corporate)).toMatch(/^CORPORATE account of SYNTHETIC COMPANY/);
  });
});
