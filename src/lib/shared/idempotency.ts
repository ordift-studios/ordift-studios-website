import { getRedis } from "./redis";

// Shared idempotency store — used by every form-submission API route
// (Enquiries, Workshop Registrations, and future ones). Backed by
// Upstash Redis (src/lib/shared/redis.ts) so a retry landing on a
// different serverless instance still sees the original result;
// falls back to an in-memory Map when Redis isn't configured (local
// dev before `vercel env pull`).
//
// Purpose: if a visitor's client perceives a failure (e.g. a dropped
// response) after the server actually saved the enquiry, and the client
// retries with the same idempotency key, we return the original result
// instead of creating a second enquiry.

type CachedResult = { referenceNumber: string; mode: string; storedAt: number };

const TTL_MS = 30 * 60 * 1000; // 30 minutes is plenty for a retry window
const TTL_SECONDS = TTL_MS / 1000;

const memoryCache = new Map<string, CachedResult>();

function getCachedResultInMemory(key: string): CachedResult | undefined {
  const entry = memoryCache.get(key);
  if (!entry) return undefined;
  if (Date.now() - entry.storedAt > TTL_MS) {
    memoryCache.delete(key);
    return undefined;
  }
  return entry;
}

export async function getCachedResult(key: string): Promise<CachedResult | undefined> {
  const redis = getRedis();
  if (!redis) {
    return getCachedResultInMemory(key);
  }

  try {
    const entry = await redis.get<CachedResult>(`idempotency:${key}`);
    return entry ?? undefined;
  } catch (err) {
    // Fail open — an idempotency-store outage should never block a
    // genuine new submission from going through.
    console.error("[idempotency] Redis read failed, treating as uncached", err);
    return undefined;
  }
}

export async function storeResult(key: string, referenceNumber: string, mode: string): Promise<void> {
  if (!key) return;
  const entry: CachedResult = { referenceNumber, mode, storedAt: Date.now() };

  const redis = getRedis();
  if (!redis) {
    memoryCache.set(key, entry);
    return;
  }

  try {
    await redis.set(`idempotency:${key}`, entry, { ex: TTL_SECONDS });
  } catch (err) {
    console.error("[idempotency] Redis write failed", err);
  }
}
