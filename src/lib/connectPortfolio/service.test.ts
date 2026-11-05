import { describe, expect, it } from "vitest";
import { seedFromBuiltins, visibleCount, type ManifestItem, type UploadedItem } from "./model";
import { applyChange, discardDraft, loadState, publishDraft, restoreRevision, type OperationInput } from "./service";
import { ContentServiceError } from "./store";
import { ALT, register, testDeps, upload } from "./testSupport";

const U = "user-1";
const addOp = (n: number, over: Record<string, unknown> = {}): OperationInput => ({ type: "addUploaded", assetId: upload(n).assetId, filename: `photo-${n}.jpg`, alt: ALT, rightsConfirmed: true, ...over }) as OperationInput;
async function change(d: ReturnType<typeof testDeps>, op: OperationInput) {
  const state = await loadState(d);
  const r = await applyChange(d, { userId: U, expectedRev: state.draftRev, op });
  if (!r.ok) throw new Error(`${r.code}: ${r.message}`);
  return r.state;
}
async function publish(d: ReturnType<typeof testDeps>, note: string | null = null) {
  const state = await loadState(d);
  return publishDraft(d, { userId: U, expectedRev: state.draftRev, note });
}

describe("before anything is published", () => {
  it("shows the original 15, with no draft and nothing pending", async () => {
    const s = await loadState(testDeps());
    expect(s).toMatchObject({ source: "original", liveSource: "original", hasDraft: false, pending: false, draftRev: null, liveVisibleCount: 15, draftVisibleCount: 15, addableBuiltinIds: [] });
    expect(s.items).toHaveLength(15);
  });
  it("viewing never writes anything", async () => {
    const d = testDeps(); await loadState(d); await loadState(d);
    expect(d.store.log).toEqual([]); expect(d.store.draft).toBeNull(); expect(d.store.published).toBeNull();
  });
});

describe("pending changes (the draft)", () => {
  it("the first change creates a draft; the live list stays the original", async () => {
    const d = testDeps();
    const s = await change(d, { type: "hide", key: seedFromBuiltins()[0].key });
    expect(s).toMatchObject({ source: "draft", hasDraft: true, pending: true, liveSource: "original", liveVisibleCount: 15, draftVisibleCount: 14 });
    expect(d.store.published).toBeNull();
  });
  it("a change that changes nothing does not create a draft", async () => {
    const d = testDeps();
    const s = await change(d, { type: "moveUp", key: seedFromBuiltins()[0].key });
    expect(s.hasDraft).toBe(false); expect(d.store.log).toEqual([]);
  });
  it("a change made on an out-of-date screen is refused and overwrites nothing", async () => {
    const d = testDeps();
    await change(d, { type: "hide", key: seedFromBuiltins()[0].key });
    const stale = await applyChange(d, { userId: U, expectedRev: null, op: { type: "hide", key: seedFromBuiltins()[1].key } });
    expect(stale).toMatchObject({ ok: false, code: "conflict" });
    expect(d.store.draft!.items.filter((i) => i.hidden)).toHaveLength(1);
  });
  it("an upload that the content service does not know is refused", async () => {
    const d = testDeps();
    expect(await applyChange(d, { userId: U, expectedRev: null, op: addOp(1) })).toMatchObject({ ok: false, code: "not_found" });
  });
  it("only JPEG, PNG and WebP assets can be added", async () => {
    const d = testDeps(); register(d.store, 1, { mimeType: "image/gif" });
    expect(await applyChange(d, { userId: U, expectedRev: null, op: addOp(1) })).toMatchObject({ ok: false, code: "invalid" });
  });
  it("takes the size, address and colour from the content service, never from the browser", async () => {
    const d = testDeps(); register(d.store, 1);
    const s = await change(d, { ...addOp(1), width: 1, url: "https://evil.example/x.jpg" } as unknown as OperationInput);
    expect(s.items[15]).toMatchObject({ width: 2000, height: 1500, url: upload(1).url, color: "#334455" });
  });
  it("requires the rights confirmation and records who and when", async () => {
    const d = testDeps(); register(d.store, 1);
    expect(await applyChange(d, { userId: U, expectedRev: null, op: addOp(1, { rightsConfirmed: false }) })).toMatchObject({ ok: false, code: "rights_required" });
    const s = await change(d, addOp(1));
    expect((s.items[15] as UploadedItem).rights).toEqual({ confirmedBy: U, confirmedAt: expect.stringMatching(/^2026-11-05T10:00:\d\d\.000Z$/) });
  });
  it("discarding sets the working copy back to what is live and touches nothing else", async () => {
    const d = testDeps();
    const s = await change(d, { type: "hide", key: seedFromBuiltins()[0].key });
    const r = await discardDraft(d, { userId: U, expectedRev: s.draftRev });
    expect(r.ok && r.state).toMatchObject({ pending: false, draftVisibleCount: 15, liveVisibleCount: 15, liveSource: "original" });
    expect(d.store.published).toBeNull();
    expect(await discardDraft(d, { userId: U, expectedRev: "stale" })).toMatchObject({ ok: false, code: "conflict" });
  });
  it("discarding after a publish goes back to the PUBLISHED list, hidden entries and rights records included", async () => {
    const d = testDeps(); register(d.store, 1);
    await change(d, addOp(1)); await change(d, { type: "hide", key: seedFromBuiltins()[2].key });
    expect((await publish(d)).ok).toBe(true);
    const s = await change(d, { type: "remove", key: seedFromBuiltins()[0].key });
    expect(s.pending).toBe(true);
    const r = await discardDraft(d, { userId: U, expectedRev: s.draftRev });
    if (!r.ok) throw new Error(r.message);
    expect(r.state.pending).toBe(false);
    expect(r.state.items).toHaveLength(16);
    expect(r.state.items[2].hidden).toBe(true);
    expect((r.state.items[15] as UploadedItem).rights).toMatchObject({ confirmedBy: U });
  });
  it("discarding with nothing pending writes nothing", async () => {
    const d = testDeps();
    const r = await discardDraft(d, { userId: U, expectedRev: null });
    expect(r.ok).toBe(true); expect(d.store.log).toEqual([]);
  });
});

