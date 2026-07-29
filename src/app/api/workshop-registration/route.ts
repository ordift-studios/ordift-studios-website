import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { workshopRegistrationSchema } from "@/lib/workshops/registrationSchema";
import { generateRecordId } from "@/lib/shared/recordId";
import { contentRepository } from "@/lib/content";
import {
  countRegisteredForWorkshop,
  countWaitlistedForWorkshop,
  decideRegistrationStatus,
  syncRegistrationToSheets,
  type WorkshopRegistrationRecord,
} from "@/lib/workshops/registrationStorage";
import {
  sendRegistrationAcknowledgementEmail,
  sendRegistrationAdminNotificationEmail,
} from "@/lib/workshops/registrationEmail";
import { saveWorkshopRegistrationToSupabase } from "@/lib/supabase/primaryWrite";
import { checkRateLimit } from "@/lib/shared/rateLimit";
import { getCachedResult, storeResult } from "@/lib/shared/idempotency";
import { isStaging } from "@/lib/shared/env";
import { verifyTurnstileToken } from "@/lib/turnstile";

function clientKey(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for");
  return `workshop:${forwarded?.split(",")[0]?.trim() || "unknown"}`;
}

export async function POST(request: NextRequest) {
  const key = clientKey(request);
  const rateLimit = await checkRateLimit(key);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { ok: false, error: "rate-limited", message: "Too many requests. Please try again shortly." },
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

  const parsed = workshopRegistrationSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "validation-failed", fieldErrors: z.flattenError(parsed.error).fieldErrors },
      { status: 422 }
    );
  }

  // Honeypot — see src/app/api/enquiry/route.ts for the identical
  // rationale; "000000" is never a real assigned sequence.
  if (parsed.data.website) {
    return NextResponse.json({
      ok: true,
      registrationReference: `WSH-${new Date().getUTCFullYear()}-000000`,
    });
  }

  const { website: _honeypot, idempotencyKey, turnstileToken, ...data } = parsed.data;
  void _honeypot;

  // Idempotency before CAPTCHA — see src/app/api/enquiry/route.ts for
  // the identical rationale (a Turnstile token is single-use, so a
  // genuine retry with the same idempotencyKey must not be forced
  // through a second challenge).
  if (idempotencyKey) {
    const cached = await getCachedResult(idempotencyKey);
    if (cached) {
      return NextResponse.json({ ok: true, registrationReference: cached.referenceNumber });
    }
  }

  // CAPTCHA — see src/app/api/enquiry/route.ts for the identical
  // rationale.
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

  const workshop = await contentRepository.getWorkshopBySlug(data.workshopSlug);
  if (!workshop) {
    return NextResponse.json(
      { ok: false, error: "workshop-not-found", message: "That workshop couldn't be found." },
      { status: 404 }
    );
  }
  if (workshop.status !== "open") {
    return NextResponse.json(
      {
        ok: false,
        error: "workshop-not-open",
        message: "This workshop isn't currently open for registration.",
      },
      { status: 409 }
    );
  }

  const [currentRegisteredCount, currentWaitlistedCount] = await Promise.all([
    countRegisteredForWorkshop(workshop.slug),
    countWaitlistedForWorkshop(workshop.slug),
  ]);
  const { status, waitingListPosition, paymentStatus } = decideRegistrationStatus(
    workshop,
    currentRegisteredCount,
    currentWaitlistedCount
  );

  let registrationReference: string;
  try {
    registrationReference = await generateRecordId("WSH");
  } catch (err) {
    console.error("[workshops] failed to generate record id", err);
    return NextResponse.json(
      {
        ok: false,
        error: "save-failed",
        message: "We couldn't save your registration. Please try again or email us directly.",
      },
      { status: 503 }
    );
  }

  const record: WorkshopRegistrationRecord = {
    ...data,
    idempotencyKey,
    registrationReference,
    workshopId: workshop.id,
    workshopTitle: workshop.title,
    registrationDate: new Date().toISOString(),
    registrationStatus: status,
    waitingListPosition,
    paymentStatus,
    environment: isStaging() ? "staging" : "production",
  };

  // Supabase is the primary, required application database — a failure
  // here fails the whole submission (see src/lib/supabase/primaryWrite.ts).
  const saveResult = await saveWorkshopRegistrationToSupabase(record);
  if (!saveResult.ok) {
    console.error(
      "[workshops] failed to save registration",
      record.registrationReference,
      saveResult.error
    );
    return NextResponse.json(
      {
        ok: false,
        error: "save-failed",
        message: "We couldn't save your registration. Please try again or email us directly.",
      },
      { status: 503 }
    );
  }

  if (idempotencyKey) {
    await storeResult(idempotencyKey, record.registrationReference, "supabase");
  }

  // Google Sheets is a best-effort secondary copy (see
  // src/lib/workshops/registrationStorage.ts's syncRegistrationToSheets)
  // — never affects whether this request succeeds.
  const [ackResult, adminResult] = await Promise.all([
    sendRegistrationAcknowledgementEmail(record),
    sendRegistrationAdminNotificationEmail(record),
    syncRegistrationToSheets(record),
  ]);
  if (!ackResult.ok) {
    console.error("[workshops] acknowledgement email failed", record.registrationReference, ackResult.error);
  }
  if (!adminResult.ok) {
    console.error("[workshops] admin notification failed", record.registrationReference, adminResult.error);
  }

  return NextResponse.json({
    ok: true,
    registrationReference: record.registrationReference,
    registrationStatus: record.registrationStatus,
    waitingListPosition: record.waitingListPosition,
  });
}
