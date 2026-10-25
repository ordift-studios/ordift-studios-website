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
import { chooseContractingEntity } from "@/lib/organization/entityRegistrations";
import { resolveQuotationEntity, resolveQuotationEntityView } from "./quotationEntity";
import { readIssuedLegalDetails } from "./quotationIssuedDetails";
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

const entityId = (slug: string) => sql(`select id from public.employing_entities where slug = '${slug}'`);
// Issuing REQUIRES an explicitly recorded contracting entity. Unless a test says otherwise, a draft gets one the way production does (a Super Admin's recorded choice, here written directly).
async function draft(opts: { enquiryId?: string; noEntity?: boolean } = {}): Promise<string> {
  h.current = admin;
  const r = await createClientQuotation({ ...(opts.enquiryId ? { enquiryId: opts.enquiryId } : {}), prospectName: "Synthetic Prospect", currency: "USD", items: [{ serviceItem: "Portrait session", quantity: 1, unitBasis: "package", sellingRate: 351 }] });
  if (!r.ok) throw new Error(r.error);
  if (!opts.noEntity) sql(`insert into public.booking_contracting_entities (subject_type, subject_id, version, employing_entity_id, basis, chosen_by) values ('quotation','${r.quotationId}',1,'${entityId("iss-entity")}','E2E recorded choice','${U(0xe3)}')`);
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
  insert into public.employing_entities (name, slug, legal_name, registration_type, verification_status) values ('ISS Entity','iss-entity','ISS ENTITY W.L.L.','W.L.L.','verified') on conflict do nothing;
  insert into public.employing_entities (name, slug, verification_status) values ('ISS Unverified','iss-unverified','unverified') on conflict do nothing;
  insert into public.employing_entities (name, slug, verification_status, active) values ('ISS Inactive','iss-inactive','verified', false) on conflict do nothing;
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
    expect((await issueOrdinaryQuotation({ quotationId: rev.quotationId })).ok).toBe(false);   // the new version has no entity of its own yet: fail-closed, never copied or inferred
    expect(await chooseContractingEntity({ subject: { type: "quotation", id: rev.quotationId }, entityId: entityId("iss-entity"), basis: "E2E revision choice", actorUserId: U(0xe3) })).toMatchObject({ ok: true });
    h.current = founder;
    const r = await issueOrdinaryQuotation({ quotationId: rev.quotationId });
    expect(r).toMatchObject({ ok: true, validUntil: DEFAULT });  // ... but issuing never keeps a passed date
    expect(audit(rev.quotationId, "client_quotation.issued")).toMatchObject({ replacedExpiredCarriedDate: oldDate });
  });
});

