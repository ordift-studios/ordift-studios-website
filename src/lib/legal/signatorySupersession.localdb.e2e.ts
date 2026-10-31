// @vitest-environment node
//
// OS-LGL-010: correcting a recorded signatory entry by SUPERSESSION (proposed migration 0177) - one current signatory, history and issued agreements preserved, drafts follow the correction. REAL schema
// (throwaway local Postgres + PostgREST), using the REAL signature engine and the REAL token-based signing functions. SYNTHETIC data only.
// Only the private storage buckets and the email sender are stubbed (nothing is ever sent). Run:
//   (scratch DB must already have PROPOSED_0177 applied - see supabase/proposals/rehearse_0177.sh)
//   npx vitest run --config vitest.localdb.config.ts src/lib/legal/signatorySupersession.localdb.e2e.ts
import { createHash } from "node:crypto";
import { execSync } from "node:child_process";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { makeZip } from "./zipFixture.testkit";

const h = vi.hoisted(() => ({
  agent: null as unknown,
  files: {} as Record<string, Uint8Array>,
  emails: [] as { to: string; subject: string; text: string }[],
  emailOverride: {} as Record<string, string>,
  failFor: new Set<string>(),
  throwFor: new Set<string>(),
  fetch: async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const undici = await import("undici");
    (h as { agent: unknown }).agent ??= new undici.Agent({ keepAliveTimeout: 1, keepAliveMaxTimeout: 1 });
    return (await undici.fetch(String(input).replace("/rest/v1", ""), { ...(init as object), dispatcher: (h as { agent: unknown }).agent as import("undici").Dispatcher })) as unknown as Response;
  },
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/admin/activityLog", () => ({ logActivity: vi.fn(async () => undefined) }));
vi.mock("@/lib/content/sanity/workshopAdmin", () => ({ getWorkshopByIdAdmin: async () => null }));
vi.mock("@/lib/shared/email/dispatch", () => ({ sendEmail: async (a: { to: string; subject: string; text: string }) => { if (h.throwFor.has(a.to)) throw new Error("timeout"); if (h.failFor.has(a.to)) return { ok: false, error: "rejected" }; h.emails.push({ to: a.to, subject: a.subject, text: a.text }); return { ok: true }; } }));
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
          if (prop === "auth") return { admin: { getUserById: async (id: string) => ({ data: { user: { email: h.emailOverride[id] ?? `${id.slice(-4)}@synthetic.test` } } }) } };
          return Reflect.get(target, prop);
        },
      });
    },
  };
});

import { attestHistoricalApproval, activateMasterVersion, registerControlledMaster } from "./masterRegistryActions";
import { confirmContractingEntity, selectAgreementSignatory } from "@/lib/organization/onboardingDecisions";
import { addEntitySignatory, supersedeEntitySignatory } from "@/lib/organization/entityRegistrations";
import { prepareInstructorAgreementDraft } from "./instructorAgreements";
import { approveInstructorAgreementForIssue, issueInstructorAgreement, previewInstructorAgreement, saveInstructorScheduleA } from "./instructorAgreementIssuance";
import { recordSignatoryConsent, recordSignatorySignature } from "./signatureEngine";
import type { ScheduleATerms } from "./instructorAgreementTerms";
import { storeTestEvidence } from "./approvalEvidence.testkit";
import { MASTER } from "./instructorMaster.fixture";

if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:|\/|$)/.test(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "")) throw new Error("Refusing to run: this E2E may only target a localhost database.");

const SUPER = "00000000-0000-4000-8000-000000000a01";
const STAFF = "00000000-0000-4000-8000-000000000a02";
const INSTR = "00000000-0000-4000-8000-000000000a03";
// E2E_DB selects the throwaway database that the PostgREST under test points at (supabase/proposals/e2e_scratch.sh builds p4_e2e); unset keeps the original lab database.
const sql = (q: string) => execSync(process.env.E2E_DB ? `docker exec -i ordift-mig-check2 psql -U supabase_admin -h 127.0.0.1 -d ${process.env.E2E_DB} -X -q -v ON_ERROR_STOP=1 -At` : "docker exec -i ordift-mig-check2 psql -U postgres -h 127.0.0.1 -v ON_ERROR_STOP=1 -At", { input: q }).toString().trim();
const sha = (b: Uint8Array | string) => createHash("sha256").update(b).digest("hex");

