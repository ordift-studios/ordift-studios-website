// @vitest-environment node
//
// End-to-end run of the REAL readiness-reminder code (B2: due-time rules, claim-before-send idempotency, late caps,
// escalation recipients, delivery stages, scheduler authentication, heartbeat) against a throwaway local Postgres
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
import { enrolAssignment, getReadinessForAdmin, setResponsibleManager, submitReadiness } from "./readiness";
import { manageIssue } from "./readinessIssues";
import { rescheduleAssignment } from "./reschedule";
import { submitJobReport } from "./jobReports";
import { clearSuppression, getSchedulerStatus, previewReminders, runReadinessReminders, setAreaLabel, setRemindersMode, type Mailer } from "./readinessReminders";
import { zonedToUtcMs } from "./schedule";
import { NextRequest } from "next/server";
import * as cronRoute from "@/app/api/cron/readiness-reminders/route";
import * as webhookRoute from "@/app/api/webhooks/resend-readiness/route";

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

// ====================================================================================== B2 helpers
type Job = Awaited<ReturnType<typeof liveJob>>;
const startMsOf = (j: Job) => zonedToUtcMs(j.date, 10, 0, "Asia/Qatar");
const at = (j: Job, hoursBefore: number) => startMsOf(j) - hoursBefore * H;
const LABEL = "Doha — West Bay";
const mails: { to: string; subject: string; text: string; html: string }[] = [];
let msgSeq = 0;
const okMailer: Mailer = async (p) => { mails.push({ to: p.to, subject: p.subject, text: p.text, html: p.html }); return { ok: true, mode: "sent", attempts: 1, providerId: `msg-${++msgSeq}` }; };
const mailsFor = (j: Job) => mails.filter((m) => m.subject.includes(j.ref) || m.text.includes(j.ref));
type Note = { kind: string; status: string; skip_reason: string | null; recipient_profile_id: string | null; delivery_mode: string; schedule_version: number; condition_key: string; attempts: number; id: string };
const notes = (j: Job) => JSON.parse(sql(`select coalesce(jsonb_agg(to_jsonb(n) order by n.due_at, n.kind), '[]') from public.assignment_notifications n where n.engagement_id = '${j.engagementId}'`).trim() || "[]") as Note[];
const by = (j: Job, kind: string) => notes(j).filter((n) => n.kind === kind);
const run = (nowMs: number, mailer: Mailer = okMailer, trigger: "test" | "github" | "manual" = "test") => runReadinessReminders({ trigger, nowMs, mailer });
const readinessId = (j: Job) => sql(`select id from public.assignment_readiness where engagement_id = '${j.engagementId}'`).trim();

// Only this job takes part in a run: every other enrolled assignment is switched off first.
function isolate(j: Job) {
  sql(`update public.assignment_readiness set disabled_at = now(), disabled_by = '${SUPER}', disabled_reason = 'test isolation' where engagement_id <> '${j.engagementId}' and disabled_at is null`);
}
async function arm(j: Job, o: { label?: string | null; manager?: string } = {}) {
  must(await enrolAssignment({ engagementId: j.engagementId, user: asCurrent(SUPER) }), "enrol");
  if (o.label !== null) must(await setAreaLabel({ engagementId: j.engagementId, user: asCurrent(SUPER), label: o.label ?? LABEL }), "label");
  if (o.manager) must(await setResponsibleManager({ engagementId: j.engagementId, user: asCurrent(SUPER), managerId: o.manager }), "manager");
  isolate(j);
}
async function mode(to: "off" | "dry_run" | "test" | "live") {
  const cur = sql("select reminders_mode from public.assignment_readiness_settings").trim();
  if (cur !== to) {
    if (to === "live" && cur !== "test") must(await setRemindersMode({ user: asCurrent(SUPER), to: "test", reason: "E2E step" }), "to test");
    must(await setRemindersMode({ user: asCurrent(SUPER), to, reason: "E2E step" }), `to ${to}`);
  }
  // as if reminders had been switched on long ago (individual tests move this when they test the switch-on rule)
  sql("update public.assignment_readiness_settings set reminders_switched_on_at = now() - interval '60 days' where reminders_switched_on_at is not null");
}
const pristine = (j: Job) => rows(j);

beforeAll(() => {
  h.emails.set(SUPER2, "independent@e2e.test");
  process.env.RESEND_WEBHOOK_SECRET = `whsec_${Buffer.from("e2e-webhook-secret-0123456789ab").toString("base64")}`;
});

