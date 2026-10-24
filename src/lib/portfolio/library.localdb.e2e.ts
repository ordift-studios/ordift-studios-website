// @vitest-environment node
//
// Portfolio library services against the REAL proposed schema (0168-0171 applied to a throwaway local Postgres + PostgREST). SYNTHETIC data only.
// The feature gate and the client-wording approval are switched on ONLY inside this test. Run: supabase/proposals/e2e_scratch.sh, then E2E_SUPABASE_URL=http://127.0.0.1:54997 npx vitest run --config vitest.localdb.config.ts src/lib/portfolio/library.localdb.e2e.ts
import { execSync } from "node:child_process";
import { beforeAll, describe, expect, it, vi } from "vitest";

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
vi.mock("./featureGate", () => ({ PORTFOLIO_LIBRARY_ENABLED: true }));
vi.mock("./permissionText", async (orig) => ({ ...(await orig<typeof import("./permissionText")>()), PERMISSION_TEXT_APPROVED: true }));
vi.mock("@/lib/supabase/admin", async () => {
  const { createClient: make } = await import("@supabase/supabase-js");
  return { createAdminClient: () => make(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: h.fetch } }) };
});
vi.mock("@/lib/supabase/server", async () => {
  const { createClient: make } = await import("@supabase/supabase-js");
  return { createClient: async () => make(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: h.fetch } }) };
});

import * as lib from "./library";
const DB = process.env.P4_E2E_DB ?? "p4_e2e";
const sql = (q: string) => execSync(`docker exec -i ordift-mig-check2 psql -U supabase_admin -h 127.0.0.1 -d ${DB} -X -q -At -v ON_ERROR_STOP=1`, { input: q }).toString().trim();
const U = (n: number) => `00000000-0000-4000-8000-0000000000${n.toString(16).padStart(2, "0")}`;
const user = (n: number, roles: string[]) => ({ id: U(n), email: `u${n}@e2e.test`, fullName: `User ${n}`, roles, accessStatus: "active" }) as unknown as Parameters<typeof lib.addPortfolioCandidates>[0];
const staff = user(0xb1, ["staff"]);
const founder = user(0xb2, ["super_admin"]);
const execAdmin = user(0xb3, ["staff"]);
const JOB1 = "00000000-0000-4000-8000-0000000c1001";
const JOB2 = "00000000-0000-4000-8000-0000000f2002";
const F1 = "00000000-0000-4000-8000-0000000a1001", F2 = "00000000-0000-4000-8000-0000000a1002", F3 = "00000000-0000-4000-8000-0000000a2003";

beforeAll(() => {
  if (!/^https?:\/\/(127\.0\.0\.1|localhost)/.test(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "")) throw new Error("Refusing to run against a non-local database");
  sql(`
  truncate public.portfolio_use_events, public.portfolio_internal_reviews, public.marketing_permission_records, public.marketing_permission_requests, public.portfolio_collection_items, public.portfolio_collections, public.portfolio_candidates cascade;
  `.replace(/truncate[^;]+;/, "") /* tables are append-only by trigger; the database is recreated per run instead */);
  sql(`
  set session_replication_role = replica;
  insert into auth.users (id,email) select ('00000000-0000-4000-8000-0000000000'||lpad(to_hex(n),2,'0'))::uuid, 'u'||n||'@e2e.test' from generate_series(177,181) n on conflict do nothing;
  insert into public.profiles (id, full_name, access_status) select ('00000000-0000-4000-8000-0000000000'||lpad(to_hex(n),2,'0'))::uuid, 'User '||n, 'active' from generate_series(177,181) n on conflict do nothing;
  insert into public.user_roles (user_id, role_id) select '${U(0xb2)}', r.id from public.roles r where r.slug='super_admin' on conflict do nothing;
  insert into public.authority_grants (profile_id, authority, scope_department_id, effective_at, granted_by) values ('${U(0xb3)}','executive_admin',null, now() - interval '1 day','${U(0xb2)}') on conflict do nothing;
  insert into public.enquiries (id, reference_number, email, full_name, service, user_id) values ('00000000-0000-4000-8000-00000000e101','ENQ-E2E-1','a@b.test','E2E One','photography','${U(0xb4)}') on conflict do nothing;
  insert into public.crew_support_requests (id, enquiry_id, reference_number, requester_type, requester_name, requester_email, requester_phone, service_family, project_name, start_date, end_date, location, consent_accepted_at)
    values ('${JOB1}','00000000-0000-4000-8000-00000000e101','CSR-E2E-000001','photographer','E2E','r@b.test','1','photography','Synthetic Wedding','2026-01-01','2026-01-01','X',now()) on conflict do nothing;
  insert into public.crew_support_slots (id, requirement_id, request_id, slot_number) values ('00000000-0000-4000-8000-00000000b101','00000000-0000-4000-8000-00000000d101','${JOB1}',1) on conflict do nothing;
  insert into public.engagements (id, entity_type, entity_id, external_payee_name) values ('00000000-0000-4000-8000-00000000f101','crew_support_slot','00000000-0000-4000-8000-00000000b101','Synthetic'),('${JOB2}','other_job','x','Synthetic') on conflict do nothing;
  insert into public.project_files (id, engagement_id, file_kind, storage_path, original_filename, mime_type, uploaded_by) values
    ('${F1}','00000000-0000-4000-8000-00000000f101','final_approved','p/1','one.jpg','image/jpeg','${U(0xb1)}'),('${F2}','00000000-0000-4000-8000-00000000f101','final_approved','p/2','two.jpg','image/jpeg','${U(0xb1)}'),('${F3}','${JOB2}','final_approved','p/3','three.jpg','image/jpeg','${U(0xb1)}') on conflict do nothing;
  insert into public.legal_document_masters (id, canonical_code, title, classification) values ('00000000-0000-4000-8000-00000000a901','OS-LGL-004-E2E','Synthetic release','release_authorization') on conflict do nothing;
  insert into public.legal_document_versions (id, master_id, version) values ('00000000-0000-4000-8000-00000000a902','00000000-0000-4000-8000-00000000a901','1.0') on conflict do nothing;
  insert into public.agreements (id, agreement_reference, master_id, master_version_id, classification, status, primary_context_type, primary_context_reference)
    values ('00000000-0000-4000-8000-00000000a101', 'AGR-E2E-1', '00000000-0000-4000-8000-00000000a901', '00000000-0000-4000-8000-00000000a902', 'standard', 'fully_executed', 'crew_support_request', 'CSR-E2E-000001') on conflict do nothing;
  insert into public.agreement_releases (agreement_id, master_code, usage_rights, territory, duration) values ('00000000-0000-4000-8000-00000000a101','OS-LGL-004','{"portfolio":true,"website":true}','worldwide','perpetual') on conflict do nothing;
  `);
});

