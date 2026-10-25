import { createHash } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { authorizeWithSuperAdminOverride, GOVERNANCE_CAPABILITIES } from "@/lib/organization/authority";
import { extractDocxText } from "./docxText";

// Approval EVIDENCE for a legal master: stored in the legal registry's own private bucket ("legal-masters") and indexed in its existing
// provenance table (legal_suite_provenance_documents) - no new table and no manual fingerprint. The SHA-256 is computed by the server when the
// file arrives, re-checked by re-reading the stored object, and re-checked again when an attestation is made. The system never decides who
// approved a document: it can only show what the file contains where it can read it, and say plainly where it cannot.

const BUCKET = "legal-masters";
export const EVIDENCE_MAX_BYTES = 5 * 1024 * 1024; // the bucket's own limit; the Step 6 form is further limited by the server-action cap
export const EVIDENCE_TYPES: Record<string, { mime: string; label: string }> = {
  pdf: { mime: "application/pdf", label: "PDF (for example a letter, or an email or chat saved as PDF)" },
  docx: { mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", label: "Word document" },
  txt: { mime: "text/plain", label: "Plain text (for example a pasted message)" },
};

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };
const sha256 = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");
const safeName = (n: string) => n.replace(/[^A-Za-z0-9._-]+/g, "_").slice(0, 80) || "evidence";
const pathPrefix = (code: string) => `approval-evidence/${code}/`;

export type TextCheck =
  | { checked: false; reason: string }
  | { checked: true; mentionsDocument: boolean; mentionsCounsel: boolean | null; datesFound: string[] };

const MONTHS = "January|February|March|April|May|June|July|August|September|October|November|December";
// What the system can honestly report from a readable file. It never asserts that the person named is counsel or that a date is the approval date.
export function checkEvidenceText(text: string, code: string, title: string, counselName: string | null): TextCheck & { checked: true } {
  const lower = text.toLowerCase();
  const dates = new Set<string>();
  for (const m of text.matchAll(/\b(\d{4}-\d{2}-\d{2})\b/g)) dates.add(m[1]);
  for (const m of text.matchAll(new RegExp(`\\b(\\d{1,2}(?:st|nd|rd|th)?\\s+(?:${MONTHS}),?\\s+\\d{4})\\b`, "gi"))) dates.add(m[1]);
  return {
    checked: true,
    mentionsDocument: lower.includes(code.toLowerCase()) || lower.includes(title.toLowerCase()),
    mentionsCounsel: counselName && counselName.trim().length >= 3 ? lower.includes(counselName.trim().toLowerCase().split(/\s+/).slice(-1)[0]) : null,
    datesFound: [...dates].slice(0, 8),
  };
}

export function readableText(bytes: Uint8Array, ext: string): string | null {
  if (ext === "txt") { try { return new TextDecoder("utf-8", { fatal: true }).decode(bytes); } catch { return null; } }
  if (ext === "docx") return extractDocxText(bytes);
  return null; // PDFs are stored and fingerprinted but not machine-read
}

function validateFile(name: string, bytes: Uint8Array): { ok: true; ext: string; mime: string } | { ok: false; error: string } {
  const ext = name.toLowerCase().split(".").pop() ?? "";
  const t = EVIDENCE_TYPES[ext];
  if (!t) return { ok: false, error: "Only a PDF, a Word document (.docx) or a plain-text file can be stored as approval evidence. Save a chat or email as PDF, or paste its text instead." };
  if (bytes.byteLength === 0 || bytes.byteLength > EVIDENCE_MAX_BYTES) return { ok: false, error: "The file must be between 1 byte and 5 MB." };
  const head = Buffer.from(bytes.subarray(0, 4)).toString("latin1");
  if (ext === "pdf" && !head.startsWith("%PDF")) return { ok: false, error: "This file is not a valid PDF." };
  if (ext === "docx" && !head.startsWith("PK")) return { ok: false, error: "This file is not a valid Word document." };
  if (ext === "txt" && (bytes.includes(0) || readableText(bytes, "txt") === null)) return { ok: false, error: "This file is not readable plain text." };
  return { ok: true, ext, mime: t.mime };
}

export type EvidenceItem = { id: string; name: string; sha256: string; storagePath: string; storedAt: string };

async function versionCode(versionId: string): Promise<{ code: string; title: string; status: string; approvedAt: string | null } | null> {
  const admin = createAdminClient();
  const { data: v } = await admin.from("legal_document_versions").select("master_id, status, approved_at").eq("id", versionId).maybeSingle();
  if (!v) return null;
  const { data: m } = await admin.from("legal_document_masters").select("canonical_code, title").eq("id", v.master_id as string).maybeSingle();
  return m ? { code: m.canonical_code as string, title: m.title as string, status: v.status as string, approvedAt: (v.approved_at as string | null) ?? null } : null;
}

