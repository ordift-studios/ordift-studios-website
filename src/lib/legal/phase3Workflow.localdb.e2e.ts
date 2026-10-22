// @vitest-environment node
//
// Contributor Phase 3 workflow against the REAL schema (throwaway local Postgres built from the migration chain + PostgREST): real
// authority checks, real constraints, real foreign keys. SYNTHETIC data only. Only the private storage bucket is stubbed (there is no storage
// API locally); email is never involved. Run: npx vitest run --config vitest.localdb.config.ts src/lib/legal/phase3Workflow.localdb.e2e.ts
import { createHash } from "node:crypto";
import { execSync } from "node:child_process";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { makeZip } from "./zipFixture.testkit";

const h = vi.hoisted(() => ({
  agent: null as unknown,
  storage: {} as Record<string, Uint8Array>,
  fetch: async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const undici = await import("undici");
    (h as { agent: unknown }).agent ??= new undici.Agent({ keepAliveTimeout: 1, keepAliveMaxTimeout: 1 });
    return (await undici.fetch(String(input).replace("/rest/v1", ""), { ...(init as object), dispatcher: (h as { agent: unknown }).agent as import("undici").Dispatcher })) as unknown as Response;
  },
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/admin/activityLog", () => ({ logActivity: vi.fn(async () => undefined) })); // best-effort session-scoped logger; the decision records use the strict service-role writer
vi.mock("@/lib/content/sanity/workshopAdmin", () => ({ getWorkshopByIdAdmin: async () => null }));
vi.mock("@/lib/supabase/admin", async () => {
  const { createClient: make } = await import("@supabase/supabase-js");
  return {
    createAdminClient: () => {
      const real = make(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: h.fetch } });
      return new Proxy(real, {
        get(target, prop) {
          if (prop === "storage") return { from: () => ({ download: async (path: string) => (h.storage[path] ? { data: new Blob([h.storage[path] as BlobPart]), error: null } : { data: null, error: { message: "missing" } }), upload: async (path: string, body: Buffer) => { h.storage[path] = new Uint8Array(body); return { error: null }; } }) };
          if (prop === "auth") return { admin: { getUserById: async () => ({ data: { user: { email: "kwaku.synthetic@example.test" } } }) } };
          return Reflect.get(target, prop);
        },
      });
    },
  };
});

import { attestHistoricalApproval, activateMasterVersion, registerControlledMaster } from "./masterRegistryActions";
import { confirmContractingEntity, selectAgreementSignatory } from "@/lib/organization/onboardingDecisions";
import { addEntitySignatory, addVaultDocument, findActiveProfileByMemberNumber } from "@/lib/organization/entityRegistrations";
import { loadAgreementReadiness } from "./agreementReadinessData";
import { prepareInstructorAgreementDraft, getCurrentInstructorAgreement, resolveOnboardingLegalContext } from "./instructorAgreements";
import { createInstructorEngagement } from "@/lib/workshops/instructorEngagements";
import { createWorkshopSession } from "@/lib/workshops/sessions";
import { updateOnboardingRequirement, authorizeOnboardingRequirementOverride, getUnsatisfiedRequiredRequirements } from "@/lib/organization/onboardingRequirements";
import { transitionLegalDocumentVersionStatus } from "./masterRegistry";
import { storeTestEvidence } from "./approvalEvidence.testkit";
import { loadVerifiedEvidence, storeApprovalEvidence, listApprovalEvidence } from "./approvalEvidence";

if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:|\/|$)/.test(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "")) throw new Error("Refusing to run: this E2E may only target a localhost database.");

const SUPER = "00000000-0000-4000-8000-000000000f01";
const STAFF = "00000000-0000-4000-8000-000000000f02";
const KWAKU = "00000000-0000-4000-8000-000000000f03";
const EMP = "00000000-0000-4000-8000-000000000f04";
const sql = (q: string) => execSync("docker exec -i ordift-mig-check2 psql -U postgres -h 127.0.0.1 -v ON_ERROR_STOP=1 -At", { input: q }).toString().trim();
const sha = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");

