// @vitest-environment node
//
// Quotation ISSUANCE, validity, delivery record, expiry on acceptance and revision, on the REAL schema (throwaway local Postgres + PostgREST). SYNTHETIC data only.
// Run: supabase/proposals/e2e_scratch.sh, then E2E_SUPABASE_URL=http://127.0.0.1:54997 npx vitest run --config vitest.localdb.config.ts src/lib/commercial/quotationIssuance.localdb.e2e.ts
import { execSync } from "node:child_process";
import { beforeAll, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  agent: null as unknown,
  current: null as unknown,
  fetch: async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const undici = await import("undici");
    (h as { agent: unknown }).agent ??= new undici.Agent({ keepAliveTimeout: 1, keepAliveMaxTimeout: 1 });
    return (await undici.fetch(String(input).replace("/rest/v1", ""), { ...(init as object), dispatcher: (h as { agent: unknown }).agent as import("undici").Dispatcher })) as unknown as Response;
  },
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/portal/roles", async (orig) => ({ ...(await orig<typeof import("@/lib/portal/roles")>()), getCurrentUser: async () => h.current }));
vi.mock("@/lib/supabase/admin", async () => {
  const { createClient: make } = await import("@supabase/supabase-js");
  return { createAdminClient: () => make(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: h.fetch } }) };
});
// logActivity uses the session-scoped client in production; here it is routed to the same service client so the audit rows can be read back
vi.mock("@/lib/supabase/server", async () => {
  const { createClient: make } = await import("@supabase/supabase-js");
  return { createClient: async () => make(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: h.fetch } }) };
});

import { createClientQuotation, reviseClientQuotation, updateQuotationStatus } from "./clientQuotations";
import { getQuotationDelivery, issueOrdinaryQuotation, recordQuotationDelivery } from "./quotationIssuance";
import { recordOrdinaryQuotationAcceptance } from "./quotationAcceptance";
import { addDays, defaultValidUntil, utcDate } from "./quotationValidity";

const sql = (q: string) => execSync("docker exec -i ordift-mig-check2 psql -U supabase_admin -h 127.0.0.1 -d p4_e2e -X -q -At -v ON_ERROR_STOP=1", { input: q }).toString().trim();
const U = (n: number) => `00000000-0000-4000-8000-0000000000${n.toString(16).padStart(2, "0")}`;
const user = (n: number, roles: string[]) => ({ id: U(n), email: `u${n}@e2e.test`, fullName: `User ${n}`, roles, accessStatus: "active" });
const staff = user(0xe1, ["staff"]), admin = user(0xe2, ["admin"]), founder = user(0xe3, ["admin", "super_admin"]), client = user(0xe4, ["client"]);
const E_REAL = "00000000-0000-4000-8000-00000000e401";
const NOW = new Date();
const TODAY = utcDate(NOW);
const DEFAULT = defaultValidUntil(NOW);
const financeAndMoney = () => sql(`select (select count(*) from public.payments)||'/'||(select count(*) from public.payment_obligations)||'/'||(select count(*) from public.engagements)||'/'||(select count(*) from public.agreements)||'/'||(select count(*) from public.email_send_failures)||'/'||(select count(*) from public.assignment_notifications)||'/'||(select count(*) from public.enquiry_amount_events)||'/'||(select count(*) from public.enquiries where amount_due is not null)`);
let before = "";

async function draft(opts: { enquiryId?: string } = {}): Promise<string> {
  h.current = admin;
  const r = await createClientQuotation({ ...(opts.enquiryId ? { enquiryId: opts.enquiryId } : {}), prospectName: "Synthetic Prospect", currency: "USD", items: [{ serviceItem: "Portrait session", quantity: 1, unitBasis: "package", sellingRate: 351 }] });
  if (!r.ok) throw new Error(r.error);
  return r.quotationId;
}
const row = (id: string) => sql(`select status||'|'||coalesce(issued_at::text,'-')||'|'||coalesce(issued_by::text,'-')||'|'||coalesce(valid_until::text,'-') from public.client_quotations where id='${id}'`).split("|");
const audit = (id: string, action: string) => JSON.parse(sql(`select coalesce((select metadata::text from public.activity_log where entity_id='${id}' and action='${action}' order by created_at desc limit 1),'null')`));

