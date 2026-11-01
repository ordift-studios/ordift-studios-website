import { createHash } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { logActivity } from "@/lib/admin/activityLog";
import { isSuperAdminId } from "@/lib/organization/authority";
import { detectSignatureImage, validateApprovalInput, type ApprovalInput } from "./vaultRules";

// SIGNATURE VAULT (migration 0179). A handwritten-signature image can be REGISTERED here, but registration is not permission to use it: every use needs the owner's own
// explicit approval of one exact document (bound to its SHA-256), one purpose, recipient, placement and action; the approval is single-use, expires within 72 hours and can be
// revoked. The database enforces the rules (guard triggers + the atomic consume function); this module is the only code that reads or writes the vault.
//
// NOT AN E-SIGNATURE: nothing here records, replaces or imitates an electronic-signature event, and the signature engine and agreement issuance never import this module
// (enforced by signatureVaultIsolation.test.ts). The image is never exposed by URL: it is read server-side, in memory, only after an approval has been consumed.

export const SIGNATURE_VAULT_BUCKET = "signature-vault";
type Fail = { ok: false; error: string };
const sha256 = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");
const DENIED: Fail = { ok: false, error: "Only the Super Admin who owns a signature can manage or approve its use." };

async function event(type: string, actor: string | null, assetId: string | null, approvalId: string | null, detail: Record<string, unknown>) {
  const { error } = await createAdminClient().from("signature_vault_events").insert({ event_type: type, actor_profile_id: actor, asset_id: assetId, approval_id: approvalId, detail });
  if (error) console.error("[signature vault] failed to record event", type, error.message);
  return !error;
}

// ---- register (the owner, for themself; registration grants NO permission to apply the signature)
export async function registerSignatureAsset(p: { actorUserId: string; label: string; bytes: Uint8Array }): Promise<{ ok: true; assetId: string; sha256: string } | Fail> {
  if (!(await isSuperAdminId(p.actorUserId))) return DENIED;
  const label = p.label.trim();
  if (label.length < 3 || label.length > 120) return { ok: false, error: "Give the signature a label of 3 to 120 characters." };
  const kind = detectSignatureImage(p.bytes);
  if (!kind.ok) return kind;
  const hash = sha256(p.bytes);
  const path = `assets/${p.actorUserId}/${hash}.${kind.ext}`;
  const admin = createAdminClient();
  const { error: upErr } = await admin.storage.from(SIGNATURE_VAULT_BUCKET).upload(path, Buffer.from(p.bytes), { contentType: kind.mime, upsert: false });
  if (upErr) return { ok: false, error: "The image could not be stored (it may already be registered)." };
  const { data, error } = await admin.from("signature_assets").insert({ owner_profile_id: p.actorUserId, registered_by: p.actorUserId, label, storage_path: path, file_sha256: hash, mime_type: kind.mime, size_bytes: p.bytes.length }).select("id").single();
  if (error || !data) return { ok: false, error: "The signature record could not be saved." };
  await event("asset_registered", p.actorUserId, data.id as string, null, { sha256: hash, mime: kind.mime, sizeBytes: p.bytes.length, restricted: true, automaticUse: false });
  await logActivity({ actorUserId: p.actorUserId, action: "signature_vault.asset_registered", entityType: "signature_asset", entityId: data.id as string, metadata: { sha256Prefix: hash.slice(0, 12), restricted: true, automaticUse: false } });
  return { ok: true, assetId: data.id as string, sha256: hash };
}