const CLEAN = makeZip("word/document.xml", "<w:document><w:body><w:p><w:r><w:t>24.1 Instructor-caused claims. 25.2 Cap applies only if selected in the Schedule. APPROVED - OFFICIAL MASTER</w:t></w:r></w:p></w:body></w:document>");
const DIRTY = makeZip("word/document.xml", "<w:document><w:body><w:p><w:r><w:t>25.2 Cap. [COUNSEL DECISION REQUIRED]</w:t></w:r></w:p></w:body></w:document>");
const PDF = new Uint8Array([37, 80, 68, 70, 45, 49, 46, 52]);
const DOCX_PATH = "masters-docx/OS-LGL-010/synthetic.docx";
const PDF_PATH = "masters-pdf/OS-LGL-010/synthetic.pdf";
const EVIDENCE = "e".repeat(64);

const ids = {} as { version: string; ghana: string; qatar: string; onboarding: string; docFile: string; docNote: string; sigId: string };

beforeAll(() => {
  h.storage[DOCX_PATH] = CLEAN;
  h.storage[PDF_PATH] = PDF;
  sql(`
    insert into auth.users (id, email) values ('${SUPER}','s@p3.test'),('${STAFF}','t@p3.test'),('${KWAKU}','k@p3.test'),('${EMP}','e@p3.test') on conflict do nothing;
    insert into public.profiles (id, full_name, access_status) values ('${SUPER}','Synthetic Super','active'),('${STAFF}','Synthetic Staff','active'),('${KWAKU}','Synthetic Instructor','active'),('${EMP}','Synthetic Employee','active') on conflict (id) do update set access_status='active';
    insert into public.user_roles (user_id, role_id) select '${SUPER}', r.id from public.roles r where r.slug in ('admin','super_admin') on conflict do nothing;
    insert into public.user_roles (user_id, role_id) select '${STAFF}', r.id from public.roles r where r.slug = 'staff' on conflict do nothing;
    insert into public.staff_details (id, engagement_type_id) select '${KWAKU}', t.id from public.engagement_types t where t.slug='instructor' on conflict (id) do update set engagement_type_id = excluded.engagement_type_id;
    insert into public.staff_details (id, engagement_type_id) select '${EMP}', t.id from public.engagement_types t where t.slug='full_time' on conflict (id) do update set engagement_type_id = excluded.engagement_type_id;
    delete from public.legal_suite_provenance_documents where release_version='approval-evidence';
    delete from public.activity_log where entity_id in (select id::text from public.legal_document_versions where master_id=(select id from public.legal_document_masters where canonical_code='OS-LGL-010'));
    update public.legal_document_versions set created_at='2026-09-08T01:36:30Z', status='approved', approved_at=null, activated_at=null, effective_date=null, content_reference=null, document_hash=null,
      master_docx_storage_path='${DOCX_PATH}', master_docx_sha256='${sha(CLEAN)}', master_pdf_storage_path='${PDF_PATH}', master_pdf_sha256='${sha(PDF)}'
      where master_id=(select id from public.legal_document_masters where canonical_code='OS-LGL-010');
    update public.legal_document_masters set current_version_id=(select id from public.legal_document_versions where master_id=legal_document_masters.id limit 1) where canonical_code='OS-LGL-010';
    delete from public.agreements where primary_context_reference='${KWAKU}';
    delete from public.staff_onboarding where profile_id in ('${KWAKU}','${EMP}');
    delete from public.workshop_instructor_engagements where profile_id='${KWAKU}';
    delete from public.entity_signatories where full_name like 'Synthetic%';
    delete from public.employing_entity_documents where notes like 'SYNTHETIC%';
  `);
  ids.version = sql("select id from public.legal_document_versions where master_id=(select id from public.legal_document_masters where canonical_code='OS-LGL-010')");
  ids.ghana = sql("select id from public.employing_entities where slug='ordift-studios'");
  ids.qatar = sql("select id from public.employing_entities where slug='test-qatar-entity'");
  const reqId = sql(`with r as (insert into public.department_requests (request_type, title, requested_by) values ('recruitment','Synthetic instructor','${SUPER}') returning id)
    insert into public.recruitment_requisitions (request_id, employing_entity_id, employment_jurisdiction_id, direct_hire_profile_id, hire_origin, headcount)
    select r.id, '${ids.ghana}', (select id from public.employment_jurisdictions where slug='ghana'), '${KWAKU}', 'founder_direct_hire', 1 from r returning id`).split("\n")[0];
  ids.onboarding = sql(`insert into public.staff_onboarding (profile_id, pipeline, stage, status, requisition_id) values ('${KWAKU}','external_contractor','profile','in_progress','${reqId}') returning id`).split("\n")[0];
  ids.docNote = sql(`insert into public.employing_entity_documents (employing_entity_id, document_type, storage_path, notes, uploaded_by) values ('${ids.ghana}','Business Registration Certificate','synthetic/note','SYNTHETIC note-only record','${SUPER}') returning id`).split("\n")[0];
  ids.docFile = sql(`insert into public.employing_entity_documents (employing_entity_id, document_type, storage_path, notes, uploaded_by, original_filename, file_sha256, mime_type, size_bytes) values ('${ids.ghana}','Business Registration Certificate','synthetic/file.pdf','SYNTHETIC stored file','${SUPER}','certificate.pdf','${"c".repeat(64)}','application/pdf',10) returning id`).split("\n")[0];
});

