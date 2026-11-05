// @vitest-environment node
import { readFileSync } from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ADMIN_NAV_GROUPS } from "@/lib/portal/adminNavigation";
import { MemoryStore } from "@/lib/connectPortfolio/memoryStore";
import { seedFromBuiltins } from "@/lib/connectPortfolio/model";
import { ALT, register, upload } from "@/lib/connectPortfolio/testSupport";

type Role = "client" | "vendor" | "contractor" | "model" | "workshop_participant" | "staff" | "admin" | "super_admin";
const h = vi.hoisted(() => ({ current: null as { id: string; roles: string[] } | null, store: null as unknown, audit: [] as { action: string }[], auditOk: true, tags: [] as string[], paths: [] as string[], tagThrows: false, snaps: [] as { kind: string; items?: { hidden: boolean }[] }[], snapFails: false }));

vi.mock("@/lib/portal/roles", () => ({ getCurrentUser: async () => h.current, isSuperAdmin: (u: { roles: string[] } | null) => u?.roles.includes("super_admin") ?? false }));
vi.mock("@/lib/connectPortfolio/defaultStore", () => ({ getStore: () => h.store }));
vi.mock("@/lib/connectPortfolio/audit", () => ({ recordAudit: async (e: { action: string }) => { h.audit.push(e); return h.auditOk; } }));
vi.mock("@/lib/portal/actorIdentity", () => ({ resolveActorIdentities: async (ids: string[]) => new Map(ids.map((id) => [id, { id, fullName: "Test Person", memberNumber: "INT0001" }])), formatActorLabel: (i: { memberNumber: string; fullName: string }) => `${i.memberNumber} — ${i.fullName}` }));
vi.mock("@/lib/connectPortfolio/snapshot", async (orig) => ({ ...(await orig<typeof import("@/lib/connectPortfolio/snapshot")>()), defaultSnapshotStore: { read: async () => null, write: async (s: { kind: string; items?: { hidden: boolean }[] }) => { if (h.snapFails) throw new Error("redis down"); h.snaps.push(s); } } }));
vi.mock("next/cache", () => ({ updateTag: (t: string) => { if (h.tagThrows) throw new Error("cache down"); h.tags.push(t); }, revalidatePath: (p: string) => { h.paths.push(p); } }));
vi.mock("next/navigation", async (orig) => ({ ...(await orig<typeof import("next/navigation")>()), useRouter: () => ({ refresh() {} }) }));

import QrPortfolioPage from "./page";
import { changeDraftAction, discardDraftAction, publishAction, restoreRevisionAction } from "./actions";

const as = (...roles: Role[]) => { h.current = { id: "user-1", roles }; };
const NOT_SUPER: Role[][] = [["client"], ["vendor"], ["contractor"], ["model"], ["workshop_participant"], ["staff"], ["admin"], ["staff", "admin"], []];
const store = () => h.store as MemoryStore;
const rejects = async (re: RegExp) => { try { await QrPortfolioPage(); return null; } catch (e) { const d = (e as { digest?: string }).digest ?? ""; return re.test(d) ? d : `unexpected: ${d || String(e)}`; } };

beforeEach(() => { h.current = null; h.store = new MemoryStore(); h.audit = []; h.auditOk = true; h.tags = []; h.paths = []; h.tagThrows = false; h.snaps = []; h.snapFails = false; });

