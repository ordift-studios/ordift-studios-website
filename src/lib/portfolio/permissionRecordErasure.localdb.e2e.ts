// @vitest-environment node
//
// Controlled erasure of the older client-permission records (PROPOSED 0183 revision 2) through the REAL library against the real schema (throwaway local Postgres + PostgREST with 0169-0171, 0182 rev2 and 0183 applied). SYNTHETIC data only.
// Run on a FRESH scratch DB: E2E_SUPABASE_URL=http://127.0.0.1:54997 npx vitest run --config vitest.localdb.config.ts src/lib/portfolio/permissionRecordErasure.localdb.e2e.ts
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
vi.mock("./erasureGate", () => ({ PERMISSION_RECORD_ERASURE_ENABLED: true }));
vi.mock("@/lib/supabase/admin", async () => {
  const { createClient: make } = await import("@supabase/supabase-js");
  return { createAdminClient: () => make(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: h.fetch } }) };
});

import * as er from "./permissionRecordErasure";

if (!/^https?:\/\/(127\.0\.0\.1|localhost)/.test(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "")) throw new Error("Refusing to run against a non-local database");
const sql = (q: string) => execSync(`docker exec -i ordift-mig-check2 psql -U supabase_admin -h 127.0.0.1 -d ${process.env.P4_E2E_DB ?? "p4_e2e"} -X -q -At -v ON_ERROR_STOP=1`, { input: q }).toString().trim();
const U = (n: number) => `00000000-0000-4000-8000-0000000000${n.toString(16).padStart(2, "0")}`;
const user = (n: number, roles: string[]) => ({ id: U(n), email: `u${n}@e2e.test`, fullName: `User ${n}`, roles, accessStatus: "active" }) as unknown as Parameters<typeof er.setJobHold>[0];
const founder = user(0xb2, ["super_admin"]), staff = user(0xb1, ["staff"]);
const JOB = "00000000-0000-4000-8000-0000000e1001", OLDJOB = "00000000-0000-4000-8000-0000000e1002";
const FILE = "00000000-0000-4000-8000-0000000e2001", OLDFILE = "00000000-0000-4000-8000-0000000e2002";
let G = "", OLDG = "";

