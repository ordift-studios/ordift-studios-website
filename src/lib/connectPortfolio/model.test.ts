import { describe, expect, it } from "vitest";
import { PORTFOLIO_IMAGES } from "@/app/connect/portfolioImages.generated";
import { LIMITS, altTextProblem, applyOperation, listProblems, parseItems, seedFromBuiltins, sameList, toPublishedItems, uploadProblem, visibleCount, type ManifestItem, type Operation, type UploadedItem } from "./model";
import { ALT, hex, upload } from "./testSupport";

let keyCounter = 0;                                            // keys are unique across the whole test run, as the random keys of the real service are
const ctx = () => ({ userId: "user-1", now: "2026-11-05T10:00:00.000Z", newKey: () => `u-${++keyCounter}` });
const apply = (items: ManifestItem[], op: Operation) => applyOperation(items, op, ctx());
const ok = (items: ManifestItem[], op: Operation) => { const r = apply(items, op); if (!r.ok) throw new Error(r.message); return r.items; };
const add = (items: ManifestItem[], n: number) => ok(items, { type: "addUploaded", upload: upload(n), alt: ALT, rightsConfirmed: true });

describe("the starting list is exactly today's 15, in their approved order", () => {
  it("has 15 built-in photographs, all visible, in the order of the approved list", () => {
    const seed = seedFromBuiltins();
    expect(seed).toHaveLength(15);
    expect(seed.map((i) => (i.kind === "builtin" ? i.builtinId : ""))).toEqual(PORTFOLIO_IMAGES.map((p) => p.id));
    expect(seed.every((i) => !i.hidden)).toBe(true);
  });
});

describe("description (alternative text) rules", () => {
  it("accepts a real description and rejects empty, short, long and file-name text", () => {
    expect(altTextProblem(ALT)).toBeNull();
    expect(altTextProblem("   ")).toMatch(/at least/);
    expect(altTextProblem("short")).toMatch(/at least/);
    expect(altTextProblem("x".repeat(301))).toMatch(/300/);
    expect(altTextProblem("IMG_7020.jpg taken at the venue")).toMatch(/file name/);
    expect(altTextProblem("DSC00123 portrait of a bride")).toMatch(/file name/);
  });
  it("insists on the brand in capitals", () => {
    expect(altTextProblem("A banner reading ORDIFT STUDIOS in gold letters")).toBeNull();
    expect(altTextProblem("A banner reading Ordift Studios in gold letters")).toMatch(/capitals/);
    expect(altTextProblem("A banner reading ordift studios in gold letters")).toMatch(/capitals/);
  });
});

describe("what makes an uploaded image acceptable", () => {
  it("accepts a normal photograph", () => expect(uploadProblem(upload(1))).toBeNull());
  it("rejects a too-small and a too-large photograph", () => {
    expect(uploadProblem(upload(1, { width: 600, height: 400 }))).toMatch(/too small/);
    expect(uploadProblem(upload(1, { width: LIMITS.MAX_LONG_EDGE + 1, height: 100 }))).toMatch(/too large/);
  });
  it("rejects an address that is not on the image host, a malformed asset id and a bad colour", () => {
    expect(uploadProblem(upload(1, { url: "https://example.com/x.jpg" }))).toMatch(/address/);
    expect(uploadProblem(upload(1, { url: "http://cdn.sanity.io/images/p/d/" + hex(1) + "-2000x1500.jpg" }))).toMatch(/address/);
    expect(uploadProblem(upload(1, { assetId: "file-abc-pdf" }))).toMatch(/recognised/);
    expect(uploadProblem(upload(1, { color: "red" }))).toMatch(/colour/);
  });
});

