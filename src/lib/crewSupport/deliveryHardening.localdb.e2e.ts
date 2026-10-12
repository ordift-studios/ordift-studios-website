// @vitest-environment node
//
// Delivery-workflow hardening: removing a wrong private upload, the client's correction / delivery-issue requests
// through the existing requests system, and that none of it touches released deliverables. Same harness as
// assignmentWork.localdb.e2e.ts (real per-user JWT so row-level security applies; localhost-only database; outbound
// email captured, never sent). Runs the REAL code against a throwaway local Postgres
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
  removed: [] as string[],
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
        value: { from: () => ({ remove: async (paths: string[]) => { h.removed.push(...paths); return { data: [], error: null }; }, createSignedUploadUrl: async (path: string) => ({ data: { signedUrl: `https://upload.example/${path}`, token: "t", path }, error: null }), createSignedUrl: async (path: string, _s: number, opts?: { download?: string }) => { h.signed.push({ path, download: opts?.download }); return { data: { signedUrl: `https://signed.example/${path}` }, error: null }; } }) },
      });
      return c;
    },
  };
});

import { NextRequest } from "next/server";
import { GET as clientDownload } from "@/app/portal/(dashboard)/client/files/[fileId]/download/route";
import { requestProjectFileUploadAuthorization, recordUploadedProjectFile } from "@/lib/payables/projectFiles";
import { setCrewSupportStatus } from "./admin";
import { respondToCrewOffer, sendCrewOffer } from "./crewOffers";
import { releaseApprovedFiles as releaseFiles, reviewFileForRelease, submitFileForRelease, withdrawFileFromReview } from "./fileReleaseFlow";
import type { CurrentUser } from "@/lib/portal/roles";

if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:|\/|$)/.test(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "")) {
  throw new Error("Refusing to run: this E2E may only target a localhost database.");
}

