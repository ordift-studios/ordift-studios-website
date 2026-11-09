import { beforeEach, describe, expect, it, vi } from "vitest";

// ---- in-memory database: tables + the two job functions with the same rules as PROPOSAL_booking_notifications.sql (atomic claim, finish only while processing)
type Row = Record<string, unknown>;
let tables: Record<string, Row[]> = {};
let jobFnMissing = false;
const stale = 2 * 60 * 1000;
function builder(table: string) {
  const filters: ((r: Row) => boolean)[] = []; let ord: { col: string; asc: boolean } | null = null, lim = Infinity;
  const run = () => { let rows = (tables[table] ?? []).filter((r) => filters.every((f) => f(r))); if (ord) rows = [...rows].sort((a, b) => (Number(a[ord!.col]) - Number(b[ord!.col])) * (ord!.asc ? 1 : -1)); return rows.slice(0, lim); };
  const b: Record<string, unknown> = {
    select: () => b, eq: (c: string, v: unknown) => { filters.push((r) => r[c] === v); return b; }, lt: (c: string, v: number) => { filters.push((r) => Number(r[c]) < v); return b; },
    order: (c: string, o?: { ascending: boolean }) => { ord = { col: c, asc: o?.ascending !== false }; return b; }, limit: (n: number) => { lim = n; return b; },
    maybeSingle: async () => ({ data: run()[0] ?? null, error: null }), then: (res: (v: unknown) => unknown) => res({ data: run(), error: null }),
  };
  return b;
}
const admin = {
  from: (t: string) => builder(t),
  rpc: async (name: string, a: Record<string, unknown>) => {
    if (jobFnMissing) return { data: null, error: { message: "function public.claim_booking_notification_job does not exist" } };
    const jobs = (tables.booking_notification_jobs ??= []);
    if (name === "claim_booking_notification_job") {
      const j = jobs.find((x) => x.confirmation_id === a.p_confirmation && x.audience === a.p_audience);
      if (!j) return { data: [], error: null };
      const claimable = j.status === "pending" || (a.p_include_retryable && (j.status === "failed" || j.status === "skipped")) || (j.status === "processing" && Date.now() - Number(j.last_attempted_at) > stale);
      if (!claimable) return { data: [], error: null };
      j.status = "processing"; j.attempt_count = Number(j.attempt_count) + 1; j.last_attempted_at = Date.now(); return { data: [{ ...j }], error: null };
    }
    if (name === "finish_booking_notification_job") {
      const j = jobs.find((x) => x.id === a.p_job);
      if (!j || j.status !== "processing") return { data: null, error: { message: "ordift:booking_notification_not_processing" } };
      Object.assign(j, { status: a.p_status, last_error: a.p_error, provider_result: a.p_provider_result, deliveries: a.p_deliveries, recipient_count: a.p_recipient_count, subject: a.p_subject, body_text: a.p_body }); return { data: null, error: null };
    }
    return { data: null, error: { message: "unknown rpc" } };
  },
};
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => admin }));
const send = vi.fn(); const recipients = vi.fn(); const suppressed = vi.fn(); const superAdmin = vi.fn(); const audit = vi.fn(async () => undefined);
vi.mock("@/lib/notifications/dispatch", () => ({ dispatchNotification: (...a: unknown[]) => send(...a) }));
vi.mock("@/lib/notifications/recipients", () => ({ resolveNewBookingRecipients: (...a: unknown[]) => recipients(...a) }));
vi.mock("@/lib/enquiry/lifecycleEmails", () => ({ clientEmailsSuppressed: (...a: unknown[]) => suppressed(...a) }));
vi.mock("@/lib/organization/authority", () => ({ isSuperAdminId: (...a: unknown[]) => superAdmin(...a) }));
vi.mock("@/lib/admin/activityLog", () => ({ logActivityAsSystem: (...a: unknown[]) => audit(...a) }));
import { dispatchBookingNotifications, listBookingNotifications, retryBookingNotification } from "./notificationService";

