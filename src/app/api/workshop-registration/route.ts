import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { workshopRegistrationSchema } from "@/lib/workshops/registrationSchema";
import { generateRegistrationReference } from "@/lib/workshops/reference";
import { contentRepository } from "@/lib/content";
import {
  countRegisteredForWorkshop,
  countWaitlistedForWorkshop,
  decideRegistrationStatus,
  saveRegistration,
  type WorkshopRegistrationRecord,
} from "@/lib/workshops/registrationStorage";
import {
  sendRegistrationAcknowledgementEmail,
  sendRegistrationAdminNotificationEmail,
} from "@/lib/workshops/registrationEmail";
import { dualWriteWorkshopRegistration } from "@/lib/supabase/dualWrite";
import { checkRateLimit } from "@/lib/shared/rateLimit";
import { getCachedResult, storeResult } from "@/lib/shared/idempotency";
import { isStaging } from "@/lib/shared/env";

function clientKey(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for");
  return `workshop:${forwarded?.split(",")[0]?.trim() || "unknown"}`;
}

export async function POST(request: NextRequest) {
  const key = clientKey(request);
  const rateLimit = checkRateLimit(key);
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

  if (parsed.data.website) {
    return NextResponse.json({ ok: true, registrationReference: generateRegistrationReference() });
  }

  const { website: _honeypot, idempotencyKey, ...data } = parsed.data;
  void _honeypot;

  if (idempotencyKey) {
    const cached = getCachedResult(idempotencyKey);
    if (cached) {
      return NextResponse.json({ ok: true, registrationReference: cached.referenceNumber });
    }
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

  const record: WorkshopRegistrationRecord = {
    ...data,
    idempotencyKey,
    registrationReference: generateRegistrationReference(),
    workshopId: workshop.id,
    workshopTitle: workshop.title,
    registrationDate: new Date().toISOString(),
    registrationStatus: status,
    waitingListPosition,
    paymentStatus,
    environment: isStaging() ? "staging" : "production",
  };

  const saveResult = await saveRegistration(record);
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
    storeResult(idempotencyKey, record.registrationReference, saveResult.mode);
  }

  const [ackResult, adminResult] = await Promise.all([
    sendRegistrationAcknowledgementEmail(record),
    sendRegistrationAdminNotificationEmail(record),
    dualWriteWorkshopRegistration(record),
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
