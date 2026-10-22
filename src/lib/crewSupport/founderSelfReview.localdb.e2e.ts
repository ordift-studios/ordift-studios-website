// @vitest-environment node
//
// END-TO-END against REAL PostgreSQL (rehearsal container) through REAL PostgREST: the actual Founder self-review code, the
// actual migration 0167, real per-user JWTs (so RLS and the server-only guards genuinely apply) and a service-role key.
// Synthetic users, a synthetic job and synthetic image rows only; storage and outbound email are stubbed. It cannot reach
// Staging or Production: the URL must be localhost.
import { beforeAll, describe, expect, it, vi } from "vitest";
import { execSync } from "node:child_process";
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const DIR = process.env.E2E_FSR_DIR ?? "";
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
import { notifyClientOfReleasedFiles, reviewFilesForRelease, submitPrivateFilesForRelease } from "./fileReleaseFlow";
import { closeFounderException, declareAndApplyReview, declareAndRelease, getFounderContext, issueViewerUrl, openFounderException } from "./founderSelfReview";
import type { CurrentUser } from "@/lib/portal/roles";

if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:|\/|$)/.test(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "")) throw new Error("Refusing to run: this E2E may only target a localhost database.");

const FOUNDER = "00000000-0000-4000-8000-0000000000f1";
const SECOND = "00000000-0000-4000-8000-0000000000f2"; // the Founder's second login
const MGR = "00000000-0000-4000-8000-0000000000a1"; // a genuinely independent administrator
const ADDITIONAL = "00000000-0000-4000-8000-0000000000f3"; // the Founder's additional (admin-only) login
const SEPARATE = "00000000-0000-4000-8000-0000000000c1"; // a separate person (CT0001-like) with an admin login, never registered
const ROLES: Record<string, string[]> = { [FOUNDER]: ["admin", "super_admin"], [SECOND]: ["admin", "super_admin"], [MGR]: ["admin", "super_admin"], [ADDITIONAL]: ["admin"], [SEPARATE]: ["admin"] };
const GOOD = "I am the sole performing photographer on this job and no independent reviewer is appointed.";

const db = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false }, global: { fetch: h.fetch } });
const sql = (q: string, role = "postgres") => execSync(`docker exec -i ${CONTAINER} psql -U ${role} -d ${DBNAME} -h 127.0.0.1 -v ON_ERROR_STOP=1 -At`, { input: q }).toString();
const jwt = (sub: string) => {
  const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const head = b64({ alg: "HS256", typ: "JWT" });
  const body = b64({ role: "authenticated", sub, aud: "authenticated", exp: Math.floor(Date.now() / 1000) + 3600 });
  return `${head}.${body}.${createHmac("sha256", readFileSync(`${DIR}/jwt_secret`, "utf8").trim()).update(`${head}.${body}`).digest("base64url")}`;
};
const asUserDb = (id: string) => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, jwt(id), { auth: { persistSession: false }, global: { fetch: h.fetch } });
const as = (id: string | null) => { h.user = id ? { id } : null; };
const cur = (id: string): CurrentUser => ({ id, email: `${id}@e2e.invalid`, fullName: id, roles: ROLES[id] ?? [], accessStatus: "active" }) as unknown as CurrentUser;
const must = <T extends { ok: boolean }>(r: T, label = ""): Extract<T, { ok: true }> => { if (!r.ok) throw new Error(`${label} expected ok, got ${JSON.stringify(r)}`); return r as Extract<T, { ok: true }>; };
const fileRow = async (id: string) => (await db().from("project_files").select("*").eq("id", id).single()).data as Record<string, unknown>;
const deliverableCount = async (enquiryId: string) => (await asUserDb(MGR).from("deliverables").select("id").eq("entity_id", enquiryId)).data?.length ?? -1;

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
      ('${MGR}','00000000-0000-0000-0000-000000000000','authenticated','authenticated','mgr@e2e.invalid','{}',now(),now()),
      ('${ADDITIONAL}','00000000-0000-0000-0000-000000000000','authenticated','authenticated','additional@e2e.invalid','{}',now(),now()),
      ('${SEPARATE}','00000000-0000-0000-0000-000000000000','authenticated','authenticated','separate@e2e.invalid','{}',now(),now()) on conflict do nothing;
    insert into public.profiles (id, full_name, access_status) values ('${FOUNDER}','Synthetic Founder','active'),('${SECOND}','Synthetic Second Login','active'),('${MGR}','Synthetic Independent Admin','active'),('${ADDITIONAL}','Synthetic Additional Login','active'),('${SEPARATE}','Synthetic Separate Person','active')
      on conflict (id) do update set access_status = 'active';
    insert into public.user_roles (user_id, role_id) select u, r.id from unnest(array['${FOUNDER}','${SECOND}','${MGR}']::uuid[]) u cross join public.roles r where r.slug in ('admin','super_admin') union all select x, r.id from unnest(array['${ADDITIONAL}','${SEPARATE}']::uuid[]) x cross join public.roles r where r.slug = 'admin' on conflict do nothing;
    -- file review/release needs Super Admin OR an executive_admin grant: give the two admin-only synthetic logins that authority so the
    -- common-control rule (not the authority check) is what is being tested for them
    insert into public.authority_grants (profile_id, authority, granted_by, reason) select x, 'executive_admin', '${MGR}', 'SYNTHETIC e2e grant' from unnest(array['${ADDITIONAL}','${SEPARATE}']::uuid[]) x;
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

