import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// Route-level authentication checks for the two scheduler endpoints. Every dependency that could touch a database,
// the CMS or an email provider is mocked, so these tests run nothing real and can show exactly what each credential
// reaches: the readiness endpoint takes READINESS_SCHEDULER_SECRET (GitHub) and CRON_SECRET (Vercel's own sweep);
// the Pulse endpoint takes CRON_SECRET only and must be unaffected by the new secret.
const run = vi.fn();
const listSources = vi.fn();
vi.mock("@/lib/crewSupport/readinessReminders", () => ({ runReadinessReminders: (...a: unknown[]) => run(...a) }));
vi.mock("@/lib/pulse/ingestion", () => ({ listActiveSourceIds: (...a: unknown[]) => listSources(...a), runDiscoveryForSource: vi.fn() }));
vi.mock("@/lib/admin/activityLog", () => ({ logActivityAsSystem: vi.fn() }));
vi.mock("@/sanity/lib/client", () => ({ editorialClient: {} }));

const CRON = "pulse-and-vercel-cron-lab-secret-aaaa";
const DEDICATED = "readiness-dedicated-lab-secret-bbbb";
const url = "http://localhost/api/cron/readiness-reminders";
const req = (headers: Record<string, string> = {}, method = "POST") => new NextRequest(url, { method, headers });
const summary = { status: "succeeded", mode: "off", trigger: "github", examined: 0, sent: 0, skipped: 0, lateSkipped: 0, failed: 0, blocked: 0 };

let readiness: typeof import("./route");
let pulse: typeof import("../pulse-discovery/route");
const saved = { c: process.env.CRON_SECRET, d: process.env.READINESS_SCHEDULER_SECRET };
beforeEach(async () => {
  run.mockReset(); run.mockResolvedValue(summary);
  listSources.mockReset(); listSources.mockResolvedValue([]);
  process.env.CRON_SECRET = CRON; process.env.READINESS_SCHEDULER_SECRET = DEDICATED;
  readiness = await import("./route"); pulse = await import("../pulse-discovery/route");
});
afterEach(() => {
  if (saved.c === undefined) delete process.env.CRON_SECRET; else process.env.CRON_SECRET = saved.c;
  if (saved.d === undefined) delete process.env.READINESS_SCHEDULER_SECRET; else process.env.READINESS_SCHEDULER_SECRET = saved.d;
});

describe("readiness endpoint credentials", () => {
  it("accepts the dedicated secret from GitHub and records trigger github", async () => {
    const r = await readiness.POST(req({ authorization: `Bearer ${DEDICATED}`, "x-scheduler-trigger": "github" }));
    expect(r.status).toBe(200);
    expect(run).toHaveBeenCalledWith({ trigger: "github" });
  });
  it("accepts Vercel's own CRON_SECRET request (user agent vercel-cron) and records trigger vercel — the endpoint does not reject its own scheduled sweep", async () => {
    const r = await readiness.GET(req({ authorization: `Bearer ${CRON}`, "user-agent": "vercel-cron/1.0" }, "GET"));
    expect(r.status).toBe(200);
    expect(run).toHaveBeenCalledWith({ trigger: "vercel" });
  });
  it("keeps working exactly as today when the dedicated secret is not configured yet (CRON_SECRET only)", async () => {
    delete process.env.READINESS_SCHEDULER_SECRET;
    expect((await readiness.GET(req({ authorization: `Bearer ${CRON}`, "user-agent": "vercel-cron/1.0" }, "GET"))).status).toBe(200);
    expect((await readiness.POST(req({ authorization: `Bearer ${DEDICATED}` }))).status).toBe(401);
  });
  it("refuses everything else and runs nothing", async () => {
    for (const headers of [{} as Record<string, string>, { authorization: "Bearer nope" }, { authorization: DEDICATED }, { authorization: `Bearer ${DEDICATED}x` }, { authorization: "Bearer " }]) {
      expect((await readiness.POST(req(headers))).status).toBe(401);
    }
    delete process.env.CRON_SECRET; delete process.env.READINESS_SCHEDULER_SECRET;
    expect((await readiness.POST(req({ authorization: `Bearer ${DEDICATED}` }))).status).toBe(401);
    expect(run).not.toHaveBeenCalled();
  });
  it("never puts either secret in a response", async () => {
    const ok = JSON.stringify(await (await readiness.POST(req({ authorization: `Bearer ${DEDICATED}` }))).json());
    const bad = JSON.stringify(await (await readiness.POST(req({ authorization: "Bearer nope" }))).json());
    for (const text of [ok, bad]) { expect(text).not.toContain(DEDICATED); expect(text).not.toContain(CRON); }
  });
});

describe("Pulse endpoint is unchanged by the dedicated secret", () => {
  const pulseReq = (h: Record<string, string>) => new NextRequest("http://localhost/api/cron/pulse-discovery", { headers: h });
  it("still accepts CRON_SECRET and still reads its sources", async () => {
    expect((await pulse.GET(pulseReq({ authorization: `Bearer ${CRON}` }))).status).toBe(200);
    expect(listSources).toHaveBeenCalledTimes(1);
  });
  it("refuses the readiness secret — it grants nothing on Pulse", async () => {
    expect((await pulse.GET(pulseReq({ authorization: `Bearer ${DEDICATED}` }))).status).toBe(401);
    expect(listSources).not.toHaveBeenCalled();
  });
  it("is still closed when CRON_SECRET is unset, even with the dedicated secret present", async () => {
    delete process.env.CRON_SECRET;
    expect((await pulse.GET(pulseReq({ authorization: `Bearer ${DEDICATED}` }))).status).toBe(401);
    expect(listSources).not.toHaveBeenCalled();
  });
});