export async function listApprovalEvidence(versionId: string): Promise<EvidenceItem[]> {
  const info = await versionCode(versionId);
  if (!info) return [];
  const { data } = await createAdminClient().from("legal_suite_provenance_documents").select("id, title, sha256, storage_path, created_at").like("storage_path", `${pathPrefix(info.code)}%`).order("created_at", { ascending: false });
  return (data ?? []).map((r) => ({ id: r.id as string, name: r.title as string, sha256: (r.sha256 as string) ?? "", storagePath: r.storage_path as string, storedAt: r.created_at as string }));
}

// Stores one evidence file for ONE legal document version: validate, fingerprint, upload, read back and re-hash, then index. A file identical to
// one already stored for this document is not stored twice.
export async function storeApprovalEvidence(p: { versionId: string; filename: string; bytes: Uint8Array; description: string; counselName?: string | null; actorUserId: string }): Promise<Result<{ item: EvidenceItem; verifiedByReread: true; duplicate: boolean; sizeBytes: number; text: TextCheck }>> {
  const auth = await authorizeWithSuperAdminOverride(p.actorUserId, GOVERNANCE_CAPABILITIES.contractAdminister);
  if (!auth.ok) return { ok: false, error: "Not authorized to store legal approval evidence." };
  const info = await versionCode(p.versionId);
  if (!info) return { ok: false, error: "Legal document version not found." };
  if (!["approved", "active"].includes(info.status) || info.approvedAt) return { ok: false, error: "Approval evidence is only stored for a version recorded as approved that has no stamped approval date." };
  if (p.description.trim().length < 10) return { ok: false, error: "Describe what this file is (for example “Counsel's email of …” or “Transcript of the WhatsApp message of …”)." };
  const valid = validateFile(p.filename, p.bytes);
  if (!valid.ok) return valid;

  const hash = sha256(p.bytes);
  const existing = (await listApprovalEvidence(p.versionId)).find((e) => e.sha256 === hash);
  const text = readableText(p.bytes, valid.ext);
  const check: TextCheck = text !== null ? checkEvidenceText(text, info.code, info.title, p.counselName ?? null) : { checked: false, reason: "PDF files are stored and fingerprinted but not machine-read, so what they say is not checked by the system." };
  if (existing) return { ok: true, item: existing, verifiedByReread: true, duplicate: true, sizeBytes: p.bytes.byteLength, text: check };

  const admin = createAdminClient();
  const path = `${pathPrefix(info.code)}${hash.slice(0, 16)}-${safeName(p.filename)}`;
  const up = await admin.storage.from(BUCKET).upload(path, Buffer.from(p.bytes), { contentType: valid.mime, upsert: false });
  if (up.error) { console.error("[legal] evidence upload failed", up.error.message); return { ok: false, error: "The file could not be stored." }; }
  const back = await admin.storage.from(BUCKET).download(path);
  if (back.error || !back.data || sha256(new Uint8Array(await back.data.arrayBuffer())) !== hash) return { ok: false, error: "The stored copy did not match the uploaded file, so it was not recorded." };

  const title = `Approval evidence — ${info.code} — ${p.filename} — ${p.description.trim()}`.slice(0, 400);
  const { data, error } = await admin.from("legal_suite_provenance_documents").insert({ title, release_version: "approval-evidence", storage_path: path, sha256: hash, created_by: p.actorUserId }).select("id, created_at").single();
  if (error || !data) { console.error("[legal] evidence index failed", error?.message); return { ok: false, error: "The file was stored but could not be recorded. Nothing was attested." }; }
  return { ok: true, item: { id: data.id as string, name: title, sha256: hash, storagePath: path, storedAt: data.created_at as string }, verifiedByReread: true, duplicate: false, sizeBytes: p.bytes.byteLength, text: check };
}

// Re-reads a stored evidence file for THIS version and proves it is still the file that was fingerprinted. Used when an attestation is made.
export async function loadVerifiedEvidence(versionId: string, evidenceId: string, counselName: string | null): Promise<Result<{ item: EvidenceItem; sizeBytes: number; text: TextCheck }>> {
  const info = await versionCode(versionId);
  if (!info) return { ok: false, error: "Legal document version not found." };
  const item = (await listApprovalEvidence(versionId)).find((e) => e.id === evidenceId);
  if (!item) return { ok: false, error: "Select evidence that was stored for this document." };
  const back = await createAdminClient().storage.from(BUCKET).download(item.storagePath);
  if (back.error || !back.data) return { ok: false, error: "The stored evidence file could not be read." };
  const bytes = new Uint8Array(await back.data.arrayBuffer());
  if (sha256(bytes) !== item.sha256) return { ok: false, error: "HARD STOP: the stored evidence file no longer matches its recorded fingerprint. Nothing was attested." };
  const ext = item.storagePath.toLowerCase().split(".").pop() ?? "";
  const text = readableText(bytes, ext);
  return { ok: true, item, sizeBytes: bytes.byteLength, text: text !== null ? checkEvidenceText(text, info.code, info.title, counselName) : { checked: false, reason: "PDF files are stored and fingerprinted but not machine-read, so what they say is not checked by the system." } };
}
