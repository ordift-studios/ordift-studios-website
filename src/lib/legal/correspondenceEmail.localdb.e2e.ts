// @vitest-environment node
//
// PREFERRED CORRESPONDENCE EMAIL (proposed migration 0178): access control, append-only history, audit masking, agreement Contact line, snapshot preservation and signing-link isolation. REAL schema
// (throwaway local Postgres + PostgREST), using the REAL signature engine and the REAL token-based signing functions. SYNTHETIC data only.
// Only the private storage buckets and the email sender are stubbed (nothing is ever sent). Run:
//   (scratch DB must already have PROPOSED_0178 applied - see supabase/proposals/rehearse_0178.sh and scratchpad apply0178.sh)
//   npx vitest run --config vitest.localdb.config.ts src/lib/legal/correspondenceEmail.localdb.e2e.ts
import { createHash } from "node:crypto";
import { execSync } from "node:child_process";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { makeZip } from "./zipFixture.testkit";

const h = vi.hoisted(() => ({
  agent: null as unknown,
  files: {} as Record<string, Uint8Array>,
  emails: [] as { to: string; subject: string; text: string }[],
  failFor: new Set<string>(),
  throwFor: new Set<string>(),
  logs: [] as { action: string; metadata: Record<string, unknown> }[],
  authWrites: [] as string[],
  fetch: async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const undici = await import("undici");
    (h as { agent: unknown }).agent ??= new undici.Agent({ keepAliveTimeout: 1, keepAliveMaxTimeout: 1 });
    return (await undici.fetch(String(input).replace("/rest/v1", ""), { ...(init as object), dispatcher: (h as { agent: unknown }).agent as import("undici").Dispatcher })) as unknown as Response;
  },
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/admin/activityLog", () => ({ logActivity: vi.fn(async (e: { action: string; metadata: Record<string, unknown> }) => { h.logs.push({ action: e.action, metadata: e.metadata }); }) }));
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
          if (prop === "auth") return { admin: { getUserById: async (id: string) => ({ data: { user: { email: `${id.slice(-4)}@synthetic.test` } } }), updateUserById: async (id: string) => { h.authWrites.push(`updateUserById:${id}`); return { error: null }; }, createUser: async () => { h.authWrites.push("createUser"); return { error: null }; }, deleteUser: async () => { h.authWrites.push("deleteUser"); return { error: null }; } } };
          return Reflect.get(target, prop);
        },
      });
    },
  };
});

import { attestHistoricalApproval, activateMasterVersion, registerControlledMaster } from "./masterRegistryActions";
import { confirmContractingEntity, selectAgreementSignatory } from "@/lib/organization/onboardingDecisions";
import { addEntitySignatory } from "@/lib/organization/entityRegistrations";
import { setCorrespondenceEmail, getPreferredCorrespondenceEmail, loadContactEmailsForViewer, canAccessCorrespondenceEmail } from "@/lib/organization/correspondenceEmail";
import { prepareInstructorAgreementDraft } from "./instructorAgreements";
import { approveInstructorAgreementForIssue, issueInstructorAgreement, previewInstructorAgreement, saveInstructorScheduleA } from "./instructorAgreementIssuance";
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



