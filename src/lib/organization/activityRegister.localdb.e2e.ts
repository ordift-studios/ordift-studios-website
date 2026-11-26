// @vitest-environment node
//
// The entity ACTIVITY REGISTER on the REAL schema (throwaway local Postgres + PostgREST). SYNTHETIC data only: a synthetic Qatar entity whose registration and permit print activity code 742010.
// Proves: the register is built from the same facts as the quotation check; a record can only be 'licensed' against verified, in-date evidence that lists the activity; a change needs a reason;
// nothing is deleted; a non-Super-Admin is refused; and entering a record never lets an unlicensed activity through the quotation check.
// Run: supabase/proposals/e2e_scratch.sh, then E2E_DB=p4_e2e E2E_SUPABASE_URL=http://127.0.0.1:54997 npx vitest run --config vitest.localdb.config.ts src/lib/organization/activityRegister.localdb.e2e.ts
import { beforeAll, describe, expect, it, vi } from "vitest";
import { execSync } from "node:child_process";

const h = vi.hoisted(() => ({
  logs: [] as { action: string; metadata: Record<string, unknown> }[],
  agent: null as unknown,
  fetch: async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const undici = await import("undici");
    (h as { agent: unknown }).agent ??= new undici.Agent({ keepAliveTimeout: 1, keepAliveMaxTimeout: 1 });
    return (await undici.fetch(String(input).replace("/rest/v1", ""), { ...(init as object), dispatcher: (h as { agent: unknown }).agent as import("undici").Dispatcher })) as unknown as Response;
  },
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/admin/activityLog", () => ({ logActivity: vi.fn(async (a: { action: string; metadata: Record<string, unknown> }) => { h.logs.push({ action: a.action, metadata: a.metadata }); }) }));
vi.mock("@/lib/supabase/admin", async () => {
  const { createClient: make } = await import("@supabase/supabase-js");
  return {
    createAdminClient: () => {
      const c = make(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: h.fetch } });
      Object.defineProperty(c, "storage", { value: { from: () => ({ upload: async (path: string) => ({ data: { path }, error: null }) }) } });
      return c;
    },
  };
});
import { addVaultDocument, getEntityActivityRegister, recordCommercialPermit, recordEntityActivity } from "./entityRegistrations";
import { createEmployingEntity } from "./legalEntities";

if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:|\/|$)/.test(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "")) throw new Error("Refusing to run: this E2E may only target a localhost database.");

const SUPER = "00000000-0000-4000-8000-0000000000f1";
const STAFF = "00000000-0000-4000-8000-0000000000f2";
const DB = process.env.E2E_DB ?? "p4_e2e";
const sql = (q: string) => execSync(`docker exec -i ordift-mig-check2 psql -U supabase_admin -h 127.0.0.1 -d ${DB} -X -q -v ON_ERROR_STOP=1 -At`, { input: q }).toString().trim();
const must = <T extends { ok: boolean }>(r: T, label = ""): Extract<T, { ok: true }> => { if (!r.ok) throw new Error(`${label} expected ok, got ${JSON.stringify(r)}`); return r as Extract<T, { ok: true }>; };
const fail = <T extends { ok: boolean }>(r: T): string => { expect(r.ok).toBe(false); return (r as unknown as { error?: string }).error ?? ""; };
const bytes = (s: string) => new TextEncoder().encode(`%PDF-1.4 synthetic ${s} ${Math.random()}`);
const TODAY = "2026-11-26";
const standing = (entity: string, acts: string) => JSON.parse(sql(`select private.entity_issue_standing('${entity}'::uuid, '${TODAY}'::date, ${acts})::text`)) as { eligible: boolean; blockers: string[] };

const E = {} as { id: string; other: string; permit: string; cr: string; card: string; unverified: string };