// ---- approve ONE use (owner only)
export async function approveSignatureUse(p: { actorUserId: string; input: ApprovalInput }): Promise<{ ok: true; approvalId: string; expiresAt: string } | Fail> {
  if (!(await isSuperAdminId(p.actorUserId))) return DENIED;
  const v = validateApprovalInput(p.input);
  if (!v.ok) return v;
  const admin = createAdminClient();
  const { data: asset } = await admin.from("signature_assets").select("id, owner_profile_id, status").eq("id", v.value.assetId).maybeSingle();
  if (!asset || asset.owner_profile_id !== p.actorUserId) return DENIED; // someone else's signature, or none: the same answer
  if (asset.status !== "active") return { ok: false, error: "That signature asset has been revoked." };
  const expiresAt = new Date(Date.now() + v.value.hours * 3600_000).toISOString();
  const { data, error } = await admin.from("signature_use_approvals").insert({
    asset_id: v.value.assetId, owner_profile_id: p.actorUserId, approved_by: p.actorUserId, document_kind: v.value.documentKind, document_reference: v.value.documentReference, document_sha256: v.value.documentSha256,
    purpose: v.value.purpose, recipient: v.value.recipient, placement: v.value.placement, action: v.value.action, expires_at: expiresAt,
  }).select("id").single();
  if (error || !data) return { ok: false, error: "The approval could not be saved." };
  await event("approval_granted", p.actorUserId, v.value.assetId, data.id as string, { documentSha256: v.value.documentSha256, documentReference: v.value.documentReference, documentKind: v.value.documentKind, recipient: v.value.recipient, placement: v.value.placement, action: v.value.action, expiresAt });
  await logActivity({ actorUserId: p.actorUserId, action: "signature_vault.approval_granted", entityType: "signature_approval", entityId: data.id as string, metadata: { documentSha256Prefix: v.value.documentSha256.slice(0, 12), documentReference: v.value.documentReference, expiresAt } });
  return { ok: true, approvalId: data.id as string, expiresAt };
}

// ---- revoke (owner only)
export async function revokeSignatureApproval(p: { actorUserId: string; approvalId: string; reason: string }): Promise<{ ok: true } | Fail> {
  if (!(await isSuperAdminId(p.actorUserId))) return DENIED;
  const reason = p.reason.trim();
  if (reason.length < 5) return { ok: false, error: "Give a reason (at least 5 characters)." };
  const admin = createAdminClient();
  const { data: a } = await admin.from("signature_use_approvals").select("id, owner_profile_id, asset_id, status").eq("id", p.approvalId).maybeSingle();
  if (!a || a.owner_profile_id !== p.actorUserId) return DENIED;
  if (a.status !== "approved") return { ok: false, error: `This approval is already ${a.status}.` };
  const { error } = await admin.from("signature_use_approvals").update({ status: "revoked", revoked_at: new Date().toISOString(), revoked_by: p.actorUserId, revoked_reason: reason }).eq("id", p.approvalId).eq("status", "approved");
  if (error) return { ok: false, error: "The approval could not be revoked." };
  await event("approval_revoked", p.actorUserId, a.asset_id as string, p.approvalId, { reason });
  await logActivity({ actorUserId: p.actorUserId, action: "signature_vault.approval_revoked", entityType: "signature_approval", entityId: p.approvalId, metadata: {} });
  return { ok: true };
}

export async function revokeSignatureAsset(p: { actorUserId: string; assetId: string; reason: string }): Promise<{ ok: true; approvalsRevoked: number } | Fail> {
  if (!(await isSuperAdminId(p.actorUserId))) return DENIED;
  const reason = p.reason.trim();
  if (reason.length < 5) return { ok: false, error: "Give a reason (at least 5 characters)." };
  const admin = createAdminClient();
  const { data: s } = await admin.from("signature_assets").select("id, owner_profile_id, status").eq("id", p.assetId).maybeSingle();
  if (!s || s.owner_profile_id !== p.actorUserId) return DENIED;
  if (s.status !== "active") return { ok: false, error: "This signature asset is already revoked." };
  const now = new Date().toISOString();
  // Open approvals first, so nothing remains usable even for an instant after the asset itself is revoked.
  const { data: open } = await admin.from("signature_use_approvals").select("id").eq("asset_id", p.assetId).eq("status", "approved");
  for (const o of open ?? []) await admin.from("signature_use_approvals").update({ status: "revoked", revoked_at: now, revoked_by: p.actorUserId, revoked_reason: `Asset revoked: ${reason}` }).eq("id", o.id as string).eq("status", "approved");
  const { error } = await admin.from("signature_assets").update({ status: "revoked", revoked_at: now, revoked_by: p.actorUserId, revoked_reason: reason }).eq("id", p.assetId).eq("status", "active");
  if (error) return { ok: false, error: "The signature asset could not be revoked." };
  await event("asset_revoked", p.actorUserId, p.assetId, null, { reason, approvalsRevoked: (open ?? []).length });
  await logActivity({ actorUserId: p.actorUserId, action: "signature_vault.asset_revoked", entityType: "signature_asset", entityId: p.assetId, metadata: { approvalsRevoked: (open ?? []).length } });
  return { ok: true, approvalsRevoked: (open ?? []).length };
}