beforeAll(() => {
  if (!/^https?:\/\/(127\.0\.0\.1|localhost)/.test(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "")) throw new Error("Refusing to run against a non-local database");
  sql(`
  set session_replication_role = replica;
  insert into auth.users (id,email) select ('00000000-0000-4000-8000-0000000000'||lpad(to_hex(n),2,'0'))::uuid, 'u'||n||'@e2e.test' from generate_series(225,228) n on conflict do nothing;
  insert into public.profiles (id, full_name, access_status) select ('00000000-0000-4000-8000-0000000000'||lpad(to_hex(n),2,'0'))::uuid, 'User '||n, 'active' from generate_series(225,228) n on conflict do nothing;
  insert into public.user_roles (user_id, role_id) select '${U(0xe2)}', r.id from public.roles r where r.slug='admin' on conflict do nothing;
  insert into public.user_roles (user_id, role_id) select '${U(0xe3)}', r.id from public.roles r where r.slug in ('admin','super_admin') on conflict do nothing;
  insert into public.currencies (code, name, symbol) values ('USD','US dollar','$') on conflict do nothing;
  insert into public.enquiries (id, reference_number, email, full_name, service) values ('${E_REAL}','ENQ-ISS-1','iss@b.test','Real Enquiry','photography');
  `);
  before = financeAndMoney();
});

describe("issuing a draft", () => {
  it("records the actual issue time, the issuer and the standard 30-day validity; the quotation is 'sent' and nothing else changes", async () => {
    const q = await draft();
    expect(row(q)[0]).toBe("draft");
    expect(row(q)[1]).toBe("-");                       // a draft has no issue date
    h.current = admin;
    const r = await issueOrdinaryQuotation({ quotationId: q });
    expect(r).toMatchObject({ ok: true, validUntil: DEFAULT, isException: false });
    const [status, issuedAt, issuedBy, validUntil] = row(q);
    expect(status).toBe("sent");
    expect(Math.abs(new Date(issuedAt).getTime() - Date.now())).toBeLessThan(60_000);
    expect(issuedBy).toBe(U(0xe2));
    expect(validUntil).toBe(DEFAULT);
    const a = audit(q, "client_quotation.issued");
    expect(a).toMatchObject({ from: "draft", validUntil: DEFAULT, withinStandardPolicy: true });
    expect(a.delivery).toMatch(/not sent by the system/);
    expect(a.exceptionReason).toBeUndefined();
  });
  it("a second issue (double tap) is refused and changes nothing; two simultaneous issues produce exactly one issuance", async () => {
    const q = await draft(); h.current = admin;
    const [a, b] = await Promise.all([issueOrdinaryQuotation({ quotationId: q }), issueOrdinaryQuotation({ quotationId: q })]);
    expect([a.ok, b.ok].sort()).toEqual([false, true]);
    expect(sql(`select count(*) from public.activity_log where entity_id='${q}' and action='client_quotation.issued'`)).toBe("1");
    const again = await issueOrdinaryQuotation({ quotationId: q });
    expect(again.ok).toBe(false);
  });
  it("only an admin or Super Admin can issue; staff and clients are refused and nothing changes", async () => {
    const q = await draft();
    for (const u of [staff, client, null]) { h.current = u; expect((await issueOrdinaryQuotation({ quotationId: q })).ok).toBe(false); }
    expect(row(q)[0]).toBe("draft");
  });
  it("prerequisites: a draft without lines (or with a zero total) cannot be issued", async () => {
    h.current = admin;
    const empty = sql(`insert into public.client_quotations (quotation_reference, prospect_name, status, currency, subtotal, total, created_by) values ('ORD-QUO-E2E-EMPTY','x','draft','USD',0,0,'${U(0xe2)}') returning id`);
    const r = await issueOrdinaryQuotation({ quotationId: empty });
    expect(r.ok === false && r.error).toMatch(/at least one line item/);
  });
  it("the old bare 'sent' status change now ISSUES (issue time, issuer, validity recorded), never a silent flip", async () => {
    const q = await draft(); h.current = admin;
    expect(await updateQuotationStatus({ quotationId: q, status: "sent" })).toEqual({ ok: true });
    const [status, issuedAt, issuedBy, validUntil] = row(q);
    expect([status, issuedBy, validUntil]).toEqual(["sent", U(0xe2), DEFAULT]);
    expect(issuedAt).not.toBe("-");
  });
});

