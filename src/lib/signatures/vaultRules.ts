// SIGNATURE VAULT - pure rules (no I/O). See supabase/migrations/0179_signature_vault.sql for the database-level enforcement of the same rules.
export const SIGNATURE_MAX_BYTES = 5 * 1024 * 1024;
export const APPROVAL_MAX_HOURS = 72;
export const APPROVAL_DEFAULT_HOURS = 24;
export const DOCUMENT_KINDS = ["agreement", "contract", "letter", "certificate", "financial", "regulatory", "other"] as const;
export type DocumentKind = (typeof DOCUMENT_KINDS)[number];

export const isSha256Hex = (s: string) => /^[0-9a-f]{64}$/.test(s);

// The image is identified by its bytes, never by a client-supplied type or file name.
export function detectSignatureImage(bytes: Uint8Array): { ok: true; mime: "image/png" | "image/jpeg"; ext: "png" | "jpg" } | { ok: false; error: string } {
  if (bytes.length === 0) return { ok: false, error: "The file is empty." };
  if (bytes.length > SIGNATURE_MAX_BYTES) return { ok: false, error: "The image is larger than 5 MB." };
  const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (png.every((b, i) => bytes[i] === b)) return { ok: true, mime: "image/png", ext: "png" };
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return { ok: true, mime: "image/jpeg", ext: "jpg" };
  return { ok: false, error: "Only a PNG or JPEG image can be registered." };
}

export type ApprovalInput = {
  assetId: string; documentKind: string; documentReference: string; documentSha256: string; purpose: string; recipient: string; placement: string; action: string; hours?: number;
};
export type CleanApproval = { assetId: string; documentKind: DocumentKind; documentReference: string; documentSha256: string; purpose: string; recipient: string; placement: string; action: string; hours: number };

// Every term must be present: an approval names the exact document, its hash, why, to whom, where on the document, and the specific action. Nothing is defaulted except the lifetime.
export function validateApprovalInput(i: ApprovalInput): { ok: true; value: CleanApproval } | { ok: false; error: string } {
  const t = (s: string) => (s ?? "").trim();
  if (!t(i.assetId)) return { ok: false, error: "Choose the signature asset." };
  if (!(DOCUMENT_KINDS as readonly string[]).includes(i.documentKind)) return { ok: false, error: "Choose the kind of document." };
  const sha = t(i.documentSha256).toLowerCase();
  if (!isSha256Hex(sha)) return { ok: false, error: "Enter the document's full SHA-256 (64 hexadecimal characters). An approval is bound to the exact document." };
  const lens: [string, string, number, number][] = [["document reference", i.documentReference, 3, 200], ["purpose of signing", i.purpose, 10, 300], ["recipient or destination", i.recipient, 3, 200], ["signature placement", i.placement, 3, 200], ["specific signing action", i.action, 3, 200]];
  for (const [label, v, min, max] of lens) if (t(v).length < min || t(v).length > max) return { ok: false, error: `The ${label} must be ${min} to ${max} characters.` };
  const hours = i.hours ?? APPROVAL_DEFAULT_HOURS;
  if (!Number.isFinite(hours) || hours <= 0 || hours > APPROVAL_MAX_HOURS) return { ok: false, error: `An approval can last at most ${APPROVAL_MAX_HOURS} hours.` };
  return { ok: true, value: { assetId: t(i.assetId), documentKind: i.documentKind as DocumentKind, documentReference: t(i.documentReference), documentSha256: sha, purpose: t(i.purpose), recipient: t(i.recipient), placement: t(i.placement), action: t(i.action), hours } };
}
