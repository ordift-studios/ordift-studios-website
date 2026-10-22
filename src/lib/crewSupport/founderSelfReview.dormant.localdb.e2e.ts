// @vitest-environment node
//
// DORMANT-MODE end-to-end against REAL PostgreSQL WITHOUT the Founder migration, through REAL PostgREST: the actual corrected
// application code with NONE of the exception tables or fsr_* functions present (exactly Production today), real per-user JWTs (so RLS and the server-only guards genuinely apply) and a service-role key.
// Synthetic users, a synthetic job and synthetic image rows only; storage and outbound email are stubbed. It cannot reach
// Staging or Production: the URL must be localhost.
import { beforeAll, describe, expect, it, vi } from "vitest";
import { execSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";

const CONTAINER = process.env.E2E_FSR_CONTAINER ?? "ordift-fsr-rehearsal";
const DBNAME = process.env.E2E_FSR_DB ?? "t_e2e";

const h = vi.hoisted(() => ({
  sent: [] as { to: string; subject: string }[],
  agent: null as unknown,
  user: null as null | { id: string },
  fetch: async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const undici = await import("undici");
    (h as { agent: unknown }).agent ??= new undici.Agent({ keepAliveTimeout: 1, keepAliveMaxTimeout: 1 });
    return (await undici.fetch(String(input).replace("/rest/v1", ""), { ...(init as object), dispatcher: (h as { agent: unknown }).agent as import("undici").Dispatcher })) as unknown as Response;
  },
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/notifications/dispatch", () => ({
  dispatchNotification: vi.fn(async (a: { email: { to: string; subject: string } }) => {
    h.sent.push({ to: a.email.to, subject: a.email.subject });
    return { email: { ok: true, mode: "logged", attempts: 1 } };
  }),
}));
vi.mock("@/lib/supabase/server", async () => {
  const { createClient: make } = await import("@supabase/supabase-js");
  const { createHmac: hmac } = await import("node:crypto");
  const { readFileSync: read } = await import("node:fs");
  const token = (sub: string) => {
    const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
    const head = b64({ alg: "HS256", typ: "JWT" });
    const body = b64({ role: "authenticated", sub, aud: "authenticated", exp: Math.floor(Date.now() / 1000) + 3600 });
    return `${head}.${body}.${hmac("sha256", read(`${process.env.E2E_FSR_DIR}/jwt_secret`, "utf8").trim()).update(`${head}.${body}`).digest("base64url")}`;
  };
  // the "session" client: a REAL per-user JWT, so row-level security applies to deliverables / enquiry notes
  return { createClient: async () => make(process.env.NEXT_PUBLIC_SUPABASE_URL!, h.user ? token(h.user.id) : read(`${process.env.E2E_FSR_DIR}/anon_jwt`, "utf8").trim(), { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: h.fetch } }) };
});
vi.mock("@/lib/supabase/admin", async () => {
  const { createClient: make } = await import("@supabase/supabase-js");
  return {
    createAdminClient: () => {
      const c = make(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: h.fetch } });
      (c.auth as unknown as { admin: unknown }).admin = { getUserById: async (id: string) => ({ data: { user: { email: `${id}@e2e.invalid` } }, error: null }) };
      Object.defineProperty(c, "storage", {
        value: { from: () => ({ createSignedUploadUrl: async (path: string) => ({ data: { signedUrl: `https://upload.invalid/${path}`, token: "t", path }, error: null }), createSignedUrl: async (path: string) => ({ data: { signedUrl: `https://signed.invalid/${path}` }, error: null }) }) },
      });
      return c;
    },
  };
});

import { requestProjectFileUploadAuthorization, recordUploadedProjectFile } from "@/lib/payables/projectFiles";
import { setCrewSupportStatus } from "./admin";
import { respondToCrewOffer, sendCrewOffer } from "./crewOffers";
import { releaseApprovedFiles, reviewFilesForRelease, submitPrivateFilesForRelease } from "./fileReleaseFlow";
import { closeFounderException, declareAndApplyReview, declareAndRelease, getFounderContext, issueViewerUrl, listSelfReviewFileState, openFounderException } from "./founderSelfReview";
import type { CurrentUser } from "@/lib/portal/roles";

if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:|\/|$)/.test(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "")) throw new Error("Refusing to run: this E2E may only target a localhost database.");

const FOUNDER = "00000000-0000-4000-8000-0000000000f1";
const SECOND = "00000000-0000-4000-8000-0000000000f2"; // the Founder's second login
const MGR = "00000000-0000-4000-8000-0000000000a1"; // a genuinely independent administrator
const ROLES: Record<string, string[]> = { [FOUNDER]: ["admin", "super_admin"], [SECOND]: ["admin", "super_admin"], [MGR]: ["admin", "super_admin"] };
const GOOD = "I am the sole performing photographer on this job and no independent reviewer is appointed.";

