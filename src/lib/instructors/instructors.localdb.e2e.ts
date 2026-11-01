// @vitest-environment node
//
// INDEPENDENT-INSTRUCTOR FRAMEWORK (migration 0180) against the REAL schema (throwaway local Postgres + PostgREST). SYNTHETIC data only. Run on a FRESH scratch DB with 0177-0180 applied
// (the tables are append-only) and the private PostgREST restarted after applying:
//   E2E_DB=p4_e2e E2E_SUPABASE_URL=http://127.0.0.1:54997 npx vitest run --config vitest.localdb.config.ts src/lib/instructors/instructors.localdb.e2e.ts
import { createHash } from "node:crypto";
import { execSync } from "node:child_process";
import { beforeAll, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  agent: null as unknown, executed: true,
  logs: [] as { action: string; metadata: Record<string, unknown> }[],
  fetch: async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const undici = await import("undici");
    (h as { agent: unknown }).agent ??= new undici.Agent({ keepAliveTimeout: 1, keepAliveMaxTimeout: 1 });
    return (await undici.fetch(String(input).replace("/rest/v1", ""), { ...(init as object), dispatcher: (h as { agent: unknown }).agent as import("undici").Dispatcher })) as unknown as Response;
  },
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/instructors/featureGate", () => ({ INSTRUCTOR_FRAMEWORK_ENABLED: true }));
// E2E_SAFEGUARDING=1 runs the SAME flow with proposed migration 0181 applied and the schedule safeguarding gate ON (the 0180 guard stays active throughout; nothing is disabled).
vi.mock("@/lib/instructors/safeguardingGate", () => ({ SCHEDULE_SAFEGUARDING_ENABLED: process.env.E2E_SAFEGUARDING === "1" }));
vi.mock("@/lib/admin/activityLog", () => ({ logActivity: vi.fn(async (e: { action: string; metadata: Record<string, unknown> }) => { h.logs.push({ action: e.action, metadata: e.metadata }); }) }));
vi.mock("@/lib/legal/agreementEngine", () => ({ hasFullyExecutedAgreement: async () => h.executed }));
vi.mock("@/lib/supabase/admin", async () => {
  const { createClient: make } = await import("@supabase/supabase-js");
  return { createAdminClient: () => make(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: h.fetch } }) };
});

import { acknowledgeStandards, adoptStandards, createStandardsDraft, getAdoptedStandards, loadStandardsStateFor, retireStandards, updateStandardsDraft } from "./standards";
import { approveSchedule, closeSchedule, listSchedules, proposeSchedule, updateScheduleRightsAndClearance, updateScheduleSafeguarding } from "./assignments";
const SAFE = process.env.E2E_SAFEGUARDING === "1";
import { instructorAssignmentRefusal } from "@/lib/workshops/instructorEligibility";
import { EMPTY_RIGHTS } from "./rules";

if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:|\/|$)/.test(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "")) throw new Error("Refusing to run: this E2E may only target a localhost database.");
const SUPER = "00000000-0000-4000-8000-000000000c01", STAFF = "00000000-0000-4000-8000-000000000c02", INSTR = "00000000-0000-4000-8000-000000000c03", INSTR2 = "00000000-0000-4000-8000-000000000c04";
const sql = (q: string) => execSync(process.env.E2E_DB ? `docker exec -i ordift-mig-check2 psql -U supabase_admin -h 127.0.0.1 -d ${process.env.E2E_DB} -X -q -v ON_ERROR_STOP=1 -At` : "docker exec -i ordift-mig-check2 psql -U postgres -h 127.0.0.1 -v ON_ERROR_STOP=1 -At", { input: q }).toString().trim();
const sha = (s: string) => createHash("sha256").update(s, "utf8").digest("hex");
const BODY = "SYNTHETIC INDEPENDENT INSTRUCTOR STANDARDS. ".repeat(12);
const OPEN_BODY = `${BODY} [[DECISION: designated Ordift contact]]`;
const CONTACTS = { designatedContact: "Synthetic Contact, Role, 000", safeguardingContact: "Synthetic Lead, Role, 000", escalationContact: "Synthetic Founder", emergencyInstructions: "Contact the local emergency service first, then Ordift." };
let agrInstr = "", agrInstr2 = "", v1 = "";

