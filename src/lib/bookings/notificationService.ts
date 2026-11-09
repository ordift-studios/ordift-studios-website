import { createAdminClient } from "@/lib/supabase/admin";
import { logActivityAsSystem } from "@/lib/admin/activityLog";
import { clientEmailsSuppressed } from "@/lib/enquiry/lifecycleEmails";
import { dispatchNotification } from "@/lib/notifications/dispatch";
import { resolveNewBookingRecipients } from "@/lib/notifications/recipients";
import { getNotificationPreferences } from "@/lib/notifications/preferences";
import { isPlaceholderEmail } from "@/lib/shared/email/placeholder";
import { isSuperAdminId } from "@/lib/organization/authority";
import { siteUrl } from "@/lib/shared/env";
import { bookingFlagOn } from "./rules";
import { buildAssignedBookingNotice, buildClientBookingNotice, buildInternalBookingConfirmed, type NoticeEvent, type NoticeSession } from "./notificationContent";
import { chooseClientAddress } from "./clientAddress";

// BOOKING NOTIFICATIONS (server). Triggered ONLY by a booking version written by the booking functions (a confirmation, a reschedule, a cancellation): never by a payment, a payment verification or a stage edit.
// Delivery is recorded in public.booking_notification_jobs (PROPOSAL_booking_notifications.sql + PROPOSAL_booking_notices_v2.sql): the database creates the jobs WITH the booking version, claims them atomically (a message is sent once however many
// requests race) and records the outcome. A failure is a visible, retryable row; retry is staff-triggered, like the payment receipt outbox. A notice always describes the CURRENT booking: if a newer version exists when it is about to go,
// it is marked superseded instead of sending an outdated date. Nothing here throws into the booking; with the tables absent (Production today) every function is a quiet no-op.
export type Audience = "client" | "internal" | "assigned" | "released";
export type JobRow = {
  id: string; confirmation_id: string; enquiry_id: string; audience: Audience; event: NoticeEvent; status: "pending" | "processing" | "failed" | "skipped" | "deferred" | "sent"; attempt_count: number;
  last_attempted_at: string | null; sent_at: string | null; last_error: string | null; provider_result: string | null; recipient_count: number; target_profile_id?: string | null;
  deliveries: { recipient: string; ok: boolean; mode?: string; channel?: string; by?: string; note?: string; at?: string }[]; subject: string | null; body_text: string | null; created_at: string;
  deferred_reason?: string | null; deferred_by?: string | null; deferred_at?: string | null;
};
type Outcome = { status: "failed" | "skipped" | "sent"; error: string | null; providerResult: string | null; deliveries: JobRow["deliveries"]; recipientCount: number };
type Notice = NonNullable<Awaited<ReturnType<typeof loadNotice>>>;

const AUDIENCES: Audience[] = ["client", "internal", "assigned", "released"];
const MANUAL_CHANNELS = ["whatsapp", "telephone", "email", "in_person", "other"] as const;
export type ManualChannel = (typeof MANUAL_CHANNELS)[number];

const labelOf = (p: unknown) => { const x = p as { full_name: string | null; member_number: string | null } | null; return x ? (x.member_number ? `${x.member_number} — ${x.full_name ?? ""}`.trim() : x.full_name ?? "Unnamed profile") : null; };   // member number first (Audit Identity Standard)

async function segmentsOf(confirmationId: string | null | undefined): Promise<NoticeSession[]> {
  if (!confirmationId) return [];
  const { data } = await createAdminClient().from("enquiry_booking_segments").select("seq, starts_at, ends_at, timezone, kind, location, platform, note").eq("confirmation_id", confirmationId).order("seq");
  return (data ?? []).map((s) => ({ startsAt: s.starts_at as string, endsAt: s.ends_at as string, timezone: s.timezone as string, kind: s.kind as NoticeSession["kind"], location: s.location as string | null, platform: s.platform as string | null, note: s.note as string | null }));
}

