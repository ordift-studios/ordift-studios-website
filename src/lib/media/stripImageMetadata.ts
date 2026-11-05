// Removes camera, location, editing-software and text metadata from a JPEG, PNG or WebP photograph WITHOUT re-encoding it: the picture data is copied byte for byte, so there is no quality loss and the
// decoded pixels are identical. Pure (no framework, no dependency), server-safe, and strict: anything it cannot parse completely is refused, never passed through unstripped.
//
// What is removed:   EXIF (camera, date, GPS location, embedded thumbnails), XMP, IPTC / Photoshop blocks, comments, JFIF thumbnails, text and time chunks (PNG), every other application marker and
//                    anything stored after the end of the picture (appended payloads, secondary pictures).
// What is kept:      the picture data and the colour information needed to display it correctly (ICC colour profile, Adobe colour-transform marker, PNG gamma / chromaticity / sRGB / transparency).
// Orientation:       a JPEG that carries a rotation (EXIF orientation 2-8) keeps ONLY that single number, in a minimal EXIF block with nothing else, so a portrait photograph is still shown upright.
//                    A PNG or WebP that needs a rotation cannot carry one without metadata, so it is refused with a message asking for an upright copy.

export type StripFormat = "image/jpeg" | "image/png" | "image/webp";
export type StripResult = { bytes: Buffer; removedBytes: number; hadLocation: boolean; hadExif: boolean; orientationKept: number | null };

export class MetadataStripError extends Error {
  constructor(message: string, readonly userMessage: string = "That file could not be processed as a photograph.") { super(message); this.name = "MetadataStripError"; }
}
const bad = (why: string): never => { throw new MetadataStripError(why); };

// ------------------------------------------------------------------ EXIF reading (orientation and the presence of a GPS block only)

type ExifFacts = { orientation: number; hasGps: boolean };

/** Reads a TIFF block (the body of an EXIF segment). Never throws: a block that cannot be read yields "no rotation, no GPS". */
function readTiff(tiff: Buffer): ExifFacts {
  const none: ExifFacts = { orientation: 1, hasGps: false };
  try {
    if (tiff.length < 8) return none;
    const le = tiff.toString("latin1", 0, 2) === "II";
    if (!le && tiff.toString("latin1", 0, 2) !== "MM") return none;
    const u16 = (o: number) => (le ? tiff.readUInt16LE(o) : tiff.readUInt16BE(o));
    const u32 = (o: number) => (le ? tiff.readUInt32LE(o) : tiff.readUInt32BE(o));
    if (u16(2) !== 42) return none;
    const ifd = u32(4);
    if (ifd < 8 || ifd + 2 > tiff.length) return none;
    const count = u16(ifd);
    const facts: ExifFacts = { orientation: 1, hasGps: false };
    for (let i = 0; i < count && i < 512; i++) {
      const e = ifd + 2 + i * 12;
      if (e + 12 > tiff.length) break;
      const tag = u16(e);
      if (tag === 0x0112 && u16(e + 2) === 3 && u32(e + 4) === 1) { const v = u16(e + 8); if (v >= 1 && v <= 8) facts.orientation = v; }
      if (tag === 0x8825) facts.hasGps = true;
    }
    return facts;
  } catch { return none; }
}

/** An EXIF segment holding exactly one tag: the orientation. Nothing else (no date, camera, location or thumbnail). */
function minimalExifSegment(orientation: number): Buffer {
  return Buffer.from([
    0xff, 0xe1, 0x00, 0x22,                                          // APP1, length 34
    0x45, 0x78, 0x69, 0x66, 0x00, 0x00,                              // "Exif\0\0"
    0x4d, 0x4d, 0x00, 0x2a, 0x00, 0x00, 0x00, 0x08,                  // big-endian TIFF header, first IFD at offset 8
    0x00, 0x01,                                                      // one entry
    0x01, 0x12, 0x00, 0x03, 0x00, 0x00, 0x00, 0x01, 0x00, orientation, 0x00, 0x00,   // Orientation, SHORT, count 1, value
    0x00, 0x00, 0x00, 0x00,                                          // no next IFD
  ]);
}

// ------------------------------------------------------------------ JPEG