beforeAll(async () => {
  sql(`
    insert into auth.users (id, email) values ('${SUPER}','super@reg.test'), ('${STAFF}','staff@reg.test') on conflict do nothing;
    insert into public.profiles (id, full_name, access_status, member_number) values ('${SUPER}','Super','active','0001'), ('${STAFF}','Staff','active', null) on conflict (id) do update set access_status = 'active';
    insert into public.user_roles (user_id, role_id) select '${SUPER}', r.id from public.roles r where r.slug in ('admin','super_admin') on conflict do nothing;
    insert into public.user_roles (user_id, role_id) select '${STAFF}', r.id from public.roles r where r.slug = 'staff' on conflict do nothing;
    insert into public.entity_activity_types (key, label) values ('photography','Photography'), ('videography','Videography') on conflict do nothing;
  `);
  const jid = sql("select id from public.employment_jurisdictions where slug = 'qatar'");
  const mk = async (name: string) => {
    const id = must(await createEmployingEntity({ legalName: name, jurisdictionId: jid, registrationType: "Single-Member LLC", defaultCurrency: "QAR", employerCapable: false, actorUserId: SUPER })).entityId;
    sql(`update public.employing_entities set verification_status='verified', verified_at=now(), verified_by='${SUPER}' where id='${id}';
         insert into public.entity_registrations (employing_entity_id, kind, status, identifier, issued_on, expires_on, issuing_authority, facts, verified_by, verified_at, recorded_by)
           values ('${id}','commercial_registration','active','CR-${name.slice(-1)}-1','2026-10-15','2027-10-15','MOCI','{"activities":[{"code":"742010","name":"Photographic activities"}]}','${SUPER}',now(),'${SUPER}'),
                  ('${id}','establishment_card','active','EC-${name.slice(-1)}-1','2026-10-15','2027-10-15','GDP','{"sector":"x"}','${SUPER}',now(),'${SUPER}');
         insert into public.entity_registrations (employing_entity_id, kind, status, note, recorded_by) values ('${id}','commercial_permit','not_issued','Not yet issued.','${SUPER}');
         insert into public.entity_signatories (employing_entity_id, full_name, position, authority, legal_capacity, effective_from, recorded_by) values ('${id}','Synthetic Owner ${name.slice(-1)}','Manager','As stated','owner','2026-10-15','${SUPER}');`);
    return id;
  };
  E.id = await mk("E2E Register Qatar A");
  E.other = await mk("E2E Register Qatar B");
  const doc = must(await addVaultDocument({ entityId: E.id, documentType: "commercial_permit", filename: "Commercial Permit.pdf", mimeType: "application/pdf", bytes: bytes("permit"), actorUserId: SUPER })).documentId;
  E.permit = must(await recordCommercialPermit({ entityId: E.id, permitNumber: "345520-REG", issuedOn: "2026-10-26", expiresOn: "2027-10-21", issuingAuthority: "Ministry of Commerce and Industry", premisesAddress: "Zone 27, Street 950, Building 20, Floor 1, Unit 0", sourceDocumentId: doc, actorUserId: SUPER, founderCrossChecked: true, premisesConfirmedByFounder: true, activities: [{ code: "742010", name: "Photographic activities" }] })).registrationId;
  E.cr = sql(`select id from public.entity_registrations where employing_entity_id='${E.id}' and kind='commercial_registration'`);
  E.card = sql(`select id from public.entity_registrations where employing_entity_id='${E.id}' and kind='establishment_card'`);
  E.unverified = sql(`insert into public.entity_registrations (employing_entity_id, kind, status, identifier, issued_on, expires_on, issuing_authority, facts, recorded_by) values ('${E.id}','tax_registration','active','TAX-UNVERIFIED','2026-10-15','2027-10-15','GTA','{}','${SUPER}') returning id`).split("\n")[0];
});

const rowOf = async (key: string) => { const r = must(await getEntityActivityRegister(E.id, SUPER, TODAY)); return r.rows.find((x) => x.key === key)!; };