// ---- THE GATE. A future, separately approved placement feature must call this and nothing else to obtain the image.
// 1) the unsigned document is hashed here, from its bytes; 2) the database consumes the approval atomically (owner, approved, unexpired, exact hash, active asset) or refuses;
// 3) the unsigned bytes are preserved in the private bucket BEFORE the image is released; if that fails the image is not released and the approval stays spent (re-approve).
// The image is returned in memory only (no URL), and is not logged.
export type ApprovedSignatureUse = { image: Buffer; mime: string; assetSha256: string; documentReference: string; placement: string; recipient: string; purpose: string; action: string; approvalId: string };
export async function useApprovedSignature(p: { actorUserId: string; approvalId: string; unsignedBytes: Uint8Array }): Promise<({ ok: true } & ApprovedSignatureUse) | Fail> {
  const admin = createAdminClient();
  const unsignedHash = sha256(p.unsignedBytes);
  const unsignedPath = `unsigned/${p.approvalId}/${unsignedHash}.bin`;
  const { data, error } = await admin.rpc("consume_signature_approval", { p_approval: p.approvalId, p_presented_sha256: unsignedHash, p_actor: p.actorUserId, p_unsigned_path: unsignedPath });
  const row = (Array.isArray(data) ? data[0] : data) as { asset_id: string; storage_path: string; mime_type: string; file_sha256: string; document_reference: string; placement: string; recipient: string; purpose: string; action: string } | null | undefined;
  if (error || !row) return { ok: false, error: "This signature use is not approved (it may be unapproved, used, expired, revoked, for a different document, or not yours). Nothing was applied." };
  const { error: keepErr } = await admin.storage.from(SIGNATURE_VAULT_BUCKET).upload(unsignedPath, Buffer.from(p.unsignedBytes), { contentType: "application/octet-stream", upsert: false });
  if (keepErr) {
    await event("use_aborted", p.actorUserId, row.asset_id, p.approvalId, { reason: "unsigned_copy_not_preserved" });
    return { ok: false, error: "The unsigned document could not be preserved, so the signature was not released. Approve the use again to retry." };
  }
  const { data: file, error: dlErr } = await admin.storage.from(SIGNATURE_VAULT_BUCKET).download(row.storage_path);
  if (dlErr || !file) {
    await event("use_aborted", p.actorUserId, row.asset_id, p.approvalId, { reason: "image_unreadable" });
    return { ok: false, error: "The signature image could not be read. Nothing was applied." };
  }
  const image = Buffer.from(await file.arrayBuffer());
  if (sha256(image) !== row.file_sha256) {
    await event("use_aborted", p.actorUserId, row.asset_id, p.approvalId, { reason: "image_integrity_mismatch" });
    return { ok: false, error: "The stored signature image failed its integrity check. Nothing was applied." };
  }
  await logActivity({ actorUserId: p.actorUserId, action: "signature_vault.signature_used", entityType: "signature_approval", entityId: p.approvalId, metadata: { documentSha256Prefix: unsignedHash.slice(0, 12), documentReference: row.document_reference, action: row.action } });
  return { ok: true, image, mime: row.mime_type, assetSha256: row.file_sha256, documentReference: row.document_reference, placement: row.placement, recipient: row.recipient, purpose: row.purpose, action: row.action, approvalId: p.approvalId };
}

