import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { turnstileConfigState, verifyTurnstileToken } from "./turnstile";

// Tier 1 Hardening, Batch C (2026-09-06) — covers the four configuration
// states plus the token-verification success/failure/network-failure
// paths. Mirrors this codebase's established env-var save/restore
// pattern (see paymentIdentifierCrypto.test.ts) rather than vi.stubEnv.

const originalSiteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
const originalSecretKey = process.env.TURNSTILE_SECRET_KEY;

function setEnv(siteKey: string | undefined, secretKey: string | undefined) {
  if (siteKey === undefined) delete process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
  else process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY = siteKey;
  if (secretKey === undefined) delete process.env.TURNSTILE_SECRET_KEY;
  else process.env.TURNSTILE_SECRET_KEY = secretKey;
}

afterEach(() => {
  setEnv(originalSiteKey, originalSecretKey);
  vi.unstubAllGlobals();
});

describe("turnstileConfigState", () => {
  it("is 'disabled' when both site key and secret key are absent", () => {
    setEnv(undefined, undefined);
    expect(turnstileConfigState()).toBe("disabled");
  });

  it("is 'enabled' when both site key and secret key are present", () => {
    setEnv("site-key", "secret-key");
    expect(turnstileConfigState()).toBe("enabled");
  });

  it("is 'misconfigured' when the site key is present but the secret key is absent", () => {
    setEnv("site-key", undefined);
    expect(turnstileConfigState()).toBe("misconfigured");
  });

  it("is 'misconfigured' when the secret key is present but the site key is absent — must NOT be treated as disabled", () => {
    setEnv(undefined, "secret-key");
    expect(turnstileConfigState()).toBe("misconfigured");
  });
});

describe("verifyTurnstileToken", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  it("passes (no-op) when Turnstile is deliberately disabled (both vars absent) — never calls fetch", async () => {
    setEnv(undefined, undefined);
    const ok = await verifyTurnstileToken("any-token");
    expect(ok).toBe(true);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("passes even with a null token when disabled — matches the client widget rendering nothing in this state", async () => {
    setEnv(undefined, undefined);
    const ok = await verifyTurnstileToken(null);
    expect(ok).toBe(true);
  });

  it("fails closed when misconfigured (site key present, secret absent) — never calls fetch (no secret to call Cloudflare with)", async () => {
    setEnv("site-key", undefined);
    const ok = await verifyTurnstileToken("any-token");
    expect(ok).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("fails closed when misconfigured (secret present, site key absent)", async () => {
    setEnv(undefined, "secret-key");
    const ok = await verifyTurnstileToken("any-token");
    expect(ok).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("rejects a missing token when enabled — never calls fetch", async () => {
    setEnv("site-key", "secret-key");
    const ok = await verifyTurnstileToken(null);
    expect(ok).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("accepts a genuinely successful Cloudflare verification when enabled", async () => {
    setEnv("site-key", "secret-key");
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      json: async () => ({ success: true }),
    });
    const ok = await verifyTurnstileToken("real-token");
    expect(ok).toBe(true);
  });

  it("rejects a Cloudflare-reported failed verification when enabled", async () => {
    setEnv("site-key", "secret-key");
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      json: async () => ({ success: false, "error-codes": ["invalid-input-response"] }),
    });
    const ok = await verifyTurnstileToken("bad-token");
    expect(ok).toBe(false);
  });

  it("fails closed (unchanged, pre-existing behavior) on a genuine network/outage failure when enabled", async () => {
    setEnv("site-key", "secret-key");
    (fetch as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("network error"));
    const ok = await verifyTurnstileToken("any-token");
    expect(ok).toBe(false);
  });
});
