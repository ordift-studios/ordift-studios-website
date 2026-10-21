import { beforeEach, describe, expect, it, vi } from "vitest";

// ORDIFT-POL-FSR-001 application layer, run against an in-memory database double. The double does NOT execute the
// database triggers (no PostgreSQL engine is involved): these tests prove what the application checks, what it writes,
// in what order, and how it reports database refusals. Database enforcement is covered separately (structural tests of
// migration 0169) and still needs a real-engine rehearsal.

type Row = Record<string, unknown>;
const db: Record<string, Row[]> = {};
const calls: string[] = [];
const rpcCalls: { fn: string; args: Row }[] = [];
const tableErrors: Record<string, { code: string; message: string }> = {};
const insertErrors: Record<string, { code?: string; message: string }> = {};
const rpcErrors: Record<string, Record<string, string>> = {}; // fn -> fileId -> message
let signFails = false;
let idSeq = 0;

function client() {
  return {
    from(table: string) {
      const filters: ((r: Row) => boolean)[] = [];
      let inserted: Row[] | null = null;
      let patch: Row | null = null;
      const rows = () => (db[table] ?? []).filter((r) => filters.every((f) => f(r)));
      const b: Record<string, unknown> = {
        select: () => b,
        eq: (c: string, v: unknown) => { filters.push((r) => r[c] === v); return b; },
        is: (c: string, v: unknown) => { filters.push((r) => (v === null ? r[c] == null : r[c] === v)); return b; },
        gt: (c: string, v: unknown) => { filters.push((r) => String(r[c]) > String(v)); return b; },
        in: (c: string, vals: unknown[]) => { filters.push((r) => vals.includes(r[c])); return b; },
        limit: () => b,
        insert: (payload: Row | Row[]) => {
          calls.push(`insert:${table}`);
          if (insertErrors[table]) return Object.assign(Promise.resolve({ data: null, error: insertErrors[table] }), { select: () => ({ single: () => Promise.resolve({ data: null, error: insertErrors[table] }) }) });
          const list = (Array.isArray(payload) ? payload : [payload]).map((p) => ({ id: `id-${++idSeq}`, selection_hash: "db-computed-hash", ...p }));
          db[table] = [...(db[table] ?? []), ...list];
          inserted = list;
          b.__inserted = list;
          return b;
        },
        update: (p: Row) => { patch = p; calls.push(`update:${table}`); return b; },
        single: () => Promise.resolve({ data: inserted?.[0] ?? rows()[0] ?? null, error: null }),
        maybeSingle: () => Promise.resolve(tableErrors[table] ? { data: null, error: tableErrors[table] } : { data: rows()[0] ?? null, error: null }),
        then: (ok: (v: unknown) => unknown, bad?: (e: unknown) => unknown) => {
          if (tableErrors[table]) return Promise.resolve({ data: null, error: tableErrors[table] }).then(ok, bad);
          if (patch) { for (const r of rows()) Object.assign(r, patch); return Promise.resolve({ data: null, error: null }).then(ok, bad); }
          if (inserted) return Promise.resolve({ data: inserted, error: null }).then(ok, bad);
          return Promise.resolve({ data: rows(), error: null }).then(ok, bad);
        },
      };
      return b;
    },
    rpc: async (fn: string, args: Row) => {
      rpcCalls.push({ fn, args });
      calls.push(`rpc:${fn}`);
      const err = rpcErrors[fn]?.[args.p_file as string];
      return err ? { data: null, error: { message: `ERROR: fsr: ${err}` } } : { data: fn === "fsr_apply_review" ? "applied" : null, error: null };
    },
    storage: { from: () => ({ createSignedUrl: async (path: string) => { calls.push("sign"); return signFails ? { data: null, error: { message: "x" } } : { data: { signedUrl: `https://signed.example/${path}` }, error: null }; } }) },
  };
}

