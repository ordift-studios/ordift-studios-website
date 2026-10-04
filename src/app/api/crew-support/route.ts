import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { checkRateLimit } from "@/lib/shared/rateLimit";
import { getCachedResult, storeResult } from "@/lib/shared/idempotency";
import { verifyTurnstileToken } from "@/lib/turnstile";
import { submitCrewSupportRequest } from "@/lib/crewSupport/submit";
import { realCrewSupportDeps, sendCrewSupportNotifications } from "@/lib/crewSupport/service";
import { SUBMITTED_MESSAGE } from "@/lib/crewSupport/config";

function clientKey(request: NextRequest): string {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}

// Creative Crew Support public submission (2026-10-04). Same protection
// stack as /api/enquiry (rate limit, honeypot, idempotency, Turnstile).
// Success is returned only after the atomic create succeeds; the saved
// request is a pending ENQUIRY, never a booking.
export async function POST(request: NextRequest) {
  const rateLimit = await checkRateLimit(clientKey(request));
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { ok: false, error: "rate-limited", message: "Too many requests. Please try again shortly." },
      { status: 429, headers: { "Retry-After": String(rateLimit.retryAfterSeconds ?? 60) } }
    );
  }

  let body: Record<string, unknown>;
  try {
    const parsed: unknown = await request.json();
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) throw new Error("not an object");
    body = parsed as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid-json", message: "Malformed request." }, { status: 400 });
  }

  // Honeypot — fake success so bots learn nothing; "000000" is never a
  // real sequence.
  if (typeof body.website === "string" && body.website) {
    return NextResponse.json({ ok: true, referenceNumber: `CSR-${new Date().getUTCFullYear()}-000000`, message: SUBMITTED_MESSAGE });
  }

  const idempotencyKey = typeof body.idempotencyKey === "string" ? body.idempotencyKey : "";
  if (idempotencyKey) {
    const cached = await getCachedResult(idempotencyKey);
    if (cached) return NextResponse.json({ ok: true, referenceNumber: cached.referenceNumber, message: SUBMITTED_MESSAGE });
  }

  const turnstileToken = typeof body.turnstileToken === "string" ? body.turnstileToken : null;
  if (!(await verifyTurnstileToken(turnstileToken || null))) {
    return NextResponse.json(
      { ok: false, error: "captcha-failed", message: "We couldn't verify you're human. Please refresh the page and try again." },
      { status: 403 }
    );
  }

  const result = await submitCrewSupportRequest(body, realCrewSupportDeps());
  if (!result.ok) {
    if (result.status === 422) return NextResponse.json({ ok: false, error: result.error, fieldErrors: result.fieldErrors }, { status: 422 });
    return NextResponse.json({ ok: false, error: result.error, message: result.message }, { status: 503 });
  }

  if (idempotencyKey) await storeResult(idempotencyKey, result.referenceNumber, "supabase");
  await sendCrewSupportNotifications(result.record);

  return NextResponse.json({ ok: true, referenceNumber: result.referenceNumber, message: result.message });
}
