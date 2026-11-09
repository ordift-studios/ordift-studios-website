// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

// Proof upload (POST): one winner per payment, no orphaned files, no duplicate "submitted" audit entry. In-memory payments table and storage. Synthetic data.
type Row = Record<string, unknown>;
const h = vi.hoisted(() => ({ rows: [] as Row[], files: new Set<string>(), audit: [] as Row[], raceStatus: null as null | string, failClaim: false, failRemove: false }));
vi.mock("@/lib/portal/roles", () => ({ getCurrentUser: async () => ({ id: "client-1", email: "c@e2e.test", roles: ["client"] }), isStaffOrAdmin: () => false }));
vi.mock("@/lib/admin/activityLog", () => ({ logActivityAsSystem: async (a: Row) => { h.audit.push(a); } }));
vi.mock("@/lib/shared/fileContentSniff", () => ({ detectFileMimeType: async () => "image/png" }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({}) }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({
  storage: { from: () => ({ upload: async (path: string) => { h.files.add(path); return { error: null }; }, remove: async (paths: string[]) => { if (h.failRemove) return { error: { message: "nope" } }; paths.forEach((p) => h.files.delete(p)); return { error: null }; } }) },
  from: (table: string) => {
    const f: ((r: Row) => boolean)[] = []; let mode = "select"; let payload: Row = {}; let want = false;
    const run = () => {
      if (table !== "payments") return { data: null, error: null };
      const m = h.rows.filter((r) => f.every((p) => p(r)));
      if (mode === "update") {
        if (h.failClaim) return { data: null, error: { message: "boom" } };
        if (h.raceStatus) { m.forEach((r) => { r.status = h.raceStatus; }); h.raceStatus = null; return { data: null, error: null }; }   // someone else got there first
        m.forEach((r) => Object.assign(r, payload)); return { data: want ? m[0] ?? null : null, error: null };
      }
      return { data: m[0] ?? null, error: null };
    };
    const q: Record<string, unknown> = {
      select: () => { want = true; return q; }, update: (v: Row) => { mode = "update"; payload = v; return q; },
      eq: (c: string, v: unknown) => { f.push((r) => r[c] === v); return q; }, in: (c: string, v: unknown[]) => { f.push((r) => v.includes(r[c])); return q; },
      maybeSingle: async () => run(), single: async () => run(), then: (res: (v: unknown) => unknown) => Promise.resolve(run()).then(res),
    };
    return q;
  } }) }));
import { NextRequest } from "next/server";
import { POST } from "./route";

const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");
const upload = async (extra: Record<string, string> = {}) => {
  const form = new FormData(); form.append("file", new File([new Uint8Array(PNG)], "r.png", { type: "image/png" })); form.append("paymentId", "p1"); for (const [k, v] of Object.entries(extra)) form.append(k, v);
  const res = await POST(new NextRequest("http://localhost/api/payments/bank-transfer/proof", { method: "POST", body: form })); return { status: res.status, body: (await res.json()) as Record<string, unknown> };
};
beforeEach(() => { h.rows = [{ id: "p1", user_id: "client-1", status: "pending", payment_method: "bank_transfer" }]; h.files = new Set(); h.audit = []; h.raceStatus = null; h.failClaim = false; h.failRemove = false; });

describe("proof upload", () => {
  it("records the proof, moves the payment to awaiting verification, keeps the file and audits once", async () => {
    const r = await upload({ bankReference: "TRX-1" }); expect(r.status).toBe(200);
    expect(h.rows[0]).toMatchObject({ status: "awaiting_verification", client_bank_reference: "TRX-1" }); expect(h.files.size).toBe(1);
    expect(h.audit.map((a) => a.action)).toEqual(["payment.bank_transfer_submitted"]);
  });
  it("a second upload after the first is refused (the payment is no longer open) and stores nothing", async () => {
    await upload(); const r = await upload(); expect(r.status).toBe(409); expect(h.files.size).toBe(1);
  });
  it("when another upload wins in the gap between the status check and the claim, the loser is refused, its file is removed, the removal is audited, and no 'submitted' entry is written for it", async () => {
    h.raceStatus = "awaiting_verification"; const r = await upload();
    expect(r.status).toBe(409); expect(r.body.error).toBe("payment-not-open-for-submission"); expect(h.files.size).toBe(0);
    expect(h.audit.map((a) => a.action)).toEqual(["payment.proof_upload_discarded"]); expect(h.audit[0].metadata).toMatchObject({ reason: "payment_no_longer_open", removed: true });
    expect(h.rows[0].proof_of_payment_asset_path).toBeUndefined();
  });
  it("when the database fails while recording the proof, the file is removed, the client is told it failed, nothing is marked submitted", async () => {
    h.failClaim = true; const r = await upload(); expect(r.status).toBe(500); expect(r.body.error).toBe("failed-to-record-proof"); expect(h.files.size).toBe(0); expect(h.rows[0].status).toBe("pending");
    expect(h.audit.map((a) => a.action)).toEqual(["payment.proof_upload_discarded"]);
  });
  it("if the unreferenced file cannot be removed, that is audited as not removed (so it can be cleaned up) and the answer is unchanged", async () => {
    h.raceStatus = "awaiting_verification"; h.failRemove = true; const r = await upload(); expect(r.status).toBe(409); expect(h.audit[0].metadata).toMatchObject({ removed: false, reason: "payment_no_longer_open" }); expect(h.files.size).toBe(1);
  });
  it("a card number in the note or bank reference is refused before anything is stored", async () => {
    const r = await upload({ referenceNote: "card 4111 1111 1111 1111" }); expect(r.status).toBe(422); expect(h.files.size).toBe(0); expect(h.rows[0].status).toBe("pending");
  });
  it("a different client's payment is not found", async () => { h.rows[0].user_id = "someone-else"; const r = await upload(); expect(r.status).toBe(404); expect(h.files.size).toBe(0); });
});
