import { describe, expect, it } from "vitest";
import {
  isValidAgreementLifecycleTransition,
  isExceptionalAgreementStatus,
  isTerminalAgreementStatus,
  isIssuedAgreementStatus,
  isFullyExecuted,
  normalForwardPathToFullyExecuted,
  AGREEMENT_LIFECYCLE_STATUSES,
} from "./agreementLifecycle";

// Ordift Studios Legal Suite — LEGAL-SYS-1, Phase E, Part 12.

describe("AGREEMENT_LIFECYCLE_STATUSES — never one generic boolean", () => {
  it("contains every documented normal stage plus every exceptional state", () => {
    expect(AGREEMENT_LIFECYCLE_STATUSES).toContain("draft");
    expect(AGREEMENT_LIFECYCLE_STATUSES).toContain("fully_executed");
    expect(AGREEMENT_LIFECYCLE_STATUSES).toContain("active");
    expect(AGREEMENT_LIFECYCLE_STATUSES).toContain("completed");
    for (const exceptional of ["declined", "cancelled", "expired", "superseded", "terminated"]) {
      expect(AGREEMENT_LIFECYCLE_STATUSES).toContain(exceptional);
    }
  });
});

describe("isValidAgreementLifecycleTransition — enforces valid transitions only", () => {
  it("allows the full documented normal sequence", () => {
    expect(isValidAgreementLifecycleTransition("draft", "internal_review")).toBe(true);
    expect(isValidAgreementLifecycleTransition("internal_review", "approved_for_issue")).toBe(true);
    expect(isValidAgreementLifecycleTransition("approved_for_issue", "sent")).toBe(true);
    expect(isValidAgreementLifecycleTransition("sent", "viewed")).toBe(true);
    expect(isValidAgreementLifecycleTransition("viewed", "accepted_for_signature")).toBe(true);
    expect(isValidAgreementLifecycleTransition("accepted_for_signature", "partially_signed")).toBe(true);
    expect(isValidAgreementLifecycleTransition("partially_signed", "fully_executed")).toBe(true);
    expect(isValidAgreementLifecycleTransition("fully_executed", "active")).toBe(true);
    expect(isValidAgreementLifecycleTransition("active", "completed")).toBe(true);
  });

  it("allows viewed -> changes_requested -> back to draft (the revision loop)", () => {
    expect(isValidAgreementLifecycleTransition("viewed", "changes_requested")).toBe(true);
    expect(isValidAgreementLifecycleTransition("changes_requested", "draft")).toBe(true);
  });

  it("refuses skipping straight from draft to fully_executed", () => {
    expect(isValidAgreementLifecycleTransition("draft", "fully_executed")).toBe(false);
  });

  it("refuses moving backward from active to draft", () => {
    expect(isValidAgreementLifecycleTransition("active", "draft")).toBe(false);
  });

  it("terminal states have no outbound transitions at all", () => {
    for (const terminal of ["completed", "declined", "cancelled", "expired", "superseded", "terminated"] as const) {
      expect(isValidAgreementLifecycleTransition(terminal, "draft")).toBe(false);
      expect(isValidAgreementLifecycleTransition(terminal, "active")).toBe(false);
    }
  });

  it("allows accepted_for_signature to skip straight to fully_executed (single-signatory case)", () => {
    expect(isValidAgreementLifecycleTransition("accepted_for_signature", "fully_executed")).toBe(true);
  });
});

describe("isExceptionalAgreementStatus / isTerminalAgreementStatus", () => {
  it("declined/cancelled/expired/superseded/terminated are exceptional AND terminal", () => {
    for (const s of ["declined", "cancelled", "expired", "superseded", "terminated"] as const) {
      expect(isExceptionalAgreementStatus(s)).toBe(true);
      expect(isTerminalAgreementStatus(s)).toBe(true);
    }
  });
  it("completed is terminal but not exceptional", () => {
    expect(isTerminalAgreementStatus("completed")).toBe(true);
    expect(isExceptionalAgreementStatus("completed")).toBe(false);
  });
  it("draft/sent/active are neither exceptional nor terminal", () => {
    for (const s of ["draft", "sent", "active"] as const) {
      expect(isExceptionalAgreementStatus(s)).toBe(false);
      expect(isTerminalAgreementStatus(s)).toBe(false);
    }
  });
});

