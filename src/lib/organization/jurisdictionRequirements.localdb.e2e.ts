// @vitest-environment node
//
// JURISDICTION-AWARE entity requirements (migration 0173) on the REAL schema (throwaway local Postgres + PostgREST). SYNTHETIC data only.
// Run: supabase/proposals/e2e_scratch.sh, then E2E_SUPABASE_URL=http://127.0.0.1:54997 npx vitest run --config vitest.localdb.config.ts src/lib/organization/jurisdictionRequirements.localdb.e2e.ts
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

import { createClientQuotation } from "@/lib/commercial/clientQuotations";
import { chooseContractingEntity, getContractingEntityStanding, listOrdinaryContractingCandidates, setEntityActivity } from "./entityRegistrations";
import { issueOrdinaryQuotation } from "@/lib/commercial/quotationIssuance";
import { readIssuedLegalDetails } from "@/lib/commercial/quotationIssuedDetails";
import { resolveQuotationEntityView } from "@/lib/commercial/quotationEntity";
import { createAdminClient } from "@/lib/supabase/admin";

const sql = (q: string) => execSync("docker exec -i ordift-mig-check2 psql -U supabase_admin -h 127.0.0.1 -d p4_e2e -X -q -At -v ON_ERROR_STOP=1", { input: q }).toString().trim();
const psqlErr = (q: string): string => { try { sql(q); return ""; } catch (e) { return String((e as { stderr?: Buffer }).stderr ?? e); } };
const U = (n: number) => `00000000-0000-4000-8000-0000000000${n.toString(16).padStart(2, "0")}`;
const user = (n: number, roles: string[]) => ({ id: U(n), email: `u${n}@e2e.test`, fullName: `User ${n}`, roles, accessStatus: "active" });
const admin = user(0xc2, ["admin"]);
const TODAY = new Date().toISOString().slice(0, 10);
const DAYS = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);
const eid = (slug: string) => sql(`select id from public.employing_entities where slug='${slug}'`);
const jid = (slug: string) => `(select id from public.employment_jurisdictions where slug='${slug}')`;

// ---- fixtures (all SYNTHETIC: no real number, name or document) -------------------------------------------------------------------------------------------------------------
type EntOpts = { legal?: string; type?: string | null; verified?: boolean; active?: boolean };
function mkEntity(slug: string, jurisdiction: string | null, o: EntOpts = {}) {
  sql(`insert into public.employing_entities (name, slug, legal_name, registration_type, verification_status, active, jurisdiction_id) values ('${slug}','${slug}','${o.legal ?? slug.toUpperCase()}', ${o.type === null ? "null" : `'${o.type ?? "Registered Business Name"}'`}, '${o.verified === false ? "unverified" : "verified"}', ${o.active === false ? "false" : "true"}, ${jurisdiction ? jid(jurisdiction) : "null"})`);
  return eid(slug);
}
type RegOpts = { status?: string; identifier?: string | null; expires?: string | null; verified?: boolean; activityKey?: string };
function addReg(slug: string, kind: string, o: RegOpts = {}) {
  const status = o.status ?? "active";
  const ident = status === "pending" || status === "not_issued" ? null : o.identifier === undefined ? `${kind.toUpperCase()}-${slug}` : o.identifier;
  const verified = o.verified !== false && status !== "not_issued" && status !== "pending";
  return sql(`insert into public.entity_registrations (employing_entity_id, kind, status, identifier, issued_on, expires_on, facts, verified_at, verified_by, recorded_by)
    select id, '${kind}', '${status}', ${ident === null ? "null" : `'${ident}'`}, current_date - 300, ${o.expires ? `'${o.expires}'` : "null"}, ${o.activityKey ? `'{"activityKey":"${o.activityKey}"}'::jsonb` : "'{}'::jsonb"},
      ${verified ? "now()" : "null"}, ${verified ? `'${U(0xc3)}'` : "null"}, '${U(0xc3)}' from public.employing_entities where slug='${slug}' returning id`);
}
const addSignatory = (slug: string, from = "2018-05-07", to: string | null = null) =>
  sql(`insert into public.entity_signatories (employing_entity_id, full_name, position, authority, effective_from, effective_to, recorded_by) select id, 'Synthetic Signatory', 'Proprietor', 'Full authority', '${from}', ${to ? `'${to}'` : "null"}, '${U(0xc3)}' from public.employing_entities where slug='${slug}'`);
