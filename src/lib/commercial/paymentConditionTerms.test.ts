import { describe, expect, it } from "vitest";
import { classifyPaymentTerms, composePaymentTerms, paymentConditionSentence, splitPaymentTerms, validatePaymentChoice } from "./paymentConditionTerms";

describe("generated payment sentence can never contradict its own selection", () => {
  it("every generated sentence is read back as CONSISTENT with the choice it came from", () => {
    for (const [condition, depositPercent] of [["none", null], ["full", null], ["deposit", 50], ["deposit", 12.5], ["deposit", 1], ["deposit", 99.99], ["deposit", 30]] as const) {
      const s = paymentConditionSentence({ condition, depositPercent });
      expect(classifyPaymentTerms(s, condition, depositPercent), s).toBe(condition === "none" ? "consistent" : "consistent");
    }
  });
  it("and is read as a contradiction against any OTHER selection (so a stale selection is caught, not hidden)", () => {
    expect(classifyPaymentTerms(paymentConditionSentence({ condition: "full", depositPercent: null }), "none", null)).toBe("contradiction");
    expect(classifyPaymentTerms(paymentConditionSentence({ condition: "deposit", depositPercent: 50 }), "deposit", 40)).toBe("contradiction");
    expect(classifyPaymentTerms(paymentConditionSentence({ condition: "none", depositPercent: null }), "full", null)).toBe("contradiction");
  });
  it("wording", () => {
    expect(paymentConditionSentence({ condition: "deposit", depositPercent: 50 })).toBe("A 50% deposit is required to confirm the booking.");
    expect(paymentConditionSentence({ condition: "deposit", depositPercent: 12.5 })).toBe("A 12.5% deposit is required to confirm the booking.");
    expect(paymentConditionSentence({ condition: "full", depositPercent: null })).toBe("Full payment is required before the booking is confirmed.");
    expect(paymentConditionSentence({ condition: "none", depositPercent: null })).toBe("No payment is required before the booking is confirmed.");
  });
});

describe("validatePaymentChoice", () => {
  it("requires a real condition and a deposit strictly between 0 and 100", () => {
    expect(validatePaymentChoice({ condition: "", depositPercent: null })).toMatchObject({ ok: false });
    expect(validatePaymentChoice({ condition: "loan", depositPercent: null })).toMatchObject({ ok: false });
    for (const p of [null, 0, -5, 100, 150, Number.NaN]) expect(validatePaymentChoice({ condition: "deposit", depositPercent: p })).toMatchObject({ ok: false });
    expect(validatePaymentChoice({ condition: "deposit", depositPercent: 30 })).toEqual({ ok: true, choice: { condition: "deposit", depositPercent: 30 } });
    expect(validatePaymentChoice({ condition: "deposit", depositPercent: 33.333 })).toEqual({ ok: true, choice: { condition: "deposit", depositPercent: 33.33 } });
  });
  it("a percentage typed for 'none' or 'full' is dropped, never stored", () => {
    expect(validatePaymentChoice({ condition: "full", depositPercent: 50 })).toEqual({ ok: true, choice: { condition: "full", depositPercent: null } });
    expect(validatePaymentChoice({ condition: "none", depositPercent: 20 })).toEqual({ ok: true, choice: { condition: "none", depositPercent: null } });
  });
});

describe("composePaymentTerms", () => {
  const dep = { condition: "deposit" as const, depositPercent: 50 };
  it("puts the generated sentence first, then the other terms", () => {
    expect(composePaymentTerms(dep, "Cancellation within 48 hours of the shoot forfeits the deposit.")).toEqual({ ok: true, text: "A 50% deposit is required to confirm the booking.\n\nCancellation within 48 hours of the shoot forfeits the deposit." });
    expect(composePaymentTerms(dep, "  ")).toEqual({ ok: true, text: "A 50% deposit is required to confirm the booking." });
  });
  it("accepts other terms that merely repeat the same condition", () => { expect(composePaymentTerms(dep, "The 50% deposit is non-refundable once the date is held.")).toMatchObject({ ok: true }); });
  it("refuses other terms that state a different payment condition", () => {
    expect(composePaymentTerms(dep, "Full payment is required in advance.")).toMatchObject({ ok: false });
    expect(composePaymentTerms({ condition: "full", depositPercent: null }, "A 30% deposit secures the date.")).toMatchObject({ ok: false });
    expect(composePaymentTerms({ condition: "none", depositPercent: null }, "A 50% deposit is required to confirm.")).toMatchObject({ ok: false });
  });
  it("allows a 'balance due on delivery' clause alongside a deposit or full-payment condition", () => {
    expect(composePaymentTerms(dep, "The balance is due on delivery.")).toMatchObject({ ok: true });
  });
});

describe("splitPaymentTerms (editing a saved draft)", () => {
  const dep = { condition: "deposit" as const, depositPercent: 50 };
  it("round-trips with composePaymentTerms", () => {
    const text = (composePaymentTerms(dep, "Reschedule once free of charge.") as { text: string }).text;
    expect(splitPaymentTerms(text, dep)).toEqual({ otherTerms: "Reschedule once free of charge.", generated: true });
    expect(splitPaymentTerms(paymentConditionSentence(dep), dep)).toEqual({ otherTerms: "", generated: true });
  });
  it("older free-text drafts come back whole as 'other terms' and are flagged as not generated", () => {
    expect(splitPaymentTerms("50% deposit, balance on delivery.", dep)).toEqual({ otherTerms: "50% deposit, balance on delivery.", generated: false });
    expect(splitPaymentTerms(null, { condition: "none", depositPercent: null })).toEqual({ otherTerms: "", generated: false });
  });
});

describe("classifier parity with the booking gate", () => {
  it("pins the cases the booking branch relies on", () => {
    expect(classifyPaymentTerms("", "none", null)).toBe("no_terms");
    expect(classifyPaymentTerms("Delivery in 5 days.", "none", null)).toBe("no_payment_language");
    expect(classifyPaymentTerms("Delivery in 5 days.", "deposit", 50)).toBe("ambiguous");
    expect(classifyPaymentTerms("A deposit or full payment is due.", "deposit", 50)).toBe("contradiction");
    expect(classifyPaymentTerms("No deposit is required. Payment on delivery.", "none", null)).toBe("consistent");
  });
});