describe("A — switches: off by default, dry run writes nothing, test mode sends nothing", () => {
  it("A1 defaults: reminders OFF, nothing enrolled by the migration, DB guard keeps enabled consistent with mode", async () => {
    expect(sql("select reminders_mode, reminders_enabled::text from public.assignment_readiness_settings").trim()).toBe("off|false");
    expect(sql("select count(*) from public.assignment_readiness").trim()).toBe("0");
    const bad = (() => { try { sql("update public.assignment_readiness_settings set reminders_enabled = true"); return ""; } catch (e) { return String((e as { stderr?: Buffer }).stderr ?? e); } })();
    expect(bad).toMatch(/enabled_matches_mode/);
  });
  it("A2 OFF: a run computes and sends nothing, but leaves a heartbeat", async () => {
    const j = await liveJob(); await arm(j);
    const before = pristine(j);
    const s = await run(at(j, 47.5));
    expect(s.status).toBe("off");
    expect(notes(j)).toHaveLength(0);
    expect(mailsFor(j)).toHaveLength(0);
    expect(sql("select count(*) from public.scheduler_runs where mode = 'off' and status = 'succeeded'").trim()).toBe("1");
    expect(pristine(j)).toBe(before);
  });
  it("A3 only management may change the mode; a reason is required; Live is only reachable from Test", async () => {
    for (const u of [ADMIN2, CREW1, CLIENT]) expect(mustFail(await setRemindersMode({ user: asCurrent(u), to: "dry_run", reason: "trying it out" }))).toMatch(/Only authorised management/);
    expect(mustFail(await setRemindersMode({ user: asCurrent(SUPER), to: "dry_run", reason: "x" }))).toMatch(/reason/);
    expect(mustFail(await setRemindersMode({ user: asCurrent(SUPER), to: "live", reason: "straight to live" }))).toMatch(/only go Live from Test/);
    const saved = process.env.RESEND_WEBHOOK_SECRET;
    delete process.env.RESEND_WEBHOOK_SECRET;
    must(await setRemindersMode({ user: asCurrent(SUPER), to: "test", reason: "trying test" }));
    expect(mustFail(await setRemindersMode({ user: asCurrent(SUPER), to: "live", reason: "go live" }))).toMatch(/Delivery tracking is not set up/);
    process.env.RESEND_WEBHOOK_SECRET = saved;
    must(await setRemindersMode({ user: asCurrent(SUPER), to: "off", reason: "back to off" }));
    expect(await count("activity_log", { action: "assignment_readiness.reminders_mode_changed" })).toBeGreaterThanOrEqual(2);
  });
  it("A4 the database stamps the switch-on time whenever reminders are switched on, and not for dry run or off", async () => {
    sql("update public.assignment_readiness_settings set reminders_switched_on_at = null");
    must(await setRemindersMode({ user: asCurrent(SUPER), to: "dry_run", reason: "preview only" }));
    expect(sql("select reminders_switched_on_at is null from public.assignment_readiness_settings").trim()).toBe("t");
    must(await setRemindersMode({ user: asCurrent(SUPER), to: "test", reason: "exercise it" }));
    expect(sql("select (reminders_switched_on_at is not null and reminders_enabled)::text from public.assignment_readiness_settings").trim()).toBe("true");
    must(await setRemindersMode({ user: asCurrent(SUPER), to: "off", reason: "stop it now" }));
    expect(sql("select reminders_enabled::text from public.assignment_readiness_settings").trim()).toBe("false");
  });
  it("A5 DRY RUN: previews exactly what would go out, writes no notification, sends nothing", async () => {
    const j = await liveJob(); await arm(j);
    await mode("dry_run");
    const before = pristine(j);
    const s = await run(at(j, 47.5));
    expect(s.status).toBe("succeeded");
    expect(notes(j)).toHaveLength(0);
    expect(mailsFor(j)).toHaveLength(0);
    const { items } = await previewReminders({ nowMs: at(j, 47.5), horizonHours: 72 });
    const first = items.find((i) => i.reference === j.ref && i.kind === "reminder_first")!;
    expect(first.outcome).toBe("will_send"); // reminders were switched on long ago, so the due window is live
    sql("update public.assignment_readiness_settings set reminders_switched_on_at = null");
    const never = (await previewReminders({ nowMs: at(j, 47.5), horizonHours: 72 })).items.find((i) => i.reference === j.ref && i.kind === "reminder_first")!;
    expect(never.outcome).toBe("would_skip"); // if switched on right now, an already-due window would not be caught up
    expect(never.reason).toBe("before_switch_on");
    const check = items.find((i) => i.reference === j.ref && i.kind === "reminder_check")!;
    expect(check.outcome).toBe("waiting");
    expect(check.subject).toContain(j.ref);
    expect(check.text).toContain(LABEL);
    expect(pristine(j)).toBe(before);
  });
  it("A6 TEST MODE: the whole flow runs and is recorded, but nothing is handed to any mail provider", async () => {
    const j = await liveJob(); await arm(j);
    await mode("test");
    const before = pristine(j);
    let handed = 0;
    const spy: Mailer = async (p) => { handed++; return okMailer(p); };
    await run(at(j, 47.5), spy);
    expect(handed).toBe(0);
    const n = by(j, "reminder_first");
    expect(n).toHaveLength(1);
    expect(n[0]).toMatchObject({ status: "suppressed_test", delivery_mode: "test", recipient_profile_id: CREW1 });
    expect(sql(`select stage from public.assignment_notification_deliveries where notification_id = '${n[0].id}'`).trim()).toBe("suppressed");
    await run(at(j, 47.4), spy); // repeat: still exactly one
    expect(by(j, "reminder_first")).toHaveLength(1);
    expect(handed).toBe(0);
    expect(pristine(j)).toBe(before);
  });
});

