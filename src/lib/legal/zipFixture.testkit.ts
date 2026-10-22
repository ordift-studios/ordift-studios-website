import { deflateRawSync } from "node:zlib";

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
