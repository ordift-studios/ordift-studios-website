import { describe, expect, it } from "vitest";
import {
  isValidAgreementLifecycleTransition,
  isExceptionalAgreementStatus,
  isTerminalAgreementStatus,
  isIssuedAgreementStatus,
  isFullyExecuted,
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
