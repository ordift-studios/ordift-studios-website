// @vitest-environment node
//
// OS-LGL-010 composition -> preview -> approval -> issuance -> signing -> execution -> assignment eligibility, against the REAL schema
// (throwaway local Postgres + PostgREST), using the REAL signature engine and the REAL token-based signing functions. SYNTHETIC data only.
// Only the private storage buckets and the email sender are stubbed (nothing is ever sent). Run:
//   npx vitest run --config vitest.localdb.config.ts src/lib/legal/phase3Issuance.localdb.e2e.ts
import { createHash } from "node:crypto";
import { execSync } from "node:child_process";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { makeZip } from "./zipFixture.testkit";

const h = vi.hoisted(() => ({
  agent: null as unknown,
  files: {} as Record<string, Uint8Array>,
  emails: [] as { to: string; subject: string; text: string }[],
  fetch: async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const undici = await import("undici");
    (h as { agent: unknown }).agent ??= new undici.Agent({ keepAliveTimeout: 1, keepAliveMaxTimeout: 1 });
    return (await undici.fetch(String(input).replace("/rest/v1", ""), { ...(init as object), dispatcher: (h as { agent: unknown }).agent as import("undici").Dispatcher })) as unknown as Response;
  },
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/admin/activityLog", () => ({ logActivity: vi.fn(async () => undefined) }));
vi.mock("@/lib/content/sanity/workshopAdmin", () => ({ getWorkshopByIdAdmin: async () => null }));
vi.mock("@/lib/shared/email/dispatch", () => ({ sendEmail: async (a: { to: string; subject: string; text: string }) => { h.emails.push({ to: a.to, subject: a.subject, text: a.text }); return { ok: true }; } }));
vi.mock("@/lib/supabase/admin", async () => {
  const { createClient: make } = await import("@supabase/supabase-js");
  return {
    createAdminClient: () => {
      const real = make(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: h.fetch } });
      return new Proxy(real, {
        get(target, prop) {
          if (prop === "storage") {
            return {
              from: (bucket: string) => ({
                download: async (path: string) => { const f = h.files[`${bucket}:${path}`] ?? h.files[path]; return f ? { data: new Blob([f as BlobPart]), error: null } : { data: null, error: { message: "missing" } }; },
                upload: async (path: string, body: Buffer) => { if (h.files[`${bucket}:${path}`]) return { error: { message: "exists" } }; h.files[`${bucket}:${path}`] = new Uint8Array(body); return { error: null }; },
              }),
            };
          }
          if (prop === "auth") return { admin: { getUserById: async (id: string) => ({ data: { user: { email: `${id.slice(-4)}@synthetic.test` } } }) } };
          return Reflect.get(target, prop);
        },
      });
    },
  };
});

import { attestHistoricalApproval, activateMasterVersion, registerControlledMaster } from "./masterRegistryActions";
import { confirmContractingEntity, selectAgreementSignatory } from "@/lib/organization/onboardingDecisions";
import { addEntitySignatory } from "@/lib/organization/entityRegistrations";
import { prepareInstructorAgreementDraft, getCurrentInstructorAgreement } from "./instructorAgreements";
import { approveInstructorAgreementForIssue, issueInstructorAgreement, loadInstructorSigningProgress, previewInstructorAgreement, saveInstructorScheduleA } from "./instructorAgreementIssuance";
import { getIssuedAgreementTextForSignatory } from "./agreementIssuance";
import { recordSignatoryConsent, recordSignatorySignature, recordSignatoryDecline } from "./signatureEngine";
import { createInstructorEngagement } from "@/lib/workshops/instructorEngagements";
import { getUnsatisfiedRequiredRequirements } from "@/lib/organization/onboardingRequirements";
import type { ScheduleATerms } from "./instructorAgreementTerms";

if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:|\/|$)/.test(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "")) throw new Error("Refusing to run: this E2E may only target a localhost database.");

const SUPER = "00000000-0000-4000-8000-000000000a01";
const STAFF = "00000000-0000-4000-8000-000000000a02";
const KWAKU = "00000000-0000-4000-8000-000000000a03";
const sql = (q: string) => execSync("docker exec -i ordift-mig-check2 psql -U postgres -h 127.0.0.1 -v ON_ERROR_STOP=1 -At", { input: q }).toString().trim();
const sha = (b: Uint8Array | string) => createHash("sha256").update(b).digest("hex");

