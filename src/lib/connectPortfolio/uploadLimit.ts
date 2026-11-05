import { getRedis } from "@/lib/shared/redis";

// A per-user limit on photograph uploads to the QR portfolio. The site's shared limiter allows 5 requests per 10 minutes, which is right for public forms but would block a legitimate batch (the
// portfolio holds up to 30 photographs). This one allows 20 uploads in any 10 minutes for each signed-in Super Admin: enough to add a full batch in one sitting, low enough that a stolen session or a
// script cannot fill the content service. Every attempt counts, including ones that are then refused for their content. It uses the same shared Redis as the other limiters (one window shared by all
// server instances), and falls back to a per-instance counter where Redis is not configured. Like them, it fails open if Redis is unreachable, and says so in the log: an outage of the limiter must not
// stop the one person who is authorised from working, and every other control (Super Admin check, size and type checks) still applies.

export const UPLOAD_LIMIT = { windowMs: 10 * 60 * 1000, max: 20 } as const;
export type LimitResult = { allowed: boolean; retryAfterSeconds?: number };
type RedisLike = { eval: (script: string, keys: string[], args: string[]) => Promise<unknown> };

const SCRIPT = `
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

export function createUploadLimiter(opts: { redis?: () => RedisLike | null; now?: () => number; log?: (m: string, e?: unknown) => void } = {}) {
  const redisOf = opts.redis ?? (() => getRedis() as unknown as RedisLike | null);
  const now = opts.now ?? Date.now;
  const log = opts.log ?? ((m: string, e?: unknown) => console.error(`[qr-portfolio] ${m}`, e instanceof Error ? e.message : (e ?? "")));
  const memory = new Map<string, number[]>();
  const { windowMs, max } = UPLOAD_LIMIT;

  return async function check(userId: string): Promise<LimitResult> {
    const t = now();
    const redis = redisOf();
    if (!redis) {
      const hits = (memory.get(userId) ?? []).filter((h) => h > t - windowMs);
      if (hits.length >= max) { memory.set(userId, hits); return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil((hits[0] + windowMs - t) / 1000)) }; }
      hits.push(t); memory.set(userId, hits);
      return { allowed: true };
    }
    try {
      const oldest = Number(await redis.eval(SCRIPT, [`ratelimit:qr-portfolio-upload:${userId}`], [String(t), String(windowMs), String(max), `${t}-${Math.random().toString(36).slice(2)}`]));
      return oldest > 0 ? { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil((oldest + windowMs - t) / 1000)) } : { allowed: true };
    } catch (e) {
      log("upload rate-limit check failed, allowing the upload", e);
      return { allowed: true };
    }
  };
}

export const checkUploadLimit = createUploadLimiter();
