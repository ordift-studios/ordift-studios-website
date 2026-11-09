import { createAdminClient } from "@/lib/supabase/admin";
import { logActivityAsSystem } from "@/lib/admin/activityLog";
import { clientEmailsSuppressed } from "@/lib/enquiry/lifecycleEmails";
import { dispatchNotification } from "@/lib/notifications/dispatch";
import { resolveNewBookingRecipients } from "@/lib/notifications/recipients";
import { isPlaceholderEmail } from "@/lib/shared/email/placeholder";
import { isSuperAdminId } from "@/lib/organization/authority";
import { siteUrl } from "@/lib/shared/env";
import { bookingFlagOn } from "./rules";
import { buildClientBookingConfirmed, buildInternalBookingConfirmed, type NoticeSession } from "./notificationContent";

// BOOKING NOTIFICATIONS (server). Triggered ONLY by a successful booking confirmation (confirmOrdinaryBooking). A payment, a payment verification or a stage edit never reaches this module.
// Delivery is recorded in public.booking_notification_jobs (PROPOSAL_booking_notifications.sql): the database creates the two jobs with the confirmation, claims them atomically (so a message is
// sent once however many requests race), and records the outcome. A failure is a visible, retryable row; retry is staff-triggered (Super Admin), like the payment receipt outbox. Nothing here ever throws
// into the booking: a notification problem must never undo or hide a confirmed booking. With the tables absent (Production today) every function is a quiet no-op.
export type Audience = "client" | "internal";
export type JobRow = {
  id: string; confirmation_id: string; enquiry_id: string; audience: Audience; event: string; status: "pending" | "processing" | "sent" | "failed" | "skipped"; attempt_count: number;
  last_attempted_at: string | null; sent_at: string | null; last_error: string | null; provider_result: string | null; recipient_count: number;
  deliveries: { recipient: string; ok: boolean; mode?: string; at?: string }[]; subject: string | null; body_text: string | null; created_at: string;
};
type Outcome = { status: "sent" | "failed" | "skipped"; error: string | null; providerResult: string | null; deliveries: JobRow["deliveries"]; recipientCount: number };

const AUDIENCES: Audience[] = ["client", "internal"];

async function loadNotice(confirmationId: string) {
  const db = createAdminClient();
  const { data: c } = await db.from("enquiry_booking_confirmations").select("*").eq("id", confirmationId).maybeSingle();
  if (!c) return null;
  const [{ data: segs }, { data: e }, { data: q }, { data: person }, { data: by }, { data: ag }, { data: earlier }] = await Promise.all([
    db.from("enquiry_booking_segments").select("seq, starts_at, ends_at, timezone, kind, location, platform, note").eq("confirmation_id", confirmationId).order("seq"),
    db.from("enquiries").select("id, reference_number, email, full_name, service").eq("id", c.enquiry_id as string).maybeSingle(),
    c.quotation_id ? db.from("client_quotations").select("quotation_reference").eq("id", c.quotation_id as string).maybeSingle() : Promise.resolve({ data: null }),
    c.assigned_profile_id ? db.from("profiles").select("full_name, member_number").eq("id", c.assigned_profile_id as string).maybeSingle() : Promise.resolve({ data: null }),
    c.confirmed_by ? db.from("profiles").select("full_name, member_number").eq("id", c.confirmed_by as string).maybeSingle() : Promise.resolve({ data: null }),
    c.agreement_id ? db.from("agreements").select("agreement_reference").eq("id", c.agreement_id as string).maybeSingle() : Promise.resolve({ data: null }),
    db.from("enquiry_booking_confirmations").select("id").eq("enquiry_id", c.enquiry_id as string).eq("kind", "cancelled").lt("version", c.version as number).limit(1),
  ]);
  if (!e) return null;
  const label = (p: unknown) => { const x = p as { full_name: string | null; member_number: string | null } | null; return x ? (x.member_number ? `${x.member_number} — ${x.full_name ?? ""}`.trim() : x.full_name ?? "Unnamed profile") : null; };   // member number first (Audit Identity Standard)
  const sessions: NoticeSession[] = (segs ?? []).map((s) => ({ startsAt: s.starts_at as string, endsAt: s.ends_at as string, timezone: s.timezone as string, kind: s.kind as NoticeSession["kind"], location: s.location as string | null, platform: s.platform as string | null, note: s.note as string | null }));
  return {
    c, enquiry: e as { id: string; reference_number: string; email: string | null; full_name: string | null; service: string }, sessions,
    quotationReference: (q as { quotation_reference: string } | null)?.quotation_reference ?? null, assignedLabel: label(person), confirmedByLabel: label(by),
    agreementReference: (ag as { agreement_reference: string } | null)?.agreement_reference ?? null, renewed: (earlier ?? []).length > 0,
  };
}