const ghanaComplete = (slug: string) => { const id = mkEntity(slug, "ghana"); addReg(slug, "commercial_registration", { identifier: `BN-${slug}` }); addReg(slug, "tax_registration", { identifier: `TIN-${slug}` }); addSignatory(slug); return id; };
const qatarBase = (slug: string) => { const id = mkEntity(slug, "qatar", { type: "Single-Member Limited Liability Company (W.L.L.)" }); const cr = addReg(slug, "commercial_registration", { identifier: `CR-${slug}`, expires: DAYS(300) }); addReg(slug, "tax_registration", { identifier: `TAX-${slug}` }); addSignatory(slug); return { id, cr }; };

async function draft(): Promise<string> {
  h.current = admin;
  const r = await createClientQuotation({ prospectName: "Jurisdiction Prospect", currency: "USD", items: [{ serviceItem: "Portrait session", quantity: 1, unitBasis: "package", sellingRate: 351 }] });
  if (!r.ok) throw new Error(r.error);
  return r.quotationId;
}
const choose = (quotationId: string, slug: string) => chooseContractingEntity({ subject: { type: "quotation", id: quotationId }, entityId: eid(slug), basis: "E2E jurisdiction test", actorUserId: U(0xc3) });
const status = (q: string) => sql(`select status||'|'||coalesce(issued_at::text,'-') from public.client_quotations where id='${q}'`);
const issue = async (q: string, activities?: string[]) => { h.current = admin; return issueOrdinaryQuotation({ quotationId: q, ...(activities ? { activities } : {}) }); };
const sqlStanding = (slug: string, acts: string[] | null) => JSON.parse(sql(`select private.entity_issue_standing('${eid(slug)}', '${TODAY}'::date, ${acts ? `array[${acts.map((a) => `'${a}'`).join(",")}]::text[]` : "null"})`));

beforeAll(() => {
  if (!/^https?:\/\/(127\.0\.0\.1|localhost)/.test(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "")) throw new Error("Refusing to run against a non-local database");
  sql(`
  set session_replication_role = replica;
  insert into auth.users (id,email) select ('00000000-0000-4000-8000-0000000000'||lpad(to_hex(n),2,'0'))::uuid, 'u'||n||'@e2e.test' from generate_series(193,196) n on conflict do nothing;
  insert into public.profiles (id, full_name, access_status) select ('00000000-0000-4000-8000-0000000000'||lpad(to_hex(n),2,'0'))::uuid, 'User '||n, 'active' from generate_series(193,196) n on conflict do nothing;
  insert into public.user_roles (user_id, role_id) select '${U(0xc1)}', r.id from public.roles r where r.slug='staff' on conflict do nothing;
  insert into public.user_roles (user_id, role_id) select '${U(0xc2)}', r.id from public.roles r where r.slug='admin' on conflict do nothing;
  insert into public.user_roles (user_id, role_id) select '${U(0xc3)}', r.id from public.roles r where r.slug in ('admin','super_admin') on conflict do nothing;
  insert into public.currencies (code, name, symbol) values ('USD','US dollar','$') on conflict do nothing;
  `);
});