beforeAll(() => {
  const mk = (id: string, ref: string, ctx: string, executed: boolean) => sql(`insert into public.agreements (agreement_reference, master_id, master_version_id, classification, status, primary_context_type, primary_context_reference, executed_at)
    select '${ref}', m.id, v.id, 'instructor', '${executed ? "executed" : "draft"}', 'instructor_profile', '${ctx}', ${executed ? "now()" : "null"} from public.legal_document_masters m join public.legal_document_versions v on v.master_id=m.id where m.canonical_code='OS-LGL-010' limit 1 returning id`).split("\n")[0];
  sql(`
    insert into auth.users (id, email) values ('${SUPER}','s@inst.test'),('${STAFF}','t@inst.test'),('${INSTR}','i1@inst.test'),('${INSTR2}','i2@inst.test') on conflict do nothing;
    insert into public.profiles (id, full_name, access_status) values ('${SUPER}','Synthetic Founder','active'),('${STAFF}','Synthetic Staff','active'),('${INSTR}','Synthetic Instructor One','active'),('${INSTR2}','Synthetic Instructor Two','active') on conflict (id) do nothing;
    insert into public.user_roles (user_id, role_id) select '${SUPER}', r.id from public.roles r where r.slug in ('admin','super_admin') on conflict do nothing;
    insert into public.user_roles (user_id, role_id) select '${STAFF}', r.id from public.roles r where r.slug = 'staff' on conflict do nothing;
    insert into public.staff_details (id, engagement_type_id) select u, t.id from public.engagement_types t, unnest(array['${INSTR}','${INSTR2}']::uuid[]) u where t.slug='instructor' on conflict (id) do update set engagement_type_id = excluded.engagement_type_id;
  `);
  agrInstr = mk("", "SYN-AGR-I1", INSTR, true); agrInstr2 = mk("", "SYN-AGR-I2", INSTR2, true);
});

describe("an executed agreement alone never makes an instructor assignable", () => {
  it("before any standards are adopted, even a fully executed agreement is refused (the gate fails closed)", async () => {
    h.executed = true;
    expect(await instructorAssignmentRefusal(INSTR)).toMatch(/not been adopted/);
    expect(await getAdoptedStandards()).toBeNull();
  });
});