const xml = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;");
const CLEAN = makeZip("word/document.xml", `<w:document><w:body>${MASTER.split("\n").filter(Boolean).map((l) => `<w:p><w:r><w:t>${xml(l)}</w:t></w:r></w:p>`).join("")}</w:body></w:document>`); // synthetic master with the real OS-LGL-010 structure (Option A refuses any other shape)
const PDF = new Uint8Array([37, 80, 68, 70, 45, 49, 46, 52]);
const DOCX_PATH = "masters-docx/OS-LGL-010/p3i.docx";
const PDF_PATH = "masters-pdf/OS-LGL-010/p3i.pdf";
const ids = {} as { version: string; ghana: string; onboarding: string; docFile: string; agreement: string; signatoryId: string };
const TERMS: ScheduleATerms = {
  professionalRole: "INSTRUCTOR", businessName: "", nationalityWorkAuthorization: "", addressCountry: "Synthetic Street, Accra, Ghana", contactPhone: "", primaryExpertise: "Synthetic photography teaching",
  qualifications: "", independentStatusRoute: "CONTRACTOR", masterTerm: "ONGOING", masterTerminationNotice: "30 days written notice", regulatoryApprovalStatus: "N/A", specialTerms: "NONE",
  agreementEffectiveDate: new Date(Date.now() + 5 * 86400000).toISOString().slice(0, 10),
};
const tokenFrom = (to: string) => { const m = h.emails.filter((e) => e.to === to).at(-1)?.text.match(/\/legal\/sign\/([A-Za-z0-9_-]+)/); return m?.[1] ?? ""; };

