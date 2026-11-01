"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser, isSuperAdmin } from "@/lib/portal/roles";
import { approveSignatureUse, registerSignatureAsset, revokeSignatureApproval, revokeSignatureAsset } from "@/lib/signatures/vault";
import { actionFail, actionOk, runAction, type ActionState } from "@/lib/shared/actionState";

// Signature Vault: the OWNER (a Super Admin) acts for themself only. The user is always the session user - never a form field - and the library re-checks ownership.
async function owner() {
  const user = await getCurrentUser();
  return user && isSuperAdmin(user) ? user : null;
}
const DENIED = "Only a Super Admin can use the Signature Vault, and only for their own signature.";
const t = (f: FormData, k: string) => String(f.get(k) ?? "");
const refresh = () => revalidatePath("/admin/signature-vault");

export async function registerSignatureAction(_p: ActionState, f: FormData): Promise<ActionState> {
  const user = await owner();
  if (!user) return actionFail(DENIED);
  return runAction(async () => {
    const file = f.get("image");
    if (!(file instanceof File) || file.size === 0) return actionFail("Choose the signature image (PNG or JPEG).");
    if (f.get("confirm") !== "yes") return actionFail("Tick the box to confirm this is your own signature and that registering it does not approve any use.");
    const r = await registerSignatureAsset({ actorUserId: user.id, label: t(f, "label"), bytes: new Uint8Array(await file.arrayBuffer()) });
    if (!r.ok) return actionFail(r.error);
    refresh();
    return actionOk(`Registered as RESTRICTED with automatic use disabled (SHA-256 ${r.sha256.slice(0, 12)}…). Registration approves no use.`);
  }, "register signature");
}

export async function approveSignatureUseAction(_p: ActionState, f: FormData): Promise<ActionState> {
  const user = await owner();
  if (!user) return actionFail(DENIED);
  return runAction(async () => {
    const r = await approveSignatureUse({ actorUserId: user.id, input: {
      assetId: t(f, "assetId"), documentKind: t(f, "documentKind"), documentReference: t(f, "documentReference"), documentSha256: t(f, "documentSha256"),
      purpose: t(f, "purpose"), recipient: t(f, "recipient"), placement: t(f, "placement"), action: t(f, "action"), hours: Number(t(f, "hours") || 24),
    } });
    if (!r.ok) return actionFail(r.error);
    refresh();
    return actionOk(`Approved for this one document only. Single use; expires ${new Date(r.expiresAt).toUTCString()}.`);
  }, "approve signature use");
}

export async function revokeSignatureApprovalAction(_p: ActionState, f: FormData): Promise<ActionState> {
  const user = await owner();
  if (!user) return actionFail(DENIED);
  return runAction(async () => {
    const r = await revokeSignatureApproval({ actorUserId: user.id, approvalId: t(f, "approvalId"), reason: t(f, "reason") });
    if (!r.ok) return actionFail(r.error);
    refresh();
    return actionOk("Approval revoked.");
  }, "revoke signature approval");
}

export async function revokeSignatureAssetAction(_p: ActionState, f: FormData): Promise<ActionState> {
  const user = await owner();
  if (!user) return actionFail(DENIED);
  return runAction(async () => {
    const r = await revokeSignatureAsset({ actorUserId: user.id, assetId: t(f, "assetId"), reason: t(f, "reason") });
    if (!r.ok) return actionFail(r.error);
    refresh();
    return actionOk(`Signature revoked (${r.approvalsRevoked} open approval(s) revoked with it).`);
  }, "revoke signature asset");
}