describe("standards: draft -> adopted, by management only, never with open decisions or missing contacts", () => {
  it("staff cannot draft; the owner drafts text with an open decision", async () => {
    expect((await createStandardsDraft({ actorUserId: STAFF, versionLabel: "1.0", title: "Independent Instructor Standards", bodyText: OPEN_BODY, contacts: CONTACTS })).ok).toBe(false);
    const d = await createStandardsDraft({ actorUserId: SUPER, versionLabel: "1.0", title: "Independent Instructor Standards", bodyText: OPEN_BODY, contacts: { designatedContact: "", safeguardingContact: "", escalationContact: "", emergencyInstructions: "" } });
    expect(d.ok).toBe(true); v1 = (d as { id: string }).id;
    expect(sql(`select status||','||(body_sha256='${sha(OPEN_BODY)}')::text from public.instructor_standards_versions where id='${v1}'`)).toBe("draft,true"); // the database computes the hash of the exact text
  });
  it("adoption is refused with a readable list while a placeholder or a contact is open - and the database refuses it too", async () => {
    const r = await adoptStandards({ actorUserId: SUPER, versionId: v1, note: "Approved by management" });
    expect(r.ok).toBe(false);
    expect((r as { blockers?: string[] }).blockers?.length).toBe(5);       // 1 placeholder + 4 missing contacts
    expect(() => sql(`update public.instructor_standards_versions set status='adopted', adopted_by='${SUPER}' where id='${v1}'`)).toThrow();
    expect(await getAdoptedStandards()).toBeNull();
  });
  it("a draft cannot be acknowledged: not by the app, not by the database", async () => {
    expect((await acknowledgeStandards({ profileId: INSTR, versionId: v1, presentedSha256: sha(OPEN_BODY), typedFullName: "Synthetic Instructor One", consent: true, ipAddress: null, userAgent: null })).ok).toBe(false);
    expect(() => sql(`insert into public.instructor_standards_acknowledgements (profile_id, version_id, document_sha256, typed_full_name, consent_statement) values ('${INSTR}','${v1}','${sha(OPEN_BODY)}','Synthetic Instructor One','I have read and understood these standards fully')`)).toThrow();
    expect(sql(`select count(*) from public.instructor_standards_acknowledgements`)).toBe("0");
  });
  it("once the text and every contact are complete the owner adopts it; the text is then frozen and only one version can be adopted", async () => {
    expect((await updateStandardsDraft({ actorUserId: STAFF, versionId: v1, title: "Independent Instructor Standards", bodyText: BODY, contacts: CONTACTS })).ok).toBe(false);
    expect((await updateStandardsDraft({ actorUserId: SUPER, versionId: v1, title: "Independent Instructor Standards", bodyText: BODY, contacts: CONTACTS })).ok).toBe(true);
    expect((await adoptStandards({ actorUserId: STAFF, versionId: v1, note: "Approved by management" })).ok).toBe(false);
    const a = await adoptStandards({ actorUserId: SUPER, versionId: v1, note: "Approved by management" });
    expect(a).toEqual({ ok: true, sha256: sha(BODY) });
    expect(() => sql(`update public.instructor_standards_versions set body_text = body_text || ' edited' where id='${v1}'`)).toThrow();
    expect(() => sql(`update public.instructor_standards_versions set safeguarding_contact='other' where id='${v1}'`)).toThrow();
    expect(() => sql(`delete from public.instructor_standards_versions where id='${v1}'`)).toThrow();
    const d2 = await createStandardsDraft({ actorUserId: SUPER, versionLabel: "1.1", title: "Independent Instructor Standards", bodyText: BODY + "more", contacts: CONTACTS });
    const second = await adoptStandards({ actorUserId: SUPER, versionId: (d2 as { id: string }).id, note: "Approved by management" });
    expect(second.ok).toBe(false);                                         // retire 1.0 first
    expect((await getAdoptedStandards())?.id).toBe(v1);
  });
});

