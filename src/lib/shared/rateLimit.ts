import { getRedis } from "./redis";

// Shared rate limiter — used by every form-submission API route
// (Enquiries, Workshop Registrations, and future ones). Backed by
// Upstash Redis (src/lib/shared/redis.ts) so the window is correctly
// shared across Vercel's multiple serverless instances; falls back to
// an in-memory Map when Redis isn't configured (local dev before
// `vercel env pull`), matching the old single-instance behavior so
// nothing breaks in that case.
//
// Sliding window, evaluated atomically server-side via a Lua script:
// expired hits are trimmed, the remaining count is checked against the
// limit, and (if allowed) the new hit is recorded — all in one round
// trip, so concurrent requests from the same key across different
// instances can't race past the limit.

const WINDOW_MS = 10 * 60 * 1000; // 10 minutes
const MAX_REQUESTS_PER_WINDOW = 5;

const SLIDING_WINDOW_SCRIPT = `
local key = KEYS[1]
local now = tonumber(ARGV[1])
local windowMs = tonumber(ARGV[2])
local maxRequests = tonumber(ARGV[3])
local member = ARGV[4]

redis.call('ZREMRANGEBYSCORE', key, '-inf', now - windowMs)
local count = redis.call('ZCARD', key)
if count >= maxRequests then
  local oldest = redis.call('ZRANGE', key, 0, 0, 'WITHSCORES')
  return tonumber(oldest[2])
else
  redis.call('ZADD', key, now, member)
  redis.call('PEXPIRE', key, windowMs)
  return 0
end
`;

const memoryHits = new Map<string, number[]>();

function checkRateLimitInMemory(key: string): { allowed: boolean; retryAfterSeconds?: number } {
  const now = Date.now();
  const windowStart = now - WINDOW_MS;
  const existing = (memoryHits.get(key) ?? []).filter((t) => t > windowStart);

  if (existing.length >= MAX_REQUESTS_PER_WINDOW) {
    const oldestInWindow = existing[0];
    const retryAfterSeconds = Math.ceil((oldestInWindow + WINDOW_MS - now) / 1000);
    return { allowed: false, retryAfterSeconds };
  }

  existing.push(now);
  memoryHits.set(key, existing);
  return { allowed: true };
}

export async function checkRateLimit(key: string): Promise<{ allowed: boolean; retryAfterSeconds?: number }> {
  const redis = getRedis();
  if (!redis) {
    return checkRateLimitInMemory(key);
  }

  const now = Date.now();
  const member = `${now}-${Math.random().toString(36).slice(2)}`;

  try {
    const oldest = await redis.eval<[string, string, string, string], number>(
      SLIDING_WINDOW_SCRIPT,
      [`ratelimit:${key}`],
      [String(now), String(WINDOW_MS), String(MAX_REQUESTS_PER_WINDOW), member]
    );

    if (oldest > 0) {
      const retryAfterSeconds = Math.ceil((oldest + WINDOW_MS - now) / 1000);
      return { allowed: false, retryAfterSeconds };
    }
    return { allowed: true };
  } catch (err) {
    // Fail open rather than blocking every submission if Redis is
    // temporarily unreachable — logged so it's visible, but a
    // rate-limiter outage should never take the form down with it.
    console.error("[rateLimit] Redis check failed, allowing request", err);
    return { allowed: true };
  }
}