describe("editing operations", () => {
  const seed = seedFromBuiltins;
  it("never changes the list it is given", () => {
    const before = seed(), snapshot = JSON.stringify(before);
    ok(before, { type: "hide", key: before[0].key }); ok(before, { type: "moveDown", key: before[0].key }); ok(before, { type: "remove", key: before[3].key });
    expect(JSON.stringify(before)).toBe(snapshot);
  });
  it("moves a photograph up and down, and does nothing at the ends", () => {
    const s = seed();
    const down = ok(s, { type: "moveDown", key: s[0].key });
    expect([down[0].key, down[1].key]).toEqual([s[1].key, s[0].key]);
    const up = ok(down, { type: "moveUp", key: s[0].key });
    expect(up.map((i) => i.key)).toEqual(s.map((i) => i.key));
    expect(ok(s, { type: "moveUp", key: s[0].key }).map((i) => i.key)).toEqual(s.map((i) => i.key));
    expect(ok(s, { type: "moveDown", key: s[14].key }).map((i) => i.key)).toEqual(s.map((i) => i.key));
  });
  it("moves to a position, clamped to the list", () => {
    const s = seed();
    expect(ok(s, { type: "moveTo", key: s[0].key, index: 4 })[4].key).toBe(s[0].key);
    expect(ok(s, { type: "moveTo", key: s[0].key, index: 999 })[14].key).toBe(s[0].key);
    expect(apply(s, { type: "moveTo", key: s[0].key, index: 1.5 }).ok).toBe(false);
  });
  it("hides and restores a photograph without removing it", () => {
    const s = seed();
    const hidden = ok(s, { type: "hide", key: s[2].key });
    expect(hidden).toHaveLength(15); expect(hidden[2].hidden).toBe(true); expect(visibleCount(hidden)).toBe(14);
    expect(ok(hidden, { type: "restore", key: s[2].key })[2].hidden).toBe(false);
  });
  it("removes a photograph from the list only, and an original can be added back", () => {
    const s = seed();
    const removed = ok(s, { type: "remove", key: s[5].key });
    expect(removed).toHaveLength(14);
    const builtinId = (s[5] as { builtinId: string }).builtinId;
    const back = ok(removed, { type: "addBuiltin", builtinId });
    expect(back).toHaveLength(15); expect(back[14].kind === "builtin" && back[14].builtinId).toBe(builtinId);
    expect(apply(s, { type: "addBuiltin", builtinId }).ok).toBe(false);                      // already there
    expect(apply(s, { type: "addBuiltin", builtinId: "not-a-photograph" }).ok).toBe(false);
  });
  it("says so when the photograph is no longer in the list", () => {
    const r = apply(seed(), { type: "hide", key: "gone" });
    expect(r).toMatchObject({ ok: false, code: "not_found" });
  });
  it("adds an uploaded photograph at the end, visible, with who confirmed the rights and when", () => {
    const items = add(seed(), 1);
    const added = items[15] as UploadedItem;
    expect(added).toMatchObject({ kind: "uploaded", hidden: false, alt: ALT, replaces: null, originalFilename: "photo-1.jpg", rights: { confirmedBy: "user-1", confirmedAt: "2026-11-05T10:00:00.000Z" } });
  });
  it("refuses an added or replacement photograph without the rights confirmation", () => {
    expect(apply(seed(), { type: "addUploaded", upload: upload(1), alt: ALT, rightsConfirmed: false })).toMatchObject({ ok: false, code: "rights_required" });
    const s = seed();
    expect(apply(s, { type: "replace", key: s[0].key, upload: upload(1), alt: ALT, rightsConfirmed: false })).toMatchObject({ ok: false, code: "rights_required" });
  });
  it("refuses a bad description, a bad image and the same image twice", () => {
    expect(apply(seedFromBuiltins(), { type: "addUploaded", upload: upload(1), alt: "IMG_001.jpg", rightsConfirmed: true }).ok).toBe(false);
    expect(apply(seedFromBuiltins(), { type: "addUploaded", upload: upload(1, { width: 300, height: 300 }), alt: ALT, rightsConfirmed: true }).ok).toBe(false);
    expect(apply(add(seedFromBuiltins(), 1), { type: "addUploaded", upload: upload(1), alt: ALT, rightsConfirmed: true })).toMatchObject({ ok: false, code: "invalid" });
  });
  it("replaces in place: keeps the position and visibility, records what it replaced, and leaves the replaced original untouched elsewhere", () => {
    const s = ok(seedFromBuiltins(), { type: "hide", key: seedFromBuiltins()[2].key });
    const r = ok(s, { type: "replace", key: s[2].key, upload: upload(7), alt: ALT, rightsConfirmed: true });
    expect(r).toHaveLength(15);
    expect(r[2]).toMatchObject({ kind: "uploaded", hidden: true, replaces: (s[2] as { builtinId: string }).builtinId });
    expect(r.filter((_, i) => i !== 2).map((i) => i.key)).toEqual(s.filter((_, i) => i !== 2).map((i) => i.key));
    const again = ok(r, { type: "replace", key: r[2].key, upload: upload(8), alt: ALT, rightsConfirmed: true });
    expect((again[2] as UploadedItem).replaces).toBe(upload(7).assetId);
  });
  it("edits the description of an added photograph only", () => {
    const items = add(seedFromBuiltins(), 1);
    const edited = ok(items, { type: "editAlt", key: items[15].key, alt: "Two guests laugh together beneath a crystal chandelier" });
    expect((edited[15] as UploadedItem).alt).toBe("Two guests laugh together beneath a crystal chandelier");
    expect(apply(items, { type: "editAlt", key: items[0].key, alt: ALT })).toMatchObject({ ok: false, code: "invalid" });
    expect(apply(items, { type: "editAlt", key: items[15].key, alt: "x" }).ok).toBe(false);
  });
  it("resets to the original 15", () => {
    const changed = ok(add(seedFromBuiltins(), 1), { type: "remove", key: seedFromBuiltins()[0].key });
    expect(sameList(ok(changed, { type: "resetToOriginal" }), seedFromBuiltins())).toBe(true);
  });
});

