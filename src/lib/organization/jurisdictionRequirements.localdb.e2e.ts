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
  return { createAdminClient: () => Object.assign(make(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: h.fetch } }), { storage: { from: () => ({ upload: async () => ({ error: null }) }) } }) };
});
// logActivity uses the session-scoped client in production; here it is routed to the same service client so the audit rows can be read back
vi.mock("@/lib/supabase/server", async () => {
  const { createClient: make } = await import("@supabase/supabase-js");
  return { createClient: async () => make(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: h.fetch } }) };
});

import { createClientQuotation } from "@/lib/commercial/clientQuotations";
import { addVaultDocument, chooseContractingEntity, getContractingEntityStanding, listOrdinaryContractingCandidates, listVaultDocuments, recordEntityRegistration, recordRenewalConfirmation, setEntityActivity, setSignatoryLegalCapacity } from "./entityRegistrations";
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
type RegOpts = { status?: string; identifier?: string | null; expires?: string | null; verified?: boolean; activityKey?: string; facts?: Record<string, unknown> };
function addReg(slug: string, kind: string, o: RegOpts = {}) {
  const status = o.status ?? "active";
  const ident = status === "pending" || status === "not_issued" ? null : o.identifier === undefined ? `${kind.toUpperCase()}-${slug}` : o.identifier;
  const verified = o.verified !== false && status !== "not_issued" && status !== "pending";
  return sql(`insert into public.entity_registrations (employing_entity_id, kind, status, identifier, issued_on, expires_on, facts, verified_at, verified_by, recorded_by)
    select id, '${kind}', '${status}', ${ident === null ? "null" : `'${ident}'`}, current_date - 300, ${o.expires ? `'${o.expires}'` : "null"}, '${JSON.stringify({ ...(o.facts ?? {}), ...(o.activityKey ? { activityKey: o.activityKey } : {}) })}'::jsonb,
      ${verified ? "now()" : "null"}, ${verified ? `'${U(0xc3)}'` : "null"}, '${U(0xc3)}' from public.employing_entities where slug='${slug}' returning id`);
}
// The management TITLE is "Chief Executive Officer" everywhere; whether the person also holds LEGAL authority to contract is the separate legal_capacity.
const addSignatory = (slug: string, from = "2018-05-07", to: string | null = null, capacity: string | null = null) =>
  sql(`insert into public.entity_signatories (employing_entity_id, full_name, position, authority, effective_from, effective_to, legal_capacity, recorded_by) select id, 'Synthetic Signatory', 'Chief Executive Officer', 'Full authority', '${from}', ${to ? `'${to}'` : "null"}, ${capacity ? `'${capacity}'` : "null"}, '${U(0xc3)}' from public.employing_entities where slug='${slug}'`);
const ghanaComplete = (slug: string) => { const id = mkEntity(slug, "ghana"); addReg(slug, "commercial_registration", { identifier: `BN${(slug.length * 111111111).toString().padStart(9, "0").slice(0, 9)}` }); addReg(slug, "tax_registration", { identifier: `TIN-${slug}` }); addSignatory(slug, "2018-05-07", null, "sole_proprietor"); return id; };
const CR_FACTS = { activities: [{ code: "742010", name: "Photographic activities" }] };
const qatarBase = (slug: string) => { const id = mkEntity(slug, "qatar", { type: "Single-Member Limited Liability Company (W.L.L.)" }); const cr = addReg(slug, "commercial_registration", { identifier: `CR-${slug}`, expires: DAYS(300), facts: CR_FACTS }); addReg(slug, "tax_registration", { identifier: `TAX-${slug}` }); addSignatory(slug, "2026-10-15", null, "owner"); return { id, cr }; };

async function draft(): Promise<string> {
  h.current = admin;
  const r = await createClientQuotation({ prospectName: "Jurisdiction Prospect", currency: "USD", items: [{ serviceItem: "Portrait session", quantity: 1, unitBasis: "package", sellingRate: 351 }] });
  if (!r.ok) throw new Error(r.error);
  return r.quotationId;
}
const choose = (quotationId: string, slug: string) => chooseContractingEntity({ subject: { type: "quotation", id: quotationId }, entityId: eid(slug), basis: "E2E jurisdiction test", actorUserId: U(0xc3) });
const rpcIssue = (q: string, entity: string, acts: string[] | null) => createAdminClient().rpc("issue_ordinary_quotation", { p_quotation_id: q, p_actor: U(0xc2), p_valid_until: DAYS(30), p_expected_entity: entity, p_audit: acts ? { declaredActivities: acts } : {} });
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


// a synthetic vault document row (the file itself is not stored in the disposable stack)
const addDocRow = (slug: string, filename: string, sha: string, type = "commercial_registration", withFile = true) =>
  sql(`insert into public.employing_entity_documents (employing_entity_id, document_type, storage_path, uploaded_by, original_filename, mime_type, size_bytes, file_sha256) select id, '${type}', 'e2e/${filename}', '${U(0xc3)}', ${withFile ? `'${filename}'` : "null"}, 'image/jpeg', 100, ${withFile ? `'${sha.padEnd(64, "0").slice(0, 64)}'` : "null"} from public.employing_entities where slug='${slug}' returning id`);
const bytes = (txt: string) => new TextEncoder().encode(txt);

