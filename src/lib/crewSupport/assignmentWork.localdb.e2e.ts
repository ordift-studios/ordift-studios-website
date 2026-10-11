// @vitest-environment node
//
// End-to-end run of the REAL assignment-workspace code (job-completion reports, assignment-linked file
// uploads, controlled release to the client, the client download route) against a throwaway local Postgres
// + PostgREST built from the full migration chain (see vitest.localdb.config.ts and
// scripts/crew-support-e2e.md). It cannot reach Staging or Production: the Supabase URL is forced to
// localhost, storage and outbound email are stubbed/captured.
//
// Two fidelity measures beyond the other E2E files:
//   * the "session" client is a REAL per-user JWT, so row-level security genuinely applies (the other files
//     use the service key as the session client and would not notice a broken policy);
//   * the Production grant gap is reproduced: Production's service_role has no access to deliverables,
//     deliverable_categories or enquiry_notes, so those are revoked here and any code that reads or writes
//     them with the admin client fails the test exactly as it would live.
import { beforeAll, describe, expect, it, vi } from "vitest";
import { execSync } from "node:child_process";
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const h = vi.hoisted(() => ({
  user: null as null | { id: string; email: string | null; fullName: string | null; roles: string[]; accessStatus: string },
  sent: [] as { to: string; subject: string; text: string }[],
  emails: new Map<string, string>(),
  signed: [] as { path: string; download?: string }[],
  agent: null as unknown,
  fetch: async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const undici = await import("undici");
    (h as { agent: unknown }).agent ??= new undici.Agent({ keepAliveTimeout: 1, keepAliveMaxTimeout: 1 });
    return (await undici.fetch(String(input).replace("/rest/v1", ""), { ...(init as object), dispatcher: (h as { agent: unknown }).agent as import("undici").Dispatcher })) as unknown as Response;
  },
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/notifications/dispatch", () => ({
  dispatchNotification: vi.fn(async (a: { email: { to: string; subject: string; text: string } }) => {
    h.sent.push({ to: a.email.to, subject: a.email.subject, text: a.email.text });
    return { email: { ok: true, mode: "logged", attempts: 1 } };
  }),
}));
vi.mock("@/lib/portal/roles", async (orig) => ({ ...(await orig<typeof import("@/lib/portal/roles")>()), getCurrentUser: async () => h.user }));
vi.mock("@/lib/supabase/server", async () => {
  const { createClient: make } = await import("@supabase/supabase-js");
  const { createHmac: hmac } = await import("node:crypto");
  const { readFileSync: read } = await import("node:fs");
  // A real user JWT: PostgREST sets the authenticated role and auth.uid(), so RLS applies.
  const token = (sub: string) => {
    const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
    const head = b64({ alg: "HS256", typ: "JWT" });
    const body = b64({ role: "authenticated", sub, aud: "authenticated", exp: Math.floor(Date.now() / 1000) + 3600 });
    return `${head}.${body}.${hmac("sha256", read("/tmp/e2e_jwt_secret", "utf8").trim()).update(`${head}.${body}`).digest("base64url")}`;
  };
  return {
    createClient: async () => {
      // Signed out: the anonymous key, exactly as a visitor's request would carry.
      return make(process.env.NEXT_PUBLIC_SUPABASE_URL!, h.user ? token(h.user.id) : read("/tmp/e2e_anon_jwt", "utf8").trim(), { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: h.fetch } });
    },
  };
});
vi.mock("@/lib/supabase/admin", async () => {
  const { createClient: make } = await import("@supabase/supabase-js");
  return {
    createAdminClient: () => {
      const c = make(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: h.fetch } });
      (c.auth as unknown as { admin: unknown }).admin = { getUserById: async (id: string) => ({ data: { user: { email: h.emails.get(id) ?? null } }, error: null }) };
      Object.defineProperty(c, "storage", {
        value: { from: () => ({ createSignedUploadUrl: async (path: string) => ({ data: { signedUrl: `https://upload.example/${path}`, token: "t", path }, error: null }), createSignedUrl: async (path: string, _s: number, opts?: { download?: string }) => { h.signed.push({ path, download: opts?.download }); return { data: { signedUrl: `https://signed.example/${path}` }, error: null }; } }) },
      });
      return c;
    },
  };
});

