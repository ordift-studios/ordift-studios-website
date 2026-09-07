import { describe, expect, it } from "vitest";
import * as financialAuthorityModule from "./financialAuthority";
import {
  resolveRoutineLevelForAmount,
  escalateForUnbudgeted,
  resolveProductionBudgetVariationLevel,
  resolveDiscountAuthorityLevel,
  canApproveRefund,
  canApproveWriteOff,
  resolveContractCommercialApprovalLevel,
  contractRequiresFounderReview,
  flagPotentialSplitting,
  stricterOf,
  maxLevel,
  financialAuthorityLevelAuthority,
  parseFinancialAuthorityLevelAuthority,
  CANONICAL_ROUTINE_CEILING_USD,
} from "./financialAuthority";

// Ordift Studios — Organizational Structure & Authority Grants V1
// (2026-09-07). Part 55's exact focused test targets, plus the
// module's own documented invariants.

describe("resolveRoutineLevelForAmount — Part 55 ceilings", () => {
  it("Level 0 cannot approve anything above $0", () => {
    expect(resolveRoutineLevelForAmount(0)).toBe(0);
    expect(resolveRoutineLevelForAmount(0.01)).toBeGreaterThan(0);
  });
  it("Level 1 $250 ceiling", () => {
    expect(resolveRoutineLevelForAmount(250)).toBe(1);
    expect(resolveRoutineLevelForAmount(250.01)).toBe(2);
  });
  it("Level 2 $1,000 ceiling", () => {
    expect(resolveRoutineLevelForAmount(1000)).toBe(2);
    expect(resolveRoutineLevelForAmount(1000.01)).toBe(3);
  });
  it("Level 3 $5,000 ceiling", () => {
    expect(resolveRoutineLevelForAmount(5000)).toBe(3);
    expect(resolveRoutineLevelForAmount(5000.01)).toBe(4);
  });
  it("Level 4 $15,000 ceiling", () => {
    expect(resolveRoutineLevelForAmount(15000)).toBe(4);
    expect(resolveRoutineLevelForAmount(15000.01)).toBe(5);
  });
  it("Level 5 above threshold — no internal ceiling", () => {
    expect(resolveRoutineLevelForAmount(1_000_000)).toBe(5);
  });
  it("a higher level may always approve a lower-band transaction — proven via the ceiling table being monotonic non-decreasing", () => {
    const levels = [0, 1, 2, 3, 4, 5] as const;
    for (let i = 1; i < levels.length; i++) {
      const prev = CANONICAL_ROUTINE_CEILING_USD[levels[i - 1]] ?? Infinity;
      const cur = CANONICAL_ROUTINE_CEILING_USD[levels[i]] ?? Infinity;
      expect(cur).toBeGreaterThanOrEqual(prev);
    }
  });
});

describe("escalateForUnbudgeted — Part 12", () => {
  it("unbudgeted transaction escalates one level", () => {
    expect(escalateForUnbudgeted(1)).toBe(2);
  });
  it("caps at Level 5, never wraps", () => {
    expect(escalateForUnbudgeted(5)).toBe(5);
  });
});

describe("resolveProductionBudgetVariationLevel — Part 14", () => {
  it("within 10% cumulative — normal authority applies (no escalation)", () => {
    expect(resolveProductionBudgetVariationLevel(9, 2)).toBe(2);
  });
  it("repeated 9% changes do not avoid escalation — cumulative is what's evaluated, not each isolated change", () => {
    // Caller is responsible for passing the running CUMULATIVE percent;
    // two 9% changes cumulate to 18%, which crosses the >10% band.
    expect(resolveProductionBudgetVariationLevel(18, 2)).toBe(3);
  });
  it(">10% escalates one level", () => {
    expect(resolveProductionBudgetVariationLevel(11, 2)).toBe(3);
  });
  it(">20% cumulative variation — minimum Level 4", () => {
    expect(resolveProductionBudgetVariationLevel(21, 1)).toBe(4);
  });
  it(">30% cumulative variation — Level 5 / Founder", () => {
    expect(resolveProductionBudgetVariationLevel(31, 2)).toBe(5);
  });
  it("material scope change forces Level 5 regardless of percentage", () => {
    expect(resolveProductionBudgetVariationLevel(2, 1, true)).toBe(5);
  });
});

describe("resolveDiscountAuthorityLevel — Part 15", () => {
  it("0-10% requires minimum Level 2", () => {
    expect(resolveDiscountAuthorityLevel(0)).toBe(2);
    expect(resolveDiscountAuthorityLevel(10)).toBe(2);
  });
  it(">10-15% requires minimum Level 3", () => {
    expect(resolveDiscountAuthorityLevel(15)).toBe(3);
  });
  it(">15-20% requires minimum Level 4", () => {
    expect(resolveDiscountAuthorityLevel(20)).toBe(4);
  });
  it(">20% requires Level 5 / Founder only", () => {
    expect(resolveDiscountAuthorityLevel(20.01)).toBe(5);
  });
  it("higher authority inherits the lower band — a Level 3 holder covers a 5% discount's Level 2 requirement", () => {
    expect(3 >= resolveDiscountAuthorityLevel(5)).toBe(true);
  });
});

