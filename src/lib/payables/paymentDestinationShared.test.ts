import { describe, expect, it } from "vitest";
import {
  validatePaymentDestinationInput,
  isOwnPaymentDestination,
  countryName,
  suggestedMobileMoneyProviders,
  COUNTRIES,
  type PaymentDestinationInput,
} from "@/lib/payables/paymentDestinationShared";

// Payment Destination UX (2026-09-04) — the genuinely unit-testable
// slice of this feature: method-specific field validation and the
// self-service ownership boundary, both pure. RLS/authorization-
// capability checks (finance.payee.administer, Super Admin override)
// and pending/success/failure React UI state are DB-dependent or
// React-component behavior respectively — this project's established,
// documented limitations (no jsdom/@testing-library/react installed
// yet; no Staging schema for Payables) apply here the same way they do
// to the rest of this module, per the pattern already established in
// addPayee.test.ts.

const bankInput: PaymentDestinationInput = {
  method: "bank_account",
  country: "GH",
  currency: "GHS",
  accountHolderName: "Sylvia Annang-Mensah",
  institutionName: "GCB Bank",
  accountIdentifier: "1234567890",
  routingIdentifier: null,
};

describe("validatePaymentDestinationInput — bank account", () => {
  it("accepts a complete bank account submission", () => {
    expect(validatePaymentDestinationInput(bankInput)).toEqual({ ok: true });
  });

  it("routing identifier is optional for bank account", () => {
    expect(validatePaymentDestinationInput({ ...bankInput, routingIdentifier: null }).ok).toBe(true);
  });

  it("requires the institution (bank) name", () => {
    const result = validatePaymentDestinationInput({ ...bankInput, institutionName: null });
    expect(result).toEqual({ ok: false, error: "Enter the bank / financial institution." });
  });

  it("requires the account identifier (account number)", () => {
    const result = validatePaymentDestinationInput({ ...bankInput, accountIdentifier: "" });
    expect(result).toEqual({ ok: false, error: "Enter the account number." });
  });
});

describe("validatePaymentDestinationInput — mobile money", () => {
  const momoInput: PaymentDestinationInput = {
    method: "mobile_money",
    country: "GH",
    currency: "GHS",
    accountHolderName: "Sylvia Annang-Mensah",
    institutionName: "MTN Mobile Money",
    accountIdentifier: "0244000000",
    routingIdentifier: null,
  };

  it("accepts a complete mobile money submission", () => {
    expect(validatePaymentDestinationInput(momoInput)).toEqual({ ok: true });
  });

  it("requires the provider", () => {
    const result = validatePaymentDestinationInput({ ...momoInput, institutionName: "  " });
    expect(result).toEqual({ ok: false, error: "Enter the mobile money provider." });
  });

  it("requires the mobile money number", () => {
    const result = validatePaymentDestinationInput({ ...momoInput, accountIdentifier: null });
    expect(result).toEqual({ ok: false, error: "Enter the mobile money number." });
  });
});

describe("validatePaymentDestinationInput — other", () => {
  const otherInput: PaymentDestinationInput = {
    method: "other",
    country: "QA",
    currency: "QAR",
    accountHolderName: "Consultant Name",
    institutionName: "Wise",
    accountIdentifier: "consultant@example.com",
    routingIdentifier: null,
  };

  it("accepts a complete 'other' submission", () => {
    expect(validatePaymentDestinationInput(otherInput)).toEqual({ ok: true });
  });

  it("requires a payment identifier", () => {
    const result = validatePaymentDestinationInput({ ...otherInput, accountIdentifier: "" });
    expect(result).toEqual({ ok: false, error: "Enter the payment identifier." });
  });
});

describe("validatePaymentDestinationInput — fields common to every method", () => {
  it("rejects an unrecognized method", () => {
    expect(validatePaymentDestinationInput({ ...bankInput, method: "carrier_pigeon" }).ok).toBe(false);
  });

  it("requires a country", () => {
    expect(validatePaymentDestinationInput({ ...bankInput, country: "" }).ok).toBe(false);
  });

  it("requires a currency", () => {
    expect(validatePaymentDestinationInput({ ...bankInput, currency: "" }).ok).toBe(false);
  });

  it("requires an account holder name", () => {
    expect(validatePaymentDestinationInput({ ...bankInput, accountHolderName: "   " }).ok).toBe(false);
  });
});

describe("isOwnPaymentDestination — self-service ownership boundary", () => {
  it("is true when the actor and target profile are the same", () => {
    expect(isOwnPaymentDestination("user-1", "user-1")).toBe(true);
  });

  it("is false for a different actor/target — the exact boundary that must hold for self-service to be safe", () => {
    expect(isOwnPaymentDestination("user-1", "user-2")).toBe(false);
  });
});

describe("countryName / COUNTRIES", () => {
  it("resolves a known code to its human-readable name", () => {
    expect(countryName("GH")).toBe("Ghana");
    expect(countryName("QA")).toBe("Qatar");
  });

  it("falls back to the raw code for an unrecognized one, rather than throwing", () => {
    expect(countryName("ZZ")).toBe("ZZ");
  });

  it("is not Ghana-only — includes Qatar and other countries", () => {
    const codes = COUNTRIES.map((c) => c.code);
    expect(codes).toContain("GH");
    expect(codes).toContain("QA");
    expect(codes.length).toBeGreaterThan(5);
  });
});

describe("suggestedMobileMoneyProviders", () => {
  it("suggests real Ghanaian providers for GH", () => {
    expect(suggestedMobileMoneyProviders("GH")).toContain("MTN Mobile Money");
  });

  it("returns an empty list (not an error) for a country with no seeded suggestions — the field stays free text everywhere", () => {
    expect(suggestedMobileMoneyProviders("QA")).toEqual([]);
  });
});
