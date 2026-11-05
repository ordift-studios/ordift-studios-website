import { crc32 } from "node:zlib";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { MetadataStripError, stripImageMetadata } from "./stripImageMetadata";

// Real images, with real metadata written into them, so these tests show that location and camera details are actually gone and that the picture itself is untouched.
const GPS = { IFD3: { GPSLatitudeRef: "N", GPSLatitude: "51/1 30/1 0/1", GPSLongitudeRef: "W", GPSLongitude: "0/1 7/1 0/1" } };
const base = () => sharp({ create: { width: 640, height: 480, channels: 3, background: "#aa3344" } }).composite([{ input: Buffer.from(`<svg width="640" height="480"><circle cx="200" cy="200" r="150" fill="#2244cc"/><rect x="300" y="100" width="250" height="300" fill="#ddcc33"/></svg>`) }]);
const raw = async (b: Buffer) => (await sharp(b).raw().toBuffer({ resolveWithObject: true }));

const jpegWithMetadata = (orientation?: number, progressive = false) =>
  base().jpeg({ quality: 90, progressive }).withExif({ IFD0: { Copyright: "Secret Photographer", Make: "ACME Camera" }, ...GPS }).withMetadata(orientation ? { orientation } : {}).withXmp('<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"><rdf:Description xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:creator>Secret Photographer</dc:creator></rdf:Description></rdf:RDF></x:xmpmeta>').toBuffer();

/** Inserts extra marker segments straight after the start-of-image marker. */
const withSegments = (jpeg: Buffer, ...segs: [number, Buffer][]) => Buffer.concat([jpeg.subarray(0, 2), ...segs.map(([m, body]) => Buffer.concat([Buffer.from([0xff, m, (body.length + 2) >> 8, (body.length + 2) & 255]), body])), jpeg.subarray(2)]);

