// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

// Sign-in linking must never claim a STAFF-recorded enquiry by its email. Synthetic data: an in-memory enquiries table with the same filters the real query uses.
type Row = Record<string, unknown>;
const h = vi.hoisted(() => ({ rows: [] as Row[] }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ from: (table: string) => {
  const f: ((r: Row) => boolean)[] = []; let payload: Row = {};
  const run = () => { if (table !== "enquiries") return { data: [], error: null }; const m = h.rows.filter((r) => f.every((p) => p(r))); m.forEach((r) => Object.assign(r, payload)); return { data: m, error: null }; };
  const q: Record<string, unknown> = {
    update: (v: Row) => { payload = v; return q; }, select: () => q, upsert: () => q, single: async () => ({ data: null, error: null }),
    is: (c: string, v: unknown) => { f.push((r) => (r[c] ?? null) === v); return q; }, ilike: (c: string, v: string) => { f.push((r) => String(r[c] ?? "").toLowerCase() === v.toLowerCase()); return q; },
    then: (res: (v: unknown) => unknown) => Promise.resolve(run()).then(res),
  };
  return q;
} }) }));
import { linkGuestRecordsToAccount } from "./accountLinking";

beforeEach(() => { h.rows = [
  { id: "web", email: "ama@example.test", user_id: null, created_by: null },
  { id: "staff-whatsapp", email: "ama@example.test", user_id: null, created_by: "staff-1" },
  { id: "owned", email: "ama@example.test", user_id: "someone-else", created_by: null },
  { id: "other-email", email: "kofi@example.test", user_id: null, created_by: null },
]; });

describe("linkGuestRecordsToAccount", () => {
  it("links a website-form enquiry with the same email, and nothing else", async () => {
    await linkGuestRecordsToAccount("client-1", "AMA@example.test");
    expect(h.rows.find((r) => r.id === "web")?.user_id).toBe("client-1");
    expect(h.rows.find((r) => r.id === "staff-whatsapp")?.user_id).toBeNull();        // a staff-recorded enquiry is NOT claimed by its email: it needs the invitation and code
    expect(h.rows.find((r) => r.id === "owned")?.user_id).toBe("someone-else");
    expect(h.rows.find((r) => r.id === "other-email")?.user_id).toBeNull();
  });
  it("does nothing for a placeholder (no-email) address", async () => { await linkGuestRecordsToAccount("client-1", "enq-2026-000010@no-email.invalid"); expect(h.rows.filter((r) => r.user_id === "client-1")).toHaveLength(0); });
});