describe("the manager page is Super Admin only", () => {
  it("signed out is sent to sign in and comes back to this page", async () => {
    expect(await rejects(/NEXT_REDIRECT/)).toContain("/portal/login?next=/admin/qr-codes/portfolio");
  });
  it("every signed-in role except Super Admin gets the ordinary not-found page", async () => {
    for (const roles of NOT_SUPER) { h.current = { id: "u2", roles }; expect(await rejects(/NEXT_HTTP_ERROR_FALLBACK;404/), roles.join("+") || "no roles").toMatch(/404/); }
  });
  it("a Super Admin sees the manager with the original 15 and everything it can do", async () => {
    as("super_admin");
    const html = renderToStaticMarkup(await QrPortfolioPage());
    expect(html).toContain("QR portfolio");
    expect(html).toContain("Photographs (15)");
    for (const label of ["Preview pending changes", "Publish changes", "Discard pending changes", "Reset to the original 15", "Version history", "Add a photograph", "Remove from QR portfolio", "Move up", "Hide", "Replace"]) expect(html, label).toContain(label);
    expect(html).toContain("The original 15, unchanged");
    expect(html).not.toContain("Original photographs not in the list");       // all 15 are in the list, so there is nothing to add back
  });
  it("the rights confirmation is a required step before a photograph can be added (the add button depends on it)", () => {
    const src = readFileSync(path.join(process.cwd(), "src/app/admin/qr-codes/portfolio/PortfolioManager.tsx"), "utf8");
    expect(src).toContain("I confirm that ORDIFT STUDIOS has the right to publish this photograph");
    expect(src).toMatch(/disabled=\{busy \|\| !rights \|\| alt\.trim\(\)\.length < 10\}/);
  });
  it("if the content service cannot be read, it says so, turns editing off, and never suggests nothing is published", async () => {
    as("super_admin"); store().failing.add("readPublished");
    const html = renderToStaticMarkup(await QrPortfolioPage());
    expect(html).toContain("The content service is not responding");
    expect(html).toContain("the card page keeps showing what it showed before");
    expect(html).not.toContain("Publish changes");
    expect(html).not.toContain("The original 15, unchanged");
  });
  it("is marked noindex and is not linked from the public site", async () => {
    const { metadata } = await import("./page");
    expect(metadata.robots).toEqual({ index: false, follow: false });
    expect(readFileSync(path.join(process.cwd(), "src/app/sitemap.ts"), "utf8")).not.toMatch(/qr-codes/);
  });
});

describe("every action checks the Super Admin on the server", () => {
  const calls = () => [
    () => changeDraftAction(null, { type: "hide", key: "x" }),
    () => discardDraftAction(null),
    () => publishAction(null, null),
    () => restoreRevisionAction("connectPortfolioRevision.x", null),
  ];
  it("signed out: each is refused before anything happens", async () => {
    for (const run of calls()) await expect(run()).rejects.toThrow("Not authorized.");
    expect(store().log).toEqual([]); expect(h.audit).toEqual([]); expect(h.tags).toEqual([]);
  });
  it("every other role: each is refused, nothing is read or written, nothing is audited, no cache is touched", async () => {
    for (const roles of NOT_SUPER) {
      h.current = { id: "u2", roles };
      for (const run of calls()) await expect(run(), roles.join("+") || "no roles").rejects.toThrow("Not authorized.");
    }
    expect(store().log).toEqual([]); expect(store().draft).toBeNull(); expect(h.audit).toEqual([]); expect(h.tags).toEqual([]);
  });
  it("a Super Admin who also holds other roles is served", async () => {
    as("super_admin", "admin", "staff");
    expect(await changeDraftAction(null, { type: "hide", key: seedFromBuiltins()[0].key })).toMatchObject({ ok: true });
  });
  it("refuses a request that is not a valid operation, without touching anything", async () => {
    as("super_admin");
    for (const bad of [null, "hide", {}, { type: "nope" }, { type: "hide" }, { type: "moveTo", key: "a", index: -1 }, { type: "addUploaded", assetId: "a" }, { type: "addUploaded", assetId: "a", alt: "x", rightsConfirmed: "yes" }, { type: "hide", key: "x".repeat(200) }]) {
      expect(await changeDraftAction(null, bad), JSON.stringify(bad)).toMatchObject({ ok: false, code: "invalid" });
    }
    expect(store().log).toEqual([]);
  });
});