const ceLogs = () => h.logs.filter((l) => l.action.startsWith("profile.correspondence_email_")); // other actions in the setup are logged too
const ACCOUNT = `${INSTR.slice(-4)}@synthetic.test`;     // the account (login) email the harness derives for the instructor
const PREFERRED = "preferred.contact@correspondence.test";
const SECOND = "second.contact@correspondence.test";
const EVIDENCE = "Requested by the instructor by email; confirmed by call-back to the number on record.";
const snapshots = () => sql(`select string_agg(id::text || ':' || md5(snapshot_data::text), ',' order by created_at, id) from public.agreement_snapshots where agreement_id='${ids.agreement}'`);
const snapshotCount = () => Number(sql(`select count(*) from public.agreement_snapshots where agreement_id='${ids.agreement}'`));
const contactLine = async () => { const p = await previewInstructorAgreement(ids.onboarding, ids.agreement); if (!p.ok) throw new Error("preview failed"); return p.text.split("\n").find((l) => l.startsWith("Contact:")); };
const save = async () => expect((await saveInstructorScheduleA({ onboardingId: ids.onboarding, agreementId: ids.agreement, terms: TERMS, actorUserId: SUPER })).ok).toBe(true);
const asRole = (sub: string | null, role: "authenticated" | "anon", query: string) => sql(`begin; set local role ${role}; select set_config('request.jwt.claims', '${JSON.stringify(sub ? { sub, role } : { role })}', true); ${query}; rollback;`).split("\n").filter(Boolean).pop() ?? "";

describe("access control", () => {
  it("people-management authority (Super Admin here) may read and record; ordinary staff may do neither", async () => {
    expect(await canAccessCorrespondenceEmail(SUPER)).toBe(true);
    expect(await canAccessCorrespondenceEmail(STAFF)).toBe(false);
    expect(await setCorrespondenceEmail({ profileId: INSTR, email: PREFERRED, source: "person_request", evidenceNote: EVIDENCE, actorUserId: STAFF })).toEqual({ ok: false, error: "You are not authorized to record a correspondence email." });
    expect(await loadContactEmailsForViewer(INSTR, STAFF)).toBeNull();
    expect(sql(`select count(*) from public.profile_correspondence_emails`)).toBe("0");
    expect(ceLogs()).toHaveLength(0);
  });
  it("no signed-in role can read the table at all (so no evidence note, metadata, history or other person's record), and nobody can write to it directly", async () => {
    expect((await setCorrespondenceEmail({ profileId: INSTR, email: PREFERRED, source: "person_request", evidenceNote: EVIDENCE, actorUserId: SUPER })).ok).toBe(true);
    const read = (cols: string) => `select ${cols} from public.profile_correspondence_emails`;
    for (const who of [STAFF, INSTR, SUPER]) for (const cols of ["count(*)", "evidence_note", "recorded_by", "source", "email", "*"]) expect(() => asRole(who, "authenticated", read(cols)), `${who} ${cols}`).toThrow(); // permission denied, even for Super Admin and for the person's own row
    expect(() => asRole(null, "anon", read("count(*)"))).toThrow();
    for (const who of [STAFF, INSTR, SUPER]) expect(() => asRole(who, "authenticated", `insert into public.profile_correspondence_emails (profile_id, email, source, evidence_note, recorded_by) values ('${INSTR}', 'x.y@correspondence.test', 'staff_entered', 'Direct write attempt reference.', '${who}')`)).toThrow();
    for (const sql_ of ["update public.profile_correspondence_emails set email = null", "delete from public.profile_correspondence_emails", "truncate public.profile_correspondence_emails"]) expect(() => asRole(INSTR, "authenticated", sql_)).toThrow();
    expect(sql(`select count(*) from public.profile_correspondence_emails`)).toBe("1");                    // service-side count: nothing changed
  });
});

describe("the portal card's database function: the caller's own current address and nothing else", () => {
  const mine = (sub: string | null, role: "authenticated" | "anon" = "authenticated") => asRole(sub, role, "select coalesce(public.my_correspondence_email(), '(none)')");
  it("a signed-in person gets only their own current preference; a person with none, or someone else, gets none; it takes no parameter and anon cannot call it", () => {
    expect(mine(INSTR)).toBe(PREFERRED);                  // the person: their own current preference
    expect(mine(STAFF)).toBe("(none)");                   // another signed-in person has none of their own, and cannot ask about the instructor's
    expect(mine(SUPER)).toBe("(none)");                   // even Super Admin gets only their OWN value through this function
    expect(() => asRole(INSTR, "authenticated", `select public.my_correspondence_email('${STAFF}')`)).toThrow(); // no parameter: nobody else's record can be requested
    expect(() => mine(null, "anon")).toThrow();           // not signed in: cannot execute
    expect(sql(`select pg_get_function_result('public.my_correspondence_email()'::regprocedure)`)).toBe("text"); // a single address, nothing else
  });
});