const mocks = vi.hoisted(() => ({
  logActivityAsSystem: vi.fn(async (_e: { action: string; metadata?: Record<string, unknown> }) => undefined), // eslint-disable-line @typescript-eslint/no-unused-vars
  releaseApprovedFiles: vi.fn(),
  sendFilesReadyEmail: vi.fn(async () => ({ ok: true })),
}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => client() }));
vi.mock("@/lib/admin/activityLog", () => ({ logActivityAsSystem: mocks.logActivityAsSystem }));
vi.mock("@/lib/enquiry/lifecycleEmails", () => ({ sendFilesReadyEmail: mocks.sendFilesReadyEmail }));
vi.mock("./fileReleaseFlow", async () => {
  const actual = await vi.importActual<typeof import("./fileReleaseFlow")>("./fileReleaseFlow");
  return { ...actual, releaseApprovedFiles: mocks.releaseApprovedFiles };
});

import { closeFounderException, declareAndApplyReview, declareAndRelease, getFounderContext, issueViewerUrl, openFounderException } from "./founderSelfReview";
import { FSR_CONFLICT_ACKNOWLEDGEMENT } from "./founderSelfReviewRules";

const FOUNDER = "founder-profile";
const SECOND = "second-login";
const OTHER_ADMIN = "another-super-admin";
const ENG = "eng-1";
const user = (id: string) => ({ id }) as never;
const GOOD = "I am the sole photographer on this job and no independent reviewer is appointed.";

function file(id: string, over: Row = {}): Row {
  return { id, engagement_id: ENG, file_kind: "deliverable", release_status: "submitted", purged_at: null, version: 1, size_bytes: 1000, storage_bucket: "project-media", storage_path: `${ENG}/${id}.jpeg`, original_filename: `${id}.jpeg`, release_category: "final_gallery", client_title: `Title ${id}`, mime_type: "image/jpeg", release_review_note: null, ...over };
}
const FUTURE = new Date(Date.now() + 3 * 86400_000).toISOString();

beforeEach(() => {
  for (const k of Object.keys(db)) delete db[k];
  for (const k of Object.keys(tableErrors)) delete tableErrors[k];
  for (const k of Object.keys(insertErrors)) delete insertErrors[k];
  for (const k of Object.keys(rpcErrors)) delete rpcErrors[k];
  calls.length = 0; rpcCalls.length = 0; signFails = false; idSeq = 0;
  mocks.logActivityAsSystem.mockClear(); mocks.releaseApprovedFiles.mockReset(); mocks.sendFilesReadyEmail.mockClear();
  db.engagements = [{ id: ENG, payee_profile_id: FOUNDER, entity_type: "crew_support_slot" }];
  db.founder_identities = [{ id: "fi-1", profile_id: FOUNDER, status: "active" }];
  db.founder_common_control_accounts = [{ id: "cc-1", founder_identity_id: "fi-1", profile_id: SECOND, revoked_at: null }];
  db.self_review_exception_holders = [{ id: "h-1", founder_identity_id: "fi-1", effective_at: "2026-01-01T00:00:00Z", expires_at: null, revoked_at: null }];
  db.self_review_exceptions = [];
  db.self_review_file_views = [];
  db.self_review_declarations = [];
  db.self_review_declaration_files = [];
  db.project_files = [file("a"), file("b"), file("c"), file("raw", { file_kind: "source_raw" }), file("rel", { release_status: "released" })];
});

function openException(over: Row = {}) {
  db.self_review_exceptions = [{ id: "x-1", engagement_id: ENG, holder_id: "h-1", founder_profile_id: FOUNDER, status: "open", opened_at: "2026-10-22T08:00:00Z", expires_at: FUTURE, justification: GOOD, ...over }];
}
function viewed(...ids: string[]) {
  db.self_review_file_views = ids.map((id) => ({ exception_id: "x-1", file_id: id, file_version: 1, file_storage_path: `${ENG}/${id}.jpeg`, viewer_profile_id: FOUNDER }));
}

