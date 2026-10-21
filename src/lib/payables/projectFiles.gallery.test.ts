import { beforeEach, describe, expect, it, vi } from "vitest";

type Row = Record<string, unknown>;
const db: Record<string, Row[]> = {};
const signCalls: { bucket: string; paths: string[]; ttl: number }[] = [];
const updates: { id: unknown; patch: Row }[] = [];

function client() {
  return {
    from(table: string) {
      const filters: ((r: Row) => boolean)[] = [];
      let patch: Row | null = null;
      const rows = () => (db[table] ?? []).filter((r) => filters.every((f) => f(r)));
      const b: Record<string, unknown> = {
        select: () => b,
        eq: (c: string, v: unknown) => { filters.push((r) => r[c] === v); return b; },
        neq: (c: string, v: unknown) => { filters.push((r) => r[c] !== v); return b; },
        in: (c: string, vals: unknown[]) => { filters.push((r) => vals.includes(r[c])); return b; },
        is: (c: string, v: unknown) => { filters.push((r) => (v === null ? r[c] == null : r[c] === v)); return b; },
        update: (p: Row) => { patch = p; return b; },
        maybeSingle: () => Promise.resolve({ data: rows()[0] ?? null, error: null }),
        then: (ok: (v: unknown) => unknown, bad?: (e: unknown) => unknown) => {
          const hit = rows();
          if (patch) { for (const r of hit) { Object.assign(r, patch); updates.push({ id: r.id, patch: patch! }); } return Promise.resolve({ data: hit.map((r) => ({ id: r.id, engagement_id: r.engagement_id })), error: null }).then(ok, bad); }
          return Promise.resolve({ data: hit, error: null }).then(ok, bad);
        },
      };
      return b;
    },
    storage: {
      from: (bucket: string) => ({
        createSignedUrls: async (paths: string[], ttl: number) => {
          signCalls.push({ bucket, paths, ttl });
          return { data: paths.map((path) => ({ path, signedUrl: `https://signed.example/${path}?t=1`, error: null })), error: null };
        },
      }),
    },
  };
}

const mocks = vi.hoisted(() => ({
  authorize: vi.fn(async (userId: string) => (userId === "admin" ? { ok: true as const, actedAsOverride: false } : { ok: false as const })),
  logActivity: vi.fn(async () => undefined),
}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => client() }));
vi.mock("@/lib/admin/activityLog", () => ({ logActivity: mocks.logActivity }));
vi.mock("@/lib/organization/authority", () => ({ authorizeWithSuperAdminOverride: mocks.authorize, FINANCE_CAPABILITIES: { payeeAdminister: "finance.payee.administer" } }));
vi.mock("@/lib/crewSupport/crewOffers", () => ({ getCrewAssignmentForEngagement: vi.fn(async () => null) }));

import { applyRetentionToFiles, getProjectFilePreviewUrls, PREVIEW_URL_TTL_SECONDS } from "@/lib/payables/projectFiles";

beforeEach(() => {
  for (const k of Object.keys(db)) delete db[k];
  signCalls.length = 0;
  updates.length = 0;
  mocks.logActivity.mockClear();
  db.engagements = [{ id: "e1", payee_profile_id: "photographer", status: "engagement_active" }, { id: "e2", payee_profile_id: "someone-else", status: "engagement_active" }];
  db.project_files = [
    { id: "f1", engagement_id: "e1", storage_bucket: "project-media", storage_path: "e1/f1.jpeg", purged_at: null, file_kind: "deliverable", lifecycle_state: "active", retain: false, original_filename: "f1.jpeg", client_title: null },
    { id: "f2", engagement_id: "e1", storage_bucket: "project-media", storage_path: "e1/f2.jpeg", purged_at: null, file_kind: "deliverable", lifecycle_state: "active", retain: false, original_filename: "f2.jpeg", client_title: null },
    { id: "gone", engagement_id: "e1", storage_bucket: "project-media", storage_path: "e1/gone.jpeg", purged_at: "2026-10-01", file_kind: "deliverable", lifecycle_state: "purged", retain: false, original_filename: "gone.jpeg", client_title: null },
    { id: "raw", engagement_id: "e1", storage_bucket: "project-media", storage_path: "e1/raw.cr3", purged_at: null, file_kind: "source_raw", lifecycle_state: "active", retain: false, original_filename: "raw.cr3", client_title: null },
    { id: "fin", engagement_id: "e1", storage_bucket: "project-media", storage_path: "e1/fin.jpeg", purged_at: null, file_kind: "final_approved", lifecycle_state: "active", retain: false, original_filename: "fin.jpeg", client_title: null },
    { id: "other", engagement_id: "e2", storage_bucket: "project-media", storage_path: "e2/other.jpeg", purged_at: null, file_kind: "deliverable", lifecycle_state: "active", retain: false, original_filename: "other.jpeg", client_title: null },
  ];
});

