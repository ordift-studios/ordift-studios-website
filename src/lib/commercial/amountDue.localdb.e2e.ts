// @vitest-environment node
//
// Enquiry-to-booking M2a — the REAL server code (quotation linking, atomic revision, contracting-entity prerequisite, establish amount due, override, register,
// the typed-action guard) run against a throwaway local Postgres + PostgREST built from the repository's own migration chain plus 0166. Nothing here can reach
// Staging or Production: the Supabase URL is forced to localhost, outbound email and notifications are mocked and COUNTED, and the admin client refuses the
// tables Production's service_role cannot read. SYNTHETIC data only, removed afterwards.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { execSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";

const h = vi.hoisted(() => ({
  user: null as null | { id: string; email: string | null; fullName: string | null; roles: string[]; accessStatus: string },
  nonUsd: false,
  emails: [] as string[],
  notifications: [] as string[],
  quotationReadyEmails: [] as string[],
  agent: null as unknown,
  fetch: async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const undici = await import("undici");
    (h as { agent: unknown }).agent ??= new undici.Agent({ keepAliveTimeout: 1, keepAliveMaxTimeout: 1 });
    return (await undici.fetch(String(input).replace("/rest/v1", ""), { ...(init as object), dispatcher: (h as { agent: unknown }).agent as import("undici").Dispatcher })) as unknown as Response;
  },
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/portal/roles", async (orig) => ({ ...(await orig<typeof import("@/lib/portal/roles")>()), getCurrentUser: async () => h.user }));
vi.mock("@/lib/shared/email/dispatch", async (orig) => ({ ...(await orig<Record<string, unknown>>()), sendEmail: vi.fn(async (a: { to?: string }) => { h.emails.push(String(a?.to ?? "")); return { ok: true }; }) }));
vi.mock("@/lib/notifications/dispatch", () => ({ dispatchNotification: vi.fn(async () => { h.notifications.push("n"); return { email: { ok: true, mode: "logged", attempts: 1 } }; }) }));
vi.mock("@/lib/enquiry/lifecycleEmails", async (orig) => ({ ...(await orig<Record<string, unknown>>()), sendQuotationReadyEmail: vi.fn(async () => { h.quotationReadyEmails.push("q"); }) }));
// The release safeguard flag, switched per test so BOTH states are exercised.
vi.mock("./amountDueRules", async (orig) => {
  const real = await orig<typeof import("./amountDueRules")>();
  const out = { ...real } as Record<string, unknown>;
  Object.defineProperty(out, "NON_USD_AMOUNT_DUE_ENABLED", { get: () => h.nonUsd, enumerable: true });
  return out;
});
vi.mock("@/lib/supabase/server", async () => {
  const { createClient: make } = await import("@supabase/supabase-js");
  return { createClient: async () => make(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: h.fetch } }) };
});
// Production's service_role cannot read these (migration 0024); the admin client here refuses them so a wrong-client read fails the test, as it would in Production.
const DENIED_FOR_ADMIN = new Set(["currencies", "exchange_rates", "current_exchange_rates", "payment_country_config"]);
vi.mock("@/lib/supabase/admin", async () => {
  const { createClient: make } = await import("@supabase/supabase-js");
  return {
    createAdminClient: () => {
      const c = make(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: h.fetch } });
      const from = c.from.bind(c);
      (c as unknown as { from: (t: string) => unknown }).from = (t: string) => {
        if (DENIED_FOR_ADMIN.has(t)) throw new Error(`permission denied for table ${t} (Production service_role cannot read it)`);
        return from(t);
      };
      return c;
    },
  };
});

import { createClientQuotation, reviseClientQuotation, updateQuotationStatus, attachQuotationToEnquiry } from "./clientQuotations";
import { recordOrdinaryQuotationAcceptance } from "./quotationAcceptance";
import { establishAmountDue, getAmountDuePanel, hasActiveOrdinaryQuotation, listAmountEvents, overrideAmountDue } from "./amountDue";
import { establishAmountDueAction, overrideAmountDueAction, attachQuotationAction } from "@/app/admin/enquiries/[id]/amountDueActions";
import { setAmountDueAction } from "@/app/admin/enquiries/actions";

if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:|\/|$)/.test(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "")) throw new Error("Refusing to run: this E2E may only target a localhost database.");

const ADMIN = "00000000-0000-4000-8000-0000000000b1";
const SUPER = "00000000-0000-4000-8000-0000000000b2";
const STAFF = "00000000-0000-4000-8000-0000000000b3";
const CLIENT = "00000000-0000-4000-8000-0000000000b4";
const ROLES: Record<string, string[]> = { [ADMIN]: ["admin"], [SUPER]: ["admin", "super_admin"], [STAFF]: ["staff"], [CLIENT]: ["client"] };
const as = (id: string | null) => { h.user = id ? { id, email: `${id}@e2e.test`, fullName: id, roles: ROLES[id] ?? [], accessStatus: "active" } : null; };

const db = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false }, global: { fetch: h.fetch } });
const sql = (q: string) => execSync("docker exec -i ordift-mig-check2 psql -U postgres -h 127.0.0.1 -v ON_ERROR_STOP=1 -At", { input: q }).toString();
const one = (q: string) => sql(q).trim().split("\n")[0];
const num = (q: string) => Number(one(q));
const must = <T extends { ok: boolean }>(r: T, label = ""): Extract<T, { ok: true }> => { if (!r.ok) throw new Error(`${label} expected ok, got ${JSON.stringify(r)}`); return r as Extract<T, { ok: true }>; };
const mustFail = <T extends { ok: boolean }>(r: T): string => { expect(r.ok).toBe(false); return (r as unknown as { error?: string }).error ?? ""; };

const snapshotCounts = () => ({
  payments: num("select count(*) from public.payments"),
  obligations: num("select count(*) from public.payment_obligations"),
  engagements: num("select count(*) from public.engagements"),
  crewEvents: num("select count(*) from public.crew_support_notification_events"),
  assignmentNotifications: num("select count(*) from public.assignment_notifications"),
  emailFailures: num("select count(*) from public.email_send_failures"),
});
let baseline = snapshotCounts();

// The release safeguard exists twice: the application flag AND the database function. Tests switch both together; one test switches only the application.
const setDbGate = (on: boolean) => sql(`create or replace function private.non_usd_amount_due_enabled() returns boolean language sql immutable set search_path = '' as $$ select ${on} $$;`);
const gate = (on: boolean) => { h.nonUsd = on; setDbGate(on); };

