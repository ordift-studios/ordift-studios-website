// @vitest-environment node
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { ADMIN_NAV_GROUPS, resolveVisibleAdminNavGroups, type AdminNavFlags } from "@/lib/portal/adminNavigation";
import { CONNECT_QR_MASTER } from "@/lib/qr/connectQrMaster.generated";

// The real role helpers read Supabase; the guard under test is the pair getCurrentUser() + isSuperAdmin(user), so the identity is supplied here and isSuperAdmin keeps its real meaning.
type Role = "client" | "vendor" | "contractor" | "model" | "workshop_participant" | "staff" | "admin" | "super_admin";
let current: { id: string; roles: Role[] } | null = null;
vi.mock("@/lib/portal/roles", () => ({
  getCurrentUser: async () => current,
  isSuperAdmin: (u: { roles: string[] } | null) => u?.roles.includes("super_admin") ?? false,
}));

import QrCodesPage from "./page";
import { GET as getPng } from "./download/png/route";
import { GET as getSvg } from "./download/svg/route";

const sha = (b: Uint8Array | Buffer) => createHash("sha256").update(b).digest("hex");
const as = (...roles: Role[]) => { current = { id: "user-1", roles }; };
beforeEach(() => { current = null; });

const NOT_SUPER: Role[][] = [["client"], ["vendor"], ["contractor"], ["model"], ["workshop_participant"], ["staff"], ["admin"], ["staff", "admin"], []];   // [] = suspended or deactivated (roles are emptied centrally)

describe("the two downloads are Super Admin only", () => {
  for (const [name, GET, format] of [["PNG", getPng, "png"], ["SVG", getSvg, "svg"]] as const) {
    it(`${name}: signed out gets "not found", with nothing cacheable and no file`, async () => {
      current = null;
      const res = await GET();
      expect(res.status).toBe(404);
      expect(await res.text()).toBe("Not found");
      expect(res.headers.get("Cache-Control")).toBe("private, no-store");
      expect(res.headers.get("Content-Disposition")).toBeNull();
    });
    it(`${name}: every signed-in role except Super Admin gets "not found" (client, vendor, collaborator, model, participant, staff, admin, suspended)`, async () => {
      for (const roles of NOT_SUPER) {
        current = { id: "user-2", roles };
        const res = await GET();
        expect(res.status, roles.join("+") || "no roles").toBe(404);
        expect(res.headers.get("Content-Disposition")).toBeNull();
        expect((await res.arrayBuffer()).byteLength).toBe("Not found".length);
      }
    });
    it(`${name}: a Super Admin receives the exact approved master as an attachment, private and unindexed`, async () => {
      as("super_admin");
      const res = await GET();
      expect(res.status).toBe(200);
      expect(sha(Buffer.from(await res.arrayBuffer()))).toBe(CONNECT_QR_MASTER[format].sha256);
      expect(res.headers.get("Content-Disposition")).toBe(`attachment; filename="ordift-studios-connect-qr.${format}"`);
      expect(res.headers.get("Cache-Control")).toBe("private, no-store");
      expect(res.headers.get("X-Robots-Tag")).toBe("noindex, nofollow");
    });
    it(`${name}: a Super Admin who also holds other roles is still served`, async () => {
      as("super_admin", "admin", "staff");
      expect((await GET()).status).toBe(200);
    });
  }
  it("each route takes no parameters and exports GET only (no way to ask for a different code)", () => {
    for (const f of ["png", "svg"]) {
      const src = readFileSync(path.join(process.cwd(), `src/app/admin/qr-codes/download/${f}/route.ts`), "utf8");
      expect([...src.matchAll(/export (?:async )?function (\w+)/g)].map((m) => m[1])).toEqual(["GET"]);
      expect(src).toContain("!isSuperAdmin(user)");
      expect(src).toMatch(/export async function GET\(\)/);
    }
  });
});

describe("the page is Super Admin only", () => {
  const rejects = async (digest: RegExp) => { try { await QrCodesPage(); return null; } catch (e) { const d = (e as { digest?: string }).digest ?? ""; return digest.test(d) ? d : `unexpected: ${d || String(e)}`; } };
  it("signed out is sent to sign in, and comes back to this page afterwards", async () => {
    current = null;
    const d = await rejects(/NEXT_REDIRECT/);
    expect(d).toContain("/portal/login?next=/admin/qr-codes");
  });
  it("every signed-in role except Super Admin gets the ordinary not-found page (the page does not reveal itself)", async () => {
    for (const roles of NOT_SUPER) {
      current = { id: "user-2", roles };
      expect(await rejects(/NEXT_HTTP_ERROR_FALLBACK;404/), roles.join("+") || "no roles").toMatch(/404/);
    }
  });
  it("a Super Admin sees the manager", async () => {
    as("super_admin");
    const html = renderToStaticMarkup(await QrCodesPage());
    expect(html).toContain("Digital Business Card (QR code)");
  });
});

