// @vitest-environment node
//
// Legal-entity registry (migration 0159): per-entity registrations and permits, vault documents with duplicate detection, authorised
// signatories and receipt-backed expenses. Runs the REAL service code against the throwaway local database (see vitest.localdb.config.ts).
// SYNTHETIC data only — no real registration number, receipt or document is used here. The Ghana entity row that already exists in the
// lab (a copy of Production's shape) must be left exactly as it was.
import { beforeAll, describe, expect, it, vi } from "vitest";
import { execSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";

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

import { addVaultDocument, confirmApprovalNoticeDate, confirmExpenseFunding, listEntityExpenses, listEntityRegistrations, listEntitySignatories, listVaultDocuments, recordCommercialPermit, recordEntityReceipt } from "./entityRegistrations";
import { createEmployingEntity, listEmployerCapableEmployingEntities } from "./legalEntities";
import { buildParticulars, entityStanding, trackCompliance } from "./entityRegistry";

if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:|\/|$)/.test(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "")) throw new Error("Refusing to run: this E2E may only target a localhost database.");

const SUPER = "00000000-0000-4000-8000-0000000000d1";
const STAFF = "00000000-0000-4000-8000-0000000000d2";
const db = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false }, global: { fetch: h.fetch } });
const sql = (q: string) => execSync("docker exec -i ordift-mig-check2 psql -U postgres -h 127.0.0.1 -v ON_ERROR_STOP=1 -At", { input: q }).toString();
const pgFails = (q: string) => { try { sql(q); return ""; } catch (e) { return String((e as { stderr?: Buffer }).stderr ?? e); } };
const must = <T extends { ok: boolean }>(r: T, label = ""): Extract<T, { ok: true }> => { if (!r.ok) throw new Error(`${label} expected ok, got ${JSON.stringify(r)}`); return r as Extract<T, { ok: true }>; };
const mustFail = <T extends { ok: boolean }>(r: T): string => { expect(r.ok).toBe(false); return (r as unknown as { error?: string }).error ?? ""; };
const bytes = (s: string) => new TextEncoder().encode(`%PDF-1.4 synthetic ${s}`);
const count = async (table: string) => (await db().from(table).select("*", { count: "exact", head: true })).count ?? 0;

let ghanaFingerprint = "";
const fingerprintGhana = () => sql("select md5(coalesce(string_agg(t::text, '|' order by id), '')) from (select e.*, (select row_to_json(s) from public.employing_entity_sensitive_details s where s.employing_entity_id = e.id) sens, (select count(*) from public.employing_entity_documents d where d.employing_entity_id = e.id) docs from public.employing_entities e where slug = 'ordift-studios') t").trim();
const E = {} as { qa: string; other: string; receiptDoc: string; permitDoc: string; crDoc: string; aoaDoc: string };

beforeAll(async () => {
  ghanaFingerprint = fingerprintGhana();
  sql(`
    insert into auth.users (id, email) values ('${SUPER}','super@e2e.test'), ('${STAFF}','staff@e2e.test') on conflict do nothing;
    insert into public.profiles (id, full_name, access_status) values ('${SUPER}','Super','active'), ('${STAFF}','Staff','active') on conflict (id) do update set access_status = 'active';
    insert into public.user_roles (user_id, role_id) select '${SUPER}', r.id from public.roles r where r.slug in ('admin','super_admin') on conflict do nothing;
    insert into public.user_roles (user_id, role_id) select '${STAFF}', r.id from public.roles r where r.slug = 'staff' on conflict do nothing;
    insert into public.employment_jurisdictions (name, slug, sort_order) select 'Qatar', 'qatar', 20 where not exists (select 1 from public.employment_jurisdictions where slug = 'qatar');
  `);
});

