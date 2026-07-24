import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { enquirySchema } from "@/lib/enquiry/schema";
import { generateReferenceNumber } from "@/lib/enquiry/reference";
import { checkRateLimit } from "@/lib/shared/rateLimit";
import { getCachedResult, storeResult } from "@/lib/shared/idempotency";
import { saveEnquiry, type EnquiryRecord } from "@/lib/enquiry/storage";
import { sendAcknowledgementEmail, sendAdminNotificationEmail } from "@/lib/enquiry/email";
import { dualWriteEnquiry } from "@/lib/supabase/dualWrite";
import { isStaging } from "@/lib/shared/env";

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
  const rateLimit = checkRateLimit(key);
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

  // Honeypot: a real visitor never fills this hidden field. Fail silently
  // with a fake-success shape so bots don't learn the check exists.
  if (parsed.data.website) {
    return NextResponse.json({ ok: true, referenceNumber: generateReferenceNumber() });
  }

  const { website: _honeypot, idempotencyKey, ...data } = parsed.data;
  void _honeypot;

  // Idempotency: if this exact submission was already processed (client
  // retried after a perceived failure), return the original result
  // instead of creating a second enquiry.
  if (idempotencyKey) {
    const cached = getCachedResult(idempotencyKey);
    if (cached) {
      return NextResponse.json({
        ok: true,
        referenceNumber: cached.referenceNumber,
        mode: cached.mode,
      });
    }
  }

  const record: EnquiryRecord = {
    ...data,
    idempotencyKey,
    referenceNumber: generateReferenceNumber(),
    submittedAt: new Date().toISOString(),
    environment: isStaging() ? "staging" : "production",
  };

  const forcedError = forcedErrorFor(request);

  const saveResult =
    forcedError === "storage"
      ? ({ ok: false, error: "forced-test-failure" } as const)
      : await saveEnquiry(record);

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

  // Saved successfully — cache the result now, before attempting email,
  // so that even if everything after this point fails, a retry with the
  // same idempotency key won't create a second saved enquiry.
  if (idempotencyKey) {
    storeResult(idempotencyKey, record.referenceNumber, saveResult.mode);
  }

  const [ackResult, adminResult] = await Promise.all([
    forcedError === "email"
      ? Promise.resolve({ ok: false, error: "forced-test-failure" } as const)
      : sendAcknowledgementEmail(record),
    sendAdminNotificationEmail(record),
    dualWriteEnquiry(record),
  ]);
  if (!ackResult.ok) {
    console.error("[enquiry] acknowledgement email failed", record.referenceNumber, ackResult.error);
  }
  if (!adminResult.ok) {
    console.error("[enquiry] admin notification failed", record.referenceNumber, adminResult.error);
  }

  // The enquiry is saved regardless of email outcome — a visitor should
  // never be told to retry (and risk a duplicate) just because the
  // acknowledgement email failed to send.
  return NextResponse.json({
    ok: true,
    referenceNumber: record.referenceNumber,
    mode: saveResult.mode,
  });
}
