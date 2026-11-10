import { beforeEach, describe, expect, it, vi } from "vitest";

// ---- in-memory database + the job functions with the rules of PROPOSAL_booking_notifications.sql + PROPOSAL_booking_notices_v2.sql
type Row = Record<string, unknown>;
let tables: Record<string, Row[]> = {}; let users: Record<string, { email: string | null; confirmed: boolean } | "fail"> = {};
const stale = 2 * 60 * 1000;
function builder(table: string) {
  const f: ((r: Row) => boolean)[] = []; let ord: { col: string; asc: boolean } | null = null, lim = Infinity;
  const run = () => { let rows = (tables[table] ?? []).filter((r) => f.every((x) => x(r))); if (ord) rows = [...rows].sort((a, b) => (Number(a[ord!.col]) - Number(b[ord!.col])) * (ord!.asc ? 1 : -1)); return rows.slice(0, lim); };
  const b: Record<string, unknown> = { select: () => b, eq: (c: string, v: unknown) => { f.push((r) => r[c] === v); return b; }, in: (c: string, v: unknown[]) => { f.push((r) => v.includes(r[c])); return b; }, lt: (c: string, v: number) => { f.push((r) => Number(r[c]) < v); return b; },
    order: (c: string, o?: { ascending: boolean }) => { ord = { col: c, asc: o?.ascending !== false }; return b; }, limit: (n: number) => { lim = n; return b; },
    maybeSingle: async () => ({ data: run()[0] ?? null, error: null }), then: (res: (v: unknown) => unknown) => res({ data: run(), error: null }) };
  return b;
}
const admin = {
  from: (t: string) => builder(t),
  auth: { admin: { getUserById: async (id: string) => { const u = users[id]; if (u === "fail" || !u) return { data: null, error: { message: "nope" } }; return { data: { user: { email: u.email, email_confirmed_at: u.confirmed ? "2026-11-01" : null } }, error: null }; } } },
  rpc: async (name: string, a: Record<string, unknown>) => {
    const jobs = (tables.booking_notification_jobs ??= []);
    if (name === "claim_booking_notification_job") {
      const j = jobs.find((x) => x.confirmation_id === a.p_confirmation && x.audience === a.p_audience); if (!j) return { data: [], error: null };
      const ok = j.status === "pending" || (a.p_include_retryable && ["failed", "skipped", "deferred"].includes(String(j.status))) || (j.status === "processing" && Date.now() - Number(j.last_attempted_at) > stale);
      if (!ok) return { data: [], error: null }; j.status = "processing"; j.attempt_count = Number(j.attempt_count) + 1; j.last_attempted_at = Date.now(); return { data: [{ ...j }], error: null };
    }
    if (name === "finish_booking_notification_job") { const j = jobs.find((x) => x.id === a.p_job); if (!j || j.status !== "processing") return { data: null, error: { message: "ordift:booking_notification_not_processing" } };
      Object.assign(j, { status: a.p_status, last_error: a.p_error, provider_result: a.p_provider_result, deliveries: a.p_deliveries, recipient_count: a.p_recipient_count, subject: a.p_subject, body_text: a.p_body }); return { data: null, error: null }; }
    if (name === "defer_booking_client_notice") { const j = jobs.find((x) => x.confirmation_id === a.p_confirmation && x.audience === "client" && x.status === "pending" && x.event !== "confirmed"); if (!j) return { data: null, error: { message: "ordift:booking_nothing_to_defer" } };
      Object.assign(j, { status: "deferred", deferred_reason: a.p_reason, deferred_by: a.p_actor }); return { data: null, error: null }; }
    return { data: null, error: { message: "unknown rpc" } };
  },
};
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => admin }));
const send = vi.fn<(...a: unknown[]) => unknown>(); const recipients = vi.fn<(...a: unknown[]) => unknown>(); const suppressed = vi.fn<(...a: unknown[]) => unknown>(); const superAdmin = vi.fn<(...a: unknown[]) => unknown>(); const audit = vi.fn<(...a: unknown[]) => Promise<undefined>>(async () => undefined); const prefs = vi.fn<(...a: unknown[]) => unknown>();
vi.mock("@/lib/notifications/dispatch", () => ({ dispatchNotification: (...a: unknown[]) => send(...a) }));
vi.mock("@/lib/notifications/recipients", () => ({ resolveNewBookingRecipients: (...a: unknown[]) => recipients(...a) }));
vi.mock("@/lib/notifications/preferences", () => ({ getNotificationPreferences: (...a: unknown[]) => prefs(...a) }));
vi.mock("@/lib/enquiry/lifecycleEmails", () => ({ clientEmailsSuppressed: (...a: unknown[]) => suppressed(...a) }));
vi.mock("@/lib/organization/authority", () => ({ isSuperAdminId: (...a: unknown[]) => superAdmin(...a) }));
vi.mock("@/lib/admin/activityLog", () => ({ logActivityAsSystem: (...a: unknown[]) => audit(...a) }));
import { deferClientNotice, dispatchBookingNotifications, recordManualClientNotice, retryBookingNotification } from "./notificationService";