describe("1 — before designation the exception does not exist for anyone; normal rules hold", () => {
  it("1a nobody is offered it (tables exist, no Founder identity)", async () => {
    for (const id of [FOUNDER, SECOND, MGR]) expect((await getFounderContext({ id }, job.engagementId)).state).toBe("not_applicable");
  });
  it("1b the performer cannot approve their own images; an independent administrator can approve one (control image f5)", async () => {
    const own = must(await reviewFilesForRelease({ fileIds: [ids.f1], user: cur(FOUNDER), action: "approve" }));
    expect(own.outcomes[0].ok).toBe(false);
    expect(own.outcomes[0].error).toMatch(/can't review or release your own work/);
    expect((await fileRow(ids.f1)).release_status).toBe("submitted");
    const indep = must(await reviewFilesForRelease({ fileIds: [ids.f5], user: cur(MGR), action: "approve" }));
    expect(indep.outcomes[0].ok).toBe(true);
    expect(await fileRow(ids.f5)).toMatchObject({ release_status: "approved", release_reviewed_by: MGR });
  });
  it("1c the database itself refuses the performer even when the application is bypassed (service key, direct write)", async () => {
    const { error } = await db().from("project_files").update({ release_status: "approved", release_reviewed_by: FOUNDER, release_reviewed_at: new Date().toISOString() }).eq("id", ids.f1);
    expect(error?.message ?? "").toMatch(/release_separation|requires a valid self-review declaration/);
    expect((await fileRow(ids.f1)).release_status).toBe("submitted");
  });
});

describe("2 — designation (operator steps, synthetic) and the second login", () => {
  it("2a the operator designates the Founder identity, registers the second login, then authorizes the holder", () => {
    sql(`
      insert into public.founder_identities (profile_id, designation_reference) values ('${FOUNDER}', 'SYNTHETIC e2e rehearsal designation of the Founder identity');
      insert into public.founder_common_control_accounts (founder_identity_id, profile_id, note) select id, '${SECOND}', 'SYNTHETIC second login of the Founder' from public.founder_identities;
      insert into public.self_review_exception_holders (founder_identity_id, authorization_reference) select id, 'SYNTHETIC e2e rehearsal authorization of ORDIFT-POL-FSR-001' from public.founder_identities;
    `);
  });
  it("2b the Founder is offered the exception; the second login and the independent administrator are not", async () => {
    expect((await getFounderContext({ id: FOUNDER }, job.engagementId)).state).toBe("available");
    expect((await getFounderContext({ id: SECOND }, job.engagementId)).state).toBe("linked_login");
    expect((await getFounderContext({ id: MGR }, job.engagementId)).state).toBe("not_applicable");
  });
  it("2c the second login is NOT an independent reviewer — the application and the database both refuse it", async () => {
    const viaApp = must(await reviewFilesForRelease({ fileIds: [ids.f1], user: cur(SECOND), action: "approve" }));
    expect(viaApp.outcomes[0].error).toMatch(/common control/);
    const { error } = await db().from("project_files").update({ release_status: "approved", release_reviewed_by: SECOND, release_reviewed_at: new Date().toISOString() }).eq("id", ids.f1);
    expect(error?.message ?? "").toMatch(/common control/);
    expect((await fileRow(ids.f1)).release_status).toBe("submitted");
  });
  it("2d it cannot open the exception in its own name, and another administrator cannot either", async () => {
    for (const id of [SECOND, MGR]) expect((await openFounderException({ user: cur(id), engagementId: job.engagementId, justification: GOOD, acknowledged: true })).ok).toBe(false);
  });
});

describe("3 — opening the exception: justification, acknowledgement, seven days", () => {
  it("3a short justification and a missing acknowledgement are refused; nothing is written", async () => {
    expect((await openFounderException({ user: cur(FOUNDER), engagementId: job.engagementId, justification: "because", acknowledged: true })).ok).toBe(false);
    expect((await openFounderException({ user: cur(FOUNDER), engagementId: job.engagementId, justification: GOOD, acknowledged: false })).ok).toBe(false);
    expect(Number(sql("select count(*) from public.self_review_exceptions"))).toBe(0);
  });
  it("3b the Founder opens it; the database fixes the window at exactly seven days", async () => {
    must(await openFounderException({ user: cur(FOUNDER), engagementId: job.engagementId, justification: GOOD, acknowledged: true }));
    expect(sql("select (expires_at - opened_at)::text from public.self_review_exceptions").trim()).toBe("7 days");
    const ctx = await getFounderContext({ id: FOUNDER }, job.engagementId);
    expect(ctx.state).toBe("open");
  });
  it("3c a second open exception on the same engagement is refused", async () => {
    expect((await openFounderException({ user: cur(FOUNDER), engagementId: job.engagementId, justification: GOOD, acknowledged: true })).ok).toBe(false);
  });
});

describe("4 — viewing evidence and a fixed review selection", () => {
  let exceptionId = "";
  it("4a decisions are refused until each image has been opened in the viewer", async () => {
    const ctx = await getFounderContext({ id: FOUNDER }, job.engagementId);
    if (ctx.state !== "open") throw new Error("exception not open");
    exceptionId = ctx.exception.id;
    const r = await declareAndApplyReview({ user: cur(FOUNDER), exceptionId, decisions: { [ids.f1]: "approve" }, note: "", reviewConfirmed: true, typedCount: 1 });
    expect(r.ok).toBe(false);
    expect(Number(sql("select count(*) from public.self_review_declarations"))).toBe(0);
  });
  it("4b opening f1 and f2 in the viewer records server-side evidence (version, size, path taken from the file)", async () => {
    as(FOUNDER);
    for (const id of [ids.f1, ids.f2, ids.f3]) expect((await issueViewerUrl({ user: cur(FOUNDER), exceptionId, fileId: id })).ok).toBe(true);
    expect(Number(sql("select count(*) from public.self_review_file_views"))).toBe(3);
    expect(sql(`select (file_version = 1 and file_storage_path like '%/%' and file_size_bytes = 1234)::text from public.self_review_file_views limit 1`).trim()).toBe("true");
    expect((await issueViewerUrl({ user: cur(SECOND), exceptionId, fileId: ids.f1 })).ok).toBe(false);
    expect((await issueViewerUrl({ user: cur(MGR), exceptionId, fileId: ids.f1 })).ok).toBe(false);
  });
  it("4c a wrong typed count, a missing confirmation and an unopened image (f4) are each refused with nothing changed", async () => {
    for (const bad of [{ typedCount: 5, reviewConfirmed: true, ds: [ids.f1] }, { typedCount: 1, reviewConfirmed: false, ds: [ids.f1] }, { typedCount: 1, reviewConfirmed: true, ds: [ids.f4] }]) {
      const r = await declareAndApplyReview({ user: cur(FOUNDER), exceptionId, decisions: Object.fromEntries(bad.ds.map((d) => [d, "approve" as const])), note: "", reviewConfirmed: bad.reviewConfirmed, typedCount: bad.typedCount });
      expect(r.ok).toBe(false);
    }
    expect(Number(sql("select count(*) from public.self_review_declarations"))).toBe(0);
    expect((await fileRow(ids.f4)).release_status).toBe("submitted");
  });
  it("4d approve f1+f2 under one declaration; return f3 for rework under another — each with its own audit and truthful outcome", async () => {
    const approved = must(await declareAndApplyReview({ user: cur(FOUNDER), exceptionId, decisions: { [ids.f1]: "approve", [ids.f2]: "approve" }, note: "", reviewConfirmed: true, typedCount: 2 }));
    expect(approved.declaration.status).toBe("completed");
    const rework = must(await declareAndApplyReview({ user: cur(FOUNDER), exceptionId, decisions: { [ids.f3]: "request_changes" }, note: "Soften the retouching on the left side.", reviewConfirmed: true, typedCount: 1 }));
    expect(rework.declaration.status).toBe("completed");
    expect(await fileRow(ids.f1)).toMatchObject({ release_status: "approved", release_reviewed_by: FOUNDER });
    expect(await fileRow(ids.f3)).toMatchObject({ release_status: "changes_requested", release_review_note: "Soften the retouching on the left side." });
    expect((await fileRow(ids.f1)).release_review_declaration_id).not.toBeNull();
    expect(sql("select string_agg(status || ':' || files, ',' order by created_at) from public.self_review_declaration_status").trim()).toBe("completed:2,completed:1");
    expect((await fileRow(ids.f4)).release_status).toBe("submitted"); // untouched
  });
  it("4e approving released nothing and emailed nobody", async () => {
    expect(await deliverableCount(job.enquiryId)).toBe(0);
    expect(h.sent.length).toBe(0);
    expect((await fileRow(ids.f1)).released_at).toBeNull();
  });
  it("4f a new image uploaded afterwards cannot inherit the earlier approval", async () => {
    const late = await upload(job.engagementId, "img-late.jpg", "final_gallery");
    must(await submitPrivateFilesForRelease({ engagementId: job.engagementId, actorUserId: FOUNDER }));
    const r = await declareAndApplyReview({ user: cur(FOUNDER), exceptionId, decisions: { [late]: "approve" }, note: "", reviewConfirmed: true, typedCount: 1 });
    expect(r.ok).toBe(false);
    expect((await fileRow(late)).release_status).toBe("submitted");
  });
});

describe("5 — release is a separate, confirmed set; failures are recorded truthfully; email is separate", () => {
  let exceptionId = "";
  it("5a releasing an unapproved image is refused before any declaration exists", async () => {
    const ctx = await getFounderContext({ id: FOUNDER }, job.engagementId);
    if (ctx.state !== "open") throw new Error("not open");
    exceptionId = ctx.exception.id;
    const before = Number(sql("select count(*) from public.self_review_declarations"));
    const r = await declareAndRelease({ user: cur(FOUNDER), exceptionId, fileIds: [ids.f4], releaseSetConfirmed: true, typedCount: 1 });
    expect(r.ok).toBe(false);
    expect(Number(sql("select count(*) from public.self_review_declarations"))).toBe(before);
  });
  it("5b release f1+f2 under its OWN declaration: files released, deliverables exist, NO email, outcomes applied", async () => {
    as(FOUNDER);
    const r = must(await declareAndRelease({ user: cur(FOUNDER), exceptionId, fileIds: [ids.f1, ids.f2], releaseSetConfirmed: true, typedCount: 2 }));
    expect(r.declaration.status).toBe("completed");
    expect(await fileRow(ids.f1)).toMatchObject({ release_status: "released", released_by: FOUNDER });
    expect((await fileRow(ids.f1)).deliverable_id).not.toBeNull();
    expect((await fileRow(ids.f1)).release_declaration_id).not.toBe((await fileRow(ids.f1)).release_review_declaration_id);
    expect(await deliverableCount(job.enquiryId)).toBe(2);
    expect(h.sent.length).toBe(0);
  });
  it("5c the review declaration cannot be reused to release (the database refuses a direct attempt)", async () => {
    const reviewDecl = (await fileRow(ids.f5)).release_review_declaration_id; // f5 was approved by the independent administrator: no declaration
    expect(reviewDecl).toBeNull();
    const { error } = await db().from("project_files").update({ release_status: "released", released_by: FOUNDER, released_at: new Date().toISOString(), release_declaration_id: (await fileRow(ids.f1)).release_review_declaration_id as string }).eq("id", ids.f2);
    expect(error).not.toBeNull();
  });
  it("5d a release that cannot complete for one image is reported PARTIAL and the failed image is recorded failed (not left pending)", async () => {
    // approve f3's replacement and f4 first, then break one image's client category so its release must fail
    must(await submitPrivateFilesForRelease({ engagementId: job.engagementId, actorUserId: FOUNDER }));
    as(FOUNDER);
    for (const id of [ids.f4]) must(await issueViewerUrl({ user: cur(FOUNDER), exceptionId, fileId: id }));
    must(await declareAndApplyReview({ user: cur(FOUNDER), exceptionId, decisions: { [ids.f4]: "approve" }, note: "", reviewConfirmed: true, typedCount: 1 }));
    // f3 (sneak_peek) was returned for rework; resubmit and approve it too
    const f3 = await fileRow(ids.f3);
    expect(f3.release_status).toBe("changes_requested");
    // an image whose client category is missing: temporarily remove the category f4 does NOT use? use sneak-peeks for a freshly approved image
    const extra = await upload(job.engagementId, "img-extra.jpg", "sneak_peek");
    must(await submitPrivateFilesForRelease({ engagementId: job.engagementId, actorUserId: FOUNDER }));
    must(await issueViewerUrl({ user: cur(FOUNDER), exceptionId, fileId: extra }));
    must(await declareAndApplyReview({ user: cur(FOUNDER), exceptionId, decisions: { [extra]: "approve" }, note: "", reviewConfirmed: true, typedCount: 1 }));
    sql("update public.deliverable_categories set key = 'sneak-peeks-OFF' where key = 'sneak-peeks'");
    const r = must(await declareAndRelease({ user: cur(FOUNDER), exceptionId, fileIds: [ids.f4, extra], releaseSetConfirmed: true, typedCount: 2 }));
    sql("update public.deliverable_categories set key = 'sneak-peeks' where key = 'sneak-peeks-OFF'");
    expect(r.declaration.status).toBe("partial");
    expect(r.outcomes.map((o) => o.ok)).toEqual([true, false]);
    expect(sql(`select outcome from public.self_review_declaration_files where file_id = '${extra}' and decision = 'release'`).trim()).toBe("failed");
    expect((await fileRow(extra)).release_status).toBe("approved"); // never half-released
    expect((await fileRow(ids.f4)).release_status).toBe("released");
  });
  it("5e the client email is a separate, opt-in step and is sent once only", async () => {
    expect(h.sent.length).toBe(0);
    const first = await notifyClientOfReleasedFiles({ fileIds: [ids.f1, ids.f2], user: cur(FOUNDER) });
    expect(first.ok).toBe(true);
    expect(h.sent.length).toBe(1);
    const again = await notifyClientOfReleasedFiles({ fileIds: [ids.f1, ids.f2], user: cur(FOUNDER) });
    expect(again.ok).toBe(false);
    expect(h.sent.length).toBe(1);
  });
});

describe("6 — closing the exception, direct API attempts, and the Bright-style records stay intact", () => {
  it("6a direct API writes by the Founder's own signed-in session are refused (evidence tables, release columns, server functions)", async () => {
    const me = asUserDb(FOUNDER);
    const exc = await me.from("self_review_exceptions").insert({ engagement_id: job.engagementId, founder_profile_id: FOUNDER, justification: GOOD, conflict_acknowledgement: "x".repeat(60), conflict_acknowledged_at: new Date().toISOString(), expires_at: new Date().toISOString(), holder_id: FOUNDER });
    expect(exc.error).not.toBeNull();
    const upd = await me.from("project_files").update({ release_status: "approved" }).eq("id", ids.f4);
    expect(upd.error?.message ?? "").toMatch(/server_only|permission denied|row-level/);
    const rpc = await me.rpc("fsr_apply_review", { p_declaration: FOUNDER, p_file: ids.f4 });
    expect(rpc.error).not.toBeNull();
  });
  it("6b closing needs a reason and only the Founder can do it; afterwards nothing new can be declared, evidence stays", async () => {
    const ctx = await getFounderContext({ id: FOUNDER }, job.engagementId);
    if (ctx.state !== "open") throw new Error("not open");
    expect((await closeFounderException({ user: cur(MGR), exceptionId: ctx.exception.id, reason: "closing it now" })).ok).toBe(false);
    expect((await closeFounderException({ user: cur(FOUNDER), exceptionId: ctx.exception.id, reason: "x" })).ok).toBe(false);
    must(await closeFounderException({ user: cur(FOUNDER), exceptionId: ctx.exception.id, reason: "Finished with this job" }));
    expect((await getFounderContext({ id: FOUNDER }, job.engagementId)).state).toBe("available");
    const evidence = Number(sql("select (select count(*) from public.self_review_declarations) + (select count(*) from public.self_review_file_views) + (select count(*) from public.self_review_events)"));
    expect(evidence).toBeGreaterThan(15);
  });
  it("6c the audit log recorded the exception lifecycle in order", () => {
    const events = sql("select string_agg(event, ',' order by id) from public.self_review_events").trim().split(",");
    expect(events[0]).toMatch(/founder_identities_insert/);
    expect(events).toContain("exception_opened");
    expect(events).toContain("declaration_review");
    expect(events).toContain("declaration_release");
    expect(events).toContain("exception_closed");
    expect(events.indexOf("exception_opened")).toBeLessThan(events.indexOf("declaration_review"));
    expect(events.indexOf("declaration_review")).toBeLessThan(events.indexOf("declaration_release"));
  });
});

describe("7 — three accounts and re-designation, end to end (corrected migration + corrected application)", () => {
  let lateA = "";
  let lateB = "";
  const op = (q: string) => sql(q);
  it("7a the operator registers the additional login; BOTH Founder-controlled logins are refused, the separate person is independent", async () => {
    op(`insert into public.founder_common_control_accounts (founder_identity_id, profile_id, note) select id, '${ADDITIONAL}', 'SYNTHETIC additional login of the Founder (e2e)' from public.founder_identities where status = 'active'`);
    lateA = await upload(job.engagementId, "img-late-a.jpg", "final_gallery");
    lateB = await upload(job.engagementId, "img-late-b.jpg", "final_gallery");
    as(FOUNDER);
    must(await submitPrivateFilesForRelease({ engagementId: job.engagementId, actorUserId: FOUNDER }));
    for (const login of [SECOND, ADDITIONAL]) {
      as(login);
      const r = must(await reviewFilesForRelease({ fileIds: [lateA], user: cur(login), action: "approve" }));
      expect(r.outcomes[0].error).toMatch(/common control/);
      // the database agrees even when the application is bypassed
      const direct = await db().from("project_files").update({ release_status: "approved", release_reviewed_by: login, release_reviewed_at: new Date().toISOString() }).eq("id", lateA);
      expect(direct.error?.message ?? "").toMatch(/common control/);
    }
    as(SEPARATE);
    const ok = must(await reviewFilesForRelease({ fileIds: [lateB], user: cur(SEPARATE), action: "approve" }));
    expect(ok.outcomes[0].ok).toBe(true);
    expect(await fileRow(lateB)).toMatchObject({ release_status: "approved", release_reviewed_by: SEPARATE });
    expect(await fileRow(lateA)).toMatchObject({ release_status: "submitted" });
  });
  it("7b revoking and RE-DESIGNATING the Founder identity does not release either registered login (application and database)", async () => {
    op(`update public.founder_identities set status = 'revoked', revoked_at = now(), revoked_reason = 'SYNTHETIC revocation before re-designation (e2e)' where status = 'active'`);
    op(`insert into public.founder_identities (profile_id, designation_reference) values ('${FOUNDER}', 'SYNTHETIC second designation of the Founder identity (e2e)')`);
    for (const login of [SECOND, ADDITIONAL]) {
      as(login);
      const r = must(await reviewFilesForRelease({ fileIds: [lateA], user: cur(login), action: "approve" }));
      expect(r.outcomes[0].error).toMatch(/common control/);
      const direct = await db().from("project_files").update({ release_status: "approved", release_reviewed_by: login, release_reviewed_at: new Date().toISOString() }).eq("id", lateA);
      expect(direct.error?.message ?? "").toMatch(/common control/);
    }
    expect((await fileRow(lateA)).release_status).toBe("submitted");
    as(SEPARATE);
    expect(must(await reviewFilesForRelease({ fileIds: [lateA], user: cur(SEPARATE), action: "request_changes", note: "Please soften the crop on this one." })).outcomes[0].ok).toBe(true);
  });
  it("7c re-designation alone does NOT activate the exception: a holder is a separate act", async () => {
    expect(Number(op("select count(*) from public.self_review_exception_holders where revoked_at is null and founder_identity_id = (select id from public.founder_identities where status = 'active')").trim())).toBe(0);
    const ctx = await getFounderContext({ id: FOUNDER }, job.engagementId);
    expect(ctx.state).toBe("unavailable");
    expect((await openFounderException({ user: cur(FOUNDER), engagementId: job.engagementId, justification: GOOD, acknowledged: true })).ok).toBe(false);
    for (const login of [SECOND, ADDITIONAL]) expect((await getFounderContext({ id: login }, job.engagementId)).state).toBe("linked_login");
    expect((await getFounderContext({ id: SEPARATE }, job.engagementId)).state).toBe("not_applicable");
    op(`insert into public.self_review_exception_holders (founder_identity_id, authorization_reference) select id, 'SYNTHETIC authorization of ORDIFT-POL-FSR-001 for the new identity (e2e)' from public.founder_identities where status = 'active'`);
    expect((await getFounderContext({ id: FOUNDER }, job.engagementId)).state).toBe("available");
  });
  it("7d the performer still cannot approve their own image without an open exception, and nothing was emailed", async () => {
    const lateD = await upload(job.engagementId, "img-late-d.jpg", "final_gallery");
    as(FOUNDER);
    must(await submitPrivateFilesForRelease({ engagementId: job.engagementId, actorUserId: FOUNDER }));
    const own = must(await reviewFilesForRelease({ fileIds: [lateD], user: cur(FOUNDER), action: "approve" }));
    expect(own.outcomes[0].ok).toBe(false);
    expect(own.outcomes[0].error).toMatch(/can't review or release your own work/);
    expect(h.sent.length).toBeLessThanOrEqual(1); // only the one deliberate notification sent in block 5e
  });
  it("7e revoking ONE registration frees only that login", async () => {
    const lateC = await upload(job.engagementId, "img-late-c.jpg", "final_gallery");
    as(FOUNDER);
    must(await submitPrivateFilesForRelease({ engagementId: job.engagementId, actorUserId: FOUNDER }));
    op(`update public.founder_common_control_accounts set revoked_at = now(), revoked_reason = 'SYNTHETIC revocation of one registration (e2e)' where profile_id = '${ADDITIONAL}' and revoked_at is null`);
    as(SECOND);
    const stillBlocked = must(await reviewFilesForRelease({ fileIds: [lateC], user: cur(SECOND), action: "approve" }));
    expect(stillBlocked.outcomes[0].error).toMatch(/common control/);
    as(ADDITIONAL);
    const freed = must(await reviewFilesForRelease({ fileIds: [lateC], user: cur(ADDITIONAL), action: "approve" }));
    expect(freed.outcomes[0].ok).toBe(true);
    expect(await fileRow(lateC)).toMatchObject({ release_status: "approved", release_reviewed_by: ADDITIONAL });
  });
  it("7f designation tables were written only by the operator steps: audit events exist and no role changed", () => {
    expect(Number(op("select count(*) from public.self_review_events where event = 'founder_identities_insert'").trim())).toBe(2);
    expect(Number(op("select count(*) from public.self_review_events where event = 'founder_common_control_accounts_insert'").trim())).toBe(2);
    expect(op(`select string_agg(r.slug, ',' order by r.slug) from public.user_roles ur join public.roles r on r.id = ur.role_id where ur.user_id = '${ADDITIONAL}'`).trim()).toBe("admin");
    expect(op(`select string_agg(r.slug, ',' order by r.slug) from public.user_roles ur join public.roles r on r.id = ur.role_id where ur.user_id = '${SEPARATE}'`).trim()).toBe("admin");
  });
});