import { NextRequest } from "next/server";
import { GET as clientDownload } from "@/app/portal/(dashboard)/client/files/[fileId]/download/route";
import { requestProjectFileUploadAuthorization, recordUploadedProjectFile, listProjectFilesForEngagement } from "@/lib/payables/projectFiles";
import { setCrewSupportStatus } from "./admin";
import { respondToCrewOffer, sendCrewOffer } from "./crewOffers";
import { getServiceFamilyForEngagement, listMyReports, listReportsForEngagement, submitJobReport } from "./jobReports";
import { releaseApprovedFiles as releaseFiles, reviewFileForRelease, submitFileForRelease, withdrawFileFromReview } from "./fileReleaseFlow";
import type { JobReportInput } from "./jobReportRules";
import type { CurrentUser } from "@/lib/portal/roles";

if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:|\/|$)/.test(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "")) {
  throw new Error("Refusing to run: this E2E may only target a localhost database.");
}

const SUPER = "00000000-0000-4000-8000-0000000000c1"; // Founder-like: admin + super_admin
const CREW1 = "00000000-0000-4000-8000-0000000000c2"; // staff member assigned to the job ("unclassified" for external-workforce modules)
const CREW2 = "00000000-0000-4000-8000-0000000000c3"; // another staff member, not on the job
const CLIENT = "00000000-0000-4000-8000-0000000000c4";
const CLIENT2 = "00000000-0000-4000-8000-0000000000c5";

const db = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false }, global: { fetch: h.fetch } });
const sql = (q: string) => execSync("docker exec -i ordift-mig-check2 psql -U postgres -h 127.0.0.1 -v ON_ERROR_STOP=1 -At", { input: q }).toString();
const jwt = (sub: string) => {
  const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const head = b64({ alg: "HS256", typ: "JWT" });
  const body = b64({ role: "authenticated", sub, aud: "authenticated", exp: Math.floor(Date.now() / 1000) + 3600 });
  return `${head}.${body}.${createHmac("sha256", readFileSync("/tmp/e2e_jwt_secret", "utf8").trim()).update(`${head}.${body}`).digest("base64url")}`;
};
const asUserDb = (id: string) => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, jwt(id), { auth: { persistSession: false }, global: { fetch: h.fetch } });
const ROLES: Record<string, string[]> = { [SUPER]: ["admin", "super_admin"], [CREW1]: ["staff"], [CREW2]: ["staff"], [CLIENT]: ["client"], [CLIENT2]: ["client"] };
const as = (id: string | null) => { h.user = id ? { id, email: `${id}@e2e.test`, fullName: id, roles: ROLES[id] ?? [], accessStatus: "active" } : null; };
const asCurrent = (id: string): CurrentUser => ({ id, email: `${id}@e2e.test`, fullName: id, roles: ROLES[id] ?? [], accessStatus: "active" }) as unknown as CurrentUser;
const must = <T extends { ok: boolean }>(r: T, label = ""): Extract<T, { ok: true }> => { if (!r.ok) throw new Error(`${label} expected ok, got ${JSON.stringify(r)}`); return r as Extract<T, { ok: true }>; };
const mustFail = <T extends { ok: boolean }>(r: T): string => { expect(r.ok).toBe(false); return (r as unknown as { error?: string }).error ?? ""; };
const count = async (table: string, f: Record<string, unknown>) => (await db().from(table).select("id", { count: "exact", head: true }).match(f)).count ?? 0;

// Release runs as the signed-in management user (its deliverable writes go through that user's session).
const releaseApprovedFiles = (p: Parameters<typeof releaseFiles>[0]) => { as(p.user.id); return releaseFiles(p); };

// deliverables are unreadable to service_role (as in Production), so count them as a signed-in administrator.
const deliverableCount = async (enquiryId: string) => (await asUserDb(SUPER).from("deliverables").select("id").eq("entity_id", enquiryId)).data?.length ?? -1;

let titleId = "";
let counter = 0;