async function loadNotice(confirmationId: string) {
  const db = createAdminClient();
  const { data: c } = await db.from("enquiry_booking_confirmations").select("*").eq("id", confirmationId).maybeSingle();
  if (!c) return null;
  const [{ data: all }, { data: e }, { data: q }, { data: by }, { data: ag }, { data: jobs }] = await Promise.all([
    db.from("enquiry_booking_confirmations").select("id, version, kind, supersedes_id").eq("enquiry_id", c.enquiry_id as string).order("version", { ascending: false }),
    db.from("enquiries").select("id, reference_number, email, full_name, service, user_id, amount_paid").eq("id", c.enquiry_id as string).maybeSingle(),
    c.quotation_id ? db.from("client_quotations").select("quotation_reference").eq("id", c.quotation_id as string).maybeSingle() : Promise.resolve({ data: null }),
    c.confirmed_by ? db.from("profiles").select("full_name, member_number").eq("id", c.confirmed_by as string).maybeSingle() : Promise.resolve({ data: null }),
    c.agreement_id ? db.from("agreements").select("agreement_reference").eq("id", c.agreement_id as string).maybeSingle() : Promise.resolve({ data: null }),
    db.from("booking_notification_jobs").select("confirmation_id, audience, status").eq("enquiry_id", c.enquiry_id as string).eq("audience", "client").eq("status", "sent"),
  ]);
  if (!e) return null;
  const versions = (all ?? []) as { id: string; version: number; kind: string; supersedes_id: string | null }[];
  const latestVersion = versions[0]?.version ?? (c.version as number);
  const kind = c.kind as string;
  // Sessions the notice is ABOUT: a cancellation row carries none, so it is about the booking it cancelled (the version it superseded).
  const subjectConfirmationId = kind === "cancelled" ? ((c.supersedes_id as string | null) ?? null) : confirmationId;
  const sessions = await segmentsOf(subjectConfirmationId);
  // What the CLIENT was last TOLD (a sent client notice of an earlier version): the 'previously' of a reschedule. Never guessed: null when they were never told.
  const sentIds = new Set(((jobs ?? []) as { confirmation_id: string }[]).map((j) => j.confirmation_id));
  const lastTold = versions.filter((v) => v.version < (c.version as number) && sentIds.has(v.id) && v.kind !== "cancelled")[0];
  const clientPrevious = lastTold ? await segmentsOf(lastTold.id) : null;
  const predecessor = versions.filter((v) => v.version < (c.version as number))[0];
  const predecessorSessions = predecessor && predecessor.kind !== "cancelled" ? await segmentsOf(predecessor.id) : null;
  const [{ data: assignee }, { data: prevRow }] = await Promise.all([
    c.assigned_profile_id ? db.from("profiles").select("full_name, member_number").eq("id", c.assigned_profile_id as string).maybeSingle() : Promise.resolve({ data: null }),
    Promise.resolve({ data: null }),
  ]);
  const renewed = versions.some((v) => v.version < (c.version as number) && v.kind === "cancelled");
  void prevRow;
  return {
    c, kind, enquiry: e as { id: string; reference_number: string; email: string | null; full_name: string | null; service: string; user_id: string | null; amount_paid: number | string | null }, sessions,
    clientPrevious, predecessorSessions, latestVersion, quotationReference: (q as { quotation_reference: string } | null)?.quotation_reference ?? null, assignedLabel: labelOf(assignee), confirmedByLabel: labelOf(by),
    agreementReference: (ag as { agreement_reference: string } | null)?.agreement_reference ?? null, renewed,
  };
}

