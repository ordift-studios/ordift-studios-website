"use server";

import { revalidatePath } from "next/cache";
import { actionFail, actionOk, runAction, type ActionState } from "@/lib/shared/actionState";
import { getCurrentUser, isSuperAdmin } from "@/lib/portal/roles";
import { registerControlledMaster } from "@/lib/legal/masterRegistryActions";
import { recordFounderApproval, startLegalReview } from "@/lib/legal/founderApprovalActions";
import { parseFounderApprovalForm } from "@/lib/legal/founderApproval";

// FOUNDER APPROVAL - thin FormData wrappers (LOCAL build). The signed-in user is read FIRST and must be a Super Admin; the library functions then re-check
// contract-administer authority and that the user is the active Founder. Nothing here activates, publishes, issues, signs or sends anything.
const NOT_SUPER = "Only a Super Admin can use this screen.";
const refresh = (versionId: string) => { revalidatePath(`/admin/legal/approval/${versionId}`); revalidatePath("/admin/legal"); };

export async function startReviewAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await getCurrentUser();
    if (!user || !isSuperAdmin(user)) return actionFail(NOT_SUPER);
    const versionId = String(formData.get("versionId") ?? "");
    const r = await startLegalReview({ versionId, actorUserId: user.id });
    if (!r.ok) return actionFail(r.error);
    refresh(versionId);
    return actionOk("The version is now in legal review. Nothing was approved, activated or issued.");
  }, "start legal review");
}

export async function registerMasterAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await getCurrentUser();
    if (!user || !isSuperAdmin(user)) return actionFail(NOT_SUPER);
    const versionId = String(formData.get("versionId") ?? "");
    const r = await registerControlledMaster({ versionId, actorUserId: user.id });
    if (!r.ok) return actionFail(r.error);
    refresh(versionId);
    return actionOk("The stored master was verified against its checksums, clause-checked and registered. Nothing was approved, activated or issued.");
  }, "register master");
}

export async function recordFounderApprovalAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await getCurrentUser();
    if (!user || !isSuperAdmin(user)) return actionFail(NOT_SUPER);
    const { versionId, input } = parseFounderApprovalForm(formData);
    if (!versionId) return actionFail("The version is missing.");
    const r = await recordFounderApproval({ versionId, input, actorUserId: user.id });
    if (!r.ok) return actionFail(r.errors && r.errors.length > 1 ? r.errors.join(" ") : r.error);
    refresh(versionId);
    return actionOk("Your Founder approval, on counsel's advice from the telephone consultation, is recorded with the full review record. The agreement is not activated, published or issued.");
  }, "record founder approval");
}