function buildMessage(audience: Audience, n: NonNullable<Awaited<ReturnType<typeof loadNotice>>>) {
  const base = { enquiryId: n.enquiry.id, referenceNumber: n.enquiry.reference_number, service: n.enquiry.service, quotationReference: n.quotationReference, sessions: n.sessions, siteUrl: siteUrl(), version: n.c.version as number };
  if (audience === "client") return buildClientBookingConfirmed({ ...base, fullName: n.enquiry.full_name ?? "there" });
  const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));
  return buildInternalBookingConfirmed({ ...base, clientName: n.enquiry.full_name ?? "Unknown", renewed: n.renewed, assignedLabel: n.assignedLabel, confirmedByLabel: n.confirmedByLabel, agreementRequired: Boolean(n.c.agreement_required),
    agreementReference: n.agreementReference, paymentCondition: (n.c.payment_condition as string | null) ?? null, verifiedPaidUsd: num(n.c.verified_paid_usd), outstandingUsd: num(n.c.outstanding_usd), basis: (n.c.basis as string | null) ?? null });
}

async function deliver(job: JobRow, n: NonNullable<Awaited<ReturnType<typeof loadNotice>>>, msg: { subject: string; html: string; text: string }): Promise<Outcome> {
  if (job.audience === "client") {
    if (!n.enquiry.email || isPlaceholderEmail(n.enquiry.email)) return { status: "skipped", error: null, providerResult: "no_email", deliveries: [], recipientCount: 0 };
    if (await clientEmailsSuppressed(n.enquiry.id, "booking-confirmed-client")) return { status: "skipped", error: null, providerResult: "suppressed", deliveries: [], recipientCount: 0 };   // staff-recorded enquiries: established policy, staff tell the client themselves
    const r = await dispatchNotification({ channels: ["email"], email: { to: n.enquiry.email, subject: msg.subject, html: msg.html, text: msg.text, logPrefix: "[booking]", emailType: "booking-confirmed-client", referenceNumber: n.enquiry.reference_number } });
    const ok = r.email?.ok === true;
    return { status: ok ? "sent" : "failed", error: ok ? null : (r.email && !r.email.ok ? r.email.error : "email channel disabled"), providerResult: ok && r.email?.ok ? r.email.mode : null,
      deliveries: [{ recipient: "client", ok, mode: r.email?.ok ? r.email.mode : undefined, at: new Date().toISOString() }], recipientCount: 1 };
  }
  const recipients = await resolveNewBookingRecipients("enquiry", n.enquiry.id);
  if (recipients.length === 0) return { status: "skipped", error: null, providerResult: "no_recipients", deliveries: job.deliveries ?? [], recipientCount: 0 };
  const done = new Set((job.deliveries ?? []).filter((d) => d.ok).map((d) => d.recipient));         // a retry only addresses people not yet reached: nobody gets it twice
  const deliveries = [...(job.deliveries ?? [])];
  let lastError: string | null = null;
  for (const rc of recipients) {
    if (done.has(rc.userId)) continue;
    try {
      const r = await dispatchNotification({ channels: ["email"], email: { to: rc.email, subject: msg.subject, html: msg.html, text: msg.text, logPrefix: "[booking]", emailType: "internal-booking-confirmed", referenceNumber: n.enquiry.reference_number } });
      const ok = r.email?.ok === true;
      if (!ok) lastError = r.email && !r.email.ok ? r.email.error : "email channel disabled";
      deliveries.push({ recipient: rc.userId, ok, mode: r.email?.ok ? r.email.mode : undefined, at: new Date().toISOString() });
    } catch (err) { lastError = err instanceof Error ? err.message : "send threw"; deliveries.push({ recipient: rc.userId, ok: false, at: new Date().toISOString() }); }
  }
  const reached = new Set(deliveries.filter((d) => d.ok).map((d) => d.recipient));
  const all = recipients.every((rc) => reached.has(rc.userId));
  const modes = new Set(deliveries.filter((d) => d.ok).map((d) => d.mode));
  return { status: all ? "sent" : "failed", error: all ? null : (lastError ?? "some recipients were not reached"), providerResult: all ? (modes.size === 1 ? [...modes][0] ?? null : "sent") : null, deliveries, recipientCount: recipients.length };
}

