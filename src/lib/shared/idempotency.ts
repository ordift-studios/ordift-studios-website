// Shared in-memory idempotency store — used by every form-submission API
// route (Enquiries, Workshop Registrations, and future ones). Correct
// for a single dev/staging instance, same caveat as rateLimit.ts: a
// production deployment on multiple serverless instances needs a shared
// store (e.g. Upstash Redis) for this to hold across instances/restarts.
//
// Purpose: if a visitor's client perceives a failure (e.g. a dropped
// response) after the server actually saved the enquiry, and the client
// retries with the same idempotency key, we return the original result
// instead of creating a second enquiry.

type CachedResult = { referenceNumber: string; mode: string; storedAt: number };

const TTL_MS = 30 * 60 * 1000; // 30 minutes is plenty for a retry window
const cache = new Map<string, CachedResult>();

export function getCachedResult(key: string): CachedResult | undefined {
  const entry = cache.get(key);
  if (!entry) return undefined;
  if (Date.now() - entry.storedAt > TTL_MS) {
    cache.delete(key);
    return undefined;
  }
  return entry;
}

export function storeResult(key: string, referenceNumber: string, mode: string): void {
  if (!key) return;
  cache.set(key, { referenceNumber, mode, storedAt: Date.now() });
}