describe("draft and publish through the actions", () => {
  it("editing changes only the draft: visitors' cache is not touched, and the change is audited", async () => {
    as("super_admin");
    const r = await changeDraftAction(null, { type: "hide", key: seedFromBuiltins()[0].key });
    expect(r).toMatchObject({ ok: true, message: expect.stringContaining("Visitors still see the published version") });
    expect(h.tags).toEqual([]); expect(h.paths).toEqual([]);
    expect(h.audit.map((a) => a.action)).toEqual(["qr_portfolio.draft_changed"]);
    expect(r.ok && r.view.pending).toBe(true);
  });

  async function stage() {
    as("super_admin"); register(store(), 1);
    const added = await changeDraftAction(null, { type: "addUploaded", assetId: upload(1).assetId, filename: "a.jpg", alt: ALT, rightsConfirmed: true });
    if (!added.ok) throw new Error(added.message);
    return added.view.draftRev;
  }

  it("publishing expires the card page's cache (tag and path) so the next scan shows the change, and audits it", async () => {
    const rev = await stage();
    const r = await publishAction(rev, "Studio shot");
    expect(r).toMatchObject({ ok: true, warnings: [], message: expect.stringContaining("16 photographs") });
    expect(h.tags).toEqual(["connect-portfolio"]);
    expect(h.paths).toContain("/connect");
    expect(h.audit.map((a) => a.action)).toContain("qr_portfolio.published");
    expect(h.snaps).toHaveLength(1);                                           // the outage record is updated at the moment of publishing
    expect(h.snaps[0]).toMatchObject({ kind: "published" }); expect(h.snaps[0].items).toHaveLength(16); expect(h.snaps[0].items!.every((i) => !i.hidden)).toBe(true);
    expect(store().published!.items).toHaveLength(16);
    expect(r.ok && r.view).toMatchObject({ pending: false, liveSource: "published", liveVisibleCount: 16 });
    expect(r.ok && r.view.revisions[0]).toMatchObject({ note: "Studio shot", byLabel: "INT0001 — Test Person" });
  });
  it("a hidden photograph is in neither the live list nor the outage record", async () => {
    const rev = await stage();
    const hid = await changeDraftAction(rev, { type: "hide", key: seedFromBuiltins()[1].key });
    if (!hid.ok) throw new Error(hid.message);
    const hiddenId = (seedFromBuiltins()[1] as { builtinId: string }).builtinId;
    expect(await publishAction(hid.view.draftRev, null)).toMatchObject({ ok: true });
    expect(JSON.stringify(store().published!.items)).not.toContain(hiddenId);
    expect(JSON.stringify(h.snaps[0])).not.toContain(hiddenId);
  });
  it("if only the outage record cannot be saved, the publish stands and the screen says it will be saved on the next visit", async () => {
    const rev = await stage(); h.snapFails = true;
    const r = await publishAction(rev, null);
    expect(r).toMatchObject({ ok: true });
    expect(r.ok && r.warnings.join(" ")).toMatch(/outage-protection copy could not be saved yet/);
    expect(store().published).not.toBeNull();
  });
  it("a failed publish reports failure and touches NO cache and writes NO 'published' audit entry", async () => {
    const rev = await stage(); store().failing.add("publish"); h.audit = [];
    const r = await publishAction(rev, null);
    expect(r).toMatchObject({ ok: false, code: "unavailable" });
    expect(h.tags).toEqual([]); expect(h.paths).toEqual([]);
    expect(h.audit).toEqual([]); expect(h.snaps).toEqual([]);
    expect(store().published).toBeNull(); expect(store().revisions).toHaveLength(0);
  });
  it("if only the audit entry fails, the publish stands and the screen says exactly that", async () => {
    const rev = await stage(); h.auditOk = false;
    const r = await publishAction(rev, null);
    expect(r).toMatchObject({ ok: true });
    expect(r.ok && r.warnings.join(" ")).toMatch(/audit entry could not be recorded/);
    expect(store().published).not.toBeNull(); expect(store().revisions).toHaveLength(1);
  });
  it("if only the cache refresh fails, the publish stands and the screen says the change may take up to 5 minutes", async () => {
    const rev = await stage(); h.tagThrows = true;
    const r = await publishAction(rev, null);
    expect(r).toMatchObject({ ok: true });
    expect(r.ok && r.warnings.join(" ")).toMatch(/within 5 minutes/);
    expect(store().published).not.toBeNull();
  });
  it("publishing a stale screen is refused", async () => {
    await stage();
    expect(await publishAction("old-rev", null)).toMatchObject({ ok: false, code: "conflict" });
    expect(store().published).toBeNull(); expect(h.tags).toEqual([]);
  });
  it("discard and restore leave visitors' cache alone", async () => {
    const rev = await stage();
    const pub = await publishAction(rev, null); h.tags = []; h.paths = [];
    expect(pub.ok).toBe(true);
    const revisionId = store().revisions[0].id;
    expect(await restoreRevisionAction(revisionId, store().draft!.rev)).toMatchObject({ ok: true, view: { hasDraft: true, restoredFrom: revisionId } });     // the working copy is kept after a publish, so its revision is the one to pass
    const draftRev = store().draft!.rev;
    expect(await discardDraftAction(draftRev)).toMatchObject({ ok: true, view: { pending: false } });
    expect(h.tags).toEqual([]); expect(h.paths).toEqual([]);
  });
});

describe("navigation and the existing QR pages", () => {
  it("the QR page links to the manager; the menu entry for the QR section is still Super Admin only", () => {
    const entries = ADMIN_NAV_GROUPS.flatMap((g) => g.items).filter((i) => i.href.startsWith("/admin/qr-codes"));
    expect(entries.map((i) => i.href)).toEqual(["/admin/qr-codes"]);
    expect(entries[0].superAdminOnly).toBe(true);
  });
});