function clientBase(n: Notice) {
  return { enquiryId: n.enquiry.id, referenceNumber: n.enquiry.reference_number, service: n.enquiry.service, quotationReference: n.quotationReference, sessions: n.sessions, siteUrl: siteUrl(), version: n.c.version as number, fullName: n.enquiry.full_name ?? "there" };
}
function clientMessage(event: NoticeEvent, n: Notice) {
  const paidAnything = Number(n.enquiry.amount_paid ?? 0) > 0;
  return buildClientBookingNotice({ ...clientBase(n), event, previousSessions: n.clientPrevious, paidAnything } as Parameters<typeof buildClientBookingNotice>[0]);
}
function internalMessage(event: NoticeEvent, n: Notice, showMoney: boolean) {
  const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));
  return buildInternalBookingConfirmed({ event, showMoney, reason: (n.c.reason as string | null) ?? null, previousSessions: n.predecessorSessions, enquiryId: n.enquiry.id, referenceNumber: n.enquiry.reference_number, clientName: n.enquiry.full_name ?? "Unknown", service: n.enquiry.service,
    quotationReference: n.quotationReference, sessions: n.sessions, siteUrl: siteUrl(), version: n.c.version as number, renewed: n.renewed, assignedLabel: n.assignedLabel, confirmedByLabel: n.confirmedByLabel, agreementRequired: Boolean(n.c.agreement_required),
    agreementReference: n.agreementReference, paymentCondition: (n.c.payment_condition as string | null) ?? null, verifiedPaidUsd: num(n.c.verified_paid_usd), outstandingUsd: num(n.c.outstanding_usd), basis: (n.c.basis as string | null) ?? null });
}
function assignedMessage(job: JobRow, n: Notice) {
  return buildAssignedBookingNotice({ kind: job.audience === "released" ? "released" : "assigned", event: job.event, referenceNumber: n.enquiry.reference_number, service: n.enquiry.service, clientFirstName: (n.enquiry.full_name ?? "the client").split(" ")[0] || "the client",
    sessions: job.audience === "released" ? (n.predecessorSessions ?? n.sessions) : n.sessions, previousSessions: n.predecessorSessions, version: n.c.version as number });
}

// ---- who receives what
async function accountAddress(userId: string): Promise<{ email: string | null; confirmed: boolean; failed: boolean }> {
  try {
    const { data, error } = await createAdminClient().auth.admin.getUserById(userId);
    if (error || !data?.user) return { email: null, confirmed: false, failed: true };
    const u = data.user as { email?: string | null; email_confirmed_at?: string | null; confirmed_at?: string | null };
    return { email: u.email ?? null, confirmed: Boolean(u.email_confirmed_at ?? u.confirmed_at), failed: false };
  } catch { return { email: null, confirmed: false, failed: true }; }
}
async function resolveClientAddress(n: Notice) {
  const owner = n.enquiry.user_id ? await accountAddress(n.enquiry.user_id) : null;
  const placeholder = !n.enquiry.email || isPlaceholderEmail(n.enquiry.email);
  const suppressed = n.enquiry.user_id || placeholder ? false : await clientEmailsSuppressed(n.enquiry.id, "booking-notice-client");
  return chooseClientAddress({ hasOwner: Boolean(n.enquiry.user_id), ownerEmail: owner?.email ?? null, ownerConfirmed: owner?.confirmed ?? false, ownerLookupFailed: owner?.failed, enquiryEmail: n.enquiry.email, enquiryEmailIsPlaceholder: placeholder, suppressed });
}
async function resolveAssigned(profileId: string | null): Promise<{ ok: true; userId: string; email: string } | { ok: false }> {
  if (!profileId) return { ok: false };
  const db = createAdminClient();
  const { data: p } = await db.from("profiles").select("id, access_status").eq("id", profileId).maybeSingle();
  if (!p || (p as { access_status: string }).access_status !== "active") return { ok: false };
  const { data: roles } = await db.from("roles").select("id, slug").in("slug", ["staff", "admin", "super_admin"]);
  const { data: ur } = await db.from("user_roles").select("user_id, role_id").eq("user_id", profileId).in("role_id", (roles ?? []).map((r) => r.id as string));
  if (!ur || ur.length === 0) return { ok: false };                                                    // role-based: only an active person with an internal role
  const prefs = await getNotificationPreferences([profileId], "assigned_booking");
  if (prefs.get(profileId) === false) return { ok: false };                                            // an explicit switch-off is respected (no row = on: it is their own work)
  const a = await accountAddress(profileId);
  return a.email && a.confirmed ? { ok: true, userId: profileId, email: a.email } : { ok: false };
}

async function send(to: string, msg: { subject: string; html: string; text: string }, emailType: string, ref: string) {
  const r = await dispatchNotification({ channels: ["email"], email: { to, subject: msg.subject, html: msg.html, text: msg.text, logPrefix: "[booking]", emailType, referenceNumber: ref } });
  return r.email;
}

