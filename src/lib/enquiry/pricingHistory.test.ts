import { describe, expect, it } from "vitest";
import { approvalStillValid, conversionIdempotencyKey, ENQUIRY_PRICING_PERSISTENCE_ENABLED, followUpState, scopeHash } from "./pricingHistory";

const scope = { title: "Personal Portrait — 1h", lines: ["Market: Qatar / GCC", "Outfits/looks: 1"], baseUsd: 300 };
describe("enquiry pricing rules (feature off until the database change is authorised)", () => {
  it("is off", () => expect(ENQUIRY_PRICING_PERSISTENCE_ENABLED).toBe(false));
  it("a discount approval holds only for the exact scope and base price; any material change needs renewed approval", () => {
    const approved = { scopeHash: scopeHash(scope), status: "approved" };
    expect(approvalStillValid(approved, scope)).toEqual({ valid: true });
    expect(approvalStillValid(approved, { ...scope, lines: [...scope.lines].reverse() })).toEqual({ valid: true }); // order does not matter
    expect(approvalStillValid(approved, { ...scope, baseUsd: 450 }).valid).toBe(false);
    expect(approvalStillValid(approved, { ...scope, lines: ["Market: Ghana / West Africa", "Outfits/looks: 1"] }).valid).toBe(false);
    expect(approvalStillValid({ ...approved, status: "proposed" }, scope).valid).toBe(false);
  });
  it("follow-up states: overdue, due today, upcoming", () => {
    const now = new Date("2026-10-24T12:00:00Z");
    expect(followUpState("2026-10-22T09:00:00Z", now)).toBe("overdue");
    expect(followUpState("2026-10-24T08:00:00Z", now)).toBe("due_today");
    expect(followUpState("2026-10-24T18:00:00Z", now)).toBe("due_today");
    expect(followUpState("2026-10-26T09:00:00Z", now)).toBe("upcoming");
  });
  it("conversion uses one deterministic key per enquiry, so repeats and concurrent clicks collapse into one", () => {
    expect(conversionIdempotencyKey("e1", "client_quotation")).toBe(conversionIdempotencyKey("e1", "client_quotation"));
    expect(conversionIdempotencyKey("e1", "client_quotation")).not.toBe(conversionIdempotencyKey("e2", "client_quotation"));
    expect(conversionIdempotencyKey("e1", "client_quotation").length).toBeGreaterThanOrEqual(16);
  });
});