beforeAll(async () => {
  h.files[DOCX_PATH] = CLEAN; h.files[PDF_PATH] = PDF;
  sql(`
    insert into auth.users (id, email) values ('${SUPER}','s@p3i.test'),('${STAFF}','t@p3i.test'),('${INSTR}','k@p3i.test') on conflict do nothing;
    insert into public.profiles (id, full_name, access_status, member_number) values ('${SUPER}','Synthetic Founder','active','0001'),('${STAFF}','Synthetic Staff','active',null),('${INSTR}','Synthetic Instructor','active','INT0001') on conflict (id) do update set access_status='active', full_name=excluded.full_name;
    insert into public.user_roles (user_id, role_id) select '${SUPER}', r.id from public.roles r where r.slug in ('admin','super_admin') on conflict do nothing;
    insert into public.user_roles (user_id, role_id) select '${STAFF}', r.id from public.roles r where r.slug = 'staff' on conflict do nothing;
    insert into public.staff_details (id, engagement_type_id) select '${INSTR}', t.id from public.engagement_types t where t.slug='instructor' on conflict (id) do update set engagement_type_id = excluded.engagement_type_id;
    delete from public.signature_evidence where signatory_id in (select s.id from public.signature_signatories s join public.signature_requests r on r.id=s.signature_request_id join public.agreements a on a.id=r.agreement_id where a.primary_context_reference='${INSTR}');
    delete from public.signature_events where signatory_id in (select s.id from public.signature_signatories s join public.signature_requests r on r.id=s.signature_request_id join public.agreements a on a.id=r.agreement_id where a.primary_context_reference='${INSTR}');
    delete from public.signature_signatories where signature_request_id in (select r.id from public.signature_requests r join public.agreements a on a.id=r.agreement_id where a.primary_context_reference='${INSTR}');
    delete from public.signature_requests where agreement_id in (select id from public.agreements where primary_context_reference='${INSTR}');
    delete from public.agreements where primary_context_reference='${INSTR}';
    delete from public.staff_onboarding where profile_id='${INSTR}';
    delete from public.workshop_instructor_engagements where profile_id='${INSTR}';
    set session_replication_role = replica; -- the signatory guard (0173) refuses deletes; this throwaway database is reset by the test harness only
    delete from public.entity_signatories where full_name like 'Synthetic%';
    set session_replication_role = origin;
    delete from public.employing_entity_documents where notes like 'SYNTHETIC%';
    delete from public.legal_suite_provenance_documents where release_version='approval-evidence';
    delete from public.activity_log where entity_id in (select id::text from public.legal_document_versions where master_id=(select id from public.legal_document_masters where canonical_code='OS-LGL-010'));
    update public.legal_document_versions set created_at='2026-09-08T01:36:30Z', status='approved', approved_at=null, activated_at=null, effective_date=null, content_reference=null, document_hash=null,
      master_docx_storage_path='${DOCX_PATH}', master_docx_sha256='${sha(CLEAN)}', master_pdf_storage_path='${PDF_PATH}', master_pdf_sha256='${sha(PDF)}'
      where master_id=(select id from public.legal_document_masters where canonical_code='OS-LGL-010');
    update public.legal_document_masters set current_version_id=(select id from public.legal_document_versions where master_id=legal_document_masters.id limit 1) where canonical_code='OS-LGL-010';
  `);
  ids.version = sql("select id from public.legal_document_versions where master_id=(select id from public.legal_document_masters where canonical_code='OS-LGL-010')");
  ids.ghana = sql("select id from public.employing_entities where slug='ordift-studios'");
  sql(`insert into public.employing_entity_sensitive_details (employing_entity_id, registration_number, registered_address, recorded_by) values ('${ids.ghana}','BN000000000','PO Box 1 || 1 Synthetic Street, Accra','${SUPER}') on conflict (employing_entity_id) do update set registration_number=excluded.registration_number, registered_address=excluded.registered_address`);
  const reqId = sql(`with r as (insert into public.department_requests (request_type, title, requested_by) values ('recruitment','Synthetic instructor','${SUPER}') returning id)
    insert into public.recruitment_requisitions (request_id, employing_entity_id, employment_jurisdiction_id, direct_hire_profile_id, hire_origin, headcount)
    select r.id, '${ids.ghana}', (select id from public.employment_jurisdictions where slug='ghana'), '${INSTR}', 'founder_direct_hire', 1 from r returning id`).split("\n")[0];
  ids.onboarding = sql(`insert into public.staff_onboarding (profile_id, pipeline, stage, status, requisition_id) values ('${INSTR}','external_contractor','profile','in_progress','${reqId}') returning id`).split("\n")[0];
  ids.docFile = sql(`insert into public.employing_entity_documents (employing_entity_id, document_type, storage_path, notes, uploaded_by, original_filename, file_sha256, mime_type, size_bytes) values ('${ids.ghana}','Business Registration Certificate','synthetic/file.pdf','SYNTHETIC stored file','${SUPER}','certificate.pdf','${"c".repeat(64)}','application/pdf',10) returning id`).split("\n")[0];

  // every legal prerequisite, through the real actions (the Founder's explicit steps in the workspace)
  const ev = { approvalDate: "2026-09-18", counselName: "Synthetic Counsel", counselFirm: "Synthetic LLP", evidenceKind: "counsel_email", evidenceReference: "Synthetic email approving the suite, filed in the archive", evidenceDocumentId: await storeTestEvidence(ids.version, SUPER), coversDocumentCodes: ["OS-LGL-010"], identityCheck: { method: "call_back_independent_number", checkedOn: "2026-09-20", note: "Synthetic: the Founder called the firm on an independently sourced number." } };
  for (const r of [
    await attestHistoricalApproval({ versionId: ids.version, input: ev, actorUserId: SUPER }),
    await registerControlledMaster({ versionId: ids.version, actorUserId: SUPER }),
    await activateMasterVersion({ versionId: ids.version, effectiveDate: "2026-09-18", backdatedReason: "Effective from counsel's approval date, as decided by the Founder.", actorUserId: SUPER }),
    await confirmContractingEntity({ onboardingId: ids.onboarding, entityId: ids.ghana, expectedJurisdiction: "Ghana", actorUserId: SUPER }),
  ]) if (!r.ok) throw new Error(`setup failed: ${JSON.stringify(r)}`);
  const sig = await addEntitySignatory({ entityId: ids.ghana, fullName: "Synthetic Signatory", position: "Chief Executive Officer", authority: "As stated on the certificate", sourceDocumentId: ids.docFile, profileId: SUPER, legalCapacity: "sole_proprietor", actorUserId: SUPER });
  if (!sig.ok) throw new Error(`signatory failed: ${JSON.stringify(sig)}`);
  ids.signatoryId = sig.signatoryId;
  const sel = await selectAgreementSignatory({ onboardingId: ids.onboarding, entityId: ids.ghana, signatoryId: sig.signatoryId, actorUserId: SUPER });
  if (!sel.ok) throw new Error(`select failed: ${JSON.stringify(sel)}`);
  const draft = await prepareInstructorAgreementDraft({ onboardingId: ids.onboarding, actorUserId: SUPER });
  if (!draft.ok) throw new Error(`draft failed: ${JSON.stringify(draft)}`);
  ids.agreement = draft.agreementId;
});


