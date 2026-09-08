import { describe, expect, it } from "vitest";
import {
  SIGNATORY_STATUSES,
  isValidSignatoryTransition,
  isTerminalSignatoryStatus,
  deriveSignatureRequestStatus,
  isFullyExecutedBySignatories,
  type SignatoryStatus,
} from "./signatureLifecycle";

// Ordift Studios Legal Suite — LEGAL-SYS-1, Phase F.

describe("isValidSignatoryTransition — consent must precede signature", () => {
  it("allows the normal forward sequence", () => {
    expect(isValidSignatoryTransition("pending", "viewed")).toBe(true);
    expect(isValidSignatoryTransition("viewed", "consented")).toBe(true);
    expect(isValidSignatoryTransition("consented", "signed")).toBe(true);
  });

  it("refuses skipping consent — viewed cannot go directly to signed", () => {
    expect(isValidSignatoryTransition("viewed", "signed")).toBe(false);
  });

  it("refuses skipping viewed — pending cannot go directly to consented or signed", () => {
    expect(isValidSignatoryTransition("pending", "consented")).toBe(false);
    expect(isValidSignatoryTransition("pending", "signed")).toBe(false);
  });

  it("terminal statuses have no forward transitions at all", () => {
    for (const status of ["signed", "declined", "expired", "revoked"] as SignatoryStatus[]) {
      for (const target of SIGNATORY_STATUSES) {
        expect(isValidSignatoryTransition(status, target)).toBe(false);
      }
    }
  });
});

describe("isTerminalSignatoryStatus", () => {
  it("true only for signed/declined/expired/revoked", () => {
    expect(isTerminalSignatoryStatus("signed")).toBe(true);
    expect(isTerminalSignatoryStatus("declined")).toBe(true);
    expect(isTerminalSignatoryStatus("expired")).toBe(true);
    expect(isTerminalSignatoryStatus("revoked")).toBe(true);
    expect(isTerminalSignatoryStatus("pending")).toBe(false);
    expect(isTerminalSignatoryStatus("viewed")).toBe(false);
    expect(isTerminalSignatoryStatus("consented")).toBe(false);
  });
});

describe("deriveSignatureRequestStatus — always derived, never set arbitrarily", () => {
  it("created for zero signatories", () => {
    expect(deriveSignatureRequestStatus([])).toBe("created");
  });

  it("sent while every signatory is still pending", () => {
    expect(deriveSignatureRequestStatus([{ status: "pending" }, { status: "pending" }])).toBe("sent");
  });

  it("in_progress once at least one signatory has moved but not all are signed/expired", () => {
    expect(deriveSignatureRequestStatus([{ status: "viewed" }, { status: "pending" }])).toBe("in_progress");
    expect(deriveSignatureRequestStatus([{ status: "consented" }, { status: "signed" }])).toBe("in_progress");
  });

  it("completed only when every signatory has signed", () => {
    expect(deriveSignatureRequestStatus([{ status: "signed" }, { status: "signed" }])).toBe("completed");
    expect(deriveSignatureRequestStatus([{ status: "signed" }, { status: "consented" }])).toBe("in_progress");
  });

  it("declined takes priority the moment any signatory declines", () => {
    expect(deriveSignatureRequestStatus([{ status: "signed" }, { status: "declined" }])).toBe("declined");
  });

  it("revoked takes priority over declined", () => {
    expect(deriveSignatureRequestStatus([{ status: "revoked" }, { status: "declined" }])).toBe("revoked");
  });

  it("expired only when every signatory has expired", () => {
    expect(deriveSignatureRequestStatus([{ status: "expired" }, { status: "expired" }])).toBe("expired");
  });
});

describe("isFullyExecutedBySignatories", () => {
  it("false for an empty list — never fully executed with zero signatories", () => {
    expect(isFullyExecutedBySignatories([])).toBe(false);
  });
  it("true only when every signatory has actually signed", () => {
    expect(isFullyExecutedBySignatories([{ status: "signed" }, { status: "signed" }])).toBe(true);
    expect(isFullyExecutedBySignatories([{ status: "signed" }, { status: "consented" }])).toBe(false);
  });
});
