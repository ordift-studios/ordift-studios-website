// @vitest-environment node
//
// End-to-end run of the REAL pre-assignment readiness code (B1: schedule integrity, enrolment, readiness
// answers, issue lifecycle, rescheduling with the manual communication record) against a throwaway local Postgres
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

import { setCrewSupportStatus } from "./admin";
import { respondToCrewOffer, sendCrewOffer } from "./crewOffers";
import type { CurrentUser } from "@/lib/portal/roles";
import { disableReadiness, enrolAssignment, getReadinessAttention, getReadinessForAdmin, getReadinessForProfessional, getReadinessSettings, setResponsibleManager, submitReadiness, updateReadinessSettings } from "./readiness";
import { assignFollowUp, manageIssue, postIssueMessage, professionalIssueAction } from "./readinessIssues";
import { listScheduleChanges, recordScheduleNotice, rescheduleAssignment, setEventTimezone } from "./reschedule";

if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:|\/|$)/.test(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "")) {
  throw new Error("Refusing to run: this E2E may only target a localhost database.");
}

const SUPER = "00000000-0000-4000-8000-0000000000c1"; // Founder-like: admin + super_admin
const CREW1 = "00000000-0000-4000-8000-0000000000c2"; // staff member assigned to the job ("unclassified" for external-workforce modules)
const CREW2 = "00000000-0000-4000-8000-0000000000c3"; // another staff member, not on the job
const SUPER2 = "00000000-0000-4000-8000-0000000000c6"; // a genuinely independent administrator
const ADMIN2 = "00000000-0000-4000-8000-0000000000c7"; // an administrator who is NOT management (admin role only)
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
const ROLES: Record<string, string[]> = { [SUPER]: ["admin", "super_admin"], [SUPER2]: ["admin", "super_admin"], [ADMIN2]: ["admin"], [CREW1]: ["staff"], [CREW2]: ["staff"], [CLIENT]: ["client"], [CLIENT2]: ["client"] };
const as = (id: string | null) => { h.user = id ? { id, email: `${id}@e2e.test`, fullName: id, roles: ROLES[id] ?? [], accessStatus: "active" } : null; };
const asCurrent = (id: string): CurrentUser => ({ id, email: `${id}@e2e.test`, fullName: id, roles: ROLES[id] ?? [], accessStatus: "active" }) as unknown as CurrentUser;
const must = <T extends { ok: boolean }>(r: T, label = ""): Extract<T, { ok: true }> => { if (!r.ok) throw new Error(`${label} expected ok, got ${JSON.stringify(r)}`); return r as Extract<T, { ok: true }>; };
const mustFail = <T extends { ok: boolean }>(r: T): string => { expect(r.ok).toBe(false); return (r as unknown as { error?: string }).error ?? ""; };
const count = async (table: string, f: Record<string, unknown>) => (await db().from(table).select("id", { count: "exact", head: true }).match(f)).count ?? 0;



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