describe("the contracting entity is a prerequisite of issuing (fail-closed, never inferred)", () => {
  const rowCount = () => sql(`select count(*) from public.booking_contracting_entities`);
  it("a draft can be created, saved and revised without an entity; creating records none", async () => {
    const c0 = rowCount();
    const q = await draft({ noEntity: true });
    expect(row(q)[0]).toBe("draft");
    expect(rowCount()).toBe(c0);
    expect(await resolveQuotationEntity(q)).toMatchObject({ ok: false, code: "none" });
  });
  it("issuing is refused without an entity — directly and through the legacy 'sent' status change — and nothing changes", async () => {
    const q = await draft({ noEntity: true }); h.current = founder;
    const r = await issueOrdinaryQuotation({ quotationId: q });
    expect(r.ok === false && r.error).toMatch(/contracting entity must be selected/);
    const legacy = await updateQuotationStatus({ quotationId: q, status: "sent" });
    expect(legacy.ok).toBe(false);
    expect(row(q)).toEqual(["draft", "-", "-", "-"]);
    expect(sql(`select count(*) from public.activity_log where entity_id='${q}' and action='client_quotation.issued'`)).toBe("0");
  });
  it("issuing succeeds once a Super Admin records an entity on the quotation, and the audit names it", async () => {
    const q = await draft({ noEntity: true });
    expect(await chooseContractingEntity({ subject: { type: "quotation", id: q }, entityId: entityId("iss-entity"), basis: "E2E explicit choice", actorUserId: U(0xe3) })).toMatchObject({ ok: true });
    h.current = admin;
    expect((await issueOrdinaryQuotation({ quotationId: q })).ok).toBe(true);
    expect(audit(q, "client_quotation.issued").contractingEntity).toMatchObject({ entityId: entityId("iss-entity"), name: "ISS Entity", recordedOn: "quotation", version: 1 });
  });
  it("an entity recorded on the linked ENQUIRY satisfies it; a quotation-level record takes precedence", async () => {
    const enq = "00000000-0000-4000-8000-00000000e402";
    sql(`insert into public.enquiries (id, reference_number, email, full_name, service) values ('${enq}','ENQ-ISS-2','iss2@b.test','Enquiry Two','photography') on conflict do nothing`);
    const q = await draft({ enquiryId: enq, noEntity: true });
    expect(await resolveQuotationEntity(q)).toMatchObject({ ok: false, code: "none" });
    expect(await chooseContractingEntity({ subject: { type: "enquiry", id: enq }, entityId: entityId("iss-entity"), basis: "E2E enquiry-level choice", actorUserId: U(0xe3) })).toMatchObject({ ok: true });
    expect(await resolveQuotationEntity(q)).toMatchObject({ ok: true, entity: { source: "enquiry" } });
    sql(`insert into public.employing_entities (name, slug, verification_status) values ('ISS Second','iss-second','verified') on conflict do nothing`);
    expect(await chooseContractingEntity({ subject: { type: "quotation", id: q }, entityId: entityId("iss-second"), basis: "E2E quotation-level choice", actorUserId: U(0xe3) })).toMatchObject({ ok: true });
    expect(await resolveQuotationEntity(q)).toMatchObject({ ok: true, entity: { name: "ISS Second", source: "quotation" } });
  });
  it("an unverified, inactive or otherwise ineligible entity refuses issuance; nobody but a Super Admin can record or choose one", async () => {
    for (const slug of ["iss-unverified", "iss-inactive"]) {
      const q = await draft({ noEntity: true });
      expect(await chooseContractingEntity({ subject: { type: "quotation", id: q }, entityId: entityId(slug), basis: "E2E ineligible choice", actorUserId: U(0xe3) })).toMatchObject({ ok: false });
      // even if such a record existed (written directly), issuing re-checks the standing at the moment of issue
      sql(`insert into public.booking_contracting_entities (subject_type, subject_id, version, employing_entity_id, basis, chosen_by) values ('quotation','${q}',1,'${entityId(slug)}','E2E direct','${U(0xe3)}')`);
      h.current = founder;
      const r = await issueOrdinaryQuotation({ quotationId: q });
      expect(r.ok === false && r.error).toMatch(/cannot currently contract/);
      expect(row(q)[0]).toBe("draft");
    }
    const q = await draft({ noEntity: true });
    for (const actor of [U(0xe2), U(0xe1), U(0xe4)]) {
      expect(await chooseContractingEntity({ subject: { type: "quotation", id: q }, entityId: entityId("iss-entity"), basis: "E2E not a super admin", actorUserId: actor })).toMatchObject({ ok: false });
    }
    expect(await resolveQuotationEntity(q)).toMatchObject({ ok: false, code: "none" });
  });
  it("an entity that stops being eligible after selection blocks issuing at the moment of issue", async () => {
    const q = await draft(); h.current = founder;
    sql(`update public.employing_entities set active = false where slug = 'iss-entity'`);
    try {
      const r = await issueOrdinaryQuotation({ quotationId: q });
      expect(r.ok === false && r.error).toMatch(/not active/);
      expect(row(q)[0]).toBe("draft");
    } finally { sql(`update public.employing_entities set active = true where slug = 'iss-entity'`); }
  });
  it("once issued, the entity cannot be changed (revise instead); first-time recording on a legacy issued quotation is still allowed", async () => {
    const q = await draft(); h.current = founder;
    await issueOrdinaryQuotation({ quotationId: q });
    sql(`insert into public.employing_entities (name, slug, verification_status) values ('ISS Third','iss-third','verified') on conflict do nothing`);
    const changed = await chooseContractingEntity({ subject: { type: "quotation", id: q }, entityId: entityId("iss-third"), basis: "E2E change attempt", actorUserId: U(0xe3) });
    expect(changed.ok === false && changed.error).toMatch(/issued with its contracting entity/);
    const legacy = await draft({ noEntity: true });
    sql(`update public.client_quotations set status='sent', issued_at=now(), valid_until=current_date+20 where id='${legacy}'`);
    expect(await chooseContractingEntity({ subject: { type: "quotation", id: legacy }, entityId: entityId("iss-entity"), basis: "E2E legacy first record", actorUserId: U(0xe3) })).toMatchObject({ ok: true });
  });
  it("the document data exposes only the legal name, registration type and current verified CR / tax identifiers", async () => {
    const q = await draft({ noEntity: true });
    sql(`insert into public.entity_registrations (employing_entity_id, kind, status, identifier, valid_from, verified_at, verified_by, note, recorded_by) select id, 'commercial_registration', 'active', 'CR-12345', current_date - 100, now(), '${U(0xe3)}', 'INTERNAL NOTE', '${U(0xe3)}' from public.employing_entities where slug='iss-entity';
         insert into public.entity_registrations (employing_entity_id, kind, status, identifier, valid_from, verified_at, verified_by, recorded_by) select id, 'establishment_card', 'active', 'EC-999', current_date - 100, now(), '${U(0xe3)}', '${U(0xe3)}' from public.employing_entities where slug='iss-entity';`);
    sql(`insert into public.booking_contracting_entities (subject_type, subject_id, version, employing_entity_id, basis, chosen_by) values ('quotation','${q}',1,'${entityId("iss-entity")}','E2E display','${U(0xe3)}')`);
    const res = await resolveQuotationEntity(q);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.entity.display.legalName).toBe("ISS ENTITY W.L.L.");
    const blob = JSON.stringify(res.entity.display);
    expect(blob).toContain("CR-12345");
    expect(blob).not.toMatch(/EC-999|INTERNAL NOTE|E2E display/);
  });
  it("the Crew Support path is untouched: the resolver defers to its own governance", async () => {
    const q = sql(`insert into public.client_quotations (quotation_reference, prospect_name, status, currency, subtotal, total, created_by, crew_support_request_id) select 'ORD-QUO-E2E-CREW','x','draft','USD',10,10,'${U(0xe2)}', c.id from public.crew_support_requests c limit 1 returning id`);
    if (q) expect(await resolveQuotationEntity(q)).toMatchObject({ ok: false, code: "crew" });
  });
});