describe("B — live: T-48 / T-24 / T-12 behaviour, content and idempotency", () => {
  it("B1 T-48 sends ONE preparation reminder to the professional with only the allowed fields", async () => {
    const j = await liveJob(); await arm(j); await mode("live");
    const s = await run(at(j, 47.5));
    expect(s.sent).toBe(1);
    const m = mailsFor(j);
    expect(m).toHaveLength(1);
    expect(m[0].to).toBe("crew1@e2e.test");
    const body = `${m[0].subject}\n${m[0].text}\n${m[0].html}`;
    expect(body).toContain(j.ref);
    expect(body).toContain(LABEL);
    expect(body).toContain(`/portal/crew-offers/${j.slotId}`);
    expect(body).toMatch(/Photography/);
    // privacy: nothing from the request beyond the label — not the venue, on-site contact, client, phone, pay
    for (const forbidden of ["Doha — QA", "Ama", j.email, "Bright Test", "+974000000", "1000", "QAR", "Wedding"]) expect(body).not.toContain(forbidden);
    // delivery stages are recorded separately: attempted then provider_accepted (with the provider's id)
    const n = by(j, "reminder_first")[0];
    expect(sql(`select string_agg(stage, ',' order by stage) from public.assignment_notification_deliveries where notification_id = '${n.id}'`).trim()).toBe("attempted,provider_accepted");
    expect(sql(`select provider_message_id from public.assignment_notification_deliveries where notification_id = '${n.id}' and stage = 'provider_accepted'`).trim()).toMatch(/^msg-/);
  });
  it("B2 repeating, and running concurrently, never duplicates", async () => {
    const j = await liveJob(); await arm(j); await mode("live");
    await Promise.all([run(at(j, 47.5)), run(at(j, 47.5)), run(at(j, 47.5))]);
    await run(at(j, 47.4));
    await run(at(j, 47.0));
    expect(mailsFor(j)).toHaveLength(1);
    expect(by(j, "reminder_first")).toHaveLength(1);
  });
  it("B3 even with the lock bypassed (expired holder), the unique key stops a second send", async () => {
    const j = await liveJob(); await arm(j); await mode("live");
    const a = run(at(j, 47.5));
    sql("update public.scheduler_lock set holder = null, locked_until = null");
    const b = run(at(j, 47.5));
    await Promise.all([a, b]);
    sql("update public.scheduler_lock set holder = null, locked_until = null");
    expect(mailsFor(j).length).toBe(1);
    expect(by(j, "reminder_first")).toHaveLength(1);
  });
  it("B4 T-24 follow-up goes to a professional who has not confirmed; Ready for the current version suppresses it", async () => {
    const a = await liveJob(); await arm(a); await mode("live");
    await run(at(a, 47.5)); await run(at(a, 23.5));
    expect(by(a, "reminder_check")[0]).toMatchObject({ status: "sent" });
    expect(mailsFor(a)).toHaveLength(2);
    const b = await liveJob({ daysAhead: 4 }); await arm(b);
    must(await answer(b.engagementId, READY));
    await run(at(b, 23.5));
    expect(by(b, "reminder_check")[0]).toMatchObject({ status: "skipped", skip_reason: "already_ready", recipient_profile_id: null });
    expect(mailsFor(b)).toHaveLength(0);
  });
  it("B5 a professional who asked for help is not nagged; the unresolved concern is escalated to management (not the professional) once per condition", async () => {
    const j = await liveJob(); await arm(j); await mode("live");
    must(await answer(j.engagementId, NEEDS));
    await run(at(j, 23.5));
    expect(by(j, "reminder_check")[0]).toMatchObject({ status: "skipped", skip_reason: "managed_by_management" });
    await run(at(j, 11.5));
    const esc = by(j, "escalation_concern");
    expect(esc.map((e) => e.recipient_profile_id).sort()).toEqual([SUPER, SUPER2].sort());
    const m = mailsFor(j);
    expect(m.map((x) => x.to).sort()).toEqual(["founder@e2e.test", "independent@e2e.test"]);
    expect(m.every((x) => !x.text.includes("lift from the hotel"))).toBe(true); // no concern detail in email
    expect(m.some((x) => x.to === "crew1@e2e.test")).toBe(false);
    await run(at(j, 11.0)); await run(at(j, 10.5));
    expect(mailsFor(j)).toHaveLength(2); // once per condition
    // a NEW issue after the first is resolved is a new condition and is escalated afresh
    const issue = (await activeIssues(j.engagementId))[0];
    must(await manageIssue({ issueId: issue.id as string, user: asCurrent(SUPER2), action: "acknowledge", note: "", sharedMessage: "Seen" }));
    must(await manageIssue({ issueId: issue.id as string, user: asCurrent(SUPER2), action: "resolve", note: "Lift booked and confirmed", sharedMessage: "" }));
    must(await answer(j.engagementId, NOT_READY));
    await run(at(j, 9));
    expect(by(j, "escalation_concern").length).toBeGreaterThan(2);
    expect(mailsFor(j).length).toBeGreaterThan(2);
  });
  it("B6 no response at T-12 escalates to the responsible manager only", async () => {
    const j = await liveJob(); await arm(j, { manager: SUPER2 }); await mode("live");
    await run(at(j, 11.5));
    const esc = by(j, "escalation_no_response");
    expect(esc).toHaveLength(1);
    expect(esc[0].recipient_profile_id).toBe(SUPER2);
    expect(mailsFor(j).map((m) => m.to)).toEqual(["independent@e2e.test"]);
    expect(mailsFor(j)[0].subject).toMatch(/no readiness response/);
  });
  it("B7 an answered (Ready) assignment is not escalated for silence", async () => {
    const j = await liveJob(); await arm(j); await mode("live");
    must(await answer(j.engagementId, READY));
    await run(at(j, 11.5));
    expect(by(j, "escalation_no_response")[0]).toMatchObject({ status: "skipped", skip_reason: "condition_not_met" });
    expect(mailsFor(j)).toHaveLength(0);
  });
  it("B8 escalation never goes to the assignee: a Super Admin assigned to the job is excluded; with no independent manager it is recorded, not sent", async () => {
    const j = await liveJob({ crew: SUPER }); await arm(j); await mode("live");
    await run(at(j, 11.5));
    expect(by(j, "escalation_no_response").map((n) => n.recipient_profile_id)).toEqual([SUPER2]);
    expect(mailsFor(j).map((m) => m.to)).toEqual(["independent@e2e.test"]);
    const k = await liveJob({ crew: SUPER, daysAhead: 5 }); await arm(k);
    sql(`delete from public.user_roles where user_id = '${SUPER2}' and role_id = (select id from public.roles where slug = 'super_admin')`);
    try {
      await run(at(k, 11.5));
      expect(by(k, "escalation_no_response")[0]).toMatchObject({ status: "skipped", skip_reason: "no_independent_recipient" });
      expect(mailsFor(k)).toHaveLength(0);
    } finally {
      sql(`insert into public.user_roles (user_id, role_id) select '${SUPER2}', id from public.roles where slug = 'super_admin' on conflict do nothing`);
    }
  });
});

