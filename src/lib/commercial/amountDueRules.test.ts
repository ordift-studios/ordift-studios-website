import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  AMOUNT_DUE_ERROR_MESSAGES,
  assessEstablishment,
  distinctWordCount,
  messageForAmountDueError,
  NON_USD_AMOUNT_DUE_ENABLED,
  OVERRIDE_CATEGORIES,
  RATE_MAX_AGE_DAYS,
  roundHalfUp,
  validateOverrideInput,
  type EstablishInput,
  type OverrideInput,
} from "./amountDueRules";

// Enquiry-to-booking M2a — the pure rules. The database functions re-check every one of these inside the transaction; these tests pin the early-feedback
// copy in the screen so it can never disagree with the database.

const NOW = new Date("2026-10-20T12:00:00Z");
const daysAgo = (d: number) => new Date(NOW.getTime() - d * 86_400_000).toISOString();

const baseEnquiry = { id: "e1", commercialIntent: "ordift_led", paymentCountry: "GH" as const, amountDue: null, amountDueSource: null, amountDueQuotationId: null, amountPaid: null };
const baseQuotation: NonNullable<EstablishInput["quotation"]> = { id: "q1", enquiryId: "e1", crewSupportRequestId: null, status: "accepted", currency: "USD", total: 250, acceptedAt: "2026-10-19T10:00:00Z", acceptedVia: "staff_recorded", fxLockedAt: null, usdTotal: null, fxRateToUsd: null, itemsTotal: 250, itemCount: 2 };
const input = (over: Partial<EstablishInput> = {}): EstablishInput => ({
  now: NOW,
  enquiry: baseEnquiry,
  quotation: baseQuotation,
  entityRecorded: true,
  marketCurrency: "GHS",
  rates: { current: { rateToUsd: 11.0898, effectiveFrom: daysAgo(10), note: "BoG mid-rate" }, previousRateToUsd: 11 },
  nonUsdEnabled: true,
  ...over,
});
const ghs = (over: Partial<typeof baseQuotation> = {}) => input({ quotation: { ...baseQuotation, currency: "GHS", total: 1108.98, itemsTotal: 1108.98, ...over } });
const firstBlocker = (i: EstablishInput) => assessEstablishment(i).blockers[0]?.code;

describe("the non-USD release safeguard", () => {
  it("is ON (non-USD amounts due disabled) until the payment-page wording fix P1 is deployed", () => {
    expect(NON_USD_AMOUNT_DUE_ENABLED).toBe(false);
  });
  it("blocks a GHS or QAR quotation by default but never a USD one", () => {
    const { nonUsdEnabled: _omit, ...rest } = ghs();
    void _omit;
    expect(firstBlocker(rest as EstablishInput)).toBe("non_usd_disabled");
    expect(assessEstablishment({ ...input(), nonUsdEnabled: undefined }).canEstablish).toBe(true);
  });
});