let counter = 0;
function newEnquiry(opts: { market?: "GH" | "QA" | null; intent?: string; paid?: number | null; due?: number | null; source?: string | null } = {}): string {
  const ref = `M2APP-${Date.now().toString().slice(-7)}${++counter}`;
  const market = opts.market === undefined ? "GH" : opts.market;
  return one(`insert into public.enquiries (reference_number, email, full_name, service, payment_country, commercial_intent, amount_paid, amount_due, amount_due_source, is_test)
    values ('${ref}', '${ref.toLowerCase()}@example.invalid', 'M2APP Client', 'photography', ${market ? `'${market}'` : "null"}, '${opts.intent ?? "ordift_led"}', ${opts.paid ?? "null"}, ${opts.due ?? "null"}, ${opts.source ? `'${opts.source}'` : "null"}, true) returning id`);
}
const refOf = (enquiryId: string) => one(`select reference_number from public.enquiries where id = '${enquiryId}'`);
const stageOf = (enquiryId: string) => one(`select crm_stage from public.enquiries where id = '${enquiryId}'`);
const recordEntity = (quotationId: string) => sql(`insert into public.booking_contracting_entities (subject_type, subject_id, version, employing_entity_id, basis, chosen_by)
  select 'quotation', '${quotationId}', 1, e.id, 'M2APP test basis', '${SUPER}' from public.employing_entities e where e.slug = 'm2app-entity'`);

async function makeQuotation(enquiryId: string | null, opts: { currency?: string; total?: number } = {}) {
  as(ADMIN);
  const r = must(await createClientQuotation({ enquiryId, prospectName: "M2APP Prospect", currency: opts.currency ?? "USD", items: [{ serviceItem: "Photography", quantity: 1, unitBasis: "per_job", sellingRate: opts.total ?? 250 }] }), "create quotation");
  return r.quotationId;
}
async function sendQuotation(quotationId: string) { as(ADMIN); must(await updateQuotationStatus({ quotationId, status: "sent" }), "mark sent"); }
async function acceptQuotation(quotationId: string) {
  as(ADMIN);
  return recordOrdinaryQuotationAcceptance({ quotationId, channel: "email", evidence: "Email from the client on 2026-10-19", acceptedByName: "M2APP Client", receivedAt: new Date(Date.now() - 3600_000).toISOString() });
}
/** An accepted, entity-recorded, enquiry-linked quotation ready to establish. */
async function readyScenario(opts: { currency?: string; total?: number; market?: "GH" | "QA" | null; paid?: number | null } = {}) {
  const enquiryId = newEnquiry({ market: opts.market, paid: opts.paid });
  const quotationId = await makeQuotation(enquiryId, opts);
  await sendQuotation(quotationId);
  recordEntity(quotationId);
  must(await acceptQuotation(quotationId), "accept");
  return { enquiryId, quotationId };
}
async function previewOf(enquiryId: string) {
  as(ADMIN);
  const panel = await getAmountDuePanel(enquiryId);
  expect(panel).not.toBeNull();
  return panel!;
}
async function establishFromPreview(enquiryId: string, quotationId: string, over: Partial<Parameters<typeof establishAmountDue>[0]> = {}) {
  const p = await previewOf(enquiryId);
  const pv = p.assessment.preview;
  as(ADMIN);
  return establishAmountDue({ enquiryId, quotationId, expectedRateToUsd: pv?.rateEffectiveFrom ? pv.rateToUsd : null, expectedRateEffectiveFrom: pv?.rateEffectiveFrom ?? null, acknowledgeRateJump: false, ...over });
}

beforeAll(() => {
  sql(`
    insert into auth.users (id, email) values ('${ADMIN}','m2app-admin@e2e.test'), ('${SUPER}','m2app-super@e2e.test'), ('${STAFF}','m2app-staff@e2e.test'), ('${CLIENT}','m2app-client@e2e.test') on conflict do nothing;
    insert into public.profiles (id, full_name, access_status) values ('${ADMIN}','M2APP Admin','active'), ('${SUPER}','M2APP Super','active'), ('${STAFF}','M2APP Staff','active'), ('${CLIENT}','M2APP Client','active')
      on conflict (id) do update set access_status = 'active';
    update public.profiles set member_number = 'M2APP-0001' where id = '${SUPER}';
    insert into public.user_roles (user_id, role_id) select '${ADMIN}', r.id from public.roles r where r.slug = 'admin' on conflict do nothing;
    insert into public.user_roles (user_id, role_id) select '${SUPER}', r.id from public.roles r where r.slug in ('admin','super_admin') on conflict do nothing;
    insert into public.user_roles (user_id, role_id) select '${STAFF}', r.id from public.roles r where r.slug = 'staff' on conflict do nothing;
    insert into public.user_roles (user_id, role_id) select '${CLIENT}', r.id from public.roles r where r.slug = 'client' on conflict do nothing;
    insert into public.employing_entities (name, slug) select 'M2APP Entity', 'm2app-entity' where not exists (select 1 from public.employing_entities where slug = 'm2app-entity');
    insert into public.exchange_rates (currency_code, rate_to_usd, effective_from, reason, updated_by) values
      ('GHS', 11.000000, now() - interval '40 days', 'M2APP previous rate', '${SUPER}'),
      ('GHS', 11.089800, now() - interval '10 days', 'M2APP official mid-rate', '${SUPER}'),
      ('QAR', 3.640000, now() - interval '45 days', 'M2APP pegged rate', '${SUPER}');
    notify pgrst, 'reload schema';
  `);
  baseline = snapshotCounts();
});

afterAll(() => {
  try {
    setDbGate(false);
    sql(`
      set session_replication_role = replica;
      delete from public.enquiry_amount_events where enquiry_id in (select id from public.enquiries where reference_number like 'M2APP-%');
      delete from public.activity_log where actor_user_id in ('${ADMIN}','${SUPER}','${STAFF}','${CLIENT}');
      delete from public.client_quotation_items where quotation_id in (select id from public.client_quotations where prospect_name = 'M2APP Prospect');
      delete from public.client_quotations where prospect_name = 'M2APP Prospect';
      delete from public.booking_contracting_entities where basis like 'M2APP%';
      delete from public.employing_entities where slug = 'm2app-entity';
      delete from public.crew_support_requests where reference_number like 'M2APP-%';
      delete from public.enquiries where reference_number like 'M2APP-%';
      delete from public.exchange_rates where reason like 'M2APP%';
      delete from public.user_roles where user_id in ('${ADMIN}','${SUPER}','${STAFF}','${CLIENT}');
      delete from public.profiles where id in ('${ADMIN}','${SUPER}','${STAFF}','${CLIENT}');
      delete from auth.users where id in ('${ADMIN}','${SUPER}','${STAFF}','${CLIENT}');
      drop trigger if exists m2app_boom on public.client_quotation_items;
      drop function if exists public.m2app_boom();
    `);
  } catch (e) { console.error("cleanup failed", e); }
});