beforeAll(() => {
  const job = (n: number, req: string, file: string) => `
  insert into public.enquiries (id, reference_number, email, full_name, service) values ('00000000-0000-4000-8000-0000000e01${n}0','ENQ-E-${n}','a@b.test','E ${n}','photography') on conflict do nothing;
  insert into public.crew_support_requests (id, enquiry_id, reference_number, requester_type, requester_name, requester_email, requester_phone, service_family, project_name, start_date, end_date, location, consent_accepted_at)
    values ('${req}','00000000-0000-4000-8000-0000000e01${n}0','CSR-E-00000${n}','photographer','E','r@b.test','1','photography','Synthetic ${n}','2026-01-01','2026-01-01','X',now()) on conflict do nothing;
  insert into public.crew_support_slots (id, requirement_id, request_id, slot_number) values ('00000000-0000-4000-8000-0000000e03${n}0','00000000-0000-4000-8000-0000000e04${n}0','${req}',1) on conflict do nothing;
  insert into public.engagements (id, entity_type, entity_id, external_payee_name) values ('00000000-0000-4000-8000-0000000e05${n}0','crew_support_slot','00000000-0000-4000-8000-0000000e03${n}0','Synthetic') on conflict do nothing;
  insert into public.project_files (id, engagement_id, file_kind, storage_path, original_filename, mime_type, uploaded_by) values ('${file}','00000000-0000-4000-8000-0000000e05${n}0','final_approved','s/${n}','s${n}.jpg','image/jpeg','${U(0xb1)}') on conflict do nothing;`;
  sql(`
  set session_replication_role = replica;
  insert into auth.users (id,email) select ('00000000-0000-4000-8000-0000000000'||lpad(to_hex(n),2,'0'))::uuid, 'u'||n||'@e2e.test' from generate_series(177,181) n on conflict do nothing;
  insert into public.profiles (id, full_name, access_status) select ('00000000-0000-4000-8000-0000000000'||lpad(to_hex(n),2,'0'))::uuid, 'User '||n, 'active' from generate_series(177,181) n on conflict do nothing;
  insert into public.user_roles (user_id, role_id) select '${U(0xb2)}', r.id from public.roles r where r.slug='super_admin' on conflict do nothing;
  ${job(1, JOB, FILE)} ${job(2, OLDJOB, OLDFILE)}
  insert into public.marketing_permission_records (id, job_type, job_id, source, decision, grantor_name, grantor_capacity, allowed_destinations, method, evidence_summary, evidence_storage_path, verification_status, note, recorded_by)
    values ('00000000-0000-4000-8000-0000000e3001','crew_support_request','${JOB}','admin_recorded','granted','Synthetic Client','client',array['website'],'message','message thread confirming the use','evidence/thread.png','verified','agreed','${U(0xb2)}');
  insert into public.marketing_permission_records (id, job_type, job_id, source, decision, grantor_name, grantor_capacity, allowed_destinations, method, evidence_summary, verification_status, recorded_by, recorded_at)
    values ('00000000-0000-4000-8000-0000000e3002','crew_support_request','${OLDJOB}','admin_recorded','granted','Old Client','client',array['website'],'message','old message thread confirming','verified','${U(0xb2)}', now() - interval '8 years');
  insert into public.marketing_permission_records (job_type, job_id, source, decision, supersedes_id, grantor_name, grantor_capacity, method, evidence_summary, note, recorded_by, recorded_at)
    values ('crew_support_request','${OLDJOB}','admin_recorded','withdrawn','00000000-0000-4000-8000-0000000e3002','Old Client','client','message','client withdrew by message thread','withdrew','${U(0xb2)}', now() - interval '7 years');
  `);
  G = "00000000-0000-4000-8000-0000000e3001"; OLDG = "00000000-0000-4000-8000-0000000e3002";
});

