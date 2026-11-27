import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolvePaymentMarketState } from "./paymentMarket";

describe("what an unset payment market means", () => {
  it("an explicit market is always honoured", () => {
    expect(resolvePaymentMarketState({ payment_country: "QA", created_by: "u" }, "enquiry")).toEqual({ state: "selected", market: "QA" });
    expect(resolvePaymentMarketState({ payment_country: "GH", created_by: null }, "enquiry")).toEqual({ state: "selected", market: "GH" });
  });
  it("a website or earlier enquiry with no market keeps the established Ghana behaviour (nothing changes for existing clients)", () => {
    expect(resolvePaymentMarketState({ payment_country: null, created_by: null }, "enquiry")).toEqual({ state: "legacy_default", market: "GH" });
    expect(resolvePaymentMarketState(null, "enquiry")).toEqual({ state: "legacy_default", market: "GH" });
  });
  it("an enquiry recorded by staff with no market is UNSELECTED: no market is guessed", () => {
    expect(resolvePaymentMarketState({ payment_country: null, created_by: "staff-uuid" }, "enquiry")).toEqual({ state: "unselected", market: null });
    expect(resolvePaymentMarketState({ payment_country: "", created_by: "staff-uuid" }, "enquiry")).toEqual({ state: "unselected", market: null });
  });
  it("workshop registrations are always Ghana", () => {
    expect(resolvePaymentMarketState({ payment_country: null, created_by: "x" }, "workshop_registration")).toEqual({ state: "legacy_default", market: "GH" });
  });
});

describe("every payment route refuses an unselected market", () => {
  const read = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");
  it("the card/Paystack start refuses it before any amount or provider is touched", () => {
    const src = read("./checkoutService.ts");
    expect(src.indexOf('marketState.state === "unselected"')).toBeGreaterThan(0);
    expect(src.indexOf('"payment-market-not-selected"')).toBeLessThan(src.indexOf("resolveEntityAmounts(params.entityType"));
  });
  it("the bank-transfer proof route refuses it with a 422 before it resolves a receiving account", () => {
    const src = read("../../app/api/payments/bank-transfer/proof/route.ts");
    expect(src).toContain('"payment-market-not-selected"');
    expect(src.indexOf('"payment-market-not-selected"')).toBeLessThan(src.indexOf("getActiveBankAccount(country)"));
  });
  it("the client Pay Now page shows no card form and no bank details for it", () => {
    const src = read("../../app/portal/(dashboard)/client/projects/[kind]/[id]/payments/checkout/page.tsx");
    expect(src).toContain('marketState.state === "unselected"');
    expect(src.indexOf('marketState.state === "unselected"')).toBeLessThan(src.indexOf("<CheckoutForm"));
  });
});