const SUPER = "00000000-0000-4000-8000-0000000000c1"; // Founder-like: admin + super_admin
const CREW1 = "00000000-0000-4000-8000-0000000000c2"; // staff member assigned to the job ("unclassified" for external-workforce modules)
const CREW2 = "00000000-0000-4000-8000-0000000000c3"; // another staff member, not on the job
const SUPER2 = "00000000-0000-4000-8000-0000000000c6"; // a genuinely independent administrator
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
const ROLES: Record<string, string[]> = { [SUPER]: ["admin", "super_admin"], [SUPER2]: ["admin", "super_admin"], [CREW1]: ["staff"], [CREW2]: ["staff"], [CLIENT]: ["client"], [CLIENT2]: ["client"] };
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
    insert into auth.users (id, email) values ('${SUPER}','founder@e2e.test'),('${SUPER2}','independent@e2e.test'),('${CREW1}','crew1@e2e.test'),('${CREW2}','crew2@e2e.test'),('${CLIENT}','client@e2e.test'),('${CLIENT2}','client2@e2e.test') on conflict do nothing;
    insert into public.profiles (id, full_name, access_status) values ('${SUPER}','Founder','active'),('${SUPER2}','Independent Admin','active'),('${CREW1}','Crew One','active'),('${CREW2}','Crew Two','active'),('${CLIENT}','Client One','active'),('${CLIENT2}','Client Two','active')
      on conflict (id) do update set full_name = excluded.full_name, access_status = 'active';
    insert into public.user_roles (user_id, role_id) select u, r.id from unnest(array['${SUPER}','${SUPER2}']::uuid[]) u cross join public.roles r where r.slug in ('admin','super_admin') on conflict do nothing;
    insert into public.user_roles (user_id, role_id) select u, (select id from public.roles where slug = 'staff') from unnest(array['${CREW1}','${CREW2}']::uuid[]) u on conflict do nothing;
    insert into public.person_capabilities (profile_id, operational_title_id, proficiency, verification_status, source)
      select p, (select id from public.operational_titles where slug = 'photographer'), 'primary', 'verified', 'admin' from unnest(array['${CREW1}','${CREW2}','${SUPER}']::uuid[]) p on conflict do nothing;
    -- Reproduce Production: service_role has no access to these tables.
    revoke all on public.deliverables, public.deliverable_categories, public.enquiry_notes from service_role;
  `);
  h.emails.set(SUPER, "founder@e2e.test");
  h.emails.set(CREW1, "crew1@e2e.test");
  h.emails.set(CREW2, "crew2@e2e.test");
  titleId = sql("select id from public.operational_titles where slug = 'photographer'").trim();
});


import { decideProjectRequestAction } from "@/app/admin/project-requests/actions";
import { submitProjectRequestAction } from "@/app/portal/(dashboard)/client/projects/[kind]/[id]/requests/actions";
import { removeOwnPrivateFile } from "./fileReleaseFlow";

describe("R — a professional can remove their own private upload, and nothing else", () => {
  const j = {} as Awaited<ReturnType<typeof newJob>>;
  const f = { keep: "", wrong: "", submitted: "", sentBack: "", released: "", staff: "" };
  it("R1 a wrong upload is removed: record kept (purged + withdrawn), stored copy deleted, audited, other files untouched, no email", async () => {
    Object.assign(j, await newJob());
    f.keep = (await upload(j.engagementId, "keep-me.jpg")).id;
    f.wrong = (await upload(j.engagementId, "wrong-shoot.jpg")).id;
    const path = (await fileRow(f.wrong)).storage_path as string;
    const mails = h.sent.length;
    must(await removeOwnPrivateFile({ fileId: f.wrong, actorUserId: CREW1 }), "remove");
    expect(await fileRow(f.wrong)).toMatchObject({ release_status: "withdrawn", lifecycle_state: "purged", purge_reason: "removed by the uploader before submission" });
    expect((await fileRow(f.wrong)).purged_at).toBeTruthy();
    expect(h.removed).toContain(path);
    expect(await count("activity_log", { action: "project_file.removed_before_release", entity_id: j.engagementId })).toBe(1);
    expect(await fileRow(f.keep)).toMatchObject({ release_status: "private", lifecycle_state: "active", purged_at: null });
    expect(h.sent.length).toBe(mails);
    expect(await deliverableCount(j.enquiryId)).toBe(0);
  });
  it("R2 a removed file cannot be removed again, submitted, or revived; submit-all ignores it", async () => {
    expect(mustFail(await removeOwnPrivateFile({ fileId: f.wrong, actorUserId: CREW1 }))).toMatch(/not found/i);
    expect(mustFail(await submitFileForRelease({ fileId: f.wrong, actorUserId: CREW1, category: "thank_you_image", title: "Wrong shoot", description: "" }))).toMatch(/not found/i);
    const privateTagged = (await db().from("project_files").select("id").eq("engagement_id", j.engagementId).eq("release_status", "private").not("release_category", "is", null)).data!.map((r) => r.id);
    expect(privateTagged).toEqual([f.keep]);
  });
  it("R3 only the assigned professional, only for a file they uploaded themselves", async () => {
    expect(mustFail(await removeOwnPrivateFile({ fileId: f.keep, actorUserId: CREW2 }))).toMatch(/Only the assigned professional/);
    expect(mustFail(await removeOwnPrivateFile({ fileId: f.keep, actorUserId: SUPER }))).toMatch(/Only the assigned professional/);
    // a file management itself uploaded to this assignment belongs to management, not the professional
    as(SUPER);
    const auth = must(await requestProjectFileUploadAuthorization({ engagementId: j.engagementId, fileKind: "deliverable", originalFilename: "staff-upload.jpg", actorUserId: SUPER, releaseCategory: "thank_you_image" }));
    f.staff = must(await recordUploadedProjectFile({ engagementId: j.engagementId, fileKind: "deliverable", storagePath: auth.path, originalFilename: "staff-upload.jpg", mimeType: "image/jpeg", sizeBytes: 10, actorUserId: SUPER, releaseCategory: "thank_you_image" })).id;
    expect(mustFail(await removeOwnPrivateFile({ fileId: f.staff, actorUserId: CREW1 }))).toMatch(/only remove files you uploaded/);
    expect((await fileRow(f.staff)).purged_at).toBeNull();
  });
  it("R4 once submitted, approved or released a file cannot be removed; sent back or pulled back to private it can", async () => {
    f.submitted = (await upload(j.engagementId, "to-review.jpg")).id;
    must(await submitFileForRelease({ fileId: f.submitted, actorUserId: CREW1, category: "thank_you_image", title: "To review", description: "" }));
    expect(mustFail(await removeOwnPrivateFile({ fileId: f.submitted, actorUserId: CREW1 }))).toMatch(/submitted for review or released/);
    must(await reviewFileForRelease({ fileId: f.submitted, user: asCurrent(SUPER2), action: "approve" }));
    expect(mustFail(await removeOwnPrivateFile({ fileId: f.submitted, actorUserId: CREW1 }))).toMatch(/submitted for review or released/);
    must(await releaseApprovedFiles({ fileIds: [f.submitted], user: asCurrent(SUPER2), notifyClient: false }));
    expect(mustFail(await removeOwnPrivateFile({ fileId: f.submitted, actorUserId: CREW1 }))).toMatch(/submitted for review or released/);
    expect((await fileRow(f.submitted)).release_status).toBe("released");
    // sent back for changes: removable
    f.sentBack = (await upload(j.engagementId, "needs-work.jpg")).id;
    must(await submitFileForRelease({ fileId: f.sentBack, actorUserId: CREW1, category: "thank_you_image", title: "Needs work", description: "" }));
    must(await reviewFileForRelease({ fileId: f.sentBack, user: asCurrent(SUPER2), action: "request_changes", note: "Please re-edit" }));
    must(await removeOwnPrivateFile({ fileId: f.sentBack, actorUserId: CREW1 }), "remove sent-back");
    expect((await fileRow(f.sentBack)).release_status).toBe("withdrawn");
    // pulled back to private: removable
    const pulled = (await upload(j.engagementId, "pulled-back.jpg")).id;
    must(await submitFileForRelease({ fileId: pulled, actorUserId: CREW1, category: "thank_you_image", title: "Pulled back", description: "" }));
    must(await withdrawFileFromReview({ fileId: pulled, actorUserId: CREW1 }));
    must(await removeOwnPrivateFile({ fileId: pulled, actorUserId: CREW1 }), "remove pulled-back");
  });
  it("R5 removal never touches the released deliverable, the engagement, any payable or payment", async () => {
    expect(await deliverableCount(j.enquiryId)).toBe(1);
    const e = (await db().from("engagements").select("status, payment_obligation_id").eq("id", j.engagementId).single()).data!;
    expect(e.payment_obligation_id).toBeNull();
    expect(await fileRow(f.submitted)).toMatchObject({ release_status: "released", purged_at: null });
  });
});

describe("Q — the client's correction / delivery-issue requests: separate records, full history, the delivery itself is never altered", () => {
  const j = {} as Awaited<ReturnType<typeof newJob>>;
  let fileId = "";
  let deliverableBefore = "";
  const typeId = async (key: string) => (await db().from("request_types").select("id").eq("key", key).single()).data!.id as string;
  const form = (o: Record<string, string>) => { const f = new FormData(); for (const [k, v] of Object.entries(o)) f.set(k, v); return f; };
  const requestsFor = async () => (await db().from("project_requests").select("*").eq("entity_id", j.enquiryId).order("created_at")).data!;
  it("Q1 the two request types exist exactly once, alongside the originals", async () => {
    const keys = (await db().from("request_types").select("key")).data!.map((r) => r.key as string).sort();
    expect(keys).toEqual(["cancellation", "correction", "delivery_issue", "reschedule"]);
  });
  it("Q2 setup: a released photograph the client can see", async () => {
    Object.assign(j, await newJob());
    fileId = (await upload(j.engagementId, "bright-portrait.jpg")).id;
    must(await submitFileForRelease({ fileId, actorUserId: CREW1, category: "thank_you_image", title: "Portrait", description: "" }));
    must(await reviewFileForRelease({ fileId, user: asCurrent(SUPER2), action: "approve" }));
    must(await releaseApprovedFiles({ fileIds: [fileId], user: asCurrent(SUPER2), notifyClient: false }));
    deliverableBefore = JSON.stringify((await asUserDb(SUPER).from("deliverables").select("*").eq("entity_id", j.enquiryId)).data);
    expect(deliverableBefore).toContain("Portrait");
  });
  it("Q3 the project's client can raise a correction request and a delivery issue; each is a new record", async () => {
    as(CLIENT);
    await submitProjectRequestAction(form({ kind: "enquiry", id: j.enquiryId, requestTypeId: await typeId("correction"), clientNotes: "About “Portrait”: please brighten the faces." }));
    await submitProjectRequestAction(form({ kind: "enquiry", id: j.enquiryId, requestTypeId: await typeId("delivery_issue"), clientNotes: "The download did not open on my phone." }));
    const rows = await requestsFor();
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.status === "pending" && r.staff_decision === null && r.created_by === CLIENT)).toBe(true);
  });
  it("Q4 another client can neither see nor raise a request on this project", async () => {
    expect((await asUserDb(CLIENT2).from("project_requests").select("id").eq("entity_id", j.enquiryId)).data).toHaveLength(0);
    as(CLIENT2);
    await submitProjectRequestAction(form({ kind: "enquiry", id: j.enquiryId, requestTypeId: await typeId("correction"), clientNotes: "not mine" }));
    expect(await requestsFor()).toHaveLength(2);
  });
  it("Q5 management responds; the decision is recorded once with who and when, the client sees the response, the request is kept", async () => {
    as(SUPER2);
    const target = (await requestsFor()).find((r) => String(r.client_notes).includes("brighten"))!;
    const res = await decideProjectRequestAction({} as never, form({ id: target.id as string, entityType: "enquiry", entityId: j.enquiryId, status: "approved", staffResponse: "We will re-edit and re-release a corrected version." }));
    expect((res as { ok?: boolean }).ok).not.toBe(false);
    const after = (await requestsFor()).find((r) => r.id === target.id)!;
    expect(after).toMatchObject({ status: "approved", staff_decision: "approved", decided_by: SUPER2, staff_response: "We will re-edit and re-release a corrected version." });
    expect((await asUserDb(CLIENT).from("project_requests").select("staff_response").eq("id", target.id as string).single()).data!.staff_response).toMatch(/re-edit/);
    expect(await requestsFor()).toHaveLength(2);
  });
  it("Q6 through all of this the released deliverable and its file are untouched and still downloadable by the client", async () => {
    expect(JSON.stringify((await asUserDb(SUPER).from("deliverables").select("*").eq("entity_id", j.enquiryId)).data)).toBe(deliverableBefore);
    expect(await fileRow(fileId)).toMatchObject({ release_status: "released", purged_at: null });
    as(CLIENT);
    const res = await clientDownload(new NextRequest(`http://localhost/portal/client/files/${fileId}/download`), { params: Promise.resolve({ fileId }) });
    expect(res.status).toBe(302);
  });
});
