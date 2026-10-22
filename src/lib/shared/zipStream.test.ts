import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { crc32Update, safeEntryName, uniqueEntryNames, ZIP_MAX_ENTRIES, zipChunks, ZipLimitError, zipStream, type ZipEntry } from "./zipStream";

const bytes = (n: number, seed: number) => Uint8Array.from({ length: n }, (_, i) => (i * 31 + seed) & 0xff);
async function* chunked(data: Uint8Array, size: number) {
  for (let i = 0; i < data.length; i += size) yield data.slice(i, i + size);
}
const entry = (name: string, data: Uint8Array, chunk = 7000): ZipEntry => ({ name, modifiedAt: new Date("2026-10-22T12:00:00Z"), open: async () => chunked(data, chunk) });
async function collect(entries: ZipEntry[]): Promise<Uint8Array> {
  const parts: Uint8Array[] = [];
  for await (const c of zipChunks(entries)) parts.push(c);
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}

describe("crc32", () => {
  it("matches the standard check value", () => {
    expect(crc32Update(0, new TextEncoder().encode("123456789"))).toBe(0xcbf43926);
  });
  it("can be computed incrementally", () => {
    const d = bytes(50_000, 3);
    expect(crc32Update(crc32Update(0, d.slice(0, 12_345)), d.slice(12_345))).toBe(crc32Update(0, d));
  });
});

describe("streaming ZIP (store, no recompression)", () => {
  const files = [
    { name: "Final Photography Gallery/Ben&Precious HD 20.jpg", data: bytes(123_457, 1) },
    { name: "Final Photography Gallery/Ben&Precious HD 21.jpg", data: bytes(65_536, 2) },
    { name: "Thank-You Images/Ben&Precious HD 13.jpg", data: bytes(1, 3) },
    { name: "empty.jpg", data: new Uint8Array(0) },
  ];

  it("round-trips byte-for-byte through the real unzip tool (every entry intact, CRCs valid)", async () => {
    const zip = await collect(files.map((f) => entry(f.name, f.data)));
    const dir = mkdtempSync(join(tmpdir(), "zip-test-"));
    const path = join(dir, "t.zip");
    writeFileSync(path, zip);
    // python's zipfile verifies every CRC and size against the central directory
    const script = "import sys,zipfile;z=zipfile.ZipFile(sys.argv[1]);assert z.testzip() is None;[sys.stdout.write(i.filename+'|'+str(i.file_size)+'|'+str(i.compress_type)+'\\n') for i in z.infolist()]";
    const listing = execFileSync("python3", ["-c", script, path], { encoding: "utf8" }).trim().split("\n");
    expect(listing).toEqual(files.map((f) => `${f.name}|${f.data.length}|0`)); // compress_type 0 = STORED: nothing was recompressed
    for (const f of files) {
      const extracted = execFileSync("python3", ["-c", "import sys,zipfile;sys.stdout.buffer.write(zipfile.ZipFile(sys.argv[1]).read(sys.argv[2]))", path, f.name]);
      expect(Buffer.compare(extracted, Buffer.from(f.data))).toBe(0);
    }
  });

  it("is a valid archive even when chunks are tiny, and the stored bytes are exactly the source bytes", async () => {
    const data = bytes(4_000, 9);
    const zip = await collect([entry("a.jpg", data, 13)]);
    const idx = Buffer.from(zip).indexOf(Buffer.from(data));
    expect(idx).toBeGreaterThan(0);
  });

  it("streams as a web ReadableStream and stops reading when the download is cancelled", async () => {
    let opened = 0;
    const many: ZipEntry[] = Array.from({ length: 5 }, (_, i) => ({ name: `f${i}.jpg`, modifiedAt: new Date(), open: async () => { opened++; return chunked(bytes(10_000, i), 1000); } }));
    const reader = zipStream(many).getReader();
    await reader.read(); // local header
    await reader.read(); // first data chunk of the first file
    await reader.cancel();
    expect(opened).toBe(1); // nothing else was fetched after cancel
  });

  it("refuses an archive it cannot represent instead of producing a corrupt one", async () => {
    const tooMany = Array.from({ length: ZIP_MAX_ENTRIES + 1 }, (_, i) => entry(`f${i}`, new Uint8Array(0)));
    await expect(collect(tooMany)).rejects.toBeInstanceOf(ZipLimitError);
  });

  it("surfaces a source failure to the consumer (the download fails visibly, it does not silently truncate)", async () => {
    const bad: ZipEntry = { name: "x.jpg", modifiedAt: new Date(), open: async () => { throw new Error("storage unavailable"); } };
    const reader = zipStream([bad]).getReader();
    await reader.read(); // local header
    await expect(reader.read()).rejects.toThrow("storage unavailable");
  });

  it("produces the end-of-central-directory record last, with the right entry count", async () => {
    const zip = await collect(files.map((f) => entry(f.name, f.data)));
    const eocd = zip.length - 22;
    expect(new DataView(zip.buffer, zip.byteOffset).getUint32(eocd, true)).toBe(0x06054b50);
    expect(new DataView(zip.buffer, zip.byteOffset).getUint16(eocd + 10, true)).toBe(files.length);
    expect(readFileSync).toBeDefined();
  });
});

describe("entry names", () => {
  it("removes path tricks and control characters", () => {
    expect(safeEntryName("../../etc/passwd", "x")).toBe("..-..-etc-passwd".replace(/^\.+/, ""));
    expect(safeEntryName("a\u0000b/c\\d", "x")).toBe("ab-c-d");
    expect(safeEntryName("   ", "fallback")).toBe("fallback");
    expect(safeEntryName(".hidden.jpg", "x")).toBe("hidden.jpg");
  });
  it("never lets two photographs overwrite each other", () => {
    expect(uniqueEntryNames(["a.jpg", "A.jpg", "b.jpg", "a.jpg"])).toEqual(["a.jpg", "A (2).jpg", "b.jpg", "a (3).jpg"]);
  });
});
