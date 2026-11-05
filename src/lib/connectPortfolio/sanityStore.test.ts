import type { SanityClient } from "next-sanity";
import { describe, expect, it } from "vitest";
import { DOC_ID, DRAFT_ID, DRAFT_TYPE, REVISION_TYPE, applyOperation, seedFromBuiltins, toPublishedItems, type ManifestItem } from "./model";
import { classify, createSanityStore } from "./sanityStore";
import { ContentServiceError, StoreConflictError } from "./store";
import { ALT, hex, upload } from "./testSupport";

// A stand-in for the content service's client. It applies the same rules the real one documents: documents keyed by id, a patch can demand a revision, "create" fails if the id exists (409), and a
// transaction is validated completely before ANY of it is applied. It is NOT the real service: see the report for what has not been verified against the real one.
type Doc = Record<string, unknown> & { _id: string; _rev: string };
class Conflict extends Error { statusCode = 409; }
function fakeClient(opts: { failWith?: number } = {}) {
  const docs = new Map<string, Doc>(); let rev = 0; const calls: string[] = []; const configs: unknown[] = []; const txs: { kind: string; id: string }[][] = [];
  const guard = () => { if (opts.failWith) { const e = new Error("boom") as Error & { statusCode: number }; e.statusCode = opts.failWith; throw e; } };
  type Op = { kind: "create" | "createOrReplace" | "delete" | "patch"; id: string; doc?: Record<string, unknown>; ifRev?: string; set?: Record<string, unknown> };
  const run = (ops: Op[]) => {
    guard();
    const seen = new Map(docs);
    for (const op of ops) {                                  // validate everything first
      if (op.kind === "create" && seen.has(op.id)) throw new Conflict("Document by ID already exists");
      if (op.kind === "patch") { const d = seen.get(op.id); if (!d) throw Object.assign(new Error("not found"), { statusCode: 404 }); if (op.ifRev && d._rev !== op.ifRev) throw new Conflict("Document revision ID mismatch"); }
      if (op.kind === "create" || op.kind === "createOrReplace") seen.set(op.id, { ...(op.doc as object), _id: op.id, _rev: "x" } as Doc);
      if (op.kind === "delete") seen.delete(op.id);
    }
    for (const op of ops) {                                  // then apply
      if (op.kind === "create" || op.kind === "createOrReplace") docs.set(op.id, { ...(op.doc as object), _id: op.id, _rev: `r${++rev}` } as Doc);
      if (op.kind === "patch") docs.set(op.id, { ...docs.get(op.id)!, ...op.set, _rev: `r${++rev}` });
      if (op.kind === "delete") docs.delete(op.id);
    }
    return docs.get(ops[ops.length - 1].id);                    // the document the last operation touched, as the real client returns it
  };
  const patchBuilder = (id: string) => { const op: Op = { kind: "patch", id }; const b = { ifRevisionId(r: string) { op.ifRev = r; return b; }, set(f: Record<string, unknown>) { op.set = f; return b; }, op }; return b; };
  const client = {
    withConfig(c: unknown) { configs.push(c); return client; },
    async getDocument(id: string) { guard(); calls.push(`get ${id}`); return docs.get(id); },
    async create(doc: Record<string, unknown>) { calls.push("create"); return run([{ kind: "create", id: doc._id as string, doc }]); },
    patch(id: string) { const b = patchBuilder(id); return { ifRevisionId: (r: string) => { b.ifRevisionId(r); return { set: (f: Record<string, unknown>) => { b.set(f); return { commit: async () => { calls.push("patch"); return run([b.op]); } }; } }; } }; },
    transaction() {
      const ops: Op[] = [];
      const t = {
        patch(id: string, fn: (p: ReturnType<typeof patchBuilder>) => unknown) { const b = patchBuilder(id); fn(b); ops.push(b.op); return t; },
        createOrReplace(doc: Record<string, unknown>) { ops.push({ kind: "createOrReplace", id: doc._id as string, doc }); return t; },
        create(doc: Record<string, unknown>) { ops.push({ kind: "create", id: doc._id as string, doc }); return t; },
        delete(id: string) { ops.push({ kind: "delete", id }); return t; },
        async commit() { calls.push(`transaction[${ops.map((o) => o.kind).join(",")}]`); txs.push(ops.map((o) => ({ kind: o.kind, id: o.id }))); run(ops); },
      };
      return t;
    },
    async fetch() { guard(); return [...docs.values()].filter((d) => d._type === REVISION_TYPE).sort((a, b) => String(b.publishedAt).localeCompare(String(a.publishedAt))); },
    assets: { async upload(_type: string, _bytes: Buffer, o: { filename: string; contentType: string }) { guard(); calls.push("upload"); return { _id: `image-${hex(5)}-2000x1500-jpg`, url: upload(5).url, mimeType: o.contentType, originalFilename: o.filename, metadata: { dimensions: { width: 2000, height: 1500 }, palette: { darkMuted: { background: "#112233" } } } }; } },
  };
  return { client: client as unknown as SanityClient, docs, calls, configs, txs };
}

