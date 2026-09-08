import { describe, expect, it } from "vitest";
import { TALENT_OPPORTUNITY_STATUSES, isValidOpportunityTransition, isTerminalOpportunityStatus } from "./talentOpportunityLifecycle";

describe("TALENT_OPPORTUNITY_STATUSES", () => {
  it("is exactly draft/open/closed/filled/cancelled", () => {
    expect(TALENT_OPPORTUNITY_STATUSES).toEqual(["draft", "open", "closed", "filled", "cancelled"]);
  });
});

describe("isValidOpportunityTransition", () => {
  it("draft can open or be cancelled", () => {
    expect(isValidOpportunityTransition("draft", "open")).toBe(true);
    expect(isValidOpportunityTransition("draft", "cancelled")).toBe(true);
    expect(isValidOpportunityTransition("draft", "filled")).toBe(false);
  });
  it("open can close, be filled, or be cancelled", () => {
    expect(isValidOpportunityTransition("open", "closed")).toBe(true);
    expect(isValidOpportunityTransition("open", "filled")).toBe(true);
    expect(isValidOpportunityTransition("open", "cancelled")).toBe(true);
  });
  it("terminal statuses have no forward transitions", () => {
    for (const status of ["closed", "filled", "cancelled"] as const) {
      for (const target of TALENT_OPPORTUNITY_STATUSES) expect(isValidOpportunityTransition(status, target)).toBe(false);
    }
  });
});

describe("isTerminalOpportunityStatus", () => {
  it("true only for closed/filled/cancelled", () => {
    expect(isTerminalOpportunityStatus("closed")).toBe(true);
    expect(isTerminalOpportunityStatus("filled")).toBe(true);
    expect(isTerminalOpportunityStatus("cancelled")).toBe(true);
    expect(isTerminalOpportunityStatus("draft")).toBe(false);
    expect(isTerminalOpportunityStatus("open")).toBe(false);
  });
});
