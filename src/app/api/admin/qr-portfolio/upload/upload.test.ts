// @vitest-environment node
import { readFileSync } from "node:fs";
import path from "node:path";
import type { NextRequest } from "next/server";
import sharp from "sharp";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryStore } from "@/lib/connectPortfolio/memoryStore";
import { upload as uploadRef } from "@/lib/connectPortfolio/testSupport";

const h = vi.hoisted(() => ({ current: null as { id: string; roles: string[] } | null, store: null as unknown, audit: [] as { action: string; metadata?: Record<string, unknown> }[] }));
vi.mock("@/lib/portal/roles", () => ({ getCurrentUser: async () => h.current, isSuperAdmin: (u: { roles: string[] } | null) => u?.roles.includes("super_admin") ?? false }));
vi.mock("@/lib/connectPortfolio/defaultStore", () => ({ getStore: () => h.store }));
vi.mock("@/lib/connectPortfolio/audit", () => ({ recordAudit: async (e: { action: string; metadata?: Record<string, unknown> }) => { h.audit.push(e); return true; } }));

import { POST } from "./route";

// Real images, so the route's metadata removal and the type checks are exercised on genuine files. The JPEG carries camera, copyright and GPS location details.
const picture = () => sharp({ create: { width: 320, height: 240, channels: 3, background: "#aa3344" } }).composite([{ input: Buffer.from('<svg width="320" height="240"><circle cx="100" cy="100" r="70" fill="#2244cc"/></svg>') }]);
const GPS = { IFD3: { GPSLatitudeRef: "N", GPSLatitude: "51/1 30/1 0/1", GPSLongitudeRef: "W", GPSLongitude: "0/1 7/1 0/1" } };
let JPEG: Buffer, PNG: Buffer, WEBP: Buffer;
beforeAll(async () => {
  JPEG = await picture().jpeg().withExif({ IFD0: { Copyright: "Secret Photographer", Make: "ACME Camera" }, ...GPS }).toBuffer();
  PNG = await picture().png().toBuffer();
  WEBP = await picture().webp().toBuffer();
});
const store = () => h.store as MemoryStore;
let userCounter = 0;                                                    // a fresh user per test, so the upload limit of one test never affects another
const as = (...roles: string[]) => { h.current = { id: `user-${++userCounter}`, roles }; };
const post = (file: Buffer | null, type = "image/jpeg", name = "photo.jpg", extra: Record<string, string> = {}) => {
  const form = new FormData();
  if (file) form.append("file", new File([new Uint8Array(file)], name, { type }));
  for (const [k, v] of Object.entries(extra)) form.append(k, v);
  return POST(new Request("http://localhost/api/admin/qr-portfolio/upload", { method: "POST", body: form }) as unknown as NextRequest);
};
beforeEach(() => { h.current = null; h.store = new MemoryStore(); h.audit = []; });
const synthetic = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]), Buffer.from("JFIF\0"), Buffer.alloc(200, 1)]);   // starts like a JPEG but is not one

describe("who may upload", () => {
  it("signed out and every role except Super Admin get 403 and nothing is stored", async () => {
    for (const roles of [null, [], ["client"], ["vendor"], ["contractor"], ["model"], ["workshop_participant"], ["staff"], ["admin"], ["staff", "admin"]] as (string[] | null)[]) {
      h.current = roles ? { id: "u", roles } : null;
      const res = await post(JPEG);
      expect(res.status, JSON.stringify(roles)).toBe(403);
    }
    expect(store().assets.size).toBe(0); expect(h.audit).toEqual([]);
  });
  it("a Super Admin who also holds other roles may", async () => { as("super_admin", "admin"); expect((await post(JPEG)).status).toBe(200); });
});