describe("the 30-photograph limit counts visible photographs", () => {
  it("allows exactly 30 visible, refuses the 31st, and hidden ones do not count", () => {
    let items = seedFromBuiltins();
    for (let n = 1; n <= 15; n++) items = add(items, n);
    expect(visibleCount(items)).toBe(30);
    expect(apply(items, { type: "addUploaded", upload: upload(99), alt: ALT, rightsConfirmed: true })).toMatchObject({ ok: false, code: "limit" });
    const hidden = ok(items, { type: "hide", key: items[0].key });
    const withMore = add(hidden, 99);
    expect(visibleCount(withMore)).toBe(30); expect(withMore).toHaveLength(31);
    expect(apply(withMore, { type: "restore", key: items[0].key })).toMatchObject({ ok: false, code: "limit" });     // restoring would make 31
  });
  it("limits the total list, hidden included", () => {
    let items = seedFromBuiltins().map((i) => ({ ...i, hidden: true }));
    for (let n = 1; n <= 45; n++) items = ok(items, { type: "addUploaded", upload: upload(n), alt: ALT, rightsConfirmed: true }).map((i) => ({ ...i, hidden: true }));
    expect(items).toHaveLength(LIMITS.MAX_ITEMS);
    expect(apply(items, { type: "addUploaded", upload: upload(500), alt: ALT, rightsConfirmed: true })).toMatchObject({ ok: false, code: "limit" });
  });
});

describe("list validation for saving and publishing", () => {
  it("a list of the original 15 is publishable", () => expect(listProblems(seedFromBuiltins(), { forPublish: true })).toEqual([]));
  it("will not publish fewer visible photographs than the card page needs for its slideshow", () => {
    const few = seedFromBuiltins().map((i, n) => ({ ...i, hidden: n >= 3 }));
    expect(listProblems(few)).toEqual([]);
    expect(listProblems(few, { forPublish: true })[0]).toMatch(/At least 4/);
  });
  it("flags duplicates and unknown built-ins", () => {
    const s = seedFromBuiltins();
    expect(listProblems([...s, { ...s[0], key: "other" }]).join(" ")).toMatch(/twice/);
    expect(listProblems([{ kind: "builtin", key: "x", builtinId: "nope", hidden: false }]).join(" ")).toMatch(/Unknown built-in/);
  });
});

describe("reading stored data (never trusted)", () => {
  it("round-trips a list through the stored shape", () => {
    const items = add(seedFromBuiltins(), 1);
    const stored = items.map((i) => (i.kind === "builtin" ? { _key: i.key, kind: "builtin", builtinId: i.builtinId, hidden: i.hidden } : { _key: i.key, kind: "uploaded", hidden: i.hidden, image: { asset: { _ref: i.assetId } }, url: i.url, width: i.width, height: i.height, color: i.color, alt: i.alt, originalFilename: i.originalFilename, rights: i.rights, replaces: i.replaces }));
    const parsed = parseItems(stored);
    expect(parsed.dropped).toBe(0);
    expect(sameList(parsed.items, items)).toBe(true);
  });
  it("drops malformed entries, unknown built-ins, foreign addresses and duplicates, and counts them", () => {
    const s = seedFromBuiltins();
    const good = { _key: "b-1", kind: "builtin", builtinId: s[0].kind === "builtin" ? s[0].builtinId : "", hidden: false };
    const raw = [good, { ...good }, { _key: "x", kind: "builtin", builtinId: "nope" }, { _key: "y", kind: "uploaded", image: { asset: { _ref: upload(1).assetId } }, url: "https://evil.example/x.jpg", width: 2000, height: 1500, color: "#112233", alt: ALT }, "text", null, { kind: "builtin" }];
    const { items, dropped } = parseItems(raw);
    expect(items).toHaveLength(1); expect(dropped).toBe(6);
  });
  it("treats a missing list as empty and a non-list as unreadable", () => {
    expect(parseItems(undefined)).toEqual({ items: [], dropped: 0 });
    expect(parseItems("nope")).toEqual({ items: [], dropped: 1 });
  });
  it("the published copy carries nothing private: no rights record, no file name, no replaced reference", () => {
    const items = add(seedFromBuiltins(), 1);
    const pub = toPublishedItems(items)[15] as UploadedItem;
    expect(pub).toMatchObject({ originalFilename: null, rights: null, replaces: null, alt: ALT, url: upload(1).url });
    expect(JSON.stringify(toPublishedItems(items))).not.toMatch(/user-1|photo-1\.jpg/);
  });
});