function stripJpeg(src: Buffer): StripResult {
  if (src.length < 4 || src[0] !== 0xff || src[1] !== 0xd8) bad("not a JPEG");
  const out: Buffer[] = [Buffer.from([0xff, 0xd8])];
  let jfifAt = -1;                                                     // index in `out` of the JFIF segment, so the orientation block can follow it
  let facts: ExifFacts = { orientation: 1, hasGps: false };
  let hadExif = false;
  let pos = 2, inScan = false, sawScan = false, ended = false;

  while (pos < src.length && !ended) {
    if (inScan) {
      // Entropy-coded data: copy up to the next real marker. FF00 (a stuffed byte) and FFD0-FFD7 (restart markers) are data, not markers.
      let j = pos;
      while (j < src.length) {
        if (src[j] === 0xff && j + 1 < src.length) {
          const n = src[j + 1];
          if (n === 0x00 || (n >= 0xd0 && n <= 0xd7)) { j += 2; continue; }
          if (n === 0xff) { j += 1; continue; }
          break;
        }
        j++;
      }
      if (j >= src.length) bad("JPEG data ended without an end marker");
      out.push(src.subarray(pos, j));
      pos = j; inScan = false;
      continue;
    }
    if (src[pos] !== 0xff) bad("JPEG marker expected");
    while (pos < src.length && src[pos] === 0xff) pos++;               // fill bytes
    if (pos >= src.length) bad("JPEG truncated");
    const marker = src[pos++];
    if (marker === 0xd9) { out.push(Buffer.from([0xff, 0xd9])); ended = true; break; }      // end of image: everything after it is dropped
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) { out.push(Buffer.from([0xff, marker])); continue; }   // markers without a length
    if (pos + 2 > src.length) bad("JPEG truncated");
    const len = src.readUInt16BE(pos);
    if (len < 2 || pos + len > src.length) bad("JPEG segment length is invalid");
    const body = src.subarray(pos + 2, pos + len);
    const whole = src.subarray(pos - 2, pos + len);
    pos += len;

    const isApp = marker >= 0xe0 && marker <= 0xef;
    if (marker === 0xda) { out.push(whole); inScan = true; sawScan = true; continue; }
    if (!isApp && marker !== 0xfe) { out.push(whole); continue; }       // picture structure (tables, frame header, ...): kept untouched
    if (marker === 0xfe) continue;                                      // comment: removed
    if (marker === 0xe0 && body.toString("latin1", 0, 5) === "JFIF\0" && body.length >= 14) {
      // Keep the JFIF header but with no embedded thumbnail (a thumbnail can still show a cropped-out part of the original).
      const head = Buffer.from(body.subarray(0, 14)); head[12] = 0; head[13] = 0;
      const seg = Buffer.concat([Buffer.from([0xff, 0xe0, 0x00, 0x10]), head]);
      jfifAt = out.length; out.push(seg);
      continue;
    }
    if (marker === 0xe1 && body.toString("latin1", 0, 6) === "Exif\0\0") {
      hadExif = true;
      const f = readTiff(body.subarray(6));
      if (f.hasGps) facts.hasGps = true;
      if (f.orientation !== 1) facts = { ...facts, orientation: f.orientation };
      continue;                                                         // the whole block is removed; the orientation is re-added below on its own
    }
    if (marker === 0xe2 && body.toString("latin1", 0, 12) === "ICC_PROFILE\0") { out.push(whole); continue; }   // colour profile: kept
    if (marker === 0xee && body.toString("latin1", 0, 5) === "Adobe" && body.length === 12) { out.push(whole); continue; }  // colour transform flag: needed to decode correctly
    // every other application marker (XMP, IPTC / Photoshop, MakerNotes, FlashPix, MPF, vendor blocks, JFXX): removed
  }
  if (!ended || !sawScan) bad("JPEG has no picture data or no end marker");

  if (facts.orientation !== 1) out.splice(jfifAt >= 0 ? jfifAt + 1 : 1, 0, minimalExifSegment(facts.orientation));
  const bytes = Buffer.concat(out);
  return { bytes, removedBytes: src.length - bytes.length, hadLocation: facts.hasGps, hadExif, orientationKept: facts.orientation !== 1 ? facts.orientation : null };
}

// ------------------------------------------------------------------ PNG

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const PNG_KEEP = new Set(["IHDR", "PLTE", "IDAT", "IEND", "tRNS", "gAMA", "cHRM", "sRGB", "iCCP", "sBIT", "bKGD", "hIST", "pHYs", "acTL", "fcTL", "fdAT"]);