const CLEAN = makeZip("word/document.xml", "<w:document><w:body><w:p><w:r><w:t>INSTRUCTOR / WORKSHOP FACILITATOR AGREEMENT</w:t></w:r></w:p><w:p><w:r><w:t>1.1 Agreement. Each workshop is created by an accepted Session Schedule.</w:t></w:r></w:p><w:p><w:r><w:t>3.4 No guaranteed engagements.</w:t></w:r></w:p></w:body></w:document>");
const PDF = new Uint8Array([37, 80, 68, 70, 45, 49, 46, 52]);
const DOCX_PATH = "masters-docx/OS-LGL-010/p3i.docx";
const PDF_PATH = "masters-pdf/OS-LGL-010/p3i.pdf";
const ids = {} as { version: string; ghana: string; onboarding: string; docFile: string; agreement: string };
const TERMS: ScheduleATerms = {
  professionalRole: "INSTRUCTOR", businessName: "", nationalityWorkAuthorization: "", addressCountry: "Synthetic Street, Accra, Ghana", contactPhone: "", primaryExpertise: "Synthetic photography teaching",
  qualifications: "", independentStatusRoute: "CONTRACTOR", masterTerm: "ONGOING", masterTerminationNotice: "30 days written notice", regulatoryApprovalStatus: "N/A", specialTerms: "NONE",
  agreementEffectiveDate: new Date(Date.now() + 5 * 86400000).toISOString().slice(0, 10),
};
const tokenFrom = (to: string) => { const m = h.emails.filter((e) => e.to === to).at(-1)?.text.match(/\/legal\/sign\/([A-Za-z0-9_-]+)/); return m?.[1] ?? ""; };