describe("assessEstablishment mirrors the database checks, in the database's order", () => {
  it("no quotation, Crew Support, not linked, not accepted", () => {
    expect(firstBlocker(input({ quotation: null }))).toBe("no_quotation");
    expect(firstBlocker(input({ enquiry: { ...baseEnquiry, commercialIntent: "creative_crew_support" } }))).toBe("crew_support_excluded");
    expect(firstBlocker(input({ quotation: { ...baseQuotation, crewSupportRequestId: "r1" } }))).toBe("crew_support_excluded");
    expect(firstBlocker(input({ quotation: { ...baseQuotation, enquiryId: "other" } }))).toBe("quotation_not_linked");
    expect(firstBlocker(input({ quotation: { ...baseQuotation, status: "sent" } }))).toBe("quotation_not_accepted");
    expect(firstBlocker(input({ quotation: { ...baseQuotation, acceptedAt: null } }))).toBe("quotation_not_accepted");
  });
  it("requires an explicit contracting entity and an explicit payment market", () => {
    expect(firstBlocker(input({ entityRecorded: false }))).toBe("contracting_entity_missing");
    expect(firstBlocker(input({ enquiry: { ...baseEnquiry, paymentCountry: null } }))).toBe("payment_market_not_set");
  });
  it("currency must be USD or the payment market's currency", () => {
    expect(firstBlocker(input({ quotation: { ...baseQuotation, currency: "QAR" }, marketCurrency: "GHS" }))).toBe("currency_market_mismatch");
    expect(assessEstablishment(input()).canEstablish).toBe(true);
  });
  it("a total that does not match its lines is refused, within one cent per line", () => {
    expect(firstBlocker(input({ quotation: { ...baseQuotation, itemsTotal: 240 } }))).toBe("total_not_consistent");
    expect(assessEstablishment(input({ quotation: { ...baseQuotation, itemsTotal: 249.99 } })).canEstablish).toBe(true);
    expect(assessEstablishment(input({ quotation: { ...baseQuotation, itemsTotal: 249.97 } })).canEstablish).toBe(false);
    expect(firstBlocker(input({ quotation: { ...baseQuotation, itemCount: 0 } }))).toBe("total_not_consistent");
  });
  it("USD uses rate 1 and the exact total", () => {
    const a = assessEstablishment(input());
    expect(a.preview).toMatchObject({ usdAmount: 250, rateToUsd: 1, rateEffectiveFrom: null, noop: false });
  });
  it("GHS 1,108.98 at 11.0898 is USD 100.00, with the rate, its date, age and note shown", () => {
    const a = assessEstablishment(ghs());
    expect(a.canEstablish).toBe(true);
    expect(a.preview).toMatchObject({ usdAmount: 100, rateToUsd: 11.0898, rateAgeDays: 10, rateNote: "BoG mid-rate", rateAlreadyLocked: false, rateJump: null });
  });
  it("rounds the USD amount half up to cents", () => {
    expect(roundHalfUp(2.675)).toBe(2.68);
    expect(roundHalfUp(100 / 3)).toBe(33.33);
    expect(assessEstablishment(ghs({ total: 1000, itemsTotal: 1000 })).preview?.usdAmount).toBe(90.17);
  });
  it("rate freshness: exactly 30 days is accepted, one second more is stale", () => {
    const edge = input({ quotation: { ...baseQuotation, currency: "GHS", total: 1108.98, itemsTotal: 1108.98 }, rates: { current: { rateToUsd: 11.0898, effectiveFrom: daysAgo(RATE_MAX_AGE_DAYS), note: "x" }, previousRateToUsd: null } });
    expect(assessEstablishment(edge).canEstablish).toBe(true);
    const over = input({ ...edge, rates: { current: { rateToUsd: 11.0898, effectiveFrom: new Date(NOW.getTime() - RATE_MAX_AGE_DAYS * 86_400_000 - 1000).toISOString(), note: "x" }, previousRateToUsd: null } });
    expect(firstBlocker(over)).toBe("rate_stale");
  });
  it("a missing rate, a rate with no source note, and a non-positive rate are refused", () => {
    expect(firstBlocker({ ...ghs(), rates: { current: null, previousRateToUsd: null } })).toBe("rate_missing");
    expect(firstBlocker({ ...ghs(), rates: { current: { rateToUsd: 11, effectiveFrom: daysAgo(1), note: "  " }, previousRateToUsd: null } })).toBe("rate_source_missing");
    expect(firstBlocker({ ...ghs(), rates: { current: { rateToUsd: 0, effectiveFrom: daysAgo(1), note: "x" }, previousRateToUsd: null } })).toBe("rate_missing");
  });
  it("a rate that moved more than 10% is flagged for acknowledgement, not blocked in the preview", () => {
    const a = assessEstablishment({ ...ghs(), rates: { current: { rateToUsd: 13, effectiveFrom: daysAgo(1), note: "x" }, previousRateToUsd: 11 } });
    expect(a.canEstablish).toBe(true);
    expect(a.preview?.rateJump).toEqual({ previousRateToUsd: 11, changePercent: 18.2 });
    expect(assessEstablishment({ ...ghs(), rates: { current: { rateToUsd: 12, effectiveFrom: daysAgo(1), note: "x" }, previousRateToUsd: 11 } }).preview?.rateJump).toBeNull();
  });
  it("an already-locked rate is used unchanged and needs no fresh rate", () => {
    const a = assessEstablishment({ ...ghs({ fxLockedAt: "2026-09-01T00:00:00Z", usdTotal: 99.5, fxRateToUsd: 11.1 }), rates: { current: null, previousRateToUsd: null } });
    expect(a.preview).toMatchObject({ usdAmount: 99.5, rateToUsd: 11.1, rateAlreadyLocked: true });
  });
  it("repeating is a no-op; a different quotation, a typed amount, or payments with a different amount are refused", () => {
    expect(assessEstablishment(input({ enquiry: { ...baseEnquiry, amountDue: 250, amountDueQuotationId: "q1", amountDueSource: "accepted_quotation" } })).preview?.noop).toBe(true);
    expect(firstBlocker(input({ enquiry: { ...baseEnquiry, amountDue: 50, amountDueQuotationId: "qOld", amountDueSource: "accepted_quotation" } }))).toBe("different_quotation_supplies_amount");
    expect(firstBlocker(input({ enquiry: { ...baseEnquiry, amountDue: 77, amountDueSource: "manual" } }))).toBe("amount_already_set_use_override");
    expect(firstBlocker(input({ enquiry: { ...baseEnquiry, amountPaid: 10 } }))).toBe("payments_exist_amount_differs");
  });
});