async function runAudience(confirmationId: string, audience: Audience, includeRetryable: boolean, actorUserId: string | null): Promise<JobRow["status"] | "none" | "unavailable"> {
  const db = createAdminClient();
  const { data, error } = await db.rpc("claim_booking_notification_job", { p_confirmation: confirmationId, p_audience: audience, p_include_retryable: includeRetryable });
  if (error) { if (!/does not exist|schema cache/i.test(error.message)) console.error("[booking] notification claim failed", error.message); return "unavailable"; }   // tables absent: a quiet no-op
  const job = (Array.isArray(data) ? data[0] : data) as JobRow | undefined;
  if (!job) return "none";                                                                              // nothing to do: already sent, in flight, or no job for this confirmation
  let outcome: Outcome = { status: "failed", error: "unexpected failure", providerResult: null, deliveries: job.deliveries ?? [], recipientCount: job.recipient_count ?? 0 };
  let subject: string | null = null, body: string | null = null;
  try {
    const n = await loadNotice(confirmationId);
    if (!n) outcome = { ...outcome, error: "the booking could not be read for the notification" };
    else { const msg = buildMessage(audience, n); subject = msg.subject; body = msg.text; outcome = await deliver(job, n, msg); }
  } catch (err) { outcome = { ...outcome, error: err instanceof Error ? err.message : "unexpected failure" }; }
  const { error: finErr } = await db.rpc("finish_booking_notification_job", { p_job: job.id, p_status: outcome.status, p_error: outcome.error, p_provider_result: outcome.providerResult, p_deliveries: outcome.deliveries, p_recipient_count: outcome.recipientCount, p_subject: subject, p_body: body });
  if (finErr) console.error("[booking] notification outcome could not be recorded", finErr.message);
  await logActivityAsSystem({ actorUserId, action: outcome.status === "failed" ? "booking.notification_failed" : "booking.notification_recorded", entityType: "enquiry", entityId: job.enquiry_id,
    metadata: { audience, status: outcome.status, providerResult: outcome.providerResult, attempt: job.attempt_count, confirmationId, retry: includeRetryable, error: outcome.error ? outcome.error.slice(0, 200) : null } }).catch(() => undefined);
  return outcome.status;
}

/** Called once, right after a successful CONFIRMATION (kind 'confirmed'). Never throws. */
export async function dispatchBookingNotifications(confirmationId: string, env: Record<string, string | undefined> = process.env): Promise<void> {
  if (!bookingFlagOn(env)) return;
  for (const a of AUDIENCES) { try { await runAudience(confirmationId, a, false, null); } catch (err) { console.error("[booking] notification dispatch threw", a, err); } }
}

/** Staff-triggered retry of ONE audience's message (Super Admin). Re-claims a failed / skipped / stale job; a sent job can never be claimed. */
export async function retryBookingNotification(p: { actorUserId: string; confirmationId: string; audience: Audience }, env: Record<string, string | undefined> = process.env): Promise<{ ok: true; status: string } | { ok: false; error: string }> {
  if (!bookingFlagOn(env)) return { ok: false, error: "Booking confirmation is not switched on." };
  if (!(await isSuperAdminId(p.actorUserId))) return { ok: false, error: "Only a Super Admin can retry a booking notification." };
  if (!AUDIENCES.includes(p.audience)) return { ok: false, error: "Unknown notification." };
  const s = await runAudience(p.confirmationId, p.audience, true, p.actorUserId);
  if (s === "none") return { ok: false, error: "Nothing to retry: it was already sent, or it is being sent right now." };
  if (s === "unavailable") return { ok: false, error: "Booking notifications are not available in this database." };
  return { ok: true, status: s };
}

/** For the Super Admin panel: every notification record of this enquiry, newest first. Empty when the table is absent. */
export async function listBookingNotifications(enquiryId: string): Promise<JobRow[]> {
  const { data, error } = await createAdminClient().from("booking_notification_jobs").select("*").eq("enquiry_id", enquiryId).order("created_at", { ascending: false }).limit(20);
  if (error) return [];
  return (data ?? []) as JobRow[];
}