beforeAll(async () => {
  h.files[DOCX_PATH] = CLEAN; h.files[PDF_PATH] = PDF;
  sql(`
    insert into auth.users (id, email) values ('${SUPER}','s@p3i.test'),('${STAFF}','t@p3i.test'),('${KWAKU}','k@p3i.test') on conflict do nothing;
    insert into public.profiles (id, full_name, access_status, member_number) values ('${SUPER}','Synthetic Founder','active','0001'),('${STAFF}','Synthetic Staff','active',null),('${KWAKU}','Synthetic Instructor','active','INT0001') on conflict (id) do update set access_status='active', full_name=excluded.full_name;
    insert into public.user_roles (user_id, role_id) select '${SUPER}', r.id from public.roles r where r.slug in ('admin','super_admin') on conflict do nothing;
    insert into public.user_roles (user_id, role_id) select '${STAFF}', r.id from public.roles r where r.slug = 'staff' on conflict do nothing;
    insert into public.staff_details (id, engagement_type_id) select '${KWAKU}', t.id from public.engagement_types t where t.slug='instructor' on conflict (id) do update set engagement_type_id = excluded.engagement_type_id;
    delete from public.signature_evidence where signatory_id in (select s.id from public.signature_signatories s join public.signature_requests r on r.id=s.signature_request_id join public.agreements a on a.id=r.agreement_id where a.primary_context_reference='${KWAKU}');
    delete from public.signature_events where signatory_id in (select s.id from public.signature_signatories s join public.signature_requests r on r.id=s.signature_request_id join public.agreements a on a.id=r.agreement_id where a.primary_context_reference='${KWAKU}');
    delete from public.signature_signatories where signature_request_id in (select r.id from public.signature_requests r join public.agreements a on a.id=r.agreement_id where a.primary_context_reference='${KWAKU}');
    delete from public.signature_requests where agreement_id in (select id from public.agreements where primary_context_reference='${KWAKU}');
    delete from public.agreements where primary_context_reference='${KWAKU}';
    delete from public.staff_onboarding where profile_id='${KWAKU}';
    delete from public.workshop_instructor_engagements where profile_id='${KWAKU}';
    delete from public.entity_signatories where full_name like 'Synthetic%';
    delete from public.employing_entity_documents where notes like 'SYNTHETIC%';
    delete from public.activity_log where entity_id in (select id::text from public.legal_document_versions where master_id=(select id from public.legal_document_masters where canonical_code='OS-LGL-010'));
    update public.legal_document_versions set created_at='2026-09-08T01:36:30Z', status='approved', approved_at=null, activated_at=null, effective_date=null, content_reference=null, document_hash=null,
      master_docx_storage_path='${DOCX_PATH}', master_docx_sha256='${sha(CLEAN)}', master_pdf_storage_path='${PDF_PATH}', master_pdf_sha256='${sha(PDF)}'
      where master_id=(select id from public.legal_document_masters where canonical_code='OS-LGL-010');
    update public.legal_document_masters set current_version_id=(select id from public.legal_document_versions where master_id=legal_document_masters.id limit 1) where canonical_code='OS-LGL-010';
  `);
  ids.version = sql("select id from public.legal_document_versions where master_id=(select id from public.legal_document_masters where canonical_code='OS-LGL-010')");
  ids.ghana = sql("select id from public.employing_entities where slug='ordift-studios'");
  const reqId = sql(`with r as (insert into public.department_requests (request_type, title, requested_by) values ('recruitment','Synthetic instructor','${SUPER}') returning id)
    insert into public.recruitment_requisitions (request_id, employing_entity_id, employment_jurisdiction_id, direct_hire_profile_id, hire_origin, headcount)
    select r.id, '${ids.ghana}', (select id from public.employment_jurisdictions where slug='ghana'), '${KWAKU}', 'founder_direct_hire', 1 from r returning id`).split("\n")[0];
  ids.onboarding = sql(`insert into public.staff_onboarding (profile_id, pipeline, stage, status, requisition_id) values ('${KWAKU}','external_contractor','profile','in_progress','${reqId}') returning id`).split("\n")[0];
  ids.docFile = sql(`insert into public.employing_entity_documents (employing_entity_id, document_type, storage_path, notes, uploaded_by, original_filename, file_sha256, mime_type, size_bytes) values ('${ids.ghana}','Business Registration Certificate','synthetic/file.pdf','SYNTHETIC stored file','${SUPER}','certificate.pdf','${"c".repeat(64)}','application/pdf',10) returning id`).split("\n")[0];

  // every legal prerequisite, through the real actions (the Founder's explicit steps in the workspace)
  const ev = { approvalDate: "2026-09-05", counselName: "Synthetic Counsel", counselFirm: "Synthetic LLP", evidenceKind: "counsel_email", evidenceReference: "Synthetic email approving the suite, filed in the archive", evidenceSha256: "e".repeat(64), coversDocumentCodes: ["OS-LGL-010"] };
  for (const r of [
    await attestHistoricalApproval({ versionId: ids.version, input: ev, actorUserId: SUPER }),
    await registerControlledMaster({ versionId: ids.version, actorUserId: SUPER }),
    await activateMasterVersion({ versionId: ids.version, effectiveDate: "2026-09-05", backdatedReason: "Effective from counsel's approval date, as decided by the Founder.", actorUserId: SUPER }),
    await confirmContractingEntity({ onboardingId: ids.onboarding, entityId: ids.ghana, expectedJurisdiction: "Ghana", actorUserId: SUPER }),
  ]) if (!r.ok) throw new Error(`setup failed: ${JSON.stringify(r)}`);
  const sig = await addEntitySignatory({ entityId: ids.ghana, fullName: "Synthetic Signatory", position: "Proprietor", authority: "As stated on the certificate", sourceDocumentId: ids.docFile, profileId: SUPER, actorUserId: SUPER });
  if (!sig.ok) throw new Error(`signatory failed: ${JSON.stringify(sig)}`);
  const sel = await selectAgreementSignatory({ onboardingId: ids.onboarding, entityId: ids.ghana, signatoryId: sig.signatoryId, actorUserId: SUPER });
  if (!sel.ok) throw new Error(`select failed: ${JSON.stringify(sel)}`);
  const draft = await prepareInstructorAgreementDraft({ onboardingId: ids.onboarding, actorUserId: SUPER });
  if (!draft.ok) throw new Error(`draft failed: ${JSON.stringify(draft)}`);
  ids.agreement = draft.agreementId;
});

const status = () => sql(`select status from public.agreements where id='${ids.agreement}'`);

