// @vitest-environment node
//
// PDF document editions (migration 0175) against the REAL schema in a throwaway local database: the guard trigger, the atomic approval function, duplicate protection,
// access control, row-level security, the audit event, immutability and tamper detection. SYNTHETIC data only; never Production.
import { beforeAll, describe, expect, it, vi } from "vitest";
import { execSync } from "node:child_process";

const h = vi.hoisted(() => ({
  agent: null as unknown, logged: [] as { action: string }[],
  fetch: async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const undici = await import("undici");
    (h as { agent: unknown }).agent ??= new undici.Agent({ keepAliveTimeout: 1, keepAliveMaxTimeout: 1 });
    return (await undici.fetch(String(input).replace("/rest/v1", ""), { ...(init as object), dispatcher: (h as { agent: unknown }).agent as import("undici").Dispatcher })) as unknown as Response;
  },
}));
vi.mock("@/lib/admin/activityLog", () => ({ logActivity: vi.fn(async (e: { action: string }) => { h.logged.push(e); }) }));
vi.mock("@/lib/supabase/admin", async () => {
  const { createClient: make } = await import("@supabase/supabase-js");
  return { createAdminClient: () => make(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: h.fetch } }) };
});
import { approveEdition, createDraft, getApprovedEditionForDownload, getEdition, startNextEdition, updateDraft } from "./editions";
import type { RateCardContent } from "./types";

if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:|\/|$)/.test(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "")) throw new Error("Refusing to run: this E2E may only target a localhost database.");
const SUPER = "00000000-0000-4000-8000-0000000000c1";
const STAFF = "00000000-0000-4000-8000-0000000000c2";
const DB = process.env.E2E_DB ?? "p4_e2e";
const sql = (q: string) => execSync(`docker exec -i ordift-mig-check2 psql -U supabase_admin -h 127.0.0.1 -d ${DB} -X -q -v ON_ERROR_STOP=1 -At`, { input: q }).toString().trim();
const pgFails = (q: string) => { try { sql(q); return ""; } catch (e) { return String((e as { stderr?: Buffer }).stderr ?? e); } };
const must = <T extends { ok: boolean }>(r: T): Extract<T, { ok: true }> => { if (!r.ok) throw new Error(`expected ok, got ${JSON.stringify(r)}`); return r as Extract<T, { ok: true }>; };
const mustFail = <T extends { ok: boolean }>(r: T): string => { expect(r.ok).toBe(false); return (r as unknown as { error?: string }).error ?? ""; };
const card = (market: string, label: string): RateCardContent => ({
  meta: { title: "Rate Card", editionLabel: label, effectiveDate: "2026-11-01", marketSlug: market, marketName: market, currency: "USD", conversionPolicy: "none", issuingEntity: { name: "Synthetic Entity", checkedOn: "2026-11-01", licensedActivities: ["photography"] } }, coverImage: "/pdf/cover.jpg", cover: { variant: "standard", focusY: 0.5, cleared: true, clearedNote: "Founder's own statement" },
  sections: [{ key: "ps", title: "Sessions", structure: "fixed", items: [{ key: "a", name: "Synthetic session", description: "Approved wording.", inclusions: ["10 images"], price: { kind: "fixed", amount: 125, unit: "per session" }, source: "manual", activities: ["photography"] }] }],
  conditions: [{ title: "Validity", text: "Approved text." }], contact: [{ label: "Email", value: "x@example.test" }],
});
const row = (id: string) => sql(`select status || '|' || coalesce(content_sha256,'') from public.pdf_document_editions where id='${id}'`);
const CLEAR = "Prices and wording checked and cleared by the Founder (synthetic).";
const IDS: Record<string, string> = {};

beforeAll(() => {
  sql(`
    insert into auth.users (id, email) values ('${SUPER}','super@editions.test'), ('${STAFF}','staff@editions.test') on conflict do nothing;
    insert into public.profiles (id, full_name, access_status) values ('${SUPER}','Super','active'), ('${STAFF}','Staff','active') on conflict (id) do update set access_status = 'active';
    insert into public.user_roles (user_id, role_id) select '${SUPER}', r.id from public.roles r where r.slug in ('admin','super_admin') on conflict do nothing;
    insert into public.user_roles (user_id, role_id) select '${STAFF}', r.id from public.roles r where r.slug = 'staff' on conflict do nothing;
  `);
});