const withUpload = (n = 1): ManifestItem[] => { const r = applyOperation(seedFromBuiltins(), { type: "addUploaded", upload: upload(n, { filename: "secret-name.jpg" }), alt: ALT, rightsConfirmed: true }, { userId: "user-1", now: "2026-11-05T10:00:00.000Z", newKey: () => "u-1" }); if (!r.ok) throw new Error(r.message); return r.items; };
const revision = (items: ManifestItem[], id = `${REVISION_TYPE}.t-1`) => ({ id, publishedAt: "2026-11-05T10:00:00.000Z", publishedBy: "user-1", note: "n", restoredFrom: null, previousRevisionId: null, items, visibleCount: items.length });

describe("the real store, against a stand-in for the content service", () => {
  it("reads through a raw, non-cached view so a draft is never older than the last write", () => {
    const f = fakeClient(); createSanityStore(f.client);
    expect(f.configs).toEqual([{ perspective: "raw", useCdn: false }]);
  });

  it("the working copy is a private dotted id (not the reserved drafts. prefix) of its own type, and can be created, updated and read back", async () => {
    const f = fakeClient(); const s = createSanityStore(f.client);
    expect(await s.readDraft()).toBeNull();
    const { rev } = await s.writeDraft({ items: withUpload(), expectedRev: null, userId: "user-1", now: "t", restoredFrom: null });
    expect(DRAFT_ID).toBe("connectPortfolio.draft"); expect(DRAFT_ID.startsWith("drafts.")).toBe(false);
    expect(f.docs.get(DRAFT_ID)).toMatchObject({ _type: DRAFT_TYPE });
    const d = await s.readDraft();
    expect(d).toMatchObject({ rev, dropped: 0, updatedBy: "user-1" });
    expect(d!.items).toHaveLength(16);
    expect(d!.items[15]).toMatchObject({ kind: "uploaded", alt: ALT, rights: { confirmedBy: "user-1" }, originalFilename: "secret-name.jpg" });
    const second = await s.writeDraft({ items: withUpload(), expectedRev: rev, userId: "user-1", now: "t2", restoredFrom: null });
    expect(second.rev).not.toBe(rev);
  });

  it("images are held as real references, so the content service itself refuses to delete one that is still in use", async () => {
    const f = fakeClient(); const s = createSanityStore(f.client);
    await s.writeDraft({ items: withUpload(), expectedRev: null, userId: "u", now: "t", restoredFrom: null });
    const stored = (f.docs.get(DRAFT_ID)!.items as Record<string, unknown>[])[15];
    expect(stored.image).toEqual({ _type: "image", asset: { _type: "reference", _ref: upload(1).assetId } });
    expect(stored._key).toBe("u-1");
  });

  it("a stale draft revision, or creating a draft that already exists, is a conflict (nothing overwritten)", async () => {
    const f = fakeClient(); const s = createSanityStore(f.client);
    const { rev } = await s.writeDraft({ items: seedFromBuiltins(), expectedRev: null, userId: "u", now: "t", restoredFrom: null });
    await expect(s.writeDraft({ items: seedFromBuiltins(), expectedRev: null, userId: "u", now: "t", restoredFrom: null })).rejects.toBeInstanceOf(StoreConflictError);
    await s.writeDraft({ items: withUpload(), expectedRev: rev, userId: "u", now: "t", restoredFrom: null });
    await expect(s.writeDraft({ items: seedFromBuiltins(), expectedRev: rev, userId: "u", now: "t", restoredFrom: null })).rejects.toBeInstanceOf(StoreConflictError);
  });

  it("publishing is ONE transaction over three different documents: the revision check on the working copy, the live list and the history entry. Nothing is deleted, and no document is touched twice", async () => {
    const f = fakeClient(); const s = createSanityStore(f.client);
    const items = withUpload();
    const { rev } = await s.writeDraft({ items, expectedRev: null, userId: "user-1", now: "t", restoredFrom: null });
    await s.publish({ draftRev: rev, publishedItems: toPublishedItems(items), revision: revision(items) });
    expect(f.calls.filter((c) => c.startsWith("transaction"))).toEqual(["transaction[patch,createOrReplace,create]"]);
    expect(f.txs[0].map((o) => o.id)).toEqual([DRAFT_ID, DOC_ID, `${REVISION_TYPE}.t-1`]);
    expect(new Set(f.txs[0].map((o) => o.id)).size).toBe(3);                    // no document appears twice (the content service does not document that combination)
    expect(f.txs[0].some((o) => o.kind === "delete")).toBe(false);
    expect(f.docs.has(DRAFT_ID)).toBe(true);                                    // the working copy stays, marked as published
    expect(f.docs.get(DRAFT_ID)).toMatchObject({ lastPublishedRevisionId: `${REVISION_TYPE}.t-1` });
    expect((await s.readDraft())!.rev).not.toBe(rev);
    expect(f.docs.get(DOC_ID)).toMatchObject({ revisionId: `${REVISION_TYPE}.t-1`, publishedBy: "user-1" });
    expect(f.docs.get(`${REVISION_TYPE}.t-1`)).toMatchObject({ visibleCount: 16, itemCount: 16 });
  });

  it("the live document is public-safe and names only visible photographs; the history entry and working copy keep the private details and the hidden ones", async () => {
    const f = fakeClient(); const s = createSanityStore(f.client);
    const items = withUpload().map((i, n) => (n === 4 ? { ...i, hidden: true } : i));
    const hiddenId = (items[4] as { builtinId: string }).builtinId;
    const { rev } = await s.writeDraft({ items, expectedRev: null, userId: "user-1", now: "t", restoredFrom: null });
    await s.publish({ draftRev: rev, publishedItems: toPublishedItems(items), revision: revision(items) });
    const live = JSON.stringify(f.docs.get(DOC_ID)!.items), hist = JSON.stringify(f.docs.get(`${REVISION_TYPE}.t-1`)!.items);
    expect(live).not.toMatch(/secret-name|confirmedBy|confirmedAt/);
    expect(live).not.toContain(hiddenId); expect(hist).toContain(hiddenId); expect(JSON.stringify(f.docs.get(DRAFT_ID)!.items)).toContain(hiddenId);
    expect(hist).toMatch(/secret-name/); expect(hist).toMatch(/confirmedBy/);
    expect(`${REVISION_TYPE}.t-1`).toContain(".");                      // the dot keeps history entries out of public reads
    expect(DOC_ID).not.toContain(".");
  });

  it("a stale or failed publish applies NOTHING: no live list, no history entry, the working copy is unchanged", async () => {
    const f = fakeClient(); const s = createSanityStore(f.client);
    const items = withUpload();
    const { rev } = await s.writeDraft({ items, expectedRev: null, userId: "u", now: "t", restoredFrom: null });
    await expect(s.publish({ draftRev: "old-rev", publishedItems: toPublishedItems(items), revision: revision(items) })).rejects.toBeInstanceOf(StoreConflictError);
    expect(f.docs.has(DOC_ID)).toBe(false); expect(f.docs.has(`${REVISION_TYPE}.t-1`)).toBe(false); expect(f.docs.has(DRAFT_ID)).toBe(true);
    // a history id that already exists also fails the whole thing
    f.docs.set(`${REVISION_TYPE}.t-1`, { _id: `${REVISION_TYPE}.t-1`, _rev: "z", _type: REVISION_TYPE, publishedAt: "a" });
    await expect(s.publish({ draftRev: rev, publishedItems: toPublishedItems(items), revision: revision(items) })).rejects.toBeInstanceOf(StoreConflictError);
    expect(f.docs.has(DOC_ID)).toBe(false); expect(f.docs.has(DRAFT_ID)).toBe(true);
  });

  it("lists history newest first and reads one entry, but only history entries can be read through that door", async () => {
    const f = fakeClient(); const s = createSanityStore(f.client);
    const items = withUpload();
    let { rev } = await s.writeDraft({ items, expectedRev: null, userId: "u", now: "t", restoredFrom: null });
    await s.publish({ draftRev: rev, publishedItems: toPublishedItems(items), revision: { ...revision(items, `${REVISION_TYPE}.a`), publishedAt: "2026-11-05T10:00:00.000Z" } });
    ({ rev } = await s.writeDraft({ items, expectedRev: (await s.readDraft())!.rev, userId: "u", now: "t", restoredFrom: null }));   // the working copy is kept after a publish
    await s.publish({ draftRev: rev, publishedItems: toPublishedItems(items), revision: { ...revision(items, `${REVISION_TYPE}.b`), publishedAt: "2026-11-06T10:00:00.000Z" } });
    expect((await s.listRevisions(10)).map((r) => r.id)).toEqual([`${REVISION_TYPE}.b`, `${REVISION_TYPE}.a`]);
    expect(await s.getRevision(`${REVISION_TYPE}.a`)).toMatchObject({ itemCount: 16, dropped: 0 });
    expect(await s.getRevision(DOC_ID)).toBeNull();
    expect(await s.getRevision(DRAFT_ID)).toBeNull();
    expect(await s.getRevision("image-abc")).toBeNull();
  });

  it("image assets: only real image assets are returned, and the dominant colour is read from the palette", async () => {
    const f = fakeClient(); const s = createSanityStore(f.client);
    f.docs.set(upload(1).assetId, { _id: upload(1).assetId, _rev: "1", _type: "sanity.imageAsset", url: upload(1).url, mimeType: "image/jpeg", originalFilename: "a.jpg", metadata: { dimensions: { width: 2000, height: 1500 }, palette: { dominant: { background: "#abcdef" } } } });
    f.docs.set("file-abc", { _id: "file-abc", _rev: "1", _type: "sanity.fileAsset" });
    expect(await s.getImageAsset(upload(1).assetId)).toMatchObject({ width: 2000, height: 1500, color: "#abcdef", mimeType: "image/jpeg" });
    expect(await s.getImageAsset("file-abc")).toBeNull();                          // not an image id
    expect(await s.getImageAsset(upload(2).assetId)).toBeNull();                   // not found
  });

  it("uploads an image as an ordinary asset and reports its size and colour", async () => {
    const f = fakeClient(); const s = createSanityStore(f.client);
    expect(await s.uploadImage({ bytes: Buffer.from("x"), filename: "a.jpg", contentType: "image/jpeg" })).toMatchObject({ width: 2000, height: 1500, color: "#112233", mimeType: "image/jpeg" });
  });

  it("separates 'the service failed' from 'there is nothing there'", async () => {
    const empty = createSanityStore(fakeClient().client);
    expect(await empty.readPublished()).toBeNull();                                // reachable, nothing published
    for (const status of [500, 503, 429, 401]) {
      const s = createSanityStore(fakeClient({ failWith: status }).client);
      await expect(s.readPublished()).rejects.toBeInstanceOf(ContentServiceError);   // never "null"
    }
    const noConfig = { withConfig() { throw new Error("Configuration must contain `projectId`"); } } as unknown as SanityClient;
    expect(() => createSanityStore(noConfig)).toThrow(/projectId/);
  });
});

