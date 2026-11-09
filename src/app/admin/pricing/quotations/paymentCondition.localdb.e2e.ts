// @vitest-environment node
//
// The quotation form's STRUCTURED PAYMENT CONDITION on the real schema (throwaway local Postgres + PostgREST, SYNTHETIC data only, nothing sent or stored outside the lab).
// Proves: the real create/update server actions store condition + deposit percent and the generated terms together; the database check ties them; a draft can be edited, an ISSUED quotation cannot;
// issuing does not change the content fingerprint rules; a revision carries the condition; staff and clients cannot create or edit.
// Run: supabase/proposals/e2e_scratch.sh, then E2E_SUPABASE_URL=http://127.0.0.1:54997 npx vitest run --config vitest.localdb.config.ts src/app/admin/pricing/quotations/paymentCondition.localdb.e2e.ts
import { execSync } from "node:child_process";
import { beforeAll, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  agent: null as unknown, current: null as unknown,
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
vi.mock("@/lib/supabase/server", async () => {
  const { createClient: make } = await import("@supabase/supabase-js");
  return { createClient: async () => make(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: h.fetch } }) };
});

import { createQuotationAction, updateQuotationDraftAction } from "./actions";
import { issueOrdinaryQuotation } from "@/lib/commercial/quotationIssuance";
import { reviseClientQuotation } from "@/lib/commercial/clientQuotations";

const sql = (q: string) => execSync("docker exec -i ordift-mig-check2 psql -U supabase_admin -h 127.0.0.1 -d p4_e2e -X -q -At -v ON_ERROR_STOP=1", { input: q }).toString().trim();
const sqlFails = (q: string) => { try { sql(q); return null; } catch (e) { return String((e as { stderr?: Buffer }).stderr ?? e); } };
const U = (n: number) => `00000000-0000-4000-8000-0000000000${n.toString(16).padStart(2, "0")}`;
const user = (n: number, roles: string[]) => ({ id: U(n), email: `u${n}@e2e.test`, fullName: `User ${n}`, roles, accessStatus: "active" });
const staff = user(0xe1, ["staff"]), admin = user(0xe2, ["admin"]), client = user(0xe4, ["client"]);
const crSql = (slug: string, cr: string) => `insert into public.entity_registrations (employing_entity_id, kind, status, identifier, valid_from, verified_at, verified_by, recorded_by) select id, 'commercial_registration', 'active', '${cr}', current_date - 30, now(), '${U(0xe3)}', '${U(0xe3)}' from public.employing_entities where slug = '${slug}' on conflict do nothing`;

const form = (o: Record<string, string>) => { const f = new FormData(); const base: Record<string, string> = { prospectName: "Synthetic Prospect", currency: "USD", "items[0][serviceItem]": "Portrait session", "items[0][quantity]": "1", "items[0][unitBasis]": "package", "items[0][sellingRate]": "351", ...o }; for (const [k, v] of Object.entries(base)) if (v !== undefined) f.set(k, v); return f; };
const row = (id: string) => JSON.parse(sql(`select row_to_json(t) from (select payment_condition, deposit_percent, payment_booking_terms, status from public.client_quotations where id='${id}') t`));
const created = async (o: Record<string, string>) => { h.current = admin; const r = await createQuotationAction(null, form(o)); if (!r?.ok) throw new Error(JSON.stringify(r)); return r.quotationId; };

beforeAll(() => {
  if (!/^https?:\/\/(127\.0\.0\.1|localhost)/.test(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "")) throw new Error("Refusing to run against a non-local database");
  sql(`
  set session_replication_role = replica;
  insert into auth.users (id,email) select ('00000000-0000-4000-8000-0000000000'||lpad(to_hex(n),2,'0'))::uuid, 'u'||n||'@e2e.test' from generate_series(225,228) n on conflict do nothing;
  insert into public.profiles (id, full_name, access_status) select ('00000000-0000-4000-8000-0000000000'||lpad(to_hex(n),2,'0'))::uuid, 'User '||n, 'active' from generate_series(225,228) n on conflict do nothing;
  insert into public.user_roles (user_id, role_id) select '${U(0xe2)}', r.id from public.roles r where r.slug='admin' on conflict do nothing;
  insert into public.currencies (code, name, symbol) values ('USD','US dollar','$') on conflict do nothing;
  insert into public.employment_jurisdictions (name, slug) values ('E2E Land','e2e-land') on conflict do nothing;
  insert into public.jurisdiction_entity_requirements (jurisdiction_id, requirement_key, category, label, identifier_label, registration_kind, necessity, shown_on_document, sort_order, approved_at)
    select id, 'legal_registration', 'legal_registration', 'Commercial Registration (CR)', 'Commercial Registration (CR) No.', 'commercial_registration', 'mandatory', true, 10, now() from public.employment_jurisdictions where slug = 'e2e-land' on conflict do nothing;
  insert into public.employing_entities (name, slug, legal_name, registration_type, verification_status, jurisdiction_id) values ('PC Entity','pc-entity','PC ENTITY W.L.L.','W.L.L.','verified', (select id from public.employment_jurisdictions where slug = 'e2e-land')) on conflict do nothing;
  ${crSql("pc-entity", "CR-PC-ENTITY")};
  `);
});