const db = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false }, global: { fetch: h.fetch } });
const sql = (q: string, role = "postgres") => execSync(`docker exec -i ${CONTAINER} psql -U ${role} -d ${DBNAME} -h 127.0.0.1 -v ON_ERROR_STOP=1 -At`, { input: q }).toString();
const as = (id: string | null) => { h.user = id ? { id } : null; };
const cur = (id: string): CurrentUser => ({ id, email: `${id}@e2e.invalid`, fullName: id, roles: ROLES[id] ?? [], accessStatus: "active" }) as unknown as CurrentUser;
const must = <T extends { ok: boolean }>(r: T, label = ""): Extract<T, { ok: true }> => { if (!r.ok) throw new Error(`${label} expected ok, got ${JSON.stringify(r)}`); return r as Extract<T, { ok: true }>; };
const fileRow = async (id: string) => (await db().from("project_files").select("*").eq("id", id).single()).data as Record<string, unknown>;

let job: { requestId: string; enquiryId: string; slotId: string; engagementId: string };
const ids: Record<string, string> = {};
let titleId = "";

async function upload(engagementId: string, name: string, category: string) {
  as(FOUNDER);
  const auth = must(await requestProjectFileUploadAuthorization({ engagementId, fileKind: "deliverable", originalFilename: name, actorUserId: FOUNDER, releaseCategory: category }), "authorize");
  return must(await recordUploadedProjectFile({ engagementId, fileKind: "deliverable", storagePath: auth.path, originalFilename: name, mimeType: "image/jpeg", sizeBytes: 1234, actorUserId: FOUNDER, releaseCategory: category }), "record").id;
}

beforeAll(async () => {
  sql(`
    insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at) values
      ('${FOUNDER}','00000000-0000-0000-0000-000000000000','authenticated','authenticated','founder@e2e.invalid','{}',now(),now()),
      ('${SECOND}','00000000-0000-0000-0000-000000000000','authenticated','authenticated','second@e2e.invalid','{}',now(),now()),
      ('${MGR}','00000000-0000-0000-0000-000000000000','authenticated','authenticated','mgr@e2e.invalid','{}',now(),now()) on conflict do nothing;
    insert into public.profiles (id, full_name, access_status) values ('${FOUNDER}','Synthetic Founder','active'),('${SECOND}','Synthetic Second Login','active'),('${MGR}','Synthetic Independent Admin','active')
      on conflict (id) do update set access_status = 'active';
    insert into public.user_roles (user_id, role_id) select u, r.id from unnest(array['${FOUNDER}','${SECOND}','${MGR}']::uuid[]) u cross join public.roles r where r.slug in ('admin','super_admin') on conflict do nothing;
    insert into public.person_capabilities (profile_id, operational_title_id, proficiency, verification_status, source)
      select p, (select id from public.operational_titles where slug = 'photographer'), 'primary', 'verified', 'admin' from unnest(array['${FOUNDER}']::uuid[]) p on conflict do nothing;
    revoke all on public.deliverables, public.deliverable_categories, public.enquiry_notes from service_role; -- reproduce Production's grant gap
  `);
  titleId = sql("select id from public.operational_titles where slug = 'photographer'").trim();
  as(MGR);
  const ref = `CSR-2026-X${Date.now().toString().slice(-8)}`;
  const { data, error } = await db().rpc("create_crew_support_request", {
    p_request: { user_id: MGR, reference_number: ref, requester_type: "photographer", requester_name: "Synthetic Client", requester_email: "client@e2e.invalid", requester_phone: "+000", service_family: "photography", project_name: "Synthetic wedding", project_type: "Wedding", start_date: "2026-10-12", end_date: "2026-10-12", call_time: "10:00", finish_time: "21:00", location: "Nowhere", on_site_contact: "N/A", urgency: "standard", service_details: { equipment: "requester_supplies" }, consent_accepted_at: new Date().toISOString(), submitted_at: new Date().toISOString() },
    p_requirements: [{ operational_title_id: titleId, role_label: "Photographer", quantity: 1, responsibilities: "Coverage" }],
  });
  if (error) throw new Error(error.message);
  const r = data as { request_id: string; enquiry_id: string };
  const slotId = (await db().from("crew_support_slots").select("id").eq("request_id", r.request_id).single()).data!.id as string;
  must(await setCrewSupportStatus({ requestId: r.request_id, to: "under_review", actorUserId: MGR }), "under_review");
  must(await setCrewSupportStatus({ requestId: r.request_id, to: "availability_review", actorUserId: MGR }), "availability_review");
  must(await sendCrewOffer({ slotId, assigneeProfileId: FOUNDER, amount: 1000, currency: "QAR", message: "", overrideReason: null, actorUserId: MGR }), "offer");
  must(await respondToCrewOffer({ slotId, userId: FOUNDER, response: "accept", note: "" }), "accept");
  const eng = (await db().from("engagements").select("id").eq("entity_id", slotId).single()).data!;
  job = { requestId: r.request_id, enquiryId: r.enquiry_id, slotId, engagementId: eng.id as string };
  ids.f1 = await upload(job.engagementId, "img-1.jpg", "final_gallery");
  ids.f2 = await upload(job.engagementId, "img-2.jpg", "final_gallery");
  ids.f3 = await upload(job.engagementId, "img-3.jpg", "sneak_peek");
  ids.f4 = await upload(job.engagementId, "img-4.jpg", "final_gallery");
  ids.f5 = await upload(job.engagementId, "img-5.jpg", "thank_you_image");
  must(await submitPrivateFilesForRelease({ engagementId: job.engagementId, actorUserId: FOUNDER }), "submit all");
  // the offer / acceptance notices from the SETUP above are not what is under test: count only emails sent from here on
  h.sent.length = 0;
});

