import { describe, expect, it } from "vitest";
import { bookingFlagOn, canConfirm, classifyConflicts, classifyPaymentTerms, confirmationBlockers, evaluateAgreement, paymentGate, projectPanel, termsCheckBlocks, unresolvedFirmConflicts, validateSegments, type BookingSettings, type Segment } from "./rules";

const S: BookingSettings = { version: 1, status: "provisional", thresholds: { QAR: 3000, GHS: 10000, USD: 800 }, alwaysCategories: ["videography", "production_services", "talent_management", "drone_operations"],
  escalators: ["usage_rights_extended", "exclusivity", "minors", "third_party_ip", "restricted_location", "complex_or_unusual", "multi_day_assignment"] };
const seg = (o: Partial<Segment> = {}): Segment => ({ startsAt: "2026-12-14T09:00:00Z", endsAt: "2026-12-14T12:00:00Z", timezone: "Asia/Qatar", kind: "on_site", location: "Doha studio", ...o });

describe("the feature flag", () => { it("is OFF unless it is exactly 'true'", () => { expect(bookingFlagOn({})).toBe(false); expect(bookingFlagOn({ BOOKING_CONFIRMATION_ENABLED: "1" })).toBe(false); expect(bookingFlagOn({ BOOKING_CONFIRMATION_ENABLED: "true" })).toBe(true); }); });

describe("agreement requirement: settings are data, not code", () => {
  it("a simple photography session below the threshold needs none", () => expect(evaluateAgreement(S, { activities: ["photography"], currency: "QAR", total: 2999 })).toEqual({ required: false, reasons: [] }));
  it("the provisional thresholds apply per currency (QAR 3,000, GHS 10,000, USD 800)", () => {
    expect(evaluateAgreement(S, { activities: ["photography"], currency: "QAR", total: 3000 }).required).toBe(true);
    expect(evaluateAgreement(S, { activities: ["photography"], currency: "GHS", total: 9999 }).required).toBe(false);
    expect(evaluateAgreement(S, { activities: ["photography"], currency: "GHS", total: 10000 }).required).toBe(true);
    expect(evaluateAgreement(S, { activities: ["photography"], currency: "USD", total: 800 }).required).toBe(true);
  });
  it("changing the settings changes the answer without any code change", () => expect(evaluateAgreement({ ...S, thresholds: { ...S.thresholds, QAR: 5000 } }, { activities: ["photography"], currency: "QAR", total: 3000 }).required).toBe(false));
  it("videography, production, talent management and drone always need one", () => { for (const a of ["videography", "production_services", "talent_management", "drone_operations"]) expect(evaluateAgreement(S, { activities: [a], currency: "QAR", total: 1 }).required).toBe(true); });
  it("a currency with no threshold fails closed; escalators add reasons", () => {
    expect(evaluateAgreement(S, { activities: ["photography"], currency: "EUR", total: 1 }).reasons).toEqual(["no_threshold_for_currency:EUR"]);
    expect(evaluateAgreement(S, { activities: ["photography"], currency: "QAR", total: 1, escalators: ["minors", "made_up"] }).reasons).toEqual(["escalator:minors"]);
    for (const e of ["usage_rights_extended", "exclusivity", "minors", "third_party_ip", "restricted_location", "complex_or_unusual"]) expect(evaluateAgreement(S, { activities: ["photography"], currency: "QAR", total: 1, escalators: [e] }).reasons).toEqual([`escalator:${e}`]);
  });
});

describe("a multi-day assignment is detected from the schedule", () => {
  it("two local days require an agreement; one day does not; the rule can be switched off by a settings version", () => {
    const two = [{ startsAt: "2026-12-14T05:00:00Z", timezone: "Asia/Qatar" }, { startsAt: "2026-12-15T05:00:00Z", timezone: "Asia/Qatar" }];
    expect(evaluateAgreement(S, { activities: ["photography"], currency: "QAR", total: 1, segments: two }).reasons).toEqual(["escalator:multi_day_assignment"]);
    expect(evaluateAgreement(S, { activities: ["photography"], currency: "QAR", total: 1, segments: [two[0]] }).required).toBe(false);
    expect(evaluateAgreement({ ...S, escalators: ["exclusivity"] }, { activities: ["photography"], currency: "QAR", total: 1, segments: two }).required).toBe(false);
  });
});