const input = { approvalDate: "2026-09-05", counselName: "Synthetic Counsel", counselFirm: "Synthetic LLP", evidenceKind: "counsel_email", evidenceReference: "Synthetic email approving the suite, kept in the archive", evidenceDocumentId: "", coversDocumentCodes: ["OS-LGL-010"] };
const auditCount = (action: string) => Number(sql(`select count(*) from public.activity_log where action='${action}' and entity_id in ('${ids.version}','${ids.onboarding}')`));

describe("1. authority is real: an ordinary staff account can do none of the legal writes", () => {
  it("is refused for attest, register, activate, confirm entity, select signatory and add signatory, writing nothing", async () => {
    const before = sql("select count(*) from public.activity_log");
    expect((await attestHistoricalApproval({ versionId: ids.version, input, actorUserId: STAFF })).ok).toBe(false);
    expect((await registerControlledMaster({ versionId: ids.version, actorUserId: STAFF })).ok).toBe(false);
    expect((await activateMasterVersion({ versionId: ids.version, effectiveDate: "2026-09-05", backdatedReason: "Synthetic reason for the test.", actorUserId: STAFF })).ok).toBe(false);
    expect((await confirmContractingEntity({ onboardingId: ids.onboarding, entityId: ids.ghana, expectedJurisdiction: "Ghana", actorUserId: STAFF })).ok).toBe(false);
    expect((await addEntitySignatory({ entityId: ids.ghana, fullName: "Synthetic Person", position: "Proprietor", authority: "As stated", sourceDocumentId: ids.docFile, actorUserId: STAFF })).ok).toBe(false);
    expect(sql("select count(*) from public.activity_log")).toBe(before);
    expect(sql(`select status||'/'||coalesce(content_reference,'-')||'/'||coalesce(effective_date::text,'-') from public.legal_document_versions where id='${ids.version}'`)).toBe("approved/-/-");
  });
});

describe("2. the approval attestation cannot misrepresent counsel's approval", () => {
  it("rejects the Addendum date, a document it does not name, and missing or unstored evidence; stores nothing", async () => {
    input.evidenceDocumentId = await storeTestEvidence(ids.version, SUPER);
    expect((await attestHistoricalApproval({ versionId: ids.version, input: { ...input, approvalDate: "2026-10-11" }, actorUserId: SUPER })).ok).toBe(false);
    expect((await attestHistoricalApproval({ versionId: ids.version, input: { ...input, coversDocumentCodes: ["OS-LGL-001"] }, actorUserId: SUPER })).ok).toBe(false);
    expect((await attestHistoricalApproval({ versionId: ids.version, input: { ...input, evidenceDocumentId: "" }, actorUserId: SUPER })).ok).toBe(false);
    expect(auditCount("legal.master_version.approval_attested")).toBe(0);
  });
  it("records one attestation (approval date, verifier identity and the real recording time kept apart) and refuses a duplicate", async () => {
    const first = await attestHistoricalApproval({ versionId: ids.version, input, actorUserId: SUPER });
    expect(first, JSON.stringify(first)).toMatchObject({ ok: true });
    expect((await attestHistoricalApproval({ versionId: ids.version, input: { ...input, approvalDate: "2026-09-06" }, actorUserId: SUPER })).ok).toBe(false);
    expect(auditCount("legal.master_version.approval_attested")).toBe(1);
    expect(sql(`select actor_user_id::text||'|'||(metadata->>'approvalDate')||'|'||(created_at::date)::text from public.activity_log where action='legal.master_version.approval_attested'`)).toBe(`${SUPER}|2026-09-05|${new Date().toISOString().slice(0, 10)}`);
    expect(sql(`select coalesce(approved_at::text,'null') from public.legal_document_versions where id='${ids.version}'`)).toBe("null"); // the registry's own stamp is untouched
  });
});

