// @vitest-environment node
//
// Quotation ISSUANCE, validity, delivery record, expiry on acceptance and revision, on the REAL schema (throwaway local Postgres + PostgREST). SYNTHETIC data only.
// Run: supabase/proposals/e2e_scratch.sh, then E2E_SUPABASE_URL=http://127.0.0.1:54997 npx vitest run --config vitest.localdb.config.ts src/lib/commercial/quotationIssuance.localdb.e2e.ts
import { execSync, spawn } from "node:child_process";
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
import { createAdminClient } from "@/lib/supabase/admin";
import { getQuotationDelivery, issueOrdinaryQuotation, recordQuotationDelivery } from "./quotationIssuance";
import { recordOrdinaryQuotationAcceptance } from "./quotationAcceptance";
import { addDays, defaultValidUntil, utcDate } from "./quotationValidity";

const sql = (q: string) => execSync("docker exec -i ordift-mig-check2 psql -U supabase_admin -h 127.0.0.1 -d p4_e2e -X -q -At -v ON_ERROR_STOP=1", { input: q }).toString().trim();
// A second database session, so two real transactions can overlap. Resolves with the exit code and stderr when it finishes.
function psqlBackground(query: string, expectFailure = false): Promise<{ code: number | null; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn("docker", ["exec", "-i", "ordift-mig-check2", "psql", "-U", "supabase_admin", "-h", "127.0.0.1", "-d", "p4_e2e", "-X", "-q", "-At", "-v", "ON_ERROR_STOP=1"]);
    let stderr = "";
    child.stderr.on("data", (d) => { stderr += String(d); });
    child.on("close", (code) => (code !== 0 && !expectFailure ? reject(new Error(stderr)) : resolve({ code, stderr })));
    child.stdin.end(query);
  });
}
// ENTITY FIXTURES: eligibility is now judged against the entity's own jurisdiction (migration 0173). These suites use a test jurisdiction whose approved rule set is the minimum
// (a mandatory legal registration). The Ghana and Qatar rule sets are exercised in jurisdictionRequirements.localdb.e2e.ts.
const EJ = `(select id from public.employment_jurisdictions where slug = 'e2e-land')`;
const crSql = (slug: string, cr: string) => `insert into public.entity_registrations (employing_entity_id, kind, status, identifier, valid_from, verified_at, verified_by, recorded_by) select id, 'commercial_registration', 'active', '${cr}', current_date - 100, now(), 'U3', 'U3' from public.employing_entities where slug = '${slug}' and not exists (select 1 from public.entity_registrations r where r.employing_entity_id = employing_entities.id and r.kind = 'commercial_registration')`.replace(/U3/g, "00000000-0000-4000-8000-0000000000e3");
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
  insert into public.employment_jurisdictions (name, slug) values ('E2E Land','e2e-land') on conflict do nothing;
  insert into public.jurisdiction_entity_requirements (jurisdiction_id, requirement_key, category, label, identifier_label, registration_kind, necessity, shown_on_document, sort_order, approved_at)
    select id, 'legal_registration', 'legal_registration', 'Commercial Registration (CR)', 'Commercial Registration (CR) No.', 'commercial_registration', 'mandatory', true, 10, now() from public.employment_jurisdictions where slug = 'e2e-land' on conflict do nothing;
  insert into public.employing_entities (name, slug, legal_name, registration_type, verification_status, jurisdiction_id) values ('ISS Entity','iss-entity','ISS ENTITY W.L.L.','W.L.L.','verified', ${EJ}) on conflict do nothing;
  insert into public.employing_entities (name, slug, verification_status, jurisdiction_id) values ('ISS Unverified','iss-unverified','unverified', ${EJ}) on conflict do nothing;
  insert into public.employing_entities (name, slug, verification_status, active, jurisdiction_id) values ('ISS Inactive','iss-inactive','verified', false, ${EJ}) on conflict do nothing;
  ${crSql("iss-entity", "CR-ISS-ENTITY")};
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
    sql(`insert into public.employing_entities (name, slug, verification_status, jurisdiction_id) values ('ISS Second','iss-second','verified', ${EJ}) on conflict do nothing; ${crSql("iss-second", "CR-ISS-2")}`);
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
    sql(`insert into public.employing_entities (name, slug, verification_status, jurisdiction_id) values ('ISS Third','iss-third','verified', ${EJ}) on conflict do nothing; ${crSql("iss-third", "CR-ISS-3")}`);
    const changed = await chooseContractingEntity({ subject: { type: "quotation", id: q }, entityId: entityId("iss-third"), basis: "E2E change attempt", actorUserId: U(0xe3) });
    expect(changed.ok === false && changed.error).toMatch(/issued with its contracting entity/);
    const legacy = await draft({ noEntity: true });
    sql(`update public.client_quotations set status='sent', issued_at=now(), valid_until=current_date+20 where id='${legacy}'`);
    expect(await chooseContractingEntity({ subject: { type: "quotation", id: legacy }, entityId: entityId("iss-entity"), basis: "E2E legacy first record", actorUserId: U(0xe3) })).toMatchObject({ ok: true });
  });
  it("the document data exposes only the legal name, registration type and current verified CR / tax identifiers", async () => {
    const q = await draft({ noEntity: true });
    sql(`update public.entity_registrations set note = 'INTERNAL NOTE' where identifier = 'CR-ISS-ENTITY';
         insert into public.entity_registrations (employing_entity_id, kind, status, identifier, valid_from, verified_at, verified_by, recorded_by) select id, 'establishment_card', 'active', 'EC-999', current_date - 100, now(), '${U(0xe3)}', '${U(0xe3)}' from public.employing_entities where slug='iss-entity';`);
    sql(`insert into public.booking_contracting_entities (subject_type, subject_id, version, employing_entity_id, basis, chosen_by) values ('quotation','${q}',1,'${entityId("iss-entity")}','E2E display','${U(0xe3)}')`);
    const res = await resolveQuotationEntity(q);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.entity.display.legalName).toBe("ISS ENTITY W.L.L.");
    const blob = JSON.stringify(res.entity.display);
    expect(blob).toContain("CR-ISS-ENTITY");
    expect(blob).not.toMatch(/EC-999|INTERNAL NOTE|E2E display/);
  });
  it("the Crew Support path is untouched: the resolver defers to its own governance", async () => {
    const q = sql(`insert into public.client_quotations (quotation_reference, prospect_name, status, currency, subtotal, total, created_by, crew_support_request_id) select 'ORD-QUO-E2E-CREW','x','draft','USD',10,10,'${U(0xe2)}', c.id from public.crew_support_requests c limit 1 returning id`);
    if (q) expect(await resolveQuotationEntity(q)).toMatchObject({ ok: false, code: "crew" });
  });
});

