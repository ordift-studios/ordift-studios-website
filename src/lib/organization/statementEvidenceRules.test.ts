import { describe, expect, it } from "vitest";
import { holderKey, holderMatchesEntity, looksUnmasked, toDbEvidence, validateStatementEvidence, type StatementEvidenceInput } from "./statementEvidenceRules";

// SYNTHETIC data only (public repository): a synthetic company and card, not any real statement.
const ID = "00000000-0000-4000-8000-000000000001";
const base = (over: Partial<StatementEvidenceInput> = {}): StatementEvidenceInput => ({ kind: "instalment", targetId: ID, documentId: ID, holderKind: "company", instrumentKind: "credit_card", accountHolderAsPrinted: "SYNTHETIC STUDIOS W.L.L.", cardholderAsPrinted: "A Cardholder",
  instrumentIdentityAsPrinted: "card ending 4242", periodFrom: "2026-11-01", periodTo: "2026-11-30", lineDate: "2026-11-08", lineAmount: 287.25, lineCurrency: "qar", lineDescriptionAsPrinted: "SYNTHPAY ONLINE", page: "2", paymentReference: null, basisNote: "Matched to the reported first instalment", confirmCompanyInstrument: true, ...over });
const reported = { paidOn: "2026-11-08", amount: 287.25, currency: "QAR", entityLegalName: "SYNTHETIC STUDIOS", entityName: "Synthetic Studios (Qatar)" };
const run = (over: Partial<StatementEvidenceInput> = {}, rep = reported) => validateStatementEvidence(base(over), "2026-12-01", rep);

describe("statement evidence rules (mirror of the database checks)", () => {
  it("accepts a company statement line that matches the reported payment and normalises the currency", () => {
    const r = run(); expect(r.ok).toBe(true);
    if (r.ok) { expect(r.value.lineCurrency).toBe("QAR"); expect(r.value.holderKind).toBe("company"); expect(toDbEvidence(r.value)).toMatchObject({ holderKind: "company", lineAmount: 287.25, accountHolderAsPrinted: "SYNTHETIC STUDIOS W.L.L." }); }
  });
  it("NEVER assumes a personal instrument is the company's: personal is refused, and the confirmation tick is required", () => {
    expect(run({ holderKind: "personal" })).toMatchObject({ ok: false, error: expect.stringMatching(/personal account or card is never attached/) });
    expect(run({ holderKind: "" })).toMatchObject({ ok: false });
    expect(run({ confirmCompanyInstrument: false })).toMatchObject({ ok: false, error: expect.stringMatching(/Tick the box/) });
  });
  it("checks the account holder against the legal entity, ignoring case, punctuation and legal-form words", () => {
    expect(run({ accountHolderAsPrinted: "Synthetic Studios (Qatar) WLL" }).ok).toBe(true);
    expect(run({ accountHolderAsPrinted: "A Founder Personally" })).toMatchObject({ ok: false, error: expect.stringMatching(/does not match this legal entity/) });
    expect(run({ accountHolderAsPrinted: "Synthetic Studios Trading" })).toMatchObject({ ok: false });
    expect(holderKey("ORDIFT STUDIOS W.L.L.")).toBe("ordift studios"); expect(holderMatchesEntity("", "X", "Y")).toBe(false);
  });
  it("refuses a full card or account number anywhere it could be typed", () => {
    for (const v of ["4111 1111 1111 1111", "4111-1111-1111-1111", "QA58DOHB00001234567890ABCDEFG"]) expect(looksUnmasked(v)).toBe(true);
    for (const v of ["card ending 4242", "**** **** **** 4242", "ending 1234"]) expect(looksUnmasked(v)).toBe(false);
    expect(run({ instrumentIdentityAsPrinted: "4111 1111 1111 1111" })).toMatchObject({ ok: false, error: expect.stringMatching(/full card or account number/) });
    expect(run({ lineDescriptionAsPrinted: "TRANSFER 123456789012345" })).toMatchObject({ ok: false });
    expect(run({ paymentReference: "4111111111111111" })).toMatchObject({ ok: false });
  });
  it("checks currency, amount and the date window against the reported payment (no variance is linked)", () => {
    expect(run({ lineCurrency: "USD" })).toMatchObject({ ok: false, error: expect.stringMatching(/currency/) });
    expect(run({ lineAmount: 287.24 })).toMatchObject({ ok: false, error: expect.stringMatching(/differs from the reported payment/) });
    expect(run({ lineDate: "2026-11-15" }).ok).toBe(true);                                                           // 7 days: the edge is accepted
    expect(run({ lineDate: "2026-11-16" })).toMatchObject({ ok: false, error: expect.stringMatching(/more than 7 days/) });
    expect(run({ lineDate: "2026-11-01" })).toMatchObject({ ok: true });                                              // 7 days before is accepted too
  });
  it("checks the statement period and every required fact", () => {
    expect(run({ periodTo: "2026-12-31" })).toMatchObject({ ok: false, error: expect.stringMatching(/not in the future/) });
    expect(run({ periodFrom: "2026-11-30", periodTo: "2026-11-01" })).toMatchObject({ ok: false });
    expect(run({ periodTo: "2026-11-07" })).toMatchObject({ ok: false, error: expect.stringMatching(/outside the statement period/) });
    expect(run({ lineDate: "2026-02-30" })).toMatchObject({ ok: false });
    expect(run({ instrumentKind: "cheque" })).toMatchObject({ ok: false });
    expect(run({ accountHolderAsPrinted: "x" })).toMatchObject({ ok: false });
    expect(run({ lineDescriptionAsPrinted: "x" })).toMatchObject({ ok: false });
    expect(run({ basisNote: "short" })).toMatchObject({ ok: false });
    expect(run({ lineAmount: 0 })).toMatchObject({ ok: false });
    expect(run({ lineAmount: 10.005 })).toMatchObject({ ok: false });
    expect(run({ lineCurrency: "QA" })).toMatchObject({ ok: false });
    expect(run({ targetId: "nope" })).toMatchObject({ ok: false });
  });
  it("for the funding source the amount and date are matched by the database against ALL reported payments; the holder and currency are still checked here", () => {
    expect(run({ kind: "funding", lineAmount: 999 }, { ...reported, paidOn: "2026-12-30", amount: 0 }).ok).toBe(true);
    expect(run({ kind: "funding", accountHolderAsPrinted: "A Founder Personally" })).toMatchObject({ ok: false });
  });
});