describe("who the exception is available to", () => {
  it("the verified Founder performing the engagement: available", async () => {
    expect((await getFounderContext(user(FOUNDER), ENG)).state).toBe("available");
  });
  it("another Super Admin is not offered it at all", async () => {
    expect((await getFounderContext(user(OTHER_ADMIN), ENG)).state).toBe("not_applicable");
  });
  it("the second Founder-controlled login is told it is not an independent reviewer", async () => {
    const c = await getFounderContext(user(SECOND), ENG);
    expect(c.state).toBe("linked_login");
  });
  it("a Super Admin who is the performer but NOT the Founder identity gets no exception (it is not a generic Super Admin bypass)", async () => {
    db.engagements[0].payee_profile_id = OTHER_ADMIN;
    expect((await getFounderContext(user(OTHER_ADMIN), ENG)).state).toBe("not_applicable");
    expect((await openFounderException({ user: user(OTHER_ADMIN), engagementId: ENG, justification: GOOD, acknowledged: true })).ok).toBe(false);
    expect(db.self_review_exceptions).toHaveLength(0);
  });
  it("the Founder on an engagement they do not perform: not applicable", async () => {
    db.engagements[0].payee_profile_id = OTHER_ADMIN;
    expect((await getFounderContext(user(FOUNDER), ENG)).state).toBe("not_applicable");
  });
  it("a non-Crew-Support engagement: not applicable", async () => {
    db.engagements[0].entity_type = "workshop";
    expect((await getFounderContext(user(FOUNDER), ENG)).state).toBe("not_applicable");
  });
  it("no active Founder identity: nobody qualifies", async () => {
    db.founder_identities = [];
    expect((await getFounderContext(user(FOUNDER), ENG)).state).toBe("not_applicable");
  });
  it("holder revoked, missing or expired: unavailable, with a reason", async () => {
    db.self_review_exception_holders = [];
    expect((await getFounderContext(user(FOUNDER), ENG)).state).toBe("unavailable");
    db.self_review_exception_holders = [{ id: "h-1", founder_identity_id: "fi-1", effective_at: "2026-01-01T00:00:00Z", expires_at: "2026-02-01T00:00:00Z", revoked_at: null }];
    expect((await getFounderContext(user(FOUNDER), ENG)).state).toBe("unavailable");
    db.self_review_exception_holders = [{ id: "h-1", founder_identity_id: "fi-1", effective_at: "2999-01-01T00:00:00Z", expires_at: null, revoked_at: null }];
    expect((await getFounderContext(user(FOUNDER), ENG)).state).toBe("unavailable");
  });
  it("before migration 0169 exists (tables missing) the exception simply does not exist", async () => {
    tableErrors.founder_identities = { code: "42P01", message: "relation does not exist" };
    tableErrors.founder_common_control_accounts = { code: "42P01", message: "relation does not exist" };
    expect((await getFounderContext(user(FOUNDER), ENG)).state).toBe("not_applicable");
  });
  it("an unexpected error is reported as unavailable, never as available", async () => {
    tableErrors.founder_identities = { code: "XX000", message: "boom" };
    expect((await getFounderContext(user(FOUNDER), ENG)).state).toBe("unavailable");
  });
  it("an expired exception is not open", async () => {
    openException({ expires_at: "2026-01-02T00:00:00Z" });
    expect((await getFounderContext(user(FOUNDER), ENG)).state).toBe("available");
  });
  it("an open exception reports only the images opened for their CURRENT version", async () => {
    openException();
    viewed("a", "b");
    db.project_files.find((f) => f.id === "b")!.version = 2; // replaced after it was opened
    const c = await getFounderContext(user(FOUNDER), ENG);
    expect(c.state === "open" && c.viewedFileIds).toEqual(["a"]);
  });
});

