// Validation of an ORIGINAL e-mail file (.eml, MIME type message/rfc822) before it is stored, unaltered, in the private entity vault. Pure: no I/O.
// An original e-mail is evidence (for example the provider's confirmation of a financing plan). It is stored byte for byte (the SHA-256 of the exact bytes is the document's identity), never rewritten, never rendered,
// and only ever served as a download. This module only decides whether the bytes plausibly ARE an e-mail message; it does not interpret, execute or sanitise the content.
export const EML_MIME = "message/rfc822";
export const EML_MAX_BYTES = 10 * 1024 * 1024;

// What browsers report for a .eml file varies: "message/rfc822", an empty string, or a generic binary type. Anything else is a different file wearing a .eml name.
const ACCEPTED_REPORTED_TYPES = new Set(["", EML_MIME, "application/octet-stream", "application/eml", "application/x-eml"]);
export const isEmlFilename = (name: string): boolean => /\.eml$/i.test(name.trim());
export const reportedTypeMayBeEml = (mime: string): boolean => ACCEPTED_REPORTED_TYPES.has((mime ?? "").trim().toLowerCase());

// Header names that an ordinary message carries; at least two distinct ones must be present, one of them identifying origin or time.
const COMMON = new Set(["received", "from", "to", "date", "subject", "message-id", "mime-version", "return-path", "delivered-to", "content-type", "reply-to", "cc", "sender", "x-received", "authentication-results", "dkim-signature", "arc-seal"]);
const ORIGIN_OR_TIME = new Set(["received", "from", "date", "return-path", "message-id"]);

export type EmlCheck = { ok: true; headerCount: number; from: string | null; date: string | null; subject: string | null } | { ok: false; error: string };
export function validateEmlBytes(bytes: Uint8Array, filename: string): EmlCheck {
  if (!isEmlFilename(filename)) return { ok: false, error: "An e-mail file must have the .eml extension." };
  if (bytes.byteLength === 0 || bytes.byteLength > EML_MAX_BYTES) return { ok: false, error: "The file must be between 1 byte and 10 MB." };
  // the head of the file is read as text: a message begins with plain-text headers (a binary or image file does not)
  const head = bytes.subarray(0, Math.min(bytes.byteLength, 65536));
  for (let i = 0; i < head.length; i++) if (head[i] === 0) return { ok: false, error: "This file contains binary data where an e-mail's headers should be, so it is not a plain e-mail message." };
  const text = new TextDecoder("utf-8", { fatal: false }).decode(head).replace(/^﻿/, "");
  const firstLine = text.split(/\r?\n/, 1)[0] ?? "";
  if (/^\s*</.test(firstLine) || /^%PDF-/.test(firstLine) || /^\s*[{[]/.test(firstLine)) return { ok: false, error: "This file does not begin with e-mail headers (it looks like HTML, a PDF or JSON), so it is not stored as an e-mail." };
  // the header block ends at the first blank line; folded lines (starting with a space or tab) continue the previous header
  const lines = text.split(/\r?\n/);
  const headers = new Map<string, string>();
  let current: string | null = null, sawBlank = false;
  for (const line of lines) {
    if (line === "") { sawBlank = true; break; }
    if (/^[ \t]/.test(line)) { if (current) headers.set(current, `${headers.get(current) ?? ""} ${line.trim()}`); continue; }
    const m = /^([!-9;-~]+):[ \t]?(.*)$/.exec(line);                     // RFC 5322 field name: printable ASCII except colon
    if (!m) { if (headers.size === 0) return { ok: false, error: "The first line is not an e-mail header, so this is not an e-mail message." }; break; }
    current = m[1].toLowerCase(); if (!headers.has(current)) headers.set(current, m[2]);
  }
  if (!sawBlank && headers.size === 0) return { ok: false, error: "No e-mail headers were found." };
  const names = [...headers.keys()], common = names.filter((n) => COMMON.has(n) || n.startsWith("x-"));
  if (new Set(common).size < 2 || !names.some((n) => ORIGIN_OR_TIME.has(n))) return { ok: false, error: "The headers do not look like an e-mail message (at least two usual headers, including who it is from or when it was sent, are expected)." };
  return { ok: true, headerCount: names.length, from: headers.get("from") ?? null, date: headers.get("date") ?? null, subject: headers.get("subject") ?? null };
}
