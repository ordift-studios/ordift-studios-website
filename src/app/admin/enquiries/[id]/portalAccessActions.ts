"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/portal/roles";
import { createClaimInvitation, releasePortalOwnership, revokeClaimInvitation } from "@/lib/portal/claimService";
import { actionFail, actionOk, runAction, type ActionState } from "@/lib/shared/actionState";

// Thin wrappers: the service re-checks who is calling (staff for invitations, Super Admin for a release) and audits every step.
export type InvitationState = null | { ok: false; error: string } | { ok: true; link: string; code: string; expiresAt: string; advice: string; reasons: string[]; level: "normal" | "elevated"; invitationText: string; codeText: string };

export async function createInvitationAction(_prev: InvitationState, formData: FormData): Promise<InvitationState> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Please sign in again." };
  const enquiryId = String(formData.get("enquiryId") ?? "");
  const r = await createClaimInvitation({ actorUserId: user.id, enquiryId, channel: String(formData.get("channel") ?? ""), note: String(formData.get("note") ?? ""), expiresInDays: Number(formData.get("expiresInDays") ?? 3) });
  if (!r.ok) return { ok: false, error: r.error };
  revalidatePath(`/admin/enquiries/${enquiryId}`);
  return { ok: true, link: r.link, code: r.code, expiresAt: r.expiresAt, advice: r.advice, reasons: r.risk.reasons, level: r.risk.level, invitationText: r.invitationText, codeText: r.codeText };
}

export async function revokeInvitationAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await getCurrentUser();
  if (!user) return actionFail("Please sign in again.");
  const enquiryId = String(formData.get("enquiryId") ?? "");
  return runAction(async () => {
    const r = await revokeClaimInvitation({ actorUserId: user.id, claimId: String(formData.get("claimId") ?? ""), reason: String(formData.get("reason") ?? "") });
    if (!r.ok) return actionFail(r.error);
    revalidatePath(`/admin/enquiries/${enquiryId}`);
    return actionOk("Invitation revoked. The link and code no longer work.");
  }, "revoke portal invitation");
}

export async function releaseOwnershipAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await getCurrentUser();
  if (!user) return actionFail("Please sign in again.");
  if (formData.get("confirm") !== "on") return actionFail("Tick the box to confirm you want to release this project from the client's account.");
  const enquiryId = String(formData.get("enquiryId") ?? "");
  return runAction(async () => {
    const r = await releasePortalOwnership({ actorUserId: user.id, enquiryId, reason: String(formData.get("reason") ?? "") });
    if (!r.ok) return actionFail(r.error);
    revalidatePath(`/admin/enquiries/${enquiryId}`);
    return actionOk("Released. The client can no longer see this project. Issue a new invitation to the right person.");
  }, "release portal ownership");
}