describe("the seeded rule sets: each jurisdiction uses its OWN document names and obligations", () => {
  const rules = (slug: string) => JSON.parse(sql(`select coalesce(jsonb_agg(jsonb_build_object('key', r.requirement_key, 'necessity', r.necessity, 'label', r.label, 'idLabel', r.identifier_label, 'pattern', r.identifier_pattern, 'kind', r.registration_kind, 'cond', r.condition_activity, 'caps', r.signatory_capacities, 'shown', r.shown_on_document, 'approved', r.approved_at is not null) order by r.sort_order), '[]') from public.jurisdiction_entity_requirements r join public.employment_jurisdictions j on j.id = r.jurisdiction_id where j.slug='${slug}'`)) as { key: string; necessity: string; label: string; idLabel: string | null; pattern: string | null; kind: string | null; cond: string | null; caps: string[] | null; shown: boolean; approved: boolean }[];
  it("Ghana: the business-name certificate and a legal-capacity signatory are mandatory; TIN and renewal are tracked; NO commercial permit; drone licence only when drone work is quoted", () => {
    const g = Object.fromEntries(rules("ghana").map((r) => [r.key, r]));
    expect(g.legal_registration).toMatchObject({ necessity: "mandatory", idLabel: "Business Registration No.", kind: "commercial_registration", shown: true, pattern: "^BN[0-9]{9}$" });
    expect(g.legal_registration.label).toMatch(/Business Name/);
    expect(g.tax_registration).toMatchObject({ necessity: "optional", idLabel: "TIN", shown: false, pattern: "^P[0-9]{10}$" });           // the proprietor's TIN is tracked, not printed
    expect(g.operating_permission).toMatchObject({ necessity: "not_applicable", kind: "commercial_permit" });
    expect(g.signatory).toMatchObject({ necessity: "mandatory", caps: ["sole_proprietor", "authorised_signatory"] });
    expect(g.renewal_evidence.necessity).toBe("optional");
    expect(g["activity_licence:drone_operations"]).toMatchObject({ necessity: "conditional", cond: "drone_operations" });
    expect(g.activity_coverage.necessity).toBe("optional");
    expect(Object.values(g).every((r) => r.approved)).toBe(true);
  });
  it("Qatar: CR, COMMERCIAL PERMIT, a legal-capacity signatory and registered/licensed activities are mandatory; the tax card and establishment card are tracked", () => {
    const q = Object.fromEntries(rules("qatar").map((r) => [r.key, r]));
    expect(q.legal_registration).toMatchObject({ necessity: "mandatory", idLabel: "Commercial Registration (CR) No." });
    expect(q.operating_permission).toMatchObject({ necessity: "mandatory", kind: "commercial_permit" });
    expect(q.signatory).toMatchObject({ necessity: "mandatory", caps: ["owner", "director", "manager", "authorised_signatory"] });
    expect(q.activity_coverage.necessity).toBe("mandatory");
    expect(q.tax_registration.necessity).toBe("optional");
    expect(q.establishment_card.necessity).toBe("optional");
    expect(q.renewal_evidence.necessity).toBe("not_applicable");
  });
  it("Qatar's CR activity code 742010 'Photographic activities' maps to photography only; the migration activates nothing for any entity and records no registration, number or renewal", () => {
    expect(sql("select string_agg(j.slug||':'||c.activity_code||'->'||c.activity_key||':'||c.description, ',') from public.jurisdiction_activity_codes c join public.employment_jurisdictions j on j.id=c.jurisdiction_id")).toBe("qatar:742010->photography:Photographic activities");
    expect(sql("select string_agg(key, ',' order by sort_order) from public.entity_activity_types")).toBe("photography,videography,graphic_design,talent_management,production_services,drone_operations");
    expect(sql("select (select count(*) from public.entity_activities)||'/'||(select count(*) from public.entity_renewal_confirmations)||'/'||(select count(*) from public.entity_registrations where identifier is not null and kind in ('commercial_registration','tax_registration'))")).toBe("0/0/0");
  });
});

describe("Ghana end to end: a Registered Business Name becomes eligible once ITS evidence is recorded and verified", () => {
  it("incomplete Ghana records are refused at selection with Ghana's own wording, no Qatar-style demands, and no demand for a TIN", async () => {
    mkEntity("gh-empty", "ghana");
    const q = await draft();
    const r = await choose(q, "gh-empty");
    expect(r.ok === false && r.error).toMatch(/Certificate of Registration of a Business Name .* is not on record/);
    expect(r.ok === false && r.error).toMatch(/No signatory with legal authority/);
    expect(r.ok === false && r.error).not.toMatch(/Commercial Permit|permit|Commercial Registration \(CR\)|Tax Identification/i);
  });
  it("a complete Ghana record is selected and issued; the frozen details show the business registration number and 'Registered Business Name' but NOT the proprietor's TIN", async () => {
    ghanaComplete("gh-ok");
    const q = await draft();
    expect(await choose(q, "gh-ok")).toMatchObject({ ok: true });
    expect(await issue(q, ["photography", "videography"])).toMatchObject({ ok: true });
    const view = await resolveQuotationEntityView(q);
    expect(view).toMatchObject({ phase: "issued", frozen: { legalName: "GH-OK", registrationType: "Registered Business Name" } });
    expect(view.phase === "issued" && view.frozen.identifiers.map((i) => i.label)).toEqual(["Business Registration No."]);
    expect(JSON.stringify(view)).not.toContain("TIN-gh-ok");
    const ev = JSON.parse(sql(`select metadata::text from public.activity_log where entity_id='${q}' and action='client_quotation.issued'`));
    expect(ev.declaredActivities).toEqual(["photography", "videography"]);
    expect(ev.entityRequirements.find((r: { key: string }) => r.key === "operating_permission")).toMatchObject({ applies: false });
    expect(ev.entityAdvisories.join(" ")).toMatch(/renewal confirmation is recorded/);          // recorded as evidence, never hidden
    expect((await readIssuedLegalDetails(q)).state).toBe("ok");
  });
  it("the TIN being absent does not stop a Ghana quotation (advisory only)", async () => {
    mkEntity("gh-notin", "ghana"); addReg("gh-notin", "commercial_registration", { identifier: "BN000000001" }); addSignatory("gh-notin", "2018-05-07", null, "sole_proprietor");
    const q = await draft();
    expect(await choose(q, "gh-notin")).toMatchObject({ ok: true });
    expect(await issue(q, ["photography"])).toMatchObject({ ok: true });
    expect(sql(`select metadata->'entityAdvisories' from public.activity_log where entity_id='${q}' and action='client_quotation.issued'`)).toMatch(/Tax Identification Number \(TIN\) is not on record/);
  });
  it("drone licensing is demanded only when drone work is declared; with a verified authorisation it is accepted", async () => {
    const id = ghanaComplete("gh-drone");
    const q = await draft();
    expect(await choose(q, "gh-drone")).toMatchObject({ ok: true });
    const blocked = await issue(q, ["photography", "drone_operations"]);
    expect(blocked.ok === false && blocked.error).toMatch(/Drone operations is not licensed for this entity/);
    expect(status(q)).toMatch(/^draft\|-/);
    const lic = addReg("gh-drone", "activity_licence", { identifier: "AUTH-E2E-1", expires: DAYS(200), activityKey: "drone_operations" });
    expect((await setEntityActivity({ entityId: id, activityKey: "drone_operations", status: "licensed", evidenceRegistrationId: lic, actorUserId: U(0xc2) })).ok).toBe(false);   // an admin cannot record it
    expect(await setEntityActivity({ entityId: id, activityKey: "drone_operations", status: "licensed", evidenceRegistrationId: lic, actorUserId: U(0xc3) })).toMatchObject({ ok: true });
    expect(await issue(q, ["photography", "drone_operations"])).toMatchObject({ ok: true });
  });
  it("an expired certificate date stops issuing; a certificate with NO expiry date is fine", async () => {
    mkEntity("gh-exp", "ghana"); addReg("gh-exp", "commercial_registration", { identifier: "BN000000002", expires: DAYS(-3) }); addSignatory("gh-exp", "2018-05-07", null, "sole_proprietor");
    const r = await choose(await draft(), "gh-exp");
    expect(r.ok === false && r.error).toMatch(/expired on/);
  });
});