function stripPng(src: Buffer): StripResult {
  if (src.length < 8 + 12 || !src.subarray(0, 8).equals(PNG_SIGNATURE)) bad("not a PNG");
  const out: Buffer[] = [PNG_SIGNATURE];
  let pos = 8, first = true, ended = false, facts: ExifFacts = { orientation: 1, hasGps: false }, hadExif = false;
  while (pos + 12 <= src.length) {
    const len = src.readUInt32BE(pos);
    const type = src.toString("latin1", pos + 4, pos + 8);
    const end = pos + 12 + len;
    if (!/^[A-Za-z]{4}$/.test(type) || end > src.length) bad("PNG chunk is invalid");
    if (first && type !== "IHDR") bad("PNG must start with its header chunk");
    first = false;
    if (type === "eXIf") { hadExif = true; facts = readTiff(src.subarray(pos + 8, pos + 8 + len)); }
    if (PNG_KEEP.has(type)) out.push(src.subarray(pos, end));
    pos = end;
    if (type === "IEND") { ended = true; break; }                       // anything after the end is dropped
  }
  if (!ended) bad("PNG has no end chunk");
  if (facts.orientation !== 1) throw new MetadataStripError("PNG needs a rotation", "This photograph relies on rotation information that cannot be kept. Open it, save an upright copy, and upload that.");
  const bytes = Buffer.concat(out);
  return { bytes, removedBytes: src.length - bytes.length, hadLocation: facts.hasGps, hadExif, orientationKept: null };
}

// ------------------------------------------------------------------ WebP

function stripWebp(src: Buffer): StripResult {
  if (src.length < 20 || src.toString("latin1", 0, 4) !== "RIFF" || src.toString("latin1", 8, 12) !== "WEBP") bad("not a WebP");
  const riffEnd = 8 + src.readUInt32LE(4);
  if (riffEnd > src.length || riffEnd < 20) bad("WebP size is invalid");
  const out: Buffer[] = [];
  let pos = 12, facts: ExifFacts = { orientation: 1, hasGps: false }, hadExif = false, sawPicture = false, vp8x = -1;
  while (pos + 8 <= riffEnd) {
    const type = src.toString("latin1", pos, pos + 4);
    const len = src.readUInt32LE(pos + 4);
    const end = pos + 8 + len + (len & 1);
    if (pos + 8 + len > riffEnd || end > riffEnd + 1) bad("WebP chunk is invalid");
    const chunk = src.subarray(pos, Math.min(end, riffEnd));
    if (type === "EXIF") {
      hadExif = true;
      const body = src.subarray(pos + 8, pos + 8 + len);
      facts = readTiff(body.toString("latin1", 0, 6) === "Exif\0\0" ? body.subarray(6) : body);
    } else if (type !== "XMP ") {
      if (type === "VP8X") { if (len < 10) bad("WebP header is invalid"); vp8x = out.length; }
      if (type === "VP8 " || type === "VP8L" || type === "ANMF") sawPicture = true;
      out.push(Buffer.from(chunk));
    }
    pos = end;
  }
  if (!sawPicture) bad("WebP has no picture data");
  if (facts.orientation !== 1) throw new MetadataStripError("WebP needs a rotation", "This photograph relies on rotation information that cannot be kept. Open it, save an upright copy, and upload that.");
  if (vp8x >= 0) out[vp8x][8] &= ~(0x08 | 0x04);                         // header flags: no EXIF, no XMP
  const body = Buffer.concat(out);
  const header = Buffer.alloc(12);
  header.write("RIFF", 0, "latin1"); header.writeUInt32LE(4 + body.length, 4); header.write("WEBP", 8, "latin1");
  const bytes = Buffer.concat([header, body]);
  return { bytes, removedBytes: src.length - bytes.length, hadLocation: facts.hasGps, hadExif, orientationKept: null };
}

// ------------------------------------------------------------------ entry point

/** Returns the photograph with its metadata removed, or throws MetadataStripError. `type` must be the type the file's own bytes were verified to be. */
export function stripImageMetadata(input: Buffer, type: StripFormat): StripResult {
  switch (type) {
    case "image/jpeg": return stripJpeg(input);
    case "image/png": return stripPng(input);
    case "image/webp": return stripWebp(input);
  }
}