describe("A — a second legal entity under the same brand; Ghana is left exactly as it was", () => {
  it("A1 creating 'Ordift Studios' in Qatar does not collide with the Ghana entity's identifier, and is not employer-capable", async () => {
    const jid = sql("select id from public.employment_jurisdictions where slug = 'qatar'").trim();
    const r = must(await createEmployingEntity({ legalName: "Ordift Studios", jurisdictionId: jid, registrationType: "Single-Member LLC", defaultCurrency: "QAR", employerCapable: false, actorUserId: SUPER }));
    E.qa = r.entityId;
    expect(sql(`select slug from public.employing_entities where id = '${E.qa}'`).trim()).toBe("ordift-studios-qatar");
    const dup = await createEmployingEntity({ legalName: "Ordift Studios", jurisdictionId: jid, actorUserId: SUPER });
    expect(mustFail(dup)).toMatch(/already exists/);
    expect((await listEmployerCapableEmployingEntities()).map((e) => e.slug)).not.toContain("ordift-studios-qatar");
    E.other = must(await createEmployingEntity({ legalName: "Unrelated Test Entity", employerCapable: false, actorUserId: SUPER })).entityId;
  });
  it("A2 only a Super Admin can create an entity", async () => {
    expect(mustFail(await createEmployingEntity({ legalName: "Nope Ltd", actorUserId: STAFF }))).toMatch(/Not authorized/);
  });
});