describe("the seeded rule sets: each jurisdiction uses its OWN document names and obligations", () => {
  const rules = (slug: string) => JSON.parse(sql(`select coalesce(jsonb_agg(jsonb_build_object('key', r.requirement_key, 'necessity', r.necessity, 'label', r.label, 'idLabel', r.identifier_label, 'kind', r.registration_kind, 'cond', r.condition_activity, 'approved', r.approved_at is not null) order by r.sort_order), '[]') from public.jurisdiction_entity_requirements r join public.employment_jurisdictions j on j.id = r.jurisdiction_id where j.slug='${slug}'`)) as { key: string; necessity: string; label: string; idLabel: string | null; kind: string | null; cond: string | null; approved: boolean }[];
  it("Ghana: business-name certificate + TIN mandatory; NO commercial permit; drone licence only when drone work is quoted", () => {
    const g = Object.fromEntries(rules("ghana").map((r) => [r.key, r]));
    expect(g.legal_registration).toMatchObject({ necessity: "mandatory", idLabel: "Business Registration No.", kind: "commercial_registration" });
    expect(g.legal_registration.label).toMatch(/Business Name/);
    expect(g.tax_registration).toMatchObject({ necessity: "mandatory", idLabel: "TIN" });
    expect(g.operating_permission).toMatchObject({ necessity: "not_applicable", kind: "commercial_permit" });
    expect(g["activity_licence:drone_operations"]).toMatchObject({ necessity: "conditional", cond: "drone_operations" });
    expect(g.activity_coverage.necessity).toBe("optional");
    expect(Object.values(g).every((r) => r.approved)).toBe(true);
  });
  it("Qatar: CR, tax card, COMMERCIAL PERMIT and licensed activities are mandatory", () => {
    const q = Object.fromEntries(rules("qatar").map((r) => [r.key, r]));
    expect(q.legal_registration).toMatchObject({ necessity: "mandatory", idLabel: "Commercial Registration (CR) No." });
    expect(q.operating_permission).toMatchObject({ necessity: "mandatory", kind: "commercial_permit" });
    expect(q.activity_coverage.necessity).toBe("mandatory");
    expect(q.establishment_card.necessity).toBe("optional");
  });
  it("the activity types include the planned lines, and nothing is licensed for any entity by the migration", () => {
    expect(sql("select string_agg(key, ',' order by sort_order) from public.entity_activity_types")).toBe("photography,videography,graphic_design,talent_management,production_services,drone_operations");
    expect(sql("select count(*) from public.entity_activities")).toBe("0");
  });
});

describe("Ghana end to end: a Registered Business Name becomes eligible once ITS evidence is recorded and verified", () => {
  it("incomplete Ghana records are refused at selection and at issuing, with Ghana's own wording and no Qatar-style demands", async () => {
    mkEntity("gh-empty", "ghana");
    const q = await draft();
    const r = await choose(q, "gh-empty");
    expect(r.ok === false && r.error).toMatch(/Certificate of Registration of a Business Name .* is not on record/);
    expect(r.ok === false && r.error).toMatch(/Tax Identification Number \(TIN\) is not on record/);
    expect(r.ok === false && r.error).toMatch(/No authorised signatory/);
    expect(r.ok === false && r.error).not.toMatch(/Commercial Permit|permit|Commercial Registration \(CR\)/i);
  });
  it("a complete Ghana record is selected, issued, and its frozen details use Ghana's identifiers and the registration type 'Registered Business Name'", async () => {
    ghanaComplete("gh-ok");
    const q = await draft();
    expect(await choose(q, "gh-ok")).toMatchObject({ ok: true });
    expect(await issue(q, ["photography", "videography"])).toMatchObject({ ok: true });
    const view = await resolveQuotationEntityView(q);
    expect(view).toMatchObject({ phase: "issued", frozen: { legalName: "GH-OK", registrationType: "Registered Business Name", identifiers: [{ label: "Business Registration No.", identifier: "BN-gh-ok" }, { label: "TIN", identifier: "TIN-gh-ok" }] } });
    const ev = JSON.parse(sql(`select metadata::text from public.activity_log where entity_id='${q}' and action='client_quotation.issued'`));
    expect(ev.declaredActivities).toEqual(["photography", "videography"]);
    expect(ev.entityRequirements.find((r: { key: string }) => r.key === "operating_permission")).toMatchObject({ applies: false });
    expect(ev.entityAdvisories[0]).toMatch(/renewal/i);                         // recorded as evidence, never hidden
    expect((await readIssuedLegalDetails(q)).state).toBe("ok");
  });
  it("drone licensing is demanded only when drone work is declared; with a verified authorisation it is accepted", async () => {
    const id = ghanaComplete("gh-drone");
    const q = await draft();
    expect(await choose(q, "gh-drone")).toMatchObject({ ok: true });
    const blocked = await issue(q, ["photography", "drone_operations"]);
    expect(blocked.ok === false && blocked.error).toMatch(/Drone operations is not licensed for this entity/);
    expect(status(q)).toMatch(/^draft\|-/);
    h.current = admin;
    expect((await setEntityActivity({ entityId: id, activityKey: "drone_operations", status: "licensed", evidenceRegistrationId: addReg("gh-drone", "activity_licence", { identifier: "AUTH-E2E-1", expires: DAYS(200), activityKey: "drone_operations" }), actorUserId: U(0xc2) })).ok).toBe(false);   // an admin cannot record it
    expect(await setEntityActivity({ entityId: id, activityKey: "drone_operations", status: "licensed", evidenceRegistrationId: sql(`select id from public.entity_registrations where kind='activity_licence' and employing_entity_id='${id}'`), actorUserId: U(0xc3) })).toMatchObject({ ok: true });
    expect(await issue(q, ["photography", "drone_operations"])).toMatchObject({ ok: true });
  });
  it("registration expiry is enforced for Ghana when a renewal date is recorded, and an expired record stops issuing", async () => {
    mkEntity("gh-exp", "ghana"); addReg("gh-exp", "commercial_registration", { expires: DAYS(-3) }); addReg("gh-exp", "tax_registration"); addSignatory("gh-exp");
    const q = await draft();
    const r = await choose(q, "gh-exp");
    expect(r.ok === false && r.error).toMatch(/expired on/);
  });
});