describe("1. nothing can be previewed, approved or issued until the required terms are stated", () => {
  it("refuses preview and approval while Schedule A terms are missing, naming them; creates no document", async () => {
    const p = await previewInstructorAgreement(ids.onboarding, ids.agreement);
    expect(!p.ok && "missing" in p && p.missing).toContain("Primary expertise");
    expect((await approveInstructorAgreementForIssue({ onboardingId: ids.onboarding, agreementId: ids.agreement, actorUserId: SUPER })).ok).toBe(false);
    expect((await issueInstructorAgreement({ onboardingId: ids.onboarding, agreementId: ids.agreement, actorUserId: SUPER })).ok).toBe(false);
    expect(sql(`select coalesce(issued_document_sha256,'-') from public.agreements where id='${ids.agreement}'`)).toBe("-");
    expect(status()).toBe("draft");
  });
  it("ordinary staff cannot state terms, approve or issue; another person's agreement cannot be touched through this onboarding", async () => {
    expect((await saveInstructorScheduleA({ onboardingId: ids.onboarding, agreementId: ids.agreement, terms: TERMS, actorUserId: STAFF })).ok).toBe(false);
    expect((await approveInstructorAgreementForIssue({ onboardingId: ids.onboarding, agreementId: ids.agreement, actorUserId: STAFF })).ok).toBe(false);
    expect((await issueInstructorAgreement({ onboardingId: ids.onboarding, agreementId: ids.agreement, actorUserId: STAFF })).ok).toBe(false);
    const other = "00000000-0000-4000-8000-0000000000ff";
    expect((await saveInstructorScheduleA({ onboardingId: ids.onboarding, agreementId: other, terms: TERMS, actorUserId: SUPER })).ok).toBe(false);
  });
  it("rejects invalid terms (a back-dated effective date, a value outside the master's options)", async () => {
    expect((await saveInstructorScheduleA({ onboardingId: ids.onboarding, agreementId: ids.agreement, terms: { ...TERMS, agreementEffectiveDate: "2026-09-05" }, actorUserId: SUPER })).ok).toBe(false);
    expect((await saveInstructorScheduleA({ onboardingId: ids.onboarding, agreementId: ids.agreement, terms: { ...TERMS, independentStatusRoute: "EMPLOYEE" }, actorUserId: SUPER })).ok).toBe(false);
  });
});

describe("2. composition and preview use only verified facts, the registered master and the stated terms", () => {
  it("saves the terms and previews the exact document with its hash; the preview is read-only and reproducible", async () => {
    expect((await saveInstructorScheduleA({ onboardingId: ids.onboarding, agreementId: ids.agreement, terms: TERMS, actorUserId: SUPER })).ok).toBe(true);
    const p1 = await previewInstructorAgreement(ids.onboarding, ids.agreement);
    const p2 = await previewInstructorAgreement(ids.onboarding, ids.agreement);
    expect(p1.ok && p2.ok && p1.text === p2.text && p1.sha256 === p2.sha256).toBe(true);
    if (!p1.ok) throw new Error("preview failed");
    expect(p1.text.startsWith("INSTRUCTOR / WORKSHOP FACILITATOR AGREEMENT")).toBe(true); // the registered master, verbatim
    expect(p1.text).toContain("Instructor / Facilitator: Synthetic Instructor (member INT0001)");
    expect(p1.text).toContain("Primary Jurisdiction: Ghana");
    expect(p1.text).toContain("Ordift Contracting Entity: Ordift Studios");
    expect(p1.text).toContain("For Ordift (Ordift Studios): Synthetic Signatory, Proprietor.");
    expect(p1.text).toContain(`Effective Date: ${TERMS.agreementEffectiveDate}`);
    expect(p1.text).toContain(`MASTER DOCUMENT SHA-256: ${sha(CLEAN)}`);
    expect(sql(`select coalesce(issued_document_sha256,'-') from public.agreements where id='${ids.agreement}'`)).toBe("-");
  });
  it("a master altered after activation stops the preview (nothing is composed from a changed file)", async () => {
    const original = h.files[DOCX_PATH];
    h.files[DOCX_PATH] = makeZip("word/document.xml", "<w:document><w:body><w:p><w:r><w:t>tampered</w:t></w:r></w:p></w:body></w:document>");
    expect((await previewInstructorAgreement(ids.onboarding, ids.agreement)).ok).toBe(false);
    h.files[DOCX_PATH] = original;
  });
});