const releasedCount = (r: Awaited<ReturnType<typeof releaseApprovedFiles>>) => (r.ok ? r.released : 0);

describe("DORMANT — the migration is absent (as in Production today): ordinary behaviour is unchanged and nothing crashes", () => {
  it("D0 the exception objects really are absent in this database", () => {
    expect(sql("select (to_regclass('public.founder_identities') is null and to_regclass('public.self_review_declarations') is null and to_regclass('public.founder_common_control_accounts') is null)::text").trim()).toBe("true");
    expect(sql("select count(*) from pg_proc where proname like 'fsr\\_%'").trim()).toBe("0");
  });
  it("D1 the real PostgREST answer for a missing table is the shape the application tolerates", async () => {
    const r = await db().from("founder_identities").select("id").limit(1);
    expect(r.error?.code === "PGRST205" || r.error?.code === "42P01").toBe(true);
  });
  it("D2 nobody is offered the exception, and no page-level loader throws", async () => {
    for (const id of [FOUNDER, SECOND, MGR]) expect((await getFounderContext({ id }, job.engagementId)).state).toBe("not_applicable");
    await expect(listSelfReviewFileState(job.engagementId)).resolves.toBeDefined();
  });
  it("D3 every exception action refuses cleanly (ok:false) instead of throwing, and changes nothing", async () => {
    const bogus = "00000000-0000-4000-8000-0000000000ee";
    const results = await Promise.all([
      openFounderException({ user: cur(FOUNDER), engagementId: job.engagementId, justification: GOOD, acknowledged: true }),
      closeFounderException({ user: cur(FOUNDER), exceptionId: bogus, reason: "Finished with this job" }),
      issueViewerUrl({ user: cur(FOUNDER), exceptionId: bogus, fileId: ids.f1 }),
      declareAndApplyReview({ user: cur(FOUNDER), exceptionId: bogus, decisions: { [ids.f1]: "approve" }, note: "", reviewConfirmed: true, typedCount: 1 }),
      declareAndRelease({ user: cur(FOUNDER), exceptionId: bogus, fileIds: [ids.f1], releaseSetConfirmed: true, typedCount: 1 }),
    ]);
    for (const r of results) expect(r.ok).toBe(false);
    expect((await fileRow(ids.f1)).release_status).toBe("submitted");
  });
  it("D4 normal separation of duties holds: the performer cannot approve their own image, in the app or directly in the database", async () => {
    const own = must(await reviewFilesForRelease({ fileIds: [ids.f1], user: cur(FOUNDER), action: "approve" }));
    expect(own.outcomes[0].ok).toBe(false);
    expect(own.outcomes[0].error).toMatch(/can't review or release your own work/);
    const { error } = await db().from("project_files").update({ release_status: "approved", release_reviewed_by: FOUNDER, release_reviewed_at: new Date().toISOString() }).eq("id", ids.f1);
    expect(error?.message ?? "").toMatch(/project_files_release_separation/);
    expect((await fileRow(ids.f1)).release_status).toBe("submitted");
  });
  it("D5 a genuinely independent administrator can still approve, and then release, exactly as before", async () => {
    const ok = must(await reviewFilesForRelease({ fileIds: [ids.f5], user: cur(MGR), action: "approve" }));
    expect(ok.outcomes[0].ok).toBe(true);
    const rel = must(await releaseApprovedFiles({ fileIds: [ids.f5], user: cur(MGR), notifyClient: false }));
    expect(rel.released).toBe(1);
    expect(await fileRow(ids.f5)).toMatchObject({ release_status: "released", released_by: MGR });
    expect(h.sent.length).toBe(0); // approving/releasing never emails by itself
  });
  it("D6 nothing is released prematurely: an unapproved image cannot be released, and the performer cannot release their own approved image", async () => {
    const notApproved = await releaseApprovedFiles({ fileIds: [ids.f2], user: cur(MGR), notifyClient: false });
    expect(releasedCount(notApproved)).toBe(0);
    expect((await fileRow(ids.f2)).release_status).toBe("submitted");
    must(await reviewFilesForRelease({ fileIds: [ids.f3], user: cur(MGR), action: "approve" }));
    const own = await releaseApprovedFiles({ fileIds: [ids.f3], user: cur(FOUNDER), notifyClient: false });
    expect(releasedCount(own)).toBe(0);
    expect((await fileRow(ids.f3)).release_status).toBe("approved");
    expect((await fileRow(ids.f3)).released_at).toBeNull();
  });
});