describe("validity exceptions: recorded, authorised, never past", () => {
  it("shorter than standard needs a reason (admin may); the exception is audited", async () => {
    const q = await draft(); h.current = admin;
    const short = addDays(TODAY, 10);
    expect((await issueOrdinaryQuotation({ quotationId: q, validUntil: short })).ok).toBe(false);
    expect(row(q)[0]).toBe("draft");
    expect(await issueOrdinaryQuotation({ quotationId: q, validUntil: short, exceptionReason: "client travels on the 5th, needs a quick decision" })).toMatchObject({ ok: true, isException: true, isExtension: false });
    expect(row(q)[3]).toBe(short);
    expect(audit(q, "client_quotation.issued")).toMatchObject({ withinStandardPolicy: false, exceptionReason: "client travels on the 5th, needs a quick decision", extensionBeyondStandard: false });
  });
  it("beyond 30 days: an admin is refused; a Super Admin may approve it with a reason, recorded with the approver", async () => {
    const q = await draft(); const long = addDays(TODAY, 60);
    h.current = admin;
    const refused = await issueOrdinaryQuotation({ quotationId: q, validUntil: long, exceptionReason: "corporate procurement cycle is long" });
    expect(refused.ok === false && refused.error).toMatch(/Super Admin/);
    expect(row(q)[0]).toBe("draft");
    h.current = founder;
    expect((await issueOrdinaryQuotation({ quotationId: q, validUntil: long })).ok).toBe(false);          // no reason
    expect(await issueOrdinaryQuotation({ quotationId: q, validUntil: long, exceptionReason: "corporate procurement cycle is long" })).toMatchObject({ ok: true, isExtension: true });
    expect(audit(q, "client_quotation.issued")).toMatchObject({ extensionBeyondStandard: true, approvedBy: U(0xe3), validUntil: long });
  });
  it("a date in the past is refused outright (no back-dating)", async () => {
    const q = await draft(); h.current = founder;
    expect((await issueOrdinaryQuotation({ quotationId: q, validUntil: addDays(TODAY, -1), exceptionReason: "trying to back-date this one" })).ok).toBe(false);
    expect(row(q)[0]).toBe("draft");
  });
});

describe("delivery to the client is a person's record; the system sends nothing", () => {
  it("cannot be recorded before issue; after issue it is recorded, visible, and changes nothing on the quotation", async () => {
    const q = await draft(); h.current = admin;
    expect((await recordQuotationDelivery({ quotationId: q, channel: "whatsapp_message", deliveredAt: new Date().toISOString() })).ok).toBe(false);
    await issueOrdinaryQuotation({ quotationId: q });
    const snapshot = row(q).join("|");
    expect((await recordQuotationDelivery({ quotationId: q, channel: "pigeon", deliveredAt: new Date().toISOString() })).ok).toBe(false);
    expect((await recordQuotationDelivery({ quotationId: q, channel: "whatsapp_message", deliveredAt: new Date(Date.now() + 86_400_000).toISOString() })).ok).toBe(false);
    expect((await recordQuotationDelivery({ quotationId: q, channel: "whatsapp_message", deliveredAt: new Date().toISOString(), note: "sent the PDF" })).ok).toBe(true);
    expect(await getQuotationDelivery(q)).toMatchObject({ channel: "whatsapp_message" });
    expect(row(q).join("|")).toBe(snapshot);
    h.current = staff;
    expect((await recordQuotationDelivery({ quotationId: q, channel: "email", deliveredAt: new Date().toISOString() })).ok).toBe(false);
  });
});

describe("expiry blocks late acceptance (staff-recorded); in-time acceptance can still be recorded late", () => {
  const expiredSent = async () => {
    const q = await draft(); h.current = admin;
    await issueOrdinaryQuotation({ quotationId: q });
    sql(`update public.client_quotations set issued_at = now() - interval '10 days', valid_until = (current_date - 1) where id='${q}'`);
    return q;
  };
  const accept = (q: string, receivedAt: string) => recordOrdinaryQuotationAcceptance({ quotationId: q, channel: "whatsapp_message", evidence: "WhatsApp reply: yes, go ahead", acceptedByName: "Synthetic Client", receivedAt });
  it("an acceptance received after the validity date is refused and nothing is written", async () => {
    const q = await expiredSent(); h.current = admin;
    const r = await accept(q, new Date().toISOString());
    expect(r.ok === false && r.error).toMatch(/expired quotation cannot be accepted/);
    expect(row(q)[0]).toBe("sent");
  });
  it("an acceptance the client sent before it expired can still be recorded (judged on the evidence date, audited)", async () => {
    const q = await expiredSent(); h.current = admin;
    const r = await accept(q, new Date(Date.now() - 5 * 86_400_000).toISOString());
    expect(r.ok).toBe(true);
    expect(row(q)[0]).toBe("accepted");
  });
  it("a still-valid quotation is accepted normally, and acceptance sets no amount due", async () => {
    const q = await draft(); h.current = admin; await issueOrdinaryQuotation({ quotationId: q });
    expect((await accept(q, new Date().toISOString())).ok).toBe(true);
  });
});