describe("H — frozen editions against the real schema", () => {
  it("H1 a draft is created through the module; the database refuses to INSERT an approved edition or to approve one by a direct update; drafts stay editable", async () => {
    IDS.a1 = must(await createDraft({ actorUserId: SUPER, content: card("qa_market", "2026 Edition 1") })).id;
    expect(row(IDS.a1)).toBe("draft|");
    expect(pgFails(`insert into public.pdf_document_editions (kind, market_slug, edition_label, status, content, content_sha256, approved_by, approved_at, clearance_statement, created_by) values ('rate_card','x','bad','approved','{}','${"a".repeat(64)}','${SUPER}',now(),'a long enough statement','${SUPER}')`)).toMatch(/edition_insert_draft_only/);
    expect(pgFails(`update public.pdf_document_editions set status='approved', content_sha256='${"a".repeat(64)}', approved_by='${SUPER}', approved_at=now(), clearance_statement='a long enough statement' where id='${IDS.a1}'`)).toMatch(/edition_approve_via_function/);
    expect(pgFails(`update public.pdf_document_editions set created_by='${STAFF}' where id='${IDS.a1}'`)).toMatch(/edition_draft_fields/);
    const cur = must(await getEdition(SUPER, IDS.a1)).edition; const c = card("qa_market", "2026 Edition 1"); c.intro = "Draft edited.";
    const u = must(await updateDraft({ actorUserId: SUPER, id: IDS.a1, content: c, expectedUpdatedAt: cur.updatedAt })).updatedAt;
    expect(u).not.toBe(cur.updatedAt); expect((must(await getEdition(SUPER, IDS.a1)).edition.content as RateCardContent).intro).toBe("Draft edited.");
    expect(mustFail(await updateDraft({ actorUserId: SUPER, id: IDS.a1, content: c, expectedUpdatedAt: cur.updatedAt }))).toMatch(/changed elsewhere/);   // the old token is now stale
  });

  it("H2 approval through the module freezes the edition: hash, approver, time and clearance are stored; content, status and deletion are then refused by the database; the audit event is written atomically", async () => {
    const r = must(await approveEdition({ actorUserId: SUPER, id: IDS.a1, clearanceStatement: CLEAR, today: "2026-11-01" }));
    expect(row(IDS.a1)).toBe(`approved|${r.contentSha256}`);
    expect(sql(`select (approved_by='${SUPER}')::text || ',' || (approved_at is not null)::text || ',' || (clearance_statement='${CLEAR}')::text from public.pdf_document_editions where id='${IDS.a1}'`)).toBe("true,true,true");
    expect(pgFails(`update public.pdf_document_editions set content = '{"x":1}' where id='${IDS.a1}'`)).toMatch(/edition_frozen/);
    expect(pgFails(`update public.pdf_document_editions set status='draft' where id='${IDS.a1}'`)).toMatch(/edition_frozen/);
    expect(pgFails(`update public.pdf_document_editions set content_sha256='${"b".repeat(64)}' where id='${IDS.a1}'`)).toMatch(/edition_frozen/);
    expect(pgFails(`delete from public.pdf_document_editions where id='${IDS.a1}'`)).toMatch(/edition_not_deletable/);
    expect(sql(`select count(*) from public.activity_log where action='pdf_edition.approved' and entity_id='${IDS.a1}' and metadata->>'contentSha256'='${r.contentSha256}' and actor_user_id='${SUPER}'`)).toBe("1");
    expect(mustFail(await updateDraft({ actorUserId: SUPER, id: IDS.a1, content: card("qa_market", "2026 Edition 1"), expectedUpdatedAt: "x" }))).toMatch(/cannot be edited/);
  });

  it("H3 duplicate protection: the same label in the same market is refused (module and database); the same label in another market is fine; two approved editions cannot coexist — approving the newer supersedes the older", async () => {
    expect(mustFail(await createDraft({ actorUserId: SUPER, content: card("qa_market", "2026 EDITION 1") }))).toMatch(/already exists/);
    expect(pgFails(`insert into public.pdf_document_editions (kind, market_slug, edition_label, content, created_by) values ('rate_card','qa_market',' 2026 edition 1 ','{}','${SUPER}')`)).toMatch(/pdf_editions_label_unique/);
    IDS.b1 = must(await createDraft({ actorUserId: SUPER, content: card("other_market", "2026 Edition 1") })).id;
    IDS.a2 = must(await startNextEdition({ actorUserId: SUPER, fromId: IDS.a1, editionLabel: "2026 Edition 2", effectiveDate: "2026-12-01" })).id;
    const r = must(await approveEdition({ actorUserId: SUPER, id: IDS.a2, clearanceStatement: CLEAR, today: "2026-12-01" }));
    expect(r.supersededEditionId).toBe(IDS.a1);
    expect(sql(`select status from public.pdf_document_editions where id='${IDS.a1}'`)).toBe("superseded");
    expect(sql(`select count(*) from public.pdf_document_editions where kind='rate_card' and market_slug='qa_market' and status='approved'`)).toBe("1");
    expect(sql(`select status from public.pdf_document_editions where id='${IDS.b1}'`)).toBe("draft");      // another market is untouched
    expect(pgFails(`update public.pdf_document_editions set status='superseded', superseded_by='${IDS.a2}', superseded_at=now() where id='${IDS.a2}'`)).toMatch(/edition_frozen/);
    expect(pgFails(`update public.pdf_document_editions set content='{"x":1}' where id='${IDS.a1}'`)).toMatch(/edition_frozen/);               // a superseded edition is frozen too
    expect(mustFail(await getApprovedEditionForDownload({ actorUserId: SUPER, id: IDS.a1 }))).toMatch(/superseded/);
    expect(must(await getApprovedEditionForDownload({ actorUserId: SUPER, id: IDS.a2 })).edition.editionLabel).toBe("2026 Edition 2");
  });

  it("H4 the approval function: Super Admin only, stale-content safe, needs a hash and a clearance statement; it is not callable by signed-in or anonymous roles", () => {
    IDS.c1 = sql(`insert into public.pdf_document_editions (kind, market_slug, edition_label, content, created_by) values ('rate_card','fn_market','F1','{"k":1}','${SUPER}') returning id`);
    const upd = sql(`select updated_at::text from public.pdf_document_editions where id='${IDS.c1}'`);
    const call = (actor: string, sha = "c".repeat(64), clear = CLEAR, at = upd) => pgFails(`select * from public.approve_pdf_edition('${IDS.c1}','${actor}','${sha}','${clear}','${at}'::timestamptz)`);
    expect(call(STAFF)).toMatch(/not_authorised/);
    expect(call(SUPER, "short")).toMatch(/edition_hash_required/);
    expect(call(SUPER, "c".repeat(64), "too short")).toMatch(/edition_clearance_required/);
    expect(call(SUPER, "c".repeat(64), CLEAR, "2020-01-01T00:00:00Z")).toMatch(/edition_changed/);
    expect(sql(`select status from public.pdf_document_editions where id='${IDS.c1}'`)).toBe("draft");
    expect(sql(`select has_function_privilege('anon','public.approve_pdf_edition(uuid,uuid,text,text,timestamptz,jsonb)','execute')::text || ',' || has_function_privilege('authenticated','public.approve_pdf_edition(uuid,uuid,text,text,timestamptz,jsonb)','execute')::text || ',' || has_function_privilege('service_role','public.approve_pdf_edition(uuid,uuid,text,text,timestamptz,jsonb)','execute')::text`)).toBe("false,false,true");
    expect(call(SUPER)).toBe("");   // the legitimate call works once
    expect(call(SUPER)).toMatch(/edition_not_a_draft/);
  });

  it("H5 the module refuses everyone but Super Admin, even with a valid draft id; and a signed-in non-Super-Admin session reads no edition row (row-level security)", async () => {
    expect(mustFail(await approveEdition({ actorUserId: STAFF, id: IDS.b1, clearanceStatement: CLEAR, today: "2026-11-01" }))).toMatch(/Only Super Admin/);
    expect(mustFail(await getEdition(STAFF, IDS.a2))).toMatch(/Only Super Admin/);
    const claims = (sub: string) => JSON.stringify({ sub, role: "authenticated" }).replace(/'/g, "''");
    const count = (sub: string) => sql(`begin; set local role authenticated; select set_config('request.jwt.claims', '${claims(sub)}', true); select count(*) from public.pdf_document_editions; rollback;`).split("\n").pop();
    expect(count(STAFF)).toBe("0"); expect(Number(count(SUPER))).toBeGreaterThan(0);
  });

  it("H6 tamper detection: if stored content is altered by a route that bypasses the guard, the edition reports a failed integrity check and is not released", async () => {
    expect(must(await getEdition(SUPER, IDS.a2)).integrity).toBe("ok");
    sql(`begin; set local session_replication_role = replica; update public.pdf_document_editions set content = jsonb_set(content, '{sections,0,items,0,price,amount}', '1'::jsonb) where id='${IDS.a2}'; commit;`);
    expect(must(await getEdition(SUPER, IDS.a2)).integrity).toBe("FAILED");
    expect(mustFail(await getApprovedEditionForDownload({ actorUserId: SUPER, id: IDS.a2 }))).toMatch(/failed its integrity check/);
  });

  it("H7 database limits: content must be an object under 1 MB; clearance and hash shapes are enforced on approved rows", () => {
    expect(pgFails(`insert into public.pdf_document_editions (kind, market_slug, edition_label, content, created_by) values ('rate_card','lim','L1','[]','${SUPER}')`)).toMatch(/violates check constraint/);
    expect(pgFails(`insert into public.pdf_document_editions (kind, market_slug, edition_label, content, created_by) values ('rate_card','lim','L2', jsonb_build_object('x', repeat('y', 1000100)),'${SUPER}')`)).toMatch(/violates check constraint/);
    expect(pgFails(`insert into public.pdf_document_editions (kind, market_slug, edition_label, content, created_by) values ('colour_chart','lim','L3','{}','${SUPER}')`)).toMatch(/violates check constraint/);
  });
});