describe("isIssuedAgreementStatus — Part 14 (MASTER != ISSUED AGREEMENT)", () => {
  it("draft and internal_review are pre-issue — a master revision may still affect these", () => {
    expect(isIssuedAgreementStatus("draft")).toBe(false);
    expect(isIssuedAgreementStatus("internal_review")).toBe(false);
  });
  it("approved_for_issue and everything after is issued — frozen against later master revisions", () => {
    for (const s of ["approved_for_issue", "sent", "viewed", "fully_executed", "active", "completed"] as const) {
      expect(isIssuedAgreementStatus(s)).toBe(true);
    }
  });
});

describe("isFullyExecuted — Part 18 (documented definition only, wired to nothing real yet)", () => {
  it("true for fully_executed, active, and completed", () => {
    expect(isFullyExecuted("fully_executed")).toBe(true);
    expect(isFullyExecuted("active")).toBe(true);
    expect(isFullyExecuted("completed")).toBe(true);
  });
  it("false for anything before fully_executed", () => {
    expect(isFullyExecuted("sent")).toBe(false);
    expect(isFullyExecuted("partially_signed")).toBe(false);
  });
});

// Production defect (2026-09-16) — discovered via controlled QA on
// Lady Anim-Tetey's OS-LGL-009A Framework (ORD-AGR-2026-000005):
// recordSignatorySignature() (signatureEngine.ts) tried a single
// direct transitionAgreementStatus() hop from "sent" straight to
// "fully_executed" once every signatory had signed — but
// isValidAgreementLifecycleTransition("sent","fully_executed") is
// false (sent only leads to viewed/expired/cancelled), so it silently
// refused every time, while the signatory-facing UI still reported
// success. Both real signature_evidence rows existed correctly; only
// the derived agreement.status column failed to catch up.
// normalForwardPathToFullyExecuted() is the fix's pure core: every
// single hop it returns must itself already be a documented valid
// transition (verified against isValidAgreementLifecycleTransition()
// directly below, not just asserted).
describe("normalForwardPathToFullyExecuted — the fix for the 2026-09-16 signature-completion defect", () => {
  it("from 'sent' (the real-world starting point every agreement is actually stuck at today), returns exactly ['viewed','accepted_for_signature','fully_executed']", () => {
    expect(normalForwardPathToFullyExecuted("sent")).toEqual(["viewed", "accepted_for_signature", "fully_executed"]);
  });

  it("every consecutive pair in the returned path is independently a valid transition — the exact property that was violated by the single-hop 'sent' -> 'fully_executed' attempt this fix replaces", () => {
    const path = normalForwardPathToFullyExecuted("sent");
    expect(path).not.toBeNull();
    let from: (typeof AGREEMENT_LIFECYCLE_STATUSES)[number] = "sent";
    for (const to of path!) {
      expect(isValidAgreementLifecycleTransition(from, to)).toBe(true);
      from = to;
    }
  });

  it("from 'viewed' or 'accepted_for_signature' (an agreement that DID get its intermediate status advanced by some other future code path), returns only the remaining hops — never re-walks a hop already passed", () => {
    expect(normalForwardPathToFullyExecuted("viewed")).toEqual(["accepted_for_signature", "fully_executed"]);
    expect(normalForwardPathToFullyExecuted("accepted_for_signature")).toEqual(["fully_executed"]);
  });

  it("returns null once already at or past fully_executed — never attempts a redundant or backward transition", () => {
    expect(normalForwardPathToFullyExecuted("fully_executed")).toBeNull();
    expect(normalForwardPathToFullyExecuted("active")).toBeNull();
    expect(normalForwardPathToFullyExecuted("completed")).toBeNull();
  });

  it("returns null for a status with no normal forward path at all (an exceptional/terminal state, or 'changes_requested' — the off-ramp back to draft, deliberately excluded from this forward sequence)", () => {
    expect(normalForwardPathToFullyExecuted("declined")).toBeNull();
    expect(normalForwardPathToFullyExecuted("cancelled")).toBeNull();
    expect(normalForwardPathToFullyExecuted("changes_requested")).toBeNull();
  });
});