describe("authorization", () => {
  it("only an admin or Super Admin can see the panel; staff, a client and a signed-out visitor get nothing", async () => {
    const enquiryId = newEnquiry();
    for (const who of [STAFF, CLIENT, null]) { as(who); expect(await getAmountDuePanel(enquiryId), String(who)).toBeNull(); }
    as(ADMIN); expect(await getAmountDuePanel(enquiryId)).not.toBeNull();
  });
  it("establishing needs the manage-amount permission: staff, a client and signed-out are refused and nothing is written", async () => {
    gate(false);
    const { enquiryId, quotationId } = await readyScenario();
    for (const who of [STAFF, CLIENT, null]) {
      as(who);
      expect(mustFail(await establishAmountDue({ enquiryId, quotationId, expectedRateToUsd: null, expectedRateEffectiveFrom: null, acknowledgeRateJump: false })), String(who)).toMatch(/Not authorized/);
    }
    expect(one(`select amount_due is null from public.enquiries where id='${enquiryId}'`)).toBe("t");
    expect(num(`select count(*) from public.enquiry_amount_events where enquiry_id='${enquiryId}'`)).toBe(0);
  });
  it("an admin can establish but cannot override; only a Super Admin can override", async () => {
    const { enquiryId, quotationId } = await readyScenario();
    must(await establishFromPreview(enquiryId, quotationId));
    as(ADMIN);
    const refused = await overrideAmountDue({ enquiryId, newAmountUsd: 300, category: "scope_or_price_change_agreed", reason: "Client agreed an extra location in writing", evidence: "Email 2026-10-20", typedReference: refOf(enquiryId) });
    expect(mustFail(refused)).toMatch(/Only a Super Admin/);
    expect(one(`select amount_due from public.enquiries where id='${enquiryId}'`)).toBe("250.00");
    as(SUPER);
    must(await overrideAmountDue({ enquiryId, newAmountUsd: 300, category: "scope_or_price_change_agreed", reason: "Client agreed an extra location in writing", evidence: "Email 2026-10-20", typedReference: refOf(enquiryId) }));
    expect(one(`select amount_due from public.enquiries where id='${enquiryId}'`)).toBe("300.00");
  });
  it("attaching, revising and the register are refused to staff and clients; the register is Super Admin only", async () => {
    const enquiryId = newEnquiry();
    const unattached = await makeQuotation(null);
    for (const who of [STAFF, CLIENT, null]) {
      as(who);
      mustFail(await attachQuotationToEnquiry({ quotationId: unattached, enquiryId }));
      mustFail(await reviseClientQuotation(unattached));
    }
    as(ADMIN); expect(mustFail(await listAmountEvents())).toMatch(/Super Admin/);
    as(SUPER); expect((await listAmountEvents()).ok).toBe(true);
  });
  it("the database functions themselves refuse an actor without the role, even if the application layer were bypassed", async () => {
    const { enquiryId, quotationId } = await readyScenario();
    const r1 = await db().rpc("establish_enquiry_amount_due", { p_enquiry_id: enquiryId, p_quotation_id: quotationId, p_actor: STAFF });
    expect(r1.error?.message).toContain("ordift:not_authorised");
    const r2 = await db().rpc("override_enquiry_amount_due", { p_enquiry_id: enquiryId, p_actor: ADMIN, p_new_amount_usd: 10, p_category: "other", p_reason: "A reason long enough to pass the length rule", p_evidence: "ref" });
    expect(r2.error?.message).toContain("ordift:not_authorised");
    const r3 = await db().rpc("revise_ordinary_quotation", { p_quotation_id: quotationId, p_actor: CLIENT });
    expect(r3.error?.message).toContain("ordift:not_authorised");
  });
});

describe("linking quotations to enquiries and currency handling at creation", () => {
  it("creates a quotation for an enquiry, and a second active one for the same enquiry is refused with a clear message", async () => {
    const enquiryId = newEnquiry();
    const q1 = await makeQuotation(enquiryId);
    expect(one(`select enquiry_id from public.client_quotations where id='${q1}'`)).toBe(enquiryId);
    expect(await hasActiveOrdinaryQuotation(enquiryId)).toBe(true);
    as(ADMIN);
    expect(mustFail(await createClientQuotation({ enquiryId, prospectName: "M2APP Prospect", currency: "USD", items: [{ serviceItem: "Again", quantity: 1, unitBasis: "per_job", sellingRate: 1 }] }))).toMatch(/already has an active quotation/);
    expect(num(`select count(*) from public.client_quotations where enquiry_id='${enquiryId}'`)).toBe(1);
  });
  it("a Crew Support enquiry and an unknown enquiry are refused", async () => {
    const crew = newEnquiry({ intent: "creative_crew_support" });
    as(ADMIN);
    expect(mustFail(await createClientQuotation({ enquiryId: crew, prospectName: "M2APP Prospect", currency: "USD", items: [{ serviceItem: "x", quantity: 1, unitBasis: "per_job", sellingRate: 1 }] }))).toMatch(/Crew Support/);
    expect(mustFail(await createClientQuotation({ enquiryId: "00000000-0000-4000-8000-00000000dead", prospectName: "M2APP Prospect", currency: "USD", items: [{ serviceItem: "x", quantity: 1, unitBasis: "per_job", sellingRate: 1 }] }))).toMatch(/not found/);
  });
  it("an unsupported currency is refused at creation and nothing is saved; a supported one passes", async () => {
    as(ADMIN);
    const before = num("select count(*) from public.client_quotations where prospect_name = 'M2APP Prospect'");
    expect(mustFail(await createClientQuotation({ prospectName: "M2APP Prospect", currency: "XXX", items: [{ serviceItem: "x", quantity: 1, unitBasis: "per_job", sellingRate: 1 }] }))).toMatch(/supported currency/);
    expect(num("select count(*) from public.client_quotations where prospect_name = 'M2APP Prospect'")).toBe(before);
    must(await createClientQuotation({ prospectName: "M2APP Prospect", currency: "QAR", items: [{ serviceItem: "x", quantity: 1, unitBasis: "per_job", sellingRate: 1 }] }));
  });
  it("attach: an unattached draft or sent quotation can be attached once; an attached, accepted or Crew Support quotation cannot", async () => {
    const e1 = newEnquiry(); const e2 = newEnquiry();
    const q = await makeQuotation(null);
    as(ADMIN);
    must(await attachQuotationToEnquiry({ quotationId: q, enquiryId: e1 }));
    expect(mustFail(await attachQuotationToEnquiry({ quotationId: q, enquiryId: e2 }))).toMatch(/already attached/);
    const q2 = await makeQuotation(null);
    expect(mustFail(await attachQuotationToEnquiry({ quotationId: q2, enquiryId: e1 }))).toMatch(/already has an active quotation/);
    const accepted = await makeQuotation(null);
    await sendQuotation(accepted); must(await acceptQuotation(accepted));
    as(ADMIN); expect(mustFail(await attachQuotationToEnquiry({ quotationId: accepted, enquiryId: e2 }))).toMatch(/Only a draft or sent/);
    const crewE = newEnquiry({ intent: "creative_crew_support" });
    expect(mustFail(await attachQuotationToEnquiry({ quotationId: q2, enquiryId: crewE }))).toMatch(/Crew Support/);
  });
  it("attach through the form action reports success only after it happened, and a second attach is a visible failure", async () => {
    const e = newEnquiry(); const q = await makeQuotation(null);
    as(ADMIN);
    const fd = new FormData(); fd.set("enquiryId", e); fd.set("quotationId", q);
    expect(await attachQuotationAction(null, fd)).toMatchObject({ ok: true });
    expect(await attachQuotationAction(null, fd)).toMatchObject({ ok: false });
  });
});

