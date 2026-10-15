// @vitest-environment node
//
// Contracting-entity selection (migration 0159): which legal entity contracts for a booking is chosen explicitly and recorded; it is never
// inferred from the client's location or currency; an entity that is not eligible cannot be chosen; a historical booking is never assigned
// or reassigned; and recording a choice changes nothing else. SYNTHETIC data only, throwaway local database.
import { beforeAll, describe, expect, it, vi } from "vitest";
import { execSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";

const h = vi.hoisted(() => ({
  agent: null as unknown,
  fetch: async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const undici = await import("undici");
    (h as { agent: unknown }).agent ??= new undici.Agent({ keepAliveTimeout: 1, keepAliveMaxTimeout: 1 });
    return (await undici.fetch(String(input).replace("/rest/v1", ""), { ...(init as object), dispatcher: (h as { agent: unknown }).agent as import("undici").Dispatcher })) as unknown as Response;
  },
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/admin/activityLog", () => ({ logActivity: vi.fn(async () => undefined) }));
vi.mock("@/lib/supabase/admin", async () => {
  const { createClient: make } = await import("@supabase/supabase-js");
  return { createAdminClient: () => make(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: h.fetch } }) };
});

import { bookingIsHistorical, chooseContractingEntity, getContractingEntity, listContractingCandidates } from "./entityRegistrations";
import { assessContractingEligibility, suggestContractingEntity } from "./entityRegistry";

if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:|\/|$)/.test(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "")) throw new Error("Refusing to run: this E2E may only target a localhost database.");

const SUPER = "00000000-0000-4000-8000-0000000000e1";
const STAFF = "00000000-0000-4000-8000-0000000000e2";
const CLIENT = "00000000-0000-4000-8000-0000000000e3";
const db = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false }, global: { fetch: h.fetch } });
const sql = (q: string) => execSync("docker exec -i ordift-mig-check2 psql -U postgres -h 127.0.0.1 -v ON_ERROR_STOP=1 -At", { input: q }).toString();
const pgFails = (q: string) => { try { sql(q); return ""; } catch (e) { return String((e as { stderr?: Buffer }).stderr ?? e); } };
const must = <T extends { ok: boolean }>(r: T, label = ""): Extract<T, { ok: true }> => { if (!r.ok) throw new Error(`${label} expected ok, got ${JSON.stringify(r)}`); return r as Extract<T, { ok: true }>; };
const mustFail = <T extends { ok: boolean }>(r: T): string => { expect(r.ok).toBe(false); return (r as unknown as { error?: string }).error ?? ""; };
const TODAY = "2026-10-20";

const E = {} as { gh: string; qa: string };
let counter = 0;
async function newRequest(service = "photography") {
  const ref = `CSR-2026-X${Date.now().toString().slice(-8)}${++counter}`;
  const titleId = sql("select id from public.operational_titles limit 1").trim();
  const { data, error } = await db().rpc("create_crew_support_request", {
    p_request: { user_id: CLIENT, reference_number: ref, requester_type: "photographer", requester_name: "Test Client", requester_email: `${ref}@example.com`, requester_phone: "+000", service_family: service, project_name: `Job ${ref}`, project_type: "Wedding", start_date: "2026-12-12", end_date: "2026-12-12", call_time: "10:00", finish_time: "21:00", location: "Doha", on_site_contact: "A", urgency: "standard", service_details: { equipment: "requester_supplies" }, consent_accepted_at: new Date().toISOString(), submitted_at: new Date().toISOString() },
    p_requirements: [{ operational_title_id: titleId, role_label: "Photographer", quantity: 1, responsibilities: "Coverage" }],
  });
  if (error) throw new Error(error.message);
  return (data as { request_id: string; enquiry_id: string });
}
const fingerprint = () => sql("select md5(coalesce((select string_agg(t::text,'|' order by id) from public.client_quotations t),'')||coalesce((select string_agg(t::text,'|' order by id) from public.payments t),'')||coalesce((select string_agg(t::text,'|' order by id) from public.enquiries t),'')||coalesce((select string_agg(t::text,'|' order by id) from public.payment_obligations t),'')||coalesce((select string_agg(t::text,'|' order by id) from public.crew_support_requests t),''))").trim();