async function newJob(crewId = CREW1) {
  as(SUPER);
  const ref = `CSR-2026-W${Date.now().toString().slice(-8)}${++counter % 100}`;
  const email = `client-${ref.toLowerCase()}@example.com`;
  const { data, error } = await db().rpc("create_crew_support_request", {
    p_request: {
      user_id: CLIENT, reference_number: ref, requester_type: "photographer", requester_name: "Bright Test", requester_email: email, requester_phone: "+974000000", service_family: "photography",
      project_name: `Assignment ${ref}`, project_type: "Wedding", start_date: "2026-10-12", end_date: "2026-10-12", call_time: "10:00", finish_time: "21:00", location: "Doha — QA", on_site_contact: "Ama",
      urgency: "standard", service_details: { equipment: "requester_supplies" }, consent_accepted_at: new Date().toISOString(), submitted_at: new Date().toISOString(),
    },
    p_requirements: [{ operational_title_id: titleId, role_label: "Photographer", quantity: 1, responsibilities: "Coverage" }],
  });
  if (error) throw new Error(error.message);
  const ids = data as { request_id: string; enquiry_id: string };
  const { data: slot } = await db().from("crew_support_slots").select("id").eq("request_id", ids.request_id).single();
  must(await setCrewSupportStatus({ requestId: ids.request_id, to: "under_review", actorUserId: SUPER }), "under_review");
  must(await setCrewSupportStatus({ requestId: ids.request_id, to: "availability_review", actorUserId: SUPER }), "availability_review");
  must(await sendCrewOffer({ slotId: slot!.id as string, assigneeProfileId: crewId, amount: 1000, currency: "QAR", message: "", overrideReason: null, actorUserId: SUPER }), "offer");
  must(await respondToCrewOffer({ slotId: slot!.id as string, userId: crewId, response: "accept", note: "" }), "accept");
  const eng = (await db().from("engagements").select("id, status, payment_obligation_id").eq("entity_id", slot!.id as string).single()).data!;
  return { requestId: ids.request_id, enquiryId: ids.enquiry_id, slotId: slot!.id as string, engagementId: eng.id as string, ref, email };
}

const REPORT: JobReportInput = { serviceFamily: "photography", actualServiceDate: "2026-10-12", actualStartTime: "10:00", actualEndTime: "21:00", completionStatus: "completed", wentSmoothly: true, answers: { onTime: "yes", conditions: "good", editingRemaining: "selects" }, incidents: "", clientRequests: "Asked for extra family portraits", additionalServices: "", outstandingWork: "Edit the thank-you selection", remarks: "" };

async function upload(engagementId: string, name: string, category: string | null = "thank_you_image", user = CREW1) {
  as(user);
  const auth = must(await requestProjectFileUploadAuthorization({ engagementId, fileKind: "deliverable", originalFilename: name, actorUserId: user, releaseCategory: category }), "authorize");
  return must(await recordUploadedProjectFile({ engagementId, fileKind: "deliverable", storagePath: auth.path, originalFilename: name, mimeType: "image/jpeg", sizeBytes: 1234, actorUserId: user, releaseCategory: category }), "record");
}
const fileRow = async (id: string) => (await db().from("project_files").select("*").eq("id", id).single()).data as Record<string, unknown>;

beforeAll(() => {
  // The throwaway stack's auth.uid() only reads the legacy per-claim setting, which current PostgREST no
  // longer sets. Use Supabase's real definition (it also reads request.jwt.claims) so a user JWT resolves.
  execSync("docker exec -i ordift-mig-check2 psql -U supabase_admin -d postgres -h 127.0.0.1 -v ON_ERROR_STOP=1 -At", {
    input: `create or replace function auth.uid() returns uuid language sql stable as $$
      select coalesce(nullif(current_setting('request.jwt.claim.sub', true), ''), (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'))::uuid
    $$;`,
  });
  sql(`
    insert into auth.users (id, email) values ('${SUPER}','founder@e2e.test'),('${CREW1}','crew1@e2e.test'),('${CREW2}','crew2@e2e.test'),('${CLIENT}','client@e2e.test'),('${CLIENT2}','client2@e2e.test') on conflict do nothing;
    insert into public.profiles (id, full_name, access_status) values ('${SUPER}','Founder','active'),('${CREW1}','Crew One','active'),('${CREW2}','Crew Two','active'),('${CLIENT}','Client One','active'),('${CLIENT2}','Client Two','active')
      on conflict (id) do update set full_name = excluded.full_name, access_status = 'active';
    insert into public.user_roles (user_id, role_id) select '${SUPER}', id from public.roles where slug in ('admin','super_admin') on conflict do nothing;
    insert into public.user_roles (user_id, role_id) select u, (select id from public.roles where slug = 'staff') from unnest(array['${CREW1}','${CREW2}']::uuid[]) u on conflict do nothing;
    insert into public.person_capabilities (profile_id, operational_title_id, proficiency, verification_status, source)
      select p, (select id from public.operational_titles where slug = 'photographer'), 'primary', 'verified', 'admin' from unnest(array['${CREW1}','${CREW2}']::uuid[]) p on conflict do nothing;
    -- Reproduce Production: service_role has no access to these tables.
    revoke all on public.deliverables, public.deliverable_categories, public.enquiry_notes from service_role;
  `);
  h.emails.set(SUPER, "founder@e2e.test");
  h.emails.set(CREW1, "crew1@e2e.test");
  h.emails.set(CREW2, "crew2@e2e.test");
  titleId = sql("select id from public.operational_titles where slug = 'photographer'").trim();
});

