import { inflateRawSync } from "node:zlib";

// Minimal, dependency-free reader for the one thing the legal registry needs from a stored Word master: its visible text, so it can be
// scanned for unresolved counsel-review markers before the template is registered. Reads the zip central directory, inflates
// word/document.xml and strips markup. It never writes or alters the file.

export function readZipEntry(bytes: Uint8Array, name: string): Uint8Array | null {
  const b = Buffer.from(bytes);
  // End of central directory record
  let eocd = -1;
  for (let i = b.length - 22; i >= Math.max(0, b.length - 65557); i--) if (b.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) return null;
  const count = b.readUInt16LE(eocd + 10);
  let p = b.readUInt32LE(eocd + 16);
  for (let n = 0; n < count; n++) {
    if (b.readUInt32LE(p) !== 0x02014b50) return null;
    const method = b.readUInt16LE(p + 10);
    const csize = b.readUInt32LE(p + 20);
    const nameLen = b.readUInt16LE(p + 28);
    const extraLen = b.readUInt16LE(p + 30);
    const commentLen = b.readUInt16LE(p + 32);
    const localOffset = b.readUInt32LE(p + 42);
    const entryName = b.toString("utf8", p + 46, p + 46 + nameLen);
    if (entryName === name) {
      const lNameLen = b.readUInt16LE(localOffset + 26);
      const lExtraLen = b.readUInt16LE(localOffset + 28);
      const start = localOffset + 30 + lNameLen + lExtraLen;
      const data = b.subarray(start, start + csize);
      return method === 0 ? new Uint8Array(data) : method === 8 ? new Uint8Array(inflateRawSync(data)) : null;
    }
    p += 46 + nameLen + extraLen + commentLen;
  }
  return null;
}

export function extractDocxText(bytes: Uint8Array): string | null {
  const xml = readZipEntry(bytes, "word/document.xml");
  if (!xml) return null;
  return Buffer.from(xml)
    .toString("utf8")
    .replace(/<\/w:p>/g, "\n")
    .replace(/<w:tab\/>/g, "\t")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'");
}

// Unresolved drafting / counsel-review markers. Deliberately specific: ordinary operative wording such as "counsel-approved" (clause 10.4)
// is legitimate text and is NOT a marker.
const MARKER_PATTERNS: readonly RegExp[] = [
  /\[\s*COUNSEL[^\]]*\]/gi,
  /\[\s*LEGAL REVIEW[^\]]*\]/gi,
  /COUNSEL REVIEW\b/g,
  /COUNSEL DECISION REQUIRED/g,
  /Counsel Review Draft/gi,
  /not approved for [a-z ]+ use/gi,
];

export function findUnresolvedReviewMarkers(text: string): string[] {
  const found: string[] = [];
  for (const re of MARKER_PATTERNS) for (const m of text.matchAll(re)) found.push(m[0]);
  return found;
}