describe("JPEG", () => {
  it("removes EXIF (camera, copyright, GPS location) and XMP, and leaves the picture byte-identical", async () => {
    const src = await jpegWithMetadata();
    const before = await sharp(src).metadata();
    expect(before.exif).toBeDefined(); expect(before.xmp).toBeDefined();
    expect(src.includes("Secret Photographer")).toBe(true);
    const r = stripImageMetadata(src, "image/jpeg");
    const after = await sharp(r.bytes).metadata();
    expect(after.exif).toBeUndefined(); expect(after.xmp).toBeUndefined(); expect(after.iptc).toBeUndefined();
    for (const needle of ["Secret Photographer", "ACME Camera", "GPS", "xmpmeta", "Exif"]) expect(r.bytes.includes(needle), needle).toBe(false);
    expect(r).toMatchObject({ hadExif: true, hadLocation: true, orientationKept: null });
    expect(r.removedBytes).toBe(src.length - r.bytes.length); expect(r.removedBytes).toBeGreaterThan(100);
    const a = await raw(src), b = await raw(r.bytes);                    // not re-encoded: identical pixels, identical size
    expect([b.info.width, b.info.height]).toEqual([640, 480]);
    expect(b.data.equals(a.data)).toBe(true);
  });
  it("works on progressive JPEGs too", async () => {
    const src = await jpegWithMetadata(undefined, true);
    const r = stripImageMetadata(src, "image/jpeg");
    const m = await sharp(r.bytes).metadata();
    expect(m.isProgressive).toBe(true); expect(m.exif).toBeUndefined();
    expect((await raw(r.bytes)).data.equals((await raw(src)).data)).toBe(true);
  });
  it("keeps a rotation as the ONLY tag, so a portrait photograph is still upright, with no location or camera", async () => {
    const src = await jpegWithMetadata(6);
    expect((await sharp(src).metadata()).orientation).toBe(6);
    const r = stripImageMetadata(src, "image/jpeg");
    const m = await sharp(r.bytes).metadata();
    expect(m.orientation).toBe(6); expect(r.orientationKept).toBe(6);
    expect(m.exif!.length).toBeLessThan(40);                              // just the one entry
    for (const needle of ["Secret Photographer", "ACME Camera", "GPS"]) expect(r.bytes.includes(needle)).toBe(false);
    expect((await raw(r.bytes)).data.equals((await raw(src)).data)).toBe(true);
  });
  it("keeps every rotation value 2 to 8", async () => {
    for (const o of [2, 3, 4, 5, 7, 8]) expect((await sharp(stripImageMetadata(await jpegWithMetadata(o), "image/jpeg").bytes).metadata()).orientation, `orientation ${o}`).toBe(o);
  });
  it("removes IPTC / Photoshop blocks, comments, MakerNotes-style vendor markers and a JFIF thumbnail", async () => {
    const plain = await base().jpeg().toBuffer();
    const dirty = withSegments(plain,
      [0xed, Buffer.from("Photoshop 3.0\0" + "8BIM caption: Private Client Name")], [0xfe, Buffer.from("comment: shot at the client's home")],
      [0xe5, Buffer.from("VendorNotes secret serial 12345")], [0xe1, Buffer.from("http://ns.adobe.com/xap/1.0/\0<x:xmpmeta>hidden</x:xmpmeta>")]);
    expect(dirty.includes("Private Client Name")).toBe(true);
    const r = stripImageMetadata(dirty, "image/jpeg");
    for (const needle of ["Private Client Name", "client's home", "secret serial", "hidden", "Photoshop"]) expect(r.bytes.includes(needle), needle).toBe(false);
    expect((await raw(r.bytes)).data.equals((await raw(plain)).data)).toBe(true);
  });
  it("blanks a JFIF thumbnail", () => {
    const head = Buffer.from("JFIF\0\x01\x01\x00\x00\x01\x00\x01\x02\x02", "latin1");            // thumbnail declared 2x2
    const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8]), Buffer.from([0xff, 0xe0, 0x00, head.length + 2 + 12]), head, Buffer.alloc(12, 7), Buffer.from([0xff, 0xda, 0x00, 0x02, 0x11, 0x22, 0xff, 0xd9])]);
    const r = stripImageMetadata(jpeg, "image/jpeg");
    const app0 = r.bytes.subarray(2, 20);
    expect([app0[16], app0[17]]).toEqual([0, 0]); expect(r.bytes.includes(Buffer.alloc(12, 7))).toBe(false);
  });
  it("drops anything stored after the end of the picture (appended payloads, a second picture)", async () => {
    const src = await base().jpeg().toBuffer();
    const r = stripImageMetadata(Buffer.concat([src, Buffer.from("HIDDEN PAYLOAD AFTER THE IMAGE"), src]), "image/jpeg");
    expect(r.bytes.includes("HIDDEN PAYLOAD")).toBe(false);
    expect(r.bytes.equals(src) || (await raw(r.bytes)).data.equals((await raw(src)).data)).toBe(true);
  });
  it("keeps the colour profile and the Adobe colour-transform marker", async () => {
    const src = await base().jpeg().withIccProfile("srgb").toBuffer();
    expect((await sharp(src).metadata()).icc).toBeDefined();
    const r = stripImageMetadata(src, "image/jpeg");
    expect((await sharp(r.bytes).metadata()).icc).toBeDefined();
    const adobe = Buffer.concat([Buffer.from("Adobe\0", "latin1"), Buffer.from([0x00, 0x64, 0x00, 0x00, 0x00, 0x00])]);
    const withAdobe = withSegments(await base().jpeg().toBuffer(), [0xee, adobe]);
    expect(stripImageMetadata(withAdobe, "image/jpeg").bytes.includes("Adobe")).toBe(true);
  });
  it("is idempotent", async () => {
    const once = stripImageMetadata(await jpegWithMetadata(6), "image/jpeg").bytes;
    expect(stripImageMetadata(once, "image/jpeg").bytes.equals(once)).toBe(true);
  });
  it("refuses a file that is not a complete JPEG, instead of passing it through", async () => {
    const src = await base().jpeg().toBuffer();
    const cases: Buffer[] = [Buffer.from("not an image"), src.subarray(0, 40), src.subarray(0, src.length - 2), Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe1, 0xff, 0xff]), Buffer.alloc(8)]), Buffer.from([0xff, 0xd8, 0xff, 0xd9])];
    for (const c of cases) expect(() => stripImageMetadata(c, "image/jpeg")).toThrow(MetadataStripError);
  });
});

function pngChunk(type: string, data: Buffer): Buffer {
  const head = Buffer.alloc(8); head.writeUInt32BE(data.length, 0); head.write(type, 4, "latin1");
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type, "latin1"), data])) >>> 0, 0);
  return Buffer.concat([head, data, crc]);
}
const insertPngChunks = (png: Buffer, ...chunks: Buffer[]) => Buffer.concat([png.subarray(0, 33), ...chunks, png.subarray(33)]);   // after IHDR (8 + 25 bytes)