describe("Qatar: the commercial-permit block and licensed-activities-only are enforced by the database", () => {
  it("while the permit is not issued the entity cannot be selected or issued, even with the CR, tax card and signatory in order", async () => {
    const { id } = qatarBase("qa-nopermit");
    addReg("qa-nopermit", "commercial_permit", { status: "not_issued" });
    const q = await draft();
    const sel = await choose(q, "qa-nopermit");
    expect(sel.ok === false && sel.error).toMatch(/Commercial Permit \/ Licence has not been issued/);
    // even a record that was selected earlier (written directly) is refused at the moment of issue, by the database itself
    sql(`insert into public.booking_contracting_entities (subject_type, subject_id, version, employing_entity_id, basis, chosen_by) values ('quotation','${q}',1,'${id}','E2E direct','${U(0xc3)}')`);
    const r = await issue(q, ["photography"]);
    expect(r.ok === false && r.error).toMatch(/cannot currently contract.*Commercial Permit/);
    expect(status(q)).toMatch(/^draft\|-/);
  });
  it("once the permit is issued and verified, a planned activity is still refused; only a LICENSED, evidenced activity can be quoted", async () => {
    const { id, cr } = qatarBase("qa-ok");
    const notIssued = addReg("qa-ok", "commercial_permit", { status: "not_issued" });
    sql(`update public.entity_registrations set status='superseded' where id='${notIssued}'`);
    addReg("qa-ok", "commercial_permit", { identifier: "PERMIT-E2E", expires: DAYS(300) });
    const q = await draft();
    expect(await choose(q, "qa-ok")).toMatchObject({ ok: true });                      // eligible as an entity; the activities are judged when issuing
    // nothing recorded for photography yet
    expect((await issue(q, ["photography"])).ok === false).toBe(true);
    const none = await issue(q, ["photography"]); expect(none.ok === false && none.error).toMatch(/Photography is not licensed for this entity/);
    const empty = await issue(q, []); expect(empty.ok === false && empty.error).toMatch(/State the activities this quotation covers/);
    // the planned lines: recorded as planned, never licensed
    for (const a of ["videography", "graphic_design", "talent_management", "production_services"]) expect(await setEntityActivity({ entityId: id, activityKey: a, status: "planned", note: "planned after the permit", actorUserId: U(0xc3) })).toMatchObject({ ok: true });
    for (const a of ["videography", "graphic_design", "talent_management", "production_services"]) { const r = await issue(q, [a]); expect(r.ok === false && r.error, a).toMatch(/is planned for this entity but not yet licensed/); }
    // and the DATABASE refuses them by itself, even if the application's own check were bypassed
    for (const a of ["videography", "photography,videography"]) {
      const r = await createAdminClient().rpc("issue_ordinary_quotation", { p_quotation_id: q, p_actor: U(0xc2), p_valid_until: DAYS(30), p_expected_entity: id, p_audit: { declaredActivities: a.split(",") } });
      expect(r.error?.message ?? "", a).toMatch(/entity_ineligible/);
    }
    expect((await createAdminClient().rpc("issue_ordinary_quotation", { p_quotation_id: q, p_actor: U(0xc2), p_valid_until: DAYS(30), p_expected_entity: id, p_audit: { declaredActivities: ["unicorn"] } })).error?.message ?? "").toMatch(/unknown_activity/);
    expect(status(q)).toMatch(/^draft\|-/);
    // photography licensed with the CR as evidence
    expect(await setEntityActivity({ entityId: id, activityKey: "photography", status: "licensed", evidenceRegistrationId: cr, actorUserId: U(0xc3) })).toMatchObject({ ok: true });
    const mixed = await issue(q, ["photography", "videography"]); expect(mixed.ok === false && mixed.error).toMatch(/Videography is planned/);
    expect(status(q)).toMatch(/^draft\|-/);
    expect(await issue(q, ["photography"])).toMatchObject({ ok: true });
    const view = await resolveQuotationEntityView(q);
    expect(view).toMatchObject({ phase: "issued", frozen: { identifiers: [{ label: "Commercial Registration (CR) No.", identifier: "CR-qa-ok" }, { label: "Tax registration No.", identifier: "TAX-qa-ok" }] } });
    expect(JSON.parse(sql(`select metadata->'declaredActivities' from public.activity_log where entity_id='${q}' and action='client_quotation.issued'`))).toEqual(["photography"]);
  });
});