const ON = { BOOKING_CONFIRMATION_ENABLED: "true" }; const okLogged = { email: { ok: true, mode: "logged", attempts: 0 } };
const seg = (cid: string, day: string, h = 10) => ({ confirmation_id: cid, seq: 1, starts_at: `2026-12-${day}T${String(h).padStart(2, "0")}:00:00Z`, ends_at: `2026-12-${day}T${String(h + 1).padStart(2, "0")}:00:00Z`, timezone: "Africa/Accra", kind: "studio", location: "Synthetic studio, Accra", platform: null, note: null });
const job = (id: string, c: string, a: string, ev: string, extra: Row = {}) => ({ id, confirmation_id: c, enquiry_id: "e1", audience: a, event: ev, status: "pending", attempt_count: 0, last_attempted_at: null, deliveries: [], recipient_count: 0, provider_result: null, last_error: null, target_profile_id: null, ...extra });
function seed(over: { owner?: string | null; email?: string | null; staff?: boolean } = {}) {
  tables = {
    // v1 confirmed 15 Dec (client was TOLD: sent job), v2 changed to 18 Dec
    enquiry_booking_confirmations: [
      { id: "c1", enquiry_id: "e1", version: 1, kind: "confirmed", quotation_id: "q1", assigned_profile_id: "p1", confirmed_by: "sa", supersedes_id: null, agreement_required: false, agreement_id: null, payment_condition: "full", verified_paid_usd: 400, outstanding_usd: 0, basis: null, reason: null },
      { id: "c2", enquiry_id: "e1", version: 2, kind: "changed", quotation_id: "q1", assigned_profile_id: "p2", confirmed_by: "sa", supersedes_id: "c1", agreement_required: false, agreement_id: null, payment_condition: "full", verified_paid_usd: 400, outstanding_usd: 0, basis: null, reason: null },
    ],
    enquiry_booking_segments: [seg("c1", "15"), seg("c2", "18", 9)],
    enquiries: [{ id: "e1", reference_number: "ENQ-JRN-GHP", email: over.email === undefined ? "typed@example.test" : over.email, full_name: "Ama Mensah", service: "photography", user_id: over.owner === undefined ? "owner1" : over.owner, amount_paid: 400, created_by: over.staff ? "staff1" : null }],
    client_quotations: [{ id: "q1", quotation_reference: "ORD-QUO-JRN-GHP" }], agreements: [],
    profiles: [{ id: "p1", full_name: "Old Person", member_number: "INT0007", access_status: "active" }, { id: "p2", full_name: "New Person", member_number: "INT0008", access_status: "active" }, { id: "sa", full_name: "Lab super_admin", member_number: "INT0001", access_status: "active" }],
    roles: [{ id: "r-staff", slug: "staff" }, { id: "r-admin", slug: "admin" }, { id: "r-sa", slug: "super_admin" }], user_roles: [{ user_id: "p1", role_id: "r-staff" }, { user_id: "p2", role_id: "r-staff" }],
    booking_notification_jobs: [job("j1c", "c1", "client", "confirmed", { status: "sent", attempt_count: 1 }), job("j2c", "c2", "client", "changed"), job("j2i", "c2", "internal", "changed"), job("j2a", "c2", "assigned", "changed", { target_profile_id: "p2" }), job("j2r", "c2", "released", "changed", { target_profile_id: "p1" })],
  };
  users = { owner1: { email: "account@example.test", confirmed: true }, p1: { email: "old@studio.test", confirmed: true }, p2: { email: "new@studio.test", confirmed: true } };
}
const j = (id: string) => tables.booking_notification_jobs.find((x) => x.id === id)!;
const sentTo = () => send.mock.calls.map((c) => (c[0] as { email: { to: string } }).email.to);
beforeEach(() => { seed(); send.mockReset(); send.mockResolvedValue(okLogged); recipients.mockReset(); recipients.mockResolvedValue([{ userId: "sa", email: "sa@x.test" }, { userId: "adm", email: "adm@x.test" }]); suppressed.mockReset(); suppressed.mockResolvedValue(false); superAdmin.mockReset(); superAdmin.mockImplementation(async (id: unknown) => id === "sa"); audit.mockClear(); prefs.mockReset(); prefs.mockResolvedValue(new Map()); });