const ON = { BOOKING_CONFIRMATION_ENABLED: "true" };
const okLogged = { email: { ok: true, mode: "logged", attempts: 0 } };
function seed(over: { email?: string | null } = {}) {
  tables = {
    enquiry_booking_confirmations: [{ id: "c1", enquiry_id: "e1", version: 1, kind: "confirmed", quotation_id: "q1", assigned_profile_id: "p1", confirmed_by: "sa", agreement_required: false, agreement_id: null, payment_condition: "full", verified_paid_usd: 400, outstanding_usd: 0, basis: null }],
    enquiry_booking_segments: [{ confirmation_id: "c1", seq: 1, starts_at: "2026-12-15T10:00:00Z", ends_at: "2026-12-15T11:00:00Z", timezone: "Africa/Accra", kind: "studio", location: "Synthetic studio, Accra", platform: null, note: null }],
    enquiries: [{ id: "e1", reference_number: "ENQ-JRN-GHP", email: over.email === undefined ? "client@example.test" : over.email, full_name: "Ama Mensah", service: "photography" }],
    client_quotations: [{ id: "q1", quotation_reference: "ORD-QUO-JRN-GHP" }], profiles: [{ id: "p1", full_name: "Lab staff", member_number: "INT0007" }, { id: "sa", full_name: "Lab super_admin", member_number: "INT0001" }], agreements: [],
    booking_notification_jobs: ["client", "internal"].map((a, i) => ({ id: `j${i}`, confirmation_id: "c1", enquiry_id: "e1", audience: a, event: "confirmed", status: "pending", attempt_count: 0, last_attempted_at: null, deliveries: [], recipient_count: 0, provider_result: null, last_error: null })),
  };
}
const job = (a: string) => tables.booking_notification_jobs.find((j) => j.audience === a)!;
beforeEach(() => { seed(); jobFnMissing = false; send.mockReset(); send.mockResolvedValue(okLogged); recipients.mockReset(); recipients.mockResolvedValue([{ userId: "u1", email: "sa@x.test" }, { userId: "u2", email: "ad@x.test" }]); suppressed.mockReset(); suppressed.mockResolvedValue(false); superAdmin.mockReset(); superAdmin.mockResolvedValue(true); audit.mockClear(); });

describe("dispatchBookingNotifications (after a successful confirmation)", () => {
  it("sends the client message once and the internal notice once per recipient, and records both", async () => {
    await dispatchBookingNotifications("c1", ON);
    expect(send).toHaveBeenCalledTimes(3);
    const to = send.mock.calls.map((c) => (c[0] as { email: { to: string } }).email.to).sort(); expect(to).toEqual(["ad@x.test", "client@example.test", "sa@x.test"]);
    expect(job("client")).toMatchObject({ status: "sent", provider_result: "logged", attempt_count: 1, recipient_count: 1 }); expect(String(job("client").subject)).toBe("Booking Confirmed — ENQ-JRN-GHP"); expect(String(job("client").body_text)).toContain("Africa/Accra");
    expect(job("internal")).toMatchObject({ status: "sent", provider_result: "logged", recipient_count: 2 }); expect(String(job("internal").subject)).toBe("New Booking Confirmed — ENQ-JRN-GHP"); expect(String(job("internal").body_text)).toContain("INT0007 — Lab staff");
    expect(audit).toHaveBeenCalledTimes(2); expect(audit.mock.calls.every((c) => (c[0] as { action: string }).action === "booking.notification_recorded")).toBe(true);
  });
  it("a duplicate call (double submit, replay) sends nothing more", async () => { await dispatchBookingNotifications("c1", ON); send.mockClear(); await dispatchBookingNotifications("c1", ON); expect(send).not.toHaveBeenCalled(); expect(job("client").attempt_count).toBe(1); });
  it("two simultaneous dispatches still send each message once", async () => { await Promise.all([dispatchBookingNotifications("c1", ON), dispatchBookingNotifications("c1", ON)]); expect(send).toHaveBeenCalledTimes(3); });
  it("nothing happens while booking confirmation is off", async () => { await dispatchBookingNotifications("c1", {}); expect(send).not.toHaveBeenCalled(); expect(job("client").status).toBe("pending"); });
  it("a confirmation with no job (a change, a cancellation) sends nothing", async () => { tables.booking_notification_jobs = []; await dispatchBookingNotifications("c1", ON); expect(send).not.toHaveBeenCalled(); });
  it("the notification functions being absent (Production today) is a quiet no-op that never throws", async () => { jobFnMissing = true; await expect(dispatchBookingNotifications("c1", ON)).resolves.toBeUndefined(); expect(send).not.toHaveBeenCalled(); });
  it("only the real send path is used (no e-mail is addressed outside the notification dispatcher)", async () => { await dispatchBookingNotifications("c1", ON); for (const c of send.mock.calls) expect((c[0] as { channels: string[] }).channels).toEqual(["email"]); });
});

