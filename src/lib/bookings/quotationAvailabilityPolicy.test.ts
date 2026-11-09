import { describe, expect, it } from "vitest";
import { classifyPaymentTerms } from "./rules";
import { CONDITIONAL_SENTENCE, decideQuotationAvailability, hasConditionalSentence, outlookFor, withConditionalSentence, type PolicyInput } from "./quotationAvailabilityPolicy";

const base = (o: Partial<PolicyInput> = {}): PolicyInput => ({ flagOn: true, hasEnquiry: true, basis: "depends", independentReason: "", conditionalAck: false, latest: { state: "available", at: "2026-11-09T10:00:00Z", stale: false }, ...o });
const latest = (state: "available" | "tentative" | "conflicting" | "unverified", stale = false) => ({ state, at: "2026-11-09T10:00:00Z", stale });

describe("decideQuotationAvailability", () => {
  it("does nothing while the booking schedule is switched off", () => expect(decideQuotationAvailability(base({ flagOn: false, basis: "" }))).toMatchObject({ ok: true, mode: "not_applicable", conditional: false }));
  it("requires the person to say whether the quotation depends on a specific person and time", () => {
    expect(decideQuotationAvailability(base({ basis: "" }))).toMatchObject({ ok: false, code: "basis_missing" });
    expect(decideQuotationAvailability(base({ basis: "maybe" }))).toMatchObject({ ok: false, code: "basis_missing" });
  });
  it("INDEPENDENT needs a reason and then issues as normal", () => {
    expect(decideQuotationAvailability(base({ basis: "independent", independentReason: "short" }))).toMatchObject({ ok: false, code: "reason_missing" });
    expect(decideQuotationAvailability(base({ basis: "independent", independentReason: "Photo retouching only, no attendance", latest: null }))).toMatchObject({ ok: true, mode: "independent", conditional: false });
  });
  it("DEPENDS: no check, or a stale check, is refused (an assessment is required first)", () => {
    expect(decideQuotationAvailability(base({ latest: null }))).toMatchObject({ ok: false, code: "check_needed" });
    expect(decideQuotationAvailability(base({ latest: latest("available", true) }))).toMatchObject({ ok: false, code: "check_stale" });
    expect(decideQuotationAvailability(base({ latest: latest("conflicting", true), conditionalAck: true }))).toMatchObject({ ok: false, code: "check_stale" });
  });
  it("DEPENDS + AVAILABLE issues as normal with no conditional wording", () => {
    expect(decideQuotationAvailability(base())).toMatchObject({ ok: true, mode: "available", conditional: false });
    expect(decideQuotationAvailability(base({ conditionalAck: true }))).toMatchObject({ ok: true, mode: "available", conditional: false });      // acknowledging is harmless and adds nothing
  });
  it("DEPENDS + TENTATIVE or UNVERIFIED can only be issued as a conditional quotation, with the acknowledgement", () => {
    for (const s of ["tentative", "unverified"] as const) {
      expect(decideQuotationAvailability(base({ latest: latest(s) }))).toMatchObject({ ok: false, code: "ack_needed" });
      expect(decideQuotationAvailability(base({ latest: latest(s), conditionalAck: true }))).toMatchObject({ ok: true, mode: "conditional", conditional: true });
    }
  });
  it("DEPENDS + CONFLICTING is refused even if the person acknowledges: a quotation must not imply availability that is known to be blocked", () => {
    expect(decideQuotationAvailability(base({ latest: latest("conflicting"), conditionalAck: true }))).toMatchObject({ ok: false, code: "conflict_known" });
    expect(decideQuotationAvailability(base({ latest: latest("conflicting") }))).toMatchObject({ ok: false, code: "conflict_known" });
  });
  it("a quotation with no enquiry cannot be checked, so it can only go out as conditional", () => {
    expect(decideQuotationAvailability(base({ hasEnquiry: false, latest: null }))).toMatchObject({ ok: false, code: "ack_needed" });
    expect(decideQuotationAvailability(base({ hasEnquiry: false, latest: null, conditionalAck: true }))).toMatchObject({ ok: true, mode: "conditional" });
  });
  it("an assessment is never a booking: the policy produces only a mode, never a reservation or confirmation", () => {
    const d = decideQuotationAvailability(base()); expect(JSON.stringify(d)).not.toMatch(/booked|reserved|held|confirmed booking/i);
  });
});

describe("conditional wording", () => {
  it("is added once, keeps the existing terms, says scheduling is subject to confirmation and promises no availability", () => {
    expect(CONDITIONAL_SENTENCE).toMatch(/subject to confirmation/); expect(CONDITIONAL_SENTENCE).toMatch(/does not confirm that any particular date, time or team member is available/);
    const t = withConditionalSentence("A 50% deposit is required to confirm the booking."); expect(t.startsWith("A 50% deposit")).toBe(true); expect(t.endsWith(CONDITIONAL_SENTENCE)).toBe(true);
    expect(withConditionalSentence(t)).toBe(t); expect(withConditionalSentence(null)).toBe(CONDITIONAL_SENTENCE); expect(hasConditionalSentence(t)).toBe(true); expect(hasConditionalSentence("x")).toBe(false);
  });
  it("does not disturb the payment-terms reading the booking rules use (it contains no payment language)", () => {
    for (const cond of ["none", "deposit", "full"] as const) {
      const terms = cond === "none" ? "No payment is required before the booking is confirmed." : cond === "deposit" ? "A 50% deposit is required to confirm the booking." : "Full payment is required before the booking is confirmed.";
      expect(classifyPaymentTerms(withConditionalSentence(terms), cond, cond === "deposit" ? 50 : null)).toBe(classifyPaymentTerms(terms, cond, cond === "deposit" ? 50 : null));
    }
    expect(classifyPaymentTerms(CONDITIONAL_SENTENCE, "none", null)).toBe("no_terms");                 // still "no terms": the sentence alone is not payment terms
    expect(classifyPaymentTerms(CONDITIONAL_SENTENCE, "deposit", 50)).toBe("no_terms");
  });
});

describe("outlookFor (what the issue form says before submitting)", () => {
  const o = (latestFacts: ReturnType<typeof latest> | null) => outlookFor({ flagOn: true, hasEnquiry: true, latest: latestFacts });
  it("maps each state to what will happen", () => {
    expect(o(latest("available")).outcome).toBe("normal"); expect(o(latest("tentative")).outcome).toBe("conditional"); expect(o(latest("unverified")).outcome).toBe("conditional");
    expect(o(latest("conflicting")).outcome).toBe("blocked"); expect(o(null).outcome).toBe("needs_check"); expect(o(latest("available", true)).outcome).toBe("needs_check");
    expect(outlookFor({ flagOn: false, hasEnquiry: true, latest: null }).outcome).toBe("normal");
  });
});