describe("the structured payment condition may not silently contradict the quotation's terms", () => {
  it("agrees", () => {
    expect(classifyPaymentTerms("A 50% deposit is required to confirm the booking; balance on delivery.", "deposit", 50)).toBe("consistent");
    expect(classifyPaymentTerms("Full payment in advance is required.", "full", null)).toBe("consistent");
    expect(classifyPaymentTerms("No deposit is required. Payment on delivery.", "none", null)).toBe("consistent");
    expect(classifyPaymentTerms("Payable upon completion.", "none", null)).toBe("consistent");
    expect(classifyPaymentTerms("Usage is limited to the agreed campaign.", "none", null)).toBe("no_payment_language");
  });
  it("contradicts", () => {
    expect(classifyPaymentTerms("A 50% deposit is required to confirm.", "none", null)).toBe("contradiction");        // the dangerous default: structured 'none' but the text asks for a deposit
    expect(classifyPaymentTerms("A 30% deposit is required to confirm.", "deposit", 50)).toBe("contradiction");
    expect(classifyPaymentTerms("Full payment in advance.", "deposit", 50)).toBe("contradiction");
    expect(classifyPaymentTerms("No deposit is required.", "deposit", 50)).toBe("contradiction");
  });
  it("is ambiguous or missing -> clarification", () => {
    expect(classifyPaymentTerms("", "none", null)).toBe("no_terms");
    expect(classifyPaymentTerms(null, "deposit", 50)).toBe("no_terms");
    expect(classifyPaymentTerms("Usage is limited to the agreed campaign.", "deposit", 50)).toBe("ambiguous");        // an upfront condition the terms never mention
    expect(classifyPaymentTerms("A 50% deposit or full payment, as agreed.", "deposit", 50)).toBe("ambiguous");
  });
  it("only written clarification clears it, and a revision note cannot clear a contradiction", () => {
    expect(termsCheckBlocks("consistent", null)).toBeNull();
    expect(termsCheckBlocks("ambiguous", null)).not.toBeNull();
    expect(termsCheckBlocks("ambiguous", { kind: "client_confirmed_in_writing", evidence: "email of 8 Nov, subject Booking" })).toBeNull();
    expect(termsCheckBlocks("contradiction", { kind: "quotation_revised", evidence: "revised quotation reference 123" })).not.toBeNull();
    expect(termsCheckBlocks("contradiction", { kind: "client_confirmed_in_writing", evidence: "short" })).not.toBeNull();
  });
});

describe("payment gate (verified payments only)", () => {
  it("none never blocks", () => expect(paymentGate("none", null, 1000, 0)).toBeNull());
  it("a deposit or full amount must be verified before confirmation", () => {
    expect(paymentGate("deposit", 50, 1000, 499.99)).not.toBeNull();
    expect(paymentGate("deposit", 50, 1000, 500)).toBeNull();
    expect(paymentGate("full", null, 1000, 999)).not.toBeNull();
    expect(paymentGate("deposit", 50, null, 0)).not.toBeNull();
  });
});

describe("date, time and place", () => {
  it("needs at least one valid session; online needs a platform; on-site needs a place", () => {
    expect(validateSegments([])).not.toBeNull();
    expect(validateSegments([seg()])).toBeNull();
    expect(validateSegments([seg({ kind: "online", location: null })])).not.toBeNull();
    expect(validateSegments([seg({ kind: "online", platform: "Video call", location: null })])).toBeNull();
    expect(validateSegments([seg({ location: "" })])).not.toBeNull();
    expect(validateSegments([seg({ endsAt: "2026-12-14T08:00:00Z" })])).not.toBeNull();
    expect(validateSegments([seg({ timezone: "Mars/Olympus" })])).not.toBeNull();
  });
  it("supports multi-day, multi-location and online in one booking", () => {
    expect(validateSegments([seg(), seg({ startsAt: "2026-12-15T05:00:00Z", endsAt: "2026-12-15T09:00:00Z", kind: "studio", location: "Studio, Doha" }), seg({ startsAt: "2026-12-16T12:00:00Z", endsAt: "2026-12-16T13:00:00Z", timezone: "Europe/London", kind: "online", platform: "Video call", location: null })])).toBeNull();
  });
});