async function deliver(job: JobRow, n: Notice, msg: { subject: string; html: string; text: string }): Promise<Outcome> {
  const ref = n.enquiry.reference_number;
  if (job.audience === "client") {
    const d = await resolveClientAddress(n);
    if (!d.send) return { status: "skipped", error: null, providerResult: d.reason, deliveries: [], recipientCount: 0 };
    const r = await send(d.to, msg, `booking-${job.event}-client`, ref);
    const ok = r?.ok === true;
    return { status: ok ? "sent" : "failed", error: ok ? null : (r && !r.ok ? r.error : "email channel disabled"), providerResult: ok && r?.ok ? r.mode : null, deliveries: [{ recipient: "client", ok, mode: r?.ok ? r.mode : undefined, at: new Date().toISOString() }], recipientCount: 1 };
  }
  if (job.audience === "assigned" || job.audience === "released") {
    const who = await resolveAssigned(job.target_profile_id ?? (job.audience === "assigned" ? ((n.c.assigned_profile_id as string | null) ?? null) : null));
    if (!who.ok) return { status: "skipped", error: null, providerResult: "not_eligible", deliveries: [], recipientCount: 0 };
    const m = assignedMessage(job, n); const r = await send(who.email, m, `booking-${job.event}-${job.audience}`, ref); const ok = r?.ok === true;
    return { status: ok ? "sent" : "failed", error: ok ? null : (r && !r.ok ? r.error : "email channel disabled"), providerResult: ok && r?.ok ? r.mode : null, deliveries: [{ recipient: who.userId, ok, mode: r?.ok ? r.mode : undefined, at: new Date().toISOString() }], recipientCount: 1 };
  }
  // internal: Super Admins get the full notice; every other recipient (Admins) gets the operational one with no money (the booking card shows them none either)
  const recipients = await resolveNewBookingRecipients("enquiry", n.enquiry.id);
  if (recipients.length === 0) return { status: "skipped", error: null, providerResult: "no_recipients", deliveries: job.deliveries ?? [], recipientCount: 0 };
  const done = new Set((job.deliveries ?? []).filter((d) => d.ok).map((d) => d.recipient));         // a retry only addresses people not yet reached: nobody gets it twice
  const deliveries = [...(job.deliveries ?? [])]; let lastError: string | null = null;
  const ops = internalMessage(job.event, n, false);
  for (const rc of recipients) {
    if (done.has(rc.userId)) continue;
    try {
      const full = await isSuperAdminId(rc.userId); const r = await send(rc.email, full ? msg : ops, `booking-${job.event}-internal`, ref); const ok = r?.ok === true;
      if (!ok) lastError = r && !r.ok ? r.error : "email channel disabled";
      deliveries.push({ recipient: rc.userId, ok, mode: r?.ok ? r.mode : undefined, at: new Date().toISOString() });
    } catch (err) { lastError = err instanceof Error ? err.message : "send threw"; deliveries.push({ recipient: rc.userId, ok: false, at: new Date().toISOString() }); }
  }
  const reached = new Set(deliveries.filter((d) => d.ok).map((d) => d.recipient)); const all = recipients.every((rc) => reached.has(rc.userId)); const modes = new Set(deliveries.filter((d) => d.ok).map((d) => d.mode));
  return { status: all ? "sent" : "failed", error: all ? null : (lastError ?? "some recipients were not reached"), providerResult: all ? (modes.size === 1 ? [...modes][0] ?? null : "sent") : null, deliveries, recipientCount: recipients.length };
}

function messageFor(job: JobRow, n: Notice) {
  if (job.audience === "client") return clientMessage(job.event, n);
  if (job.audience === "internal") return internalMessage(job.event, n, true);
  return assignedMessage(job, n);
}