describe("A — upload gating: the accepted assignee can upload; nobody else can; uploads are private", () => {
  const j = {} as Awaited<ReturnType<typeof newJob>>;
  it("A1 a staff member (unclassified for external-workforce modules) can upload to the job they accepted, tagged with a category, and the file starts PRIVATE", async () => {
    Object.assign(j, await newJob());
    const rec = await upload(j.engagementId, "thank-you-1.jpg");
    const row = await fileRow(rec.id);
    expect(row).toMatchObject({ release_status: "private", release_category: "thank_you_image", engagement_id: j.engagementId, uploaded_by: CREW1, deliverable_id: null });
    expect(await deliverableCount(j.enquiryId)).toBe(0);
  });
  it("A2 someone who is not on the job is refused, and an unknown category is refused", async () => {
    expect(mustFail(await requestProjectFileUploadAuthorization({ engagementId: j.engagementId, fileKind: "deliverable", originalFilename: "x.jpg", actorUserId: CREW2, releaseCategory: "thank_you_image" }))).toMatch(/Not authorized/);
    expect(mustFail(await requestProjectFileUploadAuthorization({ engagementId: j.engagementId, fileKind: "deliverable", originalFilename: "x.jpg", actorUserId: CREW1, releaseCategory: "party_pics" }))).toMatch(/Unrecognized file category/);
    expect(mustFail(await recordUploadedProjectFile({ engagementId: j.engagementId, fileKind: "deliverable", storagePath: `${j.engagementId}/x.jpg`, originalFilename: "x.jpg", mimeType: null, sizeBytes: 1, actorUserId: CREW2, releaseCategory: "thank_you_image" }))).toMatch(/Not authorized/);
  });
  it("A3 uploading does not change the engagement, the request, any payable or send any email", async () => {
    const e = (await db().from("engagements").select("status, payment_obligation_id").eq("id", j.engagementId).single()).data!;
    expect(e.payment_obligation_id).toBeNull();
    const before = h.sent.length;
    await upload(j.engagementId, "thank-you-extra.jpg");
    expect(h.sent.length).toBe(before);
  });
});