describe("scheduling conflicts for the same assigned person", () => {
  const c = { bookings: [{ id: "b1", reference: "ENQ-1", assigneeId: "p1", enquiryId: "e1", segments: [{ startsAt: "2026-12-14T10:00:00Z", endsAt: "2026-12-14T11:00:00Z" }] }],
    crewSlots: [{ id: "s1", reference: "CSR-1", assigneeId: "p1", requestStatus: "confirmed", startDate: "2026-12-14", endDate: "2026-12-14", isTest: false }, { id: "s2", reference: "CSR-2", assigneeId: "p1", requestStatus: "quoted", startDate: "2026-12-14", endDate: "2026-12-14", isTest: false }, { id: "s3", reference: "CSR-T", assigneeId: "p1", requestStatus: "confirmed", startDate: "2026-12-14", endDate: "2026-12-14", isTest: true }],
    leave: [{ id: "l1", profileId: "p1", startDate: "2026-12-14", endDate: "2026-12-15" }] };
  it("finds booking, confirmed crew and leave as firm; an unconfirmed request as soft; ignores test records and other people", () => {
    const out = classifyConflicts("p1", [seg()], c, "e9");
    expect(out.map((x) => x.key).sort()).toEqual(["booking:b1", "crew_slot:s1", "crew_slot:s2", "leave:l1"]);
    expect(out.find((x) => x.key === "crew_slot:s2")!.firm).toBe(false);
    expect(classifyConflicts("p2", [seg()], c, "e9")).toEqual([]);
    expect(classifyConflicts(null, [seg()], c, "e9")).toEqual([]);
  });
  it("a reason alone never clears a firm conflict; only documented availability verified WITH the assigned person does", () => {
    const firm = classifyConflicts("p1", [seg()], c, "e9").filter((x) => x.firm);
    const today = "2026-11-08";
    expect(unresolvedFirmConflicts(firm, [{ key: "booking:b1", kind: "overridden", reference: "I decided so, it is fine" }], "p1", today)).toHaveLength(firm.length);
    const good = (key: string): any => ({ key, kind: "availability_verified", verifiedWithProfileId: "p1", method: "call", reference: "call with the assignee, 8 Nov", verifiedOn: today });
    expect(unresolvedFirmConflicts(firm, firm.map((x) => good(x.key)), "p1", today)).toEqual([]);
    expect(unresolvedFirmConflicts(firm, firm.map((x) => ({ ...good(x.key), verifiedWithProfileId: "p2" })), "p1", today)).toHaveLength(firm.length);
    expect(unresolvedFirmConflicts(firm, firm.map((x) => ({ ...good(x.key), verifiedOn: "2026-11-20" })), "p1", today)).toHaveLength(firm.length);
    expect(unresolvedFirmConflicts(firm, firm.map((x) => ({ ...good(x.key), reference: "short" })), "p1", today)).toHaveLength(firm.length);
  });
});

describe("blockers shown before confirmation", () => {
  const base = { quotationAccepted: true, entityEligible: true, agreement: { required: false, reasons: [], hasExecutedAgreement: false }, payment: { condition: "none" as const, depositPercent: null, amountDueUsd: 1000, verifiedPaidUsd: 0 },
    termsCheck: "consistent" as const, clarification: null, segments: [seg()], conflicts: [], resolutions: [], assigneeId: null, today: "2026-11-08" };
  it("no blockers when everything is in order", () => expect(confirmationBlockers(base)).toEqual([]));
  it("an agreement cannot override an unlicensed activity", () => expect(confirmationBlockers({ ...base, entityEligible: false, agreement: { required: true, reasons: ["category:videography"], hasExecutedAgreement: true } }).join(" ")).toMatch(/cannot override an unlicensed activity/));
  it("lists every missing requirement", () => expect(confirmationBlockers({ ...base, quotationAccepted: false, agreement: { required: true, reasons: ["value_at_or_above_threshold"], hasExecutedAgreement: false }, payment: { ...base.payment, condition: "full" }, termsCheck: "ambiguous", segments: [] }).length).toBe(5));
});

describe("who sees what", () => {
  const full = { blockers: ["b"], conflicts: [{ key: "k", kind: "booking" as const, firm: true, label: "ENQ-1", from: "a", to: "b" }], payment: { condition: "deposit" as const, amountDueUsd: 1000, verifiedPaidUsd: 500, outstandingUsd: 500 }, agreement: { required: true, reasons: ["x"] }, confirmation: { secret: 1 } };
  it("only a Super Admin sees everything and can confirm", () => { expect(projectPanel(full, { id: "u", roles: ["super_admin"] }, null)).toMatchObject({ level: "super_admin", payment: { amountDueUsd: 1000 } }); expect(canConfirm({ id: "u", roles: ["admin"] })).toBe(false); expect(canConfirm({ id: "u", roles: ["super_admin"] })).toBe(true); });
  it("an administrator sees operational blockers, not amounts or the confirmation record", () => { const p = projectPanel(full, { id: "u", roles: ["admin"] }, null) as any; expect(p.level).toBe("admin"); expect(p.payment).toBeUndefined(); expect(p.confirmation).toBeUndefined(); });
  it("staff see only the conflicts on their own assignment; others see nothing", () => {
    const own = projectPanel(full, { id: "p1", roles: ["staff"] }, "p1") as any; expect(own.level).toBe("staff"); expect(Object.keys(own).sort()).toEqual(["conflicts", "level"]);
    expect(projectPanel(full, { id: "p2", roles: ["staff"] }, "p1")).toBeNull();
    expect(projectPanel(full, { id: "c", roles: ["client"] }, null)).toBeNull();
  });
});