describe("a reschedule (changed version) notifies each audience once, with the CURRENT booking", () => {
  it("client gets the new date and what they were last told; the assigned person the new details; the released person their release; the team the operational or full notice by role", async () => {
    await dispatchBookingNotifications("c2", ON);
    expect(sentTo().sort()).toEqual(["account@example.test", "adm@x.test", "new@studio.test", "old@studio.test", "sa@x.test"].sort());
    const client = String(j("j2c").body_text); expect(client).toContain("Now confirmed: Friday, 18 December 2026, 09:00–10:00"); expect(client).toContain("Previously: Tuesday, 15 December 2026, 10:00–11:00"); expect(j("j2c")).toMatchObject({ status: "sent", provider_result: "logged" });
    expect(String(j("j2a").body_text)).toContain("Now:"); expect(String(j("j2r").body_text)).toMatch(/taken off/); expect(String(j("j2r").body_text)).toContain("Was: Tuesday, 15 December");
    const byTo = (to: string) => String((send.mock.calls.find((c) => (c[0] as { email: { to: string } }).email.to === to)![0] as { email: { text: string } }).email.text);
    expect(byTo("sa@x.test")).toContain("Verified paid"); expect(byTo("adm@x.test")).not.toMatch(/Verified paid|Payment condition|\$/);
    expect(byTo("new@studio.test")).not.toMatch(/\$|USD|agreement|quotation|@/i);
  });
  it("duplicate and simultaneous dispatches send each message once", async () => { await Promise.all([dispatchBookingNotifications("c2", ON), dispatchBookingNotifications("c2", ON)]); const n = send.mock.calls.length; await dispatchBookingNotifications("c2", ON); expect(send.mock.calls.length).toBe(n); expect(n).toBe(5); });
  it("a client never told the earlier date sees no invented 'previously'", async () => { tables.booking_notification_jobs = tables.booking_notification_jobs.filter((x) => x.id !== "j1c"); await dispatchBookingNotifications("c2", ON); expect(String(j("j2c").body_text)).not.toContain("Previously"); });
});

