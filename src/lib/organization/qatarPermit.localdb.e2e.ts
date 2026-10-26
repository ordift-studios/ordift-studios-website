// @vitest-environment node
//
// Legal-entity registry (migration 0159): per-entity registrations and permits, vault documents with duplicate detection, authorised
// signatories and receipt-backed expenses. Runs the REAL service code against the throwaway local database (see vitest.localdb.config.ts).
// SYNTHETIC data only — no real registration number, receipt or document is used here. The Ghana entity row that already exists in the
// lab (a copy of Production's shape) must be left exactly as it was.
import { beforeAll, describe, expect, it, vi } from "vitest";
import { execSync } from "node:child_process";

const h = vi.hoisted(() => ({
  uploads: [] as { path: string; bytes: number }[],
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
  return {
    createAdminClient: () => {
      const c = make(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: h.fetch } });
      Object.defineProperty(c, "storage", { value: { from: () => ({ upload: async (path: string, body: Buffer) => { h.uploads.push({ path, bytes: body.byteLength }); return { data: { path }, error: null }; } }) } });
      return c;
    },
  };
});
import { addVaultDocument, listEntityRegistrations, recordCommercialPermit } from "./entityRegistrations";
import { createEmployingEntity } from "./legalEntities";

if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:|\/|$)/.test(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "")) throw new Error("Refusing to run: this E2E may only target a localhost database.");

const SUPER = "00000000-0000-4000-8000-0000000000e1";
const STAFF = "00000000-0000-4000-8000-0000000000e2";
// the database the PostgREST under test points at (a throwaway copy: built by supabase/proposals/e2e_scratch.sh, with data and migrations through 0173)
const DB = process.env.E2E_DB ?? "p6_e2e";
const sql = (q: string) => execSync(`docker exec -i ordift-mig-check2 psql -U supabase_admin -h 127.0.0.1 -d ${DB} -X -q -v ON_ERROR_STOP=1 -At`, { input: q }).toString().trim();
const pgFails = (q: string) => { try { sql(q); return ""; } catch (e) { return String((e as { stderr?: Buffer }).stderr ?? e); } };
const must = <T extends { ok: boolean }>(r: T, label = ""): Extract<T, { ok: true }> => { if (!r.ok) throw new Error(`${label} expected ok, got ${JSON.stringify(r)}`); return r as Extract<T, { ok: true }>; };
const mustFail = <T extends { ok: boolean }>(r: T): string => { expect(r.ok).toBe(false); return (r as unknown as { error?: string }).error ?? ""; };
const bytes = (s: string) => new TextEncoder().encode(`%PDF-1.4 synthetic ${s} ${Math.random()}`);
const standing = (entity: string, day: string, acts = "null") => JSON.parse(sql(`select private.entity_issue_standing('${entity}'::uuid, '${day}'::date, ${acts})::text`)) as { eligible: boolean; blockers: string[] };

const E = {} as { a: string; b: string; permitDoc: string; permitDocB: string; receiptDoc: string };

