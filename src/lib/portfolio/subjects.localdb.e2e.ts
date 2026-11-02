// @vitest-environment node
//
// Structured permission evidence (PROPOSED 0182) through the REAL library code against the real schema (throwaway local Postgres + PostgREST with 0169-0171 and 0182 applied). SYNTHETIC data only.
// Run on a FRESH scratch DB (append-only tables): E2E_SUPABASE_URL=http://127.0.0.1:54997 npx vitest run --config vitest.localdb.config.ts src/lib/portfolio/subjects.localdb.e2e.ts
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
vi.mock("./subjectGate", () => ({ SUBJECT_PERMISSIONS_ENABLED: true }));
vi.mock("./permissionText", async (orig) => ({ ...(await orig<typeof import("./permissionText")>()), PERMISSION_TEXT_APPROVED: true }));
vi.mock("@/lib/supabase/admin", async () => {
  const { createClient: make } = await import("@supabase/supabase-js");
  return { createAdminClient: () => make(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: h.fetch } }) };
});
vi.mock("@/lib/supabase/server", async () => {
  const { createClient: make } = await import("@supabase/supabase-js");
  return { createClient: async () => make(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: h.fetch } }) };
});

import { createAdminClient } from "@/lib/supabase/admin";
import * as lib from "./library";
import * as subj from "./subjects";
import { setCandidateOrigin } from "./candidateJurisdiction";

if (!/^https?:\/\/(127\.0\.0\.1|localhost)/.test(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "")) throw new Error("Refusing to run against a non-local database");
const sql = (q: string) => execSync(`docker exec -i ordift-mig-check2 psql -U supabase_admin -h 127.0.0.1 -d ${process.env.P4_E2E_DB ?? "p4_e2e"} -X -q -At -v ON_ERROR_STOP=1`, { input: q }).toString().trim();
const U = (n: number) => `00000000-0000-4000-8000-0000000000${n.toString(16).padStart(2, "0")}`;
const user = (n: number, roles: string[]) => ({ id: U(n), email: `u${n}@e2e.test`, fullName: `User ${n}`, roles, accessStatus: "active" }) as unknown as Parameters<typeof lib.addPortfolioCandidates>[0];
const founder = user(0xb2, ["super_admin"]), staff = user(0xb1, ["staff"]);
const JOB = "00000000-0000-4000-8000-0000000d1001", F = "00000000-0000-4000-8000-0000000d2001";
const today = new Date().toISOString().slice(0, 10), earlier = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
const CHECKS = { confidentiality: true, embargo: true, contractual_restrictions: true, release_rights: true, quality: true };

beforeAll(() => {
  sql(`
  set session_replication_role = replica;
  insert into auth.users (id,email) select ('00000000-0000-4000-8000-0000000000'||lpad(to_hex(n),2,'0'))::uuid, 'u'||n||'@e2e.test' from generate_series(177,181) n on conflict do nothing;
  insert into public.profiles (id, full_name, access_status) select ('00000000-0000-4000-8000-0000000000'||lpad(to_hex(n),2,'0'))::uuid, 'User '||n, 'active' from generate_series(177,181) n on conflict do nothing;
  insert into public.user_roles (user_id, role_id) select '${U(0xb2)}', r.id from public.roles r where r.slug='super_admin' on conflict do nothing;
  insert into public.enquiries (id, reference_number, email, full_name, service) values ('00000000-0000-4000-8000-0000000d0101','ENQ-S-1','a@b.test','S One','photography') on conflict do nothing;
  insert into public.crew_support_requests (id, enquiry_id, reference_number, requester_type, requester_name, requester_email, requester_phone, service_family, project_name, start_date, end_date, location, consent_accepted_at)
    values ('${JOB}','00000000-0000-4000-8000-0000000d0101','CSR-S-000001','photographer','S','r@b.test','1','photography','Synthetic','2026-01-01','2026-01-01','X',now()) on conflict do nothing;
  insert into public.crew_support_slots (id, requirement_id, request_id, slot_number) values ('00000000-0000-4000-8000-0000000d0301','00000000-0000-4000-8000-0000000d0401','${JOB}',1) on conflict do nothing;
  insert into public.engagements (id, entity_type, entity_id, external_payee_name) values ('00000000-0000-4000-8000-0000000d0501','crew_support_slot','00000000-0000-4000-8000-0000000d0301','Synthetic') on conflict do nothing;
  insert into public.project_files (id, engagement_id, file_kind, storage_path, original_filename, mime_type, uploaded_by, release_status) values ('${F}','00000000-0000-4000-8000-0000000d0501','final_approved','s/1','s1.jpg','image/jpeg','${U(0xb1)}','released') on conflict do nothing;
  `);
});

