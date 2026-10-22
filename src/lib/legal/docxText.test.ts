import { deflateRawSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { extractDocxText, findUnresolvedReviewMarkers, readZipEntry } from "./docxText";

// Build a tiny valid zip (one deflated entry) so the reader is tested against real zip structure.
export function makeZip(name: string, content: string, method: 0 | 8 = 8): Uint8Array {
  const raw = Buffer.from(content, "utf8");
  const data = method === 8 ? deflateRawSync(raw) : raw;
  const nameBuf = Buffer.from(name);
  const local = Buffer.alloc(30); local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(method, 8); local.writeUInt32LE(data.length, 18); local.writeUInt32LE(raw.length, 22); local.writeUInt16LE(nameBuf.length, 26);
  const cd = Buffer.alloc(46); cd.writeUInt32LE(0x02014b50, 0); cd.writeUInt16LE(20, 4); cd.writeUInt16LE(20, 6); cd.writeUInt16LE(method, 10); cd.writeUInt32LE(data.length, 20); cd.writeUInt32LE(raw.length, 24); cd.writeUInt16LE(nameBuf.length, 28); cd.writeUInt32LE(0, 42);
  const cdOffset = local.length + nameBuf.length + data.length;
  const eocd = Buffer.alloc(22); eocd.writeUInt32LE(0x06054b50, 0); eocd.writeUInt16LE(1, 8); eocd.writeUInt16LE(1, 10); eocd.writeUInt32LE(cd.length + nameBuf.length, 12); eocd.writeUInt32LE(cdOffset, 16);
  return new Uint8Array(Buffer.concat([local, nameBuf, data, cd, nameBuf, eocd]));
}
const doc = (body: string) => `<w:document><w:body>${body}</w:body></w:document>`;

describe("docx text extraction", () => {
  it("reads word/document.xml from a deflated or stored zip entry and strips markup", () => {
    for (const m of [8, 0] as const) {
      const z = makeZip("word/document.xml", doc("<w:p><w:r><w:t>24.1 Instructor-caused claims.</w:t></w:r></w:p><w:p><w:r><w:t>A &amp; B</w:t></w:r></w:p>"), m);
      expect(extractDocxText(z)).toBe("24.1 Instructor-caused claims.\nA & B\n");
    }
  });
  it("returns null for a file that is not a docx", () => {
    expect(extractDocxText(new Uint8Array([1, 2, 3]))).toBeNull();
    expect(readZipEntry(makeZip("other.xml", "x"), "word/document.xml")).toBeNull();
  });
});

describe("unresolved counsel-review markers", () => {
  it("finds the markers that blocked the draft", () => {
    const t = "24.1 [COUNSEL REVIEW] Consider protection.\n25.2 Cap. [COUNSEL DECISION REQUIRED] Determine a cap.\nCounsel Review Draft - not approved for instructor use";
    expect(findUnresolvedReviewMarkers(t).length).toBeGreaterThanOrEqual(4);
  });
  it("does not flag ordinary operative wording, including the legitimate phrase “counsel-approved”", () => {
    const t = "10.4 Moral rights. Any waiver applies only where legally permitted and counsel-approved.\n25.2 Cap. Any liability cap applies only if expressly selected in the applicable Schedule.\nAPPROVED - OFFICIAL MASTER";
    expect(findUnresolvedReviewMarkers(t)).toEqual([]);
  });
});
