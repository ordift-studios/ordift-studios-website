// Shared in-memory rate limiter — used by every form-submission API
// route (Enquiries, Workshop Registrations, and future ones). Correct
// for a single dev/staging instance. A production deployment on multiple
// serverless instances needs a shared store (e.g. Upstash Redis) since
// this Map won't be shared across instances — flagged here rather than
// silently under-protecting production later. Because every route calls
// through this one module, swapping the in-memory Map for a Redis-backed
// implementation is a one-file change, not a per-route rewrite.

const WINDOW_MS = 10 * 60 * 1000; // 10 minutes
const MAX_REQUESTS_PER_WINDOW = 5;

const hits = new Map<string, number[]>();

export function checkRateLimit(key: string): { allowed: boolean; retryAfterSeconds?: number } {
  const now = Date.now();
  const windowStart = now - WINDOW_MS;
  const existing = (hits.get(key) ?? []).filter((t) => t > windowStart);

  if (existing.length >= MAX_REQUESTS_PER_WINDOW) {
    const oldestInWindow = existing[0];
    const retryAfterSeconds = Math.ceil((oldestInWindow + WINDOW_MS - now) / 1000);
    return { allowed: false, retryAfterSeconds };
  }

  existing.push(now);
  hits.set(key, existing);
  return { allowed: true };
}