describe("Ghana: the proprietor's legal capacity and the Chief Executive Officer title are the same person, recorded once", () => {
  it("a Chief Executive Officer with no legal capacity cannot contract; recording the capacity ONCE on the SAME row (same person, same profile link) makes the entity eligible and creates no duplicate", async () => {
    const id = mkEntity("gh-prop", "ghana"); addReg("gh-prop", "commercial_registration", { identifier: "BN000000003" });
    sql(`update public.profiles set full_name = 'Synthetic Proprietor' where id = '${U(0xc4)}'`);
    sql(`insert into public.entity_signatories (employing_entity_id, full_name, position, authority, effective_from, profile_id, recorded_by) values ('${id}', 'Synthetic Proprietor', 'Chief Executive Officer', 'Full & Absolute Authority', '2018-05-07', '${U(0xc4)}', '${U(0xc3)}')`);
    const sigId = sql(`select id from public.entity_signatories where employing_entity_id='${id}'`);
    const q = await draft();
    const before = await choose(q, "gh-prop");
    expect(before.ok === false && before.error).toMatch(/No signatory with legal authority to contract/);        // the title alone is not authority
    sql(`insert into public.booking_contracting_entities (subject_type, subject_id, version, employing_entity_id, basis, chosen_by) values ('quotation','${q}',1,'${id}','E2E direct','${U(0xc3)}')`);
    expect((await rpcIssue(q, id, ["photography"])).error?.message ?? "").toMatch(/entity_ineligible/);           // and the DATABASE refuses it by itself
    expect(status(q)).toMatch(/^draft\|-/);
    expect(await setSignatoryLegalCapacity({ signatoryId: sigId, capacity: "sole_proprietor", actorUserId: U(0xc3) })).toMatchObject({ ok: true });
    expect(sql(`select count(*)||'|'||min(position)||'|'||min(legal_capacity)||'|'||min(profile_id::text) from public.entity_signatories where employing_entity_id='${id}'`)).toBe(`1|Chief Executive Officer|sole_proprietor|${U(0xc4)}`);
    expect(await choose(await draft(), "gh-prop")).toMatchObject({ ok: true });
    expect((await rpcIssue(q, id, ["photography"])).error).toBeNull();                                          // the same direct call now succeeds: the capacity is the only thing that changed
    expect(sql(`select count(*) from public.profiles where full_name = 'Synthetic Proprietor'`)).toBe("1");        // no duplicate person
    expect(sql(`select count(*) from public.activity_log where entity_id='${id}' and action='entity_signatory.legal_capacity_recorded'`)).toBe("1");
  });
  it("the legal capacity is set once and never changed; nothing else on the row can be altered; rows are never deleted; only a Super Admin can set it", async () => {
    const id = mkEntity("gh-prop2", "ghana");
    addSignatory("gh-prop2");
    const sigId = sql(`select id from public.entity_signatories where employing_entity_id='${id}'`);
    for (const who of [U(0xc1), U(0xc2)]) expect(await setSignatoryLegalCapacity({ signatoryId: sigId, capacity: "sole_proprietor", actorUserId: who })).toMatchObject({ ok: false });
    expect(await setSignatoryLegalCapacity({ signatoryId: sigId, capacity: "sole_proprietor", actorUserId: U(0xc3) })).toMatchObject({ ok: true });
    expect(await setSignatoryLegalCapacity({ signatoryId: sigId, capacity: "owner", actorUserId: U(0xc3) })).toMatchObject({ ok: false, error: expect.stringMatching(/already recorded/) });
    expect(psqlErr(`update public.entity_signatories set legal_capacity='owner' where id='${sigId}'`)).toMatch(/signatory_capacity_fixed/);
    expect(psqlErr(`update public.entity_signatories set position='Director' where id='${sigId}'`)).toMatch(/signatory_capacity_fixed/);
    expect(psqlErr(`delete from public.entity_signatories where id='${sigId}'`)).toMatch(/never deleted/);
    // a row whose capacity is still empty can ONLY have its capacity set, nothing else
    const id2 = mkEntity("gh-prop3", "ghana"); addSignatory("gh-prop3");
    expect(psqlErr(`update public.entity_signatories set position='Director' where employing_entity_id='${id2}'`)).toMatch(/signatory_immutable/);
    expect(await setSignatoryLegalCapacity({ signatoryId: sql(`select id from public.entity_signatories where employing_entity_id='${id2}'`), capacity: "unicorn" as never, actorUserId: U(0xc3) })).toMatchObject({ ok: false });
  });
});