describe("C — late runs, enrolment, switch-on, labels, ineligibility", () => {
  it("C1 a run that is too late skips (and records it) instead of sending stale; the Overview feed counts it", async () => {
    const j = await liveJob(); await arm(j); await mode("live");
    await run(at(j, 48 - 7));
    expect(by(j, "reminder_first")[0]).toMatchObject({ status: "skipped", skip_reason: "late" });
    expect(mailsFor(j)).toHaveLength(0);
    expect((await getSchedulerStatus()).lateSkips7d).toBeGreaterThan(0);
  });
  it("C2 a missed escalation window is skipped as late, not sent in the final hours", async () => {
    const j = await liveJob(); await arm(j); await mode("live");
    await run(at(j, 8));
    expect(by(j, "escalation_no_response")[0]).toMatchObject({ status: "skipped", skip_reason: "late" });
    expect(mailsFor(j)).toHaveLength(0);
  });
  it("C3 enrolled 20h before the start: the 48h and 24h reminders are never sent retrospectively", async () => {
    const j = await liveJob(); await arm(j); await mode("live");
    sql(`update public.assignment_readiness set enrolled_at = '${new Date(at(j, 20)).toISOString()}' where engagement_id = '${j.engagementId}'`);
    await run(at(j, 19.9));
    expect(by(j, "reminder_first")[0]).toMatchObject({ status: "skipped", skip_reason: "before_enrolment" });
    expect(by(j, "reminder_check")[0]).toMatchObject({ status: "skipped", skip_reason: "before_enrolment" });
    expect(mailsFor(j)).toHaveLength(0);
  });
  it("C4 switching reminders on mid-way never sends a catch-up for windows that already passed", async () => {
    const j = await liveJob(); await arm(j); await mode("live");
    sql(`update public.assignment_readiness_settings set reminders_switched_on_at = '${new Date(at(j, 30)).toISOString()}'`);
    await run(at(j, 23.5));
    expect(by(j, "reminder_first")[0]).toMatchObject({ status: "skipped", skip_reason: "before_switch_on" });
    expect(by(j, "reminder_check")[0]).toMatchObject({ status: "sent" });
    expect(mailsFor(j)).toHaveLength(1);
  });
  it("C5 no area label: the professional is not emailed (and nothing is recorded as final); adding it inside the cap releases it once", async () => {
    const j = await liveJob(); await arm(j, { label: null }); await mode("live");
    const s = await run(at(j, 47.5));
    expect(s.blocked).toBeGreaterThan(0);
    expect(mailsFor(j)).toHaveLength(0);
    expect(by(j, "reminder_first")).toHaveLength(0);
    for (const u of [ADMIN2, CREW1]) expect(mustFail(await setAreaLabel({ engagementId: j.engagementId, user: asCurrent(u), label: LABEL }))).toMatch(/Only authorised management/);
    expect(mustFail(await setAreaLabel({ engagementId: j.engagementId, user: asCurrent(SUPER), label: "x" }))).toMatch(/2–80/);
    must(await setAreaLabel({ engagementId: j.engagementId, user: asCurrent(SUPER), label: LABEL }));
    await run(at(j, 47.0)); await run(at(j, 46.5));
    expect(mailsFor(j)).toHaveLength(1);
  });
  it("C6 cancelled, finished, declined, test and disabled assignments get nothing; eligibility is re-checked at send time", async () => {
    const j = await liveJob(); await arm(j); await mode("live");
    await run(at(j, 47.5)); // T-48 goes out while eligible
    expect(mailsFor(j)).toHaveLength(1);
    sql(`update public.crew_support_requests set status = 'cancelled' where id = '${j.requestId}'`); // cancelled before T-24
    await run(at(j, 23.5));
    expect(by(j, "reminder_check")[0]).toMatchObject({ status: "skipped", skip_reason: "ineligible" });
    expect(mailsFor(j)).toHaveLength(1);
    const cases: [string, (x: Job) => string][] = [
      ["declined", (x) => `update public.crew_support_requests set status = 'declined' where id = '${x.requestId}'`],
      ["finished", (x) => `update public.engagements set status = 'completed' where id = '${x.engagementId}'`],
      ["released", (x) => `update public.crew_support_slots set status = 'released', crew_accepted_at = null where id = '${x.slotId}'`],
      ["test", (x) => `update public.crew_support_requests set is_test = true where id = '${x.requestId}'`],
    ];
    for (const [name, make] of cases) {
      const k = await liveJob({ daysAhead: 6 }); await arm(k);
      sql(make(k));
      await run(at(k, 47.5));
      expect(by(k, "reminder_first")[0], name).toMatchObject({ status: "skipped", skip_reason: "ineligible" });
      expect(mailsFor(k), name).toHaveLength(0);
    }
    const d = await liveJob({ daysAhead: 7 }); await arm(d);
    sql(`update public.assignment_readiness set disabled_at = now(), disabled_by = '${SUPER}', disabled_reason = 'management stopped tracking' where engagement_id = '${d.engagementId}'`);
    await run(at(d, 47.5));
    expect(mailsFor(d)).toHaveLength(0);
  });
  it("C7 nothing is sent after the assignment has started", async () => {
    const j = await liveJob(); await arm(j); await mode("live");
    await run(startMsOf(j) + 30 * 60_000);
    expect(mailsFor(j)).toHaveLength(0);
    expect(notes(j).every((n) => n.status === "skipped")).toBe(true);
  });
  it("C8 an assignment that was never enrolled (Bright-shaped) receives nothing from any run, in any mode", async () => {
    const bright = await liveJob({ daysAhead: 2 });
    await mode("live");
    const j = await liveJob({ daysAhead: 8 }); await arm(j); // the only enrolled one
    await run(at(bright, 47)); await run(at(bright, 23)); await run(at(bright, 11));
    expect(mailsFor(bright)).toHaveLength(0);
    expect(notes(bright)).toHaveLength(0);
  });
  it("C8b a completed assignment is excluded: once the work is reported it can't be enrolled, and an enrolled one stops receiving anything — even if its schedule is still in the future (the Bright date mismatch)", async () => {
    const report = (j: Job, user = CREW1) => submitJobReport({ engagementId: j.engagementId, actorUserId: user, input: { serviceFamily: "photography", actualServiceDate: "2026-10-10", actualStartTime: "11:00", actualEndTime: "21:00", completionStatus: "completed", wentSmoothly: true, answers: {}, incidents: "", clientRequests: "", additionalServices: "", outstandingWork: "", remarks: "Performed earlier than the schedule shows", } });
    // (a) a future-dated assignment whose work has already been reported cannot be enrolled
    const a = await liveJob({ daysAhead: 10 });
    must(await report(a));
    expect(mustFail(await enrolAssignment({ engagementId: a.engagementId, user: asCurrent(SUPER) }))).toMatch(/job report has already been submitted/);
    expect(sql(`select count(*) from public.assignment_readiness where engagement_id = '${a.engagementId}'`).trim()).toBe("0");
    // (b) one enrolled earlier stops getting reminders as soon as the report exists
    const b = await liveJob({ daysAhead: 11 }); await arm(b); await mode("live");
    await run(at(b, 47.5));
    expect(mailsFor(b)).toHaveLength(1); // the 48h reminder went out while the work was genuinely upcoming
    must(await report(b));
    await run(at(b, 23.5)); await run(at(b, 11.5));
    expect(by(b, "reminder_check")[0]).toMatchObject({ status: "skipped", skip_reason: "ineligible" });
    expect(by(b, "escalation_no_response")[0]).toMatchObject({ status: "skipped", skip_reason: "ineligible" });
    expect(mailsFor(b)).toHaveLength(1);
  });
  it("C9 reschedule re-arms: a new schedule version gets its own reminders, the old keys are untouched and stale answers stop suppressing", async () => {
    const j = await liveJob(); await arm(j); await mode("live");
    must(await answer(j.engagementId, READY));
    await run(at(j, 47.5));
    expect(mailsFor(j)).toHaveLength(1);
    const newDate = day(9);
    must(await rescheduleAssignment({ requestId: j.requestId, user: asCurrent(SUPER), input: { startDate: newDate, endDate: newDate, callTime: "10:00", finishTime: "20:00", timezone: "", reason: "Client moved the event", notices: [{ informed: true, method: "phone", informedAtLocal: `${day(0)}T09:00`, note: "" }, { informed: false, method: "", informedAtLocal: "", note: "" }] } }));
    const v2Start = zonedToUtcMs(newDate, 10, 0, "Asia/Qatar");
    isolate(j);
    await run(v2Start - 47.5 * H);
    expect(by(j, "reminder_first").map((n) => n.schedule_version).sort()).toEqual([1, 2]);
    expect(mailsFor(j)).toHaveLength(2);
    await run(v2Start - 23.5 * H); // the earlier READY was for version 1, so it no longer suppresses the follow-up
    expect(by(j, "reminder_check").find((n) => n.schedule_version === 2)).toMatchObject({ status: "sent" });
    expect(mailsFor(j)).toHaveLength(3);
    await run(v2Start - 23.0 * H);
    expect(mailsFor(j)).toHaveLength(3);
  });
});