describe("B — the vault: hashing, duplicates that keep the original, overlap links, restrictions", () => {
  it("B1 a new document is hashed, classified and stored once", async () => {
    const r = must(await addVaultDocument({ entityId: E.qa, documentType: "commercial_registration", filename: "CR test.pdf", mimeType: "application/pdf", bytes: bytes("cr"), issuedOn: "2026-10-15", expiresOn: "2027-10-15", issuingAuthority: "Test Authority", actorUserId: SUPER }));
    E.crDoc = r.documentId;
    expect(r.duplicateOf).toBeNull();
    expect(h.uploads).toHaveLength(1);
    const [d] = await listVaultDocuments(E.qa, SUPER);
    expect(d).toMatchObject({ documentType: "commercial_registration", filename: "CR test.pdf", issuedOn: "2026-10-15", expiresOn: "2027-10-15", relation: null });
    expect(d.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(d.sizeBytes).toBe(bytes("cr").byteLength);
  });
  it("B2 an exact copy is recorded as a duplicate of the original, shares its stored object, and nothing is overwritten", async () => {
    const before = h.uploads.length;
    const r = must(await addVaultDocument({ entityId: E.qa, documentType: "commercial_registration", filename: "same bytes other name.pdf", mimeType: "application/pdf", bytes: bytes("cr"), actorUserId: SUPER }));
    expect(r.duplicateOf).toBe(E.crDoc);
    expect(h.uploads.length).toBe(before);
    const rows = (await db().from("employing_entity_documents").select("id, storage_path, relation, related_document_id, original_filename").eq("employing_entity_id", E.qa)).data!;
    const orig = rows.find((x) => x.id === E.crDoc)!; const dup = rows.find((x) => x.id === r.documentId)!;
    expect(dup).toMatchObject({ relation: "exact_duplicate_of", related_document_id: E.crDoc, storage_path: orig.storage_path });
    expect(orig).toMatchObject({ relation: null, original_filename: "CR test.pdf" });
    expect(pgFails(`delete from public.employing_entity_documents where id = '${E.crDoc}'`)).toMatch(/permission denied|violates/i);
  });
  it("B3 a fuller version of overlapping content is stored on its own and linked to the other", async () => {
    const full = must(await addVaultDocument({ entityId: E.qa, documentType: "articles_of_association", filename: "aoa full.pdf", mimeType: "application/pdf", bytes: bytes("aoa full"), actorUserId: SUPER }));
    E.aoaDoc = full.documentId;
    const part = must(await addVaultDocument({ entityId: E.qa, documentType: "articles_of_association", filename: "aoa part.pdf", mimeType: "application/pdf", bytes: bytes("aoa part"), overlapOf: full.documentId, actorUserId: SUPER }));
    expect(part.duplicateOf).toBeNull();
    expect((await db().from("employing_entity_documents").select("relation, related_document_id").eq("id", part.documentId).single()).data).toEqual({ relation: "partial_overlap_of", related_document_id: full.documentId });
  });
  it("B4 the same bytes uploaded for ANOTHER entity are not treated as a duplicate (entities never share records)", async () => {
    const r = must(await addVaultDocument({ entityId: E.other, documentType: "commercial_registration", filename: "CR test.pdf", mimeType: "application/pdf", bytes: bytes("cr"), actorUserId: SUPER }));
    expect(r.duplicateOf).toBeNull();
    expect(await listVaultDocuments(E.qa, SUPER).then((l) => l.every((d) => d.id !== r.documentId))).toBe(true);
  });
  it("B5 bad input is refused with nothing stored: unknown type, wrong file type, empty, oversize, bad date", async () => {
    const n = h.uploads.length;
    const base = { entityId: E.qa, filename: "x.pdf", mimeType: "application/pdf", bytes: bytes("x"), actorUserId: SUPER };
    expect(mustFail(await addVaultDocument({ ...base, documentType: "mystery" }))).toMatch(/what kind of document/);
    expect(mustFail(await addVaultDocument({ ...base, documentType: "other", mimeType: "application/zip" }))).toMatch(/PDF, JPEG or PNG/);
    expect(mustFail(await addVaultDocument({ ...base, documentType: "other", bytes: new Uint8Array(0) }))).toMatch(/between 1 byte and 10 MB/);
    expect(mustFail(await addVaultDocument({ ...base, documentType: "other", bytes: new Uint8Array(10 * 1024 * 1024 + 1) }))).toMatch(/between 1 byte and 10 MB/);
    expect(mustFail(await addVaultDocument({ ...base, documentType: "other", issuedOn: "15/10/2026" }))).toMatch(/YYYY-MM-DD/);
    expect(h.uploads.length).toBe(n);
  });
  it("B7 an updated government document is stored as a NEW VERSION beside the original, which is kept untouched", async () => {
    const before = h.uploads.length;
    const v2 = must(await addVaultDocument({ entityId: E.qa, documentType: "commercial_registration", filename: "CR test v2 with address.pdf", mimeType: "application/pdf", bytes: bytes("cr with address"), replaces: E.crDoc, actorUserId: SUPER }));
    expect(h.uploads.length).toBe(before + 1);
    const list = await listVaultDocuments(E.qa, SUPER);
    expect(list.find((d) => d.id === v2.documentId)).toMatchObject({ relation: "new_version_of", relatedDocumentId: E.crDoc, replacedByDocumentId: null });
    expect(list.find((d) => d.id === E.crDoc)).toMatchObject({ relation: null, replacedByDocumentId: v2.documentId, filename: "CR test.pdf" });
    expect((await db().from("employing_entity_documents").select("storage_path").eq("id", E.crDoc).single()).data!.storage_path).toContain("CR_test.pdf");
    // a document that is not in this entity's vault cannot be 'replaced', and nothing is stored for the attempt
    const n = h.uploads.length;
    expect(mustFail(await addVaultDocument({ entityId: E.qa, documentType: "commercial_registration", filename: "x.pdf", mimeType: "application/pdf", bytes: bytes("zzz"), replaces: "00000000-0000-4000-8000-000000000999", actorUserId: SUPER }))).toMatch(/not in this entity's vault/);
    expect(h.uploads.length).toBe(n);
  });
  it("B6 a non-Super-Admin can neither store nor list vault documents", async () => {
    expect(mustFail(await addVaultDocument({ entityId: E.qa, documentType: "other", filename: "s.pdf", mimeType: "application/pdf", bytes: bytes("s"), actorUserId: STAFF }))).toMatch(/Super Admin/);
    expect(await listVaultDocuments(E.qa, STAFF)).toEqual([]);
  });
});

const reg = (kind: string, status: string, ident: string | null) => {
  const facts = kind === "commercial_registration" ? JSON.stringify({ activities: [{ code: "742010", name: "Photographic activities" }], headOfficeCity: "Doha", capitalQar: 1000 }) : "{}";
  sql(`insert into public.entity_registrations (employing_entity_id, kind, status, identifier, issued_on, expires_on, facts, recorded_by) values ('${E.qa}','${kind}','${status}',${ident ? `'${ident}'` : "null"}, date '2026-10-15', ${kind === "commercial_registration" ? "date '2027-10-15'" : "null"}, '${facts}'::jsonb, '${SUPER}')`);
};

describe("C — registrations: separate per entity, immutable core, history kept", () => {
  it("C1 record the registration, a not-issued permit and an open 60-day condition; unissued records cannot carry a number", async () => {
    reg("commercial_registration", "active", "TEST-CR-1");
    reg("commercial_permit", "not_issued", null);
    sql(`insert into public.entity_registrations (employing_entity_id, kind, status, issued_on, facts, recorded_by) values ('${E.qa}','investment_approval_condition','pending', date '2026-10-14', '{"workingDays":60,"approvalNoticeDate":null}'::jsonb, '${SUPER}')`);
    expect(pgFails(`insert into public.entity_registrations (employing_entity_id, kind, status, identifier, recorded_by) values ('${E.other}','commercial_permit','not_issued','P-FAKE','${SUPER}')`)).toMatch(/unissued_has_no_identifier/);
    expect(pgFails(`insert into public.entity_registrations (employing_entity_id, kind, status, recorded_by) values ('${E.other}','commercial_registration','active','${SUPER}')`)).toMatch(/issued_has_identifier/);
    expect(pgFails(`insert into public.entity_registrations (employing_entity_id, kind, status, identifier, issued_on, expires_on, recorded_by) values ('${E.other}','tax_registration','active','T-1', date '2026-10-15', date '2026-01-01','${SUPER}')`)).toMatch(/dates_ordered/);
  });
  it("C2 only one current record per kind per entity; the same kind on another entity is fine", async () => {
    expect(pgFails(`insert into public.entity_registrations (employing_entity_id, kind, status, identifier, recorded_by) values ('${E.qa}','commercial_registration','active','TEST-CR-2','${SUPER}')`)).toMatch(/entity_registrations_one_current/);
    sql(`insert into public.entity_registrations (employing_entity_id, kind, status, identifier, issued_on, recorded_by) values ('${E.other}','commercial_registration','active','OTHER-CR-1', date '2026-01-01','${SUPER}')`);
    expect((await listEntityRegistrations(E.other, SUPER)).map((r) => r.identifier)).toEqual(["OTHER-CR-1"]);
    expect((await listEntityRegistrations(E.qa, SUPER)).map((r) => r.identifier)).not.toContain("OTHER-CR-1");
  });
  it("C3 a recorded registration cannot be edited or deleted — only its status changes", async () => {
    expect(pgFails(`update public.entity_registrations set identifier = 'CHANGED' where employing_entity_id = '${E.qa}' and kind = 'commercial_registration'`)).toMatch(/cannot be edited/);
    expect(pgFails(`update public.entity_registrations set expires_on = date '2030-01-01' where employing_entity_id = '${E.qa}' and kind = 'commercial_registration'`)).toMatch(/cannot be edited/);
    expect(pgFails(`delete from public.entity_registrations where employing_entity_id = '${E.qa}'`)).toMatch(/append-only|permission denied/);
    expect(pgFails(`update public.entity_registrations set status = 'expired' where employing_entity_id = '${E.other}' and kind = 'commercial_registration'`)).toBe("");
  });
  it("C4 Super-Admin-only in the database: a staff member's own session reads none of it, and cannot write", async () => {
    const jwt = (await import("node:crypto")).createHmac;
    const tok = (sub: string) => { const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url"); const hd = b64({ alg: "HS256", typ: "JWT" }); const bd = b64({ role: "authenticated", sub, aud: "authenticated", exp: Math.floor(Date.now() / 1000) + 3600 }); return `${hd}.${bd}.${jwt("sha256", execSync("cat /tmp/e2e_jwt_secret").toString().trim()).update(`${hd}.${bd}`).digest("base64url")}`; };
    const as = (id: string) => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, tok(id), { auth: { persistSession: false }, global: { fetch: h.fetch } });
    for (const t of ["entity_registrations", "entity_expenses", "entity_signatories"]) {
      expect((await as(STAFF).from(t).select("id")).data ?? [], t).toEqual([]);
      expect((await as(SUPER).from(t).select("id")).error, t).toBeNull();
    }
    expect((await as(STAFF).from("entity_registrations").insert({ employing_entity_id: E.qa, kind: "tax_registration", status: "active", identifier: "X", recorded_by: STAFF })).error).not.toBeNull();
  });
});

describe("D — standing, tracking and particulars read from the records", () => {
  it("D1 registered but NO permit: tracked as not issued, an open deadline needing a date, and never described as licensed", async () => {
    const regs = await listEntityRegistrations(E.qa, SUPER);
    const t = trackCompliance(regs, "2026-10-16");
    expect(t.map((x) => `${x.kind}:${x.state}`)).toEqual(expect.arrayContaining(["commercial_registration:ok", "commercial_permit:not_issued", "investment_approval_condition:date_unconfirmed"]));
    expect(t[0].state).toBe("date_unconfirmed");
    const st = entityStanding(regs, "2026-10-16");
    expect(st).toMatchObject({ registered: true, permitIssued: false });
    const p = buildParticulars({ legalName: "Test Entity", jurisdiction: "Qatar", currency: "QAR", registrationType: "W.L.L.", sensitive: { registrationNumber: "TEST-CR-1", taxIdentifier: null, registeredAddress: null }, registrations: regs, today: "2026-10-16" });
    expect(p).toMatchObject({ crNumber: "TEST-CR-1", permitLine: null, registeredAddress: null, statements: { mayStateRegistered: true, mayStatePermitIssued: false } });
  });
  it("D2 confirming the approval-notice date is a replacement record; the unconfirmed original stays in history", async () => {
    expect(mustFail(await confirmApprovalNoticeDate({ entityId: E.qa, approvalNoticeDate: "soon", source: "Notice letter", actorUserId: SUPER }))).toMatch(/Enter the date/);
    expect(mustFail(await confirmApprovalNoticeDate({ entityId: E.qa, approvalNoticeDate: "2026-10-15", source: "Notice letter", actorUserId: STAFF }))).toMatch(/Super Admin/);
    expect(mustFail(await confirmApprovalNoticeDate({ entityId: E.qa, approvalNoticeDate: "2026-10-15", source: "", actorUserId: SUPER }))).toMatch(/which document or message/);
    must(await confirmApprovalNoticeDate({ entityId: E.qa, approvalNoticeDate: "2026-10-15", source: "Notice letter ref TEST-1", actorUserId: SUPER }));
    const hist = (await listEntityRegistrations(E.qa, SUPER, { includeHistory: true })).filter((r) => r.kind === "investment_approval_condition");
    expect(hist.map((r) => r.status).sort()).toEqual(["pending", "superseded"]);
    expect(hist.find((r) => r.status === "pending")!.facts).toMatchObject({ workingDays: 60, approvalNoticeDate: "2026-10-15", approvalNoticeSource: "Notice letter ref TEST-1" });
  });
});

describe("E — the Commercial Permit: pending until supplied, then recorded from the uploaded document", () => {
  it("E1 it cannot be recorded without its document, with the wrong kind of document, or with incomplete facts", async () => {
    const good = { entityId: E.qa, permitNumber: "PERMIT-001", issuedOn: "2026-12-01", expiresOn: "2027-12-01", issuingAuthority: "Test Authority", premisesAddress: "Test Tower, Doha", sourceDocumentId: E.crDoc, actorUserId: SUPER };
    expect(mustFail(await recordCommercialPermit({ ...good, sourceDocumentId: "00000000-0000-4000-8000-000000000999" }))).toMatch(/Upload the permit document/);
    expect(mustFail(await recordCommercialPermit(good))).toMatch(/not classed as a Commercial Permit/);
    expect(mustFail(await recordCommercialPermit({ ...good, premisesAddress: "x" }))).toMatch(/premises/);
    expect(mustFail(await recordCommercialPermit({ ...good, permitNumber: "" }))).toMatch(/permit number/);
    expect(mustFail(await recordCommercialPermit({ ...good, expiresOn: "2026-01-01" }))).toMatch(/expiry/);
    expect(mustFail(await recordCommercialPermit({ ...good, actorUserId: STAFF }))).toMatch(/Super Admin/);
    expect((await listEntityRegistrations(E.qa, SUPER)).find((r) => r.kind === "commercial_permit")).toMatchObject({ status: "not_issued", identifier: null });
  });
  it("E2 a permit document belonging to ANOTHER entity cannot be used", async () => {
    const other = must(await addVaultDocument({ entityId: E.other, documentType: "commercial_permit", filename: "other permit.pdf", mimeType: "application/pdf", bytes: bytes("other permit"), actorUserId: SUPER }));
    expect(mustFail(await recordCommercialPermit({ entityId: E.qa, permitNumber: "PERMIT-001", issuedOn: "2026-12-01", expiresOn: null, issuingAuthority: "Test Authority", premisesAddress: "Test Tower, Doha", sourceDocumentId: other.documentId, actorUserId: SUPER }))).toMatch(/Upload the permit document/);
  });
  it("E3 once uploaded and recorded, the pending record is superseded (kept) and the entity may now state the permit", async () => {
    E.permitDoc = must(await addVaultDocument({ entityId: E.qa, documentType: "commercial_permit", filename: "permit.pdf", mimeType: "application/pdf", bytes: bytes("permit"), actorUserId: SUPER })).documentId;
    must(await recordCommercialPermit({ entityId: E.qa, permitNumber: "PERMIT-001", licenceNumber: "LIC-77", issuedOn: "2026-12-01", expiresOn: "2027-12-01", issuingAuthority: "Test Authority", premisesAddress: "Test Tower, Doha", sourceDocumentId: E.permitDoc, actorUserId: SUPER }));
    expect((await listEntityRegistrations(E.qa, SUPER)).find((r) => r.kind === "commercial_permit" && r.status === "active")!.facts).toEqual({ premises: "Test Tower, Doha", licenceNumber: "LIC-77" });
    const hist = (await listEntityRegistrations(E.qa, SUPER, { includeHistory: true })).filter((r) => r.kind === "commercial_permit");
    expect(hist.map((r) => r.status).sort()).toEqual(["active", "superseded"]);
    const regs = await listEntityRegistrations(E.qa, SUPER);
    expect(entityStanding(regs, "2026-12-02").permitIssued).toBe(true);
    expect(buildParticulars({ legalName: "T", jurisdiction: "Qatar", currency: "QAR", registrationType: null, sensitive: null, registrations: regs, today: "2026-12-02" }).permitLine).toBe("Commercial permit PERMIT-001 (valid to 2027-12-01)");
    expect(mustFail(await recordCommercialPermit({ entityId: E.qa, permitNumber: "PERMIT-002", issuedOn: "2026-12-02", expiresOn: null, issuingAuthority: "Test Authority", premisesAddress: "Another Tower, Doha", sourceDocumentId: E.permitDoc, actorUserId: SUPER }))).toMatch(/already recorded/);
  });
});

const LINES = [
  { code: "LINE_A", description: "Fee A", amount: 200 }, { code: "LINE_B", description: "Fee B", amount: 500 },
  { code: "LINE_ZERO", description: "Free line", amount: 0 }, { code: "LINE_C", description: "Fee C", amount: 500 },
];
describe("F — receipt expenses: reconciled, de-duplicated, never assumed, never a payment", () => {
  const rcpt = (over: object = {}) => ({ entityId: E.qa, receiptNumber: "RCPT-TEST-1", receiptDate: "2026-10-15", issuingAuthority: "Test Single Window", requestReference: "SR-TEST", currency: "QAR", printedTotal: 1200, lines: LINES, category: "incorporation_registration", payerAsShown: "Applicant: Test Person (card payment)", sourceDocumentId: E.receiptDoc, actorUserId: SUPER, ...over });
  it("F1 setup: the receipt document is in the vault", async () => {
    E.receiptDoc = must(await addVaultDocument({ entityId: E.qa, documentType: "government_receipt", filename: "receipt.pdf", mimeType: "application/pdf", bytes: bytes("receipt"), actorUserId: SUPER })).documentId;
  });
  it("F2 lines that do not add up to the printed total, a non-receipt document and a non-Super-Admin are all refused with nothing recorded", async () => {
    expect(mustFail(await recordEntityReceipt(rcpt({ printedTotal: 1300 })))).toMatch(/add up to 1200\.00 but the receipt total is 1300\.00/);
    expect(mustFail(await recordEntityReceipt(rcpt({ sourceDocumentId: E.crDoc })))).toMatch(/not classed as a payment receipt/);
    expect(mustFail(await recordEntityReceipt(rcpt({ receiptNumber: " " })))).toMatch(/receipt number/);
    expect(mustFail(await recordEntityReceipt(rcpt({ actorUserId: STAFF })))).toMatch(/Super Admin/);
    expect(await listEntityExpenses(E.qa, SUPER)).toEqual([]);
  });
  it("F3 the receipt is recorded as its three payable lines (the zero line is not an expense), payer as shown, funding to confirm", async () => {
    const pre = { obligations: await count("payment_obligations"), payments: await count("payments"), items: await count("payable_items"), banks: await count("bank_accounts") };
    expect(must(await recordEntityReceipt(rcpt()))).toMatchObject({ recorded: 3, total: 1200 });
    // the registered share capital (QAR 1,000 on the registration) is a different thing and is not in the expense total
    const capital = Number((await listEntityRegistrations(E.qa, SUPER)).find((r) => r.kind === "commercial_registration")!.facts.capitalQar);
    expect(capital).toBe(1000);
    expect((await listEntityExpenses(E.qa, SUPER)).reduce((a, e) => a + e.amount, 0)).toBe(1200);
    const ex = await listEntityExpenses(E.qa, SUPER);
    expect(ex.map((e) => [e.lineCode, e.amount])).toEqual([["LINE_A", 200], ["LINE_B", 500], ["LINE_C", 500]]);
    for (const e of ex) expect(e).toMatchObject({ currency: "QAR", category: "incorporation_registration", receiptTotal: 1200, receiptNumber: "RCPT-TEST-1", fundingSourceStatus: "to_confirm", accountingTreatment: "to_be_confirmed", payerAsShown: "Applicant: Test Person (card payment)", sourceDocumentId: E.receiptDoc, status: "recorded" });
    // nothing that moves or requests money was created
    expect({ obligations: await count("payment_obligations"), payments: await count("payments"), items: await count("payable_items"), banks: await count("bank_accounts") }).toEqual(pre);
  });
  it("F4 recording the same receipt again — however it is split — cannot double-count", async () => {
    expect(mustFail(await recordEntityReceipt(rcpt()))).toMatch(/already recorded/);
    expect(mustFail(await recordEntityReceipt(rcpt({ lines: [{ code: "ONE", description: "All", amount: 1200 }] })))).toMatch(/already recorded/);
    expect(await listEntityExpenses(E.qa, SUPER)).toHaveLength(3);
    expect(pgFails(`insert into public.entity_expenses (employing_entity_id, expense_date, amount, currency, category, line_code, description, receipt_number, receipt_total, issuing_authority, recorded_by) values ('${E.qa}', date '2026-10-15', 200, 'QAR', 'other', 'LINE_A', 'again', 'RCPT-TEST-1', 1200, 'x', '${SUPER}')`)).toMatch(/one_line_per_receipt/);
  });
  it("F5 the same receipt number on ANOTHER entity is that entity's own record", async () => {
    const otherReceipt = must(await addVaultDocument({ entityId: E.other, documentType: "government_receipt", filename: "other receipt.pdf", mimeType: "application/pdf", bytes: bytes("other receipt"), actorUserId: SUPER })).documentId;
    must(await recordEntityReceipt(rcpt({ entityId: E.other, sourceDocumentId: otherReceipt })));
    expect(await listEntityExpenses(E.other, SUPER)).toHaveLength(3);
    expect(await listEntityExpenses(E.qa, SUPER)).toHaveLength(3);
  });
  it("F6 a recorded expense cannot be edited or deleted; only funding confirmation and accounting treatment can change", async () => {
    expect(pgFails(`update public.entity_expenses set amount = 1 where employing_entity_id = '${E.qa}'`)).toMatch(/cannot be edited/);
    expect(pgFails(`update public.entity_expenses set receipt_number = 'X' where employing_entity_id = '${E.qa}'`)).toMatch(/cannot be edited/);
    expect(pgFails(`delete from public.entity_expenses where employing_entity_id = '${E.qa}'`)).toMatch(/append-only|permission denied/);
    expect(pgFails(`update public.entity_expenses set accounting_treatment = 'capitalised' where employing_entity_id = '${E.qa}'`)).toBe("");
    sql(`update public.entity_expenses set accounting_treatment = 'to_be_confirmed' where employing_entity_id = '${E.qa}'`);
  });
  it("F7 funding is confirmed only with a stated basis, by a Super Admin; it then reads as confirmed and records who", async () => {
    expect(mustFail(await confirmExpenseFunding({ entityId: E.qa, receiptNumber: "RCPT-TEST-1", status: "company_account", note: "x", actorUserId: SUPER }))).toMatch(/how you know/);
    expect(mustFail(await confirmExpenseFunding({ entityId: E.qa, receiptNumber: "RCPT-TEST-1", status: "company_account", note: "bank statement line 12", actorUserId: STAFF }))).toMatch(/Super Admin/);
    expect((await listEntityExpenses(E.qa, SUPER)).every((e) => e.fundingSourceStatus === "to_confirm")).toBe(true);
    expect(must(await confirmExpenseFunding({ entityId: E.qa, receiptNumber: "RCPT-TEST-1", status: "founder_personal", note: "bank statement line 12", actorUserId: SUPER }))).toMatchObject({ updated: 3 });
    expect((await listEntityExpenses(E.qa, SUPER)).every((e) => e.fundingSourceStatus === "founder_personal" && e.fundingSourceNote === "bank statement line 12")).toBe(true);
    expect((await listEntityExpenses(E.other, SUPER)).every((e) => e.fundingSourceStatus === "to_confirm")).toBe(true);
    expect(pgFails(`update public.entity_expenses set funding_source_status = 'to_confirm' where employing_entity_id = '${E.qa}'`)).toMatch(/funding_confirmed/);
  });
  it("F8 a mistaken line is voided with a reason (kept), and a voided line cannot change again", async () => {
    expect(pgFails(`update public.entity_expenses set status = 'void' where employing_entity_id = '${E.other}' and line_code = 'LINE_A'`)).toMatch(/void_reason/);
    expect(pgFails(`update public.entity_expenses set status = 'void', void_reason = 'entered against the wrong entity' where employing_entity_id = '${E.other}' and line_code = 'LINE_A'`)).toBe("");
    expect(pgFails(`update public.entity_expenses set accounting_treatment = 'x' where employing_entity_id = '${E.other}' and line_code = 'LINE_A'`)).toMatch(/voided expense cannot be changed/);
  });
});

describe("G — signatories carry names and positions only", () => {
  it("G1 a signatory is stored per entity with no identity number column, and is Super-Admin-only", async () => {
    sql(`insert into public.entity_signatories (employing_entity_id, full_name, position, authority, nationality, ownership_percent, recorded_by) values ('${E.qa}','Test Owner','Owner and manager','Full authority','Ghana',100,'${SUPER}')`);
    expect(await listEntitySignatories(E.qa, SUPER)).toMatchObject([{ fullName: "Test Owner", ownershipPercent: 100 }]);
    expect(await listEntitySignatories(E.other, SUPER)).toEqual([]);
    expect(await listEntitySignatories(E.qa, STAFF)).toEqual([]);
    const cols = sql("select string_agg(column_name, ',') from information_schema.columns where table_name = 'entity_signatories'").trim();
    expect(cols).not.toMatch(/(^|,)(qid|id_number|identity|passport|national_id)/);
    expect(pgFails(`insert into public.entity_signatories (employing_entity_id, full_name, position, ownership_percent, recorded_by) values ('${E.qa}','Bad Owner','x',150,'${SUPER}')`)).toMatch(/ownership_percent/);
  });
});

describe("H — nothing about Ghana changed", () => {
  it("H1 the Ghana entity, its registration facts and its documents are exactly as they were", () => {
    expect(fingerprintGhana()).toBe(ghanaFingerprint);
  });
  it("H2 no Ghana expense, registration or signatory record was created by any of the above", () => {
    expect(sql("select count(*) from public.entity_registrations r join public.employing_entities e on e.id = r.employing_entity_id where e.slug = 'ordift-studios'").trim()).toBe("0");
    expect(sql("select count(*) from public.entity_expenses x join public.employing_entities e on e.id = x.employing_entity_id where e.slug = 'ordift-studios'").trim()).toBe("0");
  });
});