describe("entity_activities: licensing needs evidence, planned is never licensed, rows are never deleted", () => {
  it("the database refuses 'licensed' without verified active evidence of the SAME entity, and any deletion", async () => {
    const a = mkEntity("act-a", "qatar"), b = mkEntity("act-b", "qatar");
    const crA = addReg("act-a", "commercial_registration", { identifier: "CR-ACT-A" });
    const crUnverified = addReg("act-b", "commercial_registration", { identifier: "CR-ACT-B", verified: false });
    const crB = addReg("act-b", "tax_registration", { identifier: "TAX-ACT-B" });
    const ins = (entity: string, ev: string | null, st = "licensed") => `insert into public.entity_activities (employing_entity_id, activity_key, status, evidence_registration_id, recorded_by) values ('${entity}', 'photography', '${st}', ${ev ? `'${ev}'` : "null"}, '${U(0xc3)}')`;
    expect(psqlErr(ins(a, null))).toMatch(/activity_needs_evidence/);
    expect(psqlErr(ins(a, crB))).toMatch(/activity_evidence_not_this_entity/);
    expect(psqlErr(ins(b, crUnverified))).toMatch(/activity_evidence_not_verified/);
    expect(psqlErr(ins(a, crA))).toBe("");
    expect(psqlErr(`delete from public.entity_activities where employing_entity_id='${a}'`)).toMatch(/never deleted/);
    expect(psqlErr(`update public.entity_activities set evidence_registration_id = '${crB}' where employing_entity_id='${a}'`)).toMatch(/activity_evidence_not_this_entity/);
    expect(psqlErr(`update public.entity_activities set status='withdrawn' where employing_entity_id='${a}'`)).toBe("");
    expect(sqlStanding("act-a", ["photography"]).blockers.join(" ")).toMatch(/Photography is not licensed for this entity/);   // withdrawn is not licensed
  });
  it("only a Super Admin can record an activity; unknown activities, and 'licensed' without evidence, are refused with plain messages", async () => {
    const id = mkEntity("act-perm", "qatar");
    const cr = addReg("act-perm", "commercial_registration");
    for (const who of [U(0xc1), U(0xc2)]) expect(await setEntityActivity({ entityId: id, activityKey: "photography", status: "planned", actorUserId: who })).toMatchObject({ ok: false });
    expect(await setEntityActivity({ entityId: id, activityKey: "unicorn_wrangling", status: "planned", actorUserId: U(0xc3) })).toMatchObject({ ok: false, error: expect.stringMatching(/not one Ordift offers/) });
    expect(await setEntityActivity({ entityId: id, activityKey: "photography", status: "licensed", actorUserId: U(0xc3) })).toMatchObject({ ok: false, error: expect.stringMatching(/needs the verified registration/) });
    expect(await setEntityActivity({ entityId: id, activityKey: "photography", status: "licensed", evidenceRegistrationId: cr, actorUserId: U(0xc3) })).toMatchObject({ ok: true });
    expect(sql(`select count(*) from public.activity_log where entity_id='${id}' and action='entity.activity_recorded'`)).toBe("1");
  });
});

