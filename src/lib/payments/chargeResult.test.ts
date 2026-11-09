import { describe, expect, it } from "vitest";
import { validateChargeResult } from "./chargeResult";

describe("validateChargeResult", () => {
  it("accepts a provider reference and a secure checkout address", () => {
    expect(validateChargeResult({ providerReference: "PAY-2026-000123", checkoutUrl: "https://checkout.paystack.com/abc123" })).toEqual({ ok: true });
  });
  it("refuses a missing, empty, padded, spaced or oversized reference", () => {
    for (const ref of [undefined, null, "", "   ", " PAY-1", "PAY 1", "a\nb", "x".repeat(201), 42]) expect(validateChargeResult({ providerReference: ref, checkoutUrl: "https://checkout.example/x" }).ok, String(ref)).toBe(false);
    expect(validateChargeResult({ providerReference: "", checkoutUrl: "https://x.example" })).toMatchObject({ reason: "missing_reference" });
    expect(validateChargeResult({ providerReference: "a b", checkoutUrl: "https://x.example" })).toMatchObject({ reason: "bad_reference" });
  });
  it("refuses a checkout address that is missing, not a web address, not https, or carries credentials", () => {
    for (const url of [undefined, null, "", "not a url", "http://checkout.example/x", "javascript:alert(1)", "ftp://x.example", "https://user:pw@x.example/", "//x.example"]) expect(validateChargeResult({ providerReference: "PAY-1", checkoutUrl: url }), String(url)).toMatchObject({ ok: false, reason: "bad_checkout_url" });
  });
  it("refuses nothing at all", () => { expect(validateChargeResult(null).ok).toBe(false); expect(validateChargeResult(undefined).ok).toBe(false); });
});