const today = new Date().toISOString().slice(0, 10);
const snapshots = (agreementId: string) => sql(`select string_agg(id::text || ':' || md5(snapshot_data::text), ',' order by created_at, id) from public.agreement_snapshots where agreement_id='${agreementId}'`);
const snapshotCount = (agreementId: string) => Number(sql(`select count(*) from public.agreement_snapshots where agreement_id='${agreementId}'`));
const currentFor = () => sql(`select count(*) from public.entity_signatories where employing_entity_id='${ids.ghana}' and effective_to is null`);
const issuedText = (agreementId: string) => { const k = Object.keys(h.files).find((x) => x.endsWith(`${agreementId}.txt`)); return k ? Buffer.from(h.files[k]).toString("utf8") : ""; };

// a second instructor with its own onboarding and draft; `select` chooses whether the Founder explicitly selects the signatory (otherwise the single current entry must resolve by itself)
async function freshDraft(uuidTail: string, name: string, select: boolean) {
  const P = `00000000-0000-4000-8000-0000000000${uuidTail}`;
  sql(`
    insert into auth.users (id, email) values ('${P}','${uuidTail}@p3i.test') on conflict do nothing;
    insert into public.profiles (id, full_name, access_status, member_number) values ('${P}','${name}','active','INT00${uuidTail}') on conflict (id) do update set access_status='active';
    insert into public.staff_details (id, engagement_type_id) select '${P}', t.id from public.engagement_types t where t.slug='instructor' on conflict (id) do update set engagement_type_id = excluded.engagement_type_id;
    delete from public.agreements where primary_context_reference='${P}';
    delete from public.staff_onboarding where profile_id='${P}';`);
  const reqId = sql(`with r as (insert into public.department_requests (request_type, title, requested_by) values ('recruitment','Synthetic ${name}','${SUPER}') returning id)
    insert into public.recruitment_requisitions (request_id, employing_entity_id, employment_jurisdiction_id, direct_hire_profile_id, hire_origin, headcount)
    select r.id, '${ids.ghana}', (select id from public.employment_jurisdictions where slug='ghana'), '${P}', 'founder_direct_hire', 1 from r returning id`).split("\n")[0];
  const ob = sql(`insert into public.staff_onboarding (profile_id, pipeline, stage, status, requisition_id) values ('${P}','external_contractor','profile','in_progress','${reqId}') returning id`).split("\n")[0];
  if (!(await confirmContractingEntity({ onboardingId: ob, entityId: ids.ghana, expectedJurisdiction: "Ghana", actorUserId: SUPER })).ok) throw new Error("confirm failed");
  if (select && !(await selectAgreementSignatory({ onboardingId: ob, entityId: ids.ghana, signatoryId: ids.signatoryId, actorUserId: SUPER })).ok) throw new Error("select signatory failed");
  const d = await prepareInstructorAgreementDraft({ onboardingId: ob, actorUserId: SUPER });
  if (!d.ok) throw new Error(JSON.stringify(d));
  return { P, ob, agreementId: d.agreementId };
}
const HYPHENATED_BLOCK = "For Ordift:\nSynthetic Signatory\nChief Executive Officer and Sole Proprietor\nTrading as Ordift Studios";
const CORRECTED_BLOCK = "For Ordift:\nSynthetic Signatory Corrected\nChief Executive Officer and Sole Proprietor\nTrading as Ordift Studios";
const S: { issuedSha: string; issuedTxt: string; d2: { P: string; ob: string; agreementId: string } | null; d2Snaps: string; d2Count: number; oldRow: string } = { issuedSha: "", issuedTxt: "", d2: null, d2Snaps: "", d2Count: 0, oldRow: "" };