describe("an issued quotation is frozen: its legal details and entity never change after issuance", () => {
  const mkEntity = (slug: string, legal: string, cr: string | null) => {
    sql(`insert into public.employing_entities (name, slug, legal_name, registration_type, verification_status, jurisdiction_id) values ('${slug}','${slug}','${legal}','W.L.L.','verified', ${EJ}) on conflict do nothing`);
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

  it("ATOMIC: if anything fails inside the issuing transaction (here: the audit write), the quotation stays an untouched draft, with no event and no half-state; a retry then works", async () => {
    const x = mkEntity("fz-roll", "ROLL W.L.L.", "CR-ROLL");
    const q = await draft({ noEntity: true });
    expect(await choose("quotation", q, x)).toMatchObject({ ok: true });
    sql(`update public.client_quotations set valid_until = '${DEFAULT}' where id = '${q}'`);
    const draftBefore = sql(`select status||'|'||coalesce(issued_at::text,'-')||'|'||coalesce(issued_by::text,'-')||'|'||coalesce(valid_until::text,'-')||'|'||total||'|'||updated_at from public.client_quotations where id='${q}'`);
    sql(`create or replace function public.e2e_fail_issued() returns trigger language plpgsql as $$ begin if new.action = 'client_quotation.issued' and new.entity_id = '${q}' then raise exception 'e2e simulated audit failure'; end if; return new; end $$;
         create trigger e2e_fail_issued_trg before insert on public.activity_log for each row execute function public.e2e_fail_issued();`);
    try {
      h.current = admin;
      const r = await issueOrdinaryQuotation({ quotationId: q });
      expect(r.ok === false && r.error).toMatch(/could not be issued\. Nothing was changed/);
      expect(sql(`select status||'|'||coalesce(issued_at::text,'-')||'|'||coalesce(issued_by::text,'-')||'|'||coalesce(valid_until::text,'-')||'|'||total||'|'||updated_at from public.client_quotations where id='${q}'`)).toBe(draftBefore);   // byte-for-byte the original draft
      expect(sql(`select count(*) from public.activity_log where entity_id='${q}' and action like 'client_quotation.issu%'`)).toBe("0");
    } finally { sql(`drop trigger if exists e2e_fail_issued_trg on public.activity_log; drop function if exists public.e2e_fail_issued()`); }
    expect((await issueOrdinaryQuotation({ quotationId: q })).ok).toBe(true);
    expect((await readIssuedLegalDetails(q)).state).toBe("ok");
  });

  it("an entity recorded while the issue is waiting on the locks is seen: the issue is refused ('entity changed'), nothing is issued, and the draft is untouched", async () => {
    const x = mkEntity("fz-cc1", "CC ONE W.L.L.", "CR-CC1");
    const y = mkEntity("fz-cc2", "CC TWO W.L.L.", "CR-CC2");
    const q = await draft({ noEntity: true });
    expect(await choose("quotation", q, x)).toMatchObject({ ok: true });
    // session A records a new entity version and HOLDS its transaction open for 2s
    const holder = psqlBackground(`begin; insert into public.booking_contracting_entities (subject_type, subject_id, version, employing_entity_id, basis, supersedes_id, chosen_by)
      select 'quotation', '${q}', 2, '${y}', 'E2E concurrent change', b.id, '${U(0xe3)}' from public.booking_contracting_entities b where b.subject_id = '${q}' and b.version = 1; select pg_sleep(2); commit;`);
    await new Promise((r) => setTimeout(r, 700));
    h.current = admin;
    const r = await issueOrdinaryQuotation({ quotationId: q });                       // the pre-check saw x; the transaction waits for A, then sees y
    await holder;
    expect(r.ok === false && r.error).toMatch(/entity was changed/);
    expect(row(q)).toEqual(["draft", "-", "-", row(q)[3]]);
    expect(sql(`select count(*) from public.activity_log where entity_id='${q}' and action='client_quotation.issued'`)).toBe("0");
    // issuing again now uses the entity actually on record (y), frozen
    expect((await issueOrdinaryQuotation({ quotationId: q })).ok).toBe(true);
    expect(await resolveQuotationEntityView(q)).toMatchObject({ phase: "issued", frozen: { entityId: y, version: 2, legalName: "CC TWO W.L.L." } });
  });

  it("an entity change attempted while the issue holds its locks waits, then is REFUSED by the database (the quotation is issued under the entity that was frozen)", async () => {
    const x = mkEntity("fz-cd1", "CD ONE W.L.L.", "CR-CD1");
    const y = mkEntity("fz-cd2", "CD TWO W.L.L.", "CR-CD2");
    const q = await draft({ noEntity: true });
    expect(await choose("quotation", q, x)).toMatchObject({ ok: true });
    // make the issuing transaction slow (it keeps its row locks while the audit insert sleeps)
    sql(`create or replace function public.e2e_slow_issue() returns trigger language plpgsql as $$ begin if new.action = 'client_quotation.issued' and new.entity_id = '${q}' then perform pg_sleep(2); end if; return new; end $$;
         create trigger e2e_slow_issue_trg before insert on public.activity_log for each row execute function public.e2e_slow_issue();`);
    try {
      h.current = admin;
      const issuing = issueOrdinaryQuotation({ quotationId: q });
      await new Promise((r) => setTimeout(r, 700));
      const insertSql = `insert into public.booking_contracting_entities (subject_type, subject_id, version, employing_entity_id, basis, supersedes_id, chosen_by)
        select 'quotation', '${q}', 2, '${y}', 'E2E change during issue', b.id, '${U(0xe3)}' from public.booking_contracting_entities b where b.subject_id = '${q}' and b.version = 1;`;
      const attempt = psqlBackground(insertSql, true);
      const [r, a] = await Promise.all([issuing, attempt]);
      expect(r.ok).toBe(true);
      expect(a.code).not.toBe(0);                                                       // the change was refused by the trigger once the issue committed
      expect(a.stderr).toMatch(/entity_locked_after_issue/);
    } finally { sql(`drop trigger if exists e2e_slow_issue_trg on public.activity_log; drop function if exists public.e2e_slow_issue()`); }
    expect(sql(`select count(*) from public.booking_contracting_entities where subject_id = '${q}'`)).toBe("1");
    expect(await resolveQuotationEntityView(q)).toMatchObject({ phase: "issued", frozen: { entityId: x, version: 1 } });
  });

  it("the database refuses the same things by itself, even if the application were bypassed: wrong role, repeat, no entity, ineligible entity, past or over-long validity", async () => {
    const x = mkEntity("fz-db", "DB W.L.L.", "CR-DB");
    const rpc = (qid: string, actor: string, valid: string, expected: string | null = null) =>
      sql(`do $$ begin perform * from public.issue_ordinary_quotation('${qid}', '${actor}', '${valid}'::date, ${expected ? `'${expected}'` : "null"}, '{}'::jsonb); end $$`);
    const fails = (f: () => unknown) => { try { f(); return ""; } catch (e) { return String((e as { stderr?: Buffer }).stderr ?? e); } };
    const q = await draft({ noEntity: true });
    const valid = addDays(TODAY, 30);
    for (const [who, expected] of [["anon", "f"], ["authenticated", "f"], ["service_role", "t"]]) {
      expect(sql(`select has_function_privilege('${who}', 'public.issue_ordinary_quotation(uuid,uuid,date,uuid,jsonb)', 'execute')`), who).toBe(expected);
    }
    expect(fails(() => rpc(q, U(0xe1), valid))).toMatch(/not_authorised/);             // staff
    expect(fails(() => rpc(q, U(0xe4), valid))).toMatch(/not_authorised/);             // client
    expect(fails(() => rpc(q, U(0xe2), valid))).toMatch(/entity_required/);            // no entity recorded
    expect(await choose("quotation", q, x)).toMatchObject({ ok: true });
    expect(fails(() => rpc(q, U(0xe2), addDays(TODAY, -1)))).toMatch(/validity_in_past/);
    expect(fails(() => rpc(q, U(0xe2), addDays(TODAY, 61)))).toMatch(/validity_needs_super_admin/);
    expect(fails(() => rpc(q, U(0xe2), valid, entityId("iss-entity")))).toMatch(/entity_changed/);
    expect(row(q)[0]).toBe("draft");
    sql(`update public.employing_entities set verification_status = 'unverified' where slug = 'fz-db'`);
    expect(fails(() => rpc(q, U(0xe2), valid))).toMatch(/entity_ineligible/);
    sql(`update public.employing_entities set verification_status = 'verified' where slug = 'fz-db'`);
    expect(row(q)[0]).toBe("draft");
    expect(fails(() => rpc(q, U(0xe3), addDays(TODAY, 61)))).toBe("");                 // a Super Admin may go beyond 30 days
    expect(row(q)[0]).toBe("sent");
    expect(fails(() => rpc(q, U(0xe3), valid))).toMatch(/already_issued/);             // repeat
    expect(fails(() => rpc(sql(`select id from public.client_quotations where status='draft' and crew_support_request_id is not null limit 1`) || U(0xe5), U(0xe2), valid))).not.toBe("");
  });


});

describe("the issuance audit event is protected: created only by the atomic function, immutable afterwards, never replaceable by a look-alike", () => {
  const PROTECTED = "client_quotation.issued";
  const STAFF_UID = U(0xe1), ADMIN_UID = U(0xe2);
  const asSession = (uid: string, stmt: string) => `begin; set local role authenticated; select set_config('request.jwt.claims', '{"sub":"${uid}","role":"authenticated"}', true); ${stmt}; commit;`;
  const psqlErr = (script: string): string => { try { sql(script); return ""; } catch (e) { return String((e as { stderr?: Buffer }).stderr ?? e); } };
  const insertRow = (action: string, entityIdText: string, extra = "") => `insert into public.activity_log (actor_user_id, action, entity_type, entity_id, metadata${extra ? ", created_at" : ""}) values ('${ADMIN_UID}', '${action}', 'client_quotation', '${entityIdText}', '{"issuedAt":"2020-01-01T00:00:00.000000Z","legalDetails":{"legalName":"FORGED"}}'${extra ? `, '${extra}'` : ""})`;
  const mkIssued = async (slug: string, cr: string) => {
    sql(`insert into public.employing_entities (name, slug, legal_name, registration_type, verification_status, jurisdiction_id) values ('${slug}','${slug}','${slug.toUpperCase()} W.L.L.','W.L.L.','verified', ${EJ}) on conflict do nothing;
         insert into public.entity_registrations (employing_entity_id, kind, status, identifier, valid_from, verified_at, verified_by, recorded_by) select id,'commercial_registration','active','${cr}',current_date-100,now(),'${U(0xe3)}','${U(0xe3)}' from public.employing_entities where slug='${slug}' and not exists (select 1 from public.entity_registrations r where r.employing_entity_id = employing_entities.id)`);
    const q = await draft({ noEntity: true });
    expect(await chooseContractingEntity({ subject: { type: "quotation", id: q }, entityId: entityId(slug), basis: "E2E guard test", actorUserId: U(0xe3) })).toMatchObject({ ok: true });
    h.current = admin;
    expect((await issueOrdinaryQuotation({ quotationId: q })).ok).toBe(true);
    return q;
  };
  const eventRow = (q: string) => sql(`select id||'|'||created_at::text||'|'||metadata::text from public.activity_log where entity_id='${q}' and action='${PROTECTED}'`);
  const guardsEnabled = () => sql(`select count(*) from pg_trigger where tgrelid='public.activity_log'::regclass and tgname like 'activity_log_issuance_guard_%' and tgenabled='O'`);

  it("the authorised issuance succeeds; its event is stamped at exactly the issue time; there is one per quotation", async () => {
    sql(`insert into public.user_roles (user_id, role_id) select '${STAFF_UID}', r.id from public.roles r where r.slug='staff' on conflict do nothing`);
    const q = await mkIssued("gd-main", "CR-GD1");
    expect(sql(`select count(*) from public.client_quotations c join public.activity_log a on a.entity_id = c.id::text and a.action='${PROTECTED}' where c.id='${q}' and a.created_at = c.issued_at and a.actor_user_id = c.issued_by`)).toBe("1");
    expect(await readIssuedLegalDetails(q)).toMatchObject({ state: "ok", details: { legalName: "GD-MAIN W.L.L." } });
    expect(guardsEnabled()).toBe("3");
  });

  it("DIRECT INSERT is rejected for every route: staff session, admin session, the server's service role, the database owner, and an owner-run function with a caller-chosen action", async () => {
    const q = await mkIssued("gd-ins", "CR-GD2");
    const other = "22222222-2222-4222-8222-222222222222";           // a quotation that has no issuance event: so only the guard (not the unique index) can refuse
    // control: the SAME sessions can still write ordinary audit rows (legitimate behaviour preserved)
    expect(psqlErr(asSession(STAFF_UID, insertRow("e2e.staff_note", other)))).toBe("");
    expect(psqlErr(asSession(ADMIN_UID, insertRow("client_quotation.delivery_recorded", other)))).toBe("");
    // forged issuance events
    for (const uid of [STAFF_UID, ADMIN_UID]) {
      expect(psqlErr(asSession(uid, insertRow(PROTECTED, other))), uid).toMatch(/issuance_event_protected/);
      expect(psqlErr(asSession(uid, insertRow(PROTECTED, other, "2020-01-01"))), uid).toMatch(/issuance_event_protected/);       // backdated
    }
    const viaServiceRole = await createAdminClient().from("activity_log").insert({ actor_user_id: ADMIN_UID, action: PROTECTED, entity_type: "client_quotation", entity_id: other, metadata: { issuedAt: "x", legalDetails: { legalName: "FORGED" } } });
    expect(viaServiceRole.error?.message ?? "").toMatch(/issuance_event_protected/);
    expect(psqlErr(insertRow(PROTECTED, other))).toMatch(/issuance_event_protected/);                                                // even the database owner, without the function's marker
    expect(psqlErr(`select set_config('ordift.issuing_quotation', 'wrong:marker', false); ${insertRow(PROTECTED, other)}`)).toMatch(/issuance_event_protected/);
    // a session that knows the marker format and sets it itself still cannot mint an event: the role check (not the marker) is what resists impersonation
    const forgedId = "33333333-3333-4333-8333-333333333333";
    const withMarker = (role: "authenticated" | "service_role", uid: string) => `begin; set local role ${role}; select set_config('request.jwt.claims', '{"sub":"${uid}","role":"${role}"}', true); select set_config('ordift.issuing_quotation', '${forgedId}:${other}', true);
      insert into public.activity_log (id, actor_user_id, action, entity_type, entity_id, metadata) values ('${forgedId}', '${ADMIN_UID}', '${PROTECTED}', 'client_quotation', '${other}', '{}'); commit;`;
    expect(psqlErr(withMarker("authenticated", ADMIN_UID))).toMatch(/issuance_event_protected/);
    expect(psqlErr(withMarker("service_role", ADMIN_UID))).toMatch(/issuance_event_protected/);
    // another owner-run SECURITY DEFINER function that takes its action from its caller (the pattern of claim_and_log_payment_activity)
    sql(`create or replace function public.e2e_mint(p_action text, p_entity text) returns void language plpgsql security definer set search_path = '' as $$ begin insert into public.activity_log (action, entity_type, entity_id, metadata) values (p_action, 'client_quotation', p_entity, '{}'); end $$;
         grant execute on function public.e2e_mint(text, text) to service_role; notify pgrst, 'reload schema';`);
    await new Promise((r) => setTimeout(r, 2500));
    try {
      const mint = await createAdminClient().rpc("e2e_mint", { p_action: PROTECTED, p_entity: other });
      expect(mint.error?.message ?? "").toMatch(/issuance_event_protected/);
      expect((await createAdminClient().rpc("e2e_mint", { p_action: "e2e.ordinary", p_entity: other })).error).toBeNull();       // ordinary actions still pass through it
    } finally { sql(`drop function if exists public.e2e_mint(text, text)`); }
    // the marker does not outlive the function: a forged insert later in the SAME transaction is still refused
    const q2 = await draft({ noEntity: true });
    expect(await chooseContractingEntity({ subject: { type: "quotation", id: q2 }, entityId: entityId("gd-ins"), basis: "E2E marker test", actorUserId: U(0xe3) })).toMatchObject({ ok: true });
    expect(psqlErr(`begin; select 1 from public.issue_ordinary_quotation('${q2}', '${ADMIN_UID}', '${DEFAULT}'::date, null, '{}'::jsonb); ${insertRow(PROTECTED, other)}; commit;`)).toMatch(/issuance_event_protected/);
    expect(row(q2)[0]).toBe("draft");                                                  // that whole transaction rolled back
    expect(sql(`select count(*) from public.activity_log where entity_id = '${other}' and action='${PROTECTED}'`)).toBe("0");
    expect(await readIssuedLegalDetails(q)).toMatchObject({ state: "ok", details: { legalName: "GD-INS W.L.L." } });
  });

  it("UPDATE and DELETE of an issuance event are rejected for every role, and an ordinary row cannot be turned into one; ordinary rows stay editable as before", async () => {
    const q = await mkIssued("gd-upd", "CR-GD3");
    const before = eventRow(q);
    const svc = createAdminClient();
    expect((await svc.from("activity_log").update({ metadata: { legalDetails: { legalName: "HACKED" } } }).eq("entity_id", q).eq("action", PROTECTED)).error?.message ?? "").toMatch(/issuance_event_protected/);
    expect((await svc.from("activity_log").delete().eq("entity_id", q).eq("action", PROTECTED)).error?.message ?? "").toMatch(/issuance_event_protected/);
    expect(psqlErr(`update public.activity_log set metadata = '{}' where entity_id='${q}' and action='${PROTECTED}'`)).toMatch(/issuance_event_protected/);
    expect(psqlErr(`delete from public.activity_log where entity_id='${q}' and action='${PROTECTED}'`)).toMatch(/issuance_event_protected/);
    expect(psqlErr(`update public.activity_log set created_at = '2020-01-01' where entity_id='${q}' and action='${PROTECTED}'`)).toMatch(/issuance_event_protected/);
    expect(psqlErr(asSession(ADMIN_UID, `delete from public.activity_log where entity_id='${q}'`))).toMatch(/permission denied|issuance_event_protected/);      // authenticated has no delete right at all
    sql(`insert into public.activity_log (action, entity_type, entity_id, metadata) values ('e2e.ordinary_row', 'client_quotation', '${q}', '{}')`);
    expect(psqlErr(`update public.activity_log set action = '${PROTECTED}' where entity_id='${q}' and action='e2e.ordinary_row'`)).toMatch(/issuance_event_protected/);
    expect((await svc.from("activity_log").update({ metadata: { edited: true } }).eq("entity_id", q).eq("action", "e2e.ordinary_row")).error).toBeNull();   // ordinary rows: unchanged behaviour
    expect((await svc.from("activity_log").delete().eq("entity_id", q).eq("action", "e2e.ordinary_row")).error).toBeNull();
    expect(eventRow(q)).toBe(before);
    expect(await readIssuedLegalDetails(q)).toMatchObject({ state: "ok", details: { legalName: "GD-UPD W.L.L." } });
  });

  it("a forged event cannot replace the genuine legal details, even in the worst case where an administrator has switched the database guards off", async () => {
    const q = await mkIssued("gd-forge", "CR-GD4");
    const q0 = sql(`select issued_at::text from public.client_quotations where id='${q}'`);
    const forge = (createdAt: string) => `insert into public.activity_log (actor_user_id, action, entity_type, entity_id, metadata, created_at) values ('${admin.id}', '${PROTECTED}', 'client_quotation', '${q}', '{"issuedAt":"${new Date(q0.replace(" ", "T").replace(/\+00$/, "Z")).toISOString().replace("Z", "000Z")}","legalDetails":{"entityId":"${entityId("gd-forge")}","name":"FORGED","recordedOn":"quotation","version":1,"legalName":"FORGED LEGAL NAME","registrationType":null,"identifiers":[],"capturedAt":""}}', '${createdAt}')`;
    // layer 1: the unique index refuses a second event for the quotation even if triggers were bypassed
    const guards = (verb: "disable" | "enable") => sql(["ins", "upd", "del"].map((k) => `alter table public.activity_log ${verb} trigger activity_log_issuance_guard_${k};`).join(" "));
    guards("disable");
    try {
      expect(psqlErr(forge("2020-01-01 00:00:00+00"))).toMatch(/activity_log_one_issuance_per_quotation|duplicate key/);
      // layer 2: with BOTH the guard and the index removed, the resolver itself still refuses to prefer a look-alike
      sql(`drop index public.activity_log_one_issuance_per_quotation`);
      sql(forge("2020-01-01 00:00:00+00"));                                                                      // backdated copy
      expect(await readIssuedLegalDetails(q)).toMatchObject({ state: "ok", details: { legalName: "GD-FORGE W.L.L." } });
      expect(await resolveQuotationEntityView(q)).toMatchObject({ phase: "issued", frozen: { legalName: "GD-FORGE W.L.L." } });
      sql(forge(q0));                                                                                            // an exact-time duplicate: ambiguous
      expect((await readIssuedLegalDetails(q)).state).toBe("no_snapshot");                                       // fail closed: shows nothing rather than either
      sql(`delete from public.activity_log where id in (select id from public.activity_log where entity_id='${q}' and action='${PROTECTED}' and metadata->'legalDetails'->>'legalName' = 'FORGED LEGAL NAME')`);   // (guard-less cleanup of the planted rows)
    } finally {
      sql(`create unique index if not exists activity_log_one_issuance_per_quotation on public.activity_log (entity_id) where action = 'client_quotation.issued'`);
      guards("enable");
    }
    expect(guardsEnabled()).toBe("3");
    expect(sql(`select count(*) from pg_indexes where indexname='activity_log_one_issuance_per_quotation'`)).toBe("1");
    expect(await readIssuedLegalDetails(q)).toMatchObject({ state: "ok", details: { legalName: "GD-FORGE W.L.L." } });
  });

  it("existing audit workflows are untouched: ordinary, delivery, acceptance and revision events are written, read, edited and removed exactly as before", async () => {
    const q = await mkIssued("gd-flow", "CR-GD5");
    h.current = admin;
    expect((await recordQuotationDelivery({ quotationId: q, channel: "email", deliveredAt: new Date().toISOString() })).ok).toBe(true);
    expect((await recordOrdinaryQuotationAcceptance({ quotationId: q, channel: "email", evidence: "Email: yes, please go ahead", acceptedByName: "Synthetic Client", receivedAt: new Date().toISOString() })).ok).toBe(true);
    const kinds = sql(`select string_agg(action, ',' order by created_at) from public.activity_log where entity_id='${q}' and action like 'client_quotation.%' and action <> 'client_quotation.created'`);
    expect(kinds).toBe("client_quotation.issued,client_quotation.delivery_recorded,client_quotation.acceptance_recorded");
    expect(await readIssuedLegalDetails(q)).toMatchObject({ state: "ok", details: { legalName: "GD-FLOW W.L.L." } });      // frozen details survive the later events
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