describe("3. activation needs the actual approved master and every prerequisite", () => {
  it("refuses before registration, then registers once, and refuses a second registration", async () => {
    const early = await activateMasterVersion({ versionId: ids.version, effectiveDate: "2026-09-05", backdatedReason: "Synthetic reason for the test.", actorUserId: SUPER });
    expect(early.ok).toBe(false);
    expect(sql(`select status from public.legal_document_versions where id='${ids.version}'`)).toBe("approved");
    expect((await registerControlledMaster({ versionId: ids.version, actorUserId: SUPER })).ok).toBe(true);
    expect(sql(`select document_hash from public.legal_document_versions where id='${ids.version}'`)).toBe(sha(CLEAN));
    expect((await registerControlledMaster({ versionId: ids.version, actorUserId: SUPER })).ok).toBe(false);
    expect(auditCount("legal.master_version.content_registered")).toBe(1);
  });
  it("a file changed after registration stops activation; nothing is partly applied", async () => {
    h.storage[DOCX_PATH] = DIRTY;
    const r = await activateMasterVersion({ versionId: ids.version, effectiveDate: "2026-09-05", backdatedReason: "Synthetic reason for the test.", actorUserId: SUPER });
    expect(r.ok).toBe(false);
    expect(sql(`select status||'/'||coalesce(effective_date::text,'-') from public.legal_document_versions where id='${ids.version}'`)).toBe("approved/-");
    h.storage[DOCX_PATH] = CLEAN;
  });
  it("an effective date before the verified approval date, or in the past without a reason, is refused", async () => {
    expect((await activateMasterVersion({ versionId: ids.version, effectiveDate: "2026-09-01", backdatedReason: "Synthetic reason for the test.", actorUserId: SUPER })).ok).toBe(false);
    expect((await activateMasterVersion({ versionId: ids.version, effectiveDate: "2026-09-05", actorUserId: SUPER })).ok).toBe(false);
  });
  it("is not performed by the readiness/loader code: loading readiness changes nothing and reports exactly what is open", async () => {
    const before = sql("select md5(string_agg(t::text,'|')) from (select * from public.legal_document_versions order by id) t");
    const ctx = await resolveOnboardingLegalContext(ids.onboarding);
    expect(ctx).toMatchObject({ profileId: KWAKU, jurisdictionName: "Ghana", engagementTypeSlug: "instructor" });
    const r = (await loadAgreementReadiness({ onboardingId: ids.onboarding, canonicalCode: "OS-LGL-010", jurisdictionName: ctx!.jurisdictionName, jurisdictionSource: "the Founder-approved requisition", recordedEntityId: ctx!.recordedEntityId }))!;
    expect(r.unresolved.map((c) => c.key)).toEqual(["activation", "effective_date", "contracting_entity", "signatory"]);
    expect(sql("select md5(string_agg(t::text,'|')) from (select * from public.legal_document_versions order by id) t")).toBe(before);
  });
});