describe("Ghana: the annual renewal is tracked apart from the certificate, honestly, and never invented", () => {
  const ghanaWith = (slug: string) => { const id = ghanaComplete(slug); const reg = sql(`select id from public.entity_registrations where employing_entity_id='${id}' and kind='commercial_registration'`); return { id, reg }; };
  it("Founder-confirmed renewal with NO paper receipt: eligible, issued, labelled 'Founder-confirmed; official verification pending', never overdue or non-compliant", async () => {
    const { id, reg } = ghanaWith("gh-rn1");
    expect(await recordRenewalConfirmation({ entityId: id, registrationId: reg, coversFrom: "2018-05-07", coversTo: TODAY, status: "founder_confirmed", basis: "founder_statement", statement: "The Founder confirms the business name has been renewed every year since 2018, electronically.", actorUserId: U(0xc3) })).toMatchObject({ ok: true });
    const st = await getContractingEntityStanding(id, TODAY, ["photography"]);
    expect(st!.eligibility.eligible).toBe(true);
    expect(st!.assessment.advisories).toContain("Annual business-name renewal: Founder-confirmed; official verification pending.");
    expect(st!.assessment.advisories.join(" ")).not.toMatch(/overdue|expired|lapsed|non-compliant/i);
    const q = await draft(); expect(await choose(q, "gh-rn1")).toMatchObject({ ok: true });
    expect(await issue(q, ["photography"])).toMatchObject({ ok: true });
    expect(sql(`select metadata->'entityAdvisories' from public.activity_log where entity_id='${q}' and action='client_quotation.issued'`)).toMatch(/Founder-confirmed; official verification pending/);
    const row = sql(`select status||'|'||basis||'|'||coalesce(official_reference,'-')||'|'||coalesce(verified_by::text,'-')||'|'||coalesce(source_document_id::text,'-') from public.entity_renewal_confirmations where employing_entity_id='${id}'`);
    expect(row).toBe("founder_confirmed|founder_statement|-|-|-");                           // no reference, verifier or document was invented
  });
  it("rules for what each kind of confirmation may carry: a Founder statement has no official reference or verifier; an official one needs an official basis; nothing is edited or deleted", async () => {
    const { id, reg } = ghanaWith("gh-rn2");
    const base = { entityId: id, registrationId: reg, coversFrom: "2025-05-07", coversTo: "2026-05-06", actorUserId: U(0xc3) };
    expect((await recordRenewalConfirmation({ ...base, status: "founder_confirmed", basis: "founder_statement", statement: "short", })).ok).toBe(false);                                           // a real statement
    expect((await recordRenewalConfirmation({ ...base, status: "founder_confirmed", basis: "official_registry_check", statement: "The Founder confirms it." })).ok).toBe(false);          // wrong basis
    expect((await recordRenewalConfirmation({ ...base, status: "founder_confirmed", basis: "founder_statement", statement: "The Founder confirms it was renewed.", officialReference: "X-1" })).ok).toBe(false);   // no invented reference
    expect((await recordRenewalConfirmation({ ...base, status: "official_verified", basis: "founder_statement" })).ok).toBe(false);                                                         // official needs an official basis
    expect((await recordRenewalConfirmation({ ...base, registrationId: U(0xc9), status: "lapsed", basis: "founder_statement" })).ok).toBe(false);          // not a record of this entity
    expect((await recordRenewalConfirmation({ ...base, coversTo: "2024-01-01", status: "lapsed", basis: "founder_statement" })).ok).toBe(false);                                           // period ends before it starts
    for (const who of [U(0xc1), U(0xc2)]) expect((await recordRenewalConfirmation({ ...base, status: "founder_confirmed", basis: "founder_statement", statement: "The Founder confirms it was renewed.", actorUserId: who })).ok).toBe(false);
    const ok = await recordRenewalConfirmation({ ...base, status: "official_verified", basis: "official_registry_check", nextDueOn: "2027-05-06" });
    expect(ok).toMatchObject({ ok: true });
    expect(sql(`select (verified_by is not null)::text||'|'||coalesce(official_reference,'-') from public.entity_renewal_confirmations where employing_entity_id='${id}'`)).toBe("true|-");     // a verifier is recorded; no reference unless one exists
    expect(psqlErr(`update public.entity_renewal_confirmations set status='lapsed' where employing_entity_id='${id}'`)).toMatch(/append-only/);
    expect(psqlErr(`delete from public.entity_renewal_confirmations where employing_entity_id='${id}'`)).toMatch(/append-only/);
    // direct inserts that break the honesty rules are refused by the database itself
    expect(psqlErr(`insert into public.entity_renewal_confirmations (employing_entity_id, registration_id, covers_from, covers_to, status, basis, official_reference, recorded_by) values ('${id}','${reg}','2025-01-01','2025-12-31','founder_confirmed','founder_statement','FAKE-REF','${U(0xc3)}')`)).toMatch(/entity_renewal_founder_basis/);
    expect(psqlErr(`insert into public.entity_renewal_confirmations (employing_entity_id, registration_id, covers_from, covers_to, status, basis, recorded_by) values ('${id}','${reg}','2025-01-01','2025-12-31','official_verified','official_registry_check','${U(0xc3)}')`)).toMatch(/entity_renewal_official_basis/);
  });
  it("only a renewal recorded as LAPSED blocks, at selection and at issuing; a later confirmed period supersedes an earlier lapse", async () => {
    const { id, reg } = ghanaWith("gh-rn3");
    const q = await draft();
    expect(await choose(q, "gh-rn3")).toMatchObject({ ok: true });
    expect(await recordRenewalConfirmation({ entityId: id, registrationId: reg, coversFrom: "2024-05-07", coversTo: "2025-05-06", status: "lapsed", basis: "official_registry_check", actorUserId: U(0xc3) })).toMatchObject({ ok: true });
    const r = await issue(q, ["photography"]);
    expect(r.ok === false && r.error).toMatch(/recorded as lapsed/);
    expect((await rpcIssue(q, id, ["photography"])).error?.message ?? "").toMatch(/entity_ineligible/);        // the database refuses it by itself
    expect(status(q)).toMatch(/^draft\|-/);
    const sel = await choose(await draft(), "gh-rn3"); expect(sel.ok === false && sel.error).toMatch(/recorded as lapsed/);
    expect(await recordRenewalConfirmation({ entityId: id, registrationId: reg, coversFrom: "2025-05-07", coversTo: "2026-05-06", status: "official_verified", basis: "renewal_certificate_or_receipt", actorUserId: U(0xc3) })).toMatchObject({ ok: true });
    expect(await issue(q, ["photography"])).toMatchObject({ ok: true });
  });
  it("a passed next-due date is advisory only; absence of a renewal record is not 'overdue'", async () => {
    const { id, reg } = ghanaWith("gh-rn4");
    expect((await getContractingEntityStanding(id, TODAY, []))!.assessment.advisories.join(" ")).toMatch(/no renewal confirmation is recorded/);
    await recordRenewalConfirmation({ entityId: id, registrationId: reg, coversFrom: "2025-05-07", coversTo: "2026-05-06", status: "founder_confirmed", basis: "founder_statement", statement: "The Founder confirms the renewal.", nextDueOn: "2026-05-07", actorUserId: U(0xc3) });
    const st = await getContractingEntityStanding(id, TODAY, []);
    expect(st!.eligibility.eligible).toBe(true);
    expect(st!.assessment.advisories.join(" ")).toMatch(/due 2026-05-07 has passed; confirm the latest renewal/);
  });
});

