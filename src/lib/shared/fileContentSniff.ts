import { fileTypeFromBuffer } from "file-type";

// Real content/magic-byte detection (TD-030, 2026-08-14) — supplements,
// never replaces, the existing declared-Content-Type + size + auth
// checks already in place on every upload route. A file with a spoofed
// Content-Type and a matching extension previously passed those checks
// regardless of its actual content; this corroborates the declared
// type against what the file's own bytes say it is.
//
// Returns the sniffed MIME type, or null if the buffer is empty,
// malformed, or doesn't match any format file-type recognizes — the
// caller should treat null as a rejection, the same way an unmatched
// declared Content-Type already is.
export async function detectFileMimeType(buffer: Buffer): Promise<string | null> {
  if (buffer.length === 0) return null;
  const result = await fileTypeFromBuffer(buffer);
  return result?.mime ?? null;
}