describe("controlled erasure through the real library", () => {
  it("management only; the retention policy must be recorded first; the policy is a management record, never seeded", async () => {
    expect(await er.getErasureView("crew_support_request", JOB)).toMatchObject({ policyYears: null });
    expect((await er.recordRetentionPolicy(staff, 6, "six years after the permission and last use ended")).ok).toBe(false);
    expect((await er.recordRetentionPolicy(founder, 0, "six years after the permission and last use ended")).ok).toBe(false);
    const before = await er.eraseRecordDetails(founder, OLDG, { basis: "retention_period_ended", reason: "retention period ended for this record", confirmPermitted: true, storageObjectRemoved: false });
    expect(before.ok === false && before.error).toMatch(/no retention policy/);
    expect((await er.recordRetentionPolicy(founder, 6, "six years after the permission and last use ended; longer where a duty, dispute or hold requires")).ok).toBe(true);
    expect((await er.getErasureView("crew_support_request", JOB))!.policyYears).toBe(6);
  });
  it("an in-force permission, a missing confirmation or a bad reason is refused", async () => {
    const base = { basis: "data_subject_request" as const, reason: "data subject asked for erasure of details", confirmPermitted: true, storageObjectRemoved: true };
    expect((await er.eraseRecordDetails(founder, G, base)).ok).toBe(false);                                           // in force
    expect((await er.eraseRecordDetails(founder, OLDG, { ...base, confirmPermitted: false })).ok).toBe(false);
    expect((await er.eraseRecordDetails(founder, OLDG, { ...base, reason: "short" })).ok).toBe(false);
    expect((await er.eraseRecordDetails(staff, OLDG, base)).ok).toBe(false);
  });
  it("a hold blocks erasure on every basis; only management places or releases it", async () => {
    expect((await er.setJobHold(staff, "crew_support_request", OLDJOB, "placed", "complaint under review: keep all evidence")).ok).toBe(false);
    expect((await er.setJobHold(founder, "crew_support_request", OLDJOB, "placed", "short")).ok).toBe(false);
    expect((await er.setJobHold(founder, "crew_support_request", OLDJOB, "placed", "complaint under review: keep all evidence")).ok).toBe(true);
    expect((await er.getErasureView("crew_support_request", OLDJOB))!.hold?.reason).toMatch(/complaint/);
    expect((await er.eraseRecordDetails(founder, OLDG, { basis: "retention_period_ended", reason: "retention period ended for this record", confirmPermitted: true, storageObjectRemoved: false })).ok).toBe(false);
    expect((await er.setJobHold(founder, "crew_support_request", OLDJOB, "released", "complaint closed, no further action")).ok).toBe(true);
  });
  it("a stored evidence file is never deleted by this code and its reference cannot be dropped without confirmation", async () => {
    // withdraw the recent grant so only the file and the period remain as blockers
    sql(`set session_replication_role = replica; insert into public.marketing_permission_records (job_type, job_id, source, decision, supersedes_id, grantor_name, grantor_capacity, method, evidence_summary, note, recorded_by) values ('crew_support_request','${JOB}','admin_recorded','withdrawn','${G}','Synthetic Client','client','message','client withdrew by message thread','withdrew','${U(0xb2)}')`);
    const view = (await er.getErasureView("crew_support_request", JOB))!;
    expect(view.rows[0].hasStoredFile).toBe(true); expect(view.rows[0].blockersRetention.join(" ")).toMatch(/stored evidence file is attached/);
    const base = { basis: "data_subject_request" as const, reason: "data subject asked for erasure of details", confirmPermitted: true };
    expect((await er.eraseRecordDetails(founder, G, { ...base, storageObjectRemoved: false })).ok).toBe(false);          // reference kept: the file cannot be orphaned silently
    expect(sql(`select evidence_storage_path from public.marketing_permission_records where id = '${G}'`)).toBe("evidence/thread.png");
    expect((await er.eraseRecordDetails(founder, G, { ...base, basis: "retention_period_ended", storageObjectRemoved: true })).ok).toBe(false);   // retention basis: recent end, period not ended
    expect((await er.eraseRecordDetails(founder, G, { ...base, storageObjectRemoved: true })).ok).toBe(true);           // shorter retention where a person asked, with the file removal confirmed
    expect(sql(`select (evidence_storage_path is null)::text || ',' || grantor_name from public.marketing_permission_records where id = '${G}'`)).toBe("true,[erased]");
    expect(sql(`select storage_object_removed::text || ',' || basis from public.marketing_permission_redactions where record_id = '${G}'`)).toBe("true,data_subject_request");
  });
  it("on the retention basis an old record is erased once six years have passed; the permission's scope, uses and state are unchanged; the log keeps the basis", async () => {
    const view = (await er.getErasureView("crew_support_request", OLDJOB))!;
    expect(view.rows[0].blockersRetention).toEqual([]);
    expect((await er.eraseRecordDetails(founder, OLDG, { basis: "retention_period_ended", reason: "six year retention period ended for this record", confirmPermitted: true, storageObjectRemoved: false })).ok).toBe(true);
    expect(sql(`select decision || ',' || array_to_string(allowed_destinations, ',') || ',' || verification_status || ',' || grantor_name from public.marketing_permission_records where id = '${OLDG}'`)).toBe("granted,website,verified,[erased]");
    expect(sql(`select count(*) from public.marketing_permission_records where supersedes_id = '${OLDG}' and decision = 'withdrawn'`)).toBe("1");   // the withdrawal is still on record
    expect(sql(`select basis from public.marketing_permission_redactions where record_id = '${OLDG}'`)).toBe("retention_period_ended");
    expect((await er.getErasureView("crew_support_request", OLDJOB))!.rows[0].erased).toBe(true);
  });
});