describe("append-only history and the database's own checks", () => {
  it("every change is a new row: set, change, clear - nothing is updated or deleted, and the database refuses both", async () => {
    expect((await setCorrespondenceEmail({ profileId: INSTR, email: SECOND, source: "staff_entered", evidenceNote: "Changed by an administrator at the person's request.", actorUserId: SUPER })).ok).toBe(true);
    expect((await setCorrespondenceEmail({ profileId: INSTR, email: null, source: "person_request", evidenceNote: "The person asked for the account email to be used again.", actorUserId: SUPER })).ok).toBe(true);
    expect(sql(`select string_agg(coalesce(email,'(cleared)'), ' > ' order by created_at, id) from public.profile_correspondence_emails where profile_id='${INSTR}'`)).toBe(`${PREFERRED} > ${SECOND} > (cleared)`);
    expect(() => sql(`update public.profile_correspondence_emails set email='x.y@correspondence.test'`)).toThrow();
    expect(() => sql(`delete from public.profile_correspondence_emails`)).toThrow();
    expect(await getPreferredCorrespondenceEmail(INSTR)).toBeNull();
    const view = await loadContactEmailsForViewer(INSTR, SUPER);
    expect(view?.history.map((x) => x.action)).toEqual(["cleared", "changed", "set"]);
    expect(JSON.stringify(view?.history)).not.toContain("preferred.contact@");
  });
  it("the database itself refuses a malformed address and an evidence note that carries an address or a long number", () => {
    const ins = (email: string, note: string) => () => sql(`insert into public.profile_correspondence_emails (profile_id, email, source, evidence_note, recorded_by) values ('${INSTR}', '${email}', 'staff_entered', '${note}', '${SUPER}')`);
    expect(ins("Not Valid", "A reasonable evidence reference.")).toThrow();
    expect(ins("ok@correspondence.test", "Confirmed with other.person@somewhere.test by email")).toThrow();
    expect(ins("ok@correspondence.test", "Called him on 0200 000 0000 to confirm")).toThrow();
  });
});

describe("audit-log masking", () => {
  it("the shared audit log received masked addresses and no evidence text", () => {
    const text = JSON.stringify(ceLogs());
    expect(ceLogs().map((l) => l.action)).toEqual(["profile.correspondence_email_set", "profile.correspondence_email_changed", "profile.correspondence_email_cleared"]);
    for (const secret of ["preferred.contact", "second.contact", "correspondence.test", "call-back", "number on record", "administrator at the person"]) expect(text).not.toContain(secret);
    expect(ceLogs().every((l) => l.metadata.evidenceRecorded === true)).toBe(true);
  });
});

