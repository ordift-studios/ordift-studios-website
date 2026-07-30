import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getCachedResult, storeResult } from "./idempotency";

// Same in-memory-fallback reasoning as rateLimit.test.ts — no Redis
// env vars in the test environment, so every call here exercises the
// in-memory Map path.
let keyCounter = 0;
function freshKey(): string {
  keyCounter += 1;
  return `idempotency-test-${keyCounter}`;
}

describe("idempotency store (in-memory fallback)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns undefined for a key that was never stored", async () => {
    expect(await getCachedResult(freshKey())).toBeUndefined();
  });

  it("returns the stored result for a matching key — the core retry-safety guarantee", async () => {
    const key = freshKey();
    await storeResult(key, "ENQ-2026-000123", "sent");

    const cached = await getCachedResult(key);
    expect(cached).toBeDefined();
    expect(cached!.referenceNumber).toBe("ENQ-2026-000123");
    expect(cached!.mode).toBe("sent");
  });

  it("keeps different keys' results independent", async () => {
    const keyA = freshKey();
    const keyB = freshKey();
    await storeResult(keyA, "ENQ-2026-000001", "sent");
    await storeResult(keyB, "WSH-2026-000002", "sent");

    expect((await getCachedResult(keyA))!.referenceNumber).toBe("ENQ-2026-000001");
    expect((await getCachedResult(keyB))!.referenceNumber).toBe("WSH-2026-000002");
  });

  it("expires a cached result after the 30-minute TTL", async () => {
    const key = freshKey();
    await storeResult(key, "ENQ-2026-000456", "sent");
    expect(await getCachedResult(key)).toBeDefined();

    vi.advanceTimersByTime(30 * 60 * 1000 + 1000);

    expect(await getCachedResult(key)).toBeUndefined();
  });

  it("still returns the result just before the TTL boundary", async () => {
    const key = freshKey();
    await storeResult(key, "ENQ-2026-000789", "sent");

    vi.advanceTimersByTime(29 * 60 * 1000);

    expect(await getCachedResult(key)).toBeDefined();
  });

  it("silently no-ops storing with an empty key rather than throwing", async () => {
    await expect(storeResult("", "ENQ-2026-000000", "sent")).resolves.toBeUndefined();
  });
});