describe("what may be uploaded", () => {
  beforeEach(() => as("super_admin"));
  it("accepts a JPEG, a PNG and a WebP that really are what they say", async () => {
    for (const [buf, type, name] of [[JPEG, "image/jpeg", "a.jpg"], [PNG, "image/png", "a.png"], [WEBP, "image/webp", "a.webp"]] as const) expect((await post(buf, type, name)).status, type).toBe(200);
  });
  it("returns the id and size from the content service, privately and never cached", async () => {
    const res = await post(JPEG);
    const body = await res.json();
    expect(body).toMatchObject({ ok: true, width: 2000, height: 1500, color: "#334455", filename: "photo.jpg" });
    expect(body.assetId).toMatch(/^image-[a-f0-9]{40}-\d+x\d+-jpg$/);
    expect(res.headers.get("Cache-Control")).toBe("private, no-store");
  });
  it("refuses types that are not allowed, whatever the file is called", async () => {
    for (const [type, name] of [["image/gif", "a.gif"], ["image/svg+xml", "a.svg"], ["application/pdf", "a.pdf"], ["text/html", "a.jpg"], ["application/octet-stream", "a.jpg"], ["image/heic", "a.heic"]] as const) expect((await post(JPEG, type, name)).status, type).toBe(415);
    expect(store().assets.size).toBe(0);
  });
  it("checks the file's own bytes: a script, text or document labelled as a photograph is refused", async () => {
    for (const bytes of [Buffer.from("<script>alert(1)</script>"), Buffer.from("%PDF-1.7 not an image"), Buffer.from("just text"), Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'/>")]) expect((await post(bytes, "image/jpeg", "a.jpg")).status).toBe(415);
    expect(store().assets.size).toBe(0);
  });
  it("refuses a file that starts like a JPEG but is not a complete picture, instead of storing it as it came", async () => {
    const res = await post(synthetic);
    expect(res.status).toBe(415); expect((await res.json()).error).toBe("unprocessable-image");
    expect(store().assets.size).toBe(0);
  });
  it("refuses a file whose bytes are a different image type from the label", async () => {
    expect((await post(PNG, "image/jpeg", "a.jpg")).status).toBe(415);
    expect((await post(JPEG, "image/png", "a.png")).status).toBe(415);
  });
  it("refuses an empty request, an empty file and a file over 8 MB", async () => {
    expect((await post(null)).status).toBe(400);
    expect((await post(Buffer.alloc(0))).status).toBe(400);
    expect((await post(Buffer.concat([JPEG, Buffer.alloc(8 * 1024 * 1024)]))).status).toBe(413);
    expect(store().assets.size).toBe(0);
  });
  it("refuses a body that is declared too large before reading it", async () => {
    const req = new Request("http://localhost/x", { method: "POST", headers: { "content-length": String(9 * 1024 * 1024) }, body: new FormData() }) as unknown as NextRequest;
    expect((await POST(req)).status).toBe(413);
  });
  it("refuses a photograph the content service reports as too small, without adding anything to the portfolio", async () => {
    const original = store().uploadImage.bind(store());
    store().uploadImage = async (i) => ({ ...(await original(i)), width: 400, height: 300 });
    const res = await post(JPEG);
    expect(res.status).toBe(422);
    expect((await res.json()).message).toMatch(/too small/);
    expect(h.audit).toEqual([]);
    expect(store().draft).toBeNull(); expect(store().published).toBeNull();            // uploading never edits the portfolio
  });
  it("removes camera, copyright and GPS location details from a photograph that needed no resizing, before it is stored", async () => {
    let stored: Buffer | null = null;
    const original = store().uploadImage.bind(store());
    store().uploadImage = async (i) => { stored = i.bytes; return original(i); };
    expect(JPEG.includes("Secret Photographer")).toBe(true);
    const res = await post(JPEG);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ metadataRemoved: true, hadLocation: true });
    const got = stored as unknown as Buffer;
    for (const needle of ["Secret Photographer", "ACME Camera", "GPS", "Exif"]) expect(got.includes(needle), needle).toBe(false);
    const m = await sharp(got).metadata();
    expect(m.exif).toBeUndefined(); expect([m.width, m.height]).toEqual([320, 240]);
    expect(h.audit[0].metadata).toMatchObject({ hadLocation: true, bytes: JPEG.length, storedBytes: got.length });
  });
  it("keeps a photograph's rotation as its only remaining detail", async () => {
    const rotated = await picture().jpeg().withExif({ IFD0: { Copyright: "Secret Photographer" }, ...GPS }).withMetadata({ orientation: 6 }).toBuffer();
    let stored: Buffer | null = null;
    const original = store().uploadImage.bind(store());
    store().uploadImage = async (i) => { stored = i.bytes; return original(i); };
    expect((await post(rotated)).status).toBe(200);
    const m = await sharp(stored as unknown as Buffer).metadata();
    expect(m.orientation).toBe(6); expect((stored as unknown as Buffer).includes("Secret Photographer")).toBe(false);
  });
  it("removes metadata from PNG and WebP uploads too", async () => {
    const png = await picture().png().withExif({ IFD0: { Copyright: "Secret Photographer" } }).toBuffer();
    const webp = await picture().webp().withExif({ IFD0: { Copyright: "Secret Photographer" }, ...GPS }).toBuffer();
    for (const [buf, type] of [[png, "image/png"], [webp, "image/webp"]] as const) {
      let stored: Buffer | null = null;
      const original = store().uploadImage.bind(store());
      store().uploadImage = async (i) => { stored = i.bytes; return original(i); };
      expect((await post(buf, type, "a")).status, type).toBe(200);
      expect((stored as unknown as Buffer).includes("Secret Photographer"), type).toBe(false);
    }
  });
  it("takes no destination: extra form fields are ignored", async () => {
    const res = await post(JPEG, "image/jpeg", "a.jpg", { url: "https://evil.example", path: "../../x", destination: "homepage", dataset: "production" });
    expect(res.status).toBe(200);
    expect(JSON.stringify(await res.json())).not.toMatch(/evil|\.\.\/|homepage|production/);
  });
  it("records the upload, and a content-service failure is a clean 502 that adds nothing", async () => {
    expect((await post(JPEG)).status).toBe(200);
    expect(h.audit[0]).toMatchObject({ action: "qr_portfolio.photo_uploaded", metadata: { contentType: "image/jpeg", width: 2000, height: 1500 } });
    store().failing.add("uploadImage"); h.audit = [];
    const res = await post(JPEG);
    expect(res.status).toBe(502); expect((await res.json()).message).toMatch(/Nothing was added/);
    expect(h.audit).toEqual([]);
  });
  it("cleans the file name it passes on", async () => {
    let seen = "";
    const original = store().uploadImage.bind(store());
    store().uploadImage = async (i) => { seen = i.filename; return original(i); };
    await post(JPEG, "image/jpeg", "../../etc/passwd\u0000.jpg");
    expect(seen).not.toMatch(/[/\\\u0000]/);
  });
});