describe("who is (not) emailed", () => {
  it("a staff-recorded enquiry's client is NOT emailed (established suppression) but the message is stored for staff to pass on", async () => {
    suppressed.mockResolvedValue(true); await dispatchBookingNotifications("c1", ON);
    expect(job("client")).toMatchObject({ status: "skipped", provider_result: "suppressed" }); expect(String(job("client").body_text)).toContain("Booking reference: ENQ-JRN-GHP");
    expect(send.mock.calls.some((c) => (c[0] as { email: { to: string } }).email.to === "client@example.test")).toBe(false); expect(job("internal").status).toBe("sent");
  });
  it("a client with no e-mail address (empty or the reserved placeholder) is skipped, never sent", async () => {
    for (const email of [null, "enq-jrn-ghp@no-email.invalid"]) { seed({ email }); send.mockClear(); await dispatchBookingNotifications("c1", ON); expect(job("client")).toMatchObject({ status: "skipped", provider_result: "no_email" }); expect(send.mock.calls.some((c) => (c[0] as { email: { to: string } }).email.to.includes("invalid"))).toBe(false); }
  });
  it("no eligible internal recipient is recorded as skipped", async () => { recipients.mockResolvedValue([]); await dispatchBookingNotifications("c1", ON); expect(job("internal")).toMatchObject({ status: "skipped", provider_result: "no_recipients" }); });
});

describe("failure, retry and the audit record", () => {
  it("a failed client send is a visible failed record; a Super Admin retry sends it once and marks it sent; a sent one cannot be retried", async () => {
    send.mockResolvedValueOnce({ email: { ok: false, error: "provider-down", attempts: 3, permanent: false } });
    await dispatchBookingNotifications("c1", ON);
    expect(job("client")).toMatchObject({ status: "failed", last_error: "provider-down", attempt_count: 1 }); expect(audit.mock.calls.some((c) => (c[0] as { action: string }).action === "booking.notification_failed")).toBe(true);
    send.mockClear(); const r = await retryBookingNotification({ actorUserId: "sa", confirmationId: "c1", audience: "client" }, ON);
    expect(r).toEqual({ ok: true, status: "sent" }); expect(send).toHaveBeenCalledTimes(1); expect(job("client")).toMatchObject({ status: "sent", attempt_count: 2, last_error: null });
    const again = await retryBookingNotification({ actorUserId: "sa", confirmationId: "c1", audience: "client" }, ON); expect(again.ok).toBe(false); expect(send).toHaveBeenCalledTimes(1);
  });
  it("an internal retry only addresses the people not yet reached", async () => {
    send.mockImplementation(async (e: { email: { to: string } }) => (e.email.to === "ad@x.test" ? { email: { ok: false, error: "mailbox-full", attempts: 3, permanent: true } } : okLogged));
    await dispatchBookingNotifications("c1", ON); expect(job("internal")).toMatchObject({ status: "failed" });
    send.mockReset(); send.mockResolvedValue(okLogged); await retryBookingNotification({ actorUserId: "sa", confirmationId: "c1", audience: "internal" }, ON);
    const to = send.mock.calls.map((c) => (c[0] as { email: { to: string } }).email.to); expect(to).toEqual(["ad@x.test"]); expect(job("internal")).toMatchObject({ status: "sent", attempt_count: 2 });
    expect((job("internal").deliveries as { recipient: string; ok: boolean }[]).filter((d) => d.ok).map((d) => d.recipient).sort()).toEqual(["u1", "u2"]);
  });
  it("a throw while sending is recorded as a failure and never escapes", async () => { send.mockRejectedValue(new Error("network exploded")); await expect(dispatchBookingNotifications("c1", ON)).resolves.toBeUndefined(); expect(job("client")).toMatchObject({ status: "failed" }); });
  it("an unreadable booking is a failed record, not a silent loss", async () => { tables.enquiry_booking_confirmations = []; await dispatchBookingNotifications("c1", ON); expect(job("client").status).toBe("failed"); expect(String(job("client").last_error)).toMatch(/could not be read/); });
  it("a job stuck at processing after a crash is recovered by a retry once it is stale; a fresh one is not stolen", async () => {
    job("client").status = "processing"; job("client").last_attempted_at = Date.now(); const fresh = await retryBookingNotification({ actorUserId: "sa", confirmationId: "c1", audience: "client" }, ON); expect(fresh.ok).toBe(false);
    job("client").last_attempted_at = Date.now() - 5 * 60 * 1000; const s = await retryBookingNotification({ actorUserId: "sa", confirmationId: "c1", audience: "client" }, ON); expect(s).toEqual({ ok: true, status: "sent" });
  });
  it("only a Super Admin can retry; the switch must be on", async () => {
    superAdmin.mockResolvedValue(false); expect((await retryBookingNotification({ actorUserId: "x", confirmationId: "c1", audience: "client" }, ON)).ok).toBe(false);
    superAdmin.mockResolvedValue(true); expect((await retryBookingNotification({ actorUserId: "sa", confirmationId: "c1", audience: "client" }, {})).ok).toBe(false); expect(send).not.toHaveBeenCalled();
  });
  it("the list for the panel returns the records, newest first, and an empty list when the table is missing", async () => { expect((await listBookingNotifications("e1")).length).toBe(2); });
});