async function runAudience(confirmationId: string, audience: Audience, includeRetryable: boolean, actorUserId: string | null): Promise<JobRow["status"] | "none" | "unavailable"> {
  const db = createAdminClient();
  const { data, error } = await db.rpc("claim_booking_notification_job", { p_confirmation: confirmationId, p_audience: audience, p_include_retryable: includeRetryable });
  if (error) { if (!/does not exist|schema cache/i.test(error.message)) console.error("[booking] notification claim failed", error.message); return "unavailable"; }   // tables absent: a quiet no-op
  const job = (Array.isArray(data) ? data[0] : data) as JobRow | undefined;
  if (!job) return "none";                                                                              // nothing to do: already sent, in flight, deferred, or no job for this version
  let outcome: Outcome = { status: "failed", error: "unexpected failure", providerResult: null, deliveries: job.deliveries ?? [], recipientCount: job.recipient_count ?? 0 };
  let subject: string | null = null, body: string | null = null;
  try {
    const n = await loadNotice(confirmationId);
    if (!n) outcome = { ...outcome, error: "the booking could not be read for the notification" };
    else {
      const msg = messageFor(job, n); subject = msg.subject; body = msg.text;
      if (n.latestVersion !== (n.c.version as number)) outcome = { status: "skipped", error: null, providerResult: "superseded", deliveries: [], recipientCount: 0 };   // never send an outdated date
      else outcome = await deliver(job, n, msg);
    }
  } catch (err) { outcome = { ...outcome, error: err instanceof Error ? err.message : "unexpected failure" }; }
  const { error: finErr } = await db.rpc("finish_booking_notification_job", { p_job: job.id, p_status: outcome.status, p_error: outcome.error, p_provider_result: outcome.providerResult, p_deliveries: outcome.deliveries, p_recipient_count: outcome.recipientCount, p_subject: subject, p_body: body });
  if (finErr) console.error("[booking] notification outcome could not be recorded", finErr.message);
  await logActivityAsSystem({ actorUserId, action: outcome.status === "failed" ? "booking.notification_failed" : "booking.notification_recorded", entityType: "enquiry", entityId: job.enquiry_id,
    metadata: { audience, event: job.event, status: outcome.status, providerResult: outcome.providerResult, attempt: job.attempt_count, confirmationId, retry: includeRetryable, error: outcome.error ? outcome.error.slice(0, 200) : null } }).catch(() => undefined);
  return outcome.status;
}

/** Called once, right after a booking version was written (confirmation, change or cancellation). Never throws. */
export async function dispatchBookingNotifications(confirmationId: string, env: Record<string, string | undefined> = process.env): Promise<void> {
  if (!bookingFlagOn(env)) return;
  for (const a of AUDIENCES) { try { await runAudience(confirmationId, a, false, null); } catch (err) { console.error("[booking] notification dispatch threw", a, err); } }
}

/** Defer the CLIENT notice of a change or cancellation (Super Admin; written reason; only while still pending). The default is to notify. Returns whether it was recorded. */
export async function deferClientNotice(p: { actorUserId: string; confirmationId: string; reason: string }, env: Record<string, string | undefined> = process.env): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!bookingFlagOn(env)) return { ok: false, error: "Booking confirmation is not switched on." };
  if (p.reason.trim().length < 10) return { ok: false, error: "Give a reason of at least a sentence for holding back the client notice." };
  const { error } = await createAdminClient().rpc("defer_booking_client_notice", { p_confirmation: p.confirmationId, p_reason: p.reason, p_actor: p.actorUserId });
  if (error) { console.error("[booking] defer failed", error.message); return { ok: false, error: /not_authorised/.test(error.message) ? "Only a Super Admin can defer a client notice." : "The deferral could not be recorded." }; }
  return { ok: true };
}

/** Staff-triggered retry / send-now of ONE audience's message (Super Admin). Re-claims a failed / skipped / deferred / stale job; a sent job can never be claimed. */
export async function retryBookingNotification(p: { actorUserId: string; confirmationId: string; audience: Audience }, env: Record<string, string | undefined> = process.env): Promise<{ ok: true; status: string } | { ok: false; error: string }> {
  if (!bookingFlagOn(env)) return { ok: false, error: "Booking confirmation is not switched on." };
  if (!(await isSuperAdminId(p.actorUserId))) return { ok: false, error: "Only a Super Admin can retry a booking notification." };
  if (!AUDIENCES.includes(p.audience)) return { ok: false, error: "Unknown notification." };
  const s = await runAudience(p.confirmationId, p.audience, true, p.actorUserId);
  if (s === "none") return { ok: false, error: "Nothing to retry: it was already sent, or it is being sent right now." };
  if (s === "unavailable") return { ok: false, error: "Booking notifications are not available in this database." };
  return { ok: true, status: s };
}

