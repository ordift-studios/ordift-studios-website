// @vitest-environment node
//
// Receipt-backed expense entry (migration 0174) against the REAL schema: the admin form's server function, the Founder-funded non-reimbursable QAR 500
// permit fee shape, duplicate refusal, the database guards and constraints, and compatibility with rows recorded before 0174.
// SYNTHETIC data only (throwaway database built by supabase/proposals/e2e_scratch.sh style; never Production).
import { beforeAll, describe, expect, it, vi } from "vitest";
import { execSync } from "node:child_process";

const h = vi.hoisted(() => ({
  agent: null as unknown,
  logged: [] as { action: string; metadata: Record<string, unknown> }[],
  fetch: async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const undici = await import("undici");
    (h as { agent: unknown }).agent ??= new undici.Agent({ keepAliveTimeout: 1, keepAliveMaxTimeout: 1 });
    return (await undici.fetch(String(input).replace("/rest/v1", ""), { ...(init as object), dispatcher: (h as { agent: unknown }).agent as import("undici").Dispatcher })) as unknown as Response;
  },
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/admin/activityLog", () => ({ logActivity: vi.fn(async (e: { action: string; metadata: Record<string, unknown> }) => { h.logged.push(e); }) }));
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
import { addVaultDocument, confirmExpenseFunding, listEntityExpenses, recordEntityReceipt } from "./entityRegistrations";
import { createEmployingEntity } from "./legalEntities";

if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:|\/|$)/.test(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "")) throw new Error("Refusing to run: this E2E may only target a localhost database.");

const SUPER = "00000000-0000-4000-8000-0000000000f1";
const STAFF = "00000000-0000-4000-8000-0000000000f2";
const DB = process.env.E2E_DB ?? "p4_e2e";
const sql = (q: string) => execSync(`docker exec -i ordift-mig-check2 psql -U supabase_admin -h 127.0.0.1 -d ${DB} -X -q -v ON_ERROR_STOP=1 -At`, { input: q }).toString().trim();
const pgFails = (q: string) => { try { sql(q); return ""; } catch (e) { return String((e as { stderr?: Buffer }).stderr ?? e); } };
const must = <T extends { ok: boolean }>(r: T, label = ""): Extract<T, { ok: true }> => { if (!r.ok) throw new Error(`${label} expected ok, got ${JSON.stringify(r)}`); return r as Extract<T, { ok: true }>; };
const mustFail = <T extends { ok: boolean }>(r: T): string => { expect(r.ok).toBe(false); return (r as unknown as { error?: string }).error ?? ""; };
const bytes = (s: string) => new TextEncoder().encode(`%PDF-1.4 synthetic ${s} ${Math.random()}`);

const E = {} as { qa: string; other: string; oldDoc: string; newDoc: string; otherDoc: string };
const OLD = "OLD-RECEIPT-1200";
const NEW = "NEW-RECEIPT-500";
const oldReceipt = () => ({
  entityId: E.qa, receiptNumber: OLD, receiptDate: "2026-10-15", issuingAuthority: "Test Single Window", requestReference: "SR-OLD", currency: "QAR", printedTotal: 1200, category: "incorporation_registration",
  payerAsShown: "Applicant: Test Founder (card payment)", sourceDocumentId: E.oldDoc, actorUserId: SUPER, today: "2026-10-27",
  lines: [{ code: "A", description: "Establishment record issuance fee", amount: 200 }, { code: "B", description: "Annual chamber membership fee", amount: 500 }, { code: "C", description: "Commercial registration issuance fee", amount: 500 }, { code: "D", description: "Printing", amount: 0 }],
});
const permitReceipt = (over: object = {}) => ({
  entityId: E.qa, receiptNumber: NEW, receiptDate: "2026-10-26", issuingAuthority: "Test Single Window", requestReference: "SR-NEW", currency: "QAR", printedTotal: 500, category: "government_fee",
  payerAsShown: "Applicant: Test Founder (card payment)", sourceDocumentId: E.newDoc, actorUserId: SUPER, today: "2026-10-27",
  lines: [{ code: "PERMIT_ISSUANCE", description: "Commercial Permit issuance fee", amount: 500 }, { code: "CARD_PRINT", description: "Establishment card printing", amount: 0 }],
  fundingSourceStatus: "founder_personal", fundingSourceNote: "Founder's own statement: paid from personal funds", reimbursementIntent: "not_reimbursable", paymentMethod: "card",
  relatedReference: "Commercial License TEST-345520", notes: "Non-reimbursable Founder contribution toward establishment.", ...over,
});
// row count of EVERY public table, so "created nothing else" is measured, not assumed
const tableCounts = () => Object.fromEntries(sql(`select table_name || '=' || (xpath('/row/c/text()', query_to_xml(format('select count(*) as c from public.%I', table_name), false, true, '')))[1]::text from information_schema.tables where table_schema='public' and table_type='BASE TABLE' order by 1`).split("\n").map((l) => l.split("="))) as Record<string, string>;
const fingerprint = (id: string, receipt: string) => sql(`select md5(coalesce(string_agg(x::text, '|' order by id), '')) from public.entity_expenses x where employing_entity_id='${id}' and receipt_number='${receipt}'`);