describe("acknowledgement: the exact adopted version and hash, by the instructor themself, with evidence", () => {
  it("only an independent instructor; consent and a typed name required; a stale hash is refused", async () => {
    expect((await acknowledgeStandards({ profileId: STAFF, versionId: v1, presentedSha256: sha(BODY), typedFullName: "Synthetic Staff", consent: true, ipAddress: null, userAgent: null })).ok).toBe(false); // not an instructor
    expect((await acknowledgeStandards({ profileId: INSTR, versionId: v1, presentedSha256: sha(BODY), typedFullName: "Synthetic Instructor One", consent: false, ipAddress: null, userAgent: null })).ok).toBe(false);
    expect((await acknowledgeStandards({ profileId: INSTR, versionId: v1, presentedSha256: sha(BODY), typedFullName: "ab", consent: true, ipAddress: null, userAgent: null })).ok).toBe(false);
    expect((await acknowledgeStandards({ profileId: INSTR, versionId: v1, presentedSha256: sha("older text"), typedFullName: "Synthetic Instructor One", consent: true, ipAddress: null, userAgent: null })).ok).toBe(false);
    expect(sql(`select count(*) from public.instructor_standards_acknowledgements`)).toBe("0");
    expect((await loadStandardsStateFor(STAFF)).state).toBe("not_available");   // not shown employee/other types
    expect((await loadStandardsStateFor(INSTR)).state).toBe("pending");
  });
  it("records identity, version, hash, timestamp, IP and user agent; a second acknowledgement of the same version is refused; the record is append-only", async () => {
    const r = await acknowledgeStandards({ profileId: INSTR, versionId: v1, presentedSha256: sha(BODY), typedFullName: "Synthetic Instructor One", consent: true, ipAddress: "203.0.113.7", userAgent: "SyntheticAgent/1.0" });
    expect(r).toEqual({ ok: true, sha256: sha(BODY) });
    expect(sql(`select (profile_id='${INSTR}')::text||','||(version_id='${v1}')::text||','||(document_sha256='${sha(BODY)}')::text||','||typed_full_name||','||ip_address||','||user_agent||','||(acknowledged_at is not null)::text from public.instructor_standards_acknowledgements`)).toBe("true,true,true,Synthetic Instructor One,203.0.113.7,SyntheticAgent/1.0,true");
    expect((await acknowledgeStandards({ profileId: INSTR, versionId: v1, presentedSha256: sha(BODY), typedFullName: "Synthetic Instructor One", consent: true, ipAddress: null, userAgent: null })).ok).toBe(false);
    expect(() => sql(`update public.instructor_standards_acknowledgements set typed_full_name='x'`)).toThrow();
    expect(() => sql(`delete from public.instructor_standards_acknowledgements`)).toThrow();
    expect((await loadStandardsStateFor(INSTR)).state).toBe("acknowledged");
    expect((await loadStandardsStateFor(INSTR2)).state).toBe("pending");
    expect(h.logs.map((l) => l.action)).toEqual(expect.arrayContaining(["instructor_standards.adopted", "instructor_standards.acknowledged"]));
  });
  it("the shared assignment gate: acknowledged instructor passes, an instructor with an executed agreement but no acknowledgement is refused, an unexecuted agreement is still refused", async () => {
    h.executed = true;
    expect(await instructorAssignmentRefusal(INSTR)).toBeNull();
    expect(await instructorAssignmentRefusal(INSTR2)).toMatch(/not acknowledged the current Independent Instructor Standards/);
    h.executed = false;
    expect(await instructorAssignmentRefusal(INSTR)).toMatch(/not fully executed/);
    h.executed = true;
    expect(await instructorAssignmentRefusal(STAFF)).toBeNull();            // people of other engagement types are unaffected
  });
});

