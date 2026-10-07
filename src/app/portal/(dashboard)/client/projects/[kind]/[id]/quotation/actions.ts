"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/portal/roles";
import { acceptQuotationAsClient, getClientQuotationIdForEnquiry } from "@/lib/crewSupport/quotation";
import { actionFail, actionOk, runAction, type ActionState } from "@/lib/shared/actionState";

// Direct client acceptance. Ownership is enforced server-side (the
// signed-in user must own the enquiry) — the quotation id in the form is
// never trusted on its own.
export async function acceptQuotationAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await getCurrentUser();
  if (!user) return actionFail("Please sign in to accept this quotation.");
  const enquiryId = String(formData.get("enquiryId") ?? "");
  if (formData.get("confirm") !== "on") return actionFail("Please tick the box to confirm you accept this quotation.");
  const quotationId = await getClientQuotationIdForEnquiry(enquiryId, user.id);
  if (!quotationId) return actionFail("We couldn't find this quotation.");
  return runAction(async () => {
    const r = await acceptQuotationAsClient({ quotationId, userId: user.id });
    if (!r.ok) return actionFail(r.error);
    revalidatePath(`/portal/client/projects/enquiry/${enquiryId}/quotation`);
    revalidatePath(`/portal/client/projects/enquiry/${enquiryId}`);
    return actionOk("Thank you — your acceptance has been recorded. Ordift will be in touch with the agreement and payment details.");
  }, "client accept quotation");
}