describe("4. entity and signatory: Ghana only, evidence-backed, never borrowed", () => {
  it("refuses the Qatar entity for a Ghana onboarding, confirms the verified Ghana entity", async () => {
    expect((await confirmContractingEntity({ onboardingId: ids.onboarding, entityId: ids.qatar, expectedJurisdiction: "Ghana", actorUserId: SUPER })).ok).toBe(false);
    expect((await confirmContractingEntity({ onboardingId: ids.onboarding, entityId: ids.ghana, expectedJurisdiction: "Ghana", actorUserId: SUPER })).ok).toBe(true);
    expect(auditCount("onboarding.contracting_entity_confirmed")).toBe(1);
  });
  it("refuses a signatory backed only by a note-only record, accepts one backed by a stored file, refuses a duplicate", async () => {
    const base = { entityId: ids.ghana, fullName: "Synthetic Signatory", position: "Proprietor", authority: "As stated on the certificate", actorUserId: SUPER };
    const note = await addEntitySignatory({ ...base, sourceDocumentId: ids.docNote });
    expect(!note.ok && note.error).toContain("no stored file");
    const added = await addEntitySignatory({ ...base, sourceDocumentId: ids.docFile });
    expect(added.ok).toBe(true);
    ids.sigId = (added as { signatoryId: string }).signatoryId;
    expect((await addEntitySignatory({ ...base, sourceDocumentId: ids.docFile })).ok).toBe(false);
    expect((await selectAgreementSignatory({ onboardingId: ids.onboarding, entityId: ids.qatar, signatoryId: ids.sigId, actorUserId: SUPER })).ok).toBe(false);
    expect((await selectAgreementSignatory({ onboardingId: ids.onboarding, entityId: ids.ghana, signatoryId: ids.sigId, actorUserId: SUPER })).ok).toBe(true);
  });
});

describe("5. activation, then a DRAFT agreement - and nothing more", () => {
  it("activates at the real time with the stated effective date, without touching the registry's approval stamp", async () => {
    const r = await activateMasterVersion({ versionId: ids.version, effectiveDate: "2026-09-05", backdatedReason: "Effective from counsel's approval date as decided by the Founder.", actorUserId: SUPER });
    expect(r.ok).toBe(true);
    expect(sql(`select status||'|'||effective_date::text||'|'||(activated_at::date)::text||'|'||coalesce(approved_at::text,'null') from public.legal_document_versions where id='${ids.version}'`)).toBe(`active|2026-09-05|${new Date().toISOString().slice(0, 10)}|null`);
    expect(auditCount("legal.master_version.effective_date_set")).toBe(1);
  });
  it("prepares one draft from verified facts; it is not issued, sent or executed; a second is refused", async () => {
    const ctx = (await resolveOnboardingLegalContext(ids.onboarding))!;
    const readiness = await loadAgreementReadiness({ onboardingId: ids.onboarding, canonicalCode: "OS-LGL-010", jurisdictionName: ctx.jurisdictionName, jurisdictionSource: "x", recordedEntityId: ctx.recordedEntityId });
    expect(readiness?.canIssue).toBe(true);
    const r = await prepareInstructorAgreementDraft({ onboardingId: ids.onboarding, actorUserId: SUPER });
    expect(r.ok).toBe(true);
    const row = sql(`select status||'|'||coalesce(sent_at::text,'-')||'|'||coalesce(executed_at::text,'-')||'|'||primary_context_type from public.agreements where primary_context_reference='${KWAKU}'`);
    expect(row).toBe("draft|-|-|instructor_profile");
    expect(Number(sql(`select count(*) from public.agreement_parties where agreement_id=(select id from public.agreements where primary_context_reference='${KWAKU}')`))).toBe(2);
    expect(Number(sql(`select count(*) from public.agreement_snapshots where agreement_id=(select id from public.agreements where primary_context_reference='${KWAKU}')`))).toBe(1);
    expect((await prepareInstructorAgreementDraft({ onboardingId: ids.onboarding, actorUserId: SUPER })).ok).toBe(false);
    expect(await getCurrentInstructorAgreement(KWAKU)).toMatchObject({ status: "draft" });
    expect(sql("select count(*) from public.payment_obligations where created_at > now() - interval '1 hour'")).toBe("0");
    expect(sql(`select count(*) from public.workshop_instructor_engagements where profile_id='${KWAKU}'`)).toBe("0");
  });
  it("the registry refuses to activate a version with no verified approval date (fresh version, same rule)", async () => {
    sql(`insert into public.legal_document_versions (master_id, version, status, approved_by) select id, '9.9', 'approved', 'Synthetic' from public.legal_document_masters where canonical_code='OS-LGL-011'`);
    const v = sql("select v.id from public.legal_document_versions v join public.legal_document_masters m on m.id=v.master_id where m.canonical_code='OS-LGL-011' and v.version='9.9'");
    const r = await transitionLegalDocumentVersionStatus({ versionId: v, toStatus: "active", actorUserId: SUPER });
    expect(!r.ok && r.error).toContain("no verified approval date");
    sql(`delete from public.legal_document_versions where id='${v}'`);
  });
});