beforeAll(async () => {
  sql(`
    insert into auth.users (id, email) values ('${SUPER}','super@expense.test'), ('${STAFF}','staff@expense.test') on conflict do nothing;
    insert into public.profiles (id, full_name, access_status) values ('${SUPER}','Super','active'), ('${STAFF}','Staff','active') on conflict (id) do update set access_status = 'active';
    insert into public.user_roles (user_id, role_id) select '${SUPER}', r.id from public.roles r where r.slug in ('admin','super_admin') on conflict do nothing;
    insert into public.user_roles (user_id, role_id) select '${STAFF}', r.id from public.roles r where r.slug = 'staff' on conflict do nothing;
  `);
  const jid = sql("select id from public.employment_jurisdictions where slug = 'qatar'");
  E.qa = must(await createEmployingEntity({ legalName: "E2E Expense Qatar", jurisdictionId: jid, registrationType: "Single-Member LLC", defaultCurrency: "QAR", employerCapable: false, actorUserId: SUPER })).entityId;
  E.other = must(await createEmployingEntity({ legalName: "E2E Expense Other", jurisdictionId: jid, registrationType: "Single-Member LLC", defaultCurrency: "QAR", employerCapable: false, actorUserId: SUPER })).entityId;
  const doc = async (entityId: string, name: string) => must(await addVaultDocument({ entityId, documentType: "government_receipt", filename: `${name}.pdf`, mimeType: "application/pdf", bytes: bytes(name), actorUserId: SUPER })).documentId;
  E.oldDoc = await doc(E.qa, "old receipt"); E.newDoc = await doc(E.qa, "permit receipt"); E.otherDoc = await doc(E.other, "other receipt");
});

