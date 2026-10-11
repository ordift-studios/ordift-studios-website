import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { recordDeliveryEvent } from "@/lib/crewSupport/readinessReminders";
import { verifyWebhookSignature } from "@/lib/crewSupport/readinessReminderRules";

// Resend delivery webhook for READINESS reminders only. Signature (Svix scheme) is verified before anything is read
// or written; a missing secret refuses everything (fail closed). Events are idempotent by the provider's event id, may
// arrive in any order, and only bounced/complained events stop further reminders to that person. Opened/clicked events
// are ignored by design. Events for messages we did not send for this feature are acknowledged and discarded.

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const body = await request.text();
  const check = verifyWebhookSignature({
    secret: process.env.RESEND_WEBHOOK_SECRET,
    id: request.headers.get("svix-id"),
    timestamp: request.headers.get("svix-timestamp"),
    signatureHeader: request.headers.get("svix-signature"),
    body,
    nowMs: Date.now(),
  });
  if (!check.ok) return NextResponse.json({ ok: false, error: check.error === "not-configured" ? "not-configured" : "invalid-signature" }, { status: check.error === "not-configured" ? 503 : 401 });

  let event: { type?: string; created_at?: string; data?: { email_id?: string } };
  try { event = JSON.parse(body); } catch { return NextResponse.json({ ok: false, error: "bad-json" }, { status: 400 }); }
  const result = await recordDeliveryEvent({ eventId: request.headers.get("svix-id") as string, type: String(event.type ?? ""), emailId: event.data?.email_id ?? null, occurredAt: event.created_at ?? null });
  return NextResponse.json({ ok: true, outcome: result.outcome });
}