beforeAll(() => {
  sql(`
    insert into auth.users (id, email) values ('${SUPER}','s@e2e.test'), ('${STAFF}','t@e2e.test'), ('${CLIENT}','c@e2e.test') on conflict do nothing;
    insert into public.profiles (id, full_name, access_status) values ('${SUPER}','Super','active'), ('${STAFF}','Staff','active'), ('${CLIENT}','Client','active') on conflict (id) do update set access_status = 'active';
    insert into public.user_roles (user_id, role_id) select '${SUPER}', r.id from public.roles r where r.slug in ('admin','super_admin') on conflict do nothing;
    insert into public.user_roles (user_id, role_id) select '${STAFF}', r.id from public.roles r where r.slug = 'staff' on conflict do nothing;
    insert into public.user_roles (user_id, role_id) select '${CLIENT}', r.id from public.roles r where r.slug = 'client' on conflict do nothing;
    insert into public.employment_jurisdictions (name, slug, sort_order) select 'Qatar', 'qatar', 20 where not exists (select 1 from public.employment_jurisdictions where slug = 'qatar');
    insert into public.employing_entities (name, slug, sort_order, legal_name, jurisdiction_id, verification_status, employer_capable, default_currency)
      select 'Test Qatar Entity', 'test-qatar-entity', 20, 'TEST QATAR', (select id from public.employment_jurisdictions where slug = 'qatar'), 'verified', false, 'QAR' where not exists (select 1 from public.employing_entities where slug = 'test-qatar-entity');
    insert into public.entity_registrations (employing_entity_id, kind, status, identifier, issued_on, expires_on, facts, recorded_by)
      select e.id, 'commercial_registration', 'active', 'TEST-CR', date '2026-10-15', date '2027-10-15', '{"activities":[{"code":"742010","name":"Photographic activities"}]}'::jsonb, '${SUPER}' from public.employing_entities e where e.slug = 'test-qatar-entity';
    insert into public.entity_registrations (employing_entity_id, kind, status, recorded_by) select e.id, 'commercial_permit', 'not_issued', '${SUPER}' from public.employing_entities e where e.slug = 'test-qatar-entity';
  `);
  E.gh = sql("select id from public.employing_entities where slug = 'ordift-studios'").trim();
  E.qa = sql("select id from public.employing_entities where slug = 'test-qatar-entity'").trim();
});

describe("A — pure eligibility: verified, registered, permitted where a permit is tracked, and only for covered activities", () => {
  const reg = (kind: string, status: string, identifier: string | null, extra: object = {}) => ({ id: kind, kind, status, identifier, issuedOn: "2026-10-15", expiresOn: null, facts: {}, note: null, verifiedAt: null, ...extra }) as never;
  const CR = reg("commercial_registration", "active", "X", { expiresOn: "2027-10-15", facts: { activities: [{ code: "742010" }] } });
  it("A1 an entity with no registry records (Ghana today) needs only to be verified and active", () => {
    expect(assessContractingEligibility({ entityId: "g", name: "G", verified: true, active: true, registrations: [] }, "photography", TODAY).eligible).toBe(true);
    expect(assessContractingEligibility({ entityId: "g", name: "G", verified: false, active: true, registrations: [] }, null, TODAY).blockers.join(" ")).toMatch(/not been verified/);
  });
  it("A2 an entity tracking a permit cannot contract until it is issued, and an expired registration blocks too", () => {
    const base = { entityId: "q", name: "Q", verified: true, active: true };
    expect(assessContractingEligibility({ ...base, registrations: [CR, reg("commercial_permit", "not_issued", null)] }, "photography", TODAY).blockers.join(" ")).toMatch(/permit has not been issued/);
    expect(assessContractingEligibility({ ...base, registrations: [CR, reg("commercial_permit", "active", "P-1")] }, "photography", TODAY).eligible).toBe(true);
    expect(assessContractingEligibility({ ...base, registrations: [CR, reg("commercial_permit", "active", "P-1")] }, "photography", "2027-10-16").blockers.join(" ")).toMatch(/unexpired commercial registration/);
  });
  it("A3 only photography is covered by the recorded activity; other service families are blocked", () => {
    const q = { entityId: "q", name: "Q", verified: true, active: true, registrations: [CR, reg("commercial_permit", "active", "P-1")] };
    expect(assessContractingEligibility(q, "videography", TODAY).blockers.join(" ")).toMatch(/not covered/);
  });
  it("A4 a default is offered only when exactly one entity is eligible — never two, never by location or currency", () => {
    const ok = { eligible: true, blockers: [] }; const no = { eligible: false, blockers: ["x"] };
    expect(suggestContractingEntity([{ entityId: "a", eligibility: ok }, { entityId: "b", eligibility: no }])?.entityId).toBe("a");
    expect(suggestContractingEntity([{ entityId: "a", eligibility: ok }, { entityId: "b", eligibility: ok }])).toBeNull();
    expect(suggestContractingEntity([{ entityId: "a", eligibility: no }])).toBeNull();
  });
});