describe("D — sending failures, retry, stuck claims", () => {
  it("D1 a failed send is recorded and retried inside the window, then sent once; a thrown error never crashes the run", async () => {
    const j = await liveJob(); await arm(j); await mode("live");
    let calls = 0;
    const flaky: Mailer = async (p) => { calls++; if (calls === 1) return { ok: false, error: "provider 500", attempts: 3, permanent: false }; return okMailer(p); };
    const s1 = await run(at(j, 47.5), flaky);
    expect(s1.failed).toBe(1);
    expect(by(j, "reminder_first")[0]).toMatchObject({ status: "failed" });
    expect(sql(`select count(*) from public.assignment_notification_deliveries d join public.assignment_notifications n on n.id = d.notification_id where n.engagement_id = '${j.engagementId}' and d.stage = 'failed'`).trim()).toBe("1");
    const s2 = await run(at(j, 47.0), flaky);
    expect(s2.sent).toBe(1);
    expect(by(j, "reminder_first")[0]).toMatchObject({ status: "sent" });
    await run(at(j, 46.5), flaky);
    expect(mailsFor(j)).toHaveLength(1);
    const k = await liveJob({ daysAhead: 4 }); await arm(k);
    const boom: Mailer = async () => { throw new Error("network down"); };
    const s3 = await run(at(k, 47.5), boom);
    expect(s3.status).toBe("succeeded");
    expect(by(k, "reminder_first")[0]).toMatchObject({ status: "failed" });
  });
  it("D2 a send that keeps failing stops after the attempt limit; a stuck claim is never blindly resent and is surfaced", async () => {
    const j = await liveJob(); await arm(j); await mode("live");
    const bad: Mailer = async () => ({ ok: false, error: "rejected", attempts: 1, permanent: true });
    for (let i = 0; i < 6; i++) await run(at(j, 47.5 - i * 0.1), bad);
    expect(by(j, "reminder_first")[0].attempts).toBeLessThanOrEqual(3);
    const k = await liveJob({ daysAhead: 4 }); await arm(k);
    // simulate a crash between claim and record
    sql(`insert into public.assignment_notifications (readiness_id, engagement_id, schedule_version, kind, recipient_profile_id, recipient_role, condition_key, delivery_mode, status, due_at, triggered_by, updated_at)
         values ('${readinessId(k)}', '${k.engagementId}', 1, 'reminder_first', '${CREW1}', 'professional', '', 'live', 'claimed', now(), 'test', now() - interval '1 hour')`);
    await run(at(k, 47.5));
    expect(mailsFor(k)).toHaveLength(0); // outcome unknown: not resent
    expect((await getSchedulerStatus()).stuckClaims).toBeGreaterThan(0);
  });
});