describe("recording a Ghana registration from its official document: validated, never generated, never duplicated", () => {
  it("checks the number against Ghana's format, needs the stored document, refuses duplicates and records 'verified' only as the Founder's own cross-check", async () => {
    const id = mkEntity("gh-rec", "ghana");
    const doc = addDocRow("gh-rec", "certificate.jpeg", "a1");
    const base = { entityId: id, kind: "commercial_registration" as const, issuedOn: "2018-05-07", issuingAuthority: "Registrar of Companies", sourceDocumentId: doc, founderCrossChecked: true, actorUserId: U(0xc3) };
    expect(await recordEntityRegistration({ ...base, identifier: "BN12345" })).toMatchObject({ ok: false, error: expect.stringMatching(/does not match the format/) });        // wrong shape: nothing recorded
    expect(await recordEntityRegistration({ ...base, identifier: "" })).toMatchObject({ ok: false });
    for (const who of [U(0xc1), U(0xc2)]) expect(await recordEntityRegistration({ ...base, identifier: "BN123456789", actorUserId: who })).toMatchObject({ ok: false });
    const noFile = addDocRow("gh-rec", "ghost.jpeg", "a2", "other", false);
    expect(await recordEntityRegistration({ ...base, identifier: "BN123456789", sourceDocumentId: noFile })).toMatchObject({ ok: false, error: expect.stringMatching(/no stored file/) });
    expect(await recordEntityRegistration({ ...base, identifier: "BN123456789", sourceDocumentId: U(0xc9) })).toMatchObject({ ok: false });
    expect(sql(`select count(*) from public.entity_registrations where employing_entity_id='${id}'`)).toBe("0");
    const ok = await recordEntityRegistration({ ...base, identifier: "BN123456789" });
    expect(ok).toMatchObject({ ok: true });
    expect(sql(`select status||'|'||(verified_at is not null)::text||'|'||issued_on::text||'|'||(note like '%not checked against the issuing authority%')::text from public.entity_registrations where employing_entity_id='${id}'`)).toBe("active|true|2018-05-07|true");
    // no second record of the same kind for the entity, and the same number is never recorded twice anywhere
    expect(await recordEntityRegistration({ ...base, identifier: "BN123456788" })).toMatchObject({ ok: false, error: expect.stringMatching(/already has a current record/) });
    mkEntity("gh-rec2", "ghana");
    expect(await recordEntityRegistration({ ...base, entityId: eid("gh-rec2"), sourceDocumentId: addDocRow("gh-rec2", "c2.jpeg", "a3"), identifier: "BN123456789" })).toMatchObject({ ok: false, error: expect.stringMatching(/already recorded/) });
    // the TIN has its own format and is optional but recordable; unverified when the Founder did not cross-check it
    expect(await recordEntityRegistration({ ...base, kind: "tax_registration", identifier: "P01234", issuingAuthority: "Ghana Revenue Authority" })).toMatchObject({ ok: false });
    expect(await recordEntityRegistration({ ...base, kind: "tax_registration", identifier: "P0123456789", issuingAuthority: "Ghana Revenue Authority", founderCrossChecked: false })).toMatchObject({ ok: true });
    expect(sql(`select (verified_at is null)::text from public.entity_registrations where employing_entity_id='${id}' and kind='tax_registration'`)).toBe("true");
    // entities without a jurisdiction cannot have a number checked
    mkEntity("no-j-rec", null);
    expect(await recordEntityRegistration({ ...base, entityId: eid("no-j-rec"), sourceDocumentId: addDocRow("no-j-rec", "c3.jpeg", "a4"), identifier: "BN999999999" })).toMatchObject({ ok: false, error: expect.stringMatching(/no jurisdiction/) });
  });
});

describe("Form A pages 2 and 3 attach to the SAME registration document; page 1 is never touched", () => {
  it("continuation pages keep their order, filenames and hashes, link to page 1, create no second registration, and refuse duplicates and gaps", async () => {
    const id = mkEntity("gh-doc", "ghana");
    addReg("gh-doc", "commercial_registration", { identifier: "BN000000004" });
    const page1 = addDocRow("gh-doc", "Form_A_page1.jpeg", "f1", "other");
    const page1Before = sql(`select to_jsonb(d)::text from public.employing_entity_documents d where id='${page1}'`);
    const regsBefore = sql("select count(*) from public.entity_registrations");
    const p2 = await addVaultDocument({ entityId: id, documentType: "other", filename: "Form_A_page2.jpeg", mimeType: "image/jpeg", bytes: bytes("page two"), continuationOf: { documentId: page1, pageNumber: 2, pageCount: 3 }, notes: "Form A, page 2 of 3", actorUserId: U(0xc3) });
    const p3 = await addVaultDocument({ entityId: id, documentType: "other", filename: "Form_A_page3.jpeg", mimeType: "image/jpeg", bytes: bytes("page three"), continuationOf: { documentId: page1, pageNumber: 3, pageCount: 3 }, notes: "Form A, page 3 of 3", actorUserId: U(0xc3) });
    expect(p2).toMatchObject({ ok: true }); expect(p3).toMatchObject({ ok: true });
    expect(sql(`select to_jsonb(d)::text from public.employing_entity_documents d where id='${page1}'`)).toBe(page1Before);          // page 1 byte-for-byte untouched
    expect(sql("select count(*) from public.entity_registrations")).toBe(regsBefore);                                                // no second registration
    expect(sql(`select string_agg(page_number||'/'||page_count||':'||original_filename||':'||relation, ',' order by page_number) from public.employing_entity_documents where related_document_id='${page1}'`)).toBe("2/3:Form_A_page2.jpeg:continuation_page_of,3/3:Form_A_page3.jpeg:continuation_page_of");
    const listed = await listVaultDocuments(id, U(0xc3));
    expect(listed.filter((d) => d.relatedDocumentId === page1).map((d) => [d.pageNumber, d.pageCount, d.filename])).toEqual(expect.arrayContaining([[2, 3, "Form_A_page2.jpeg"], [3, 3, "Form_A_page3.jpeg"]]));
    // refusals: the same bytes, the same page twice, a page number outside the set, a missing page 1, and a non-Super Admin
    const again = { entityId: id, documentType: "other", mimeType: "image/jpeg", actorUserId: U(0xc3) };
    expect(await addVaultDocument({ ...again, filename: "dup.jpeg", bytes: bytes("page two"), continuationOf: { documentId: page1, pageNumber: 3, pageCount: 3 } })).toMatchObject({ ok: false, error: expect.stringMatching(/already stored/) });
    expect(await addVaultDocument({ ...again, filename: "p2b.jpeg", bytes: bytes("another page two"), continuationOf: { documentId: page1, pageNumber: 2, pageCount: 3 } })).toMatchObject({ ok: false, error: expect.stringMatching(/already attached/) });
    expect(await addVaultDocument({ ...again, filename: "p4.jpeg", bytes: bytes("page four"), continuationOf: { documentId: page1, pageNumber: 4, pageCount: 3 } })).toMatchObject({ ok: false });
    expect(await addVaultDocument({ ...again, filename: "p1.jpeg", bytes: bytes("page one again"), continuationOf: { documentId: page1, pageNumber: 1, pageCount: 3 } })).toMatchObject({ ok: false });
    expect(await addVaultDocument({ ...again, filename: "px.jpeg", bytes: bytes("orphan"), continuationOf: { documentId: U(0xc9), pageNumber: 2, pageCount: 3 } })).toMatchObject({ ok: false, error: expect.stringMatching(/Page 1/) });
    for (const who of [U(0xc1), U(0xc2)]) expect(await addVaultDocument({ ...again, filename: "py.jpeg", bytes: bytes("py"), continuationOf: { documentId: page1, pageNumber: 2, pageCount: 3 }, actorUserId: who })).toMatchObject({ ok: false });
    // the database enforces the same shape by itself
    expect(psqlErr(`insert into public.employing_entity_documents (employing_entity_id, document_type, storage_path, uploaded_by, relation, related_document_id) values ('${id}','other','e2e/x','${U(0xc3)}','continuation_page_of','${page1}')`)).toMatch(/page_shape/);
    expect(psqlErr(`insert into public.employing_entity_documents (employing_entity_id, document_type, storage_path, uploaded_by, relation, related_document_id, page_number, page_count) values ('${id}','other','e2e/x','${U(0xc3)}','continuation_page_of','${page1}',2,3)`)).toMatch(/one_page|duplicate key/);
    expect(psqlErr(`insert into public.employing_entity_documents (employing_entity_id, document_type, storage_path, uploaded_by, relation, related_document_id, page_number, page_count) values ('${id}','other','e2e/x','${U(0xc3)}','continuation_page_of','${page1}',5,3)`)).toMatch(/page_shape/);
  });
});