describe("a new country: nothing becomes eligible, and nothing is selected, by itself", () => {
  it("a verified UK-style entity is blocked until its rule set is APPROVED and its own evidence recorded; drafting rules changes nothing; nothing is ever auto-selected", async () => {
    sql(`insert into public.employment_jurisdictions (name, slug) values ('United Kingdom (test)','uk-test') on conflict do nothing`);
    const id = mkEntity("uk-branch", "uk-test", { type: "Private company limited by shares" });
    const before = sql("select count(*) from public.booking_contracting_entities");
    expect((await getContractingEntityStanding(id, TODAY))!.eligibility.blockers).toEqual(["No approved registration requirements are defined for United Kingdom (test) yet; a Super Admin must define and approve them before an entity there can contract."]);
    // a DRAFT rule set (no approval) has no effect
    sql(`insert into public.jurisdiction_entity_requirements (jurisdiction_id, requirement_key, category, label, identifier_label, registration_kind, necessity, shown_on_document, sort_order) select id, 'legal_registration', 'legal_registration', 'Certificate of Incorporation (Companies House)', 'Company number', 'commercial_registration', 'mandatory', true, 10 from public.employment_jurisdictions where slug='uk-test'`);
    expect((await getContractingEntityStanding(id, TODAY))!.eligibility.eligible).toBe(false);
    expect(sqlStanding("uk-branch", null).eligible).toBe(false);
    // approval alone is not enough: the entity still needs ITS OWN registration, in the jurisdiction's own terms
    sql(`update public.jurisdiction_entity_requirements set approved_at = now() where requirement_key='legal_registration' and jurisdiction_id = ${jid("uk-test")}`);
    expect((await getContractingEntityStanding(id, TODAY))!.eligibility.blockers).toEqual(["Certificate of Incorporation (Companies House) is not on record."]);
    addReg("uk-branch", "commercial_registration", { identifier: "UK-E2E-1" });
    const st = await getContractingEntityStanding(id, TODAY);
    expect(st!.eligibility.eligible).toBe(true);
    expect(st!.assessment.legal.identifiers).toEqual([{ label: "Company number", identifier: "UK-E2E-1" }]);
    // a newly proposed (unverified) branch is not eligible even then
    mkEntity("uk-proposed", "uk-test", { verified: false, type: "Private company limited by shares" }); addReg("uk-proposed", "commercial_registration", { identifier: "UK-E2E-2" });
    expect((await getContractingEntityStanding(eid("uk-proposed"), TODAY))!.eligibility.blockers).toEqual(["The entity's registration has not been verified by a Super Admin."]);
    // the candidate list never selects anything
    const list = await listOrdinaryContractingCandidates(U(0xc3), TODAY);
    expect(list.candidates.find((c) => c.name === "uk-branch")).toMatchObject({ jurisdiction: "United Kingdom (test)", eligibility: { eligible: true } });
    expect(sql("select count(*) from public.booking_contracting_entities")).toBe(before);
  });
  it("an entity with no jurisdiction is never eligible", async () => {
    const id = mkEntity("no-juris", null);
    addReg("no-juris", "commercial_registration");
    expect((await getContractingEntityStanding(id, TODAY))!.eligibility.blockers).toEqual(["The entity has no jurisdiction recorded."]);
  });
});

