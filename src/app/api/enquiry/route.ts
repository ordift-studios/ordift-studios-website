import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { enquirySchema } from "@/lib/enquiry/schema";
import { generateRecordId } from "@/lib/shared/recordId";
import { checkRateLimit } from "@/lib/shared/rateLimit";
import { getCachedResult, storeResult } from "@/lib/shared/idempotency";
import { syncEnquiryToSheets, type EnquiryRecord } from "@/lib/enquiry/storage";
import { sendAcknowledgementEmail, sendAdminNotificationEmail } from "@/lib/enquiry/email";
import { saveEnquiryToSupabase } from "@/lib/supabase/primaryWrite";
import { isStaging } from "@/lib/shared/env";
import { verifyTurnstileToken } from "@/lib/turnstile";

function clientKey(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for");
  return forwarded?.split(",")[0]?.trim() || "unknown";
}

// Staging-only test hook (Plan Part J / approved 2026-07-23) so the
// server-generated error states can be demonstrated safely without
// touching real infrastructure. Header is silently ignored outside
// staging — there is no way to trigger this in production.
type ForcedError = "storage" | "email" | null;
function forcedErrorFor(request: NextRequest): ForcedError {
  if (!isStaging()) return null;
  const value = request.headers.get("x-test-force-error");
  return value === "storage" || value === "email" ? value : null;
}

export async function POST(request: NextRequest) {
  const key = clientKey(request);
  const rateLimit = await checkRateLimit(key);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      {
        ok: false,
        error: "rate-limited",
        message: "Too many requests. Please try again shortly.",
      },
      { status: 429, headers: { "Retry-After": String(rateLimit.retryAfterSeconds ?? 60) } }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "invalid-json", message: "Malformed request." },
      { status: 400 }
    );
  }

  const parsed = enquirySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        ok: false,
        error: "validation-failed",
        fieldErrors: z.flattenError(parsed.error).fieldErrors,
      },
      { status: 422 }
    );
  }

  // Honeypot: a real visitor never fills this hidden field. Fail
  // silently with a fake-success shape so bots don't learn the check
  // exists — "000000" is never a real assigned sequence (they start at
  // 1), and returning it costs no database round-trip.
  if (parsed.data.website) {
    return NextResponse.json({
      ok: true,
      referenceNumber: `ENQ-${new Date().getUTCFullYear()}-000000`,
    });
  }

  const { website: _honeypot, idempotencyKey, turnstileToken, ...data } = parsed.data;
  void _honeypot;

  // Idempotency check comes before CAPTCHA verification on purpose: a
  // Turnstile token is single-use, so a genuine client retry after a
  // perceived failure (network blip, etc.) — resubmitting with the same
  // idempotencyKey but a token already spent on the first attempt —
  // must be able to return the cached result without needing a fresh
  // challenge. A truly new submission always has a new idempotencyKey
  // (generated once per form session) and still goes through CAPTCHA
  // normally below.
  if (idempotencyKey) {
    const cached = await getCachedResult(idempotencyKey);
    if (cached) {
      return NextResponse.json({ ok: true, referenceNumber: cached.referenceNumber });
    }
  }

  // CAPTCHA — server-verified only, never trusted from the client beyond
  // the token itself. No-ops (always passes) until TURNSTILE_SECRET_KEY
  // is configured, matching the honeypot/rate-limit "protection layers
  // stack independently" design: this never replaces them, it adds to
  // them.
  const turnstileOk = await verifyTurnstileToken(turnstileToken || null);
  if (!turnstileOk) {
    return NextResponse.json(
      {
        ok: false,
        error: "captcha-failed",
        message: "We couldn't verify you're human. Please refresh the page and try again.",
      },
      { status: 403 }
    );
  }

  const forcedError = forcedErrorFor(request);

  let referenceNumber: string;
  try {
    referenceNumber = await generateRecordId("ENQ");
  } catch (err) {
    console.error("[enquiry] failed to generate record id", err);
    return NextResponse.json(
      {
        ok: false,
        error: "save-failed",
        message: "We couldn't save your enquiry. Please try again or email us directly.",
      },
      { status: 503 }
    );
  }

  const record: EnquiryRecord = {
    ...data,
    idempotencyKey,
    referenceNumber,
    submittedAt: new Date().toISOString(),
    environment: isStaging() ? "staging" : "production",
  };

  // Supabase is the primary, required application database — a failure
  // here fails the whole submission (see src/lib/supabase/primaryWrite.ts).
  const saveResult =
    forcedError === "storage"
      ? ({ ok: false, error: "forced-test-failure" } as const)
      : await saveEnquiryToSupabase(record);

  if (!saveResult.ok) {
    console.error("[enquiry] failed to save submission", record.referenceNumber, saveResult.error);
    // Deliberately generic — never expose internal error codes/stack
    // traces to the visitor.
    return NextResponse.json(
      {
        ok: false,
        error: "save-failed",
        message: "We couldn't save your enquiry. Please try again or email us directly.",
      },
      { status: 503 }
    );
  }

  // Saved successfully — cache the result now, before attempting email
  // or the Sheets sync, so that even if everything after this point
  // fails, a retry with the same idempotency key won't create a second
  // saved enquiry.
  if (idempotencyKey) {
    await storeResult(idempotencyKey, record.referenceNumber, "supabase");
  }

  // Google Sheets is a best-effort secondary copy (see
  // src/lib/enquiry/storage.ts's syncEnquiryToSheets) — it never throws
  // and never affects whether this request succeeds; a failed append is
  // logged to sheet_sync_failures for later retry instead.
  const [ackResult, adminResult] = await Promise.all([
    forcedError === "email"
      ? Promise.resolve({ ok: false, error: "forced-test-failure" } as const)
      : sendAcknowledgementEmail(record),
    sendAdminNotificationEmail(record),
    syncEnquiryToSheets(record),
  ]);
  if (!ackResult.ok) {
    console.error("[enquiry] acknowledgement email failed", record.referenceNumber, ackResult.error);
  }
  if (!adminResult.ok) {
    console.error("[enquiry] admin notification failed", record.referenceNumber, adminResult.error);
  }

  // The enquiry is saved regardless of email/Sheets outcome — a visitor
  // should never be told to retry (and risk a duplicate) just because
  // the acknowledgement email or the Sheets copy failed.
  return NextResponse.json({
    ok: true,
    referenceNumber: record.referenceNumber,
  });
}