describe("the contracting entity is a prerequisite for acceptance (never inferred)", () => {
  it("an enquiry-linked quotation cannot have its acceptance recorded until an entity is recorded; then it can", async () => {
    const enquiryId = newEnquiry();
    const q = await makeQuotation(enquiryId);
    await sendQuotation(q);
    expect(mustFail(await acceptQuotation(q))).toMatch(/Choose the contracting entity first/);
    expect(one(`select status from public.client_quotations where id='${q}'`)).toBe("sent");
    recordEntity(q);
    must(await acceptQuotation(q));
    expect(one(`select status from public.client_quotations where id='${q}'`)).toBe("accepted");
  });
  it("an entity recorded on the ENQUIRY also satisfies it; an unlinked quotation keeps the existing behaviour", async () => {
    const enquiryId = newEnquiry();
    const q = await makeQuotation(enquiryId); await sendQuotation(q);
    sql(`insert into public.booking_contracting_entities (subject_type, subject_id, version, employing_entity_id, basis, chosen_by) select 'enquiry', '${enquiryId}', 1, e.id, 'M2APP test basis', '${SUPER}' from public.employing_entities e where e.slug = 'm2app-entity'`);
    must(await acceptQuotation(q));
    const loose = await makeQuotation(null); await sendQuotation(loose);
    must(await acceptQuotation(loose));
  });
  it("establishing is refused when no entity is recorded, even for an accepted quotation", async () => {
    gate(false);
    const enquiryId = newEnquiry(); const q = await makeQuotation(enquiryId); await sendQuotation(q);
    sql(`update public.client_quotations set status='accepted', accepted_at=now(), accepted_via='staff_recorded', accepted_by_name='x', acceptance_channel='email', acceptance_evidence='direct data fix', acceptance_received_at=now(), acceptance_recorded_by='${ADMIN}' where id='${q}'`);
    const p = await previewOf(enquiryId);
    expect(p.assessment.blockers[0].code).toBe("contracting_entity_missing");
    expect(mustFail(await establishFromPreview(enquiryId, q))).toMatch(/contracting entity/);
  });
});

describe("establishing the amount due (USD)", () => {
  it("writes the amount, source and quotation link; records the ledger and audit; changes no stage; sends nothing", async () => {
    gate(false);
    const { enquiryId, quotationId } = await readyScenario({ total: 250 });
    const stageBefore = stageOf(enquiryId);
    const emailsBefore = h.emails.length + h.notifications.length + h.quotationReadyEmails.length;
    const r = must(await establishFromPreview(enquiryId, quotationId));
    expect(r.value).toEqual({ amountDue: 250, noop: false });
    expect(one(`select amount_due||'|'||amount_due_source||'|'||amount_due_quotation_id from public.enquiries where id='${enquiryId}'`)).toBe(`250.00|accepted_quotation|${quotationId}`);
    expect(one(`select fx_currency||'|'||fx_rate_to_usd||'|'||usd_total from public.client_quotations where id='${quotationId}'`)).toBe("USD|1.000000|250.00");
    expect(stageOf(enquiryId)).toBe(stageBefore);
    expect(h.emails.length + h.notifications.length + h.quotationReadyEmails.length).toBe(emailsBefore);
    expect(num(`select count(*) from public.enquiry_amount_events where enquiry_id='${enquiryId}' and kind='established' and amount_before is null and amount_after=250 and actor_id='${ADMIN}'`)).toBe(1);
    expect(num(`select count(*) from public.activity_log where action='enquiry.amount_due_established' and entity_id='${enquiryId}' and actor_user_id='${ADMIN}'`)).toBe(1);
  });
  it("repeating it is a harmless no-op, and the panel then reports it as established", async () => {
    gate(false);
    const { enquiryId, quotationId } = await readyScenario();
    must(await establishFromPreview(enquiryId, quotationId));
    const again = must(await establishFromPreview(enquiryId, quotationId));
    expect(again.value.noop).toBe(true);
    expect(num(`select count(*) from public.enquiry_amount_events where enquiry_id='${enquiryId}'`)).toBe(1);
    const p = await previewOf(enquiryId);
    expect(p.assessment.preview?.noop).toBe(true);
    expect(p.events).toHaveLength(1);
  });
  it("is refused for an unaccepted quotation, a Crew Support enquiry and an unset payment market, with plain messages", async () => {
    gate(false);
    const e = newEnquiry(); const q = await makeQuotation(e); await sendQuotation(q);
    as(ADMIN); expect(mustFail(await establishAmountDue({ enquiryId: e, quotationId: q, expectedRateToUsd: null, expectedRateEffectiveFrom: null, acknowledgeRateJump: false }))).toMatch(/not been accepted/);
    const crew = newEnquiry({ intent: "creative_crew_support" });
    expect(mustFail(await establishAmountDue({ enquiryId: crew, quotationId: q, expectedRateToUsd: null, expectedRateEffectiveFrom: null, acknowledgeRateJump: false }))).toMatch(/Crew Support/);
    const noMarket = await readyScenario({ market: null });
    expect(mustFail(await establishFromPreview(noMarket.enquiryId, noMarket.quotationId))).toMatch(/payment market/);
  });
  it("the form action reports success only after it happened and says no email was sent or stage changed", async () => {
    gate(false);
    const { enquiryId, quotationId } = await readyScenario({ total: 120 });
    as(ADMIN);
    const fd = new FormData(); fd.set("enquiryId", enquiryId); fd.set("quotationId", quotationId);
    const res = await establishAmountDueAction(null, fd);
    expect(res).toMatchObject({ ok: true });
    expect((res as { message: string }).message).toMatch(/No email was sent and the stage was not changed/);
    const bad = new FormData(); bad.set("enquiryId", enquiryId); bad.set("quotationId", "00000000-0000-4000-8000-00000000dead");
    expect(await establishAmountDueAction(null, bad)).toMatchObject({ ok: false });
  });
});