describe("B — job-completion report: versions, audit, privacy, and no side effects", () => {
  const j = {} as Awaited<ReturnType<typeof newJob>>;
  it("B1 only the assigned professional can submit; validation errors are specific", async () => {
    Object.assign(j, await newJob());
    expect(mustFail(await submitJobReport({ engagementId: j.engagementId, actorUserId: CREW2, input: REPORT }))).toMatch(/Only the professional assigned/);
    expect(mustFail(await submitJobReport({ engagementId: j.engagementId, actorUserId: CREW1, input: { ...REPORT, actualServiceDate: "2099-01-01" } }))).toMatch(/future/);
    expect(mustFail(await submitJobReport({ engagementId: j.engagementId, actorUserId: CREW1, input: { ...REPORT, answers: { nonsense: "yes" } } }))).toMatch(/unrecognised question/);
    expect(await getServiceFamilyForEngagement(j.engagementId)).toBe("photography");
    expect(await listReportsForEngagement(j.engagementId)).toHaveLength(0);
  });
  it("B2 submitting records the reporter and time, and changes nothing else (engagement, request, payable, client record, emails)", async () => {
    const mailsBefore = h.sent.length;
    const before = {
      eng: (await db().from("engagements").select("status, payment_obligation_id, agreed_amount").eq("id", j.engagementId).single()).data,
      req: (await db().from("crew_support_requests").select("status").eq("id", j.requestId).single()).data,
      enq: (await db().from("enquiries").select("crm_stage, amount_due, amount_paid, payment_status").eq("id", j.enquiryId).single()).data,
      obligations: await count("payment_obligations", { source_reference: j.engagementId }),
      payments: await count("payments", { entity_id: j.enquiryId }),
    };
    const r = must(await submitJobReport({ engagementId: j.engagementId, actorUserId: CREW1, input: REPORT }), "report");
    expect(r).toMatchObject({ version: 1, isCorrection: false });
    const row = (await db().from("assignment_reports").select("*").eq("id", r.id).single()).data!;
    expect(row).toMatchObject({ reporter_id: CREW1, version: 1, engagement_id: j.engagementId, service_family: "photography", completion_status: "completed", actual_service_date: "2026-10-12", supersedes_id: null });
    expect(row.submitted_at).toBeTruthy();
    const after = {
      eng: (await db().from("engagements").select("status, payment_obligation_id, agreed_amount").eq("id", j.engagementId).single()).data,
      req: (await db().from("crew_support_requests").select("status").eq("id", j.requestId).single()).data,
      enq: (await db().from("enquiries").select("crm_stage, amount_due, amount_paid, payment_status").eq("id", j.enquiryId).single()).data,
      obligations: await count("payment_obligations", { source_reference: j.engagementId }),
      payments: await count("payments", { entity_id: j.enquiryId }),
    };
    expect(after).toEqual(before); // does NOT complete the engagement/project, mark anything paid or create a payable
    expect(h.sent.length).toBe(mailsBefore); // no client or crew email
    expect(await count("activity_log", { action: "assignment_report.submitted", entity_id: j.engagementId })).toBe(1);
  });
  it("B3 a second report must be a correction with a reason; the original is preserved and linked, never rewritten", async () => {
    expect(mustFail(await submitJobReport({ engagementId: j.engagementId, actorUserId: CREW1, input: { ...REPORT, remarks: "changed" } }))).toMatch(/what you are correcting/);
    const v1 = (await listReportsForEngagement(j.engagementId))[0];
    const v2 = must(await submitJobReport({ engagementId: j.engagementId, actorUserId: CREW1, input: { ...REPORT, actualEndTime: "22:30", correctionReason: "Finish time was 22:30, not 21:00" } }), "correction");
    expect(v2).toMatchObject({ version: 2, isCorrection: true });
    const all = await listReportsForEngagement(j.engagementId);
    expect(all.map((r) => r.version)).toEqual([2, 1]);
    expect(all[1]).toMatchObject({ id: v1.id, actualEndTime: "21:00", supersedesId: null }); // v1 untouched
    expect(all[0]).toMatchObject({ supersedesId: v1.id, correctionReason: "Finish time was 22:30, not 21:00", actualEndTime: "22:30" });
    expect(await count("activity_log", { action: "assignment_report.corrected", entity_id: j.engagementId })).toBe(1);
  });
  it("B4 reports are append-only even for server code, and the database refuses a malformed version", async () => {
    const admin = db();
    const upd = await admin.from("assignment_reports").update({ remarks: "tampered" }).eq("engagement_id", j.engagementId);
    expect(upd.error?.message ?? "").toMatch(/permission denied/i);
    const del = await admin.from("assignment_reports").delete().eq("engagement_id", j.engagementId);
    expect(del.error?.message ?? "").toMatch(/permission denied/i);
    const bad = await admin.from("assignment_reports").insert({ engagement_id: j.engagementId, reporter_id: CREW1, version: 3, actual_service_date: "2026-10-12", completion_status: "completed" });
    expect(bad.error?.message ?? "").toMatch(/correction_shape|check/i);
  });
  it("B5 reports are internal: the reporter and administrators can read them; another staff member and clients cannot (real RLS)", async () => {
    expect((await asUserDb(CREW1).from("assignment_reports").select("id").eq("engagement_id", j.engagementId)).data).toHaveLength(2);
    expect((await asUserDb(SUPER).from("assignment_reports").select("id").eq("engagement_id", j.engagementId)).data).toHaveLength(2);
    expect((await asUserDb(CREW2).from("assignment_reports").select("id").eq("engagement_id", j.engagementId)).data).toHaveLength(0);
    expect((await asUserDb(CLIENT).from("assignment_reports").select("id").eq("engagement_id", j.engagementId)).data).toHaveLength(0);
    expect(await listMyReports(j.engagementId, CREW2)).toHaveLength(0);
    expect(await listMyReports(j.engagementId, CREW1)).toHaveLength(2);
    // authenticated users can never write directly
    expect((await asUserDb(CREW1).from("assignment_reports").insert({ engagement_id: j.engagementId, reporter_id: CREW1, version: 3, supersedes_id: null, actual_service_date: "2026-10-12", completion_status: "completed" })).error).toBeTruthy();
  });
});

