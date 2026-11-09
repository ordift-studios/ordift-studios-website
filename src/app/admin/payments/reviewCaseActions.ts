"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/portal/roles";
import { canVerifyBankTransfers } from "@/lib/payments/bankTransferAccess";
import { resolveReviewCase } from "@/lib/payments/reviewCasesAdmin";
import { actionFail, actionOk, runAction, type ActionState } from "@/lib/shared/actionState";

// Authenticated + authorised (Super Admin or the explicit finance verification grant) + audited. The database function checks the same rule again. Nothing is deleted: a case is closed with a written resolution.
export async function resolveReviewCaseAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await getCurrentUser();
  if (!user || !(await canVerifyBankTransfers(user.id))) return actionFail("You're not authorised to resolve payment review cases.");
  const caseId = String(formData.get("caseId") ?? "");
  if (!caseId) return actionFail("Nothing was saved — the case wasn't identified.");
  return runAction(async () => {
    const r = await resolveReviewCase({ caseId, resolverId: user.id, resolution: String(formData.get("resolution") ?? ""), note: String(formData.get("note") ?? "") });
    if (!r.ok) return actionFail(r.error);
    revalidatePath("/admin/payments");
    return actionOk("Case resolved. Your resolution is recorded with your name and the time.");
  }, "resolve payment review case");
}