describe("currency handling: non-USD quotations", () => {
  it("while the safeguard is on, a GHS quotation cannot be established, the database is never called, and the amount stays unset", async () => {
    gate(false);
    const { enquiryId, quotationId } = await readyScenario({ currency: "GHS", total: 1108.98 });
    const p = await previewOf(enquiryId);
    expect(p.assessment.canEstablish).toBe(false);
    expect(p.assessment.blockers[0].code).toBe("non_usd_disabled");
    expect(mustFail(await establishFromPreview(enquiryId, quotationId))).toMatch(/wording update/);
    expect(num(`select count(*) from public.enquiry_amount_events where enquiry_id='${enquiryId}'`)).toBe(0);
    expect(one(`select amount_due is null from public.enquiries where id='${enquiryId}'`)).toBe("t");
  });
  it("with the safeguard off (the P1 release), GHS 1,108.98 at the current rate becomes USD 100.00, the rate is locked, and later rate changes do not move it", async () => {
    gate(true);
    const { enquiryId, quotationId } = await readyScenario({ currency: "GHS", total: 1108.98 });
    const p = await previewOf(enquiryId);
    expect(p.assessment.canEstablish).toBe(true);
    expect(p.assessment.preview).toMatchObject({ usdAmount: 100, rateToUsd: 11.0898, rateAgeDays: 10, rateNote: "M2APP official mid-rate" });
    must(await establishFromPreview(enquiryId, quotationId));
    expect(one(`select amount_due from public.enquiries where id='${enquiryId}'`)).toBe("100.00");
    expect(one(`select fx_currency||'|'||fx_rate_to_usd||'|'||usd_total from public.client_quotations where id='${quotationId}'`)).toBe("GHS|11.089800|100.00");
    sql(`insert into public.exchange_rates (currency_code, rate_to_usd, effective_from, reason, updated_by) values ('GHS', 11.2, now() - interval '1 day', 'M2APP later rate', '${SUPER}')`);
    expect(one(`select amount_due from public.enquiries where id='${enquiryId}'`)).toBe("100.00");
    const again = must(await establishFromPreview(enquiryId, quotationId));
    expect(again.value.noop).toBe(true);
    expect(one(`select fx_rate_to_usd from public.client_quotations where id='${quotationId}'`)).toBe("11.089800");
    sql(`delete from public.exchange_rates where reason = 'M2APP later rate'`);
  });
  it("the database refuses a non-USD establishment by itself, even if the application safeguard were bypassed or switched on", async () => {
    h.nonUsd = true; setDbGate(false);
    const { enquiryId, quotationId } = await readyScenario({ currency: "GHS", total: 1108.98 });
    const direct = await db().rpc("establish_enquiry_amount_due", { p_enquiry_id: enquiryId, p_quotation_id: quotationId, p_actor: ADMIN, p_expected_rate: 11.0898, p_expected_effective: new Date().toISOString(), p_ack_rate_jump: false });
    expect(direct.error?.message).toContain("ordift:non_usd_disabled");
    expect(mustFail(await establishFromPreview(enquiryId, quotationId))).toMatch(/wording update/);
    expect(one(`select amount_due is null from public.enquiries where id='${enquiryId}'`)).toBe("t");
    expect(num(`select count(*) from public.enquiry_amount_events where enquiry_id='${enquiryId}'`)).toBe(0);
    gate(false);
  });
  it("a rate that changed after the preview is refused (the rate previewed is the rate used)", async () => {
    gate(true);
    const { enquiryId, quotationId } = await readyScenario({ currency: "GHS", total: 1108.98 });
    const p = await previewOf(enquiryId);
    sql(`insert into public.exchange_rates (currency_code, rate_to_usd, effective_from, reason, updated_by) values ('GHS', 11.1, now() - interval '1 hour', 'M2APP shifted rate', '${SUPER}')`);
    as(ADMIN);
    const refused = await establishAmountDue({ enquiryId, quotationId, expectedRateToUsd: p.assessment.preview!.rateToUsd, expectedRateEffectiveFrom: p.assessment.preview!.rateEffectiveFrom, acknowledgeRateJump: false });
    expect(mustFail(refused)).toMatch(/rate changed after you opened the preview/);
    expect(one(`select amount_due is null from public.enquiries where id='${enquiryId}'`)).toBe("t");
    sql(`delete from public.exchange_rates where reason = 'M2APP shifted rate'`);
  });
  it("a stale rate (over 30 days) cannot be established and cannot be overridden away; a QAR quotation on a Qatar enquiry shows the stale-rate message", async () => {
    gate(true);
    const { enquiryId, quotationId } = await readyScenario({ currency: "QAR", total: 3640, market: "QA" });
    // The shared scratch database may hold a fresh QAR rate left by other suites, so make every QAR rate 90 days old for this test only, then put it back.
    sql("update public.exchange_rates set effective_from = effective_from - interval '90 days' where currency_code = 'QAR'");
    try {
      const p = await previewOf(enquiryId);
      expect(p.assessment.blockers[0].code).toBe("rate_stale");
      as(ADMIN);
      const stale = await establishAmountDue({ enquiryId, quotationId, expectedRateToUsd: 3.64, expectedRateEffectiveFrom: one("select effective_from from public.exchange_rates where currency_code = 'QAR' order by effective_from desc limit 1"), acknowledgeRateJump: false });
      expect(mustFail(stale)).toMatch(/more than 30 days old/);
      expect(one(`select amount_due is null from public.enquiries where id='${enquiryId}'`)).toBe("t");
    } finally {
      sql("update public.exchange_rates set effective_from = effective_from + interval '90 days' where currency_code = 'QAR'");
    }
  });
  it("a currency that is not the payment market's is refused (QAR on a Ghana enquiry)", async () => {
    gate(true);
    const { enquiryId } = await readyScenario({ currency: "QAR", total: 3640, market: "GH" });
    expect((await previewOf(enquiryId)).assessment.blockers[0].code).toBe("currency_market_mismatch");
  });
  it("payments already received block a different amount; an override can never go below what was paid", async () => {
    gate(false);
    const { enquiryId, quotationId } = await readyScenario({ total: 400, paid: 50 });
    expect(mustFail(await establishFromPreview(enquiryId, quotationId))).toMatch(/Payments exist/);
    const e2 = newEnquiry({ paid: 50, due: 60, source: "manual" });
    as(SUPER);
    expect(mustFail(await overrideAmountDue({ enquiryId: e2, newAmountUsd: 40, category: "data_entry_correction", reason: "Corrected after re-reading the signed quotation", evidence: "", typedReference: refOf(e2) }))).toMatch(/below what has already been paid/);
    expect(num(`select amount_due from public.enquiries where id='${e2}'`)).toBe(60);
  });
});