describe("6. no assignment and no completion without a genuinely executed agreement", () => {
  it("refuses an instructor on a workshop engagement, a session, and (via the shared gate) while only a draft or a TEST agreement exists", async () => {
    const eng = await createInstructorEngagement({ workshopId: "w-synthetic", profileId: KWAKU, actorUserId: SUPER });
    expect(!eng.ok && eng.error).toContain("not fully executed");
    const ses = await createWorkshopSession({ workshopId: "w-synthetic", sessionDate: "2026-11-02", startTime: "10:00", title: "Synthetic", instructorProfileId: KWAKU, actorUserId: SUPER });
    expect(ses.ok).toBe(false);
    sql(`update public.agreements set status='fully_executed', evidence_classification='controlled_test' where primary_context_reference='${KWAKU}'`);
    expect((await createInstructorEngagement({ workshopId: "w-synthetic", profileId: KWAKU, actorUserId: SUPER })).ok).toBe(false);
    expect(sql(`select count(*) from public.workshop_instructor_engagements where profile_id='${KWAKU}'`)).toBe("0");
  });
  it("final completion is blocked by the agreement: a waiver, a not-applicable mark, a deferral/override and a manual 'satisfied' are all refused", async () => {
    sql(`update public.agreements set status='draft', evidence_classification=null where primary_context_reference='${KWAKU}'`);
    const base = { onboardingId: ids.onboarding, pipeline: "external_contractor" as const, requirementKey: "instructor_agreement_executed", actorUserId: SUPER };
    for (const status of ["waived", "not_applicable", "deferred", "satisfied"] as const) expect((await updateOnboardingRequirement({ ...base, status })).ok).toBe(false);
    expect((await authorizeOnboardingRequirementOverride({ ...base, reason: "Synthetic attempt to bypass." })).ok).toBe(false);
    const open = await getUnsatisfiedRequiredRequirements({ onboardingId: ids.onboarding, profileId: KWAKU, pipeline: "external_contractor" });
    expect(open.map((r) => r.requirementKey)).toContain("instructor_agreement_executed");
  });
  it("once the agreement is genuinely executed the requirement is satisfied and the instructor can be assigned", async () => {
    sql(`update public.agreements set status='fully_executed', executed_at=now() where primary_context_reference='${KWAKU}'`);
    const open = await getUnsatisfiedRequiredRequirements({ onboardingId: ids.onboarding, profileId: KWAKU, pipeline: "external_contractor" });
    expect(open.map((r) => r.requirementKey)).not.toContain("instructor_agreement_executed");
    expect((await createInstructorEngagement({ workshopId: "w-synthetic", profileId: KWAKU, actorUserId: SUPER })).ok).toBe(true);
  });
});

describe("7. existing records and ordinary employee onboarding are unaffected", () => {
  it("an employee-classified person is never gated, and the employee pipeline sees none of the instructor requirements", async () => {
    expect((await createInstructorEngagement({ workshopId: "w-synthetic-2", profileId: EMP, actorUserId: SUPER })).ok).toBe(true);
    sql(`insert into public.staff_onboarding (profile_id, pipeline, stage, status) values ('${EMP}','employee','identity_profile','in_progress')`);
    const empOnboarding = sql(`select id from public.staff_onboarding where profile_id='${EMP}'`);
    const open = await getUnsatisfiedRequiredRequirements({ onboardingId: empOnboarding, profileId: EMP, pipeline: "employee" });
    expect(open.map((r) => r.requirementKey).some((k) => k.startsWith("instructor_"))).toBe(false);
    expect(open.length).toBeGreaterThan(0);
  });
  it("cleanup of synthetic rows", () => {
    sql(`delete from public.workshop_instructor_engagements where profile_id in ('${KWAKU}','${EMP}'); delete from public.workshop_sessions where workshop_id like 'w-synthetic%'; delete from public.staff_onboarding where profile_id='${EMP}';`);
    expect(true).toBe(true);
  });
});