describe("session schedule and rights matrix: proposed is not approved; nothing is granted by default", () => {
  const input = (profile: string, agreement: string) => ({ instructorProfileId: profile, agreementId: agreement, programmeName: "Synthetic photography masterclass", venue: "Synthetic Studio, Accra", firstSessionAt: "2027-02-01T09:00:00Z", durationMinutes: 120, frequency: "One session", responsibilities: "Deliver the synthetic masterclass", compensationReference: "Per Schedule A fee basis (reference only)" });
  let s1 = "", s2 = "";
  it("only a manager proposes; an instructor's schedule must use their own agreement; a new schedule is PROPOSED with every right unset", async () => {
    expect((await proposeSchedule({ actorUserId: STAFF, input: input(INSTR, agrInstr) })).ok).toBe(false);
    expect((await proposeSchedule({ actorUserId: SUPER, input: input(INSTR, agrInstr2) })).ok).toBe(false);   // someone else's agreement
    const a = await proposeSchedule({ actorUserId: SUPER, input: input(INSTR, agrInstr) }); expect(a.ok).toBe(true); s1 = (a as { id: string }).id;
    const b = await proposeSchedule({ actorUserId: SUPER, input: input(INSTR2, agrInstr2) }); expect(b.ok).toBe(true); s2 = (b as { id: string }).id;
    if (SAFE) for (const id of [s1, s2]) expect(await updateScheduleSafeguarding({ actorUserId: SUPER, scheduleId: id, input: { involvesMinors: false, venueSafeguarding: "", venueEmergency: "" } })).toEqual({ ok: true });
    expect(sql(`select status||','||regulatory_clearance from public.instructor_session_schedules where id='${s1}'`)).toBe("proposed,pending");
    expect(sql(`select concat_ws(',', teaching_materials_use, material_ownership, photography, recording, participant_data_access, publication_promotion) from public.instructor_rights_matrix where schedule_id='${s1}'`)).toBe("unset,unset,unset,unset,unset,unset");
  });
  it("approval is refused (readable reasons and by the database) until clearance is recorded and every right is decided; a flagged decision also blocks", async () => {
    const r = await approveSchedule({ actorUserId: SUPER, scheduleId: s1 });
    expect(r.ok).toBe(false);
    expect((r as { unmet?: string[] }).unmet?.length).toBe(2);               // regulatory + rights (agreement and standards are met for this instructor)
    expect(() => sql(`update public.instructor_session_schedules set status='approved', approved_by='${SUPER}' where id='${s1}'`)).toThrow();
    const rights = { ...EMPTY_RIGHTS, teachingMaterialsUse: "permitted", materialOwnership: "instructor_retains", photography: "not_permitted", recording: "not_permitted", participantDataAccess: "none", publicationPromotion: "not_permitted" } as const;
    expect((await updateScheduleRightsAndClearance({ actorUserId: STAFF, scheduleId: s1, rights: { ...EMPTY_RIGHTS, ...rights }, regulatoryClearance: "confirmed", regulatoryEvidenceReference: "Synthetic permit ref 123" })).ok).toBe(false);
    expect((await updateScheduleRightsAndClearance({ actorUserId: SUPER, scheduleId: s1, rights: { ...EMPTY_RIGHTS, ...rights, unresolvedDecisions: "Who owns any recording?" }, regulatoryClearance: "confirmed", regulatoryEvidenceReference: "Synthetic permit ref 123" })).ok).toBe(true);
    const flagged = await approveSchedule({ actorUserId: SUPER, scheduleId: s1 });
    expect(flagged.ok).toBe(false); expect((flagged as { unmet?: string[] }).unmet).toEqual(["No unresolved rights decision flagged for management"]);
    expect((await updateScheduleRightsAndClearance({ actorUserId: SUPER, scheduleId: s1, rights: { ...EMPTY_RIGHTS, ...rights }, regulatoryClearance: "confirmed", regulatoryEvidenceReference: "Synthetic permit ref 123" })).ok).toBe(true);
  });
  it("an instructor who has not acknowledged the standards cannot have an assignment approved, even with everything else complete (database level)", async () => {
    const rights = { ...EMPTY_RIGHTS, teachingMaterialsUse: "permitted", materialOwnership: "instructor_retains", photography: "not_permitted", recording: "not_permitted", participantDataAccess: "none", publicationPromotion: "not_permitted" } as const;
    expect((await updateScheduleRightsAndClearance({ actorUserId: SUPER, scheduleId: s2, rights: { ...EMPTY_RIGHTS, ...rights }, regulatoryClearance: "not_required", regulatoryEvidenceReference: "Synthetic: private tutoring, no licence applies" })).ok).toBe(true);
    const r = await approveSchedule({ actorUserId: SUPER, scheduleId: s2 });
    expect(r.ok).toBe(false); expect((r as { unmet?: string[] }).unmet).toEqual(["Instructor has acknowledged the adopted standards"]);
    expect(() => sql(`update public.instructor_session_schedules set status='approved', approved_by='${SUPER}' where id='${s2}'`)).toThrow();
    expect(sql(`select status from public.instructor_session_schedules where id='${s2}'`)).toBe("proposed");
  });
  it("only a Super Admin approves; the approved schedule records the standards version, is frozen, and its matrix is frozen", async () => {
    expect((await approveSchedule({ actorUserId: STAFF, scheduleId: s1 })).ok).toBe(false);
    expect(await approveSchedule({ actorUserId: SUPER, scheduleId: s1 })).toEqual({ ok: true });
    expect(sql(`select status||','||(standards_version_id='${v1}')::text||','||(approved_by='${SUPER}')::text from public.instructor_session_schedules where id='${s1}'`)).toBe("approved,true,true");
    expect(() => sql(`update public.instructor_session_schedules set venue='Elsewhere' where id='${s1}'`)).toThrow();
    expect(() => sql(`update public.instructor_rights_matrix set photography='permitted' where schedule_id='${s1}'`)).toThrow();
    expect((await updateScheduleRightsAndClearance({ actorUserId: SUPER, scheduleId: s1, rights: { ...EMPTY_RIGHTS }, regulatoryClearance: "pending", regulatoryEvidenceReference: "" })).ok).toBe(false);
    expect(() => sql(`delete from public.instructor_session_schedules where id='${s1}'`)).toThrow();
    const list = await listSchedules(); expect(list.find((x) => x.id === s1)?.status).toBe("approved"); expect(list.find((x) => x.id === s2)?.status).toBe("proposed");
  });
  (SAFE ? it : it.skip)("0181 + 0180 together: the safeguarding rule and every 0180 rule must both pass, in the app and in the database, with no guard disabled", async () => {
    const rights = { ...EMPTY_RIGHTS, teachingMaterialsUse: "permitted", materialOwnership: "instructor_retains", photography: "not_permitted", recording: "not_permitted", participantDataAccess: "none", publicationPromotion: "not_permitted" } as const;
    const p3 = await proposeSchedule({ actorUserId: SUPER, input: input(INSTR, agrInstr) }); expect(p3.ok).toBe(true); const s3 = (p3 as { id: string }).id;
    expect((await updateScheduleRightsAndClearance({ actorUserId: SUPER, scheduleId: s3, rights: { ...EMPTY_RIGHTS, ...rights }, regulatoryClearance: "confirmed", regulatoryEvidenceReference: "Synthetic permit ref 456" })).ok).toBe(true);
    // everything in 0180 is satisfied, but the minors question is undecided: refused by the app, and by the database
    const undecided = await approveSchedule({ actorUserId: SUPER, scheduleId: s3 });
    expect(undecided.ok).toBe(false); expect((undecided as { unmet?: string[] }).unmet?.[0]).toMatch(/under 18/);
    expect(() => sql(`update public.instructor_session_schedules set status='approved', approved_by='${SUPER}' where id='${s3}'`)).toThrow(/participants under 18/);
    // minors may attend but the venue arrangements are missing: refused by the app's validation and by the database
    expect((await updateScheduleSafeguarding({ actorUserId: SUPER, scheduleId: s3, input: { involvesMinors: true, venueSafeguarding: "", venueEmergency: "" } })).ok).toBe(false);
    sql(`update public.instructor_session_schedules set involves_minors = true where id='${s3}'`);
    expect(() => sql(`update public.instructor_session_schedules set status='approved', approved_by='${SUPER}' where id='${s3}'`)).toThrow(/safeguarding and emergency escalation arrangements/);
    expect((await approveSchedule({ actorUserId: SUPER, scheduleId: s3 })).ok).toBe(false);
    // only a Super Admin / manager can record the arrangements
    expect((await updateScheduleSafeguarding({ actorUserId: STAFF, scheduleId: s3, input: { involvesMinors: true, venueSafeguarding: "School safeguarding lead and procedure", venueEmergency: "School emergency procedure; local number 112" } })).ok).toBe(false);
    expect((await updateScheduleSafeguarding({ actorUserId: SUPER, scheduleId: s3, input: { involvesMinors: true, venueSafeguarding: "School safeguarding lead and procedure", venueEmergency: "School emergency procedure; local number 112" } })).ok).toBe(true);
    // with the safeguarding recorded the 0180 rules still apply: take away the regulatory reference and approval is refused again
    expect((await updateScheduleRightsAndClearance({ actorUserId: SUPER, scheduleId: s3, rights: { ...EMPTY_RIGHTS, ...rights }, regulatoryClearance: "pending", regulatoryEvidenceReference: "" })).ok).toBe(true);
    expect((await approveSchedule({ actorUserId: SUPER, scheduleId: s3 })).ok).toBe(false);
    expect(() => sql(`update public.instructor_session_schedules set status='approved', approved_by='${SUPER}' where id='${s3}'`)).toThrow(/regulatory clearance/);
    expect((await updateScheduleRightsAndClearance({ actorUserId: SUPER, scheduleId: s3, rights: { ...EMPTY_RIGHTS, ...rights }, regulatoryClearance: "confirmed", regulatoryEvidenceReference: "Synthetic permit ref 456" })).ok).toBe(true);
    expect(await approveSchedule({ actorUserId: SUPER, scheduleId: s3 })).toEqual({ ok: true });
    // approved terms, including the new fields, are frozen
    expect(() => sql(`update public.instructor_session_schedules set venue_emergency_arrangements='Changed after approval' where id='${s3}'`)).toThrow();
    expect(() => sql(`update public.instructor_session_schedules set involves_minors=false where id='${s3}'`)).toThrow();
    expect(sql(`select tgenabled from pg_trigger where tgname='instructor_session_schedules_guard'`)).toBe("O");         // the 0180 guard was never disabled
    expect(sql(`select tgenabled from pg_trigger where tgname='instructor_session_schedules_minors_guard'`)).toBe("O");
  });
  (SAFE ? it : it.skip)("an instructor who has not acknowledged the standards stays refused even when the safeguarding is fully recorded (0181 does not bypass 0180)", () => {
    expect(sql(`select involves_minors::text from public.instructor_session_schedules where id='${s2}'`)).toBe("false");
    expect(() => sql(`update public.instructor_session_schedules set status='approved', approved_by='${SUPER}' where id='${s2}'`)).toThrow(/acknowledged/);
  });
  it("a schedule can be cancelled with a note; a retired standards version stops being the gate until the new one is acknowledged", async () => {
    expect((await closeSchedule({ actorUserId: SUPER, scheduleId: s2, to: "cancelled", note: "Not proceeding" })).ok).toBe(true);
    expect((await closeSchedule({ actorUserId: SUPER, scheduleId: s2, to: "completed", note: "should fail" })).ok).toBe(false);
    expect((await retireStandards({ actorUserId: SUPER, versionId: v1 })).ok).toBe(true);
    expect(await instructorAssignmentRefusal(INSTR)).toMatch(/not been adopted/);
  });
  it("the instructor-facing agreement-signing tables were not touched and no employee policy acknowledgement was created", () => {
    expect(sql(`select count(*) from public.policy_acknowledgements where profile_id in ('${INSTR}','${INSTR2}')`)).toBe("0");
    expect(sql(`select count(*) from public.signature_requests where agreement_id in ('${agrInstr}','${agrInstr2}')`)).toBe("0");
  });
});

describe("privileges", () => {
  it("no signed-in or anonymous role can read or write any of the four tables; the service role cannot delete", () => {
    for (const t of ["instructor_standards_versions", "instructor_standards_acknowledgements", "instructor_session_schedules", "instructor_rights_matrix"]) {
      for (const role of ["authenticated", "anon"]) for (const priv of ["select", "insert", "update", "delete"]) expect(sql(`select has_table_privilege('${role}','public.${t}','${priv}')`), `${role} ${priv} ${t}`).toBe("f");
      expect(sql(`select has_table_privilege('service_role','public.${t}','delete') or has_table_privilege('service_role','public.${t}','truncate')`)).toBe("f");
    }
  });
});