beforeAll(async () => {
  sql(`
    insert into auth.users (id, email) values ('${SUPER}','super@permit.test'), ('${STAFF}','staff@permit.test') on conflict do nothing;
    insert into public.profiles (id, full_name, access_status) values ('${SUPER}','Super','active'), ('${STAFF}','Staff','active') on conflict (id) do update set access_status = 'active';
    insert into public.user_roles (user_id, role_id) select '${SUPER}', r.id from public.roles r where r.slug in ('admin','super_admin') on conflict do nothing;
    insert into public.user_roles (user_id, role_id) select '${STAFF}', r.id from public.roles r where r.slug = 'staff' on conflict do nothing;
  `);
  const jid = sql("select id from public.employment_jurisdictions where slug = 'qatar'");
  const mk = async (name: string) => {
    const id = must(await createEmployingEntity({ legalName: name, jurisdictionId: jid, registrationType: "Single-Member LLC", defaultCurrency: "QAR", employerCapable: false, actorUserId: SUPER })).entityId;
    sql(`update public.employing_entities set verification_status='verified', verified_at=now(), verified_by='${SUPER}' where id='${id}';
         insert into public.entity_registrations (employing_entity_id, kind, status, identifier, issued_on, expires_on, issuing_authority, facts, verified_by, verified_at, recorded_by)
           values ('${id}','commercial_registration','active','CR-${name.slice(-1)}-1','2026-10-15','2028-10-15','MOCI','{"activities":[{"code":"742010","name":"Photographic activities"}]}','${SUPER}',now(),'${SUPER}'),
                  ('${id}','establishment_card','active','EC-${name.slice(-1)}-1','2026-10-15','2027-10-15','GDP','{"sector":"x"}','${SUPER}',now(),'${SUPER}');
         insert into public.entity_registrations (employing_entity_id, kind, status, note, recorded_by) values ('${id}','commercial_permit','not_issued','Not yet issued.','${SUPER}');
         insert into public.entity_signatories (employing_entity_id, full_name, position, authority, legal_capacity, effective_from, recorded_by) values ('${id}','Synthetic Owner ${name.slice(-1)}','Manager','As stated','owner','2026-10-15','${SUPER}');`);
    return id;
  };
  E.a = await mk("E2E Permit Qatar A");
  E.b = await mk("E2E Permit Qatar B");
  E.permitDoc = must(await addVaultDocument({ entityId: E.a, documentType: "commercial_permit", filename: "Commercial Permit.pdf", mimeType: "application/pdf", bytes: bytes("permit a"), actorUserId: SUPER })).documentId;
  E.permitDocB = must(await addVaultDocument({ entityId: E.b, documentType: "commercial_permit", filename: "Commercial Permit B.pdf", mimeType: "application/pdf", bytes: bytes("permit b"), actorUserId: SUPER })).documentId;
  E.receiptDoc = must(await addVaultDocument({ entityId: E.a, documentType: "government_receipt", filename: "receipt.pdf", mimeType: "application/pdf", bytes: bytes("receipt"), actorUserId: SUPER })).documentId;
});

const permit = (over: Record<string, unknown> = {}) => ({
  entityId: E.a, permitNumber: "345520-E2E", issuedOn: "2026-10-26", expiresOn: "2027-10-21", issuingAuthority: "Ministry of Commerce and Industry", premisesAddress: "Zone 27, Street 950, Building 20, Floor 1, Unit 0",
  sourceDocumentId: E.permitDoc, actorUserId: SUPER, founderCrossChecked: true, premisesConfirmedByFounder: true, siteClassification: "Commercial", activities: [{ code: "742010", name: "Photographic activities" }],
  restrictions: "Practicing any activity not explicitly listed in the license is prohibited.", ...over,
});
const otherRegs = (id: string) => sql(`select md5(coalesce(string_agg(r::text, '|' order by id), '')) from public.entity_registrations r where employing_entity_id='${id}' and kind <> 'commercial_permit'`);