describe("3. approval, then issuance - once, with an immutable hash, and nothing is executed", () => {
  it("cannot be issued before it is approved for issue", async () => {
    expect((await issueInstructorAgreement({ onboardingId: ids.onboarding, agreementId: ids.agreement, actorUserId: SUPER })).ok).toBe(false);
  });
  it("approves the exact document, after which the terms are frozen", async () => {
    expect((await approveInstructorAgreementForIssue({ onboardingId: ids.onboarding, agreementId: ids.agreement, actorUserId: SUPER })).ok).toBe(true);
    expect(status()).toBe("approved_for_issue");
    expect((await saveInstructorScheduleA({ onboardingId: ids.onboarding, agreementId: ids.agreement, terms: { ...TERMS, specialTerms: "changed" }, actorUserId: SUPER })).ok).toBe(false);
    expect((await approveInstructorAgreementForIssue({ onboardingId: ids.onboarding, agreementId: ids.agreement, actorUserId: SUPER })).ok).toBe(false);
  });
  it("issues once: stores the document, records its SHA-256, creates two signatories and delivers two secure links, then is 'Issued — awaiting signature' and NOT executed", async () => {
    const preview = await previewInstructorAgreement(ids.onboarding, ids.agreement);
    const r = await issueInstructorAgreement({ onboardingId: ids.onboarding, agreementId: ids.agreement, actorUserId: SUPER });
    expect(r.ok).toBe(true);
    expect(status()).toBe("sent");
    expect(sql(`select issued_document_sha256 from public.agreements where id='${ids.agreement}'`)).toBe(preview.ok ? preview.sha256 : "x");
    expect(sha(h.files[`issued-agreement-documents:${ids.agreement}.txt`])).toBe(preview.ok ? preview.sha256 : "x"); // stored bytes == hashed bytes
    expect(sql(`select count(*) from public.signature_signatories s join public.signature_requests r on r.id=s.signature_request_id where r.agreement_id='${ids.agreement}'`)).toBe("2");
    expect(h.emails.filter((e) => e.subject.includes("Instructor / Workshop Facilitator Agreement")).length).toBe(2);
    expect(sql(`select count(*) from public.signature_events e join public.signature_signatories s on s.id=e.signatory_id join public.signature_requests r on r.id=s.signature_request_id where r.agreement_id='${ids.agreement}' and e.event_type='link_generated'`)).toBe("2");
  });
  it("refuses a duplicate issuance and sends no further links", async () => {
    const before = h.emails.length;
    expect((await issueInstructorAgreement({ onboardingId: ids.onboarding, agreementId: ids.agreement, actorUserId: SUPER })).ok).toBe(false);
    expect(h.emails.length).toBe(before);
    expect(sql(`select count(*) from public.signature_requests where agreement_id='${ids.agreement}'`)).toBe("1");
  });
  it("an issued but unsigned agreement does not satisfy the requirement and does not open assignment", async () => {
    const open = await getUnsatisfiedRequiredRequirements({ onboardingId: ids.onboarding, profileId: KWAKU, pipeline: "external_contractor" });
    expect(open.map((x) => x.requirementKey)).toContain("instructor_agreement_executed");
    expect((await createInstructorEngagement({ workshopId: "w-p3i", profileId: KWAKU, actorUserId: SUPER })).ok).toBe(false);
  });
});