describe("agreement Contact line and snapshot preservation", () => {
  it("with no preference the Contact line is the account email", async () => {
    await save();
    expect(await contactLine()).toBe(`Contact: ${ACCOUNT}`);
  });
  it("a preference reaches the draft only when its terms are saved again; earlier snapshots are preserved byte-for-byte; clearing falls back to the account email", async () => {
    const [snapsBefore, countBefore] = [snapshots(), snapshotCount()];
    expect((await setCorrespondenceEmail({ profileId: INSTR, email: PREFERRED, source: "person_request", evidenceNote: EVIDENCE, actorUserId: SUPER })).ok).toBe(true);
    expect(await contactLine()).toBe(`Contact: ${ACCOUNT}`);                // nothing changes until the terms are saved again
    await save();
    expect(snapshotCount()).toBe(countBefore + 1);
    expect(snapshots().startsWith(snapsBefore)).toBe(true);
    expect(await contactLine()).toBe(`Contact: ${PREFERRED}`);
    const afterSet = snapshots();
    expect((await setCorrespondenceEmail({ profileId: INSTR, email: null, source: "person_request", evidenceNote: "The person asked for the account email to be used again.", actorUserId: SUPER })).ok).toBe(true);
    expect(await contactLine()).toBe(`Contact: ${PREFERRED}`);               // again, only on the next save
    await save();
    expect(snapshots().startsWith(afterSet)).toBe(true);
    expect(await contactLine()).toBe(`Contact: ${ACCOUNT}`);
  });
  it("only the Contact line differs, and the master clauses are unchanged", async () => {
    await save();
    const base = (await previewInstructorAgreement(ids.onboarding, ids.agreement)) as { text: string };
    expect((await setCorrespondenceEmail({ profileId: INSTR, email: PREFERRED, source: "staff_entered", evidenceNote: EVIDENCE, actorUserId: SUPER })).ok).toBe(true);
    await save();
    const withPref = (await previewInstructorAgreement(ids.onboarding, ids.agreement)) as { text: string };
    const [a, b] = [base.text.split("\n"), withPref.text.split("\n")];
    expect(a.map((l, i) => (l === b[i] ? null : [l, b[i]])).filter(Boolean)).toEqual([[`Contact: ${ACCOUNT}`, `Contact: ${PREFERRED}`]]);
  });
});

describe("signing-link isolation", () => {
  it("the secure signing links go to the ACCOUNT emails, never to the preferred address; the account email is never written; the issued document records the preference as Contact", async () => {
    const emailsBefore = h.emails.length;
    expect(await getPreferredCorrespondenceEmail(INSTR)).toBe(PREFERRED);
    expect((await approveInstructorAgreementForIssue({ onboardingId: ids.onboarding, agreementId: ids.agreement, actorUserId: SUPER })).ok).toBe(true);
    expect((await issueInstructorAgreement({ onboardingId: ids.onboarding, agreementId: ids.agreement, actorUserId: SUPER })).ok).toBe(true);
    const sent = h.emails.slice(emailsBefore).map((e) => e.to).sort();
    expect(sent).toEqual([ACCOUNT, `${SUPER.slice(-4)}@synthetic.test`].sort());       // the instructor's and the Ordift signatory's ACCOUNT emails
    expect(h.emails.some((e) => e.to === PREFERRED || e.to === SECOND)).toBe(false);
    expect(h.emails.some((e) => /correspondence\.test/.test(e.text) || /correspondence\.test/.test(e.subject))).toBe(false);
    expect(h.authWrites).toEqual([]);                                                   // no Auth account write of any kind, in any test of this file
    const stored = Object.keys(h.files).find((k) => k.endsWith(`${ids.agreement}.txt`));
    expect(Buffer.from(h.files[stored as string]).toString("utf8")).toContain(`Contact: ${PREFERRED}`);
    expect(sql(`select status from public.agreements where id='${ids.agreement}'`)).toBe("sent");
  });
  it("changing the preference after issue changes nothing in the issued agreement", async () => {
    const [sha, text] = [sql(`select issued_document_sha256 from public.agreements where id='${ids.agreement}'`), Buffer.from(h.files[Object.keys(h.files).find((k) => k.endsWith(`${ids.agreement}.txt`)) as string]).toString("utf8")];
    expect((await setCorrespondenceEmail({ profileId: INSTR, email: SECOND, source: "staff_entered", evidenceNote: "Changed after issue at the person's request.", actorUserId: SUPER })).ok).toBe(true);
    expect((await saveInstructorScheduleA({ onboardingId: ids.onboarding, agreementId: ids.agreement, terms: TERMS, actorUserId: SUPER })).ok).toBe(false); // an issued agreement's terms are frozen
    expect(sql(`select issued_document_sha256 from public.agreements where id='${ids.agreement}'`)).toBe(sha);
    expect(Buffer.from(h.files[Object.keys(h.files).find((k) => k.endsWith(`${ids.agreement}.txt`)) as string]).toString("utf8")).toBe(text);
  });
});