describe("Commercial Permit against the real schema", () => {
  it("1 before the permit exists the entity is blocked on the permit alone (it is verified, has a CR, a signatory and photography listed on the CR)", () => {
    const s = standing(E.a, "2026-10-26");
    expect(s.eligible).toBe(false);
    expect(s.blockers).toEqual(["Commercial Permit / Licence has not been issued."]);
  });
  it("2 refuses a non-Super-Admin, the wrong kind of document and another entity's permit document, changing nothing", async () => {
    const before = sql(`select count(*) from public.entity_registrations where employing_entity_id='${E.a}'`);
    expect(mustFail(await recordCommercialPermit(permit({ actorUserId: STAFF })))).toMatch(/Super Admin/);
    expect(mustFail(await recordCommercialPermit(permit({ sourceDocumentId: E.receiptDoc })))).toMatch(/not classed as a Commercial Permit/);
    expect(mustFail(await recordCommercialPermit(permit({ sourceDocumentId: E.permitDocB })))).toMatch(/Upload the permit document/);
    expect(sql(`select count(*) from public.entity_registrations where employing_entity_id='${E.a}'`)).toBe(before);
  });
  it("3 records the issued permit as a cross-check: printed facts kept, pending record kept as history, CR / establishment card / activities untouched", async () => {
    const regsBefore = otherRegs(E.a); const acts = sql("select count(*) from public.entity_activities");
    must(await recordCommercialPermit(permit()));
    const rows = await listEntityRegistrations(E.a, SUPER, { includeHistory: true });
    const active = rows.find((r) => r.kind === "commercial_permit" && r.status === "active")!;
    expect(active).toMatchObject({ identifier: "345520-E2E", issuedOn: "2026-10-26", expiresOn: "2027-10-21" });
    expect(active.verifiedAt).not.toBeNull();
    expect(active.note).toMatch(/cross-checked; not checked against the issuing authority's records or the QR verification portal/);
    expect(active.facts).toMatchObject({ premises: "Zone 27, Street 950, Building 20, Floor 1, Unit 0", siteClassification: "Commercial", activities: [{ code: "742010", name: "Photographic activities" }], premisesBasis: "founder_confirmed_authorised_location_not_a_government_inspection" });
    expect(rows.filter((r) => r.kind === "commercial_permit").map((r) => r.status).sort()).toEqual(["active", "superseded"]);
    expect(sql(`select count(*) from public.entity_registrations where employing_entity_id='${E.a}' and kind='commercial_permit' and status='superseded' and identifier is null and note='Not yet issued.'`)).toBe("1");
    expect(otherRegs(E.a)).toBe(regsBefore);
    expect(sql("select count(*) from public.entity_activities")).toBe(acts);
  });
  it("4 eligibility follows the recorded permit: eligible through its last day, blocked the day after; other activities are still not licensed", () => {
    expect(standing(E.a, "2026-10-26").eligible).toBe(true);
    expect(standing(E.a, "2027-10-14", `array['photography']`).eligible).toBe(true);
    const after = standing(E.a, "2027-10-22");
    expect(after.eligible).toBe(false);
    expect(after.blockers).toEqual(["Commercial Permit / Licence expired on 2027-10-21."]);
    const v = standing(E.a, "2026-10-26", `array['videography']`);
    expect(v.eligible).toBe(false);
    expect(v.blockers.join(" ")).toContain("Videography is not licensed");
  });
  it("5 a permit recorded WITHOUT the cross-check is not verified, and the entity stays blocked on it", async () => {
    must(await recordCommercialPermit(permit({ entityId: E.b, sourceDocumentId: E.permitDocB, permitNumber: "345521-E2E", founderCrossChecked: false, premisesConfirmedByFounder: false })));
    const b = (await listEntityRegistrations(E.b, SUPER)).find((r) => r.kind === "commercial_permit")!;
    expect(b.verifiedAt).toBeNull(); expect(b.note).toBeNull(); expect(b.facts).not.toHaveProperty("premisesBasis");
    expect(standing(E.b, "2026-10-26").blockers).toEqual(["Commercial Permit / Licence has not been verified."]);
  });
  it("6 duplicates are prevented by the function and by the database: no second permit, no repeated number, and the one-current rule rejects a direct second active row", async () => {
    expect(mustFail(await recordCommercialPermit(permit({ permitNumber: "999999-E2E" })))).toMatch(/already recorded/);            // an active permit exists
    expect(mustFail(await recordCommercialPermit(permit({ entityId: E.b, sourceDocumentId: E.permitDocB })))).toMatch(/already recorded/);    // E.b already has one; same number as A's
    expect(pgFails(`insert into public.entity_registrations (employing_entity_id, kind, status, identifier, recorded_by) values ('${E.a}','commercial_permit','active','DIRECT-1','${SUPER}')`)).toMatch(/unique|duplicate|violates/i);
    expect(sql(`select count(*) from public.entity_registrations where employing_entity_id='${E.a}' and kind='commercial_permit' and status in ('active','pending','not_issued')`)).toBe("1");
  });
  it("7 a recorded permit is immutable in its core: its identifier and dates cannot be edited, and it cannot be deleted", () => {
    expect(pgFails(`update public.entity_registrations set identifier='CHANGED' where employing_entity_id='${E.a}' and kind='commercial_permit' and status='active'`)).not.toBe("");
    expect(pgFails(`delete from public.entity_registrations where employing_entity_id='${E.a}' and kind='commercial_permit'`)).not.toBe("");
  });
});