describe("issue, delivery and acceptance are three distinct, auditable acts with honest wording", () => {
  it("one quotation taken through all three: separate audit events in order, each stating exactly what happened, and later acts never alter earlier facts", async () => {
    const q = await draft(); h.current = admin;
    const mails = () => sql(`select (select count(*) from public.email_send_failures)||'/'||(select count(*) from public.assignment_notifications)`);
    const mailsBefore = mails();
    await issueOrdinaryQuotation({ quotationId: q });
    const afterIssue = row(q);
    await recordQuotationDelivery({ quotationId: q, channel: "email", deliveredAt: new Date().toISOString(), note: "emailed from my own mailbox" });
    expect(row(q).join("|")).toBe(afterIssue.join("|"));                                   // delivery changed nothing on the quotation
    const acc = await recordOrdinaryQuotationAcceptance({ quotationId: q, channel: "email", evidence: "Email reply from the client: yes, please go ahead", acceptedByName: "Synthetic Client", receivedAt: new Date().toISOString() });
    expect(acc.ok).toBe(true);
    const after = row(q);
    expect([after[0], after[1], after[2], after[3]]).toEqual(["accepted", afterIssue[1], afterIssue[2], afterIssue[3]]);   // only the status moved; issue time, issuer and validity are untouched
    const actions = sql(`select string_agg(action, ',' order by created_at) from public.activity_log where entity_id='${q}' and action like 'client_quotation.%' and action <> 'client_quotation.created'`);
    expect(actions).toBe("client_quotation.issued,client_quotation.delivery_recorded,client_quotation.acceptance_recorded");
    expect(audit(q, "client_quotation.issued").delivery).toMatch(/not sent by the system/);
    expect(audit(q, "client_quotation.delivery_recorded")).toMatchObject({ channel: "email", recordedBy: U(0xe2) });
    expect(audit(q, "client_quotation.delivery_recorded").note_system).toMatch(/system did not send anything/);
    expect(audit(q, "client_quotation.acceptance_recorded")).toMatchObject({ via: "staff_recorded", channel: "email" });
    expect(mails()).toBe(mailsBefore);                                                    // not one email or notification was sent or queued by any of the three
  });
});

describe("revision: an expired date is never carried silently", () => {
  it("revising an expired quotation gives a new DRAFT; issuing it replaces the passed date with the standard 30 days and records that", async () => {
    const q = await draft({ enquiryId: E_REAL }); h.current = founder;
    await issueOrdinaryQuotation({ quotationId: q });
    sql(`update public.client_quotations set issued_at = now() - interval '40 days', valid_until = (current_date - 10) where id='${q}'`);
    const oldDate = sql(`select valid_until from public.client_quotations where id='${q}'`);
    const rev = await reviseClientQuotation(q);
    expect(rev.ok).toBe(true);
    if (!rev.ok) return;
    const [status, issuedAt, , carried] = row(rev.quotationId);
    expect(status).toBe("draft");
    expect(issuedAt).toBe("-");                                   // the revision has NOT been issued; no issue date is copied
    expect(carried).toBe(oldDate);                                // the database copies it into the draft (kept atomic on purpose) ...
    expect(row(q)[0]).toBe("superseded");
    const r = await issueOrdinaryQuotation({ quotationId: rev.quotationId });
    expect(r).toMatchObject({ ok: true, validUntil: DEFAULT });  // ... but issuing never keeps a passed date
    expect(audit(rev.quotationId, "client_quotation.issued")).toMatchObject({ replacedExpiredCarriedDate: oldDate });
  });
});

describe("issuing never creates money, bookings, acceptance or messages", () => {
  it("across everything above: no payment, obligation, engagement, agreement, email failure, notification, amount event or amount due", () => {
    expect(financeAndMoney()).toBe(before);
  });
  it("the real enquiry's stage and payment fields were not touched", () => {
    expect(sql(`select crm_stage::text||'|'||coalesce(amount_due::text,'-')||'|'||coalesce(payment_status::text,'-') from public.enquiries where id='${E_REAL}'`)).toMatch(/^new_lead\|-\|/);
  });
});