describe("E — delivery tracking, bounces and address suppression", () => {
  const sig = (id: string, ts: string, body: string) => `v1,${createHmac("sha256", Buffer.from("e2e-webhook-secret-0123456789ab")).update(`${id}.${ts}.${body}`).digest("base64")}`;
  const post = (body: object, o: { id?: string; badSig?: boolean; ts?: string } = {}) => {
    const raw = JSON.stringify(body);
    const id = o.id ?? `evt_${Math.random().toString(36).slice(2)}`;
    const ts = o.ts ?? String(Math.floor(Date.now() / 1000));
    return webhookRoute.POST(new NextRequest("http://localhost/api/webhooks/resend-readiness", { method: "POST", body: raw, headers: { "svix-id": id, "svix-timestamp": ts, "svix-signature": o.badSig ? "v1,AAAA" : sig(id, ts, raw) } }));
  };
  const lastMessageId = (j: Job) => sql(`select d.provider_message_id from public.assignment_notification_deliveries d join public.assignment_notifications n on n.id = d.notification_id where n.engagement_id = '${j.engagementId}' and d.stage = 'provider_accepted' order by d.recorded_at desc limit 1`).trim();

  it("E1 signature is verified before anything is read: bad signature 401, stale timestamp 401, missing secret 503", async () => {
    const j = await liveJob(); await arm(j); await mode("live"); await run(at(j, 47.5));
    const ev = { type: "email.delivered", created_at: new Date().toISOString(), data: { email_id: lastMessageId(j) } };
    expect((await post(ev, { badSig: true })).status).toBe(401);
    expect((await post(ev, { ts: String(Math.floor(Date.now() / 1000) - 3600) })).status).toBe(401);
    expect(sql(`select count(*) from public.assignment_notification_deliveries where stage = 'delivered'`).trim()).toBe("0");
    const saved = process.env.RESEND_WEBHOOK_SECRET; delete process.env.RESEND_WEBHOOK_SECRET;
    expect((await post(ev)).status).toBe(503);
    process.env.RESEND_WEBHOOK_SECRET = saved;
  });
  it("E2 events are stored as stages: out of order is fine, replays are ignored, unknown messages and opens are acknowledged and discarded", async () => {
    const j = await liveJob(); await arm(j); await mode("live"); await run(at(j, 47.5));
    const id = lastMessageId(j);
    const ev = (type: string) => ({ type, created_at: new Date().toISOString(), data: { email_id: id } });
    expect(await (await post(ev("email.delivered"), { id: "evt_a" })).json()).toMatchObject({ outcome: "recorded" });
    expect(await (await post(ev("email.sent"), { id: "evt_b" })).json()).toMatchObject({ outcome: "recorded" }); // arrives after "delivered"
    expect(await (await post(ev("email.delivered"), { id: "evt_a" })).json()).toMatchObject({ outcome: "duplicate" });
    expect(await (await post(ev("email.opened"), { id: "evt_c" })).json()).toMatchObject({ outcome: "ignored" });
    expect((await post({ type: "email.delivered", data: { email_id: "someone-elses-email" } }, { id: "evt_d" })).status).toBe(200);
    const stages = sql(`select string_agg(d.stage, ',' order by d.stage) from public.assignment_notification_deliveries d join public.assignment_notifications n on n.id = d.notification_id where n.engagement_id = '${j.engagementId}'`).trim();
    expect(stages).toBe("attempted,delivered,provider_accepted,sent");
    expect((await getReadinessForAdmin(j.engagementId))!.notifications[0].stage).toBe("delivered"); // furthest stage; accepted is not delivered
  });
  it("E3 a bounce stops further reminders to that person until management clears it", async () => {
    const j = await liveJob(); await arm(j); await mode("live"); await run(at(j, 47.5));
    const id = lastMessageId(j);
    expect(await (await post({ type: "email.bounced", created_at: new Date().toISOString(), data: { email_id: id } })).json()).toMatchObject({ outcome: "recorded" });
    expect(sql(`select count(*) from public.assignment_notification_suppressions where profile_id = '${CREW1}' and cleared_at is null`).trim()).toBe("1");
    await run(at(j, 23.5));
    expect(by(j, "reminder_check")[0]).toMatchObject({ status: "skipped", skip_reason: "address_blocked" });
    expect(mailsFor(j)).toHaveLength(1);
    expect(mustFail(await clearSuppression({ user: asCurrent(ADMIN2), profileId: CREW1, reason: "address verified by phone" }))).toMatch(/Only authorised management/);
    expect(mustFail(await clearSuppression({ user: asCurrent(SUPER), profileId: CREW1, reason: "ok" }))).toMatch(/Say why/);
    must(await clearSuppression({ user: asCurrent(SUPER), profileId: CREW1, reason: "address verified by phone" }));
    const k = await liveJob({ daysAhead: 4 }); await arm(k);
    await run(at(k, 47.5));
    expect(mailsFor(k)).toHaveLength(1); // reminders can flow again
  });
  it("E4 the delivery log is append-only", () => {
    const err = (q: string) => { try { sql(q); return ""; } catch (e) { return String((e as { stderr?: Buffer }).stderr ?? e); } };
    expect(err("update public.assignment_notification_deliveries set stage = 'delivered'")).toMatch(/append-only/);
    expect(err("delete from public.assignment_notification_deliveries")).toMatch(/append-only/);
  });
});

