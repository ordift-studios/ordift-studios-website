import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { workshopRegistrationSchema } from "@/lib/workshops/registrationSchema";
import { generateRecordId } from "@/lib/shared/recordId";
import { contentRepository } from "@/lib/content";
import { isRegistrationOpen } from "@/lib/content/workshopHelpers";
import {
  decideWorkshopPaymentStatus,
  syncRegistrationToSheets,
  type WorkshopRegistrationRecord,
} from "@/lib/workshops/registrationStorage";
import { reserveTicketTypeSeat, releaseTicketTypeSeat } from "@/lib/workshops/ticketTypes";
import { createAdminClient } from "@/lib/supabase/admin";
import { logActivityAsSystem } from "@/lib/admin/activityLog";
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
  // TD-034: same shared helper the frontend uses for its badge/button —
  // a manually-"open" workshop past its registrationDeadline is treated
  // as closed here too, so the API can never accept a submission the UI
  // wouldn't have offered.
  if (!isRegistrationOpen(workshop)) {
    return NextResponse.json(
      {
        ok: false,
        error: "workshop-not-open",
        message: "This workshop isn't currently open for registration.",
      },
      { status: 409 }
    );
  }

  // Workshop Management V1, Phase B (2026-08-25) — ticket-type
  // resolution and reservation. ticket-type capacity is a SEPARATE,
  // ADDITIONAL, atomically-enforced gate (reserve_ticket_type_seat() —
  // a single UPDATE...WHERE...RETURNING row lock) from the overall
  // workshop-wide capacity decision (also now atomic as of Phase C —
  // see saveWorkshopRegistrationToSupabase()/migration 0048). A
  // sold-out ticket tier closes only that tier, never triggers the
  // workshop-wide waitlist. amountDueUsd is resolved here, server-side,
  // from the ticket's stored price — never trusted from the request
  // body.
  let amountDueUsd: number | null = null;
  let reservedTicketTypeId: string | null = null;
  if (data.ticketTypeId) {
    const reservation = await reserveTicketTypeSeat(data.ticketTypeId);
    if (!reservation.ok) {
      const messages: Record<string, string> = {
        "not-found": "That ticket type couldn't be found.",
        "not-on-sale": "That ticket type isn't currently on sale.",
        "sold-out": "That ticket type is sold out.",
      };
      return NextResponse.json(
        { ok: false, error: `ticket-${reservation.error}`, message: messages[reservation.error] },
        { status: 409 }
      );
    }
    amountDueUsd = reservation.ticket.priceUsd;
    reservedTicketTypeId = data.ticketTypeId;
  }

  const paymentStatus = decideWorkshopPaymentStatus(workshop);

  let registrationReference: string;
  try {
    registrationReference = await generateRecordId("WSH");
  } catch (err) {
    console.error("[workshops] failed to generate record id", err);
    if (reservedTicketTypeId) await releaseTicketTypeSeat(reservedTicketTypeId);
    return NextResponse.json(
      {
        ok: false,
        error: "save-failed",
        message: "We couldn't save your registration. Please try again or email us directly.",
      },
      { status: 503 }
    );
  }

  // registrationStatus/waitingListPosition are placeholders here — the
  // real, race-safe decision is made atomically inside
  // create_workshop_registration() (supabase/migrations/0048) and
  // overwritten on `record` immediately below once the save succeeds,
  // before anything (email, Sheets sync, the response) reads them.
  const record: WorkshopRegistrationRecord = {
    ...data,
    idempotencyKey,
    registrationReference,
    workshopId: workshop.id,
    workshopTitle: workshop.title,
    registrationDate: new Date().toISOString(),
    registrationStatus: "Registered",
    waitingListPosition: null,
    paymentStatus,
    amountDueUsd,
    registrationId: null,
    environment: isStaging() ? "staging" : "production",
  };

  // Supabase is the primary, required application database — a failure
  // here fails the whole submission (see src/lib/supabase/primaryWrite.ts).
  const saveResult = await saveWorkshopRegistrationToSupabase(record, workshop.capacity);
  if (!saveResult.ok) {
    console.error(
      "[workshops] failed to save registration",
      record.registrationReference,
      saveResult.error
    );
    // Compensating action — a reserved seat must never leak if the
    // registration itself didn't actually get saved.
    if (reservedTicketTypeId) await releaseTicketTypeSeat(reservedTicketTypeId);
    return NextResponse.json(
      {
        ok: false,
        error: "save-failed",
        message: "We couldn't save your registration. Please try again or email us directly.",
      },
      { status: 503 }
    );
  }
  record.registrationStatus = saveResult.registrationStatus;
  record.waitingListPosition = saveResult.waitingListPosition;
  record.registrationId = saveResult.registrationId;

  if (idempotencyKey) {
    await storeResult(idempotencyKey, record.registrationReference, "supabase");
  }

  // Travel/accommodation/transport assistance — REQUEST CAPTURE ONLY.
  // Best-effort: never fails the registration itself if this write has
  // a problem, matching the same posture as the Sheets sync below.
  if (data.assistanceType) {
    const admin = createAdminClient();
    const { data: savedRegistration } = await admin
      .from("workshop_registrations")
      .select("id")
      .eq("registration_reference", registrationReference)
      .maybeSingle();
    if (savedRegistration) {
      const { error: assistanceError } = await admin.from("workshop_travel_assistance_requests").insert({
        registration_id: savedRegistration.id,
        assistance_type: data.assistanceType,
        arrival_date: data.arrivalDate || null,
        departure_date: data.departureDate || null,
        traveller_count: data.travellerCount ?? null,
        notes: data.assistanceNotes || null,
      });
      if (assistanceError) {
        console.error("[workshops] failed to save travel assistance request", registrationReference, assistanceError.message);
      } else {
        await logActivityAsSystem({
          action: "workshop.travel_assistance.requested",
          entityType: "workshop_registration",
          entityId: savedRegistration.id,
          metadata: { assistanceType: data.assistanceType },
        });
      }
    }
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
    // Closure refinement (2026-08-25) — lets the success screen offer a
    // real "pay now" route for a Registered + Pending registration,
    // without exposing anything about account existence (see
    // RegistrationForm.tsx for how these two are used together).
    paymentStatus: record.paymentStatus,
    registrationId: record.registrationId,
  });
}