describe("never an outdated date", () => {
  it("a notice for a version that is no longer the latest is marked superseded and nothing is sent", async () => {
    tables.enquiry_booking_confirmations.push({ id: "c3", enquiry_id: "e1", version: 3, kind: "changed", assigned_profile_id: "p2", supersedes_id: "c2" }); tables.enquiry_booking_segments.push(seg("c3", "20"));
    await dispatchBookingNotifications("c2", ON);
    expect(send).not.toHaveBeenCalled(); for (const id of ["j2c", "j2i", "j2a", "j2r"]) expect(j(id)).toMatchObject({ status: "skipped", provider_result: "superseded" });
  });
  it("a deferred notice sent later describes the booking as it is THEN (the manual record is refused when it is out of date)", async () => {
    tables.booking_notification_jobs.find((x) => x.id === "j2c")!.status = "deferred";
    tables.enquiry_booking_confirmations.push({ id: "c3", enquiry_id: "e1", version: 3, kind: "changed", assigned_profile_id: "p2", supersedes_id: "c2" }); tables.enquiry_booking_segments.push(seg("c3", "20"));
    const r = await recordManualClientNotice({ actorUserId: "sa", confirmationId: "c2", channel: "whatsapp" }, ON); expect(r.ok).toBe(false); expect(j("j2c")).toMatchObject({ status: "skipped", provider_result: "superseded" });
  });
});

describe("cancellation: two kinds, each notice says which", () => {
  beforeEach(() => { tables.enquiry_booking_confirmations.push({ id: "c3", enquiry_id: "e1", version: 3, kind: "cancelled", assigned_profile_id: "p2", supersedes_id: "c2", reason: "Client moved the date", cancellation_outcome: "rescheduling_pending" }); });
  it("awaiting rescheduling: names the cancelled booking (the one that was live), says a new date will be agreed; money untouched", async () => {
    tables.booking_notification_jobs = [job("j3c", "c3", "client", "cancelled_pending"), job("j3i", "c3", "internal", "cancelled_pending"), job("j3a", "c3", "assigned", "cancelled_pending", { target_profile_id: "p2" })];
    await dispatchBookingNotifications("c3", ON);
    const t = String(j("j3c").body_text); expect(t).toContain("Cancelled: Friday, 18 December 2026, 09:00–10:00"); expect(t).toMatch(/new date/); expect(t).not.toMatch(/refund/i);
    expect(String(j("j3i").body_text)).toContain("Reason: Client moved the date"); expect(String(j("j3a").body_text)).toMatch(/new date may follow/);
  });
  it("final: says it will not be rescheduled and that nothing was refunded; the assigned person is told to release the time", async () => {
    tables.enquiry_booking_confirmations[2].cancellation_outcome = "final"; tables.booking_notification_jobs = [job("j3c", "c3", "client", "cancelled_final"), job("j3a", "c3", "assigned", "cancelled_final", { target_profile_id: "p2" }), job("j3i", "c3", "internal", "cancelled_final")];
    await dispatchBookingNotifications("c3", ON);
    expect(String(j("j3c").body_text)).toMatch(/will not be rescheduled/); expect(String(j("j3c").body_text)).toMatch(/not been changed or refunded/); expect(String(j("j3a").body_text)).toMatch(/cancelled for good/); expect(String(j("j3i").body_text)).toMatch(/Nothing was refunded or changed/);
  });
});

describe("deferral: default is to notify; holding back needs a recorded reason and stays visible", () => {
  it("deferClientNotice needs a written reason, calls the database, and the deferred notice is not sent by the automatic dispatch", async () => {
    expect((await deferClientNotice({ actorUserId: "sa", confirmationId: "c2", reason: "short" }, ON)).ok).toBe(false);
    expect((await deferClientNotice({ actorUserId: "sa", confirmationId: "c2", reason: "phoning the client about the new date first" }, ON)).ok).toBe(true);
    expect(j("j2c")).toMatchObject({ status: "deferred", deferred_reason: "phoning the client about the new date first" });
    await dispatchBookingNotifications("c2", ON); expect(sentTo()).not.toContain("typed@example.test"); expect(sentTo()).toContain("sa@x.test");        // the team and the people assigned are still told
    expect(j("j2c").status).toBe("deferred");
  });
  it("Send now (explicit) sends a deferred notice once; the manual record and the e-mail cannot both happen", async () => {
    await deferClientNotice({ actorUserId: "sa", confirmationId: "c2", reason: "phoning the client about the new date first" }, ON);
    const r = await retryBookingNotification({ actorUserId: "sa", confirmationId: "c2", audience: "client" }, ON); expect(r).toEqual({ ok: true, status: "sent" }); expect(sentTo()).toEqual(["account@example.test"]);
    const again = await recordManualClientNotice({ actorUserId: "sa", confirmationId: "c2", channel: "whatsapp" }, ON); expect(again.ok).toBe(false);
  });
  it("a deferral that cannot be recorded reports why (the notice is then sent, the safe direction)", async () => { const r = await deferClientNotice({ actorUserId: "sa", confirmationId: "c1", reason: "holding a confirmation back is not allowed" }, ON); expect(r.ok).toBe(false); });
});