describe("what a Super Admin sees", () => {
  let html = "", visible = "";
  beforeAll(async () => {
    as("super_admin");
    html = renderToStaticMarkup(await QrCodesPage());
    visible = html.replace(/<[^>]+>/g, " ").replace(/&rsquo;/g, "’").replace(/\s+/g, " ");
  });
  it("shows a preview of the permanent QR code (the embedded SVG master) with a descriptive alternative text", () => {
    const m = html.match(/<img src="data:image\/svg\+xml;base64,([^"]+)"[^>]*alt="([^"]*)"/)!;
    expect(Buffer.from(m[1], "base64").toString("utf8")).toBe(CONNECT_QR_MASTER.svg.text);
    expect(m[2]).toBe("QR code that opens https://ordiftstudios.com/connect");
  });
  it("shows the fixed destination and the Copy URL action", () => {
    expect(html).toMatch(/data-testid="qr-destination"[^>]*>https:\/\/ordiftstudios\.com\/connect</);
    expect(html).toMatch(/<button[^>]*>Copy URL<\/button>/);
  });
  it("offers the two downloads, pointing at the Super Admin-only routes", () => {
    expect(html).toMatch(/<a href="\/admin\/qr-codes\/download\/png"[^>]*>Download PNG<\/a>/);
    expect(html).toMatch(/<a href="\/admin\/qr-codes\/download\/svg"[^>]*>Download SVG<\/a>/);
  });
  it("explains that the QR code stays the same when the portfolio or contact details are updated", () => {
    expect(visible).toContain("This QR code never changes");
    expect(visible).toMatch(/update the portfolio, replace photographs, change the design, or change the phone numbers, email, WhatsApp or Instagram link, the QR code stays exactly the same/);
    expect(visible).toMatch(/already printed keep working/);
  });
  it("states that the address cannot be edited, and offers no way to edit it", () => {
    expect(visible).toContain("The address is fixed and cannot be edited here");
    expect(html).not.toMatch(/<form|<input|<textarea|<select|contenteditable|formAction|name="url"/i);
  });
  it("contains no other web address than the destination, the data: preview and the two download paths", () => {
    const urls = (html.match(/https?:\/\/[^"<\s]+/g) ?? []).filter((u) => !u.startsWith("http://www.w3.org"));
    expect([...new Set(urls)]).toEqual(["https://ordiftstudios.com/connect"]);
  });
  it("is marked noindex and never cached publicly (metadata)", async () => {
    const { metadata } = await import("./page");
    expect(metadata.robots).toEqual({ index: false, follow: false });
  });
});

describe("navigation: Super Admin only, in Content & Website", () => {
  const flags = (o: Partial<AdminNavFlags>): AdminNavFlags => ({ hasAssignments: false, isAdmin: false, isSuper: false, isExecutive: false, isWorkforceAdmin: false, canCoordinateOperations: false, canAdministerPartnerships: false, ...o });
  const labelsFor = (f: AdminNavFlags) => resolveVisibleAdminNavGroups(f).flatMap((g) => g.items).map((i) => i.href);
  it("exists once, flagged Super Admin only, in the Content & Website group, and points at a real page", () => {
    const all = ADMIN_NAV_GROUPS.flatMap((g) => g.items).filter((i) => i.href === "/admin/qr-codes");
    expect(all).toHaveLength(1);
    expect(all[0].superAdminOnly).toBe(true);
    expect(ADMIN_NAV_GROUPS.find((g) => g.label === "Content & Website")?.items.some((i) => i.href === "/admin/qr-codes")).toBe(true);
    expect(existsSync(path.join(process.cwd(), "src/app/admin/qr-codes/page.tsx"))).toBe(true);
  });
  it("a Super Admin sees it; admins, executives, workforce/operations administrators and staff do not", () => {
    expect(labelsFor(flags({ isSuper: true, isAdmin: true }))).toContain("/admin/qr-codes");
    for (const f of [flags({ isAdmin: true }), flags({ isAdmin: true, isExecutive: true, isWorkforceAdmin: true, canCoordinateOperations: true, canAdministerPartnerships: true }), flags({})]) expect(labelsFor(f)).not.toContain("/admin/qr-codes");
  });
  it("is not reachable from the public site: no public route, link or sitemap entry mentions it", () => {
    const sitemap = readFileSync(path.join(process.cwd(), "src/app/sitemap.ts"), "utf8");
    const robots = readFileSync(path.join(process.cwd(), "src/app/robots.ts"), "utf8");
    expect(sitemap).not.toMatch(/qr-codes/);
    expect(robots).toMatch(/Disallow|disallow: \[[^\]]*"\/admin"/);                                         // /admin (and so this section) is disallowed to crawlers
    expect(existsSync(path.join(process.cwd(), "public/connect/qr"))).toBe(false);
  });
});