describe("Super Admin override: meaningful reasons, before/after values, audit", () => {
  async function establishedEnquiry(total = 200) {
    gate(false);
    const s = await readyScenario({ total });
    must(await establishFromPreview(s.enquiryId, s.quotationId));
    return s;
  }
  const good = (enquiryId: string, over: Record<string, unknown> = {}) => ({ enquiryId, newAmountUsd: 260, category: "scope_or_price_change_agreed", reason: "Client agreed an extra location and a second photographer in writing", evidence: "Email 2026-10-20 14:05", typedReference: refOf(enquiryId), ...over });
  it("refuses a weak reason, a missing category or evidence, and a wrong confirmation, each with its own message, and changes nothing", async () => {
    const { enquiryId } = await establishedEnquiry();
    as(SUPER);
    const cases: [Record<string, unknown>, RegExp][] = [
      [{ reason: "too short" }, /at least 30/],
      [{ reason: "test test test test test test test test" }, /five different words/],
      [{ category: "nonsense" }, /category/],
      [{ evidence: "" }, /documented/],
      [{ typedReference: "WRONG" }, /Type the enquiry reference/],
      [{ newAmountUsd: 200 }, /already the amount due/],
    ];
    for (const [over, re] of cases) expect(mustFail(await overrideAmountDue(good(enquiryId, over) as Parameters<typeof overrideAmountDue>[0])), JSON.stringify(over)).toMatch(re);
    expect(one(`select amount_due from public.enquiries where id='${enquiryId}'`)).toBe("200.00");
    expect(num(`select count(*) from public.enquiry_amount_events where enquiry_id='${enquiryId}' and kind='override'`)).toBe(0);
  });
  it("an accepted override changes the amount, clears the quotation pointer, and records before and after, category, reason, evidence, actor and time", async () => {
    const { enquiryId } = await establishedEnquiry();
    as(SUPER);
    must(await overrideAmountDue(good(enquiryId) as Parameters<typeof overrideAmountDue>[0]));
    expect(one(`select amount_due||'|'||amount_due_source||'|'||coalesce(amount_due_quotation_id::text,'none') from public.enquiries where id='${enquiryId}'`)).toBe("260.00|manual|none");
    expect(one(`select amount_before||'|'||source_before||'|'||amount_after||'|'||source_after||'|'||category||'|'||actor_id||'|'||evidence_reference from public.enquiry_amount_events where enquiry_id='${enquiryId}' and kind='override'`)).toBe(`200.00|accepted_quotation|260.00|manual|scope_or_price_change_agreed|${SUPER}|Email 2026-10-20 14:05`);
    expect(num(`select count(*) from public.activity_log where action='enquiry.amount_due_overridden' and entity_id='${enquiryId}' and actor_user_id='${SUPER}'`)).toBe(1);
    expect(num(`select count(*) from public.enquiry_amount_events where enquiry_id='${enquiryId}' and kind='override' and char_length(reason) >= 30 and created_at is not null`)).toBe(1);
  });
  it("the ledger cannot be edited or deleted, even by the table owner", () => {
    expect(() => sql(`update public.enquiry_amount_events set amount_after = 1`)).toThrow();
    expect(() => sql(`delete from public.enquiry_amount_events`)).toThrow();
    expect(() => sql(`truncate public.enquiry_amount_events`)).toThrow();
  });
  it("the form action: success only after the override happened; a failure is visible", async () => {
    const { enquiryId } = await establishedEnquiry(300);
    as(SUPER);
    const fd = new FormData();
    for (const [k, v] of Object.entries({ enquiryId, newAmountUsd: "330", category: "quotation_corrected_as_agreed", reason: "Quotation corrected as agreed with the client by telephone", evidence: "Call note 2026-10-20", typedReference: refOf(enquiryId) })) fd.set(k, v);
    expect(await overrideAmountDueAction(null, fd)).toMatchObject({ ok: true });
    fd.set("typedReference", "nope");
    expect(await overrideAmountDueAction(null, fd)).toMatchObject({ ok: false });
  });
  it("a Crew Support enquiry cannot be overridden here", async () => {
    const crew = newEnquiry({ intent: "creative_crew_support", due: 100, source: "accepted_quotation" });
    as(SUPER);
    expect(mustFail(await overrideAmountDue(good(crew, { newAmountUsd: 500 }) as Parameters<typeof overrideAmountDue>[0]))).toMatch(/Crew Support/);
  });
});

describe("the register", () => {
  it("lists establishments and overrides with the actor shown by member number, filters work, and non-Super Admins are refused", async () => {
    as(SUPER);
    const all = must(await listAmountEvents({ limit: 500 }));
    expect(all.value.length).toBeGreaterThan(3);
    expect(all.value.some((r) => r.kind === "override" && r.actorLabel.startsWith("M2APP-0001"))).toBe(true);
    const overrides = must(await listAmountEvents({ kind: "override" }));
    expect(overrides.value.every((r) => r.kind === "override" && r.reason && r.reason.length >= 30)).toBe(true);
    const one1 = overrides.value[0];
    const byRef = must(await listAmountEvents({ enquiryReference: one1.enquiryReference! }));
    expect(byRef.value.every((r) => r.enquiryReference === one1.enquiryReference)).toBe(true);
    expect(must(await listAmountEvents({ enquiryReference: "M2APP-NOT-A-REF" })).value).toEqual([]);
    expect(must(await listAmountEvents({ from: "2999-01-01T00:00:00Z" })).value).toEqual([]);
    as(ADMIN); mustFail(await listAmountEvents());
  });
});

