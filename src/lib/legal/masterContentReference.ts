// Controlled content reference for an Official Master that is already stored in the private legal-masters bucket with recorded
// checksums. Nothing is copied or re-uploaded: the reference POINTS at the stored object and carries its fingerprint, so provenance
// (original package, path, hash) is preserved and any alteration is detectable.

export type StoredMaster = { code: string; version: string; docxPath: string; docxSha256: string; pdfPath: string; pdfSha256: string };

export function deriveMasterContentReference(m: StoredMaster): { contentReference: string; documentHash: string } {
  return {
    contentReference: `legal-masters:${m.docxPath}@sha256:${m.docxSha256};pdf:${m.pdfPath}@sha256:${m.pdfSha256}`,
    documentHash: m.docxSha256,
  };
}

// Compare the fingerprints re-computed from the stored objects with the ones recorded at ingestion. Any difference is a hard stop.
export function verifyStoredMaster(recorded: { docxSha256: string; pdfSha256: string }, recomputed: { docxSha256: string; pdfSha256: string }): { ok: true } | { ok: false; mismatched: ("docx" | "pdf")[] } {
  const bad: ("docx" | "pdf")[] = [];
  if (recorded.docxSha256.toLowerCase() !== recomputed.docxSha256.toLowerCase()) bad.push("docx");
  if (recorded.pdfSha256.toLowerCase() !== recomputed.pdfSha256.toLowerCase()) bad.push("pdf");
  return bad.length ? { ok: false, mismatched: bad } : { ok: true };
}