/** The practical workflow when e-mail is unavailable (staff-recorded enquiry, no e-mail, unconfirmed account): staff tell the client themselves and RECORD it. The recorded message is the CURRENT one. Super Admin or Admin. */
export async function recordManualClientNotice(p: { actorUserId: string; confirmationId: string; channel: string; note?: string | null }, env: Record<string, string | undefined> = process.env): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!bookingFlagOn(env)) return { ok: false, error: "Booking confirmation is not switched on." };
  if (!(MANUAL_CHANNELS as readonly string[]).includes(p.channel)) return { ok: false, error: "Say how you told the client (WhatsApp, telephone, e-mail, in person or other)." };
  const note = (p.note ?? "").trim().slice(0, 300);
  if (/@|\d[ -]?\d[ -]?\d[ -]?\d[ -]?\d[ -]?\d[ -]?\d/.test(note)) return { ok: false, error: "Do not put an e-mail address or phone number in the note." };
  const db = createAdminClient();
  const { data, error } = await db.rpc("claim_booking_notification_job", { p_confirmation: p.confirmationId, p_audience: "client", p_include_retryable: true });
  if (error) return { ok: false, error: "Booking notifications are not available in this database." };
  const job = (Array.isArray(data) ? data[0] : data) as JobRow | undefined;
  if (!job) return { ok: false, error: "Nothing to record: the client notice was already sent or recorded, or is being sent right now." };
  let outcome: Outcome = { status: "failed", error: "could not record", providerResult: null, deliveries: [], recipientCount: 0 }; let subject: string | null = null, body: string | null = null;
  try {
    const n = await loadNotice(p.confirmationId);
    if (!n) outcome = { ...outcome, error: "the booking could not be read" };
    else if (n.latestVersion !== (n.c.version as number)) outcome = { status: "skipped", error: null, providerResult: "superseded", deliveries: [], recipientCount: 0 };
    else { const msg = clientMessage(job.event, n); subject = msg.subject; body = msg.text; outcome = { status: "sent", error: null, providerResult: `manual_${p.channel}`, recipientCount: 1, deliveries: [{ recipient: "client", ok: true, mode: "manual", channel: p.channel, by: p.actorUserId, note: note || undefined, at: new Date().toISOString() }] }; }
  } catch (err) { outcome = { ...outcome, error: err instanceof Error ? err.message : "could not record" }; }
  const { error: finErr } = await db.rpc("finish_booking_notification_job", { p_job: job.id, p_status: outcome.status, p_error: outcome.error, p_provider_result: outcome.providerResult, p_deliveries: outcome.deliveries, p_recipient_count: outcome.recipientCount, p_subject: subject, p_body: body });
  if (finErr) { console.error("[booking] manual record failed", finErr.message); return { ok: false, error: "The record could not be saved." }; }
  await logActivityAsSystem({ actorUserId: p.actorUserId, action: "booking.client_notified_manually", entityType: "enquiry", entityId: job.enquiry_id, metadata: { event: job.event, channel: p.channel, confirmationId: p.confirmationId, status: outcome.status } }).catch(() => undefined);
  if (outcome.status === "skipped") return { ok: false, error: "The booking has changed since: this notice is out of date. Open the latest one." };
  return outcome.status === "sent" ? { ok: true } : { ok: false, error: outcome.error ?? "Could not record." };
}

/** For the panel: the notification records of this enquiry, newest first. `clientOnly` is what an Admin may see (the client message only; no internal or assigned notices). Empty when the table is absent. */
export async function listBookingNotifications(enquiryId: string, opts: { clientOnly?: boolean } = {}): Promise<JobRow[]> {
  let q = createAdminClient().from("booking_notification_jobs").select("*").eq("enquiry_id", enquiryId);
  if (opts.clientOnly) q = q.eq("audience", "client");
  const { data, error } = await q.order("created_at", { ascending: false }).limit(40);
  if (error) return [];
  return (data ?? []) as JobRow[];
}
