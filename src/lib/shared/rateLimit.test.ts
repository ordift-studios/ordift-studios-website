import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { checkRateLimit } from "./rateLimit";

// No KV_REST_API_URL/TOKEN in the test environment, so getRedis()
// returns null and every call here exercises the in-memory fallback
// path — the same path local dev uses before `vercel env pull`. Each
// test uses its own unique key since the in-memory store is a
// module-level Map shared across the whole test file.
let keyCounter = 0;
function freshKey(): string {
  keyCounter += 1;
  return `test-key-${keyCounter}`;
}

describe("checkRateLimit (in-memory fallback)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("allows the first request for a fresh key", async () => {
    const result = await checkRateLimit(freshKey());
    expect(result.allowed).toBe(true);
  });

  it("allows exactly 5 requests within the window, then blocks the 6th", async () => {
    const key = freshKey();
    for (let i = 0; i < 5; i++) {
      const result = await checkRateLimit(key);
      expect(result.allowed).toBe(true);
    }
    const sixth = await checkRateLimit(key);
    expect(sixth.allowed).toBe(false);
    expect(sixth.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("tracks separate keys independently", async () => {
    const keyA = freshKey();
    const keyB = freshKey();
    for (let i = 0; i < 5; i++) {
      await checkRateLimit(keyA);
    }
    const blockedA = await checkRateLimit(keyA);
    const allowedB = await checkRateLimit(keyB);
    expect(blockedA.allowed).toBe(false);
    expect(allowedB.allowed).toBe(true);
  });

  it("allows requests again once the sliding window has fully elapsed", async () => {
    const key = freshKey();
    for (let i = 0; i < 5; i++) {
      await checkRateLimit(key);
    }
    expect((await checkRateLimit(key)).allowed).toBe(false);

    // 10-minute window + a second of slack
    vi.advanceTimersByTime(10 * 60 * 1000 + 1000);

    const afterWindow = await checkRateLimit(key);
    expect(afterWindow.allowed).toBe(true);
  });

  it("reports a retryAfterSeconds that shrinks as the window elapses", async () => {
    const key = freshKey();
    for (let i = 0; i < 5; i++) {
      await checkRateLimit(key);
    }
    const blockedEarly = await checkRateLimit(key);

    vi.advanceTimersByTime(5 * 60 * 1000); // halfway through the 10-minute window

    const blockedLater = await checkRateLimit(key);
    expect(blockedLater.allowed).toBe(false);
    expect(blockedLater.retryAfterSeconds!).toBeLessThan(blockedEarly.retryAfterSeconds!);
  });
});