describe("opening the exception (steps A + B)", () => {
  it("records the justification, the acknowledgement text and a bounded expiry, and touches no file", async () => {
    const r = await openFounderException({ user: user(FOUNDER), engagementId: ENG, justification: GOOD, acknowledged: true });
    expect(r.ok).toBe(true);
    const row = db.self_review_exceptions[0];
    expect(row).toMatchObject({ engagement_id: ENG, holder_id: "h-1", founder_profile_id: FOUNDER, justification: GOOD, conflict_acknowledgement: FSR_CONFLICT_ACKNOWLEDGEMENT });
    const ttl = new Date(row.expires_at as string).getTime() - new Date(row.conflict_acknowledged_at as string).getTime();
    expect(ttl).toBe(168 * 3600_000);
    expect(calls.filter((c) => c.startsWith("update:") || c.startsWith("rpc:"))).toEqual([]);
    expect(mocks.sendFilesReadyEmail).not.toHaveBeenCalled();
  });
  it.each([
    ["too short", { justification: "short", acknowledged: true }],
    ["no acknowledgement", { justification: GOOD, acknowledged: false }],
  ])("refuses %s and writes nothing", async (_l, input) => {
    expect((await openFounderException({ user: user(FOUNDER), engagementId: ENG, ...input })).ok).toBe(false);
    expect(db.self_review_exceptions).toHaveLength(0);
  });
  it("refuses another Super Admin, the second login, and a second open exception", async () => {
    for (const id of [OTHER_ADMIN, SECOND]) expect((await openFounderException({ user: user(id), engagementId: ENG, justification: GOOD, acknowledged: true })).ok).toBe(false);
    openException();
    expect((await openFounderException({ user: user(FOUNDER), engagementId: ENG, justification: GOOD, acknowledged: true })).ok).toBe(false);
    expect(db.self_review_exceptions).toHaveLength(1);
  });
  it("shows the database's refusal in plain words", async () => {
    insertErrors.self_review_exceptions = { message: "ERROR: fsr: the exception is not currently authorized for this Founder (holder missing, revoked or expired)" };
    const r = await openFounderException({ user: user(FOUNDER), engagementId: ENG, justification: GOOD, acknowledged: true });
    expect(!r.ok && r.error).toContain("not currently authorized");
  });
  it("closing needs a reason, only the Founder, and leaves history on record", async () => {
    openException();
    expect((await closeFounderException({ user: user(FOUNDER), exceptionId: "x-1", reason: "x" })).ok).toBe(false);
    expect((await closeFounderException({ user: user(OTHER_ADMIN), exceptionId: "x-1", reason: "Finished with this job" })).ok).toBe(false);
    expect((await closeFounderException({ user: user(FOUNDER), exceptionId: "x-1", reason: "Finished with this job" })).ok).toBe(true);
    expect(db.self_review_exceptions[0].status).toBe("closed");
    expect(calls.some((c) => c === "delete:self_review_exceptions")).toBe(false);
  });
});

describe("opening an image in the viewer (step C) — evidence is server-side", () => {
  beforeEach(() => openException());
  it("signs first, records the view, and returns the link only after both succeeded", async () => {
    const r = await issueViewerUrl({ user: user(FOUNDER), exceptionId: "x-1", fileId: "a" });
    expect(r.ok && r.url).toBe(`https://signed.example/${ENG}/a.jpeg`);
    expect(calls.indexOf("sign")).toBeLessThan(calls.indexOf("insert:self_review_file_views"));
    expect(db.self_review_file_views).toHaveLength(1);
  });
  it("the browser cannot supply version, size or path: only exception, file and viewer are written", async () => {
    await issueViewerUrl({ user: user(FOUNDER), exceptionId: "x-1", fileId: "a" });
    const row = db.self_review_file_views[0];
    expect(Object.keys(row).filter((k) => k !== "id" && k !== "selection_hash").sort()).toEqual(["exception_id", "file_id", "viewer_profile_id"]);
  });
  it("no link when signing fails, and no evidence is written", async () => {
    signFails = true;
    expect((await issueViewerUrl({ user: user(FOUNDER), exceptionId: "x-1", fileId: "a" })).ok).toBe(false);
    expect(db.self_review_file_views).toHaveLength(0);
  });
  it("no link when the evidence cannot be recorded", async () => {
    insertErrors.self_review_file_views = { message: "ERROR: fsr: only the Founder can generate viewing evidence" };
    expect((await issueViewerUrl({ user: user(FOUNDER), exceptionId: "x-1", fileId: "a" })).ok).toBe(false);
  });
  it("refuses anyone but the Founder, another engagement's file, and a closed exception", async () => {
    expect((await issueViewerUrl({ user: user(OTHER_ADMIN), exceptionId: "x-1", fileId: "a" })).ok).toBe(false);
    expect((await issueViewerUrl({ user: user(SECOND), exceptionId: "x-1", fileId: "a" })).ok).toBe(false);
    expect((await issueViewerUrl({ user: user(FOUNDER), exceptionId: "x-1", fileId: "not-in-this-engagement" })).ok).toBe(false);
    db.self_review_exceptions[0].status = "closed";
    expect((await issueViewerUrl({ user: user(FOUNDER), exceptionId: "x-1", fileId: "a" })).ok).toBe(false);
    expect(db.self_review_file_views).toHaveLength(0);
  });
});