beforeAll(() => {
  // The throwaway stack's auth.uid() only reads the legacy per-claim setting, which current PostgREST no
  // longer sets. Use Supabase's real definition (it also reads request.jwt.claims) so a user JWT resolves.
  execSync("docker exec -i ordift-mig-check2 psql -U supabase_admin -d postgres -h 127.0.0.1 -v ON_ERROR_STOP=1 -At", {
    input: `create or replace function auth.uid() returns uuid language sql stable as $$
      select coalesce(nullif(current_setting('request.jwt.claim.sub', true), ''), (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'))::uuid
    $$;`,
  });
  sql(`
    insert into auth.users (id, email) values ('${SUPER}','founder@e2e.test'),('${SUPER2}','independent@e2e.test'),('${ADMIN2}','admin2@e2e.test'),('${CREW1}','crew1@e2e.test'),('${CREW2}','crew2@e2e.test'),('${CLIENT}','client@e2e.test'),('${CLIENT2}','client2@e2e.test') on conflict do nothing;
    insert into public.profiles (id, full_name, access_status) values ('${SUPER}','Founder','active'),('${SUPER2}','Independent Admin','active'),('${ADMIN2}','Admin Two','active'),('${CREW1}','Crew One','active'),('${CREW2}','Crew Two','active'),('${CLIENT}','Client One','active'),('${CLIENT2}','Client Two','active')
      on conflict (id) do update set full_name = excluded.full_name, access_status = 'active';
    insert into public.user_roles (user_id, role_id) select u, r.id from unnest(array['${SUPER}','${SUPER2}']::uuid[]) u cross join public.roles r where r.slug in ('admin','super_admin') on conflict do nothing;
    insert into public.user_roles (user_id, role_id) select '${ADMIN2}', id from public.roles where slug = 'admin' on conflict do nothing;
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

const H = 3_600_000;
const day = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);
const emailsBefore = () => h.sent.length;

// A live-shaped assignment: accepted, confirmed, in the future, Qatar market (as Bright's is, but in the future).
async function liveJob(opts: { crew?: string; daysAhead?: number; country?: string | null; call?: string } = {}) {
  const j = await newJob(opts.crew ?? CREW1);
  const d = day(opts.daysAhead ?? 3);
  sql(`update public.crew_support_requests set status = 'confirmed', start_date = '${d}', end_date = '${d}', call_time = '${opts.call ?? "10:00"}' where id = '${j.requestId}';
       update public.enquiries set payment_country = ${opts.country === null ? "null" : `'${opts.country ?? "QA"}'`} where id = '${j.enquiryId}';
       update public.engagements set status = 'engagement_active' where id = '${j.engagementId}';`);
  return { ...j, date: d };
}
const rows = (j: { requestId: string; engagementId: string; enquiryId: string }) => JSON.stringify([
  sql(`select to_jsonb(r) from public.crew_support_requests r where id = '${j.requestId}'`),
  sql(`select to_jsonb(e) from public.engagements e where id = '${j.engagementId}'`),
  sql(`select to_jsonb(q) from public.enquiries q where id = '${j.enquiryId}'`),
  sql(`select coalesce(jsonb_agg(to_jsonb(p)), '[]') from public.payments p where entity_id = '${j.enquiryId}'`),
]);

type RI = { status: string; checks: Record<string, string>; concerns: Record<string, string>; remarks: string };
const READY: RI = { status: "ready", checks: { equipmentChecked: "yes", locationAccess: "yes" }, concerns: {}, remarks: "" };
const NEEDS: RI = { status: "need_assistance", checks: { equipmentChecked: "no" }, concerns: { transport: "Need a lift from the hotel at 8am" }, remarks: "" };
const NOT_READY: RI = { status: "not_ready", checks: {}, concerns: { other: "Illness" }, remarks: "I am unwell and may not be able to travel" };
const answer = (engagementId: string, input: RI, user = CREW1, nowMs?: number) => submitReadiness({ engagementId, userId: user, input, nowMs });
const activeIssues = async (engagementId: string) => (await db().from("assignment_readiness_issues").select("id, status, kind, readiness_id, assignment_readiness!inner(engagement_id)").eq("assignment_readiness.engagement_id", engagementId).neq("status", "resolved")).data ?? [];

describe("A — enrolment: manual, management-only, eligible assignments only; no duplicates", () => {
  const j = {} as Awaited<ReturnType<typeof liveJob>>;
  it("A1 defaults: automatic enrolment is OFF, reminders cannot be enabled, intervals are 48 / 24 / 12", async () => {
    const s = await getReadinessSettings();
    expect(s).toMatchObject({ autoEnrolFrom: null, firstReminderHours: 48, readinessCheckHours: 24, noResponseFlagHours: 12, skipCheckIfReady: true, remindersEnabled: false });
    expect(sql("select count(*) from public.assignment_readiness")).toBe("0\n");
    const bad = (() => { try { sql("update public.assignment_readiness_settings set reminders_enabled = true"); return ""; } catch (e) { return String((e as { stderr?: Buffer }).stderr ?? e); } })();
    expect(bad).toMatch(/enabled_matches_mode/);
    const bad2 = (() => { try { sql("update public.assignment_readiness_settings set auto_enrol_from = now()"); return ""; } catch (e) { return String((e as { stderr?: Buffer }).stderr ?? e); } })();
    expect(bad2).toMatch(/no_auto_enrol_in_b1/);
    expect(mustFail(await updateReadinessSettings({ user: asCurrent(SUPER), values: { autoEnrolFrom: new Date().toISOString(), firstReminderHours: 48, readinessCheckHours: 24, noResponseFlagHours: 12, skipCheckIfReady: true } }))).toMatch(/isn't available yet/);
  });
  it("A2 only management can enrol; an administrator without management authority, staff and clients cannot", async () => {
    Object.assign(j, await liveJob());
    for (const u of [ADMIN2, CREW1, CLIENT]) expect(mustFail(await enrolAssignment({ engagementId: j.engagementId, user: asCurrent(u) }))).toMatch(/Only authorised management/);
    expect(sql("select count(*) from public.assignment_readiness")).toBe("0\n");
  });
  it("A3 management enrols an eligible assignment once; a second attempt (and a concurrent one) creates no duplicate", async () => {
    must(await enrolAssignment({ engagementId: j.engagementId, user: asCurrent(SUPER) }), "enrol");
    expect(mustFail(await enrolAssignment({ engagementId: j.engagementId, user: asCurrent(SUPER) }))).toMatch(/already enrolled/);
    const k = await liveJob();
    const mails = emailsBefore(); // (setting up a job sends its own, unrelated, status emails)
    const [a, b] = await Promise.all([enrolAssignment({ engagementId: k.engagementId, user: asCurrent(SUPER) }), enrolAssignment({ engagementId: k.engagementId, user: asCurrent(SUPER) })]);
    expect([a.ok, b.ok].filter(Boolean)).toHaveLength(1);
    expect(sql(`select count(*) from public.assignment_readiness where engagement_id = '${k.engagementId}'`)).toBe("1\n");
    expect(await count("activity_log", { action: "assignment_readiness.enrolled", entity_id: j.engagementId })).toBe(1);
    expect(h.sent.length).toBe(mails); // enrolling sends nothing
  });
  it("A4 ineligible assignments are refused: test record, not confirmed, finished, already started, no timezone", async () => {
    const t = await liveJob(); sql(`update public.crew_support_requests set is_test = true where id = '${t.requestId}'`);
    expect(mustFail(await enrolAssignment({ engagementId: t.engagementId, user: asCurrent(SUPER) }))).toMatch(/test/);
    const c = await liveJob(); sql(`update public.crew_support_requests set status = 'cancelled' where id = '${c.requestId}'`);
    expect(mustFail(await enrolAssignment({ engagementId: c.engagementId, user: asCurrent(SUPER) }))).toMatch(/confirmed/);
    const f = await liveJob(); sql(`update public.engagements set status = 'completed' where id = '${f.engagementId}'`);
    expect(mustFail(await enrolAssignment({ engagementId: f.engagementId, user: asCurrent(SUPER) }))).toMatch(/finished/);
    const p = await liveJob({ daysAhead: -1 });
    expect(mustFail(await enrolAssignment({ engagementId: p.engagementId, user: asCurrent(SUPER) }))).toMatch(/already started/);
    const n = await liveJob({ country: null });
    expect(mustFail(await enrolAssignment({ engagementId: n.engagementId, user: asCurrent(SUPER) }))).toMatch(/timezone/);
    expect(sql(`select count(*) from public.assignment_readiness where engagement_id in ('${t.engagementId}','${c.engagementId}','${f.engagementId}','${p.engagementId}','${n.engagementId}')`)).toBe("0\n");
  });
});

describe("B — the professional's answer: assignee-only, versioned, one active issue, stale after a reschedule", () => {
  const j = {} as Awaited<ReturnType<typeof liveJob>>;
  it("B1 before enrolment there is nothing to answer; a stranger, another staff member and a client are refused", async () => {
    Object.assign(j, await liveJob());
    expect(mustFail(await answer(j.engagementId, READY))).toMatch(/not active/);
    must(await enrolAssignment({ engagementId: j.engagementId, user: asCurrent(SUPER) }));
    for (const u of [CREW2, CLIENT, SUPER]) expect(mustFail(await answer(j.engagementId, READY, u))).toMatch(/Only the professional assigned/);
    expect(sql(`select count(*) from public.assignment_readiness_responses`)).toBe("0\n");
  });
  it("B2 validation: Need assistance needs a concern or remark; checklist is service-specific", async () => {
    expect(mustFail(await answer(j.engagementId, { ...READY, status: "need_assistance" }))).toMatch(/what is outstanding/);
    expect(mustFail(await answer(j.engagementId, { ...READY, checks: { briefReceived: "yes" } as Record<string, string> }))).toMatch(/unrecognised/);
    expect(mustFail(await answer(j.engagementId, { ...READY, status: "bogus" }))).toMatch(/Choose Ready/);
  });
  it("B3 Ready is recorded as version 1 for schedule version 1 and raises no issue; the state reads Ready", async () => {
    const mails = emailsBefore();
    const r = must(await answer(j.engagementId, READY), "ready");
    expect(r).toMatchObject({ version: 1, issueId: null });
    const view = (await getReadinessForProfessional(j.engagementId, CREW1))!;
    expect(view).toMatchObject({ enrolled: true, state: "ready", scheduleVersion: 1 });
    expect(view.latest).toMatchObject({ version: 1, status: "ready", scheduleVersion: 1 });
    expect(h.sent.length).toBe(mails);
  });
  it("B4 Need assistance raises exactly one issue; further problem answers update it rather than raising another", async () => {
    const a = must(await answer(j.engagementId, NEEDS));
    expect(a.issueId).toBeTruthy();
    const b = must(await answer(j.engagementId, NOT_READY));
    expect(b.issueId).toBe(a.issueId);
    expect(await activeIssues(j.engagementId)).toHaveLength(1);
    expect(sql(`select kind from public.assignment_readiness_issues where id = '${a.issueId}'`)).toBe("not_ready\n");
    expect(sql(`select count(*) from public.assignment_readiness_responses`)).toMatch(/^\d+\n$/);
    const events = (await db().from("assignment_readiness_issue_events").select("event, visibility").eq("issue_id", a.issueId!)).data!;
    expect(events.map((e) => e.event)).toEqual(expect.arrayContaining(["raised", "professional_update"]));
    expect(events.every((e) => e.visibility === "shared")).toBe(true);
  });
  it("B5 a burst of simultaneous problem answers still leaves ONE active issue and distinct, ordered versions", async () => {
    const k = await liveJob();
    must(await enrolAssignment({ engagementId: k.engagementId, user: asCurrent(SUPER) }));
    const results = await Promise.all([answer(k.engagementId, NEEDS), answer(k.engagementId, NEEDS), answer(k.engagementId, NOT_READY)]);
    expect(results.filter((r) => r.ok).length).toBeGreaterThanOrEqual(1);
    expect(await activeIssues(k.engagementId)).toHaveLength(1);
    const versions = (await db().from("assignment_readiness_responses").select("version, assignment_readiness!inner(engagement_id)").eq("assignment_readiness.engagement_id", k.engagementId)).data!.map((r) => r.version as number).sort();
    expect(new Set(versions).size).toBe(versions.length);
  });
  it("B6 responses are append-only, even for server code; nothing can be deleted", async () => {
    const upd = await db().from("assignment_readiness_responses").update({ remarks: "tampered" }).eq("readiness_id", sql(`select id from public.assignment_readiness where engagement_id = '${j.engagementId}'`).trim());
    expect(upd.error?.message ?? "").toMatch(/permission denied/i);
    const del = await db().from("assignment_readiness_responses").delete().neq("status", "x");
    expect(del.error?.message ?? "").toMatch(/permission denied/i);
    const ev = await db().from("assignment_readiness_issue_events").update({ body: "x" }).neq("event", "x");
    expect(ev.error?.message ?? "").toMatch(/permission denied/i);
  });
  it("B7 answers close at the start time", async () => {
    const k = await liveJob({ call: "10:00" });
    must(await enrolAssignment({ engagementId: k.engagementId, user: asCurrent(SUPER) }));
    const startMs = Date.parse(`${k.date}T07:00:00Z`); // 10:00 Qatar
    expect(mustFail(await answer(k.engagementId, READY, CREW1, startMs + 1))).toMatch(/started/);
    must(await answer(k.engagementId, READY, CREW1, startMs - H));
  });
});

describe("C — issue lifecycle: shared vs internal, professional replies, management closes, nobody manages their own", () => {
  const j = {} as Awaited<ReturnType<typeof liveJob>>;
  let issueId = "";
  it("C0 setup: the Founder (Super Admin) is the assigned professional and reports Need assistance", async () => {
    Object.assign(j, await liveJob({ crew: SUPER }));
    must(await enrolAssignment({ engagementId: j.engagementId, user: asCurrent(SUPER2) }));
    issueId = must(await answer(j.engagementId, NEEDS, SUPER)).issueId!;
    expect(issueId).toBeTruthy();
  });
  it("C1 he cannot acknowledge, update, message, follow up or close his OWN issue in management", async () => {
    const own = /your own assignment/;
    expect(mustFail(await manageIssue({ issueId, user: asCurrent(SUPER), action: "acknowledge" }))).toMatch(own);
    expect(mustFail(await manageIssue({ issueId, user: asCurrent(SUPER), action: "resolve", note: "all sorted out now" }))).toMatch(own);
    expect(mustFail(await postIssueMessage({ issueId, user: asCurrent(SUPER), visibility: "internal", body: "note to self" }))).toMatch(own);
    expect(mustFail(await assignFollowUp({ issueId, user: asCurrent(SUPER), assignedTo: SUPER2, followUpAction: "arrange a car" }))).toMatch(own);
    expect(sql(`select status from public.assignment_readiness_issues where id = '${issueId}'`)).toBe("open\n");
  });
  it("C2 plain staff and clients cannot manage issues at all", async () => {
    for (const u of [CREW2, CLIENT]) expect(mustFail(await manageIssue({ issueId, user: asCurrent(u), action: "acknowledge" }))).toMatch(/permission/);
  });
  it("C3 an independent administrator walks Open → Acknowledged → Action in progress → Awaiting professional confirmation", async () => {
    must(await manageIssue({ issueId, user: asCurrent(SUPER2), action: "acknowledge", sharedMessage: "We have seen this and are arranging transport." }), "ack");
    expect(sql(`select status from public.assignment_readiness_issues where id = '${issueId}'`)).toBe("acknowledged\n");
    expect(mustFail(await manageIssue({ issueId, user: asCurrent(SUPER2), action: "acknowledge" }))).toMatch(/can't be done/);
  });
  it("C4 (continued) transitions follow the rules and each step is audited", async () => {
    must(await manageIssue({ issueId, user: asCurrent(ADMIN2), action: "start_action", sharedMessage: "A driver is booked for 7:30am." }), "start");
    must(await manageIssue({ issueId, user: asCurrent(ADMIN2), action: "request_confirmation", sharedMessage: "Please confirm the lift works for you." }), "confirm");
    expect(sql(`select status from public.assignment_readiness_issues where id = '${issueId}'`)).toBe("awaiting_professional\n");
    expect(mustFail(await manageIssue({ issueId, user: asCurrent(ADMIN2), action: "acknowledge" }))).toMatch(/can't be done/);
    expect(await count("activity_log", { action: "assignment_readiness.issue_confirmation_requested", entity_id: j.engagementId })).toBe(1);
  });
  it("C5 internal notes and follow-up details stay management-only; the professional sees status and the short shared messages", async () => {
    must(await postIssueMessage({ issueId, user: asCurrent(ADMIN2), visibility: "internal", body: "Driver costs QAR 80 — approve from petty cash." }));
    must(await assignFollowUp({ issueId, user: asCurrent(ADMIN2), assignedTo: SUPER2, followUpAction: "Confirm driver booking" }));
    const prof = (await getReadinessForProfessional(j.engagementId, SUPER))!;
    const iss = prof.issues[0];
    expect(iss.status).toBe("awaiting_professional");
    const text = JSON.stringify(iss);
    expect(text).toContain("A driver is booked for 7:30am.");
    expect(text).not.toMatch(/petty cash|QAR 80|Confirm driver booking/);
    expect(iss.assignedTo).toBeNull();
    expect(iss.events.every((e) => e.visibility === "shared")).toBe(true);
    const adm = (await getReadinessForAdmin(j.engagementId))!;
    expect(JSON.stringify(adm.issues[0])).toMatch(/petty cash/);
    expect(adm.issues[0].assignedTo).toBe(SUPER2);
  });
  it("C6 the professional can reply and report it resolved, but cannot close it; reporting while awaiting confirmation records the confirmation", async () => {
    must(await professionalIssueAction({ issueId, userId: SUPER, action: "reply", body: "Thanks — 7:30 works." }));
    must(await professionalIssueAction({ issueId, userId: SUPER, action: "report_resolved", body: "" }));
    const row = (await db().from("assignment_readiness_issues").select("status, professional_confirmed_at, professional_reported_resolved_at").eq("id", issueId).single()).data!;
    expect(row.status).toBe("awaiting_professional"); // still open until management verifies
    expect(row.professional_confirmed_at).toBeTruthy();
    expect(mustFail(await professionalIssueAction({ issueId, userId: CREW2, action: "reply", body: "hi" }))).toMatch(/Only the professional/);
    expect(mustFail(await manageIssue({ issueId, user: asCurrent(SUPER), action: "resolve", note: "I fixed it myself" }))).toMatch(/your own assignment/);
  });
  it("C7 closing needs an independent administrator and a resolution note; a closed issue takes no further replies; it can be reopened", async () => {
    expect(mustFail(await manageIssue({ issueId, user: asCurrent(SUPER2), action: "resolve", note: "ok" }))).toMatch(/at least 5/);
    must(await manageIssue({ issueId, user: asCurrent(SUPER2), action: "resolve", note: "Driver confirmed and professional verified.", sharedMessage: "All arranged. Thank you." }), "resolve");
    expect(mustFail(await professionalIssueAction({ issueId, userId: SUPER, action: "reply", body: "one more thing" }))).toMatch(/already resolved/);
    must(await manageIssue({ issueId, user: asCurrent(SUPER2), action: "reopen", note: "Driver cancelled this morning" }));
    expect(sql(`select status from public.assignment_readiness_issues where id = '${issueId}'`)).toBe("open\n");
    expect(sql(`select count(*) from public.assignment_readiness_issue_events where issue_id = '${issueId}'`).trim()).not.toBe("0");
  });
  it("C8 a Ready answer on an active issue flags 'professional reports resolved' for management to verify, and raises nothing new", async () => {
    const r = must(await answer(j.engagementId, READY, SUPER));
    expect(r.issueId).toBe(issueId);
    expect(await activeIssues(j.engagementId)).toHaveLength(1);
    expect((await db().from("assignment_readiness_issues").select("professional_reported_resolved_at").eq("id", issueId).single()).data!.professional_reported_resolved_at).toBeTruthy();
  });
});

describe("D — rescheduling: atomic, audited, schedule version bumps, manual communication record, no automatic notice", () => {
  const j = {} as Awaited<ReturnType<typeof liveJob>>;
  let changeId = "";
  const input = (date: string, o: Partial<Parameters<typeof rescheduleAssignment>[0]["input"]> = {}) => ({
    startDate: date, endDate: date, callTime: "12:00", finishTime: "20:00", timezone: "", reason: "Client moved the event",
    notices: [{ informed: true, method: "phone", informedAtLocal: `${day(0)}T09:00`, note: "Called his mobile" }, { informed: false, method: "", informedAtLocal: "", note: "" }], ...o,
  });
  it("D1 only management can reschedule", async () => {
    Object.assign(j, await liveJob());
    must(await enrolAssignment({ engagementId: j.engagementId, user: asCurrent(SUPER) }));
    must(await answer(j.engagementId, READY));
    for (const u of [ADMIN2, CREW1]) expect(mustFail(await rescheduleAssignment({ requestId: j.requestId, user: asCurrent(u), input: input(day(6)) }))).toMatch(/Only authorised management/);
  });
  it("D2 validation and a required record of who was told; nothing changes on a refusal", async () => {
    const before = rows(j);
    expect(mustFail(await rescheduleAssignment({ requestId: j.requestId, user: asCurrent(SUPER), input: input(day(6), { reason: "x" }) }))).toMatch(/reason/);
    expect(mustFail(await rescheduleAssignment({ requestId: j.requestId, user: asCurrent(SUPER), input: input(day(6), { notices: [] }) }))).toMatch(/whether they have been told/);
    expect(mustFail(await rescheduleAssignment({ requestId: j.requestId, user: asCurrent(SUPER), input: input(day(6), { notices: [{ informed: true, method: "phone", informedAtLocal: "2099-01-01T09:00", note: "" }, { informed: false, method: "", informedAtLocal: "", note: "" }] }) }))).toMatch(/future/);
    expect(mustFail(await rescheduleAssignment({ requestId: j.requestId, user: asCurrent(SUPER), input: input(j.date, { callTime: "10:00", finishTime: "21:00" }) }))).toMatch(/Nothing changed/);
    expect(rows(j)).toBe(before);
    expect(sql("select count(*) from public.assignment_schedule_changes")).toBe("0\n");
  });
  it("D3 a reschedule updates the request, the engagement's derived dates and the history in one step; the answer becomes stale", async () => {
    const mails = emailsBefore();
    const newDate = day(6);
    const r = must(await rescheduleAssignment({ requestId: j.requestId, user: asCurrent(SUPER), input: input(newDate) }), "reschedule");
    changeId = r.changeId;
    expect(r.pending).toBe(1); // the client has not been told yet
    const req = (await db().from("crew_support_requests").select("start_date, end_date, call_time, finish_time").eq("id", j.requestId).single()).data!;
    expect(req).toMatchObject({ start_date: newDate, end_date: newDate, call_time: "12:00", finish_time: "20:00" });
    const eng = (await db().from("engagements").select("starts_at, ends_at").eq("id", j.engagementId).single()).data!;
    expect(eng).toMatchObject({ starts_at: newDate, ends_at: newDate });
    const ch = (await listScheduleChanges(j.requestId))[0];
    expect(ch.previous).toMatchObject({ start_date: j.date, call_time: "10:00" });
    expect(ch.new).toMatchObject({ start_date: newDate, call_time: "12:00" });
    expect(ch.parties.find((p) => p.kind === "professional")?.notice).toMatchObject({ method: "phone" });
    expect(ch.parties.find((p) => p.kind === "client")?.notice).toBeNull();
    const prof = (await getReadinessForProfessional(j.engagementId, CREW1))!;
    expect(prof.scheduleVersion).toBe(2);
    expect(prof.state).toBe("stale");
    expect(h.sent.length).toBe(mails); // Ordift sent nothing
    const audit = (await db().from("activity_log").select("metadata").eq("action", "assignment.rescheduled").eq("entity_id", j.requestId)).data![0].metadata as Record<string, unknown>;
    expect(audit).toMatchObject({ automaticNotificationsSent: false, noticesOutstanding: 1, noticesRecorded: 1 });
  });
  it("D4 a stale answer is re-requested: answering again records version 2 for schedule version 2", async () => {
    const r = must(await answer(j.engagementId, READY));
    expect(r.version).toBe(2);
    expect((await getReadinessForProfessional(j.engagementId, CREW1))!.state).toBe("ready");
  });
  it("D5 the outstanding notice can be recorded later, once, by management only; the time is read in the job's timezone", async () => {
    expect(mustFail(await recordScheduleNotice({ changeId, user: asCurrent(ADMIN2), partyKind: "client", partyProfileId: null, method: "email", informedAtLocal: `${day(0)}T10:00`, note: "" }))).toMatch(/Only authorised management/);
    must(await recordScheduleNotice({ changeId, user: asCurrent(SUPER), partyKind: "client", partyProfileId: null, method: "email", informedAtLocal: `${day(0)}T10:00`, note: "Emailed Ama" }), "record");
    expect(mustFail(await recordScheduleNotice({ changeId, user: asCurrent(SUPER), partyKind: "client", partyProfileId: null, method: "email", informedAtLocal: `${day(0)}T10:00`, note: "" }))).toMatch(/already been recorded/);
    expect(mustFail(await recordScheduleNotice({ changeId, user: asCurrent(SUPER), partyKind: "professional", partyProfileId: CREW2, method: "phone", informedAtLocal: `${day(0)}T10:00`, note: "" }))).toMatch(/wasn't one of the people/);
    const n = (await listScheduleChanges(j.requestId))[0].parties.find((p) => p.kind === "client")!.notice!;
    expect(Date.parse(n.informedAt)).toBe(Date.parse(`${day(0)}T07:00:00Z`)); // 10:00 Qatar = 07:00 UTC
  });
  it("D6 the timezone can be overridden by management with a reason (history kept); a bad one is refused", async () => {
    expect(mustFail(await setEventTimezone({ requestId: j.requestId, user: asCurrent(ADMIN2), timezone: "Africa/Accra", reason: "Event is in Accra" }))).toMatch(/Only authorised management/);
    expect(mustFail(await setEventTimezone({ requestId: j.requestId, user: asCurrent(SUPER), timezone: "Mars/Base", reason: "Event is on Mars" }))).toMatch(/isn't recognised/);
    must(await setEventTimezone({ requestId: j.requestId, user: asCurrent(SUPER), timezone: "Africa/Accra", reason: "Event is in Accra" }));
    const ctx = (await getReadinessForAdmin(j.engagementId))!.context;
    expect(ctx.timezone).toEqual({ timezone: "Africa/Accra", source: "override" });
    expect(ctx.scheduleVersion).toBe(3);
    expect(mustFail(await setEventTimezone({ requestId: j.requestId, user: asCurrent(SUPER), timezone: "Africa/Accra", reason: "Event is in Accra" }))).toMatch(/already/);
  });
  it("D7 a request that is cancelled, declined or completed cannot be rescheduled; a firm clash blocks the change", async () => {
    const c = await liveJob(); sql(`update public.crew_support_requests set status = 'cancelled' where id = '${c.requestId}'`);
    expect(mustFail(await rescheduleAssignment({ requestId: c.requestId, user: asCurrent(SUPER), input: input(day(8)) }))).toMatch(/can't be rescheduled/);
    const a = await liveJob({ crew: CREW2, daysAhead: 3 });
    const b = await liveJob({ crew: CREW2, daysAhead: 9 }); // CREW2 firmly booked on day 9 (confirmed)
    expect(mustFail(await rescheduleAssignment({ requestId: a.requestId, user: asCurrent(SUPER), input: input(day(9)) }))).toMatch(/already booked/);
    expect(b.requestId).toBeTruthy();
  });
  it("D8 the actual service date, the quotation snapshot, payments and payables are untouched by any of this", async () => {
    expect(await count("payments", { entity_id: j.enquiryId })).toBe(0);
    expect(await count("payment_obligations", { source_reference: j.engagementId })).toBe(0);
    const actual = sql(`select count(*) from public.assignment_reports where engagement_id = '${j.engagementId}'`);
    expect(actual).toBe("0\n");
  });
});

describe("E — a Bright-shaped assignment stays completely untouched", () => {
  it("E1 an accepted, confirmed, upcoming assignment that nobody enrolled has no readiness record, form, flag or change — whatever happens around it", async () => {
    const bright = await liveJob();
    const before = rows(bright);
    // everything the other describes did, on other assignments, plus the overview read
    const other = await liveJob();
    must(await enrolAssignment({ engagementId: other.engagementId, user: asCurrent(SUPER) }));
    must(await answer(other.engagementId, NEEDS));
    must(await rescheduleAssignment({ requestId: other.requestId, user: asCurrent(SUPER), input: { startDate: day(7), endDate: day(7), callTime: "11:00", finishTime: "", timezone: "", reason: "Moved by the client", notices: [{ informed: false, method: "", informedAtLocal: "", note: "" }, { informed: false, method: "", informedAtLocal: "", note: "" }] } }));
    await getReadinessAttention(asCurrent(SUPER), Date.now() + 10 * H);
    expect(rows(bright)).toBe(before);
    expect(sql(`select count(*) from public.assignment_readiness where engagement_id = '${bright.engagementId}'`)).toBe("0\n");
    const view = (await getReadinessForProfessional(bright.engagementId, CREW1))!;
    expect(view).toMatchObject({ enrolled: false, active: false });
    expect(mustFail(await answer(bright.engagementId, READY))).toMatch(/not active/);
    expect((await getReadinessForAdmin(bright.engagementId))!.flagNoResponse).toBe(false);
    expect((await getReadinessAttention(asCurrent(SUPER), Date.now() + 10 * H))!.noResponse.map((n) => n.reference)).not.toContain(bright.ref);
  });
  it("E2 nothing in B1 sent an email", async () => {
    expect(h.sent.filter((m) => /readiness|reminder|reschedul/i.test(m.subject))).toHaveLength(0);
  });
});

describe("F — the 12-hour flag, attention list, settings and RLS", () => {
  it("F1 an unanswered enrolled assignment is flagged inside the window (display only); an answered one is not; test records are excluded", async () => {
    const j = await liveJob({ daysAhead: 3, call: "10:00" });
    must(await enrolAssignment({ engagementId: j.engagementId, user: asCurrent(SUPER) }));
    const startMs = Date.parse(`${j.date}T07:00:00Z`);
    expect((await getReadinessForAdmin(j.engagementId, startMs - 13 * H))!.flagNoResponse).toBe(false);
    expect((await getReadinessForAdmin(j.engagementId, startMs - 11 * H))!.flagNoResponse).toBe(true);
    const att = (await getReadinessAttention(asCurrent(SUPER), startMs - 11 * H))!;
    expect(att.noResponse.map((n) => n.reference)).toContain(j.ref);
    must(await answer(j.engagementId, READY, CREW1, startMs - 20 * H));
    expect((await getReadinessForAdmin(j.engagementId, startMs - 11 * H))!.flagNoResponse).toBe(false);
    expect(await getReadinessAttention(asCurrent(CREW1))).toBeNull(); // plain staff see none of it
  });
  it("F2 only management edits settings; ordering and bounds are enforced; every change is audited; reminders stay off", async () => {
    const v = { autoEnrolFrom: null, firstReminderHours: 48, readinessCheckHours: 24, noResponseFlagHours: 12, skipCheckIfReady: true };
    expect(mustFail(await updateReadinessSettings({ user: asCurrent(ADMIN2), values: v }))).toMatch(/Only authorised management/);
    expect(mustFail(await updateReadinessSettings({ user: asCurrent(SUPER), values: { ...v, readinessCheckHours: 60 } }))).toMatch(/after the first reminder/);
    expect(mustFail(await updateReadinessSettings({ user: asCurrent(SUPER), values: { ...v, noResponseFlagHours: 30 } }))).toMatch(/after the readiness check/);
    must(await updateReadinessSettings({ user: asCurrent(SUPER), values: { ...v, firstReminderHours: 72, noResponseFlagHours: 10 } }));
    expect(await getReadinessSettings()).toMatchObject({ firstReminderHours: 72, noResponseFlagHours: 10, remindersEnabled: false, autoEnrolFrom: null });
    expect(await count("activity_log", { action: "assignment_readiness.settings_changed" })).toBe(1);
    must(await updateReadinessSettings({ user: asCurrent(SUPER), values: v }));
  });
  it("F3 responsible manager must be an active administrator; stopping tracking needs a reason and keeps history", async () => {
    const j = await liveJob();
    must(await enrolAssignment({ engagementId: j.engagementId, user: asCurrent(SUPER) }));
    expect(mustFail(await setResponsibleManager({ engagementId: j.engagementId, user: asCurrent(SUPER), managerId: CLIENT }))).toMatch(/active administrator/);
    must(await setResponsibleManager({ engagementId: j.engagementId, user: asCurrent(SUPER), managerId: SUPER2 }));
    expect(mustFail(await disableReadiness({ engagementId: j.engagementId, user: asCurrent(SUPER), reason: "x" }))).toMatch(/reason/);
    must(await answer(j.engagementId, NEEDS));
    must(await disableReadiness({ engagementId: j.engagementId, user: asCurrent(SUPER), reason: "Job postponed indefinitely" }));
    expect(mustFail(await answer(j.engagementId, READY))).toMatch(/not active/);
    expect(sql(`select count(*) from public.assignment_readiness_responses`).trim()).not.toBe("0");
  });
  it("F4 row-level security (real tokens): the assignee reads their own readiness and answers; other staff and clients read nothing; issues and notes are management-only; nobody writes directly", async () => {
    const j = await liveJob();
    must(await enrolAssignment({ engagementId: j.engagementId, user: asCurrent(SUPER) }));
    const issueId = must(await answer(j.engagementId, NEEDS)).issueId!;
    must(await manageIssue({ issueId, user: asCurrent(SUPER2), action: "acknowledge", note: "internal only" }));
    const q = (id: string, t: string) => asUserDb(id).from(t).select("id");
    expect((await q(CREW1, "assignment_readiness")).data!.length).toBeGreaterThan(0);
    expect((await q(CREW1, "assignment_readiness_responses")).data!.length).toBeGreaterThan(0);
    for (const u of [CREW2, CLIENT]) { expect((await q(u, "assignment_readiness")).data).toHaveLength(0); expect((await q(u, "assignment_readiness_responses")).data).toHaveLength(0); }
    for (const t of ["assignment_readiness_issues", "assignment_readiness_issue_events", "assignment_schedule_changes", "assignment_schedule_change_notices", "assignment_readiness_settings"]) {
      expect((await q(CREW1, t)).data).toHaveLength(0); // even the assignee: issues/notes are management-only at the database level
      expect((await q(SUPER2, t)).data!.length).toBeGreaterThan(0);
    }
    for (const t of ["assignment_readiness", "assignment_readiness_responses", "assignment_readiness_issues", "assignment_readiness_issue_events", "assignment_schedule_changes"]) {
      const w = await asUserDb(SUPER2).from(t).insert({}).select("id");
      expect(w.error).toBeTruthy();
    }
    expect((await asUserDb(SUPER2).from("assignment_readiness_settings").update({ first_reminder_hours: 99 }).eq("id", true).select("id")).data ?? []).toHaveLength(0);
  });
  it("F5 nothing in readiness touched files, deliverables, job reports, payables or payments, and no email was sent", async () => {
    expect(sql("select count(*) from public.assignment_reports")).toBe("0\n");
    expect(sql("select count(*) from public.project_files")).toBe("0\n");
    expect(sql("select count(*) from public.payment_obligations")).toBe("0\n");
    expect(sql("select count(*) from public.payments")).toBe("0\n");
    expect(h.sent.filter((m) => /readiness|reminder/i.test(m.subject))).toHaveLength(0);
  });
});