describe("Qatar: photography is on the CR; the permit is not issued; planned activities stay unapproved", () => {
  it("photography listed on the verified CR but NO commercial permit: blocked at selection and at issuing, by the database itself; the activity is only 'listed', not approved to operate", async () => {
    const { id } = qatarBase("qa-nopermit");
    addReg("qa-nopermit", "commercial_permit", { status: "not_issued" });
    const st = await getContractingEntityStanding(id, TODAY, ["photography"]);
    expect(st!.assessment.activities).toEqual([{ key: "photography", label: "Photography", state: "listed_on_registration" }]);
    expect(st!.assessment.blockers).toEqual(["Commercial Permit / Licence has not been issued."]);
    const q = await draft();
    const sel = await choose(q, "qa-nopermit");
    expect(sel.ok === false && sel.error).toMatch(/Commercial Permit \/ Licence has not been issued/);
    sql(`insert into public.booking_contracting_entities (subject_type, subject_id, version, employing_entity_id, basis, chosen_by) values ('quotation','${q}',1,'${id}','E2E direct','${U(0xc3)}')`);
    const r = await issue(q, ["photography"]);
    expect(r.ok === false && r.error).toMatch(/cannot currently contract.*Commercial Permit/);
    const direct = await createAdminClient().rpc("issue_ordinary_quotation", { p_quotation_id: q, p_actor: U(0xc2), p_valid_until: DAYS(30), p_expected_entity: id, p_audit: { declaredActivities: ["photography"] } });
    expect(direct.error?.message ?? "").toMatch(/entity_ineligible/);
    expect(status(q)).toMatch(/^draft\|-/);
    expect(sql(`select count(*) from public.entity_activities where employing_entity_id='${id}'`)).toBe("0");          // nothing was activated or recorded
  });
  it("once the permit is issued and verified, photography needs NO extra licence and NO activity record; planned activities are still refused, by the database too", async () => {
    const { id } = qatarBase("qa-ok");
    const notIssued = addReg("qa-ok", "commercial_permit", { status: "not_issued" });
    sql(`update public.entity_registrations set status='superseded' where id='${notIssued}'`);
    addReg("qa-ok", "commercial_permit", { identifier: "PERMIT-E2E", expires: DAYS(300) });
    const q = await draft();
    expect(await choose(q, "qa-ok")).toMatchObject({ ok: true });
    const empty = await issue(q, []); expect(empty.ok === false && empty.error).toMatch(/State the activities this quotation covers/);
    for (const a of ["videography", "graphic_design", "talent_management", "production_services"]) {
      const none = await issue(q, [a]); expect(none.ok === false && none.error, a).toMatch(/is not licensed for this entity/);
      expect(await setEntityActivity({ entityId: id, activityKey: a, status: "planned", note: "planned after the permit", actorUserId: U(0xc3) })).toMatchObject({ ok: true });
      const planned = await issue(q, [a]); expect(planned.ok === false && planned.error, a).toMatch(/is planned for this entity but not yet licensed/);
      const direct = await createAdminClient().rpc("issue_ordinary_quotation", { p_quotation_id: q, p_actor: U(0xc2), p_valid_until: DAYS(30), p_expected_entity: id, p_audit: { declaredActivities: [a] } });
      expect(direct.error?.message ?? "", a).toMatch(/entity_ineligible/);
    }
    const mixed = await issue(q, ["photography", "videography"]); expect(mixed.ok === false && mixed.error).toMatch(/Videography is planned/);
    expect(status(q)).toMatch(/^draft\|-/);
    expect(sql(`select count(*) from public.entity_activities where employing_entity_id='${id}' and status='licensed'`)).toBe("0");   // photography was never "activated": it is simply listed on the CR
    expect(await issue(q, ["photography"])).toMatchObject({ ok: true });
    expect(await resolveQuotationEntityView(q)).toMatchObject({ phase: "issued", frozen: { identifiers: [{ label: "Commercial Registration (CR) No.", identifier: "CR-qa-ok" }, { label: "Tax registration No.", identifier: "TAX-qa-ok" }] } });
    expect(JSON.parse(sql(`select metadata->'declaredActivities' from public.activity_log where entity_id='${q}' and action='client_quotation.issued'`))).toEqual(["photography"]);
  });
  it("an explicit 'planned' or 'suspended' decision overrides the CR listing; the CR listing counts only while the CR is verified and in date", async () => {
    const { id, cr } = qatarBase("qa-override"); addReg("qa-override", "commercial_permit", { identifier: "PERMIT-O", expires: DAYS(300) });
    expect((await getContractingEntityStanding(id, TODAY, ["photography"]))!.eligibility.eligible).toBe(true);
    expect(await setEntityActivity({ entityId: id, activityKey: "photography", status: "planned", actorUserId: U(0xc3) })).toMatchObject({ ok: true });
    expect((await getContractingEntityStanding(id, TODAY, ["photography"]))!.eligibility.blockers).toEqual(["Photography is planned for this entity but not yet licensed."]);
    expect(await setEntityActivity({ entityId: id, activityKey: "photography", status: "licensed", evidenceRegistrationId: cr, actorUserId: U(0xc3) })).toMatchObject({ ok: true });
    expect((await getContractingEntityStanding(id, TODAY, ["photography"]))!.eligibility.eligible).toBe(true);
    expect(await setEntityActivity({ entityId: id, activityKey: "photography", status: "suspended", actorUserId: U(0xc3) })).toMatchObject({ ok: true });
    expect((await getContractingEntityStanding(id, TODAY, ["photography"]))!.eligibility.blockers).toEqual(["Photography is suspended for this entity."]);
    // an unverified CR no longer stands for the activity
    const un = mkEntity("qa-unver", "qatar"); addReg("qa-unver", "commercial_registration", { identifier: "CR-UN", verified: false, facts: CR_FACTS }); addSignatory("qa-unver", "2026-10-15", null, "owner"); addReg("qa-unver", "commercial_permit", { identifier: "P-UN" });
    const b = (await getContractingEntityStanding(un, TODAY, ["photography"]))!.eligibility.blockers;
    expect(b).toContain("Photography is not licensed for this entity.");
    expect(b).toContain("Commercial Registration (CR) has not been verified.");
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
    expect(sqlStanding("act-a", ["photography"]).blockers.join(" ")).toMatch(/Photography is not licensed for this entity/);   // withdrawn is not licensed, whatever the CR lists
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
    sql(`insert into public.jurisdiction_entity_requirements (jurisdiction_id, requirement_key, category, label, identifier_label, registration_kind, necessity, shown_on_document, sort_order) select id, 'legal_registration', 'legal_registration', 'Certificate of Incorporation (Companies House)', 'Company number', 'commercial_registration', 'mandatory', true, 10 from public.employment_jurisdictions where slug='uk-test'`);
    expect((await getContractingEntityStanding(id, TODAY))!.eligibility.eligible).toBe(false);
    expect(sqlStanding("uk-branch", null).eligible).toBe(false);
    sql(`update public.jurisdiction_entity_requirements set approved_at = now() where requirement_key='legal_registration' and jurisdiction_id = ${jid("uk-test")}`);
    expect((await getContractingEntityStanding(id, TODAY))!.eligibility.blockers).toEqual(["Certificate of Incorporation (Companies House) is not on record."]);
    addReg("uk-branch", "commercial_registration", { identifier: "UK-E2E-1" });
    const st = await getContractingEntityStanding(id, TODAY);
    expect(st!.eligibility.eligible).toBe(true);
    expect(st!.assessment.legal.identifiers).toEqual([{ label: "Company number", identifier: "UK-E2E-1" }]);
    mkEntity("uk-proposed", "uk-test", { verified: false, type: "Private company limited by shares" }); addReg("uk-proposed", "commercial_registration", { identifier: "UK-E2E-2" });
    expect((await getContractingEntityStanding(eid("uk-proposed"), TODAY))!.eligibility.blockers).toEqual(["The entity's registration has not been verified by a Super Admin."]);
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

describe("unauthorised selection and issuance are refused", () => {
  it("only a Super Admin can select a contracting entity; only an admin or Super Admin can issue; staff, clients and anonymous cannot, and nothing changes", async () => {
    ghanaComplete("un-gh");
    const q = await draft();
    for (const who of [U(0xc1), U(0xc2), U(0xc4)]) expect(await chooseContractingEntity({ subject: { type: "quotation", id: q }, entityId: eid("un-gh"), basis: "E2E unauthorised", actorUserId: who })).toMatchObject({ ok: false });
    expect(sql(`select count(*) from public.booking_contracting_entities where subject_id='${q}'`)).toBe("0");
    expect(await choose(q, "un-gh")).toMatchObject({ ok: true });
    for (const u of [null, { ...admin, id: U(0xc1), roles: ["staff"] }]) { h.current = u; expect((await issueOrdinaryQuotation({ quotationId: q, activities: ["photography"] })).ok).toBe(false); }
    for (const [who, expected] of [["anon", "f"], ["authenticated", "f"]]) expect(sql(`select has_function_privilege('${who}', 'public.issue_ordinary_quotation(uuid,uuid,date,uuid,jsonb)', 'execute')`), who).toBe(expected);
    expect(status(q)).toMatch(/^draft\|-/);
  });
});

describe("PARITY: the database rule and the application rule give identical answers over many entity states", () => {
  it("eligibility, blockers, advisories, per-requirement results, activity states and the legal details match for every fixture and activity set", async () => {
    // Ghana variants
    ghanaComplete("pa-gh-ok");
    mkEntity("pa-gh-noreg", "ghana");
    mkEntity("pa-gh-exp", "ghana"); addReg("pa-gh-exp", "commercial_registration", { expires: DAYS(-1) }); addSignatory("pa-gh-exp", "2018-05-07", null, "sole_proprietor");
    mkEntity("pa-gh-expstatus", "ghana"); addReg("pa-gh-expstatus", "commercial_registration", { status: "expired" }); addSignatory("pa-gh-expstatus", "2018-05-07", null, "sole_proprietor");
    mkEntity("pa-gh-nosig", "ghana"); addReg("pa-gh-nosig", "commercial_registration");
    mkEntity("pa-gh-titleonly", "ghana"); addReg("pa-gh-titleonly", "commercial_registration"); addSignatory("pa-gh-titleonly");
    mkEntity("pa-gh-badcap", "ghana"); addReg("pa-gh-badcap", "commercial_registration"); addSignatory("pa-gh-badcap", "2018-05-07", null, "manager");
    mkEntity("pa-gh-authsig", "ghana"); addReg("pa-gh-authsig", "commercial_registration"); addSignatory("pa-gh-authsig", "2018-05-07", null, "authorised_signatory");
    mkEntity("pa-gh-futuresig", "ghana"); addReg("pa-gh-futuresig", "commercial_registration"); addSignatory("pa-gh-futuresig", DAYS(30), null, "sole_proprietor");
    mkEntity("pa-gh-endedsig", "ghana"); addReg("pa-gh-endedsig", "commercial_registration"); addSignatory("pa-gh-endedsig", "2018-05-07", DAYS(-5), "sole_proprietor");
    mkEntity("pa-gh-unver", "ghana"); addReg("pa-gh-unver", "commercial_registration", { verified: false }); addSignatory("pa-gh-unver", "2018-05-07", null, "sole_proprietor");
    mkEntity("pa-gh-pending", "ghana"); addReg("pa-gh-pending", "commercial_registration", { status: "pending" }); addSignatory("pa-gh-pending", "2018-05-07", null, "sole_proprietor");
    mkEntity("pa-gh-taxunver", "ghana", { legal: "  PA GH TAXUNVER  ", type: null }); addReg("pa-gh-taxunver", "commercial_registration", { identifier: "  BN-PA  " }); addReg("pa-gh-taxunver", "tax_registration", { verified: false }); addSignatory("pa-gh-taxunver", "2018-05-07", null, "sole_proprietor");
    const pdId = ghanaComplete("pa-gh-drone");
    addReg("pa-gh-drone", "activity_licence", { identifier: "AUTH-PA", expires: DAYS(100), activityKey: "drone_operations" });
    sql(`insert into public.entity_activities (employing_entity_id, activity_key, status, evidence_registration_id, recorded_by) select '${pdId}', 'drone_operations', 'licensed', id, '${U(0xc3)}' from public.entity_registrations where kind='activity_licence' and employing_entity_id='${pdId}'`);
    // Ghana renewal variants
    const renewalOf = (slug: string, status: string, covers: string, next: string | null = null) => {
      const entity = eid(slug); const regId = sql(`select id from public.entity_registrations where employing_entity_id='${entity}' and kind='commercial_registration'`);
      const basis = status === "founder_confirmed" ? "founder_statement" : "official_registry_check";
      sql(`insert into public.entity_renewal_confirmations (employing_entity_id, registration_id, covers_from, covers_to, status, basis, next_due_on, verified_by, verified_at, recorded_by) values ('${entity}','${regId}','2018-05-07','${covers}','${status}','${basis}', ${next ? `'${next}'` : "null"}, ${status === "official_verified" ? `'${U(0xc3)}', now()` : "null, null"}, '${U(0xc3)}')`);
    };
    ghanaComplete("pa-gh-rn-founder"); renewalOf("pa-gh-rn-founder", "founder_confirmed", TODAY);
    ghanaComplete("pa-gh-rn-official"); renewalOf("pa-gh-rn-official", "official_verified", TODAY);
    ghanaComplete("pa-gh-rn-lapsed"); renewalOf("pa-gh-rn-lapsed", "lapsed", DAYS(-100));
    ghanaComplete("pa-gh-rn-due"); renewalOf("pa-gh-rn-due", "founder_confirmed", TODAY, DAYS(-30));
    ghanaComplete("pa-gh-rn-recovered"); renewalOf("pa-gh-rn-recovered", "lapsed", DAYS(-400)); renewalOf("pa-gh-rn-recovered", "official_verified", DAYS(-10));
    mkEntity("pa-gh-inactive", "ghana", { active: false }); addReg("pa-gh-inactive", "commercial_registration"); addSignatory("pa-gh-inactive", "2018-05-07", null, "sole_proprietor");
    mkEntity("pa-gh-unverified", "ghana", { verified: false });
    // Qatar variants
    { qatarBase("pa-qa-notissued"); addReg("pa-qa-notissued", "commercial_permit", { status: "not_issued" }); addReg("pa-qa-notissued", "establishment_card", { identifier: "EC-PA" }); }
    { const { id, cr } = qatarBase("pa-qa-ok"); addReg("pa-qa-ok", "commercial_permit", { identifier: "PERMIT-PA", expires: DAYS(100) });
      sql(`insert into public.entity_activities (employing_entity_id, activity_key, status, evidence_registration_id, recorded_by) values ('${id}','videography','planned',null,'${U(0xc3)}'), ('${id}','graphic_design','suspended',null,'${U(0xc3)}'), ('${id}','production_services','licensed','${cr}','${U(0xc3)}'), ('${id}','talent_management','withdrawn',null,'${U(0xc3)}')`); }
    { const { id } = qatarBase("pa-qa-planned-photo"); addReg("pa-qa-planned-photo", "commercial_permit", { identifier: "PERMIT-PP", expires: DAYS(100) });
      sql(`insert into public.entity_activities (employing_entity_id, activity_key, status, recorded_by) values ('${id}','photography','planned','${U(0xc3)}')`); }
    { mkEntity("pa-qa-nocap", "qatar"); addReg("pa-qa-nocap", "commercial_registration", { identifier: "CR-NC", expires: DAYS(300), facts: CR_FACTS }); addSignatory("pa-qa-nocap", "2026-10-15", null, null); addReg("pa-qa-nocap", "commercial_permit", { identifier: "PERMIT-NC" }); }
    { const { id } = qatarBase("pa-qa-evexp"); addReg("pa-qa-evexp", "commercial_permit", { identifier: "PERMIT-PB", expires: DAYS(100) });
      const lic = addReg("pa-qa-evexp", "activity_licence", { identifier: "LIC-PB", expires: DAYS(-2), activityKey: "talent_management" });
      sql(`insert into public.entity_activities (employing_entity_id, activity_key, status, evidence_registration_id, recorded_by) values ('${id}','talent_management','licensed','${lic}','${U(0xc3)}')`); }
    { mkEntity("pa-qa-unlisted", "qatar"); addReg("pa-qa-unlisted", "commercial_registration", { identifier: "CR-UL", facts: { activities: [{ code: "999999" }] } }); addSignatory("pa-qa-unlisted", "2026-10-15", null, "owner"); addReg("pa-qa-unlisted", "commercial_permit", { identifier: "P-UL" }); }
    { mkEntity("pa-qa-crunver", "qatar"); addReg("pa-qa-crunver", "commercial_registration", { identifier: "CR-UV", verified: false, facts: CR_FACTS }); addSignatory("pa-qa-crunver", "2026-10-15", null, "owner"); addReg("pa-qa-crunver", "commercial_permit", { identifier: "P-UV" }); }
    { mkEntity("pa-qa-crexp", "qatar"); addReg("pa-qa-crexp", "commercial_registration", { identifier: "CR-EX", expires: DAYS(-2), facts: CR_FACTS }); addSignatory("pa-qa-crexp", "2026-10-15", null, "owner"); addReg("pa-qa-crexp", "commercial_permit", { identifier: "P-EX" }); }
    { qatarBase("pa-qa-nopermitrow"); }
    mkEntity("pa-nojuris", null); addReg("pa-nojuris", "commercial_registration");
    sql(`insert into public.employment_jurisdictions (name, slug) values ('Parity Land','parity-land') on conflict do nothing`);
    mkEntity("pa-unconfigured", "parity-land"); addReg("pa-unconfigured", "commercial_registration");

    const slugs = ["pa-gh-ok", "pa-gh-noreg", "pa-gh-exp", "pa-gh-expstatus", "pa-gh-nosig", "pa-gh-titleonly", "pa-gh-badcap", "pa-gh-authsig", "pa-gh-futuresig", "pa-gh-endedsig", "pa-gh-unver", "pa-gh-pending", "pa-gh-taxunver", "pa-gh-drone",
      "pa-gh-rn-founder", "pa-gh-rn-official", "pa-gh-rn-lapsed", "pa-gh-rn-due", "pa-gh-rn-recovered", "pa-gh-inactive", "pa-gh-unverified",
      "pa-qa-notissued", "pa-qa-ok", "pa-qa-planned-photo", "pa-qa-nocap", "pa-qa-evexp", "pa-qa-unlisted", "pa-qa-crunver", "pa-qa-crexp", "pa-qa-nopermitrow", "pa-nojuris", "pa-unconfigured"];
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
      expect(db.activities, tag).toEqual(a.activities);
      expect(db.legal, tag).toEqual(a.legal);
      compared++;
    }
    expect(compared).toBe(slugs.length * actSets.length);
  }, 600_000);
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
    expect(sql(`select count(*) from pg_indexes where indexname='activity_log_one_issuance_per_quotation'`)).toBe("1");
  });
});
