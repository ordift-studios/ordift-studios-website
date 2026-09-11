import { describe, expect, it } from "vitest";
import { mockProvisioningProvider, PROVISIONING_TYPES } from "./provisioningProvider";

// Google Workspace Corporate Email, Milestone 1B (2026-09-10) — real,
// executable unit tests. mockProvisioningProvider is pure (no I/O), so
// unlike most of this project's DB-dependent code these are genuine
// tests, not doc-tests.
//
// Confirms explicitly: this module makes no network call of any kind.
// Read directly — provisioningProvider.ts imports nothing but
// TypeScript types from itself; the mock's only external dependency is
// crypto.randomUUID() (a pure, local, standard-library call with no
// network access whatsoever). No test below can reach Google, or
// anything outside this process.

describe("mockProvisioningProvider — name and type modeling", () => {
  it("identifies itself as 'mock', never anything that could be confused with a real provider", () => {
    expect(mockProvisioningProvider.name).toBe("mock");
  });

  it("PROVISIONING_TYPES models all three kinds, even though only licensed_mailbox has a built workflow", () => {
    expect(PROVISIONING_TYPES).toEqual(["licensed_mailbox", "alias", "group"]);
  });
});

describe("mockProvisioningProvider.checkAvailability", () => {
  it("reports 'available' for any ordinary address", async () => {
    await expect(mockProvisioningProvider.checkAvailability("jane.doe@ordiftstudios.com")).resolves.toBe("available");
  });
  it("reports 'taken' for an address whose local part signals it's already taken", async () => {
    await expect(mockProvisioningProvider.checkAvailability("taken.person@ordiftstudios.com")).resolves.toBe("taken");
    await expect(mockProvisioningProvider.checkAvailability("alreadyexists@ordiftstudios.com")).resolves.toBe("taken");
  });
  it("reports 'unavailable' for an address whose local part signals a provider-unavailable scenario", async () => {
    await expect(mockProvisioningProvider.checkAvailability("serviceunavailable@ordiftstudios.com")).resolves.toBe("unavailable");
  });
  it("reports 'ambiguous' for an address whose local part signals an ambiguous provider response", async () => {
    await expect(mockProvisioningProvider.checkAvailability("ambiguouscase@ordiftstudios.com")).resolves.toBe("ambiguous");
  });
  it("is case-insensitive on the local part", async () => {
    await expect(mockProvisioningProvider.checkAvailability("TAKEN.person@ordiftstudios.com")).resolves.toBe("taken");
  });
});

describe("mockProvisioningProvider.provision", () => {
  const baseRequest = { provisioningType: "licensed_mailbox" as const, legalFirstName: "Jane", legalSurname: "Doe" };

  it("succeeds for an ordinary address, returning a mock-prefixed externalId that can never be mistaken for a real Google user id", async () => {
    const result = await mockProvisioningProvider.provision({ ...baseRequest, email: "jane.doe@ordiftstudios.com" });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.externalId.startsWith("mock-")).toBe(true);
    }
  });

  it("fails with reason 'already_exists' for a taken address", async () => {
    const result = await mockProvisioningProvider.provision({ ...baseRequest, email: "taken.person@ordiftstudios.com" });
    expect(result).toEqual({ ok: false, reason: "already_exists" });
  });

  it("fails with reason 'unavailable' for an unavailable-provider scenario", async () => {
    const result = await mockProvisioningProvider.provision({ ...baseRequest, email: "serviceunavailable@ordiftstudios.com" });
    expect(result).toEqual({ ok: false, reason: "unavailable" });
  });

  it("fails with reason 'ambiguous' for an ambiguous-response scenario", async () => {
    const result = await mockProvisioningProvider.provision({ ...baseRequest, email: "ambiguouscase@ordiftstudios.com" });
    expect(result).toEqual({ ok: false, reason: "ambiguous" });
  });

  it("never invents/resolves a collision automatically — a taken address always fails, never silently succeeds with a suffixed alternative", async () => {
    const result = await mockProvisioningProvider.provision({ ...baseRequest, email: "taken.person@ordiftstudios.com" });
    expect(result.ok).toBe(false);
  });

  it("is deterministic across repeated calls with the same input (no hidden state, no randomness in the decision itself)", async () => {
    const first = await mockProvisioningProvider.provision({ ...baseRequest, email: "taken.person@ordiftstudios.com" });
    const second = await mockProvisioningProvider.provision({ ...baseRequest, email: "taken.person@ordiftstudios.com" });
    expect(first).toEqual(second);
  });

  describe("'partial_success' (Milestone 1C-A test-only trigger)", () => {
    it("fails with reason 'partial_success' AND a real externalId — the account exists, only the failure is reported", async () => {
      const result = await mockProvisioningProvider.provision({ ...baseRequest, email: "partial.case@ordiftstudios.com" });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toBe("partial_success");
        expect(result.externalId?.startsWith("mock-")).toBe(true);
      }
    });

    it("every other failure reason still carries no externalId at all, unchanged from before this milestone", async () => {
      const takenResult = await mockProvisioningProvider.provision({ ...baseRequest, email: "taken.person@ordiftstudios.com" });
      expect(takenResult).toEqual({ ok: false, reason: "already_exists" });
      const unavailableResult = await mockProvisioningProvider.provision({ ...baseRequest, email: "serviceunavailable@ordiftstudios.com" });
      expect(unavailableResult).toEqual({ ok: false, reason: "unavailable" });
      const ambiguousResult = await mockProvisioningProvider.provision({ ...baseRequest, email: "ambiguouscase@ordiftstudios.com" });
      expect(ambiguousResult).toEqual({ ok: false, reason: "ambiguous" });
    });

    it("does not affect checkAvailability at all — a 'partial' local part still reports 'available', since this is only knowable at actual provision time, matching the real two-step Google flow", async () => {
      await expect(mockProvisioningProvider.checkAvailability("partial.case@ordiftstudios.com")).resolves.toBe("available");
    });
  });
});