describe("C — controlled release: private → submitted → approved → released; one update, one email, no duplicates", () => {
  const j = {} as Awaited<ReturnType<typeof newJob>>;
  const f = { a: "", b: "", c: "" };
  it("C1 the professional submits files for review; they stay private and the client sees nothing", async () => {
    Object.assign(j, await newJob());
    f.a = (await upload(j.engagementId, "thank-you-1.jpg")).id;
    f.b = (await upload(j.engagementId, "thank-you-2.jpg")).id;
    f.c = (await upload(j.engagementId, "wedding-teaser.mp4", "video_preview")).id;
    expect(mustFail(await submitFileForRelease({ fileId: f.a, actorUserId: CREW1, category: "thank_you_image", title: "x", description: "" }))).toMatch(/title/i);
    expect(mustFail(await submitFileForRelease({ fileId: f.a, actorUserId: CREW2, category: "thank_you_image", title: "Thank-you image 1", description: "" }))).toMatch(/Only the assigned professional/);
    must(await submitFileForRelease({ fileId: f.a, actorUserId: CREW1, category: "thank_you_image", title: "Thank-you image 1", description: "Family portrait" }), "submit a");
    must(await submitFileForRelease({ fileId: f.b, actorUserId: CREW1, category: "thank_you_image", title: "Thank-you image 2", description: "" }), "submit b");
    expect(await fileRow(f.a)).toMatchObject({ release_status: "submitted", client_title: "Thank-you image 1", submitted_for_release_by: CREW1 });
    expect(mustFail(await submitFileForRelease({ fileId: f.a, actorUserId: CREW1, category: "thank_you_image", title: "Thank-you image 1", description: "" }))).toMatch(/can't be done/);
    expect(await deliverableCount(j.enquiryId)).toBe(0);
    expect((await asUserDb(CLIENT).from("deliverables").select("id").eq("entity_id", j.enquiryId)).data).toHaveLength(0);
  });
  it("C2 the professional cannot approve or release their own files; management must approve before release", async () => {
    const mailsBeforeC2 = h.sent.length;
    expect(mustFail(await reviewFileForRelease({ fileId: f.a, user: asCurrent(CREW1), action: "approve" }))).toMatch(/Only authorised management/);
    expect(mustFail(await releaseApprovedFiles({ fileIds: [f.a], user: asCurrent(CREW1), notifyClient: true }))).toMatch(/Only authorised management/);
    const r = must(await releaseApprovedFiles({ fileIds: [f.a], user: asCurrent(SUPER), notifyClient: true }), "release unapproved");
    expect(r.released).toBe(0);
    expect(r.failed[0]).toMatch(/can't be done/);
    expect(await deliverableCount(j.enquiryId)).toBe(0);
    expect(h.sent.length).toBe(mailsBeforeC2);
  });
  it("C3 requesting changes needs a note, sends the file back, and the professional can resubmit", async () => {
    expect(mustFail(await reviewFileForRelease({ fileId: f.b, user: asCurrent(SUPER), action: "request_changes", note: "" }))).toMatch(/Say what needs to change/);
    must(await reviewFileForRelease({ fileId: f.b, user: asCurrent(SUPER), action: "request_changes", note: "Please crop tighter" }), "changes");
    expect(await fileRow(f.b)).toMatchObject({ release_status: "changes_requested", release_review_note: "Please crop tighter", release_reviewed_by: SUPER });
    must(await submitFileForRelease({ fileId: f.b, actorUserId: CREW1, category: "thank_you_image", title: "Thank-you image 2", description: "" }), "resubmit");
    expect((await fileRow(f.b)).release_status).toBe("submitted");
    // a professional can pull a submitted file back to private; it can't be withdrawn once it is released
    must(await withdrawFileFromReview({ fileId: f.b, actorUserId: CREW1 }), "withdraw");
    expect((await fileRow(f.b)).release_status).toBe("private");
    must(await submitFileForRelease({ fileId: f.b, actorUserId: CREW1, category: "thank_you_image", title: "Thank-you image 2", description: "" }), "resubmit again");
  });
  it("C4 management approves two files; releasing them publishes ONE client update and sends ONE email (not one per file)", async () => {
    must(await reviewFileForRelease({ fileId: f.a, user: asCurrent(SUPER), action: "approve" }), "approve a");
    must(await reviewFileForRelease({ fileId: f.b, user: asCurrent(SUPER), action: "approve" }), "approve b");
    expect(mustFail(await reviewFileForRelease({ fileId: f.a, user: asCurrent(SUPER), action: "approve" }))).toMatch(/can't be done/);
    const before = h.sent.length;
    const out = must(await releaseApprovedFiles({ fileIds: [f.a, f.b], user: asCurrent(SUPER), notifyClient: true }), "release");
    expect(out).toMatchObject({ released: 2, alreadyReleased: 0, failed: [] });
    expect(out.client.notified).toBe(true);
    const ds = (await asUserDb(SUPER).from("deliverables").select("id, title, url, project_file_id, deliverable_categories(key)").eq("entity_id", j.enquiryId)).data!;
    expect(ds).toHaveLength(2);
    for (const d of ds) {
      expect(d.url).toBe(`/portal/client/files/${d.project_file_id}/download`);
      expect((d.deliverable_categories as unknown as { key: string }).key).toBe("thank-you-images");
    }
    expect(await fileRow(f.a)).toMatchObject({ release_status: "released", released_by: SUPER });
    expect((await fileRow(f.a)).deliverable_id).toBeTruthy();
    // one client-visible project update (enquiry_notes, audience client)
    const notes = (await asUserDb(SUPER).from("enquiry_notes").select("audience, note").eq("enquiry_id", j.enquiryId)).data!;
    expect(notes.filter((n) => n.audience === "client")).toHaveLength(1);
    expect(notes[0].note).toMatch(/2 files/);
    // one professional email with a secure portal link, no internal wording, no storage link
    const mails = h.sent.slice(before).filter((m) => m.to === j.email);
    expect(mails).toHaveLength(1);
    expect(mails[0].text).toMatch(/portal\/client\/projects\/enquiry\/.+\/deliverables/);
    expect(mails[0].text).not.toMatch(/supabase|signed|storage|margin|payable|compensation|crew/i);
  });
  it("C5 releasing again creates nothing new: no second deliverable, update or email", async () => {
    const before = h.sent.length;
    const again = must(await releaseApprovedFiles({ fileIds: [f.a, f.b], user: asCurrent(SUPER), notifyClient: true }), "again");
    expect(again.released).toBe(0);
    expect(again.alreadyReleased).toBe(2);
    expect(await deliverableCount(j.enquiryId)).toBe(2);
    expect((await db().from("activity_log").select("id").eq("action", "project_file.released").eq("entity_id", j.engagementId)).data).toHaveLength(2);
    expect(h.sent.length).toBe(before);
    // two simultaneous releases of a fresh approved file still publish exactly once
    must(await submitFileForRelease({ fileId: f.c, actorUserId: CREW1, category: "video_preview", title: "Highlights preview", description: "" }), "submit c");
    must(await reviewFileForRelease({ fileId: f.c, user: asCurrent(SUPER), action: "approve" }), "approve c");
    const [x, y] = await Promise.all([releaseApprovedFiles({ fileIds: [f.c], user: asCurrent(SUPER), notifyClient: false }), releaseApprovedFiles({ fileIds: [f.c], user: asCurrent(SUPER), notifyClient: false })]);
    expect(must(x).released + must(y).released).toBe(1);
    expect((await asUserDb(SUPER).from("deliverables").select("id").eq("project_file_id", f.c)).data).toHaveLength(1);
  });
  it("C6 releasing the files does not complete the project, advance the CRM stage, finish the engagement, create a payable or touch payments", async () => {
    const enq = (await db().from("enquiries").select("crm_stage, amount_paid").eq("id", j.enquiryId).single()).data!;
    expect(enq.crm_stage).not.toBe("delivered");
    expect(enq.crm_stage).not.toBe("completed");
    const eng = (await db().from("engagements").select("status, payment_obligation_id").eq("id", j.engagementId).single()).data!;
    expect(["draft", "engagement_active"]).toContain(eng.status);
    expect(eng.payment_obligation_id).toBeNull();
    expect(await count("payments", { entity_id: j.enquiryId })).toBe(0);
  });
  it("C7 a release with the email box unticked posts the update but sends no email; a QA/test record never emails", async () => {
    const k = await newJob();
    const a = (await upload(k.engagementId, "t1.jpg")).id;
    must(await submitFileForRelease({ fileId: a, actorUserId: CREW1, category: "thank_you_image", title: "Thank-you image A", description: "" }));
    must(await reviewFileForRelease({ fileId: a, user: asCurrent(SUPER), action: "approve" }));
    const before = h.sent.length;
    const r1 = must(await releaseApprovedFiles({ fileIds: [a], user: asCurrent(SUPER), notifyClient: false }));
    expect(r1.released).toBe(1);
    expect(h.sent.length).toBe(before);
    sql(`update public.enquiries set is_test = true where id = '${k.enquiryId}'`);
    const b = (await upload(k.engagementId, "t2.jpg")).id;
    must(await submitFileForRelease({ fileId: b, actorUserId: CREW1, category: "thank_you_image", title: "Thank-you image B", description: "" }));
    must(await reviewFileForRelease({ fileId: b, user: asCurrent(SUPER), action: "approve" }));
    const r2 = must(await releaseApprovedFiles({ fileIds: [b], user: asCurrent(SUPER), notifyClient: true }));
    expect(r2.client).toMatchObject({ notified: false });
    expect(r2.client.reason).toMatch(/test/i);
    expect(h.sent.length).toBe(before);
  });
});

describe("D — the client's authorised download route", () => {
  const j = {} as Awaited<ReturnType<typeof newJob>>;
  let released = "";
  let unreleased = "";
  const get = async (fileId: string, query = "") => clientDownload(new NextRequest(`http://localhost/portal/client/files/${fileId}/download${query}`), { params: Promise.resolve({ fileId }) });
  it("D0 setup: one released file and one private file", async () => {
    Object.assign(j, await newJob());
    released = (await upload(j.engagementId, "bright-thank-you.jpg")).id;
    unreleased = (await upload(j.engagementId, "not-yet.jpg")).id;
    must(await submitFileForRelease({ fileId: released, actorUserId: CREW1, category: "thank_you_image", title: "Thank-you image", description: "" }));
    must(await reviewFileForRelease({ fileId: released, user: asCurrent(SUPER), action: "approve" }));
    must(await releaseApprovedFiles({ fileIds: [released], user: asCurrent(SUPER), notifyClient: false }));
  });
  it("D1 the project's own client is sent to a short-lived signed link for the released file (inline by default, as a named download on request), and the access is audited", async () => {
    as(CLIENT);
    const res = await get(released);
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toMatch(/^https:\/\/signed\.example\//);
    expect(res.headers.get("cache-control")).toMatch(/no-store/);
    const dl = await get(released, "?download=1");
    expect(dl.status).toBe(302);
    expect(h.signed.at(-1)?.download).toBe("bright-thank-you.jpg");
    expect(await count("activity_log", { action: "project_file.client_accessed", entity_id: j.enquiryId })).toBe(2);
  });
  it("D2 another client, an unreleased file, a malformed id and a signed-out visitor all get nothing", async () => {
    as(CLIENT2);
    expect((await get(released)).status).toBe(404);
    as(CLIENT);
    expect((await get(unreleased)).status).toBe(404);
    expect((await get("not-a-uuid")).status).toBe(404);
    as(null);
    const out = await get(released);
    expect(out.status).toBe(307);
    expect(out.headers.get("location")).toMatch(/\/portal\/login/);
  });
  it("D3 a released file that has since been purged is no longer served", async () => {
    sql(`update public.project_files set purged_at = now() where id = '${released}'`);
    as(CLIENT);
    expect((await get(released)).status).toBe(404);
    sql(`update public.project_files set purged_at = null where id = '${released}'`);
  });
  it("D4 the existing Payables media listing still works and now carries the release fields", async () => {
    const files = await listProjectFilesForEngagement(j.engagementId);
    expect(files.find((x) => x.id === released)).toMatchObject({ releaseStatus: "released", releaseCategory: "thank_you_image", clientTitle: "Thank-you image" });
    expect(files.find((x) => x.id === unreleased)).toMatchObject({ releaseStatus: "private" });
  });
});

describe("E — the release columns can only be changed by server code", () => {
  it("E1 a staff member's own session cannot approve, release or alter a file's release state directly, and a contractor cannot insert a file that claims to be released", async () => {
    const j = await newJob();
    const id = (await upload(j.engagementId, "direct-1.jpg")).id;
    const staff = asUserDb(CREW2); // an ordinary staff member: the "staff manage" policy would otherwise allow this
    for (const patch of [{ release_status: "approved" }, { release_status: "released" }, { client_title: "sneaky" }, { released_at: new Date().toISOString() }]) {
      const r = await staff.from("project_files").update(patch).eq("id", id).select("id");
      expect(r.error?.message ?? "no error").toMatch(/release_columns_server_only/);
    }
    expect(await fileRow(id)).toMatchObject({ release_status: "private", client_title: null });
    const ins = await asUserDb(CREW1).from("project_files").insert({ engagement_id: j.engagementId, file_kind: "deliverable", storage_bucket: "project-media", storage_path: `${j.engagementId}/sneaky.jpg`, original_filename: "sneaky.jpg", version: 1, uploaded_by: CREW1, release_status: "released" });
    expect(ins.error?.message ?? "no error").toMatch(/release_columns_server_only|row-level security/);
    // ordinary edits to the same row by staff still work (retain flag), and server code is unaffected
    expect((await staff.from("project_files").update({ retain: true }).eq("id", id).select("id")).error).toBeNull();
    must(await submitFileForRelease({ fileId: id, actorUserId: CREW1, category: "thank_you_image", title: "Direct one", description: "" }));
  });
});