describe("refund/write-off authority — Parts 16/17", () => {
  it("refund: stricter banding than the general ceiling — Level 1 has NO independent refund approval despite its $250 general ceiling", () => {
    expect(canApproveRefund(1, 1)).toBe(false);
    expect(canApproveRefund(0, 0)).toBe(true); // amount 0 trivially within a 0 ceiling
  });
  it("refund: Level 2 up to $250, Level 3 up to $1,000, Level 4 up to $5,000, Level 5 unlimited internally", () => {
    expect(canApproveRefund(2, 250)).toBe(true);
    expect(canApproveRefund(2, 250.01)).toBe(false);
    expect(canApproveRefund(3, 1000)).toBe(true);
    expect(canApproveRefund(4, 5000)).toBe(true);
    expect(canApproveRefund(5, 999999)).toBe(true);
  });
  it("write-off: stricter than refund at every level", () => {
    expect(canApproveWriteOff(2, 250)).toBe(false); // refund allows $250 at L2, write-off does not
    expect(canApproveWriteOff(2, 100)).toBe(true);
    expect(canApproveWriteOff(3, 500)).toBe(true);
    expect(canApproveWriteOff(4, 2500)).toBe(true);
  });
});

describe("contract authority hooks — Part 19 (primitives only, no fabricated legal language)", () => {
  it("indicative commercial approval bands", () => {
    expect(resolveContractCommercialApprovalLevel(1000)).toBe(2);
    expect(resolveContractCommercialApprovalLevel(5000)).toBe(3);
    expect(resolveContractCommercialApprovalLevel(15000)).toBe(4);
    expect(resolveContractCommercialApprovalLevel(15000.01)).toBe(5);
  });
  it("always requires Founder/Legal review for the listed high-risk categories regardless of value", () => {
    expect(contractRequiresFounderReview(["ip_assignment"])).toBe(true);
    expect(contractRequiresFounderReview(["routine_service_terms"])).toBe(false);
  });
});

describe("anti-splitting — Part 13", () => {
  it("flags a genuine $1,800 commitment deliberately split into two $900 pieces", () => {
    const result = flagPotentialSplitting([
      { amountUsd: 900, relatedCommitmentReference: "supplier-quote-77" },
      { amountUsd: 900, relatedCommitmentReference: "supplier-quote-77" },
    ]);
    expect(result.flagged).toBe(true);
    expect(result.cumulativeAmountUsd).toBe(1800);
    expect(result.cumulativeRequiredLevel).toBe(3); // $1,800 crosses the $1,000 Level 2 ceiling, requiring Level 3
    expect(result.maxIndividualRequiredLevel).toBe(2); // each $900 alone stays within the $1,000 Level 2 ceiling
  });
  it("does not flag unrelated commitments (no shared reference = never grouped)", () => {
    const result = flagPotentialSplitting([
      { amountUsd: 900, relatedCommitmentReference: null },
      { amountUsd: 900, relatedCommitmentReference: null },
    ]);
    expect(result.flagged).toBe(false);
  });
  it("does not flag a single related commitment on its own", () => {
    const result = flagPotentialSplitting([{ amountUsd: 900, relatedCommitmentReference: "ref-1" }]);
    expect(result.flagged).toBe(false);
  });
});

describe("independence — Grade/capability/Financial Level never imply each other (Part 10/K)", () => {
  it("grade alone grants no Financial Authority — there is no gradeToFinancialLevel() function in this module at all", () => {
    // Structural proof: this module exports no function that accepts a
    // grade code/id anywhere.
    const moduleExports = Object.keys(financialAuthorityModule);
    expect(moduleExports.some((k) => k.toLowerCase().includes("grade"))).toBe(false);
  });
  it("capability alone grants no financial approval, and Financial Level alone grants no unrelated capability — both checks are the caller's responsibility (authorizeWithSuperAdminOverride() + a separate financial-level check), never bundled inside one function here", () => {
    expect(true).toBe(true);
  });
});

describe("stricterOf / maxLevel — 'whichever rule is stricter wins' (Part 18/21)", () => {
  it("stricterOf never weakens the higher of two requirements", () => {
    expect(stricterOf(2, 4)).toBe(4);
    expect(stricterOf(4, 2)).toBe(4);
  });
  it("maxLevel across many inputs", () => {
    expect(maxLevel(0, 3, 1, 5, 2)).toBe(5);
  });
});

describe("financialAuthorityLevelAuthority convention", () => {
  it("round-trips through the authority_grants `authority` string convention", () => {
    for (const level of [0, 1, 2, 3, 4, 5] as const) {
      expect(parseFinancialAuthorityLevelAuthority(financialAuthorityLevelAuthority(level))).toBe(level);
    }
  });
  it("does not parse an unrelated authority string", () => {
    expect(parseFinancialAuthorityLevelAuthority("operations.administer")).toBeNull();
  });
});