describe("the screen's presence alone changes nothing", () => {
  it("reading the register for every entity leaves every entity's eligibility, every activity combination and every table row exactly as it was", async () => {
    const entities = sql(`select id from public.employing_entities order by id`).split("\n").filter(Boolean);
    const snapshot = () => JSON.stringify(entities.map((e) => ["null", "array['photography']", "array['videography']", "array['photography','videography']", "array[]::text[]"].map((acts) => standing(e, acts))));
    const rows = () => sql(`select (select count(*) from public.entity_activities)||'/'||(select count(*) from public.entity_registrations)||'/'||(select count(*) from public.activity_log)||'/'||(select count(*) from public.client_quotations)||'/'||(select count(*) from public.payments)`);
    const beforeStanding = snapshot();
    const beforeRows = rows();
    for (const e of entities) { const r = await getEntityActivityRegister(e, SUPER, TODAY); expect(r.ok).toBe(true); }
    expect(snapshot()).toBe(beforeStanding);
    expect(rows()).toBe(beforeRows);
  });
});

describe("before any record exists", () => {
  it("photography already counts because the verified Commercial Registration lists 742010; no record is needed and none exists", async () => {
    const photo = await rowOf("photography");
    expect(photo).toMatchObject({ effective: "listed_on_registration", record: null, printedCode: "742010" });
    expect(sql(`select count(*) from public.entity_activities where employing_entity_id='${E.id}'`)).toBe("0");
    expect(standing(E.id, `array['photography']`).eligible).toBe(true);
  });
  it("videography is not listed and is not eligible", async () => {
    expect(await rowOf("videography")).toMatchObject({ effective: "not_licensed", record: null });
    expect(standing(E.id, `array['videography']`).eligible).toBe(false);
  });
  it("a staff member cannot read or write the register", async () => {
    expect(fail(await getEntityActivityRegister(E.id, STAFF, TODAY))).toMatch(/Super Admin/);
    expect(fail(await recordEntityActivity({ entityId: E.id, activityKey: "photography", status: "planned", actorUserId: STAFF }))).toMatch(/Super Admin/);
  });
});