describe("PNG", () => {
  it("removes text, time and EXIF chunks and leaves the picture identical", async () => {
    const png = await base().png().toBuffer();
    const dirty = insertPngChunks(png, pngChunk("tEXt", Buffer.from("Author\0Secret Photographer")), pngChunk("iTXt", Buffer.from("XML:com.adobe.xmp\0\0\0\0\0<x:xmpmeta>hidden</x:xmpmeta>")), pngChunk("tIME", Buffer.from([7, 234, 11, 5, 10, 0, 0])), pngChunk("zTXt", Buffer.from("Comment\0\0x")),
      pngChunk("eXIf", Buffer.concat([Buffer.from("MM\0*\0\0\0\x08\0\x01\x88\x25\0\x04\0\0\0\x01\0\0\0\x1a", "latin1"), Buffer.alloc(8)])));
    expect(dirty.includes("Secret Photographer")).toBe(true);
    const r = stripImageMetadata(dirty, "image/png");
    for (const needle of ["Secret Photographer", "xmpmeta", "tEXt", "iTXt", "tIME", "eXIf", "zTXt"]) expect(r.bytes.includes(needle), needle).toBe(false);
    expect(r).toMatchObject({ hadExif: true, hadLocation: true });
    expect((await raw(r.bytes)).data.equals((await raw(png)).data)).toBe(true);
  });
  it("keeps colour and transparency information, and drops anything after the end chunk", async () => {
    const png = await sharp({ create: { width: 40, height: 40, channels: 4, background: { r: 10, g: 20, b: 30, alpha: 0.5 } } }).png().withIccProfile("srgb").toBuffer();
    const r = stripImageMetadata(Buffer.concat([png, Buffer.from("TRAILING SECRET")]), "image/png");
    expect(r.bytes.includes("TRAILING SECRET")).toBe(false);
    const m = await sharp(r.bytes).metadata();
    expect(m).toMatchObject({ hasAlpha: true, width: 40, height: 40 });
    expect((await raw(r.bytes)).data.equals((await raw(png)).data)).toBe(true);
  });
  it("refuses a PNG that needs a rotation, with a message a person can act on", async () => {
    const png = await base().png().toBuffer();
    const rotated = insertPngChunks(png, pngChunk("eXIf", Buffer.concat([Buffer.from("MM\0*\0\0\0\x08\0\x01\x01\x12\0\x03\0\0\0\x01\0\x06\0\0\0\0\0\0", "latin1")])));
    try { stripImageMetadata(rotated, "image/png"); throw new Error("should refuse"); } catch (e) { expect(e).toBeInstanceOf(MetadataStripError); expect((e as MetadataStripError).userMessage).toMatch(/upright copy/); }
  });
  it("refuses truncated or malformed PNGs", async () => {
    const png = await base().png().toBuffer();
    for (const c of [png.subarray(0, 20), png.subarray(0, png.length - 12), Buffer.from("nope"), Buffer.concat([png.subarray(0, 8), Buffer.from("garbage garbage garbage")])]) expect(() => stripImageMetadata(c, "image/png")).toThrow(MetadataStripError);
  });
});

describe("WebP", () => {
  it("removes EXIF and XMP, clears the header flags, and leaves the picture identical", async () => {
    const src = await base().webp({ quality: 85 }).withExif({ IFD0: { Copyright: "Secret Photographer" }, ...GPS }).withXmp("<x:xmpmeta>hidden</x:xmpmeta>").toBuffer();
    const before = await sharp(src).metadata();
    expect(before.exif).toBeDefined(); expect(src.includes("Secret Photographer")).toBe(true);
    const r = stripImageMetadata(src, "image/webp");
    const m = await sharp(r.bytes).metadata();
    expect(m.exif).toBeUndefined(); expect(m.xmp).toBeUndefined();
    for (const needle of ["Secret Photographer", "hidden", "EXIF", "XMP "]) expect(r.bytes.includes(needle), needle).toBe(false);
    expect(r.bytes.readUInt32LE(4)).toBe(r.bytes.length - 8);             // the container size is still correct
    expect(r.bytes[20] & 0x0c).toBe(0);                                   // EXIF and XMP flags cleared
    expect(r).toMatchObject({ hadExif: true, hadLocation: true });
    expect((await raw(r.bytes)).data.equals((await raw(src)).data)).toBe(true);
  });
  it("leaves a plain WebP unchanged in content", async () => {
    const src = await base().webp().toBuffer();
    const r = stripImageMetadata(src, "image/webp");
    expect((await raw(r.bytes)).data.equals((await raw(src)).data)).toBe(true);
  });
  it("refuses truncated or malformed WebP files", async () => {
    const src = await base().webp().toBuffer();
    for (const c of [src.subarray(0, 15), Buffer.from("RIFF\0\0\0\0WEBPjunk"), Buffer.from("nope nope nope nope nope"), src.subarray(0, src.length - 20)]) expect(() => stripImageMetadata(c, "image/webp")).toThrow(MetadataStripError);
  });
});