describe("portfolio library services against the real schema", () => {
  it("staff propose candidates (idempotently) and build a collection across two jobs", async () => {
    const a = await lib.addPortfolioCandidates(staff, [F1, F2, F3], "picker");
    expect(a).toMatchObject({ ok: true, added: 3 });
    expect(await lib.addPortfolioCandidates(staff, [F1], "picker")).toMatchObject({ ok: true, added: 0, alreadyThere: 1 });
    const c = await lib.createCollection(staff, { name: "Weddings E2E", serviceCategory: "Weddings" });
    expect(c.ok).toBe(true);
    if (!c.ok) return;
    expect(await lib.addFilesToCollection(staff, c.id, [F1, F3])).toMatchObject({ ok: true, added: 2 });
    expect(await lib.addFilesToCollection(staff, c.id, [F1, F3])).toMatchObject({ ok: true, added: 0 });
    expect((await lib.listCollections()).find((x) => x.id === c.id)).toMatchObject({ name: "Weddings E2E", count: 2 });
    expect((await lib.listCollectionFileIds(c.id)).sort()).toEqual([F1, F3].sort());   // two different jobs, one collection, no copies
  });

  it("starts with nothing cleared; staff cannot record permission or approve", async () => {
    const s = await lib.getStandings([F1]);
    expect(s[F1].permission).toBe("No permission on record");
    expect(s[F1].usable).toEqual([]);
    expect((await lib.recordAdminPermission(staff, "crew_support_request", JOB1, perm())).ok).toBe(false);
    expect((await lib.recordInternalReview(staff, review(F1))).ok).toBe(false);
  });

  it("administrator-recorded permission counts only once verified; the internal approval is separate; both are needed", async () => {
    expect((await lib.recordAdminPermission(founder, "crew_support_request", JOB1, perm())).ok).toBe(true);
    let s = await lib.getStandings([F1]);
    expect(s[F1].permission).toMatch(/verification needed/i);
    const view = await lib.getJobPermissionView("crew_support_request", JOB1);
    const rec = view!.records.find((r) => r.decision === "granted")!;
    expect(rec.source).toBe("admin_recorded");
    expect(rec.grantedOn).toBeNull();                                    // no date was invented
    expect((await lib.verifyPermission(execAdmin, "crew_support_request", JOB1, rec.id, "checked the thread")).ok).toBe(true);
    s = await lib.getStandings([F1, F2]);
    expect(s[F1].usable).toEqual([]);                                    // permission alone is not enough
    expect((await lib.checkUseEligibility(F1, "portfolio"))).toMatchObject({ eligible: false, rightsReason: "permission_in_force", internalReason: "no_internal_review" });
    expect((await lib.recordInternalReview(execAdmin, review(F1))).ok).toBe(true);
    s = await lib.getStandings([F1, F2]);
    expect(s[F1].usable).toEqual(["portfolio"]);
    expect(s[F2].usable).toEqual([]);                                    // F2 was never internally approved
    expect((await lib.recordUse(founder, { fileId: F1, destination: "portfolio", action: "published", reference: "cms:1" })).ok).toBe(true);
    const refused = await lib.recordUse(founder, { fileId: F2, destination: "portfolio", action: "published", reference: "cms:2" });
    expect(refused.ok === false && refused.error).toMatch(/not eligible/);
  });

  it("withdrawal blocks future use and flags what is already in use, without removing it", async () => {
    expect((await lib.recordAdminPermission(founder, "crew_support_request", JOB1, { ...perm(), decision: "withdrawn", destinations: [], note: "client asked us to stop" })).ok).toBe(true);
    expect((await lib.getStandings([F1]))[F1].usable).toEqual([]);
    const again = await lib.recordUse(founder, { fileId: F1, destination: "portfolio", action: "shared", reference: "x" });
    expect(again.ok).toBe(false);
    expect(sql(`select count(*) from public.portfolio_uses_needing_review where project_file_id = '${F1}'`)).toBe("1");
    expect(sql(`select count(*) from public.portfolio_use_events where project_file_id = '${F1}'`)).toBe("1");   // the existing publication record is untouched
  });

  it("Route A: a signed agreement with a release is recognised and verified; a job without one is refused", async () => {
    const ok = await lib.recogniseContractPermission(founder, "crew_support_request", JOB1, { agreementId: "00000000-0000-4000-8000-00000000a101", clause: "7.2", destinations: ["portfolio", "website"], grantorName: "Synthetic Client" });
    expect(ok).toMatchObject({ ok: true, verified: true });
    const cands = await lib.listContractCandidates("crew_support_request", JOB1);
    expect(cands[0]).toMatchObject({ reference: "AGR-E2E-1", executed: true });
    const no = await lib.recogniseContractPermission(founder, "engagement", JOB2, { agreementId: "00000000-0000-4000-8000-00000000a101", clause: "7.2", destinations: ["portfolio"], grantorName: "X" });
    expect(no.ok).toBe(false);
  });

  it("Route B: a request addressed to the client; only they can answer; withdrawal is theirs alone", async () => {
    const req = await lib.createPermissionRequest(founder, { jobType: "crew_support_request", jobId: JOB1, addressedTo: U(0xb4), destinations: ["social_media", "journal"], fileIds: null });
    expect(req.ok).toBe(true);
    const reqId = sql(`select id from public.marketing_permission_requests where addressed_to = '${U(0xb4)}' and status = 'open'`);
    expect((await lib.answerPermissionRequest(U(0xb5), reqId, { decision: "granted", destinations: ["social_media"], restrictions: "", displayName: "Other" })).ok).toBe(false);
    expect((await lib.answerPermissionRequest(U(0xb4), reqId, { decision: "granted", destinations: ["paid_advertising"], restrictions: "", displayName: "Client" })).ok).toBe(false);
    expect((await lib.answerPermissionRequest(U(0xb4), reqId, { decision: "granted", destinations: ["social_media"], restrictions: "no guests' faces", displayName: "Client" })).ok).toBe(true);
    expect(sql(`select status from public.marketing_permission_requests where id = '${reqId}'`)).toBe("answered");
    const recId = sql(`select id from public.marketing_permission_records where source = 'client_portal' and decision = 'granted'`);
    expect((await lib.withdrawOwnPermission(U(0xb5), recId, "Other")).ok).toBe(false);
    expect((await lib.withdrawOwnPermission(U(0xb4), recId, "Client")).ok).toBe(true);
    expect(sql(`select (select reason from public.marketing_permission_state('${F1}', 'social_media'))`)).toBe("declined_or_withdrawn");
  });

  it("a candidate is a pointer: no file row was copied or altered", () => {
    expect(sql(`select count(*) from public.project_files where id in ('${F1}','${F2}','${F3}')`)).toBe("3");
    expect(sql(`select count(distinct project_file_id) from public.portfolio_candidates`)).toBe("3");
  });
});

function perm() {
  return { decision: "granted" as const, grantorName: "Synthetic Grantor", grantorCapacity: "client", destinations: ["portfolio"], fileIds: null, restrictions: "", expiresOn: "", method: "message", grantedOn: "", evidenceSummary: "message thread confirming the use", note: "", verified: false };
}
function review(fileId: string) {
  return { fileId, decision: "approved" as const, destinations: ["portfolio"], checks: { confidentiality: true, embargo: true, contractual_restrictions: true, release_rights: true, quality: true }, notes: "strong frame" };
}