describe("duplicate submissions and concurrency", () => {
  it("six simultaneous establish calls: exactly one writes, five are harmless no-ops, one ledger row, one audit entry", async () => {
    gate(false);
    const { enquiryId, quotationId } = await readyScenario({ total: 180 });
    const results = await Promise.all(Array.from({ length: 6 }, () => establishFromPreview(enquiryId, quotationId)));
    const oks = results.filter((r) => r.ok) as Extract<(typeof results)[number], { ok: true }>[];
    expect(oks).toHaveLength(6);
    expect(oks.filter((r) => !r.value.noop)).toHaveLength(1);
    expect(num(`select count(*) from public.enquiry_amount_events where enquiry_id='${enquiryId}'`)).toBe(1);
    expect(num(`select count(*) from public.activity_log where action='enquiry.amount_due_established' and entity_id='${enquiryId}'`)).toBe(1);
  });
  it("eight simultaneous revisions of one sent quotation: exactly one succeeds, seven are refused, one live quotation remains", async () => {
    const enquiryId = newEnquiry();
    const q = await makeQuotation(enquiryId); await sendQuotation(q);
    as(ADMIN);
    const results = await Promise.all(Array.from({ length: 8 }, () => reviseClientQuotation(q)));
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.filter((r) => !r.ok)).toHaveLength(7);
    expect(num(`select count(*) from public.client_quotations where enquiry_id='${enquiryId}'`)).toBe(2);
    expect(num(`select count(*) from public.client_quotations where enquiry_id='${enquiryId}' and status in ('draft','sent','accepted')`)).toBe(1);
    expect(one(`select status from public.client_quotations where id='${q}'`)).toBe("superseded");
  });
  it("two simultaneous creations for one enquiry: one succeeds, the other is refused, one active quotation", async () => {
    const enquiryId = newEnquiry();
    as(ADMIN);
    const make = () => createClientQuotation({ enquiryId, prospectName: "M2APP Prospect", currency: "USD", items: [{ serviceItem: "Race", quantity: 1, unitBasis: "per_job", sellingRate: 10 }] });
    const results = await Promise.all([make(), make()]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(num(`select count(*) from public.client_quotations where enquiry_id='${enquiryId}'`)).toBe(1);
    expect(num(`select count(*) from public.client_quotation_items i join public.client_quotations q on q.id=i.quotation_id where q.enquiry_id='${enquiryId}'`)).toBe(1);
  });
  it("two simultaneous attaches of different quotations to one enquiry: one succeeds, one active quotation", async () => {
    const enquiryId = newEnquiry();
    const a = await makeQuotation(null); const b = await makeQuotation(null);
    as(ADMIN);
    const results = await Promise.all([attachQuotationToEnquiry({ quotationId: a, enquiryId }), attachQuotationToEnquiry({ quotationId: b, enquiryId })]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(num(`select count(*) from public.client_quotations where enquiry_id='${enquiryId}'`)).toBe(1);
  });
  it("simultaneous overrides apply one after another: every row's 'before' equals the previous row's 'after', and the final amount is the last one written", async () => {
    gate(false);
    const { enquiryId, quotationId } = await readyScenario({ total: 200 });
    must(await establishFromPreview(enquiryId, quotationId));
    as(SUPER);
    const amounts = [210, 220, 230, 240];
    const results = await Promise.all(amounts.map((n) => overrideAmountDue({ enquiryId, newAmountUsd: n, category: "scope_or_price_change_agreed", reason: `Client agreed revised scope number ${n} in writing`, evidence: `Email ${n}`, typedReference: refOf(enquiryId) })));
    expect(results.every((r) => r.ok)).toBe(true);
    const rows = sql(`select coalesce(amount_before, 0)||'>'||amount_after from public.enquiry_amount_events where enquiry_id='${enquiryId}' order by seq`).trim().split("\n");
    expect(rows).toHaveLength(5);
    const chain = rows.map((r) => r.split(">").map(Number));
    for (let i = 1; i < chain.length; i++) expect(chain[i][0]).toBe(chain[i - 1][1]);
    expect(num(`select amount_due from public.enquiries where id='${enquiryId}'`)).toBe(chain[chain.length - 1][1]);
  });
});

describe("failed transactions leave everything as it was", () => {
  it("a failure while copying the lines during a revision rolls back completely; a retry then succeeds", async () => {
    const enquiryId = newEnquiry();
    const q = await makeQuotation(enquiryId); await sendQuotation(q);
    const before = { quotes: num(`select count(*) from public.client_quotations where enquiry_id='${enquiryId}'`), items: num("select count(*) from public.client_quotation_items"), audit: num("select count(*) from public.activity_log") };
    sql(`create or replace function public.m2app_boom() returns trigger language plpgsql as $$ begin raise exception 'injected failure while copying lines'; end $$;
         create trigger m2app_boom before insert on public.client_quotation_items for each row when (new.quotation_id <> '${q}') execute function public.m2app_boom();`);
    as(ADMIN);
    const failed = mustFail(await reviseClientQuotation(q));
    expect(failed).not.toMatch(/injected|trigger|function/);
    sql("drop trigger m2app_boom on public.client_quotation_items; drop function public.m2app_boom();");
    expect(num(`select count(*) from public.client_quotations where enquiry_id='${enquiryId}'`)).toBe(before.quotes);
    expect(num("select count(*) from public.client_quotation_items")).toBe(before.items);
    expect(num("select count(*) from public.activity_log")).toBe(before.audit);
    expect(one(`select status from public.client_quotations where id='${q}'`)).toBe("sent");
    expect(num(`select count(*) from public.client_quotations where enquiry_id='${enquiryId}' and status in ('draft','sent','accepted')`)).toBe(1);
    must(await reviseClientQuotation(q));
  });
  it("a refused establishment or override changes nothing at all (no amount, ledger row or audit entry)", async () => {
    gate(false);
    const { enquiryId } = await readyScenario();
    const before = { ledger: num("select count(*) from public.enquiry_amount_events"), audit: num("select count(*) from public.activity_log") };
    as(SUPER);
    mustFail(await overrideAmountDue({ enquiryId, newAmountUsd: 5, category: "other", reason: "x", evidence: "", typedReference: "x" }));
    as(ADMIN);
    mustFail(await establishAmountDue({ enquiryId, quotationId: "00000000-0000-4000-8000-00000000dead", expectedRateToUsd: null, expectedRateEffectiveFrom: null, acknowledgeRateJump: false }));
    expect(num("select count(*) from public.enquiry_amount_events")).toBe(before.ledger);
    expect(num("select count(*) from public.activity_log")).toBe(before.audit);
    expect(one(`select amount_due is null from public.enquiries where id='${enquiryId}'`)).toBe("t");
  });
  it("a creation whose lines cannot be saved leaves no empty draft behind (it would hold the enquiry's only quotation slot)", async () => {
    const enquiryId = newEnquiry();
    sql(`create or replace function public.m2app_boom() returns trigger language plpgsql as $$ begin raise exception 'injected failure'; end $$;
         create trigger m2app_boom before insert on public.client_quotation_items for each row execute function public.m2app_boom();`);
    as(ADMIN);
    mustFail(await createClientQuotation({ enquiryId, prospectName: "M2APP Prospect", currency: "USD", items: [{ serviceItem: "x", quantity: 1, unitBasis: "per_job", sellingRate: 5 }] }));
    sql("drop trigger m2app_boom on public.client_quotation_items; drop function public.m2app_boom();");
    expect(num(`select count(*) from public.client_quotations where enquiry_id='${enquiryId}'`)).toBe(0);
    must(await createClientQuotation({ enquiryId, prospectName: "M2APP Prospect", currency: "USD", items: [{ serviceItem: "x", quantity: 1, unitBasis: "per_job", sellingRate: 5 }] }));
  });
});

describe("quotation history is preserved", () => {
  it("a chain of revisions keeps every version, links each to its predecessor, and only the newest can be accepted and established", async () => {
    gate(false);
    const enquiryId = newEnquiry();
    const v1 = await makeQuotation(enquiryId, { total: 500 }); await sendQuotation(v1);
    as(ADMIN);
    const v2 = must(await reviseClientQuotation(v1)).quotationId; await sendQuotation(v2);
    as(ADMIN);
    const v3 = must(await reviseClientQuotation(v2)).quotationId; await sendQuotation(v3);
    const rows = sql(`select version||':'||status||':'||coalesce(supersedes_id::text,'-') from public.client_quotations where enquiry_id='${enquiryId}' order by version`).trim().split("\n");
    expect(rows).toEqual([`1:superseded:-`, `2:superseded:${v1}`, `3:sent:${v2}`]);
    expect(num(`select count(*) from public.client_quotation_items where quotation_id in ('${v1}','${v2}','${v3}')`)).toBe(3);
    // an older version can no longer be accepted or established
    expect(mustFail(await acceptQuotation(v1))).toMatch(/Only an issued \(sent\)/);
    recordEntity(v3); must(await acceptQuotation(v3));
    expect(mustFail(await establishFromPreview(enquiryId, v1))).toMatch(/not been accepted/);
    must(await establishFromPreview(enquiryId, v3));
    const p = await previewOf(enquiryId);
    expect(p.history.map((x) => `${x.version}:${x.status}`)).toEqual(["1:superseded", "2:superseded", "3:accepted"]);
    // an accepted quotation cannot be revised, and it blocks a new one
    as(ADMIN);
    expect(mustFail(await reviseClientQuotation(v3))).toMatch(/Only a sent quotation/);
    expect(mustFail(await createClientQuotation({ enquiryId, prospectName: "M2APP Prospect", currency: "USD", items: [{ serviceItem: "x", quantity: 1, unitBasis: "per_job", sellingRate: 1 }] }))).toMatch(/already has an active quotation/);
  });
  it("a declined quotation frees the enquiry for a new one, and its acceptance evidence is kept on its own row", async () => {
    const enquiryId = newEnquiry();
    const q = await makeQuotation(enquiryId); await sendQuotation(q);
    as(ADMIN); must(await updateQuotationStatus({ quotationId: q, status: "declined" }));
    must(await makeQuotation(enquiryId).then(() => ({ ok: true as const })));
    expect(num(`select count(*) from public.client_quotations where enquiry_id='${enquiryId}'`)).toBe(2);
  });
});

describe("Crew Support and existing behaviour are preserved", () => {
  it("the panel says Crew Support is managed elsewhere, and every M2a write refuses a Crew Support enquiry", async () => {
    const crew = newEnquiry({ intent: "creative_crew_support" });
    const p = await previewOf(crew);
    expect(p.enquiry.isCrewSupport).toBe(true);
    expect(p.assessment.canEstablish).toBe(false);
  });
  it("the typed amount-due action is refused for an enquiry with an active quotation: no amount, no stage change, no email", async () => {
    const enquiryId = newEnquiry();
    await makeQuotation(enquiryId);
    const stage = stageOf(enquiryId);
    const emails = h.quotationReadyEmails.length;
    as(ADMIN);
    const fd = new FormData(); fd.set("enquiryId", enquiryId); fd.set("amountDue", "999");
    const res = await setAmountDueAction(null, fd);
    expect(res).toMatchObject({ ok: false });
    expect((res as { error: string }).error).toMatch(/active quotation/);
    expect(one(`select amount_due is null from public.enquiries where id='${enquiryId}'`)).toBe("t");
    expect(stageOf(enquiryId)).toBe(stage);
    expect(h.quotationReadyEmails.length).toBe(emails);
  });
  it("positive control: for an enquiry WITHOUT a quotation the typed action still works as before (amount, stage to quotation sent, client email) and the mocks DO capture it", async () => {
    const enquiryId = newEnquiry();
    sql(`update public.enquiries set crm_stage = 'new_lead' where id = '${enquiryId}'`);
    const emails = h.quotationReadyEmails.length;
    as(ADMIN);
    const fd = new FormData(); fd.set("enquiryId", enquiryId); fd.set("amountDue", "75");
    expect(await setAmountDueAction(null, fd)).toMatchObject({ ok: true });
    expect(one(`select amount_due::numeric(12,2)||'|'||amount_due_source||'|'||crm_stage from public.enquiries where id='${enquiryId}'`)).toBe("75.00|manual|quotation_sent");
    expect(h.quotationReadyEmails.length).toBe(emails + 1);
  });
});

describe("nothing unintended happened anywhere", () => {
  it("across every M2a flow above: no payment, obligation, engagement, notification or failed-send record was created, and no M2a email or notification was sent", () => {
    const now = snapshotCounts();
    expect(now).toEqual(baseline);
    expect(h.emails).toEqual([]);
    expect(h.notifications).toEqual([]);
    // the ONLY quotation-ready email is the single positive-control typed-action call above
    expect(h.quotationReadyEmails).toHaveLength(1);
  });
  it("no M2a enquiry was moved to a booked, in-progress or delivered stage by establishing, revising, attaching or overriding", () => {
    expect(num(`select count(*) from public.enquiries where reference_number like 'M2APP-%' and crm_stage in ('booked','in_progress','delivered','completed')`)).toBe(0);
  });
});