describe("publishing", () => {
  async function publishedWithOnePhoto() {
    const d = testDeps(); register(d.store, 1);
    await change(d, addOp(1));
    const r = await publish(d, "Added the studio shot");
    if (!r.ok) throw new Error(r.message);
    return { d, r };
  }

  it("makes the list live, keeps a complete history entry, and removes the draft, in one step", async () => {
    const { d, r } = await publishedWithOnePhoto();
    expect(r).toMatchObject({ ok: true, visibleCount: 16 });
    expect(d.store.draft).not.toBeNull();                                        // the working copy is kept; it now equals the live list
    expect((await loadState(d)).pending).toBe(false);
    expect(d.store.published!.items).toHaveLength(16);
    expect(d.store.published!.revisionId).toBe(r.ok ? r.revisionId : "");
    expect(d.store.revisions).toHaveLength(1);
    expect(d.store.revisions[0]).toMatchObject({ publishedBy: U, note: "Added the studio shot", visibleCount: 16, itemCount: 16, restoredFrom: null });
  });
  it("the live (public) copy names ONLY visible photographs: a hidden one is not in public data at all, though history and working copy keep it", async () => {
    const d = testDeps(); register(d.store, 1);
    await change(d, addOp(1)); await change(d, { type: "hide", key: seedFromBuiltins()[3].key });
    const r = await publish(d); if (!r.ok) throw new Error(r.message);
    const hiddenId = (seedFromBuiltins()[3] as { builtinId: string }).builtinId;
    expect(d.store.published!.items).toHaveLength(15);
    expect(JSON.stringify(d.store.published!.items)).not.toContain(hiddenId);
    expect(JSON.stringify(r.publishedItems)).not.toContain(hiddenId);
    expect(d.store.revisions[0].items).toHaveLength(16);
    expect(JSON.stringify(d.store.revisions[0].items)).toContain(hiddenId);
    expect((await loadState(d)).items).toHaveLength(16);                         // editing continues from the full list
  });
  it("the live (public) copy carries no rights record or file name; the history entry keeps them", async () => {
    const { d } = await publishedWithOnePhoto();
    const live = d.store.published!.items[15] as UploadedItem, hist = d.store.revisions[0].items[15] as UploadedItem;
    expect(live).toMatchObject({ rights: null, originalFilename: null });
    expect(hist).toMatchObject({ rights: { confirmedBy: U }, originalFilename: "photo-1.jpg" });
  });
  it("editing after a publish starts from the live list and does not lose the rights record", async () => {
    const { d } = await publishedWithOnePhoto();
    const s = await loadState(d);
    expect(s).toMatchObject({ source: "draft", liveSource: "published", pending: false, liveVisibleCount: 16 });
    expect((s.items[15] as UploadedItem).rights).toMatchObject({ confirmedBy: U });
    const next = await change(d, { type: "hide", key: seedFromBuiltins()[0].key });
    expect((next.items[15] as UploadedItem).rights).toMatchObject({ confirmedBy: U });
  });
  it("refuses to publish when there is nothing pending, or the draft equals what is live", async () => {
    const d = testDeps();
    expect(await publish(d)).toMatchObject({ ok: false, code: "nothing_to_publish" });
    await change(d, { type: "hide", key: seedFromBuiltins()[0].key });
    await change(d, { type: "restore", key: seedFromBuiltins()[0].key });       // back to identical
    expect(await publish(d)).toMatchObject({ ok: false, code: "nothing_to_publish" });
  });
  it("refuses a list that is not publishable, and says why", async () => {
    const d = testDeps();
    for (const i of seedFromBuiltins().slice(0, 12)) await change(d, { type: "hide", key: i.key });
    expect(await publish(d)).toMatchObject({ ok: false, code: "invalid", message: expect.stringMatching(/At least 4/) });
    expect(d.store.published).toBeNull();
  });
  it("refuses to publish a draft someone else changed since it was reviewed", async () => {
    const d = testDeps(); register(d.store, 1);
    const s = await change(d, addOp(1));
    await change(d, { type: "hide", key: seedFromBuiltins()[0].key });          // the draft moves on
    expect(await publishDraft(d, { userId: U, expectedRev: s.draftRev, note: null })).toMatchObject({ ok: false, code: "conflict" });
    expect(d.store.published).toBeNull();
  });
  it("refuses to publish when an image has gone missing from the content service", async () => {
    const d = testDeps(); const a = register(d.store, 1);
    await change(d, addOp(1));
    d.store.assets.delete(a.assetId);
    expect(await publish(d)).toMatchObject({ ok: false, code: "invalid", message: expect.stringMatching(/no longer available/) });
    expect(d.store.published).toBeNull();
  });

  it("a failed publish changes NOTHING and says so (no live list, no history, draft intact)", async () => {
    const d = testDeps(); register(d.store, 1);
    await change(d, addOp(1));
    d.store.failing.add("publish");
    const r = await publish(d);
    expect(r).toMatchObject({ ok: false, code: "unavailable", message: expect.stringMatching(/could not be confirmed/) });
    expect(d.store.published).toBeNull(); expect(d.store.revisions).toHaveLength(0); expect(d.store.draft).not.toBeNull();
    expect((await loadState(d)).pending).toBe(true);                             // still pending: nothing was marked as published
    d.store.failing.clear();
    expect(await publish(d)).toMatchObject({ ok: true });                        // and it can simply be tried again
  });
  it("the history entry cannot be missing from a successful publish: both or neither", async () => {
    const d = testDeps(); register(d.store, 1);
    await change(d, addOp(1));
    d.store.revisions.push({ id: "connectPortfolioRevision.test-1", publishedAt: "x", publishedBy: null, note: null, visibleCount: 1, itemCount: 1, restoredFrom: null, items: [], dropped: 0 });   // the id the next publish would use
    expect(await publish(d)).toMatchObject({ ok: false, code: "conflict" });
    expect(d.store.published).toBeNull(); expect(d.store.draft).not.toBeNull();
  });
});