describe("an issued quotation is frozen: its legal details and entity never change after issuance", () => {
  const mkEntity = (slug: string, legal: string, cr: string | null) => {
    sql(`insert into public.employing_entities (name, slug, legal_name, registration_type, verification_status) values ('${slug}','${slug}','${legal}','W.L.L.','verified') on conflict do nothing`);
    if (cr) sql(`insert into public.entity_registrations (employing_entity_id, kind, status, identifier, valid_from, verified_at, verified_by, recorded_by) select id, 'commercial_registration','active','${cr}', current_date - 100, now(), '${U(0xe3)}', '${U(0xe3)}' from public.employing_entities where slug='${slug}'`);
    return entityId(slug);
  };
  const choose = (type: "quotation" | "enquiry", id: string, ent: string, who = U(0xe3)) => chooseContractingEntity({ subject: { type, id }, entityId: ent, basis: "E2E frozen test", actorUserId: who });
  const entityRows = () => sql(`select count(*) from public.booking_contracting_entities`);
  const issueWith = async (ent: string, opts: { enquiryId?: string } = {}) => {
    const q = await draft({ ...opts, noEntity: true });
    expect(await choose("quotation", q, ent)).toMatchObject({ ok: true });
    h.current = admin;
    expect((await issueOrdinaryQuotation({ quotationId: q })).ok).toBe(true);
    return q;
  };

  it("issuance stores the entity's legal details; later registry changes (rename, new numbers, ineligibility) do NOT change the issued view, while a draft stays live", async () => {
    const f = mkEntity("fz-main", "FROZEN MAIN W.L.L.", "CR-OLD-1");
    const q = await issueWith(f);
    const a = audit(q, "client_quotation.issued");
    expect(a.legalDetails).toMatchObject({ entityId: f, legalName: "FROZEN MAIN W.L.L.", registrationType: "W.L.L.", identifiers: [{ label: "Commercial Registration (CR) No.", identifier: "CR-OLD-1" }] });
    const before = await readIssuedLegalDetails(q);
    expect(before.state).toBe("ok");
    if (before.state !== "ok") return;
    expect(before.record.eventId).toBe(sql(`select id from public.activity_log where entity_id='${q}' and action='client_quotation.issued'`));
    // a draft that uses the same entity, to show the contrast
    const d = await draft({ noEntity: true });
    expect(await choose("quotation", d, f)).toMatchObject({ ok: true });
    // the live registry changes: renamed, the CR is retired and a tax number is added
    sql(`update public.employing_entities set legal_name = 'RENAMED LATER LLC', registration_type = 'LLC' where slug = 'fz-main'`);
    sql(`update public.entity_registrations set status = 'expired' where identifier = 'CR-OLD-1'`);
    const after = await resolveQuotationEntityView(q);
    expect(after).toMatchObject({ phase: "issued", frozen: { legalName: "FROZEN MAIN W.L.L.", registrationType: "W.L.L.", identifiers: [{ identifier: "CR-OLD-1" }] } });
    expect((await readIssuedLegalDetails(q)).state).toBe("ok");
    const live = await resolveQuotationEntity(q);
    expect(live.ok).toBe(false);                                                   // the live entity can no longer contract, yet the issued document is unchanged
    const draftView = await resolveQuotationEntityView(d);
    expect(draftView.phase).toBe("draft");                                         // a draft is not frozen: it reports the live (now ineligible) record
    expect(draftView.phase === "draft" && draftView.resolution.ok).toBe(false);
  });

  it("the quotation keeps its original entity through acceptance, decline, expiry and revision: any change is refused, nothing is written, the frozen details stay", async () => {
    const x = mkEntity("fz-x", "ENTITY X W.L.L.", "CR-X");
    const y = mkEntity("fz-y", "ENTITY Y W.L.L.", "CR-Y");
    const rowsBefore = entityRows();
    const attempts = async (q: string) => {
      for (const target of [y, x]) {
        const r = await choose("quotation", q, target);
        expect(r.ok).toBe(false);
      }
      const view = await resolveQuotationEntityView(q);
      expect(view).toMatchObject({ phase: "issued", frozen: { entityId: x, legalName: "ENTITY X W.L.L." } });
    };
    // accepted
    const qa = await issueWith(x); h.current = admin;
    expect((await recordOrdinaryQuotationAcceptance({ quotationId: qa, channel: "email", evidence: "Email reply: yes, go ahead", acceptedByName: "Synthetic Client", receivedAt: new Date().toISOString() })).ok).toBe(true);
    expect(row(qa)[0]).toBe("accepted"); await attempts(qa);
    // declined
    const qd = await issueWith(x); h.current = admin;
    expect(await updateQuotationStatus({ quotationId: qd, status: "declined" })).toEqual({ ok: true });
    await attempts(qd);
    // expired (marked)
    const qe = await issueWith(x); h.current = admin;
    expect(await updateQuotationStatus({ quotationId: qe, status: "expired" })).toEqual({ ok: true });
    await attempts(qe);
    // superseded by a revision: the OLD version keeps X; the new draft selects its own entity
    const enq = "00000000-0000-4000-8000-00000000e403";
    sql(`insert into public.enquiries (id, reference_number, email, full_name, service) values ('${enq}','ENQ-ISS-3','iss3@b.test','Enquiry Three','photography') on conflict do nothing`);
    const qs = await issueWith(x, { enquiryId: enq }); h.current = founder;
    const rev = await reviseClientQuotation(qs);
    expect(rev.ok).toBe(true);
    if (!rev.ok) return;
    expect(row(qs)[0]).toBe("superseded");
    await attempts(qs);
    expect(await choose("quotation", rev.quotationId, y)).toMatchObject({ ok: true });      // the new version may take another entity
    expect(await resolveQuotationEntityView(qs)).toMatchObject({ phase: "issued", frozen: { entityId: x } });
    expect(entityRows()).toBe(String(Number(rowsBefore) + 5));                      // exactly the 4 legitimate choices before issuing + 1 on the new version; every refused attempt wrote nothing
  });

  it("an entity recorded on the ENQUIRY cannot be overridden on the issued quotation, and the enquiry-level record is locked once a quotation is issued under it", async () => {
    const x = mkEntity("fz-x2", "ENTITY X2 W.L.L.", "CR-X2");
    const y = mkEntity("fz-y2", "ENTITY Y2 W.L.L.", "CR-Y2");
    const enq = "00000000-0000-4000-8000-00000000e404";
    sql(`insert into public.enquiries (id, reference_number, email, full_name, service) values ('${enq}','ENQ-ISS-4','iss4@b.test','Enquiry Four','photography') on conflict do nothing`);
    expect(await choose("enquiry", enq, x)).toMatchObject({ ok: true });
    const q = await draft({ enquiryId: enq, noEntity: true });
    h.current = admin;
    expect((await issueOrdinaryQuotation({ quotationId: q })).ok).toBe(true);
    expect(audit(q, "client_quotation.issued").contractingEntity).toMatchObject({ entityId: x, recordedOn: "enquiry" });
    expect((await choose("quotation", q, y)).ok).toBe(false);                         // no quotation-level override of the issued entity
    expect((await choose("enquiry", enq, y)).ok).toBe(false);                         // and no change at the enquiry
    expect(await resolveQuotationEntityView(q)).toMatchObject({ phase: "issued", frozen: { entityId: x, recordedOn: "enquiry" } });
  });

  it("legacy compatibility: a quotation issued before an entity was required can still have one recorded for the first time, and it stays out of the issued document", async () => {
    const x = mkEntity("fz-leg", "LEGACY ENTITY W.L.L.", "CR-LEG");
    const q = await draft({ noEntity: true });
    sql(`update public.client_quotations set status='sent', issued_at=now() - interval '2 days', valid_until=current_date+20 where id='${q}'`);
    expect((await readIssuedLegalDetails(q)).state).toBe("no_snapshot");
    expect(await resolveQuotationEntityView(q)).toMatchObject({ phase: "issued_unfrozen", live: { ok: false, code: "none" } });
    expect(await choose("quotation", q, x)).toMatchObject({ ok: true });                // first-time recording allowed
    expect(await resolveQuotationEntityView(q)).toMatchObject({ phase: "issued_unfrozen", live: { ok: true } });
    expect((await readIssuedLegalDetails(q)).state).toBe("no_snapshot");               // never added to the issued document
    const second = mkEntity("fz-leg2", "LEGACY TWO W.L.L.", "CR-LEG2");
    expect((await choose("quotation", q, second)).ok).toBe(false);                      // but not changed afterwards
  });

  it("only a Super Admin can record or change an entity; admins, staff and clients cannot, before or after issuance", async () => {
    const x = mkEntity("fz-perm", "PERM W.L.L.", "CR-PERM");
    const q = await issueWith(x);
    for (const who of [U(0xe2), U(0xe1), U(0xe4)]) expect((await choose("quotation", q, x, who)).ok).toBe(false);
    const d = await draft({ noEntity: true });
    for (const who of [U(0xe2), U(0xe1), U(0xe4)]) expect((await choose("quotation", d, x, who)).ok).toBe(false);
    expect(await resolveQuotationEntityView(d)).toMatchObject({ phase: "draft", resolution: { ok: false, code: "none" } });
  });

  it("two simultaneous issues produce one issuance and exactly one matching issuance record", async () => {
    const x = mkEntity("fz-conc", "CONC W.L.L.", "CR-CONC");
    const q = await draft({ noEntity: true });
    expect(await choose("quotation", q, x)).toMatchObject({ ok: true });
    h.current = admin;
    const res = await Promise.all([issueOrdinaryQuotation({ quotationId: q }), issueOrdinaryQuotation({ quotationId: q }), issueOrdinaryQuotation({ quotationId: q })]);
    expect(res.filter((r) => r.ok)).toHaveLength(1);
    const events = sql(`select count(*) from public.activity_log where entity_id='${q}' and action='client_quotation.issued'`);
    const reverted = sql(`select count(*) from public.activity_log where entity_id='${q}' and action='client_quotation.issuance_reverted'`);
    expect(events).toBe("1");
    expect(reverted).toBe("0");
    expect((await readIssuedLegalDetails(q)).state).toBe("ok");
  });

  it("if the issuance record cannot be saved, the issuance is rolled back to a draft (never an issued quotation without its evidence); a retry then works", async () => {
    const x = mkEntity("fz-roll", "ROLL W.L.L.", "CR-ROLL");
    const q = await draft({ noEntity: true });
    expect(await choose("quotation", q, x)).toMatchObject({ ok: true });
    sql(`create or replace function public.e2e_fail_issued() returns trigger language plpgsql as $$ begin if new.action = 'client_quotation.issued' and new.entity_id = '${q}' then raise exception 'e2e simulated audit failure'; end if; return new; end $$;
         create trigger e2e_fail_issued_trg before insert on public.activity_log for each row execute function public.e2e_fail_issued();`);
    try {
      h.current = admin;
      const r = await issueOrdinaryQuotation({ quotationId: q });
      expect(r.ok === false && r.error).toMatch(/could not be saved\. Nothing was issued/);
      expect(row(q)).toEqual(["draft", "-", "-", "-"]);
      expect(sql(`select count(*) from public.activity_log where entity_id='${q}' and action='client_quotation.issuance_reverted'`)).toBe("1");
      expect(sql(`select count(*) from public.activity_log where entity_id='${q}' and action='client_quotation.issued'`)).toBe("0");
    } finally { sql(`drop trigger if exists e2e_fail_issued_trg on public.activity_log; drop function if exists public.e2e_fail_issued()`); }
    expect((await issueOrdinaryQuotation({ quotationId: q })).ok).toBe(true);
    expect((await readIssuedLegalDetails(q)).state).toBe("ok");
  });

  it("if the entity record changes while issuing, the issuance is rolled back and its stray record is ignored by the later, real issuance", async () => {
    const x = mkEntity("fz-race", "RACE W.L.L.", "CR-RACE");
    const y = mkEntity("fz-race2", "RACE TWO W.L.L.", "CR-RACE2");
    const q = await draft({ noEntity: true });
    expect(await choose("quotation", q, x)).toMatchObject({ ok: true });
    sql(`create or replace function public.e2e_change_entity() returns trigger language plpgsql as $$ begin if new.action = 'client_quotation.issued' and new.entity_id = '${q}' then
           insert into public.booking_contracting_entities (subject_type, subject_id, version, employing_entity_id, basis, supersedes_id, chosen_by)
           select 'quotation', '${q}', 2, '${y}', 'E2E concurrent change', b.id, '${U(0xe3)}' from public.booking_contracting_entities b where b.subject_id = '${q}' and b.version = 1;
         end if; return new; end $$;
         create trigger e2e_change_entity_trg after insert on public.activity_log for each row execute function public.e2e_change_entity();`);
    try {
      h.current = admin;
      const r = await issueOrdinaryQuotation({ quotationId: q });
      expect(r.ok === false && r.error).toMatch(/changed while you were issuing/);
      expect(row(q)).toEqual(["draft", "-", "-", "-"]);
    } finally { sql(`drop trigger if exists e2e_change_entity_trg on public.activity_log; drop function if exists public.e2e_change_entity()`); }
    // the stray 'issued' event from the rolled-back attempt must not be taken for the real issuance
    expect((await issueOrdinaryQuotation({ quotationId: q })).ok).toBe(true);
    const view = await resolveQuotationEntityView(q);
    expect(view).toMatchObject({ phase: "issued", frozen: { entityId: y, legalName: "RACE TWO W.L.L." } });   // the entity on record at the real issuance (version 2)
    expect(sql(`select count(*) from public.activity_log where entity_id='${q}' and action='client_quotation.issued'`)).toBe("2");
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