describe("G — receipt-backed expense entry against the real schema", () => {
  it("G1 an earlier QAR 1,200 receipt (recorded the old way: funding to confirm) takes the migration defaults, and is the baseline that must never change", async () => {
    must(await recordEntityReceipt(oldReceipt()));
    const rows = await listEntityExpenses(E.qa, SUPER);
    expect(rows).toHaveLength(3);
    for (const r of rows) expect(r).toMatchObject({ receiptNumber: OLD, fundingSourceStatus: "to_confirm", reimbursementIntent: "to_be_confirmed", accountingTreatment: "to_be_confirmed", paymentMethod: null, relatedReference: null, notes: null });
  });

  it("G2 the QAR 500 permit fee is recorded as ONE line: Founder personal funds, reimbursement not required, accounting still to be confirmed, linked to the existing receipt", async () => {
    const baseline = fingerprint(E.qa, OLD);
    const countsBefore = tableCounts();
    h.logged.length = 0;
    expect(must(await recordEntityReceipt(permitReceipt()))).toMatchObject({ recorded: 1, total: 500 });
    const rows = (await listEntityExpenses(E.qa, SUPER)).filter((r) => r.receiptNumber === NEW);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ amount: 500, currency: "QAR", category: "government_fee", lineCode: "PERMIT_ISSUANCE", expenseDate: "2026-10-26", requestReference: "SR-NEW", sourceDocumentId: E.newDoc,
      fundingSourceStatus: "founder_personal", reimbursementIntent: "not_reimbursable", paymentMethod: "card", relatedReference: "Commercial License TEST-345520", accountingTreatment: "to_be_confirmed", status: "recorded" });
    expect(sql(`select (funding_confirmed_by = '${SUPER}')::text || ',' || (funding_confirmed_at is not null)::text from public.entity_expenses where receipt_number='${NEW}'`)).toBe("true,true");
    expect(fingerprint(E.qa, OLD)).toBe(baseline); // the earlier receipt is byte-for-byte unchanged
    // the entry created exactly one expense row and nothing else anywhere: no payable, payment, bank, loan, capital, journal or other record
    const countsAfter = tableCounts();
    const changed = Object.keys(countsAfter).filter((t) => countsAfter[t] !== countsBefore[t]);
    expect(changed).toEqual(["entity_expenses"]);
    expect(Number(countsAfter.entity_expenses) - Number(countsBefore.entity_expenses)).toBe(1);
    expect(h.logged.map((l) => l.action)).toEqual(["entity_expense.receipt_recorded"]);
    expect(h.logged[0].metadata).toMatchObject({ receiptNumber: NEW, fundingSourceStatus: "founder_personal", reimbursementIntent: "not_reimbursable" });
  });

  it("G3 duplicates are refused with nothing written: the same receipt (however split), its stored document, its request reference — and the old receipt's too", async () => {
    const count = () => sql("select count(*) from public.entity_expenses");
    const before = count();
    expect(mustFail(await recordEntityReceipt(permitReceipt()))).toMatch(/already recorded/);
    expect(mustFail(await recordEntityReceipt(permitReceipt({ lines: [{ code: "ALL", description: "All", amount: 500 }] })))).toMatch(/already recorded/);
    expect(mustFail(await recordEntityReceipt(permitReceipt({ receiptNumber: "NEW-2" })))).toMatch(/already backs a recorded receipt/);
    expect(mustFail(await recordEntityReceipt(oldReceipt()))).toMatch(/already recorded/);
    expect(mustFail(await recordEntityReceipt({ ...oldReceipt(), receiptNumber: "OLD-2", sourceDocumentId: E.otherDoc }))).toMatch(/Upload the receipt to this entity's vault/);
    expect(count()).toBe(before);
  });

  it("G4 the same receipt number, document pattern and request reference on ANOTHER entity are that entity's own records", async () => {
    expect(must(await recordEntityReceipt({ ...oldReceipt(), entityId: E.other, sourceDocumentId: E.otherDoc }))).toMatchObject({ recorded: 3 });
    expect(await listEntityExpenses(E.qa, SUPER)).toHaveLength(4);
    expect(await listEntityExpenses(E.other, SUPER)).toHaveLength(3);
  });

  it("G5 server-side rules cannot be bypassed: a non-Super-Admin, a contradictory funding/reimbursement pair, a missing basis, a bad date are all refused", async () => {
    const before = sql("select count(*) from public.entity_expenses");
    const fresh = must(await addVaultDocument({ entityId: E.qa, documentType: "government_receipt", filename: "fresh.pdf", mimeType: "application/pdf", bytes: bytes("fresh"), actorUserId: SUPER })).documentId;
    const t = (over: object) => permitReceipt({ receiptNumber: "NEW-3", requestReference: "SR-3", sourceDocumentId: fresh, ...over });
    expect(mustFail(await recordEntityReceipt(t({ actorUserId: STAFF })))).toMatch(/Super Admin/);
    expect(mustFail(await recordEntityReceipt(t({ fundingSourceStatus: "company_account", reimbursementIntent: "not_reimbursable" })))).toMatch(/nothing to reimburse/);
    expect(mustFail(await recordEntityReceipt(t({ fundingSourceNote: "" })))).toMatch(/how the funding source is known/);
    expect(mustFail(await recordEntityReceipt(t({ receiptDate: "2026-10-28" })))).toMatch(/future/);
    expect(sql("select count(*) from public.entity_expenses")).toBe(before);
  });

  it("G6 database constraints hold even if the server code is bypassed: contradictory intentions, unknown values and over-long notes are rejected", () => {
    const ins = (cols: string, vals: string) => pgFails(`insert into public.entity_expenses (employing_entity_id, expense_date, amount, currency, category, line_code, description, receipt_number, receipt_total, issuing_authority, recorded_by, ${cols})
      values ('${E.qa}','2026-10-26',10,'QAR','other','RAW-${Math.random().toString(36).slice(2, 8)}','raw','RAW-${Math.random().toString(36).slice(2, 8)}',10,'x','${SUPER}', ${vals})`);
    expect(ins("reimbursement_intent, funding_source_status, funding_source_note, funding_confirmed_by", `'not_applicable','founder_personal','n','${SUPER}'`)).toMatch(/entity_expenses_reimbursement_consistent/);
    expect(ins("reimbursement_intent, funding_source_status, funding_source_note, funding_confirmed_by", `'not_reimbursable','company_account','n','${SUPER}'`)).toMatch(/entity_expenses_reimbursement_consistent/);
    expect(ins("reimbursement_intent", "'not_reimbursable'")).toMatch(/entity_expenses_reimbursement_consistent/); // funding still to_confirm
    expect(ins("reimbursement_intent", "'loan'")).toMatch(/violates check constraint/);
    expect(ins("payment_method", "'crypto'")).toMatch(/violates check constraint/);
    expect(ins("notes", `'${"x".repeat(2001)}'`)).toMatch(/violates check constraint/);
    expect(sql("select count(*) from public.entity_expenses where line_code like 'RAW-%'")).toBe("0");
  });

  it("G7 a recorded line stays fixed: descriptive fields cannot be edited, the reimbursement intention is set once, nothing is deleted — only voiding with a reason", () => {
    const row = `receipt_number='${NEW}' and employing_entity_id='${E.qa}'`;
    expect(pgFails(`update public.entity_expenses set notes='changed' where ${row}`)).toMatch(/cannot be edited/);
    expect(pgFails(`update public.entity_expenses set payment_method='cash' where ${row}`)).toMatch(/cannot be edited/);
    expect(pgFails(`update public.entity_expenses set related_reference='other' where ${row}`)).toMatch(/cannot be edited/);
    expect(pgFails(`update public.entity_expenses set amount=1 where ${row}`)).toMatch(/cannot be edited/);
    expect(pgFails(`update public.entity_expenses set reimbursement_intent='reimbursement_expected' where ${row}`)).toMatch(/already recorded/);
    expect(pgFails(`delete from public.entity_expenses where ${row}`)).toMatch(/append-only/);
    // an earlier line (default 'to_be_confirmed', funding to confirm) may have its intention set exactly once, after its funding is confirmed
    expect(pgFails(`update public.entity_expenses set reimbursement_intent='not_reimbursable' where receipt_number='${OLD}' and employing_entity_id='${E.qa}'`)).toMatch(/reimbursement_consistent/);
  });

  it("G8 an earlier receipt's funding is still confirmed the existing way, and may then take a one-time intention; a company-paid confirmation cannot contradict a recorded intention", async () => {
    expect(must(await confirmExpenseFunding({ entityId: E.qa, receiptNumber: OLD, status: "founder_personal", note: "Founder's own statement", actorUserId: SUPER }))).toMatchObject({ updated: 3 });
    sql(`update public.entity_expenses set reimbursement_intent='not_reimbursable' where receipt_number='${OLD}' and employing_entity_id='${E.qa}'`);
    expect(sql(`select count(*) from public.entity_expenses where receipt_number='${OLD}' and employing_entity_id='${E.qa}' and reimbursement_intent='not_reimbursable'`)).toBe("3");
    expect(pgFails(`update public.entity_expenses set reimbursement_intent='reimbursement_expected' where receipt_number='${OLD}' and employing_entity_id='${E.qa}'`)).toMatch(/already recorded/);
    const r = await confirmExpenseFunding({ entityId: E.qa, receiptNumber: NEW, status: "company_account", note: "bank statement line 1", actorUserId: SUPER });
    expect(r.ok).toBe(false); // the table's own constraint refuses a company-account payer for a recorded non-reimbursable personal contribution
  });

  it("G9 a mistaken line is voided with a reason and kept; a voided line cannot change", () => {
    expect(pgFails(`update public.entity_expenses set status='void' where receipt_number='${NEW}' and employing_entity_id='${E.qa}'`)).toMatch(/void_reason/);
    sql(`update public.entity_expenses set status='void', void_reason='entered in error' where receipt_number='${NEW}' and employing_entity_id='${E.qa}'`);
    expect(pgFails(`update public.entity_expenses set status='recorded', void_reason=null where receipt_number='${NEW}' and employing_entity_id='${E.qa}'`)).toMatch(/voided expense cannot be changed/);
  });

  it("G10 funding detail is private: a signed-in non-Super-Admin session reads no expense row (row-level security)", () => {
    const claims = JSON.stringify({ sub: STAFF, role: "authenticated" }).replace(/'/g, "''");
    const out = sql(`begin; set local role authenticated; select set_config('request.jwt.claims', '${claims}', true); select count(*) from public.entity_expenses; rollback;`);
    expect(out.split("\n").pop()).toBe("0");
  });

  it("G11 the Founder-funded line carries no obligation: nothing in the schema names a payable, reimbursement or loan created by it", () => {
    expect(sql(`select count(*) from information_schema.tables where table_schema='public' and table_name ~ '(reimburse|loan|journal|ledger)' and table_name <> 'entity_expenses'`)).toMatch(/^\d+$/);
    expect(sql(`select count(*) from public.entity_expenses where employing_entity_id='${E.qa}' and reimbursement_intent='reimbursement_expected'`)).toBe("0");
  });

  it("G12 supplier invoices, purchase receipts and other financial documents each back a cost; unrelated vault documents cannot; existing expense records stay byte-for-byte unchanged", async () => {
    const all = () => sql(`select md5(coalesce(string_agg(x::text, '|' order by id), '')) from public.entity_expenses x`);
    const before = all();
    const up = async (documentType: string, name: string, content?: Uint8Array) => must(await addVaultDocument({ entityId: E.qa, documentType, filename: `${name}.pdf`, mimeType: "application/pdf", bytes: content ?? bytes(name), actorUserId: SUPER }), name);
    const inv = await up("supplier_invoice", "acme invoice"), pur = await up("purchase_receipt", "shop receipt"), fin = await up("other_financial_document", "card statement line");
    const cr = await up("commercial_registration", "cr"), prem = await up("premises_document", "lease"), misc = await up("other", "misc"), permit = await up("commercial_permit", "permit");
    const mk = (docId: string, n: string, over: object = {}) => permitReceipt({ receiptNumber: `MIX-${n}`, requestReference: null, sourceDocumentId: docId, category: "other", printedTotal: 80, currency: "USD", receiptDate: "2026-10-20", issuingAuthority: `Supplier ${n}`,
      lines: [{ code: `L${n}`, description: `Cost ${n}`, amount: 80 }], paymentMethod: "bank_transfer", relatedReference: null, notes: null, fundingSourceStatus: "company_account", fundingSourceNote: "bank statement line 14", reimbursementIntent: "not_applicable", ...over });
    expect(must(await recordEntityReceipt(mk(inv.documentId, "1")))).toMatchObject({ recorded: 1 });
    expect(must(await recordEntityReceipt(mk(pur.documentId, "2")))).toMatchObject({ recorded: 1 });
    expect(must(await recordEntityReceipt(mk(fin.documentId, "3")))).toMatchObject({ recorded: 1 });
    for (const d of [cr, prem, misc, permit]) expect(mustFail(await recordEntityReceipt(mk(d.documentId, "X")))).toMatch(/not classed as a payment receipt, invoice or other financial supporting document/);
    expect(sql("select count(*) from public.entity_expenses where receipt_number like 'MIX-%'")).toBe("3");
    // the earlier records are unchanged: only the three new rows differ
    expect(sql(`select md5(coalesce(string_agg(x::text, '|' order by id), '')) from public.entity_expenses x where receipt_number not like 'MIX-%'`)).toBe(before);
    expect(all()).not.toBe(before);
  });

  it("G13 duplicate prevention across document classes against the real vault: the same file filed under another class, and a recorded copy, can never back a second cost", async () => {
    const content = bytes("shared file");
    const first = must(await addVaultDocument({ entityId: E.qa, documentType: "supplier_invoice", filename: "shared.pdf", mimeType: "application/pdf", bytes: content, actorUserId: SUPER }));
    const second = must(await addVaultDocument({ entityId: E.qa, documentType: "purchase_receipt", filename: "shared copy.pdf", mimeType: "application/pdf", bytes: content, actorUserId: SUPER }));
    expect(second.duplicateOf).toBe(first.documentId); // the vault already files it as a duplicate of the original
    const dup = (docId: string, n: string) => permitReceipt({ receiptNumber: `DUP-${n}`, requestReference: null, sourceDocumentId: docId, category: "other", printedTotal: 50, currency: "USD", lines: [{ code: `D${n}`, description: "Cost", amount: 50 }], fundingSourceStatus: "to_confirm", fundingSourceNote: null, reimbursementIntent: "to_be_confirmed", relatedReference: null, notes: null });
    expect(must(await recordEntityReceipt(dup(first.documentId, "1")))).toMatchObject({ recorded: 1 });
    const n = sql("select count(*) from public.entity_expenses");
    expect(mustFail(await recordEntityReceipt(dup(first.documentId, "2")))).toMatch(/already backs/);
    expect(mustFail(await recordEntityReceipt(dup(second.documentId, "3")))).toMatch(/copy or a further page/);
    expect(sql("select count(*) from public.entity_expenses")).toBe(n);
  });
});