describe("structured permission evidence through the real library", () => {
  let childId = "", adultId = "", grantChild = "", grantAdult = "";
  it("a photograph with client permission and internal approval is still not cleared until the people shown are declared", async () => {
    expect((await lib.recordAdminPermission(founder, "crew_support_request", JOB, { decision: "granted", grantorName: "Synthetic Client", grantorCapacity: "client", destinations: ["website"], fileIds: null, restrictions: "", expiresOn: "", method: "message", grantedOn: "", evidenceSummary: "message thread confirming the use", note: "", verified: true })).ok).toBe(true);
    expect((await lib.recordInternalReview(founder, { fileId: F, decision: "approved", destinations: ["website"], checks: CHECKS, notes: "" })).ok).toBe(true);   // no people statement is needed once structured evidence is live
    expect(await lib.checkUseEligibility(F, "website")).toMatchObject({ eligible: false, internalReason: "people_not_declared" });
    expect((await subj.declarePeopleShown(staff, F, "none_shown", "assessed: nobody identifiable here")).ok).toBe(false);          // staff cannot
    expect((await subj.declarePeopleShown(founder, F, "people_or_property_shown", "tick")).ok).toBe(false);                            // a bare tick is not an assessment
    expect((await subj.declarePeopleShown(founder, F, "people_or_property_shown", "a child and an adult guest are shown")).ok).toBe(true);
    expect(await lib.checkUseEligibility(F, "website")).toMatchObject({ eligible: false, internalReason: "people_shown_but_none_listed" });
  });
  it("each listed person needs a grant that is VERIFIED with the evidence examined; a recorded or asserted grant counts for nothing", async () => {
    expect((await subj.addSubject(founder, F, "child", "child in red, left of frame")).ok).toBe(false);   // the origin must be recorded before a child can be listed
    expect((await setCandidateOrigin(staff, F, "ghana")).ok).toBe(false);
    expect((await setCandidateOrigin(founder, F, "mars")).ok).toBe(false);
    expect((await setCandidateOrigin(founder, F, "ghana")).ok).toBe(true);
    const c = await subj.addSubject(founder, F, "child", "child in red, left of frame"); const a = await subj.addSubject(founder, F, "adult", "guest, centre");
    expect(c.ok && a.ok).toBe(true); childId = (c as { id: string }).id; adultId = (a as { id: string }).id;
    const base = { grantorName: "Parent Name", givenOn: earlier, evidenceKind: "signed_form", evidenceReference: "signed form kept in the job folder", destinations: ["website"] };
    expect((await subj.recordSubjectPermission(founder, { id: childId, kind: "child" }, { ...base, grantorKind: "authorized_representative", grantorRelationship: "organiser", authorityReference: "authority letter in job folder" })).ok).toBe(false);   // a representative cannot cover a child
    expect((await subj.recordSubjectPermission(founder, { id: childId, kind: "child" }, { ...base, grantorKind: "parent_guardian" })).ok).toBe(false);                                              // guardian needs a stated relationship
    const gc = await subj.recordSubjectPermission(founder, { id: childId, kind: "child" }, { ...base, grantorKind: "parent_guardian", grantorRelationship: "mother" }); expect(gc.ok).toBe(true); grantChild = (gc as { id: string }).id;
    const ga = await subj.recordSubjectPermission(founder, { id: adultId, kind: "adult" }, { grantorKind: "subject_self", grantorName: "Guest Name", givenOn: earlier, evidenceKind: "written_message", evidenceReference: "guest email kept in the job folder", destinations: ["website"] }); expect(ga.ok).toBe(true); grantAdult = (ga as { id: string }).id;
    expect(await lib.checkUseEligibility(F, "website")).toMatchObject({ eligible: false, internalReason: "people_permission_missing" });
    expect((await subj.verifySubjectPermission(founder, adultId, grantAdult, "", "Read the message and checked the sender")).ok).toBe(false);   // no evidence examined named
    expect((await subj.verifySubjectPermission(staff, adultId, grantAdult, "guest email kept in the job folder", "Read the message and checked the sender")).ok).toBe(false);
    expect((await subj.verifySubjectPermission(founder, adultId, grantAdult, "guest email kept in the job folder", "Read the message and checked the sender")).ok).toBe(true);
    expect((await lib.checkUseEligibility(F, "website")).eligible).toBe(false);                                                                       // the child is still unverified
    expect((await subj.verifySubjectPermission(founder, childId, grantChild, "signed form kept in the job folder, sheet 2", "Checked the signed form against the guardian")).ok).toBe(true);
    expect((await lib.checkUseEligibility(F, "website")).eligible).toBe(true);
    // interim restriction: an identifiable child on a photograph marked as originating in Qatar blocks promotional approval and use, whatever evidence exists; other origins are unaffected
    sql(`update public.portfolio_candidates set jurisdiction = 'qatar' where project_file_id = '${F}'`);
    expect(await subj.childQatarRestriction(F)).toMatch(/Qatar/);
    expect(await lib.checkUseEligibility(F, "website")).toMatchObject({ eligible: false, internalReason: "children_qatar_restricted" });
    expect((await lib.recordInternalReview(founder, { fileId: F, decision: "approved", destinations: ["website"], checks: CHECKS, notes: "" })).ok).toBe(false);
    // an unknown origin fails closed (treated as Qatar), and an origin outside Qatar lifts the restriction
    sql(`update public.portfolio_candidates set jurisdiction = null where project_file_id = '${F}'`);
    expect(await subj.childQatarRestriction(F)).toMatch(/not recorded|Qatar/);
    expect(await lib.checkUseEligibility(F, "website")).toMatchObject({ eligible: false, internalReason: "children_qatar_restricted" });
    expect((await setCandidateOrigin(founder, F, "other")).ok).toBe(true);
    expect(await subj.childQatarRestriction(F)).toBeNull();
    expect((await subj.getPeopleViews([F]))[F].origin).toBe("other");
    expect((await lib.checkUseEligibility(F, "website")).eligible).toBe(true);
    expect((await lib.recordUse(founder, { fileId: F, destination: "website", action: "published", reference: "cms:1" })).ok).toBe(true);
  });
  it("the admin read model reports each grant's status; withdrawal blocks future use at once and flags the use already made", async () => {
    let v = (await subj.getPeopleViews([F]))[F];
    expect(v.declaration?.value).toBe("people_or_property_shown"); expect(v.subjects.map((s) => s.grants[0].status)).toEqual(["verified", "verified"]);
    expect((await subj.withdrawSubjectPermission(founder, childId, grantChild, "Guardian withdrew permission by message")).ok).toBe(true);
    v = (await subj.getPeopleViews([F]))[F]; expect(v.subjects.find((s) => s.id === childId)!.grants[0].status).toBe("withdrawn");
    expect((await lib.checkUseEligibility(F, "website")).eligible).toBe(false);
    expect((await lib.recordUse(founder, { fileId: F, destination: "website", action: "shared", reference: "x" })).ok).toBe(false);
    expect(sql(`select count(*) from public.portfolio_uses_needing_review where project_file_id = '${F}'`)).toBe("1");
    expect(sql(`select count(*) from public.portfolio_use_events where project_file_id = '${F}'`)).toBe("1");   // the existing record is untouched
  });
  it("a replacement grant supersedes at once and counts only once verified; erasure only after the permission is no longer in force", async () => {
    const r = await subj.recordSubjectPermission(founder, { id: adultId, kind: "adult" }, { grantorKind: "subject_self", grantorName: "Guest Name", givenOn: today, evidenceKind: "written_message", evidenceReference: "new guest email kept in the job folder", destinations: ["website"], replacesGrantId: grantAdult });
    expect(r.ok).toBe(true); const g2 = (r as { id: string }).id;
    expect((await subj.getPeopleViews([F]))[F].subjects.find((s) => s.id === adultId)!.grants.map((g) => g.status)).toEqual(["replaced", "recorded_unverified"]);
    expect((await subj.redactSubjectPermission(founder, g2, "retention period ended for this record", "other_documented", false)).ok).toBe(false);   // no confirmation
    expect((await subj.setFileHold(staff, F, "placed", "complaint under review: keep all evidence")).ok).toBe(false);
    expect((await subj.setFileHold(founder, F, "placed", "complaint under review: keep all evidence")).ok).toBe(true);
    expect((await subj.redactSubjectPermission(founder, g2, "retention period ended for this record", "other_documented", true)).ok).toBe(false);   // a hold blocks erasure
    expect((await subj.getPeopleViews([F]))[F].hold?.reason).toMatch(/complaint/);
    expect((await subj.setFileHold(founder, F, "released", "complaint closed, no further action")).ok).toBe(true);
    expect((await subj.redactSubjectPermission(founder, g2, "retention period ended for this record", "other_documented", true)).ok).toBe(false);   // the website use made earlier is still current: end or review it first
    sql(`set session_replication_role = replica; insert into public.portfolio_use_events (project_file_id, destination, action, actor_id) values ('${F}','website','ended','${U(0xb2)}')`);
    expect((await subj.redactSubjectPermission(founder, g2, "retention period ended for this record", "other_documented", true)).ok).toBe(true);   // recorded but unverified is not in force, so it may be erased
    expect((await subj.redactSubjectPermission(staff, grantChild, "retention period ended for this record", "other_documented", true)).ok).toBe(false);
    expect((await subj.redactSubjectPermission(founder, grantChild, "retention period ended for this record", "other_documented", true)).ok).toBe(true);   // the withdrawn child grant
    const view = (await subj.getPeopleViews([F]))[F].subjects.find((s) => s.id === childId)!.grants[0];
    expect(view.erased).toBe(true); expect(view.destinations).toEqual(["website"]); expect(view.status).toBe("withdrawn");   // structure kept, personal details gone
    expect(sql(`select count(*) from public.portfolio_subject_redactions where confirmed_permitted`)).toBe("2");
    expect((await subj.redactSubjectPermission(founder, g2, "second attempt on an erased record", "", true)).ok).toBe(false);   // a basis is required
    expect(sql(`select count(*) from public.portfolio_subject_redactions where basis = 'other_documented'`)).toBe("2");   // 0184: the basis is recorded
    // Regression: an erased permission can never be verified (reactivated) again; a new permission has to be recorded.
    const verifiedBefore = sql(`select count(*) from public.portfolio_subject_permissions where decision = 'verified' and supersedes_id in ('${g2}','${grantChild}')`);   // the child grant was properly verified before it was withdrawn
    for (const [sid, gid] of [[adultId, g2], [childId, grantChild]] as const) {
      const r = await subj.verifySubjectPermission(founder, sid, gid, "ID card sighted in person", "checked the erased record again");
      expect(r.ok).toBe(false); expect((r as { error: string }).error).toMatch(/erased/);
    }
    expect(sql(`select count(*) from public.portfolio_subject_permissions where decision = 'verified' and supersedes_id in ('${g2}','${grantChild}')`)).toBe(verifiedBefore);   // the refused attempts wrote nothing
    // 0184 revision 4 (L6): the DATABASE refuses it too, for a direct service-role write that bypasses the application. g2 was recorded but never verified or withdrawn, so only the new guard can stop it.
    const direct = await createAdminClient().from("portfolio_subject_permissions").insert({ subject_id: adultId, decision: "verified", supersedes_id: g2, evidence_reference: "ID card sighted in person", note: "direct write attempt", recorded_by: U(0xb2) });
    expect(direct.error?.message ?? "").toMatch(/erased/);
    expect(sql(`select count(*) from public.portfolio_subject_permissions where decision = 'verified' and supersedes_id in ('${g2}','${grantChild}')`)).toBe(verifiedBefore);
    // a withdrawal of the erased grant is still accepted (protective), through the same direct route
    const wd = await createAdminClient().from("portfolio_subject_permissions").insert({ subject_id: adultId, decision: "withdrawn", supersedes_id: g2, note: "withdrawn after erasure", recorded_by: U(0xb2) });
    expect(wd.error).toBeNull();
  });
  it("no photograph, person or permission was copied into any client-facing table and nothing was published", () => {
    expect(sql(`select count(*) from public.portfolio_use_events where action = 'published'`)).toBe("1");
    expect(sql(`select count(*) from public.marketing_permission_requests`)).toBe("0");
  });
});