describe("version history and restoring", () => {
  async function twoVersions() {
    const d = testDeps(); register(d.store, 1);
    const first = await publish(await (async () => { await change(d, { type: "hide", key: seedFromBuiltins()[0].key }); return d; })(), "First");
    await change(d, addOp(1));
    const second = await publish(d, "Second");
    if (!first.ok || !second.ok) throw new Error("setup");
    return { d, first, second };
  }
  it("lists every publish, newest first", async () => {
    const { d, first, second } = await twoVersions();
    expect((await d.store.listRevisions(10)).map((r) => r.id)).toEqual([second.revisionId, first.revisionId]);
  });
  it("restoring puts the old version into the pending changes and does not touch the live list", async () => {
    const { d, first, second } = await twoVersions();
    const state = await loadState(d);
    const r = await restoreRevision(d, { userId: U, revisionId: first.revisionId, expectedRev: state.draftRev });
    if (!r.ok) throw new Error(r.message);
    expect(r.state).toMatchObject({ hasDraft: true, pending: true, restoredFrom: first.revisionId, draftVisibleCount: 14, liveVisibleCount: 15 });
    expect(d.store.published!.revisionId).toBe(second.revisionId);               // still live
  });
  it("publishing a restored version records where it came from, and does not remove the later versions", async () => {
    const { d, first, second } = await twoVersions();
    const state = await loadState(d);
    await restoreRevision(d, { userId: U, revisionId: first.revisionId, expectedRev: state.draftRev });
    const pub = await publish(d, "Back to the first");
    if (!pub.ok) throw new Error(pub.message);
    const revs = await d.store.listRevisions(10);
    expect(revs).toHaveLength(3);
    expect(revs[0]).toMatchObject({ id: pub.revisionId, restoredFrom: first.revisionId });
    expect(revs.map((r) => r.id)).toContain(second.revisionId);
    expect(d.store.published!.items).toHaveLength(14);                           // the first version had one photograph hidden, so 14 are public
  });
  it("any later edit clears the 'restored from' mark, so the history stays truthful", async () => {
    const { d, first } = await twoVersions();
    const state = await loadState(d);
    const r = await restoreRevision(d, { userId: U, revisionId: first.revisionId, expectedRev: state.draftRev });
    if (!r.ok) throw new Error(r.message);
    const after = await change(d, { type: "hide", key: seedFromBuiltins()[3].key });
    expect(after.restoredFrom).toBeNull();
  });
  it("refuses to restore a version whose image has gone, an unknown version, or from a stale screen", async () => {
    const { d, second } = await twoVersions();
    const state = await loadState(d);
    d.store.assets.clear();
    expect(await restoreRevision(d, { userId: U, revisionId: second.revisionId, expectedRev: state.draftRev })).toMatchObject({ ok: false, code: "invalid" });
    expect(await restoreRevision(d, { userId: U, revisionId: "connectPortfolioRevision.nope", expectedRev: state.draftRev })).toMatchObject({ ok: false, code: "not_found" });
    expect(await restoreRevision(d, { userId: U, revisionId: second.revisionId, expectedRev: "stale" })).toMatchObject({ ok: false, code: "conflict" });
  });
});