describe("getProjectFilePreviewUrls — private files, short-lived links, one signing call", () => {
  it("signs several files in ONE storage call with the short TTL", async () => {
    const r = await getProjectFilePreviewUrls(["f1", "f2"], "admin");
    expect(r.ok && Object.keys(r.urls)).toEqual(["f1", "f2"]);
    expect(signCalls).toHaveLength(1);
    expect(signCalls[0].ttl).toBe(PREVIEW_URL_TTL_SECONDS);
    expect(PREVIEW_URL_TTL_SECONDS).toBeLessThanOrEqual(900);
    expect(signCalls[0].paths).toEqual(["e1/f1.jpeg", "e1/f2.jpeg"]);
  });
  it("lets the assigned professional preview their own engagement's files", async () => {
    const r = await getProjectFilePreviewUrls(["f1"], "photographer");
    expect(r.ok && "url" in r.urls.f1).toBe(true);
  });
  it("refuses everyone else, per engagement, and signs nothing for them", async () => {
    const r = await getProjectFilePreviewUrls(["f1", "other"], "random-user");
    expect(r.ok && r.urls.f1).toEqual({ error: "Not authorized to view this file." });
    expect(r.ok && r.urls.other).toEqual({ error: "Not authorized to view this file." });
    expect(signCalls).toHaveLength(0);
  });
  it("never signs a purged file and reports unknown ids", async () => {
    const r = await getProjectFilePreviewUrls(["gone", "nope"], "admin");
    expect(r.ok && r.urls.gone).toEqual({ error: "This file has been purged." });
    expect(r.ok && r.urls.nope).toEqual({ error: "File not found." });
    expect(signCalls).toHaveLength(0);
  });
  it("caps a batch and de-duplicates ids", async () => {
    const many = Array.from({ length: 100 }, (_, i) => `x${i}`);
    const r = await getProjectFilePreviewUrls([...many, "f1", "f1"], "admin");
    expect(r.ok && Object.keys(r.urls).length).toBeLessThanOrEqual(60);
  });
  it("returns no raw storage path or bucket to the browser", async () => {
    const r = await getProjectFilePreviewUrls(["f1"], "admin");
    const text = JSON.stringify(r);
    expect(text).not.toContain("storage_path");
    expect(text).toContain("https://signed.example/");
  });
});

describe("applyRetentionToFiles — retention only, one honest outcome per file", () => {
  it("requires an explicit attestation to confirm a backup and writes nothing without it", async () => {
    const r = await applyRetentionToFiles({ op: "confirm_backup", fileIds: ["f1"], actorUserId: "admin" });
    expect(r.ok).toBe(false);
    expect(updates).toHaveLength(0);
  });
  it("confirms the backup only for eligible files and says why the others were skipped", async () => {
    const r = await applyRetentionToFiles({ op: "confirm_backup", fileIds: ["f1", "fin", "gone", "missing"], attestedBackup: true, actorUserId: "admin" });
    if (!r.ok) throw new Error("expected ok");
    expect(r.outcomes.map((o) => [o.fileId, o.ok])).toEqual([["f1", true], ["fin", false], ["gone", false], ["missing", false]]);
    expect(db.project_files.find((x) => x.id === "f1")?.lifecycle_state).toBe("backup_confirmed");
    expect(db.project_files.find((x) => x.id === "fin")?.lifecycle_state).toBe("active");
  });
  it("final-version only touches deliverables and never changes the client release status", async () => {
    const r = await applyRetentionToFiles({ op: "final_approved", fileIds: ["f2", "raw"], actorUserId: "admin" });
    if (!r.ok) throw new Error("expected ok");
    expect(r.outcomes.map((o) => [o.fileId, o.ok])).toEqual([["f2", true], ["raw", false]]);
    expect(db.project_files.find((x) => x.id === "f2")?.file_kind).toBe("final_approved");
    expect(updates.every((u) => !("release_status" in u.patch))).toBe(true);
  });
  it("retain toggles only the retain flag", async () => {
    const r = await applyRetentionToFiles({ op: "retain", fileIds: ["f1"], actorUserId: "admin" });
    expect(r.ok && r.outcomes[0].ok).toBe(true);
    expect(updates.map((u) => Object.keys(u.patch))).toEqual([["retain", "retain_until"]]);
  });
  it("refuses anyone without payee-administration authority", async () => {
    const r = await applyRetentionToFiles({ op: "retain", fileIds: ["f1"], actorUserId: "random-user" });
    expect(r.ok).toBe(false);
    expect(updates).toHaveLength(0);
  });
});
