import { Redis } from "@upstash/redis";

// Shared Upstash Redis client (REST-based, safe for serverless — no
// persistent TCP connection to manage across invocations). Backed by
// the Vercel Marketplace "Upstash for Redis" integration, which injects
// KV_REST_API_URL / KV_REST_API_TOKEN into every environment
// (Production, Preview, Development).
//
// Returns null when those vars aren't present (e.g. local dev before
// `vercel env pull`) so callers can fall back to an in-memory store
// instead of throwing — see rateLimit.ts and idempotency.ts.
let client: Redis | null | undefined;

export function getRedis(): Redis | null {
  if (client !== undefined) return client;
  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  client = url && token ? new Redis({ url, token }) : null;
  return client;
}