// After the placement feature produces the signed document: preserve it and record its hash, once. The unsigned original stays preserved and the approval keeps its evidence.
export async function recordSignedResult(p: { actorUserId: string; approvalId: string; signedBytes: Uint8Array }): Promise<{ ok: true; signedSha256: string } | Fail> {
  const admin = createAdminClient();
  const { data: a } = await admin.from("signature_use_approvals").select("id, owner_profile_id, asset_id, status, signed_document_sha256").eq("id", p.approvalId).maybeSingle();
  if (!a || a.owner_profile_id !== p.actorUserId || a.status !== "used" || a.signed_document_sha256) return { ok: false, error: "A signed result can be recorded once, by the owner, for a used approval." };
  const hash = sha256(p.signedBytes);
  const { error: upErr } = await admin.storage.from(SIGNATURE_VAULT_BUCKET).upload(`signed/${p.approvalId}/${hash}.bin`, Buffer.from(p.signedBytes), { contentType: "application/octet-stream", upsert: false });
  if (upErr) return { ok: false, error: "The signed document could not be preserved." };
  const { error } = await admin.from("signature_use_approvals").update({ signed_document_sha256: hash, signed_recorded_at: new Date().toISOString() }).eq("id", p.approvalId).is("signed_document_sha256", null);
  if (error) return { ok: false, error: "The signed document hash could not be recorded." };
  await event("signed_result_recorded", p.actorUserId, a.asset_id as string, p.approvalId, { signedSha256: hash });
  await logActivity({ actorUserId: p.actorUserId, action: "signature_vault.signed_result_recorded", entityType: "signature_approval", entityId: p.approvalId, metadata: { signedSha256Prefix: hash.slice(0, 12) } });
  return { ok: true, signedSha256: hash };
}

// ---- owner's own view (never the image, never a URL)
export type OwnVaultView = {
  assets: { id: string; label: string; status: string; sha256: string; mime: string; sizeBytes: number; registeredAt: string; revokedAt: string | null }[];
  approvals: { id: string; assetId: string; status: string; documentKind: string; documentReference: string; documentSha256: string; purpose: string; recipient: string; placement: string; action: string; approvedAt: string; expiresAt: string; expired: boolean; usedAt: string | null; signedSha256: string | null }[];
};
export async function loadOwnVault(ownerUserId: string): Promise<OwnVaultView | null> {
  if (!(await isSuperAdminId(ownerUserId))) return null;
  const admin = createAdminClient();
  const [a, b] = await Promise.all([
    admin.from("signature_assets").select("id, label, status, file_sha256, mime_type, size_bytes, registered_at, revoked_at").eq("owner_profile_id", ownerUserId).order("registered_at", { ascending: false }),
    admin.from("signature_use_approvals").select("id, asset_id, status, document_kind, document_reference, document_sha256, purpose, recipient, placement, action, approved_at, expires_at, used_at, signed_document_sha256").eq("owner_profile_id", ownerUserId).order("approved_at", { ascending: false }).limit(50),
  ]);
  return {
    assets: (a.data ?? []).map((r) => ({ id: r.id as string, label: r.label as string, status: r.status as string, sha256: r.file_sha256 as string, mime: r.mime_type as string, sizeBytes: r.size_bytes as number, registeredAt: r.registered_at as string, revokedAt: (r.revoked_at as string | null) ?? null })),
    approvals: (b.data ?? []).map((r) => ({ id: r.id as string, assetId: r.asset_id as string, status: r.status as string, documentKind: r.document_kind as string, documentReference: r.document_reference as string, documentSha256: r.document_sha256 as string, purpose: r.purpose as string, recipient: r.recipient as string, placement: r.placement as string, action: r.action as string, approvedAt: r.approved_at as string, expiresAt: r.expires_at as string, expired: r.status === "approved" && Date.parse(r.expires_at as string) <= Date.now(), usedAt: (r.used_at as string | null) ?? null, signedSha256: (r.signed_document_sha256 as string | null) ?? null })),
  };
}
