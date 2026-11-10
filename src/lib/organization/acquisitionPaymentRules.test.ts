import { describe, expect, it } from "vitest";
import { ARRANGEMENT_LABEL, PAYMENT_METHODS, settlementOf, validatePayment, validateTerms } from "./acquisitionPaymentRules";

const ctx = { net: 2000, alreadyPaid: 0, today: "2026-11-10" };
const pay = (over: Record<string, unknown> = {}) => ({ kind: "full", amount: 2000, paidOn: "2026-11-08", method: "bank_transfer", evidenceNote: "bank app showed the transfer as complete", ...over });

describe("arrangement is separate from method", () => {
  it("offers every method the Founder listed, and no method is an arrangement", () => {
    expect(PAYMENT_METHODS.map((m) => m.value)).toEqual(["cash", "company_credit_card", "company_debit_card", "bank_transfer", "cheque", "other"]);
    for (const m of PAYMENT_METHODS) expect(Object.keys(ARRANGEMENT_LABEL)).not.toContain(m.value);
  });
  it("'financed' and 'to confirm' are derived, never chosen as terms", () => {
    expect(validateTerms({ arrangement: "financed" })).toMatchObject({ ok: false });
    expect(validateTerms({ arrangement: "to_confirm" })).toMatchObject({ ok: false });
  });
});

describe("validateTerms", () => {
  it("supplier credit needs a due date; paid in full and unpaid refuse one; deposit and balance may have one", () => {
    expect(validateTerms({ arrangement: "supplier_credit" })).toMatchObject({ ok: false });
    expect(validateTerms({ arrangement: "supplier_credit", balanceDueOn: "2026-12-31" })).toMatchObject({ ok: true });
    expect(validateTerms({ arrangement: "paid_in_full", balanceDueOn: "2026-12-31" })).toMatchObject({ ok: false });
    expect(validateTerms({ arrangement: "unpaid", balanceDueOn: "2026-12-31" })).toMatchObject({ ok: false });
    expect(validateTerms({ arrangement: "deposit_and_balance" })).toMatchObject({ ok: true });
    expect(validateTerms({ arrangement: "deposit_and_balance", balanceDueOn: "2026-02-30" })).toMatchObject({ ok: false });
  });
});

describe("validatePayment", () => {
  it("accepts a full outright payment with a method and a written note, without any financing", () => {
    expect(validatePayment(pay(), ctx)).toMatchObject({ ok: true, value: { kind: "full", method: "bank_transfer", amount: 2000 } });
  });
  it("needs evidence: a stored document, or a note of at least 10 characters", () => {
    expect(validatePayment(pay({ evidenceNote: "short" }), ctx)).toMatchObject({ ok: false });
    expect(validatePayment(pay({ evidenceNote: null, evidenceDocumentId: "00000000-0000-4000-8000-000000000001" }), ctx)).toMatchObject({ ok: true });
    expect(validatePayment(pay({ evidenceNote: null, evidenceDocumentId: "not-a-uuid" }), ctx)).toMatchObject({ ok: false });
  });
  it("never allows more than the net price, including in total", () => {
    expect(validatePayment(pay({ kind: "part", amount: 2000.01 }), ctx)).toMatchObject({ ok: false, error: expect.stringMatching(/exceed the net price/) });
    expect(validatePayment(pay({ kind: "part", amount: 1500 }), { ...ctx, alreadyPaid: 600 })).toMatchObject({ ok: false });
    expect(validatePayment(pay({ kind: "balance", amount: 1400 }), { ...ctx, alreadyPaid: 600 })).toMatchObject({ ok: true });
  });
  it("a 'full' payment must equal the net price and be the only one", () => {
    expect(validatePayment(pay({ amount: 1999 }), ctx)).toMatchObject({ ok: false });
    expect(validatePayment(pay({ amount: 1400 }), { ...ctx, alreadyPaid: 600 })).toMatchObject({ ok: false });
  });
  it("refuses future dates, impossible dates, extra decimals, non-positive amounts, unknown methods; 'other' needs a description", () => {
    for (const bad of [{ paidOn: "2026-11-11" }, { paidOn: "2026-02-30" }, { amount: 1.005 }, { amount: 0 }, { amount: -5 }, { method: "bitcoin" }, { method: "other" }, { kind: "tip" }]) expect(validatePayment(pay(bad), ctx), JSON.stringify(bad)).toMatchObject({ ok: false });
    expect(validatePayment(pay({ method: "other", methodNote: "Sold equipment trade-in credit" }), ctx)).toMatchObject({ ok: true });
  });
});

describe("settlement (derived from the money, never an accounting classification)", () => {
  it("unpaid, partly paid, paid — exact in whole cents", () => {
    expect(settlementOf(0, 1149)).toBe("unpaid"); expect(settlementOf(287.25, 1149)).toBe("partially_paid"); expect(settlementOf(1149, 1149)).toBe("paid");
    expect(settlementOf(0.1 + 0.2, 0.3)).toBe("paid");
  });
});