describe("B — choosing the entity for a NEW booking", () => {
  const r = {} as { id: string; enquiryId: string };
  it("B1 with the Qatar permit not issued, only the Ghana entity is eligible and is the (confirm-me) suggestion", async () => {
    const { candidates, suggestion } = await listContractingCandidates(SUPER, "photography", TODAY);
    const gh = candidates.find((c) => c.entityId === E.gh)!; const qa = candidates.find((c) => c.entityId === E.qa)!;
    expect(gh.eligibility.eligible).toBe(true);
    expect(qa.eligibility.eligible).toBe(false);
    expect(qa.eligibility.blockers.join(" ")).toMatch(/permit has not been issued/);
    expect(suggestion?.entityId).toBe(E.gh);
    expect(await listContractingCandidates(STAFF, "photography", TODAY)).toEqual({ candidates: [], suggestion: null });
    const n = await newRequest(); r.id = n.request_id; r.enquiryId = n.enquiry_id;
  });
  it("B2 nothing is recorded by default: a new booking has no entity until one is chosen, however it was priced", async () => {
    expect(await getContractingEntity({ type: "crew_support_request", id: r.id }, SUPER)).toBeNull();
    expect(sql("select count(*) from public.booking_contracting_entities").trim()).toBe("0");
  });
  it("B3 an ineligible entity, a thin reason and a non-Super-Admin are refused with nothing recorded", async () => {
    expect(mustFail(await chooseContractingEntity({ subject: { type: "crew_support_request", id: r.id }, entityId: E.qa, basis: "Qatar job", actorUserId: SUPER, today: TODAY }))).toMatch(/cannot contract.*permit has not been issued/);
    expect(mustFail(await chooseContractingEntity({ subject: { type: "crew_support_request", id: r.id }, entityId: E.gh, basis: "x", actorUserId: SUPER, today: TODAY }))).toMatch(/Say why/);
    expect(mustFail(await chooseContractingEntity({ subject: { type: "crew_support_request", id: r.id }, entityId: E.gh, basis: "Ghana entity contracts", actorUserId: STAFF, today: TODAY }))).toMatch(/Super Admin/);
    expect(mustFail(await chooseContractingEntity({ subject: { type: "crew_support_request", id: r.id }, entityId: "00000000-0000-4000-8000-000000000999", basis: "Whatever entity", actorUserId: SUPER, today: TODAY }))).toMatch(/not found/);
    expect(sql("select count(*) from public.booking_contracting_entities").trim()).toBe("0");
  });
  it("B4 choosing the Ghana entity records version 1 and changes NOTHING else (quotations, payments, enquiries, payables, requests)", async () => {
    const before = fingerprint();
    expect(must(await chooseContractingEntity({ subject: { type: "crew_support_request", id: r.id }, entityId: E.gh, basis: "Ghana entity contracts for this booking", actorUserId: SUPER, today: TODAY }))).toMatchObject({ version: 1 });
    expect(fingerprint()).toBe(before);
    expect(await getContractingEntity({ type: "crew_support_request", id: r.id }, SUPER)).toMatchObject({ version: 1, entityId: E.gh, basis: "Ghana entity contracts for this booking" });
    expect(mustFail(await chooseContractingEntity({ subject: { type: "crew_support_request", id: r.id }, entityId: E.gh, basis: "Ghana entity contracts again", actorUserId: SUPER, today: TODAY }))).toMatch(/already recorded/);
  });
  it("B5 once the Qatar permit is issued (and only then) Qatar becomes selectable; a change is a new version that names what it supersedes", async () => {
    sql(`update public.entity_registrations set status = 'superseded' where employing_entity_id = '${E.qa}' and kind = 'commercial_permit' and status = 'not_issued';
         insert into public.entity_registrations (employing_entity_id, kind, status, identifier, issued_on, facts, recorded_by) values ('${E.qa}','commercial_permit','active','TEST-PERMIT', date '2026-12-01','{}'::jsonb,'${SUPER}')`);
    const c = await listContractingCandidates(SUPER, "photography", "2026-12-02");
    expect(c.candidates.filter((x) => x.eligibility.eligible).map((x) => x.entityId).sort()).toEqual([E.gh, E.qa].sort());
    expect(c.suggestion).toBeNull();                                      // two eligible: no default
    expect(must(await chooseContractingEntity({ subject: { type: "crew_support_request", id: r.id }, entityId: E.qa, basis: "Booking is contracted by the Qatar entity", actorUserId: SUPER, today: "2026-12-02" }))).toMatchObject({ version: 2 });
    expect(await getContractingEntity({ type: "crew_support_request", id: r.id }, SUPER)).toMatchObject({ version: 2, entityId: E.qa });
    const rows = sql(`select version, (supersedes_id is not null) from public.booking_contracting_entities where subject_id = '${r.id}' order by version`).trim().split("\n");
    expect(rows).toEqual(["1|f", "2|t"]);
    expect(mustFail(await chooseContractingEntity({ subject: { type: "crew_support_request", id: r.id }, entityId: E.qa, basis: "Qatar for videography", actorUserId: SUPER, today: "2026-12-02" }))).toMatch(/already recorded/);
  });
  it("B6 a service the Qatar registration does not cover is blocked even with a permit", async () => {
    const v = await newRequest("videography");
    expect(mustFail(await chooseContractingEntity({ subject: { type: "crew_support_request", id: v.request_id }, entityId: E.qa, basis: "Qatar entity for video", actorUserId: SUPER, today: "2026-12-02" }))).toMatch(/not covered/);
  });
  it("B7 the record is append-only in the database: no edit, no delete", () => {
    expect(pgFails("update public.booking_contracting_entities set basis = 'changed afterwards'")).toMatch(/append-only/);
    expect(pgFails("delete from public.booking_contracting_entities")).toMatch(/append-only|permission denied/);
  });
});