describe("approving a fixed selection (steps D–F)", () => {
  beforeEach(() => { openException(); viewed("a", "b", "c"); });
  const approve = (ids: string[], over: Row = {}) => declareAndApplyReview({ user: user(FOUNDER), exceptionId: "x-1", decisions: Object.fromEntries(ids.map((i) => [i, "approve" as const])), note: "", reviewConfirmed: true, typedCount: ids.length, ...over } as never);

  it("declares first, then applies each file through the database function, with a per-file audit entry", async () => {
    const r = await approve(["a", "b"]);
    expect(r.ok && r.declaration.status).toBe("completed");
    expect(calls.indexOf("insert:self_review_declarations")).toBeLessThan(calls.indexOf("rpc:fsr_apply_review"));
    expect(rpcCalls.filter((c) => c.fn === "fsr_apply_review").map((c) => c.args.p_file)).toEqual(["a", "b"]);
    expect(mocks.logActivityAsSystem.mock.calls.map((c) => [c[0].action, c[0].metadata?.selfReview])).toEqual([["project_file.release_approve", true], ["project_file.release_approve", true]]);
  });
  it("the declaration carries the fixed ids, a server-built snapshot, the confirmation and the typed count — and no hash from the caller", async () => {
    await approve(["a", "b"]);
    const d = db.self_review_declarations[0];
    expect(d).toMatchObject({ kind: "review", actor_profile_id: FOUNDER, file_ids: ["a", "b"], typed_file_count: 2 });
    expect((d.selection_snapshot as Row[]).map((s) => [s.id, s.version, s.storage_path])).toEqual([["a", 1, `${ENG}/a.jpeg`], ["b", 1, `${ENG}/b.jpeg`]]);
    expect(d.review_confirmed_at).toBeTruthy();
    expect(d.release_set_confirmed_at).toBeUndefined();
  });
  it("approve two and return one are separate declarations", async () => {
    await approve(["a", "b"]);
    const r = await declareAndApplyReview({ user: user(FOUNDER), exceptionId: "x-1", decisions: { c: "request_changes" }, note: "Soften the retouching on the left.", reviewConfirmed: true, typedCount: 1 });
    expect(r.ok && r.declaration.status).toBe("completed");
    expect(db.self_review_declarations).toHaveLength(2);
    expect(db.self_review_declaration_files.map((x) => [x.file_id, x.decision])).toEqual([["a", "approve"], ["b", "approve"], ["c", "request_changes"]]);
    expect(db.self_review_declaration_files.find((x) => x.file_id === "c")?.note).toBe("Soften the retouching on the left.");
  });
  it.each([
    ["no review confirmation", { reviewConfirmed: false }],
    ["a wrong typed count", { typedCount: 5 }],
    ["a missing typed count", { typedCount: "" }],
  ])("refuses %s and writes nothing", async (_l, over) => {
    const r = await approve(["a", "b"], over);
    expect(r.ok).toBe(false);
    expect(db.self_review_declarations).toHaveLength(0);
    expect(rpcCalls).toHaveLength(0);
  });
  it("refuses an image that has not been opened in the viewer (server's own record, not the browser's claim)", async () => {
    viewed("a");
    const r = await approve(["a", "b"]);
    expect(!r.ok && r.error).toContain("open it in the review viewer first");
    expect(db.self_review_declarations).toHaveLength(0);
  });
  it("refuses RAW, released and unknown files", async () => {
    for (const id of ["raw", "rel", "ghost"]) expect((await approve([id])).ok).toBe(false);
    expect(rpcCalls).toHaveLength(0);
  });
  it("an image replaced after it was opened must be opened again", async () => {
    db.project_files.find((f) => f.id === "a")!.version = 2;
    const r = await approve(["a"]);
    expect(r.ok).toBe(false);
  });
  it("images added after the declaration are not touched by it", async () => {
    await approve(["a"]);
    db.project_files.push(file("added-later"));
    expect(rpcCalls.map((c) => c.args.p_file)).toEqual(["a"]);
    const r = await approve(["added-later"]);
    expect(r.ok).toBe(false); // not opened, not declared
  });
  it("a partial failure is reported as partial, the failed file is recorded as failed, and the successes are kept", async () => {
    rpcErrors.fsr_apply_review = { b: "the file changed or is no longer in a reviewable state" };
    const r = await approve(["a", "b", "c"]);
    expect(r.ok && r.declaration.status).toBe("partial");
    expect(r.ok && r.outcomes.map((o) => o.ok)).toEqual([true, false, true]);
    expect(rpcCalls.filter((c) => c.fn === "fsr_record_failure").map((c) => c.args.p_file)).toEqual(["b"]);
    expect(mocks.logActivityAsSystem).toHaveBeenCalledTimes(2); // no audit entry for the file that was not decided
    expect(r.ok && r.outcomes[1].error).toBe("the file changed or is no longer in a reviewable state");
  });
  it("a total failure is reported as failed — never as success", async () => {
    rpcErrors.fsr_apply_review = { a: "refused by the database", b: "refused by the database" };
    const r = await approve(["a", "b"]);
    expect(r.ok && r.declaration.status).toBe("failed");
  });
  it("if the database refuses the declaration itself nothing is applied", async () => {
    insertErrors.self_review_declarations = { message: "ERROR: fsr: file a has not been opened in the review viewer for this exception" };
    const r = await approve(["a"]);
    expect(r.ok).toBe(false);
    expect(rpcCalls).toHaveLength(0);
  });
  it("another Super Admin and the second login cannot declare under the Founder's exception", async () => {
    for (const id of [OTHER_ADMIN, SECOND]) {
      const r = await declareAndApplyReview({ user: user(id), exceptionId: "x-1", decisions: { a: "approve" }, note: "", reviewConfirmed: true, typedCount: 1 });
      expect(r.ok).toBe(false);
    }
    expect(db.self_review_declarations).toHaveLength(0);
  });
  it("a closed or expired exception cannot be used", async () => {
    db.self_review_exceptions[0].status = "closed";
    expect((await approve(["a"])).ok).toBe(false);
    openException({ expires_at: "2026-01-02T00:00:00Z" });
    expect((await approve(["a"])).ok).toBe(false);
  });
  it("approving never releases and never emails", async () => {
    await approve(["a", "b"]);
    expect(mocks.releaseApprovedFiles).not.toHaveBeenCalled();
    expect(mocks.sendFilesReadyEmail).not.toHaveBeenCalled();
    expect(calls.filter((c) => c === "rpc:fsr_claim_release")).toEqual([]);
  });
});