describe("where the client notice may go", () => {
  it("a project with a verified portal owner goes to the OWNER'S confirmed account address, never the e-mail typed on the enquiry", async () => {
    seed({ owner: "owner1" }); suppressed.mockResolvedValue(true); await dispatchBookingNotifications("c2", ON);
    expect(j("j2c")).toMatchObject({ status: "sent" }); expect(sentTo()).toContain("account@example.test"); expect(sentTo()).not.toContain("typed@example.test");
  });
  it("an owner whose account address is unconfirmed, or cannot be read, gets nothing (no fall-back to the typed address)", async () => {
    seed({ owner: "owner1" }); users.owner1 = { email: "account@example.test", confirmed: false }; await dispatchBookingNotifications("c2", ON);
    expect(j("j2c")).toMatchObject({ status: "skipped", provider_result: "account_unconfirmed" }); expect(sentTo()).not.toContain("typed@example.test");
    seed({ owner: "owner1" }); users.owner1 = "fail"; send.mockClear(); await dispatchBookingNotifications("c2", ON); expect(j("j2c")).toMatchObject({ status: "skipped", provider_result: "account_lookup_failed" }); expect(sentTo()).not.toContain("typed@example.test");
  });
  it("a staff-recorded enquiry with no verified owner gets NO automatic e-mail (suppressed), and the message is kept so staff can deliver it", async () => {
    seed({ owner: null }); suppressed.mockResolvedValue(true); await dispatchBookingNotifications("c2", ON);
    expect(j("j2c")).toMatchObject({ status: "skipped", provider_result: "suppressed" }); expect(String(j("j2c").body_text)).toContain("Booking reference: ENQ-JRN-GHP".replace("Booking reference: ", "")); expect(sentTo()).not.toContain("typed@example.test");
  });
  it("no e-mail on file, or the reserved placeholder: skipped", async () => { for (const email of [null, "enq-jrn-ghp@no-email.invalid"]) { seed({ email, owner: null }); await dispatchBookingNotifications("c2", ON); expect(j("j2c")).toMatchObject({ status: "skipped", provider_result: "no_email" }); } });
});

describe("a WEBSITE-FORM enquiry with no verified owner", () => {
  it("gets no booking details by e-mail: the typed address proves nothing, so the notice is skipped as unverified and kept for staff to deliver (acknowledgements and quotation e-mails are separate and untouched)", async () => {
    seed({ owner: null }); suppressed.mockResolvedValue(false); await dispatchBookingNotifications("c2", ON);
    expect(j("j2c")).toMatchObject({ status: "skipped", provider_result: "unverified_address" }); expect(sentTo()).not.toContain("typed@example.test"); expect(String(j("j2c").body_text)).toContain("Now confirmed:");
    expect(j("j2i").status).toBe("sent");                                                                       // the team and the people assigned are still told
  });
  it("once the client holds a verified portal account on the project, notices flow to the confirmed account address", async () => { seed({ owner: "owner1" }); send.mockClear(); await dispatchBookingNotifications("c2", ON); expect(j("j2c").status).toBe("sent"); expect(sentTo()).toContain("account@example.test"); expect(sentTo()).not.toContain("typed@example.test"); });
});