describe("F — scheduler: authentication, triggers, single-flight, heartbeat", () => {
  const call = (method: "GET" | "POST", headers: Record<string, string> = {}) => (method === "GET" ? cronRoute.GET : cronRoute.POST)(new NextRequest("http://localhost/api/cron/readiness-reminders", { method, headers }));
  const SECRET = "e2e-lab-only-cron-secret-value-123456";
  it("F1 fails closed: no configured secret, no header, wrong header, weak secret are all 401 and run nothing", async () => {
    const before = sql("select count(*) from public.scheduler_runs").trim();
    delete process.env.CRON_SECRET;
    expect((await call("POST", { authorization: `Bearer ${SECRET}` })).status).toBe(401);
    process.env.CRON_SECRET = SECRET;
    expect((await call("POST")).status).toBe(401);
    expect((await call("POST", { authorization: "Bearer wrong" })).status).toBe(401);
    expect((await call("GET", { authorization: SECRET })).status).toBe(401);
    process.env.CRON_SECRET = "short";
    expect((await call("POST", { authorization: "Bearer short" })).status).toBe(401);
    process.env.CRON_SECRET = SECRET;
    expect(sql("select count(*) from public.scheduler_runs").trim()).toBe(before);
  });
  it("F2 the right bearer secret runs it; the trigger is recorded; the response carries counts only", async () => {
    process.env.CRON_SECRET = SECRET;
    await mode("test");
    const r = await call("POST", { authorization: `Bearer ${SECRET}`, "x-scheduler-trigger": "github" });
    expect(r.status).toBe(200);
    const body = await r.json();
    expect(Object.keys(body).sort()).toEqual(["blocked", "examined", "failed", "lateSkipped", "mode", "ok", "sent", "skipped", "status", "trigger"]);
    expect(body.trigger).toBe("github");
    expect(sql("select trigger from public.scheduler_runs order by started_at desc limit 1").trim()).toBe("github");
    const v = await call("GET", { authorization: `Bearer ${SECRET}`, "user-agent": "vercel-cron/1.0" });
    expect(v.status).toBe(200);
    expect(sql("select trigger from public.scheduler_runs order by started_at desc limit 1").trim()).toBe("vercel");
    const m = await call("POST", { authorization: `Bearer ${SECRET}` });
    expect(sql("select trigger from public.scheduler_runs order by started_at desc limit 1").trim()).toBe("manual");
    expect(m.status).toBe(200);
  });
  it("F3 single flight: while another run holds the lock this one does nothing and says so", async () => {
    const j = await liveJob(); await arm(j); await mode("live");
    sql("update public.scheduler_lock set holder = 'someone-else', locked_until = now() + interval '3 minutes'");
    const s = await run(at(j, 47.5));
    expect(s.status).toBe("skipped_locked");
    expect(mailsFor(j)).toHaveLength(0);
    expect(sql("select count(*) from public.scheduler_runs where status = 'skipped_locked'").trim()).not.toBe("0");
    sql("update public.scheduler_lock set holder = null, locked_until = null");
    expect((await run(at(j, 47.5))).sent).toBe(1);
  });
  it("F4 heartbeat: healthy after a success, an alarm when the last success is too old or has never happened", async () => {
    await mode("live");
    const j = await liveJob(); await arm(j);
    await run(at(j, 60));
    expect((await getSchedulerStatus()).health.state).toBe("ok");
    sql("update public.scheduler_runs set finished_at = now() - interval '5 hours', started_at = now() - interval '5 hours'");
    expect((await getSchedulerStatus()).health.state).toBe("stale");
    sql("delete from public.scheduler_runs");
    expect((await getSchedulerStatus()).health.state).toBe("never_run");
    await mode("off");
    expect((await getSchedulerStatus()).health.state).toBe("not_applicable");
  });
});

