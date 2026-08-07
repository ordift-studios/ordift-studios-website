import { getRedis } from "@/lib/shared/redis";

// Payment-specific idempotency wrapper — deliberately NOT built on top
// of src/lib/shared/idempotency.ts's public API, even though it uses
// the same underlying Redis client (getRedis()). PAYMENT_SECURITY_
// REVIEW.md §7 calls out one deliberate deviation: the shared module
// fails OPEN on a Redis outage (a missed idempotency check on a form
// submission just risks a duplicate enquiry — low cost). A missed
// idempotency check on a payment webhook risks double-processing a
// charge or refund — high cost — so this module fails CLOSED: if
// Redis is unavailable, the caller is told to treat the event as
// not-yet-safe-to-process rather than proceeding uncached.
//
// The database-level backstop (payments.idempotency_key unique
// constraint, migration 0024) still applies regardless of this
// module's outcome — this is a fast-path check, not the only guard.

const TTL_SECONDS = 24 * 60 * 60; // webhook retries can legitimately span longer than a form-retry window

export type WebhookIdempotencyCheck =
  | { outcome: "new" }
  | { outcome: "duplicate" }
  | { outcome: "store_unavailable" }; // fail closed — caller should return a retriable error, not process

export async function checkAndMarkWebhookEvent(eventKey: string): Promise<WebhookIdempotencyCheck> {
  const redis = getRedis();
  if (!redis) {
    // No Redis configured at all (e.g. local dev without `vercel env
    // pull`) is a known, expected state elsewhere in this codebase —
    // but for payments specifically, "unconfigured" and "outage" get
    // the same fail-closed treatment, since either way there's no
    // reliable dedup available.
    console.error("[payments] idempotency store unavailable (Redis not configured)");
    return { outcome: "store_unavailable" };
  }

  try {
    // SET ... NX — atomic "set only if not already present", the
    // correct primitive for exactly this check-and-mark race across
    // Vercel's multiple serverless instances.
    const key = `payment-webhook:${eventKey}`;
    // Upstash's SET NX returns "OK" when the key was newly set, or
    // null when it already existed (NX condition not met).
    const result = await redis.set(key, "1", { nx: true, ex: TTL_SECONDS });
    return result === "OK" ? { outcome: "new" } : { outcome: "duplicate" };
  } catch (err) {
    console.error("[payments] idempotency store read/write failed", err);
    return { outcome: "store_unavailable" };
  }
}