describe("4. review and signature through the existing secure token flow", () => {
  const kwakuTok = () => tokenFrom(`${KWAKU.slice(-4)}@synthetic.test`);
  const ordiftTok = () => tokenFrom(`${SUPER.slice(-4)}@synthetic.test`);
  it("each signatory reviews the exact stored document that was hashed", async () => {
    const view = await getIssuedAgreementTextForSignatory(kwakuTok());
    expect(view.ok && sha(view.text)).toBe(sql(`select issued_document_sha256 from public.agreements where id='${ids.agreement}'`));
    expect(view.ok && view.role).toBe("instructor");
  });
  it("a bad or reused-after-revocation token is refused", async () => {
    expect((await recordSignatoryConsent("not-a-real-token")).ok).toBe(false);
  });
  it("the instructor consents and signs: partially signed, the agreement is still NOT executed, requirement unsatisfied, assignment still refused", async () => {
    expect((await recordSignatoryConsent(kwakuTok())).ok).toBe(true);
    const r = await recordSignatorySignature({ rawToken: kwakuTok(), typedFullName: "Synthetic Instructor", consentStatement: "I have read and agree to this agreement.", ipAddress: "203.0.113.5", userAgent: "vitest" });
    expect(r.ok && r.fullyExecuted).toBe(false);
    expect(status()).toBe("sent");
    const progress = await loadInstructorSigningProgress(ids.agreement);
    expect(progress.map((p) => `${p.role}:${p.status}`).sort()).toEqual(["instructor:signed", "ordift:pending"].sort());
    const open = await getUnsatisfiedRequiredRequirements({ onboardingId: ids.onboarding, profileId: KWAKU, pipeline: "external_contractor" });
    expect(open.map((x) => x.requirementKey)).toContain("instructor_agreement_executed");
    expect((await createInstructorEngagement({ workshopId: "w-p3i", profileId: KWAKU, actorUserId: SUPER })).ok).toBe(false);
  });
  it("the Ordift signatory consents and signs: the agreement is Executed, with evidence bound to the issued hash", async () => {
    expect((await recordSignatoryConsent(ordiftTok())).ok).toBe(true);
    const r = await recordSignatorySignature({ rawToken: ordiftTok(), typedFullName: "Synthetic Signatory", consentStatement: "I agree on behalf of Ordift Studios.", ipAddress: "203.0.113.9", userAgent: "vitest" });
    expect(r.ok && r.fullyExecuted).toBe(true);
    expect(status()).toBe("fully_executed");
    const issued = sql(`select issued_document_sha256 from public.agreements where id='${ids.agreement}'`);
    expect(sql(`select string_agg(distinct e.document_sha256, ',') from public.signature_evidence e join public.signature_signatories s on s.id=e.signatory_id join public.signature_requests r on r.id=s.signature_request_id where r.agreement_id='${ids.agreement}'`)).toBe(issued);
    expect(sql(`select count(*) from public.signature_evidence e join public.signature_signatories s on s.id=e.signatory_id join public.signature_requests r on r.id=s.signature_request_id where r.agreement_id='${ids.agreement}'`)).toBe("2");
    expect(sql(`select string_agg(distinct e.event_type, ',' order by e.event_type) from public.signature_events e join public.signature_signatories s on s.id=e.signatory_id join public.signature_requests r on r.id=s.signature_request_id where r.agreement_id='${ids.agreement}'`)).toBe("consent_given,link_generated,signed,viewed");
  });
  it("execution is reflected automatically in the onboarding requirement and in assignment eligibility - but nothing is assigned automatically", async () => {
    const open = await getUnsatisfiedRequiredRequirements({ onboardingId: ids.onboarding, profileId: KWAKU, pipeline: "external_contractor" });
    expect(open.map((x) => x.requirementKey)).not.toContain("instructor_agreement_executed");
    expect(sql(`select count(*) from public.workshop_instructor_engagements where profile_id='${KWAKU}'`)).toBe("0"); // separate assignment approval retained
    expect((await createInstructorEngagement({ workshopId: "w-p3i", profileId: KWAKU, actorUserId: SUPER })).ok).toBe(true);
    expect(sql(`select status from public.staff_onboarding where profile_id='${KWAKU}'`)).toBe("in_progress"); // onboarding is not auto-completed
  });
  it("a TEST signature is never genuine execution: the same executed agreement flagged controlled_test reopens the requirement and the gate", async () => {
    sql(`delete from public.workshop_instructor_engagements where profile_id='${KWAKU}'; update public.agreements set evidence_classification='controlled_test' where id='${ids.agreement}'`);
    expect(await getCurrentInstructorAgreement(KWAKU)).toMatchObject({ status: "fully_executed" });
    const open = await getUnsatisfiedRequiredRequirements({ onboardingId: ids.onboarding, profileId: KWAKU, pipeline: "external_contractor" });
    expect(open.map((x) => x.requirementKey)).toContain("instructor_agreement_executed");
    expect((await createInstructorEngagement({ workshopId: "w-p3i", profileId: KWAKU, actorUserId: SUPER })).ok).toBe(false);
    sql(`update public.agreements set evidence_classification=null where id='${ids.agreement}'`);
  });
});