describe("C — a historical booking is never assigned or reassigned", () => {
  it("C1 a booking with an accepted quotation is refused (Bright-shaped), whichever entity is asked for", async () => {
    const n = await newRequest();
    sql(`insert into public.client_quotations (quotation_reference, currency, created_by, crew_support_request_id, status, client_profile_id) values ('QUO-HIST-1','QAR','${SUPER}','${n.request_id}','accepted','${CLIENT}')`);
    expect(await bookingIsHistorical(n.request_id)).toBe(true);
    const before = fingerprint();
    expect(mustFail(await chooseContractingEntity({ subject: { type: "crew_support_request", id: n.request_id }, entityId: E.gh, basis: "Ghana entity contracts", actorUserId: SUPER, today: TODAY }))).toMatch(/historical/);
    expect(mustFail(await chooseContractingEntity({ subject: { type: "crew_support_request", id: n.request_id }, entityId: E.qa, basis: "Qatar entity contracts", actorUserId: SUPER, today: "2026-12-02" }))).toMatch(/historical/);
    expect(await getContractingEntity({ type: "crew_support_request", id: n.request_id }, SUPER)).toBeNull();
    expect(fingerprint()).toBe(before);
  });
  it("C2 a booking that has been paid is refused too", async () => {
    const n = await newRequest();
    sql(`update public.enquiries set amount_due = 100, amount_paid = 100 where id = '${n.enquiry_id}'`);
    expect(await bookingIsHistorical(n.request_id)).toBe(true);
    expect(mustFail(await chooseContractingEntity({ subject: { type: "crew_support_request", id: n.request_id }, entityId: E.gh, basis: "Ghana entity contracts", actorUserId: SUPER, today: TODAY }))).toMatch(/historical/);
  });
  it("C3 a fresh booking is not historical", async () => {
    expect(await bookingIsHistorical((await newRequest()).request_id)).toBe(false);
  });
});
