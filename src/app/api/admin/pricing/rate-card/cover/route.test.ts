import { beforeEach, describe, expect, it, vi } from "vitest";

const user = vi.hoisted(() => ({ current: null as null | { id: string } }));
const upload = vi.hoisted(() => vi.fn());
const log = vi.hoisted(() => vi.fn());
vi.mock("@/lib/portal/roles", () => ({ getCurrentUser: async () => user.current, isSuperAdmin: (u: { id: string } | null) => u?.id === "super" }));
vi.mock("@/lib/admin/activityLog", () => ({ logActivity: log }));
vi.mock("@/lib/pdf/rateCard/coverUpload", async (orig) => ({ ...(await orig<typeof import("@/lib/pdf/rateCard/coverUpload")>()), uploadCoverPhoto: upload }));
vi.mock("@/lib/shared/fileContentSniff", () => ({ detectFileMimeType: async (b: Buffer) => (b[0] === 0xff ? "image/jpeg" : b[0] === 0x25 ? "application/pdf" : null) }));

import { GET, POST } from "./route";

const OWN = "https://cdn.sanity.io/images/ixbvr1n8/production/0a1b2c3d4e5f60718293a4b5c6d7e8f901234567-1333x2000.jpg";
const req = (url: string, init?: RequestInit) => new Request(url, init) as unknown as import("next/server").NextRequest & { nextUrl: URL };
const getReq = (src: string) => { const r = req(`http://localhost/api/admin/pricing/rate-card/cover?src=${encodeURIComponent(src)}`) as { nextUrl: URL }; (r as { nextUrl: URL }).nextUrl = new URL(`http://localhost/x?src=${encodeURIComponent(src)}`); return r as never; };
const post = (bytes: number[] | Uint8Array, type: string) => {
  const f = new File([new Uint8Array(bytes)], "p.jpg", { type }); const fd = new FormData(); fd.append("file", f);
  return new Request("http://localhost/api/admin/pricing/rate-card/cover", { method: "POST", body: fd }) as never;
};

beforeEach(() => { vi.restoreAllMocks(); upload.mockReset(); log.mockReset(); user.current = { id: "super" }; process.env.NEXT_PUBLIC_SANITY_PROJECT_ID = "ixbvr1n8"; process.env.NEXT_PUBLIC_SANITY_DATASET = "production"; });

describe("rate card cover route: Super Admin only", () => {
  it("refuses everyone who is not Super Admin, for both upload and fetch, before doing anything", async () => {
    for (const u of [null, { id: "staff" }]) {
      user.current = u;
      expect((await POST(post([0xff, 0xd8], "image/jpeg"))).status).toBe(403);
      expect((await GET(getReq(OWN))).status).toBe(403);
    }
    expect(upload).not.toHaveBeenCalled(); expect(log).not.toHaveBeenCalled();
  });
});

describe("upload", () => {
  it("stores a real JPEG, audits it, and returns the immutable address", async () => {
    upload.mockResolvedValue({ assetId: "image-a", url: OWN, width: 1333, height: 2000 });
    const res = await POST(post([0xff, 0xd8, 0xff], "image/jpeg")); const j = await res.json();
    expect(res.status).toBe(200); expect(j).toMatchObject({ ok: true, url: OWN, width: 1333, height: 2000 });
    expect(log).toHaveBeenCalledWith(expect.objectContaining({ actorUserId: "super", action: "rate_card.cover_uploaded" }));
  });
  it("refuses a file that is not an allowed image type, whatever it claims, and one that is too large", async () => {
    expect((await POST(post([0x25, 0x50], "image/jpeg"))).status).toBe(415);          // a PDF pretending to be a JPEG
    expect((await POST(post([0xff, 0xd8], "application/pdf"))).status).toBe(415);
    const big = new Uint8Array(4 * 1024 * 1024 + 1); big[0] = 0xff;
    expect((await POST(post(big, "image/jpeg"))).status).toBe(413);
    expect(upload).not.toHaveBeenCalled();
  });
});

describe("fetch through the same origin", () => {
  it("fetches only an address on this deployment's own project and dataset", async () => {
    const f = vi.spyOn(globalThis, "fetch");
    for (const bad of ["https://evil.example/a.jpg", "https://cdn.sanity.io/images/otherproj/production/0a1b2c3d4e5f60718293a4b5c6d7e8f901234567-1x1.jpg", "https://cdn.sanity.io/images/ixbvr1n8/staging/0a1b2c3d4e5f60718293a4b5c6d7e8f901234567-1x1.jpg", "", "http://169.254.169.254/latest"]) expect((await GET(getReq(bad))).status, bad).toBe(400);
    expect(f).not.toHaveBeenCalled();
  });
  it("streams an image back with a fixed content type and no redirect following; a non-image upstream answer is refused", async () => {
    const f = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(new Uint8Array([1, 2, 3]), { headers: { "content-type": "image/jpeg" } })).mockResolvedValueOnce(new Response("<html>", { headers: { "content-type": "text/html" } }));
    const ok = await GET(getReq(OWN)); expect(ok.status).toBe(200); expect(ok.headers.get("content-type")).toBe("image/jpeg"); expect(ok.headers.get("x-content-type-options")).toBe("nosniff");
    expect(f.mock.calls[0][1]).toMatchObject({ redirect: "error" });
    expect((await GET(getReq(OWN))).status).toBe(502);
  });
});
