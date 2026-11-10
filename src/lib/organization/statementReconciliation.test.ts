import { describe, expect, it } from "vitest";
import { mayConfirm, proposeMatches, type Expectation, type StatementLine } from "./statementReconciliation";

// SYNTHETIC statement lines only: no real statement is read, imported or stored by this module or its tests.
const exp = (key: string, over: Partial<Expectation> = {}): Expectation => ({ key, kind: "instalment", amount: 287.25, currency: "QAR", direction: "debit", windowFrom: "2026-11-01", windowTo: "2026-11-30", hints: ["synthpay"], ...over });
const line = (id: string, over: Partial<StatementLine> = {}): StatementLine => ({ id, date: "2026-11-08", amount: 287.25, direction: "debit", currency: "QAR", description: "SYNTHPAY SYNTH SHOP", ...over });
const cov = [{ from: "2026-11-01", to: "2026-11-30" }];

describe("statement matching (proposals only)", () => {
  it("proposes one exact match, with the hint noted", () => {
    const r = proposeMatches([exp("i1")], [line("L1")], cov);
    expect(r.proposals[0]).toMatchObject({ status: "proposed_with_hint", lineIds: ["L1"] });
    expect(r.unmatchedLines).toEqual([]);
    expect(mayConfirm(r.proposals[0])).toBe(true);
  });
  it("without a hint it is still only a proposal", () => {
    expect(proposeMatches([exp("i1")], [line("L1", { description: "CARD PURCHASE" })], cov).proposals[0].status).toBe("proposed");
  });
  it("awaiting statement when no supplied statement covers the window (not an exception)", () => {
    const r = proposeMatches([exp("i2", { windowFrom: "2026-12-01", windowTo: "2026-12-31" })], [line("L1")], cov);
    expect(r.proposals[0].status).toBe("awaiting_statement");
    expect(mayConfirm(r.proposals[0])).toBe(false);
  });
  it("an exception when a covering statement shows nothing", () => {
    expect(proposeMatches([exp("i1")], [], cov).proposals[0].status).toBe("not_found_in_covered_period");
  });
  it("a different amount is a variance to investigate, never auto-matched", () => {
    const r = proposeMatches([exp("i1")], [line("L1", { amount: 287.5 })], cov);
    expect(r.proposals[0].status).toBe("variance_review");
    expect(mayConfirm(r.proposals[0])).toBe(false);
  });
  it("two identical instalments competing for two identical lines are ambiguous, not guessed", () => {
    const r = proposeMatches([exp("i1"), exp("i2")], [line("L1"), line("L2", { date: "2026-11-09" })], cov);
    expect(r.proposals.map((p) => p.status)).toEqual(["ambiguous", "ambiguous"]);
  });
  it("one line can satisfy only one expectation", () => {
    const r = proposeMatches([exp("i1"), exp("i2")], [line("L1")], cov);
    expect(r.proposals.every((p) => p.status === "ambiguous")).toBe(true);
  });
  it("ignores other currencies, credits and out-of-window lines, and reports them as unmatched", () => {
    const lines = [line("USD", { currency: "USD" }), line("CR", { direction: "credit" }), line("OLD", { date: "2026-10-30" })];
    const r = proposeMatches([exp("i1")], lines, cov);
    expect(r.proposals[0].status).toBe("not_found_in_covered_period");
    expect(r.unmatchedLines.map((l) => l.id).sort()).toEqual(["CR", "OLD", "USD"]);
  });
  it("a line nobody expected is surfaced, never ignored", () => {
    const r = proposeMatches([exp("i1")], [line("L1"), line("EXTRA", { amount: 40, description: "UNKNOWN MERCHANT" })], cov);
    expect(r.unmatchedLines.map((l) => l.id)).toEqual(["EXTRA"]);
  });
  it("matches whole cents exactly (no floating-point drift)", () => {
    expect(proposeMatches([exp("i1", { amount: 0.1 + 0.2 })], [line("L1", { amount: 0.3 })], cov).proposals[0].status).toBe("proposed_with_hint");
  });
});