describe("the per-user upload limit", () => {
  it("allows a full batch of 20 uploads in 10 minutes, refuses the 21st with a wait time, and does not affect another user", async () => {
    as("super_admin"); const me = h.current;
    for (let n = 1; n <= 20; n++) expect((await post(JPEG)).status, `upload ${n}`).toBe(200);
    const blocked = await post(JPEG);
    expect(blocked.status).toBe(429);
    expect(Number(blocked.headers.get("Retry-After"))).toBeGreaterThan(0);
    expect((await blocked.json()).message).toMatch(/upload again in/);
    expect(blocked.headers.get("Cache-Control")).toBe("private, no-store");
    as("super_admin");                                                         // a different user
    expect((await post(JPEG)).status).toBe(200);
    h.current = me;
    expect((await post(JPEG)).status).toBe(429);                               // still blocked
  });
  it("counts refused uploads too, and never limits or reveals anything to someone who is not a Super Admin", async () => {
    as("super_admin");
    for (let n = 1; n <= 20; n++) await post(Buffer.from("not an image"), "image/jpeg");      // all refused, all counted
    expect((await post(JPEG)).status).toBe(429);
    as("admin");
    expect((await post(JPEG)).status).toBe(403);
  });
});

describe("the route's source", () => {
  it("has no secret, environment or URL access and exports POST only", () => {
    const src = readFileSync(path.join(process.cwd(), "src/app/api/admin/qr-portfolio/upload/route.ts"), "utf8").replace(/\/\/ .*$/gm, "");
    expect(src).not.toMatch(/process\.env|TOKEN|searchParams|nextUrl/);
    expect([...src.matchAll(/export (?:async )?function (\w+)/g)].map((m) => m[1])).toEqual(["POST"]);
  });
  it("the stand-in photograph reference used by these tests is itself valid (guards the tests)", () => expect(uploadRef(1).assetId).toMatch(/^image-/));
});