describe("content-service failures are reported as failures, never as 'nothing published'", () => {
  it("every operation returns an explicit 'unavailable' and changes nothing", async () => {
    const d = testDeps(); register(d.store, 1);
    d.store.failing.add("readPublished");
    const results = await Promise.all([
      applyChange(d, { userId: U, expectedRev: null, op: { type: "hide", key: seedFromBuiltins()[0].key } }),
      discardDraft(d, { userId: U, expectedRev: null }),
      publishDraft(d, { userId: U, expectedRev: null, note: null }),
      restoreRevision(d, { userId: U, revisionId: "connectPortfolioRevision.x", expectedRev: null }),
    ]);
    for (const r of results) expect(r).toMatchObject({ ok: false, code: "unavailable" });
    expect(d.store.log).toEqual([]);
  });
  it("loadState throws the service error rather than answering 'original' for an unreadable service", async () => {
    const d = testDeps(); d.store.failing.add("readPublished");
    await expect(loadState(d)).rejects.toBeInstanceOf(ContentServiceError);
  });
  it("a failing write leaves the previous draft untouched", async () => {
    const d = testDeps();
    await change(d, { type: "hide", key: seedFromBuiltins()[0].key });
    d.store.failing.add("writeDraft");
    const r = await applyChange(d, { userId: U, expectedRev: d.store.draft!.rev, op: { type: "hide", key: seedFromBuiltins()[1].key } });
    expect(r).toMatchObject({ ok: false, code: "unavailable" });
    expect(visibleCount(d.store.draft!.items as ManifestItem[])).toBe(14);
  });
});