describe("creating a quotation with a payment condition", () => {
  it("stores the structured condition AND the generated terms together", async () => {
    const id = await created({ paymentCondition: "deposit", depositPercent: "50", paymentBookingTerms: "Cancellation within 48 hours forfeits the deposit." });
    expect(row(id)).toEqual({ payment_condition: "deposit", deposit_percent: 50, payment_booking_terms: "A 50% deposit is required to confirm the booking.\n\nCancellation within 48 hours forfeits the deposit.", status: "draft" });
    const full = await created({ paymentCondition: "full" }); expect(row(full)).toMatchObject({ payment_condition: "full", deposit_percent: null, payment_booking_terms: "Full payment is required before the booking is confirmed." });
    const none = await created({ paymentCondition: "none", depositPercent: "20" }); expect(row(none)).toMatchObject({ payment_condition: "none", deposit_percent: null });     // a stray percentage is dropped
  });
  it("refuses a missing choice, a bad deposit, or other terms that contradict the choice: nothing is created", async () => {
    h.current = admin; const before = sql("select count(*) from public.client_quotations");
    for (const o of [{} as Record<string, string>, { paymentCondition: "deposit" }, { paymentCondition: "deposit", depositPercent: "100" }, { paymentCondition: "deposit", depositPercent: "0" }, { paymentCondition: "maybe" }, { paymentCondition: "deposit", depositPercent: "50", paymentBookingTerms: "Full payment is required in advance." }, { paymentCondition: "none", paymentBookingTerms: "A 30% deposit secures the date." }]) {
      const r = await createQuotationAction(null, form(o)); expect(r, JSON.stringify(o)).toMatchObject({ ok: false });
    }
    expect(sql("select count(*) from public.client_quotations")).toBe(before);
  });
  it("only an admin or Super Admin can create one", async () => {
    for (const who of [staff, client, null]) { h.current = who; const before = sql("select count(*) from public.client_quotations"); const r = await createQuotationAction(null, form({ paymentCondition: "none" })); expect(r).toMatchObject({ ok: false }); expect(sql("select count(*) from public.client_quotations")).toBe(before); }
  });
  it("the database itself refuses a deposit with no percentage, or a percentage on a non-deposit", () => {
    const id = sql(`select id from public.client_quotations order by created_at desc limit 1`);
    expect(sqlFails(`update public.client_quotations set payment_condition='deposit', deposit_percent=null where id='${id}'`)).toMatch(/client_quotations_deposit_percent_check/);
    expect(sqlFails(`update public.client_quotations set payment_condition='full', deposit_percent=40 where id='${id}'`)).toMatch(/client_quotations_deposit_percent_check/);
  });
});

describe("editing", () => {
  it("a draft can change its condition; the old percentage is cleared and the wording follows", async () => {
    const id = await created({ paymentCondition: "deposit", depositPercent: "50" });
    h.current = admin; const r = await updateQuotationDraftAction(null, form({ quotationId: id, paymentCondition: "full", paymentBookingTerms: "Reschedule once free of charge." }));
    expect(r).toMatchObject({ ok: true }); expect(row(id)).toMatchObject({ payment_condition: "full", deposit_percent: null, payment_booking_terms: "Full payment is required before the booking is confirmed.\n\nReschedule once free of charge." });
  });
  it("staff and clients cannot edit a draft", async () => {
    const id = await created({ paymentCondition: "none" }); const before = JSON.stringify(row(id));
    for (const who of [staff, client, null]) { h.current = who; expect(await updateQuotationDraftAction(null, form({ quotationId: id, paymentCondition: "full" }))).toMatchObject({ ok: false }); }
    expect(JSON.stringify(row(id))).toBe(before);
  });
  it("an ISSUED quotation is never altered by the form: the edit is refused and every payment column is unchanged", async () => {
    const id = await created({ paymentCondition: "deposit", depositPercent: "30" });
    sql(`insert into public.booking_contracting_entities (subject_type, subject_id, version, employing_entity_id, basis, chosen_by) values ('quotation','${id}',1,(select id from public.employing_entities where slug = 'pc-entity'),'E2E recorded choice','${U(0xe3)}')`);
    h.current = admin; expect((await issueOrdinaryQuotation({ quotationId: id })).ok).toBe(true);
    const before = JSON.stringify(row(id)); const fp = sql(`select metadata->>'contentSha256' from public.activity_log where entity_id='${id}' and action='client_quotation.content_fingerprint' order by created_at desc limit 1`);
    expect(fp).toMatch(/^[0-9a-f]{64}$/);
    const r = await updateQuotationDraftAction(null, form({ quotationId: id, paymentCondition: "none" }));
    expect(r).toMatchObject({ ok: false, error: expect.stringMatching(/no longer a draft|Only a draft/) });
    expect(JSON.stringify(row(id))).toBe(before); expect(row(id)).toMatchObject({ payment_condition: "deposit", deposit_percent: 30 });
  });
  it("revising an issued quotation carries the condition into the new draft", async () => {
    const id = await created({ paymentCondition: "full" });
    sql(`insert into public.booking_contracting_entities (subject_type, subject_id, version, employing_entity_id, basis, chosen_by) values ('quotation','${id}',1,(select id from public.employing_entities where slug = 'pc-entity'),'E2E recorded choice','${U(0xe3)}')`);
    h.current = admin; expect((await issueOrdinaryQuotation({ quotationId: id })).ok).toBe(true);
    const rev = await reviseClientQuotation(id); expect(rev.ok).toBe(true);
    if (rev.ok) expect(row(rev.quotationId)).toMatchObject({ payment_condition: "full", deposit_percent: null, status: "draft", payment_booking_terms: "Full payment is required before the booking is confirmed." });
  });
});
