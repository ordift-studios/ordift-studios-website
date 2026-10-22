import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  user: { id: "client-1" } as { id: string } | null,
  ctx: null as null | { enquiryId: string; reference: string; clientName: string; files: { fileId: string; title: string; categoryLabel: string; filename: string; bucket: string; path: string; sizeBytes: number; publishedAt: string }[] },
  signFails: false,
  signed: [] as string[],
  logged: [] as { action: string; metadata: unknown }[],
}));

vi.mock("@/lib/portal/roles", () => ({ getCurrentUser: async () => h.user }));
vi.mock("@/lib/portal/clientDeliveryData", () => ({ getReleasedContext: async () => h.ctx }));
vi.mock("@/lib/admin/activityLog", () => ({ logActivityAsSystem: async (e: { action: string; metadata: unknown }) => void h.logged.push(e) }));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    storage: {
      from: (bucket: string) => ({
        createSignedUrl: async (path: string) => {
          if (h.signFails) return { data: null, error: { message: "boom" } };
          h.signed.push(`${bucket}/${path}`);
          return { data: { signedUrl: `https://storage.invalid/${bucket}/${path}?token=SECRET` }, error: null };
        },
      }),
    },
  }),
}));

import { GET } from "./route";

const ID = "3473596c-3ea4-4b1b-820e-733629dbebf8";
const file = (n: number, over: Record<string, unknown> = {}) => ({ fileId: `f${n}`, title: `Ben&Precious HD ${n}`, categoryLabel: "Final Photography Gallery", filename: `IMG_${n}.jpg`, bucket: "project-media", path: `eng/${n}.jpg`, sizeBytes: 1000 + n, publishedAt: "2026-10-22T11:20:00Z", ...over });
const bytesOf = (n: number) => Uint8Array.from({ length: 5000 + n }, (_, i) => (i * 7 + n) & 0xff);
const call = (kind = "enquiry", id = ID) => GET(new Request(`https://ordiftstudios.com/portal/client/projects/${kind}/${id}/download-all`) as never, { params: Promise.resolve({ kind, id }) });

beforeEach(() => {
  h.user = { id: "client-1" };
  h.ctx = { enquiryId: ID, reference: "CSR-2026-000002", clientName: "Bright", files: [1, 2, 3].map((n) => file(n)) };
  h.signFails = false; h.signed = []; h.logged = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    const n = Number(/\/(\d+)\.jpg/.exec(url)![1]);
    return new Response(bytesOf(n), { status: 200 });
  }));
});

describe("GET download-all", () => {
  it("streams ONE valid ZIP of the released photographs, original bytes, with a project-reference file name", async () => {
    const res = await call();
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/zip");
    expect(res.headers.get("content-disposition")).toContain('filename="Ordift-CSR-2026-000002-photographs.zip"');
    expect(res.headers.get("cache-control")).toContain("no-store");
    const zip = Buffer.from(await res.arrayBuffer());
    const dir = mkdtempSync(join(tmpdir(), "route-zip-"));
    const path = join(dir, "t.zip");
    writeFileSync(path, zip);
    const out = execFileSync("python3", ["-c", "import sys,zipfile;z=zipfile.ZipFile(sys.argv[1]);assert z.testzip() is None;[print(i.filename,i.file_size,i.compress_type) for i in z.infolist()]", path], { encoding: "utf8" }).trim().split("\n");
    expect(out).toEqual([1, 2, 3].map((n) => `Final Photography Gallery/Ben&Precious HD ${n}.jpg ${5000 + n} 0`));
    for (const n of [1, 2, 3]) {
      const extracted = execFileSync("python3", ["-c", "import sys,zipfile;sys.stdout.buffer.write(zipfile.ZipFile(sys.argv[1]).read(sys.argv[2]))", path, `Final Photography Gallery/Ben&Precious HD ${n}.jpg`]);
      expect(Buffer.compare(extracted, Buffer.from(bytesOf(n)))).toBe(0); // byte-for-byte: not recompressed
    }
    expect(zip.includes(Buffer.from("SECRET"))).toBe(false); // no storage link or token ever reaches the client
    expect(h.logged.map((l) => l.action)).toEqual(["project_file.client_bulk_downloaded"]);
  });

  it("requires sign-in", async () => {
    h.user = null;
    const res = await call();
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("/portal/login");
    expect(h.signed).toHaveLength(0);
  });

  it("is not available for someone else's project, other project kinds, or malformed ids (nothing is read from storage)", async () => {
    h.ctx = null;
    expect((await call()).status).toBe(404);
    expect((await call("workshop")).status).toBe(404);
    expect((await call("enquiry", "not-a-uuid")).status).toBe(404);
    expect(h.signed).toHaveLength(0);
  });

  it("says so when nothing has been released, and never signs anything", async () => {
    h.ctx = { ...h.ctx!, files: [] };
    const res = await call();
    expect(res.status).toBe(404);
    expect(await res.text()).toContain("no released photographs");
    expect(h.signed).toHaveLength(0);
  });

  it("reports a storage problem BEFORE any download starts, with a useful message", async () => {
    h.signFails = true;
    const res = await call();
    expect(res.status).toBe(503);
    expect(await res.text()).toContain("individual Download buttons");
    expect(h.logged).toHaveLength(0);
  });

  it("refuses an impossible archive size with a clear alternative instead of a corrupt file", async () => {
    h.ctx = { ...h.ctx!, files: [file(1, { sizeBytes: 4 * 1024 ** 3 })] };
    const res = await call();
    expect(res.status).toBe(413);
    expect(await res.text()).toContain("too large");
  });

  it("two photographs with the same title never overwrite each other", async () => {
    h.ctx = { ...h.ctx!, files: [file(1, { title: "Same" }), file(2, { title: "Same", path: "eng/2.jpg" })] };
    const zip = Buffer.from(await (await call()).arrayBuffer());
    const dir = mkdtempSync(join(tmpdir(), "route-zip-"));
    const path = join(dir, "t.zip");
    writeFileSync(path, zip);
    const names = execFileSync("python3", ["-c", "import sys,zipfile;print('|'.join(zipfile.ZipFile(sys.argv[1]).namelist()))", path], { encoding: "utf8" }).trim();
    expect(names).toBe("Final Photography Gallery/Same.jpg|Final Photography Gallery/Same (2).jpg");
  });
});
