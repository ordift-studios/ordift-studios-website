import { describe, expect, it } from "vitest";
import {
  canRequestProvisioning,
  canAttemptProvisioning,
  resolveProvisioningOutcomeStatus,
  resolveProvisioningExceptionStatus,
  type CorporateIdentityStatus,
} from "./provisioningLifecycle";

// Google Workspace Corporate Email, Milestone 1B (2026-09-10) — real,
// executable unit tests for the pure lifecycle-guard functions. This
// is where "prevention of premature active status" and "wrong
// lifecycle state" get genuine proof, not a doc-test — these functions
// have no I/O at all.

const ALL_STATUSES: CorporateIdentityStatus[] = ["reserved", "pending_provisioning", "provisioning_failed", "active", "suspended", "deactivated"];

describe("canRequestProvisioning", () => {
  it("allows a request only from 'reserved'", () => {
    expect(canRequestProvisioning("reserved")).toBe(true);
  });
  it("refuses a request from every other status — wrong lifecycle state", () => {
    for (const status of ALL_STATUSES.filter((s) => s !== "reserved")) {
      expect(canRequestProvisioning(status)).toBe(false);
    }
  });
});

describe("canAttemptProvisioning", () => {
  it("allows an attempt from 'pending_provisioning' (the normal first attempt)", () => {
    expect(canAttemptProvisioning("pending_provisioning")).toBe(true);
  });
  it("allows an attempt from 'provisioning_failed' (an explicit retry)", () => {
    expect(canAttemptProvisioning("provisioning_failed")).toBe(true);
  });
  it("refuses an attempt from 'reserved' — a request must happen first", () => {
    expect(canAttemptProvisioning("reserved")).toBe(false);
  });
  it("refuses an attempt from 'active' — already provisioned, this is not a re-provisioning operation", () => {
    expect(canAttemptProvisioning("active")).toBe(false);
  });
  it("refuses an attempt from 'suspended' or 'deactivated'", () => {
    expect(canAttemptProvisioning("suspended")).toBe(false);
    expect(canAttemptProvisioning("deactivated")).toBe(false);
  });
});

describe("resolveProvisioningOutcomeStatus — the one function that may ever produce 'active'", () => {
  it("resolves to 'active' only for a genuine ok:true outcome", () => {
    expect(resolveProvisioningOutcomeStatus({ ok: true, externalId: "mock-123" })).toBe("active");
  });
  it("resolves to 'provisioning_failed' for every non-success reason — already_exists", () => {
    expect(resolveProvisioningOutcomeStatus({ ok: false, reason: "already_exists" })).toBe("provisioning_failed");
  });
  it("resolves to 'provisioning_failed' for every non-success reason — unavailable", () => {
    expect(resolveProvisioningOutcomeStatus({ ok: false, reason: "unavailable" })).toBe("provisioning_failed");
  });
  it("resolves to 'provisioning_failed' for every non-success reason — ambiguous", () => {
    expect(resolveProvisioningOutcomeStatus({ ok: false, reason: "ambiguous" })).toBe("provisioning_failed");
  });
  it("resolves to 'provisioning_failed' for 'partial_success' (Milestone 1C-A) exactly like every other failure reason — a real external account existing is never itself grounds for 'active'", () => {
    expect(resolveProvisioningOutcomeStatus({ ok: false, reason: "partial_success", externalId: "mock-123" })).toBe("provisioning_failed");
  });
  it("resolving 'partial_success' needs no change to this function at all — it's already covered by the same outcome.ok check every other failure reason uses", () => {
    // This test exists to make that fact explicit and regression-proof,
    // not because the implementation needed to change for it to pass.
    expect(resolveProvisioningOutcomeStatus({ ok: false, reason: "partial_success" })).toBe(resolveProvisioningOutcomeStatus({ ok: false, reason: "unavailable" }));
  });
});

describe("resolveProvisioningExceptionStatus", () => {
  it("always resolves to 'provisioning_failed' — a thrown/unexpected error can never become 'active'", () => {
    expect(resolveProvisioningExceptionStatus()).toBe("provisioning_failed");
  });
});

describe("premature-activation guarantee, stated as a single cross-cutting property", () => {
  it("no combination of these functions can produce 'active' without a genuine ok:true provider outcome having been resolved", () => {
    // Every non-success shape this module knows about, run through the
    // same resolver a real call site would use.
    const nonSuccessOutcomes = [
      { ok: false as const, reason: "already_exists" as const },
      { ok: false as const, reason: "unavailable" as const },
      { ok: false as const, reason: "ambiguous" as const },
      { ok: false as const, reason: "partial_success" as const, externalId: "mock-123" },
    ];
    for (const outcome of nonSuccessOutcomes) {
      expect(resolveProvisioningOutcomeStatus(outcome)).not.toBe("active");
    }
    expect(resolveProvisioningExceptionStatus()).not.toBe("active");
  });
});
