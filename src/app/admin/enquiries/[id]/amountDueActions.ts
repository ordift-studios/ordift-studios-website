"use server";

import { revalidatePath } from "next/cache";
import { actionFail, actionOk, runAction, type ActionState } from "@/lib/shared/actionState";
import { establishAmountDue, overrideAmountDue } from "@/lib/commercial/amountDue";
import { attachQuotationToEnquiry } from "@/lib/commercial/clientQuotations";

// Enquiry-to-booking M2a — thin FormData wrappers. All authorisation lives inside the library functions (each checks the signed-in user FIRST), and every write
// goes through one database transaction. None of these actions changes a stage, sends an email, or creates a payment, obligation, receivable, invoice or booking.

const refresh = (enquiryId: string) => {
  revalidatePath(`/admin/enquiries/${enquiryId}`);
  revalidatePath("/admin/enquiries");
};

export async function establishAmountDueAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const enquiryId = String(formData.get("enquiryId") ?? "");
    const quotationId = String(formData.get("quotationId") ?? "");
    const rateRaw = String(formData.get("expectedRateToUsd") ?? "").trim();
    const effective = String(formData.get("expectedRateEffectiveFrom") ?? "").trim();
    const result = await establishAmountDue({
      enquiryId,
      quotationId,
      expectedRateToUsd: rateRaw ? Number(rateRaw) : null,
      expectedRateEffectiveFrom: effective || null,
      acknowledgeRateJump: formData.get("acknowledgeRateJump") === "on",
    });
    if (!result.ok) return actionFail(result.error);
    refresh(enquiryId);
    return actionOk(result.value.noop ? "The amount due was already established from this quotation. Nothing changed." : `Amount due established: USD ${result.value.amountDue.toFixed(2)}. No email was sent and the stage was not changed.`);
  }, "establish amount due");
}

export async function overrideAmountDueAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const enquiryId = String(formData.get("enquiryId") ?? "");
    const result = await overrideAmountDue({
      enquiryId,
      newAmountUsd: Number(String(formData.get("newAmountUsd") ?? "")),
      category: String(formData.get("category") ?? ""),
      reason: String(formData.get("reason") ?? ""),
      evidence: String(formData.get("evidence") ?? ""),
      typedReference: String(formData.get("typedReference") ?? ""),
    });
    if (!result.ok) return actionFail(result.error);
    refresh(enquiryId);
    return actionOk(`Amount due overridden to USD ${result.value.amountDue.toFixed(2)}. The before and after values are in the register.`);
  }, "override amount due");
}

export async function attachQuotationAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const enquiryId = String(formData.get("enquiryId") ?? "");
    const quotationId = String(formData.get("quotationId") ?? "");
    if (!quotationId) return actionFail("Choose a quotation to attach.");
    const result = await attachQuotationToEnquiry({ quotationId, enquiryId });
    if (!result.ok) return actionFail(result.error);
    refresh(enquiryId);
    revalidatePath(`/admin/pricing/quotations/${quotationId}`);
    return actionOk("Quotation attached to this enquiry.");
  }, "attach quotation");
}