describe("recording photography as licensed", () => {
  it("is refused without evidence, with another entity's evidence, with unverified evidence, and with evidence that does not list the activity", async () => {
    expect(fail(await recordEntityActivity({ entityId: E.id, activityKey: "photography", status: "licensed", actorUserId: SUPER }))).toMatch(/Choose the registration or licence/);
    const otherCr = sql(`select id from public.entity_registrations where employing_entity_id='${E.other}' and kind='commercial_registration'`);
    expect(fail(await recordEntityActivity({ entityId: E.id, activityKey: "photography", status: "licensed", evidenceRegistrationId: otherCr, actorUserId: SUPER }))).toMatch(/Choose the registration or licence/);
    expect(fail(await recordEntityActivity({ entityId: E.id, activityKey: "photography", status: "licensed", evidenceRegistrationId: E.unverified, actorUserId: SUPER }))).toMatch(/not been verified/);
    // a verified, in-date Establishment Card is a real record but does not license anything
    expect(fail(await recordEntityActivity({ entityId: E.id, activityKey: "photography", status: "licensed", evidenceRegistrationId: E.card, actorUserId: SUPER }))).toMatch(/not a licensing document/);
    // the CR lists only photography, so it cannot be the evidence for videography
    expect(fail(await recordEntityActivity({ entityId: E.id, activityKey: "videography", status: "licensed", evidenceRegistrationId: E.permit, actorUserId: SUPER }))).toMatch(/does not list this activity/);
    expect(sql(`select count(*) from public.entity_activities where employing_entity_id='${E.id}'`)).toBe("0");
  });

  it("is recorded against the verified Commercial Permit, shows who recorded it by member number, and is audited", async () => {
    const r = must(await recordEntityActivity({ entityId: E.id, activityKey: "photography", status: "licensed", evidenceRegistrationId: E.permit, note: "Printed on the permit and the CR.", actorUserId: SUPER, today: TODAY }));
    expect(r.status).toBe("licensed");
    const photo = await rowOf("photography");
    expect(photo.effective).toBe("licensed");
    expect(photo.record).toMatchObject({ status: "licensed", recordedByLabel: "0001", note: "Printed on the permit and the CR." });
    expect(photo.record?.evidence?.identifier).toBe("345520-REG");
    expect(h.logs.some((l) => l.action === "entity.activity_register_entry" && l.metadata.to === "licensed" && l.metadata.evidenceRegistrationId === E.permit)).toBe(true);
    expect(standing(E.id, `array['photography']`).eligible).toBe(true);
  });

  it("a change needs a written reason, keeps the earlier text, and is audited with the previous status", async () => {
    expect(fail(await recordEntityActivity({ entityId: E.id, activityKey: "photography", status: "suspended", actorUserId: SUPER }))).toMatch(/Say why/);
    must(await recordEntityActivity({ entityId: E.id, activityKey: "photography", status: "suspended", reason: "Permit under review by the Founder.", actorUserId: SUPER, today: TODAY }));
    expect(sql(`select status||'|'||note from public.entity_activities where employing_entity_id='${E.id}' and activity_key='photography'`)).toContain("Permit under review by the Founder.");
    expect(h.logs.some((l) => l.action === "entity.activity_register_entry" && l.metadata.from === "licensed" && l.metadata.to === "suspended")).toBe(true);
    // a suspended activity cannot be quoted, even though the registration still lists it
    expect(standing(E.id, `array['photography']`).eligible).toBe(false);
    must(await recordEntityActivity({ entityId: E.id, activityKey: "photography", status: "licensed", evidenceRegistrationId: E.permit, reason: "Review finished; permit confirmed.", actorUserId: SUPER, today: TODAY }));
    expect(standing(E.id, `array['photography']`).eligible).toBe(true);
  });

  it("a planned record is an intention: it never counts and blocks the activity", async () => {
    must(await recordEntityActivity({ entityId: E.id, activityKey: "videography", status: "planned", note: "Intended, not approved.", actorUserId: SUPER }));
    expect(await rowOf("videography")).toMatchObject({ effective: "planned" });
    expect(standing(E.id, `array['videography']`).eligible).toBe(false);
  });
});

describe("an explicit record replaces the registration-listed coverage", () => {
  it("withdrawn stops photography being quoted even though the registration still lists it; the way back is Licensed against valid evidence", async () => {
    must(await recordEntityActivity({ entityId: E.id, activityKey: "photography", status: "withdrawn", reason: "Testing the override rule.", actorUserId: SUPER, today: TODAY }));
    expect(standing(E.id, `array['photography']`).eligible).toBe(false);
    expect(await rowOf("photography")).toMatchObject({ effective: "not_licensed" });
    must(await recordEntityActivity({ entityId: E.id, activityKey: "photography", status: "licensed", evidenceRegistrationId: E.permit, reason: "Back to licensed on the valid permit.", actorUserId: SUPER, today: TODAY }));
    expect(standing(E.id, `array['photography']`).eligible).toBe(true);
    expect(await rowOf("photography")).toMatchObject({ effective: "licensed" });
  });
});

describe("evidence that later stops being valid", () => {
  it("shows a warning and stops counting as licensed once the evidence expires, without deleting anything", async () => {
    const before = sql(`select count(*) from public.entity_activities where employing_entity_id='${E.id}'`);
    const r = must(await getEntityActivityRegister(E.id, SUPER, "2027-10-22"));
    const photo = r.rows.find((x) => x.key === "photography")!;
    expect(photo.record?.status).toBe("licensed");
    expect(photo.warnings.join(" ")).toMatch(/expired/);
    expect(photo.effective).not.toBe("licensed");
    expect(sql(`select count(*) from public.entity_activities where employing_entity_id='${E.id}'`)).toBe(before);
  });
  it("rows can never be deleted", () => {
    expect(() => sql(`delete from public.entity_activities where employing_entity_id='${E.id}'`)).toThrow();
  });
});