describe("how failures from the content service are classified (its reference does not state the status codes, so wording counts too)", () => {
  const err = (status: number | null, message: string) => Object.assign(new Error(message), status === null ? {} : { statusCode: status });
  it("a 409, or a mutation error that says the revision did not match or the id already exists, is a conflict", () => {
    expect(classify(err(409, "anything"))).toBeInstanceOf(StoreConflictError);
    expect(classify(err(400, "Mutation(s) failed with 1 error(s):\n- Document revision ID mismatch"))).toBeInstanceOf(StoreConflictError);
    expect(classify(err(400, 'Document by ID "connectPortfolio.draft" already exists'))).toBeInstanceOf(StoreConflictError);
    expect(classify(err(412, "ifRevisionID does not match"))).toBeInstanceOf(StoreConflictError);
  });
  it("everything else is the service being unavailable or refusing: never a conflict, and never 'nothing there'", () => {
    for (const [status, message] of [[500, "boom"], [502, "bad gateway"], [503, "unavailable"], [429, "rate limited, already exists"], [401, "Unauthorized"], [403, "revision ID mismatch but forbidden"], [400, "Invalid request"], [404, "not found"], [null, "fetch failed"]] as const) {
      const c = classify(err(status, message));
      expect(c, `${status} ${message}`).toBeInstanceOf(ContentServiceError);
    }
  });
  it("carries the status for the log", () => expect((classify(err(503, "x")) as ContentServiceError).status).toBe(503));
  it("passes already-classified errors through unchanged", () => { const e = new StoreConflictError(); expect(classify(e)).toBe(e); });
});