describe("PARITY: the database rule and the application rule give identical answers over many entity states", () => {
  it("eligibility, blockers, advisories, per-requirement results and the legal details match for every fixture and activity set", async () => {
    // Ghana variants
    ghanaComplete("pa-gh-ok");
    mkEntity("pa-gh-noreg", "ghana");
    mkEntity("pa-gh-exp", "ghana"); addReg("pa-gh-exp", "commercial_registration", { expires: DAYS(-1) }); addReg("pa-gh-exp", "tax_registration"); addSignatory("pa-gh-exp");
    mkEntity("pa-gh-expstatus", "ghana"); addReg("pa-gh-expstatus", "commercial_registration", { status: "expired" }); addReg("pa-gh-expstatus", "tax_registration"); addSignatory("pa-gh-expstatus");
    mkEntity("pa-gh-nosig", "ghana"); addReg("pa-gh-nosig", "commercial_registration"); addReg("pa-gh-nosig", "tax_registration");
    mkEntity("pa-gh-futuresig", "ghana"); addReg("pa-gh-futuresig", "commercial_registration"); addReg("pa-gh-futuresig", "tax_registration"); addSignatory("pa-gh-futuresig", DAYS(30));
    mkEntity("pa-gh-unver", "ghana"); addReg("pa-gh-unver", "commercial_registration", { verified: false }); addReg("pa-gh-unver", "tax_registration"); addSignatory("pa-gh-unver");
    mkEntity("pa-gh-pending", "ghana"); addReg("pa-gh-pending", "commercial_registration", { status: "pending" }); addReg("pa-gh-pending", "tax_registration"); addSignatory("pa-gh-pending");
    mkEntity("pa-gh-taxunver", "ghana", { legal: "  PA GH TAXUNVER  ", type: null }); addReg("pa-gh-taxunver", "commercial_registration", { identifier: "  BN-PA  " }); addReg("pa-gh-taxunver", "tax_registration", { verified: false }); addSignatory("pa-gh-taxunver");
    const pdId = ghanaComplete("pa-gh-drone");
    addReg("pa-gh-drone", "activity_licence", { identifier: "AUTH-PA", expires: DAYS(100), activityKey: "drone_operations" });
    sql(`insert into public.entity_activities (employing_entity_id, activity_key, status, evidence_registration_id, recorded_by) select '${pdId}', 'drone_operations', 'licensed', id, '${U(0xc3)}' from public.entity_registrations where kind='activity_licence' and employing_entity_id='${pdId}'`);
    mkEntity("pa-gh-inactive", "ghana", { active: false }); addReg("pa-gh-inactive", "commercial_registration"); addReg("pa-gh-inactive", "tax_registration"); addSignatory("pa-gh-inactive");
    mkEntity("pa-gh-unverified", "ghana", { verified: false });
    // Qatar variants
    { const { id } = qatarBase("pa-qa-notissued"); addReg("pa-qa-notissued", "commercial_permit", { status: "not_issued" }); addReg("pa-qa-notissued", "establishment_card", { identifier: "EC-PA" }); void id; }
    { const { id, cr } = qatarBase("pa-qa-ok"); addReg("pa-qa-ok", "commercial_permit", { identifier: "PERMIT-PA", expires: DAYS(100) });
      sql(`insert into public.entity_activities (employing_entity_id, activity_key, status, evidence_registration_id, recorded_by) values ('${id}','photography','licensed','${cr}','${U(0xc3)}'), ('${id}','videography','planned',null,'${U(0xc3)}'), ('${id}','graphic_design','suspended',null,'${U(0xc3)}'), ('${id}','production_services','licensed','${cr}','${U(0xc3)}')`);
      sql(`update public.entity_activities set status='suspended' where employing_entity_id='${id}' and activity_key='graphic_design'`); }
    { const { id, cr } = qatarBase("pa-qa-evexp"); addReg("pa-qa-evexp", "commercial_permit", { identifier: "PERMIT-PB", expires: DAYS(100) });
      const lic = addReg("pa-qa-evexp", "activity_licence", { identifier: "LIC-PB", expires: DAYS(-2), activityKey: "talent_management" }); void cr;
      sql(`insert into public.entity_activities (employing_entity_id, activity_key, status, evidence_registration_id, recorded_by) values ('${id}','talent_management','licensed','${lic}','${U(0xc3)}')`); }
    { qatarBase("pa-qa-nopermitrow"); }
    mkEntity("pa-nojuris", null); addReg("pa-nojuris", "commercial_registration");
    sql(`insert into public.employment_jurisdictions (name, slug) values ('Parity Land','parity-land') on conflict do nothing`);
    mkEntity("pa-unconfigured", "parity-land"); addReg("pa-unconfigured", "commercial_registration");

    const slugs = ["pa-gh-ok", "pa-gh-noreg", "pa-gh-exp", "pa-gh-expstatus", "pa-gh-nosig", "pa-gh-futuresig", "pa-gh-unver", "pa-gh-pending", "pa-gh-taxunver", "pa-gh-drone", "pa-gh-inactive", "pa-gh-unverified",
      "pa-qa-notissued", "pa-qa-ok", "pa-qa-evexp", "pa-qa-nopermitrow", "pa-nojuris", "pa-unconfigured"];
    const actSets: (string[] | null)[] = [null, [], ["photography"], ["photography", "videography"], ["videography", "photography", "photography"], ["drone_operations"], ["photography", "drone_operations"], ["graphic_design"], ["talent_management"], ["production_services", "photography"]];
    let compared = 0;
    for (const slug of slugs) for (const acts of actSets) {
      const app = await getContractingEntityStanding(eid(slug), TODAY, acts);
      const db = sqlStanding(slug, acts);
      const tag = `${slug} ${JSON.stringify(acts)}`;
      expect(app, tag).not.toBeNull();
      if (!app) continue;
      const a = app.assessment;
      expect({ eligible: db.eligible, blockers: db.blockers, advisories: db.advisories, declaredActivities: db.declaredActivities, jurisdiction: db.jurisdiction }, tag)
        .toEqual({ eligible: a.eligible, blockers: a.blockers, advisories: a.advisories, declaredActivities: a.declaredActivities, jurisdiction: a.jurisdiction });
      expect(db.requirements, tag).toEqual(a.requirements);
      expect(db.legal, tag).toEqual(a.legal);
      compared++;
    }
    expect(compared).toBe(slugs.length * actSets.length);
  }, 300_000);
});