const good: OverrideInput = {
  newAmountUsd: 120,
  currentAmountUsd: 100,
  amountPaidUsd: 40,
  category: "scope_or_price_change_agreed",
  reason: "Client agreed an extra location in writing",
  evidence: "Email 2026-10-20",
  typedReference: "enq-2026-000010",
  enquiryReference: "ENQ-2026-000010",
};

describe("override validation: a reason is more than a character count", () => {
  it("accepts a specific, evidenced, confirmed override (the typed reference is case-insensitive)", () => {
    expect(validateOverrideInput(good)).toEqual({ ok: true });
  });
  it("refuses each missing ingredient with its own message", () => {
    const err = (o: Partial<OverrideInput>) => { const r = validateOverrideInput({ ...good, ...o }); return r.ok ? "" : r.error; };
    expect(err({ newAmountUsd: 0 })).toMatch(/valid amount/);
    expect(err({ newAmountUsd: 2_000_000 })).toMatch(/valid amount/);
    expect(err({ category: "whatever" })).toMatch(/category/);
    expect(err({ reason: "too short" })).toMatch(/at least 30/);
    expect(err({ reason: "test test test test test test test test" })).toMatch(/five different words/);
    expect(err({ evidence: "" })).toMatch(/where the agreement is documented/);
    expect(err({ newAmountUsd: 30 })).toMatch(/below what has already been paid/);
    expect(err({ newAmountUsd: 100 })).toMatch(/already the amount due/);
    expect(err({ typedReference: "ENQ-2026-000011" })).toMatch(/Type the enquiry reference/);
  });
  it("a data-entry correction needs no evidence reference; every other category does", () => {
    expect(validateOverrideInput({ ...good, category: "data_entry_correction", evidence: "", reason: "Typing error corrected after re-reading the signed quotation" })).toEqual({ ok: true });
    for (const c of OVERRIDE_CATEGORIES.filter((c) => c.value !== "data_entry_correction")) {
      expect(validateOverrideInput({ ...good, category: c.value, evidence: "" }).ok, c.value).toBe(false);
    }
  });
  it("counts distinct words ignoring case and punctuation", () => {
    expect(distinctWordCount("Agreed, agreed! AGREED... new price")).toBe(3);
    expect(distinctWordCount("")).toBe(0);
  });
});

describe("error messages", () => {
  const migration = readFileSync(join(process.cwd(), "supabase/migrations/0166_m2a_quotation_amount_controls.sql"), "utf8");
  const codes = [...new Set([...migration.matchAll(/ordift:([a-z_]+)/g)].map((m) => m[1]))];
  it("every error code the database functions can raise has a plain-language message", () => {
    expect(codes.length).toBeGreaterThan(25);
    for (const c of codes) expect(AMOUNT_DUE_ERROR_MESSAGES[c], c).toBeTruthy();
  });
  it("maps a raw database error to its message, the unique-index violation to a friendly one, and anything else to a safe generic sentence", () => {
    expect(messageForAmountDueError("ordift:rate_stale")).toMatch(/30 days/);
    expect(messageForAmountDueError('duplicate key value violates unique constraint "client_quotations_one_live_per_enquiry"')).toMatch(/already has an active quotation/);
    const generic = messageForAmountDueError("relation \"x\" does not exist: secret detail");
    expect(generic).not.toMatch(/relation|secret/);
    expect(messageForAmountDueError(null)).toBe(generic);
  });
});