describe("signatory supersession (proposed migration 0177)", () => {
  it("setup: the first instructor's agreement is issued with the entry as originally recorded; a second draft exists with the same entry", async () => {
    expect((await saveInstructorScheduleA({ onboardingId: ids.onboarding, agreementId: ids.agreement, terms: TERMS, actorUserId: SUPER })).ok).toBe(true);
    expect((await approveInstructorAgreementForIssue({ onboardingId: ids.onboarding, agreementId: ids.agreement, actorUserId: SUPER })).ok).toBe(true);
    expect((await issueInstructorAgreement({ onboardingId: ids.onboarding, agreementId: ids.agreement, actorUserId: SUPER })).ok).toBe(true);
    S.issuedSha = sql(`select issued_document_sha256 from public.agreements where id='${ids.agreement}'`);
    S.issuedTxt = issuedText(ids.agreement);
    expect(S.issuedTxt).toContain(HYPHENATED_BLOCK);
    S.d2 = await freshDraft("c1", "Synthetic Second", true);
    expect((await saveInstructorScheduleA({ onboardingId: S.d2.ob, agreementId: S.d2.agreementId, terms: TERMS, actorUserId: SUPER })).ok).toBe(true);
    S.d2Snaps = snapshots(S.d2.agreementId); S.d2Count = snapshotCount(S.d2.agreementId);
    S.oldRow = sql(`select to_jsonb(s) - 'effective_to' from public.entity_signatories s where id='${ids.signatoryId}'`);
    expect(currentFor()).toBe("1");
  });
  it("is refused to ordinary staff and for invalid input, changing nothing", async () => {
    const base = { signatoryId: ids.signatoryId, correctedFullName: "Synthetic Signatory Corrected", reason: "Name recorded with a spelling the certificate does not show.", effectiveOn: today };
    expect((await supersedeEntitySignatory({ ...base, actorUserId: STAFF })).ok).toBe(false);
    expect((await supersedeEntitySignatory({ ...base, correctedFullName: "Synthetic Signatory", actorUserId: SUPER })).ok).toBe(false); // same name
    expect((await supersedeEntitySignatory({ ...base, reason: "short", actorUserId: SUPER })).ok).toBe(false);
    expect((await supersedeEntitySignatory({ ...base, effectiveOn: "31/10/2026", actorUserId: SUPER })).ok).toBe(false);
    expect((await supersedeEntitySignatory({ ...base, effectiveOn: "2999-01-01", actorUserId: SUPER })).ok).toBe(false); // future
    expect((await supersedeEntitySignatory({ ...base, signatoryId: "00000000-0000-4000-8000-0000000000ee", actorUserId: SUPER })).ok).toBe(false);
    expect(currentFor()).toBe("1");
    expect(sql(`select count(*) from public.entity_signatories where supersedes_id is not null`)).toBe("0");
  });
  it("corrects the entry in one step: the old entry is kept and end-dated, one corrected entry is current and keeps the capacity, title, authority and person link", async () => {
    const r = await supersedeEntitySignatory({ signatoryId: ids.signatoryId, correctedFullName: "  Synthetic Signatory Corrected ", reason: "Name recorded with a spelling the certificate does not show.", effectiveOn: today, actorUserId: SUPER });
    if (!r.ok) throw new Error(JSON.stringify(r));
    expect(currentFor()).toBe("1");
    expect(sql(`select to_jsonb(s) - 'effective_to' from public.entity_signatories s where id='${ids.signatoryId}'`)).toBe(S.oldRow); // the old entry is unchanged but for its end date
    expect(sql(`select effective_to::text from public.entity_signatories where id='${ids.signatoryId}'`)).toBe(today);
    expect(sql(`select full_name || '|' || position || '|' || authority || '|' || legal_capacity || '|' || profile_id || '|' || supersedes_id || '|' || coalesce(effective_to::text,'current') from public.entity_signatories where id='${r.newSignatoryId}'`))
      .toBe(`Synthetic Signatory Corrected|Chief Executive Officer|As stated on the certificate|sole_proprietor|${SUPER}|${ids.signatoryId}|current`);
    expect(sql(`select count(*) from public.entity_signatories where employing_entity_id='${ids.ghana}' and profile_id='${SUPER}' and effective_to is null`)).toBe("1");
    expect(sql(`select count(*) from public.entity_signatories where full_name like 'Synthetic Signatory%'`)).toBe("2"); // history kept
    expect((await supersedeEntitySignatory({ signatoryId: ids.signatoryId, correctedFullName: "Another Corrected Name", reason: "A second attempt on a retired entry.", effectiveOn: today, actorUserId: SUPER })).ok).toBe(false);
  });
  it("does not touch the issued agreement: its hash, stored text and snapshots are unchanged, and it can still be signed to full execution", async () => {
    expect(sql(`select issued_document_sha256 from public.agreements where id='${ids.agreement}'`)).toBe(S.issuedSha);
    expect(issuedText(ids.agreement)).toBe(S.issuedTxt);
    expect(S.issuedTxt).toContain(HYPHENATED_BLOCK);
    expect(sql(`select status from public.agreements where id='${ids.agreement}'`)).toBe("sent");
    const kw = tokenFrom(`${INSTR.slice(-4)}@synthetic.test`), og = tokenFrom(`${SUPER.slice(-4)}@synthetic.test`);
    expect((await recordSignatoryConsent(kw)).ok).toBe(true);
    expect((await recordSignatorySignature({ rawToken: kw, typedFullName: "Synthetic Instructor", consentStatement: "I agree.", ipAddress: null, userAgent: "vitest" })).ok).toBe(true);
    expect((await recordSignatoryConsent(og)).ok).toBe(true);
    const done = await recordSignatorySignature({ rawToken: og, typedFullName: "Synthetic Signatory", consentStatement: "I agree on behalf of Ordift Studios.", ipAddress: null, userAgent: "vitest" });
    expect(done.ok && done.fullyExecuted).toBe(true);
    expect(sql(`select status from public.agreements where id='${ids.agreement}'`)).toBe("fully_executed");
    expect(sql(`select string_agg(distinct e.document_sha256, ',') from public.signature_evidence e join public.signature_signatories s on s.id=e.signatory_id join public.signature_requests r on r.id=s.signature_request_id where r.agreement_id='${ids.agreement}'`)).toBe(S.issuedSha);
  });
  it("an existing DRAFT keeps its snapshots untouched, and on its next save follows the correction: a new snapshot is added, the earlier ones are preserved, and the document prints the corrected block", async () => {
    const d2 = S.d2!;
    expect(snapshots(d2.agreementId)).toBe(S.d2Snaps);
    const before = await previewInstructorAgreement(d2.ob, d2.agreementId);
    expect(before.ok && before.text).toContain(HYPHENATED_BLOCK); // nothing changes until the Founder saves the terms again
    expect((await saveInstructorScheduleA({ onboardingId: d2.ob, agreementId: d2.agreementId, terms: TERMS, actorUserId: SUPER })).ok).toBe(true);
    expect(snapshotCount(d2.agreementId)).toBe(S.d2Count + 1);
    expect(snapshots(d2.agreementId).startsWith(S.d2Snaps)).toBe(true); // the earlier snapshots are byte-identical and still first
    const after = await previewInstructorAgreement(d2.ob, d2.agreementId);
    expect(after.ok && after.text).toContain(CORRECTED_BLOCK);
    expect(after.ok && after.text).toContain("Ordift Contracting Party: Synthetic Signatory Corrected, trading as Ordift Studios,");
    expect(after.ok && after.text).not.toContain("Synthetic Signatory\nChief Executive Officer");
    expect((await approveInstructorAgreementForIssue({ onboardingId: d2.ob, agreementId: d2.agreementId, actorUserId: SUPER })).ok).toBe(true);
  });
  it("a new onboarding resolves the one current signatory by itself (no selection needed) and prepares, previews and approves with the corrected block", async () => {
    const d3 = await freshDraft("c2", "Synthetic Third", false);
    expect((await saveInstructorScheduleA({ onboardingId: d3.ob, agreementId: d3.agreementId, terms: TERMS, actorUserId: SUPER })).ok).toBe(true);
    const p = await previewInstructorAgreement(d3.ob, d3.agreementId);
    expect(p.ok && p.text).toContain(CORRECTED_BLOCK);
    expect((await approveInstructorAgreementForIssue({ onboardingId: d3.ob, agreementId: d3.agreementId, actorUserId: SUPER })).ok).toBe(true);
  });
  it("the audit trail records the correction once, with who, why and both entries", async () => {
    expect(sql(`select count(*) from public.activity_log where action='entity_signatory.superseded' and metadata->>'supersededSignatoryId'='${ids.signatoryId}'`)).toBe("1");
    expect(sql(`select metadata->>'previousName' || '>' || (metadata->>'correctedName') from public.activity_log where action='entity_signatory.superseded' and metadata->>'supersededSignatoryId'='${ids.signatoryId}'`)).toBe("Synthetic Signatory>Synthetic Signatory Corrected");
  });
  it("the authority wording can be corrected the same way (name kept); a draft follows the chain of corrections to the one current entry, and the old wording stays in history", async () => {
    const current = sql(`select id from public.entity_signatories where employing_entity_id='${ids.ghana}' and effective_to is null`);
    expect((await supersedeEntitySignatory({ signatoryId: current, correctedAuthority: "ab", reason: "Authority wording corrected to the registration document.", effectiveOn: today, actorUserId: SUPER })).ok).toBe(false);
    expect((await supersedeEntitySignatory({ signatoryId: current, reason: "Nothing is actually being changed here at all.", effectiveOn: today, actorUserId: SUPER })).ok).toBe(false);
    const r = await supersedeEntitySignatory({ signatoryId: current, correctedAuthority: "Owner and Sole Proprietor, as shown on Form A", reason: "Authority wording corrected to the registration document.", effectiveOn: today, actorUserId: SUPER });
    if (!r.ok) throw new Error(JSON.stringify(r));
    expect(currentFor()).toBe("1");
    expect(sql(`select full_name || '|' || authority || '|' || position || '|' || legal_capacity from public.entity_signatories where id='${r.newSignatoryId}'`)).toBe("Synthetic Signatory Corrected|Owner and Sole Proprietor, as shown on Form A|Chief Executive Officer|sole_proprietor");
    expect(sql(`select authority from public.entity_signatories where id='${current}'`)).toBe("As stated on the certificate");
    expect(sql(`select count(*) from public.entity_signatories where full_name like 'Synthetic Signatory%'`)).toBe("3"); // three entries of history, one current
    const d2 = S.d2!;
    expect((await saveInstructorScheduleA({ onboardingId: d2.ob, agreementId: d2.agreementId, terms: TERMS, actorUserId: SUPER })).ok).toBe(false); // already approved for issue: its terms are frozen, nothing is re-read
  });
  it("a draft created before BOTH corrections follows the whole chain", async () => {
    const d4 = await freshDraft("c3", "Synthetic Fourth", false);
    const root = sql(`select id from public.entity_signatories where supersedes_id is null and full_name='Synthetic Signatory'`);
    expect((await saveInstructorScheduleA({ onboardingId: d4.ob, agreementId: d4.agreementId, terms: TERMS, actorUserId: SUPER })).ok).toBe(true);
    // point the draft's snapshot at the ROOT entry, as a draft made before any correction would hold, by recording the Founder's selection of the root
    sql(`update public.agreement_snapshots set snapshot_data = jsonb_set(snapshot_data, '{signatory,id}', to_jsonb('${root}'::text)) where agreement_id='${d4.agreementId}'`);
    expect((await saveInstructorScheduleA({ onboardingId: d4.ob, agreementId: d4.agreementId, terms: TERMS, actorUserId: SUPER })).ok).toBe(true);
    const p = await previewInstructorAgreement(d4.ob, d4.agreementId);
    expect(p.ok && p.text).toContain("For Ordift:\nSynthetic Signatory Corrected\nChief Executive Officer and Sole Proprietor\nTrading as Ordift Studios\n\nAuthority: Owner and Sole Proprietor, as shown on Form A");
  });
  it("a changed account email reaches a DRAFT only when its terms are saved again; earlier snapshots are preserved; the signing link goes to the new address and nothing goes to the old one", async () => {
    const d5 = await freshDraft("f5", "Synthetic Fifth", false);
    const oldEmail = `${d5.P.slice(-4)}@synthetic.test`, newEmail = "fifth.personal@synthetic.test";
    expect((await saveInstructorScheduleA({ onboardingId: d5.ob, agreementId: d5.agreementId, terms: TERMS, actorUserId: SUPER })).ok).toBe(true);
    const snapsBefore = snapshots(d5.agreementId), countBefore = snapshotCount(d5.agreementId);
    expect((await previewInstructorAgreement(d5.ob, d5.agreementId)).ok && (await previewInstructorAgreement(d5.ob, d5.agreementId) as { text: string }).text).toContain(`Contact: ${oldEmail}`);
    h.emailOverride[d5.P] = newEmail;                                    // the account email is changed (outside this app) before issue
    const stale = await previewInstructorAgreement(d5.ob, d5.agreementId);
    expect(stale.ok && stale.text).toContain(`Contact: ${oldEmail}`);     // nothing changes until the terms are saved again
    expect((await saveInstructorScheduleA({ onboardingId: d5.ob, agreementId: d5.agreementId, terms: TERMS, actorUserId: SUPER })).ok).toBe(true);
    expect(snapshotCount(d5.agreementId)).toBe(countBefore + 1);
    expect(snapshots(d5.agreementId).startsWith(snapsBefore)).toBe(true); // earlier snapshots byte-identical
    const fresh = await previewInstructorAgreement(d5.ob, d5.agreementId);
    expect(fresh.ok && fresh.text).toContain(`Contact: ${newEmail}`);
    expect(fresh.ok && fresh.text).not.toContain(oldEmail);
    expect(fresh.ok && fresh.text.split("\n").find((l) => l.startsWith("Instructor / Facilitator:"))).toBe("Instructor / Facilitator: Synthetic Fifth, contracting personally (member INT00f5)"); // same person, same profile
    expect((await approveInstructorAgreementForIssue({ onboardingId: d5.ob, agreementId: d5.agreementId, actorUserId: SUPER })).ok).toBe(true);
    expect((await issueInstructorAgreement({ onboardingId: d5.ob, agreementId: d5.agreementId, actorUserId: SUPER })).ok).toBe(true);
    expect(h.emails.filter((e) => e.to === newEmail).length).toBe(1);
    expect(h.emails.filter((e) => e.to === oldEmail).length).toBe(0);
    expect(tokenFrom(newEmail)).not.toBe("");
    delete h.emailOverride[d5.P];
  });
});