describe("a staff-recorded enquiry", () => {
  it("is never auto-mailed on the typed address even when its e-mail suppression setting allows lifecycle e-mails; the claimed owner's verified account address is used instead", async () => {
    seed({ staff: true, owner: null }); suppressed.mockResolvedValue(false); await dispatchBookingNotifications("c2", ON);
    expect(j("j2c")).toMatchObject({ status: "skipped", provider_result: "suppressed" }); expect(sentTo()).not.toContain("typed@example.test");
    seed({ staff: true, owner: "owner1" }); send.mockClear(); await dispatchBookingNotifications("c2", ON); expect(j("j2c").status).toBe("sent"); expect(sentTo()).toContain("account@example.test"); expect(sentTo()).not.toContain("typed@example.test");
  });
});

describe("recording that staff told the client (the workflow when e-mail is unavailable)", () => {
  it("records the channel and a note, keeps the CURRENT message, makes the outstanding action disappear, and is audited; it cannot be done twice", async () => {
    seed({ owner: null }); suppressed.mockResolvedValue(true); await dispatchBookingNotifications("c2", ON); expect(j("j2c").status).toBe("skipped");
    const r = await recordManualClientNotice({ actorUserId: "adm", confirmationId: "c2", channel: "whatsapp", note: "Read it out; client agreed the new time" }, ON); expect(r).toEqual({ ok: true });
    expect(j("j2c")).toMatchObject({ status: "sent", provider_result: "manual_whatsapp" }); expect((j("j2c").deliveries as { mode: string; channel: string; by: string }[])[0]).toMatchObject({ mode: "manual", channel: "whatsapp", by: "adm" });
    expect(String(j("j2c").body_text)).toContain("Now confirmed:"); expect(audit.mock.calls.some((c) => (c[0] as { action: string }).action === "booking.client_notified_manually")).toBe(true);
    expect((await recordManualClientNotice({ actorUserId: "adm", confirmationId: "c2", channel: "whatsapp" }, ON)).ok).toBe(false);
  });
  it("refuses an unknown channel and a note that carries contact details", async () => {
    expect((await recordManualClientNotice({ actorUserId: "adm", confirmationId: "c2", channel: "carrier-pigeon" }, ON)).ok).toBe(false);
    expect((await recordManualClientNotice({ actorUserId: "adm", confirmationId: "c2", channel: "email", note: "sent to ama@example.com" }, ON)).ok).toBe(false);
    expect((await recordManualClientNotice({ actorUserId: "adm", confirmationId: "c2", channel: "email", note: "called +233 24 123 4567" }, ON)).ok).toBe(false); expect(j("j2c").status).toBe("pending");
  });
});

describe("the assigned person: role, preference, address", () => {
  it("is skipped when inactive, without an internal role, opted out, or without a confirmed address; otherwise told", async () => {
    tables.profiles.find((p) => p.id === "p2")!.access_status = "suspended"; await dispatchBookingNotifications("c2", ON); expect(j("j2a")).toMatchObject({ status: "skipped", provider_result: "not_eligible" });
    seed(); tables.user_roles = tables.user_roles.filter((u) => u.user_id !== "p2"); await dispatchBookingNotifications("c2", ON); expect(j("j2a")).toMatchObject({ status: "skipped", provider_result: "not_eligible" });
    seed(); prefs.mockResolvedValue(new Map([["p2", false]])); await dispatchBookingNotifications("c2", ON); expect(j("j2a")).toMatchObject({ status: "skipped", provider_result: "not_eligible" });
    seed(); users.p2 = { email: "new@studio.test", confirmed: false }; await dispatchBookingNotifications("c2", ON); expect(j("j2a")).toMatchObject({ status: "skipped", provider_result: "not_eligible" });
    seed(); prefs.mockResolvedValue(new Map()); send.mockClear(); await dispatchBookingNotifications("c2", ON); expect(j("j2a").status).toBe("sent");
  });
});