describe("releasing a fixed, separately confirmed set (steps G–H)", () => {
  beforeEach(() => {
    openException();
    db.project_files = [file("a", { release_status: "approved" }), file("b", { release_status: "approved" }), file("s")];
    mocks.releaseApprovedFiles.mockResolvedValue({ ok: true, released: 2, alreadyReleased: 0, failed: [], client: { notified: false, reason: "No email was requested." } });
  });
  const release = (ids: string[], over: Row = {}) => declareAndRelease({ user: user(FOUNDER), exceptionId: "x-1", fileIds: ids, releaseSetConfirmed: true, typedCount: ids.length, ...over } as never);

  it("makes its own release declaration, then calls the normal release engine with it — and never asks it to email", async () => {
    await release(["a", "b"]);
    const d = db.self_review_declarations[0];
    expect(d).toMatchObject({ kind: "release", file_ids: ["a", "b"] });
    expect(d.release_set_confirmed_at).toBeTruthy();
    expect(d.review_confirmed_at).toBeUndefined();
    expect(mocks.releaseApprovedFiles).toHaveBeenCalledTimes(1);
    const args = mocks.releaseApprovedFiles.mock.calls[0][0];
    expect(args).toMatchObject({ fileIds: ["a", "b"], notifyClient: false, selfReview: { declarationId: d.id } });
    expect(mocks.sendFilesReadyEmail).not.toHaveBeenCalled();
  });
  it("refuses unapproved images, a missing confirmation and a wrong count — before any declaration exists", async () => {
    expect((await release(["s"])).ok).toBe(false);
    expect((await release(["a"], { releaseSetConfirmed: false })).ok).toBe(false);
    expect((await release(["a", "b"], { typedCount: 1 })).ok).toBe(false);
    expect(db.self_review_declarations).toHaveLength(0);
    expect(mocks.releaseApprovedFiles).not.toHaveBeenCalled();
  });
  it("reports each file's recorded outcome — a release that failed for one file is partial, not success", async () => {
    mocks.releaseApprovedFiles.mockImplementation(async () => {
      const decl = db.self_review_declarations[0].id;
      db.self_review_declaration_files.find((x) => x.declaration_id === decl && x.file_id === "a")!.outcome = "applied";
      db.self_review_declaration_files.find((x) => x.declaration_id === decl && x.file_id === "b")!.outcome = "failed";
      db.self_review_declaration_files.find((x) => x.declaration_id === decl && x.file_id === "b")!.outcome_error = "the client-facing deliverable could not be published";
      return { ok: true, released: 1, alreadyReleased: 0, failed: ["Title b: could not be published"], client: { notified: false, reason: "No email was requested." } };
    });
    const r = await release(["a", "b"]);
    expect(r.ok && r.declaration.status).toBe("partial");
    expect(r.ok && r.outcomes.map((o) => [o.fileId, o.ok])).toEqual([["a", true], ["b", false]]);
    expect(mocks.logActivityAsSystem.mock.calls.map((c) => c[0].metadata?.fileId)).toEqual(["a"]);
  });
  it("if the release engine fails outright every file is recorded failed and nothing is reported released", async () => {
    mocks.releaseApprovedFiles.mockResolvedValue({ ok: false, error: "This assignment is not linked to a client project" });
    const r = await release(["a", "b"]);
    expect(r.ok && r.declaration.status).toBe("failed");
    expect(rpcCalls.filter((c) => c.fn === "fsr_record_failure")).toHaveLength(2);
  });
  it("only the Founder may release under the exception", async () => {
    for (const id of [OTHER_ADMIN, SECOND]) expect((await declareAndRelease({ user: user(id), exceptionId: "x-1", fileIds: ["a"], releaseSetConfirmed: true, typedCount: 1 })).ok).toBe(false);
    expect(db.self_review_declarations).toHaveLength(0);
  });
});

describe("post-rehearsal corrections", () => {
  it("an exception made under a PREVIOUS (revoked/replaced) holder is not shown as open — a new one can be opened", async () => {
    openException({ holder_id: "h-old" }); // current holder is h-1
    expect((await getFounderContext(user(FOUNDER), ENG)).state).toBe("available");
  });
  it("an open exception under the CURRENT holder is still open", async () => {
    openException();
    expect((await getFounderContext(user(FOUNDER), ENG)).state).toBe("open");
  });
});
