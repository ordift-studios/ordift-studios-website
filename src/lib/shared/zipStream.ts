// Minimal STREAMING ZIP writer: STORE method only (the image bytes are copied exactly as they are - nothing is compressed or
// re-encoded), one entry at a time, so memory use stays at one network chunk however many photographs there are. Entries are
// written with a data descriptor (the CRC and size follow the data), so no entry has to be buffered or known in advance, and the
// central directory is written at the end. No Zip64: a single archive is limited to 65,535 files and under 4 GiB, which callers
// check BEFORE streaming starts (ZipLimitError).
//
// Nothing is stored anywhere: the archive exists only as the bytes flowing to the browser.

export const ZIP_MAX_ENTRIES = 5000;
export const ZIP_MAX_BYTES = 3.5 * 1024 * 1024 * 1024;

export class ZipLimitError extends Error {}

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32Update(crc: number, chunk: Uint8Array): number {
  let c = ~crc >>> 0;
  for (let i = 0; i < chunk.length; i++) c = CRC_TABLE[(c ^ chunk[i]) & 0xff] ^ (c >>> 8);
  return ~c >>> 0;
}

export type ZipEntry = {
  name: string; // path inside the archive, '/' separated, UTF-8
  modifiedAt: Date;
  // Opens the entry's bytes. Called lazily, one entry at a time.
  open: () => Promise<AsyncIterable<Uint8Array>>;
};

function dosDateTime(d: Date): { time: number; date: number } {
  const year = Math.max(1980, d.getUTCFullYear());
  return {
    time: (d.getUTCHours() << 11) | (d.getUTCMinutes() << 5) | (d.getUTCSeconds() >> 1),
    date: ((year - 1980) << 9) | ((d.getUTCMonth() + 1) << 5) | d.getUTCDate(),
  };
}

const enc = new TextEncoder();

function localHeader(nameBytes: Uint8Array, time: number, date: number): Uint8Array {
  const b = new DataView(new ArrayBuffer(30 + nameBytes.length));
  b.setUint32(0, 0x04034b50, true);
  b.setUint16(4, 20, true); // version needed
  b.setUint16(6, 0x0808, true); // bit 3: sizes/CRC follow in a data descriptor; bit 11: UTF-8 names
  b.setUint16(8, 0, true); // method 0 = stored
  b.setUint16(10, time, true);
  b.setUint16(12, date, true);
  b.setUint32(14, 0, true); // crc (in descriptor)
  b.setUint32(18, 0, true); // compressed size (in descriptor)
  b.setUint32(22, 0, true); // uncompressed size (in descriptor)
  b.setUint16(26, nameBytes.length, true);
  b.setUint16(28, 0, true);
  new Uint8Array(b.buffer).set(nameBytes, 30);
  return new Uint8Array(b.buffer);
}

function dataDescriptor(crc: number, size: number): Uint8Array {
  const b = new DataView(new ArrayBuffer(16));
  b.setUint32(0, 0x08074b50, true);
  b.setUint32(4, crc, true);
  b.setUint32(8, size, true);
  b.setUint32(12, size, true);
  return new Uint8Array(b.buffer);
}

type Done = { nameBytes: Uint8Array; crc: number; size: number; offset: number; time: number; date: number };

function centralHeader(e: Done): Uint8Array {
  const b = new DataView(new ArrayBuffer(46 + e.nameBytes.length));
  b.setUint32(0, 0x02014b50, true);
  b.setUint16(4, 20, true); // version made by
  b.setUint16(6, 20, true); // version needed
  b.setUint16(8, 0x0808, true);
  b.setUint16(10, 0, true);
  b.setUint16(12, e.time, true);
  b.setUint16(14, e.date, true);
  b.setUint32(16, e.crc, true);
  b.setUint32(20, e.size, true);
  b.setUint32(24, e.size, true);
  b.setUint16(28, e.nameBytes.length, true);
  b.setUint32(42, e.offset, true);
  new Uint8Array(b.buffer).set(e.nameBytes, 46);
  return new Uint8Array(b.buffer);
}

function endOfCentralDirectory(count: number, cdSize: number, cdOffset: number): Uint8Array {
  const b = new DataView(new ArrayBuffer(22));
  b.setUint32(0, 0x06054b50, true);
  b.setUint16(8, count, true);
  b.setUint16(10, count, true);
  b.setUint32(12, cdSize, true);
  b.setUint32(16, cdOffset, true);
  return new Uint8Array(b.buffer);
}

export async function* zipChunks(entries: ZipEntry[]): AsyncGenerator<Uint8Array> {
  if (entries.length > ZIP_MAX_ENTRIES) throw new ZipLimitError("Too many files for one archive.");
  const done: Done[] = [];
  let offset = 0;
  for (const entry of entries) {
    const nameBytes = enc.encode(entry.name);
    const { time, date } = dosDateTime(entry.modifiedAt);
    const header = localHeader(nameBytes, time, date);
    const entryOffset = offset;
    yield header;
    offset += header.length;
    let crc = 0;
    let size = 0;
    for await (const chunk of await entry.open()) {
      crc = crc32Update(crc, chunk);
      size += chunk.length;
      offset += chunk.length;
      if (offset >= 0xffffffff) throw new ZipLimitError("The archive is too large for one download.");
      yield chunk;
    }
    const desc = dataDescriptor(crc, size);
    yield desc;
    offset += desc.length;
    done.push({ nameBytes, crc, size, offset: entryOffset, time, date });
  }
  const cdOffset = offset;
  let cdSize = 0;
  for (const e of done) {
    const h = centralHeader(e);
    yield h;
    cdSize += h.length;
  }
  yield endOfCentralDirectory(done.length, cdSize, cdOffset);
}

// A web ReadableStream over the archive. Backpressure-friendly: the next chunk is produced only when the consumer asks, and a
// cancelled download (the browser closed it) stops reading the source files immediately.
export function zipStream(entries: ZipEntry[]): ReadableStream<Uint8Array> {
  const it = zipChunks(entries);
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const { value, done } = await it.next();
        if (done) controller.close();
        else controller.enqueue(value);
      } catch (error) {
        controller.error(error);
      }
    },
    async cancel() {
      await it.return(undefined);
    },
  });
}

// Safe file names inside an archive: no path separators or control characters, no leading dots, bounded length, and
// duplicates get " (2)", " (3)" ... so nothing silently overwrites another photograph.
export function safeEntryName(raw: string, fallback: string): string {
  const cleaned = raw
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/[\\/:*?"<>|]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^\.+/, "")
    .slice(0, 150)
    .trim();
  return cleaned || fallback;
}

export function uniqueEntryNames(names: string[]): string[] {
  const seen = new Map<string, number>();
  return names.map((name) => {
    const key = name.toLowerCase();
    const n = (seen.get(key) ?? 0) + 1;
    seen.set(key, n);
    if (n === 1) return name;
    const dot = name.lastIndexOf(".");
    return dot > 0 ? `${name.slice(0, dot)} (${n})${name.slice(dot)}` : `${name} (${n})`;
  });
}
