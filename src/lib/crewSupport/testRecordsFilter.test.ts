import { beforeEach, describe, expect, it, vi } from "vitest";

type Call = { table: string; eq: [string, unknown][]; head: boolean };
const h = vi.hoisted(() => ({ calls: [] as { table: string; eq: [string, unknown][]; head: boolean }[], rows: [] as Record<string, unknown>[], count: 2 }));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      const call: Call = { table, eq: [], head: false };
      h.calls.push(call);
      const b: Record<string, unknown> = {
        select: (_cols: string, opts?: { head?: boolean }) => { call.head = Boolean(opts?.head); return b; },
        order: () => b,
        limit: () => b,
        in: () => Promise.resolve({ data: [], error: null }),
        eq: (c: string, v: unknown) => { call.eq.push([c, v]); return b; },
        then: (ok: (v: unknown) => unknown) => Promise.resolve(call.head ? { count: h.count, error: null } : { data: h.rows.filter((r) => call.eq.every(([c, v]) => r[c] === v)), error: null }).then(ok),
      };
      return b;
    },
  }),
}));

import { countHiddenTestRequests, listCrewSupportRequests } from "./admin";

const row = (id: string, isTest: boolean) => ({ id, reference_number: `CSR-${id}`, status: "in_production", is_test: isTest, requester_name: "x", service_family: "photography", project_name: "p", start_date: "2026-10-12", end_date: "2026-10-12", location: "l", urgency: "standard", submitted_at: "2026-10-07T00:00:00Z" });

beforeEach(() => { h.calls = []; h.rows = [row("live", false), row("qa1", true), row("qa3", true)]; });

describe("Crew Support requests list hides QA/test records by default (nothing is deleted)", () => {
  it("the ordinary list excludes is_test requests", async () => {
    const list = await listCrewSupportRequests();
    expect(list.map((r) => r.referenceNumber)).toEqual(["CSR-live"]);
    expect(h.calls[0].eq).toContainEqual(["is_test", false]);
  });
  it("includes them only when explicitly asked", async () => {
    const list = await listCrewSupportRequests(undefined, { includeTest: true });
    expect(list.map((r) => r.referenceNumber).sort()).toEqual(["CSR-live", "CSR-qa1", "CSR-qa3"]);
    expect(h.calls[0].eq.some(([c]) => c === "is_test")).toBe(false);
  });
  it("keeps the status filter alongside the test filter", async () => {
    await listCrewSupportRequests("in_production");
    expect(h.calls[0].eq).toEqual(expect.arrayContaining([["status", "in_production"], ["is_test", false]]));
  });
  it("says how many test records are hidden, counting only test records (read-only head query)", async () => {
    expect(await countHiddenTestRequests()).toBe(2);
    const c = h.calls[h.calls.length - 1];
    expect(c.head).toBe(true);
    expect(c.eq).toContainEqual(["is_test", true]);
  });
  it("performs no writes anywhere in this module path", async () => {
    const src = (await import("node:fs")).readFileSync(new URL("./admin.ts", import.meta.url), "utf8");
    const listFn = src.slice(src.indexOf("export async function countHiddenTestRequests"), src.indexOf("export async function listCrewSupportRequests") + 1200);
    for (const verb of [".delete(", ".update(", ".insert(", ".upsert("]) expect(listFn).not.toContain(verb);
  });
});