describe("G — access, audit and isolation", () => {
  it("G1 a professional, a client and a signed-out visitor cannot read notifications, deliveries or runs; administrators can", async () => {
    const tables = ["assignment_notifications", "assignment_notification_deliveries", "assignment_notification_suppressions", "scheduler_runs"];
    for (const t of tables) {
      const adminRead = await asUserDb(SUPER).from(t).select("id").limit(1);
      expect(adminRead.error, t).toBeNull();
      for (const u of [CREW1, CLIENT]) {
        const r = await asUserDb(u).from(t).select("id").limit(5);
        expect((r.data ?? []).length, `${t} as ${u}`).toBe(0);
      }
      const anon = await createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, readFileSync("/tmp/e2e_anon_jwt", "utf8").trim(), { auth: { persistSession: false }, global: { fetch: h.fetch } }).from(t).select("id").limit(1);
      expect((anon.data ?? []).length).toBe(0);
    }
    for (const u of [CREW1, SUPER]) {
      const w = await asUserDb(u).from("assignment_notifications").insert({ readiness_id: "00000000-0000-4000-8000-000000000000", engagement_id: "00000000-0000-4000-8000-000000000000", schedule_version: 1, kind: "reminder_first", recipient_role: "professional", delivery_mode: "live", status: "skipped", skip_reason: "x", due_at: new Date().toISOString(), triggered_by: "test" });
      expect(w.error, `write as ${u} must be refused`).not.toBeNull();
    }
  });
  it("G2 nothing a run does changes the assignment, request, engagement, enquiry, payments or payables", async () => {
    const j = await liveJob(); await arm(j); await mode("live");
    const before = pristine(j);
    const payables = sql("select count(*) || ':' || coalesce(sum(amount), 0) from public.payment_obligations");
    for (const hrs of [60, 47.5, 30, 23.5, 12, 11.5, 5]) await run(at(j, hrs));
    expect(pristine(j)).toBe(before);
    expect(sql("select count(*) || ':' || coalesce(sum(amount), 0) from public.payment_obligations")).toBe(payables);
  });
  it("G3 every mode change and manual action is audited with its actor", async () => {
    expect(await count("activity_log", { action: "assignment_readiness.area_label_set" })).toBeGreaterThan(0);
    expect(await count("activity_log", { action: "assignment_readiness.address_suppression_cleared" })).toBe(1);
    expect(await count("activity_log", { action: "assignment_readiness.address_suppressed" })).toBeGreaterThan(0);
    expect(sql("select count(*) from public.activity_log where action = 'assignment_readiness.reminders_mode_changed' and actor_user_id is null").trim()).toBe("0");
  });
});