describe("8. Step 7 signatory workflow: evidence upload, account link, per-entity authority", () => {
  it("a legacy note-only record is replaced (kept) by a stored, fingerprinted file; the signatory can then be recorded and linked to an existing active account by member number", async () => {
    sql(`update public.profiles set member_number='SYN0001' where id='${SUPER}'`);
    const bytes = new Uint8Array([37, 80, 68, 70, 45, 49, 46, 52, 10, 1, 2, 3]);
    const up = await addVaultDocument({ entityId: ids.ghana, documentType: "commercial_registration", filename: "ghana-certificate.pdf", mimeType: "application/pdf", bytes, notes: "SYNTHETIC replacement of the legacy note", replaces: ids.docNote, actorUserId: SUPER });
    expect(up.ok).toBe(true);
    const newId = (up as { documentId: string }).documentId;
    expect(sql(`select file_sha256||'|'||relation||'|'||related_document_id from public.employing_entity_documents where id='${newId}'`)).toBe(`${sha(bytes)}|new_version_of|${ids.docNote}`);
    expect(sql(`select count(*) from public.employing_entity_documents where id='${ids.docNote}'`)).toBe("1"); // the older record is preserved
    // account lookup: exists and active, unknown refused, inactive refused
    const found = await findActiveProfileByMemberNumber("SYN0001", SUPER);
    expect(found.ok && found.profileId).toBe(SUPER);
    expect((await findActiveProfileByMemberNumber("9999", SUPER)).ok).toBe(false);
    expect((await findActiveProfileByMemberNumber("SYN0001", STAFF)).ok).toBe(false); // Super Admin only
    const sig = await addEntitySignatory({ entityId: ids.ghana, fullName: "Synthetic Founder Signatory", position: "Proprietor", authority: "As stated on the certificate", sourceDocumentId: newId, profileId: found.ok ? found.profileId : null, actorUserId: SUPER });
    expect(sig.ok).toBe(true);
    // authority is per entity: the same person is not a signatory of any other entity because of this
    expect(sql(`select count(*) from public.entity_signatories where full_name='Synthetic Founder Signatory' and employing_entity_id <> '${ids.ghana}'`)).toBe("0");
  });
});

describe("9. approval evidence against the real schema: restrictions, duplicates, tamper detection", () => {
  it("stores only PDF/Word/text, never twice, scoped to its document; a changed stored file is caught", async () => {
    const base = { versionId: ids.version, description: "Synthetic counsel email for the real-schema test", actorUserId: SUPER };
    expect((await storeApprovalEvidence({ ...base, filename: "screenshot.png", bytes: new Uint8Array([137, 80, 78, 71, 1]) })).ok).toBe(false);
    expect((await storeApprovalEvidence({ ...base, filename: "x.txt", bytes: new TextEncoder().encode("hi") , actorUserId: STAFF })).ok).toBe(false);
    const text = new TextEncoder().encode("Counsel email 5 September 2026 approving OS-LGL-010 (synthetic, distinct content 9).");
    const a = await storeApprovalEvidence({ ...base, filename: "e1.txt", bytes: text });
    const b = await storeApprovalEvidence({ ...base, filename: "e1-copy.txt", bytes: text });
    expect(a.ok && b.ok && b.duplicate && b.item.id === a.item.id).toBe(true);
    expect((await listApprovalEvidence(ids.version)).filter((e) => e.sha256 === (a.ok ? a.item.sha256 : "")).length).toBe(1);
    expect((await loadVerifiedEvidence(ids.version, a.ok ? a.item.id : "", null)).ok).toBe(true);
    const path = a.ok ? a.item.storagePath : "";
    const original = h.storage[path];
    h.storage[path] = new TextEncoder().encode("altered");
    const bad = await loadVerifiedEvidence(ids.version, a.ok ? a.item.id : "", null);
    expect(!bad.ok && bad.error).toContain("HARD STOP");
    h.storage[path] = original;
  });
});