describe("0172's safeguards are intact after 0173 replaced the issuing function", () => {
  it("the deployed application's call (no declared activities) still works for Ghana, and still fails closed for Qatar; privileges, owner, search path and the audit-event guard are unchanged", async () => {
    ghanaComplete("cp-gh");
    const q = await draft();
    expect(await choose(q, "cp-gh")).toMatchObject({ ok: true });
    h.current = admin;
    const viaRpc = await createAdminClient().rpc("issue_ordinary_quotation", { p_quotation_id: q, p_actor: U(0xc2), p_valid_until: DAYS(30), p_expected_entity: eid("cp-gh"), p_audit: {} });    // exactly the 677484e call shape
    expect(viaRpc.error).toBeNull();
    expect(status(q)).toMatch(/^sent\|/);
    const { id } = qatarBase("cp-qa"); addReg("cp-qa", "commercial_permit", { identifier: "PERMIT-CP", expires: DAYS(100) });
    const q2 = await draft();
    sql(`insert into public.booking_contracting_entities (subject_type, subject_id, version, employing_entity_id, basis, chosen_by) values ('quotation','${q2}',1,'${id}','E2E direct','${U(0xc3)}')`);
    const old = await createAdminClient().rpc("issue_ordinary_quotation", { p_quotation_id: q2, p_actor: U(0xc2), p_valid_until: DAYS(30), p_expected_entity: id, p_audit: {} });
    expect(old.error?.message ?? "").toMatch(/entity_ineligible/);
    expect(status(q2)).toMatch(/^draft\|-/);
    expect(sql(`select (p.prosecdef::text||'|'||(p.proconfig @> array['search_path=""'])::text||'|'||coalesce(p.proacl::text,'-')) from pg_proc p where p.proname='issue_ordinary_quotation'`)).toMatch(/^true\|true\|\{.*service_role=X/);
    for (const [who, expected] of [["anon", "f"], ["authenticated", "f"], ["service_role", "t"]]) expect(sql(`select has_function_privilege('${who}', 'public.issue_ordinary_quotation(uuid,uuid,date,uuid,jsonb)', 'execute')`), who).toBe(expected);
    expect(psqlErr(`insert into public.activity_log (actor_user_id, action, entity_type, entity_id, metadata) values ('${U(0xc2)}', 'client_quotation.issued', 'client_quotation', '${U(0xc9)}', '{}')`)).toMatch(/issuance_event_protected/);
    expect(sql(`select count(*) from pg_trigger where tgrelid='public.activity_log'::regclass and tgname like 'activity_log_issuance_guard_%' and tgenabled='O'`)).toBe("3");
  });
});