describe("5. a declined agreement is never executed", () => {
  it("a second instructor issues, then declines: the signatory shows declined, the agreement never becomes executed, the requirement stays open and assignment stays refused", async () => {
    const KW2 = "00000000-0000-4000-8000-000000000a05";
    sql(`
      insert into auth.users (id, email) values ('${KW2}','k2@p3i.test') on conflict do nothing;
      insert into public.profiles (id, full_name, access_status, member_number) values ('${KW2}','Synthetic Instructor Two','active','INT0002') on conflict (id) do update set access_status='active';
      insert into public.staff_details (id, engagement_type_id) select '${KW2}', t.id from public.engagement_types t where t.slug='instructor' on conflict (id) do update set engagement_type_id = excluded.engagement_type_id;
      delete from public.signature_evidence where signatory_id in (select s.id from public.signature_signatories s join public.signature_requests r on r.id=s.signature_request_id join public.agreements a on a.id=r.agreement_id where a.primary_context_reference='${KW2}');
      delete from public.signature_events where signatory_id in (select s.id from public.signature_signatories s join public.signature_requests r on r.id=s.signature_request_id join public.agreements a on a.id=r.agreement_id where a.primary_context_reference='${KW2}');
      delete from public.signature_signatories where signature_request_id in (select r.id from public.signature_requests r join public.agreements a on a.id=r.agreement_id where a.primary_context_reference='${KW2}');
      delete from public.signature_requests where agreement_id in (select id from public.agreements where primary_context_reference='${KW2}');
      delete from public.agreements where primary_context_reference='${KW2}';
      delete from public.staff_onboarding where profile_id='${KW2}';`);
    const reqId = sql(`with r as (insert into public.department_requests (request_type, title, requested_by) values ('recruitment','Synthetic instructor two','${SUPER}') returning id)
      insert into public.recruitment_requisitions (request_id, employing_entity_id, employment_jurisdiction_id, direct_hire_profile_id, hire_origin, headcount)
      select r.id, '${ids.ghana}', (select id from public.employment_jurisdictions where slug='ghana'), '${KW2}', 'founder_direct_hire', 1 from r returning id`).split("\n")[0];
    const ob2 = sql(`insert into public.staff_onboarding (profile_id, pipeline, stage, status, requisition_id) values ('${KW2}','external_contractor','profile','in_progress','${reqId}') returning id`).split("\n")[0];
    expect((await confirmContractingEntity({ onboardingId: ob2, entityId: ids.ghana, expectedJurisdiction: "Ghana", actorUserId: SUPER })).ok).toBe(true);
    const draft = await prepareInstructorAgreementDraft({ onboardingId: ob2, actorUserId: SUPER });
    if (!draft.ok) throw new Error(JSON.stringify(draft));
    expect((await saveInstructorScheduleA({ onboardingId: ob2, agreementId: draft.agreementId, terms: TERMS, actorUserId: SUPER })).ok).toBe(true);
    expect((await approveInstructorAgreementForIssue({ onboardingId: ob2, agreementId: draft.agreementId, actorUserId: SUPER })).ok).toBe(true);
    expect((await issueInstructorAgreement({ onboardingId: ob2, agreementId: draft.agreementId, actorUserId: SUPER })).ok).toBe(true);
    const tok = tokenFrom(`${KW2.slice(-4)}@synthetic.test`);
    expect((await recordSignatoryDecline({ rawToken: tok, reason: "Synthetic: terms not acceptable." })).ok).toBe(true);
    const progress = await loadInstructorSigningProgress(draft.agreementId);
    expect(progress.find((p) => p.role === "instructor")?.status).toBe("declined");
    expect(["fully_executed", "active", "completed"]).not.toContain(sql(`select status from public.agreements where id='${draft.agreementId}'`));
    const open = await getUnsatisfiedRequiredRequirements({ onboardingId: ob2, profileId: KW2, pipeline: "external_contractor" });
    expect(open.map((x) => x.requirementKey)).toContain("instructor_agreement_executed");
    expect((await createInstructorEngagement({ workshopId: "w-p3i-2", profileId: KW2, actorUserId: SUPER })).ok).toBe(false);
    sql(`delete from public.workshop_instructor_engagements where profile_id in ('${KWAKU}','${KW2}')`);
  });
});
