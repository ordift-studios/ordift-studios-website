// @vitest-environment node
//
// The quotation PDF ROUTE (GET /admin/pricing/quotations/[id]/document) end to end on the REAL schema (throwaway local Postgres + PostgREST): the actual route handler, the actual loader,
// the actual PDF renderer. SYNTHETIC data only; nothing is stored, emailed or sent. Authentication is the same test seam the other localdb suites use (the signed-in user is supplied to the
// handler); no real session, credential or Production system is involved.
// Run: supabase/proposals/e2e_scratch.sh, then E2E_SUPABASE_URL=http://127.0.0.1:54997 npx vitest run --config vitest.localdb.config.ts src/lib/commercial/quotationDocumentRoute.localdb.e2e.ts
import { execSync } from "node:child_process";
import { NextRequest } from "next/server";
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
vi.mock("@/lib/supabase/server", async () => {
  const { createClient: make } = await import("@supabase/supabase-js");
  return { createClient: async () => make(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: h.fetch } }) };
});

import { GET } from "../../app/admin/pricing/quotations/[id]/document/route";
import { createClientQuotation } from "./clientQuotations";
import { issueOrdinaryQuotation } from "./quotationIssuance";

const sql = (q: string) => execSync("docker exec -i ordift-mig-check2 psql -U supabase_admin -h 127.0.0.1 -d p4_e2e -X -q -At -v ON_ERROR_STOP=1", { input: q }).toString().trim();
const U = (n: number) => `00000000-0000-4000-8000-0000000000${n.toString(16).padStart(2, "0")}`;
const user = (n: number, roles: string[]) => ({ id: U(n), email: `u${n}@e2e.test`, fullName: `User ${n}`, roles, accessStatus: "active" });
const staff = user(0xe1, ["staff"]), admin = user(0xe2, ["admin"]), client = user(0xe4, ["client"]);
const crSql = (slug: string, cr: string) => `insert into public.entity_registrations (employing_entity_id, kind, status, identifier, valid_from, verified_at, verified_by, recorded_by) select id, 'commercial_registration', 'active', '${cr}', current_date - 100, now(), 'U3', 'U3' from public.employing_entities where slug = '${slug}' and not exists (select 1 from public.entity_registrations r where r.employing_entity_id = employing_entities.id and r.kind = 'commercial_registration')`.replace(/U3/g, U(0xe3));

const get = async (id: string, query = "") => GET(new NextRequest(`http://localhost:3000/admin/pricing/quotations/${id}/document${query}`), { params: Promise.resolve({ id }) });
async function draft(): Promise<string> {
  h.current = admin;
  const r = await createClientQuotation({ prospectName: "Synthetic Prospect", currency: "USD", items: [{ serviceItem: "Portrait session", quantity: 1, unitBasis: "package", sellingRate: 351 }] });
  if (!r.ok) throw new Error(r.error);
  sql(`insert into public.booking_contracting_entities (subject_type, subject_id, version, employing_entity_id, basis, chosen_by) values ('quotation','${r.quotationId}',1,(select id from public.employing_entities where slug = 'rt-entity'),'E2E recorded choice','${U(0xe3)}')`);
  return r.quotationId;
}

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
  insert into public.employing_entities (name, slug, legal_name, registration_type, verification_status, jurisdiction_id) values ('RT Entity','rt-entity','RT ENTITY W.L.L.','W.L.L.','verified', (select id from public.employment_jurisdictions where slug = 'e2e-land')) on conflict do nothing;
  ${crSql("rt-entity", "CR-RT-ENTITY")};
  `);
});

describe("the quotation PDF route", () => {
  it("a draft has no document; an unknown or malformed id is a plain 404", async () => {
    const q = await draft();
    h.current = admin;
    expect((await get(q)).status).toBe(422);
    expect((await get("not-a-uuid")).status).toBe(404);
    expect((await get(U(0xff))).status).toBe(404);
  });

  it("only a signed-in admin or Super Admin gets the PDF; staff, clients and nobody get a plain 404 that reveals nothing", async () => {
    const q = await draft();
    h.current = admin;
    expect((await issueOrdinaryQuotation({ quotationId: q })).ok).toBe(true);
    for (const who of [staff, client, null]) {
      h.current = who;
      const res = await get(q);
      expect(res.status).toBe(404);
      expect(await res.text()).toBe("Not found");
    }
  });

  it("an issued quotation returns a real, private, non-cached PDF that carries the content fingerprint recorded at issue", async () => {
    const q = await draft();
    h.current = admin;
    expect((await issueOrdinaryQuotation({ quotationId: q })).ok).toBe(true);
    const baseline = JSON.parse(sql(`select metadata::text from public.activity_log where entity_id='${q}' and action='client_quotation.content_fingerprint' order by created_at desc limit 1`));
    const res = await get(q);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/pdf");
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    expect(res.headers.get("content-disposition")).toMatch(/^inline; filename="/);
    expect(res.headers.get("x-content-fingerprint")).toBe(baseline.contentSha256);
    const bytes = Buffer.from(await res.arrayBuffer());
    expect(bytes.subarray(0, 5).toString("latin1")).toBe("%PDF-");
    expect(bytes.length).toBeGreaterThan(5_000);
    expect((await get(q, "?download=1")).headers.get("content-disposition")).toMatch(/^attachment; filename="/);
  });

  it("generating the PDF changes nothing: no audit event, no status change, no delivery record", async () => {
    const q = await draft();
    h.current = admin;
    expect((await issueOrdinaryQuotation({ quotationId: q })).ok).toBe(true);
    const state = () => sql(`select (select count(*) from public.activity_log where entity_id='${q}')||'/'||(select status from public.client_quotations where id='${q}')`);
    const before = state();
    expect((await get(q)).status).toBe(200);
    expect(state()).toBe(before);
  });

  it("if the lines were changed behind the application's back after issue, the PDF is refused (409), never silently re-printed", async () => {
    const q = await draft();
    h.current = admin;
    expect((await issueOrdinaryQuotation({ quotationId: q })).ok).toBe(true);
    expect((await get(q)).status).toBe(200);
    sql(`update public.client_quotation_items set selling_rate = selling_rate + 1, line_total = line_total + 1 where quotation_id='${q}'`);
    const res = await get(q);
    expect(res.status).toBe(409);
    expect(res.headers.get("content-type")).toMatch(/text\/plain/);
  });
});
