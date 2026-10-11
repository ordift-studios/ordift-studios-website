"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser, isSuperAdmin } from "@/lib/portal/roles";
import { hasCapability } from "@/lib/workflow/engine";
import { PAYMENT_CAPABILITIES } from "@/lib/payments/paymentPermissions";
import { isPaymentCountry } from "@/lib/payments/paymentMarket";
import { createAdminClient } from "@/lib/supabase/admin";
import { logActivity } from "@/lib/admin/activityLog";
import { actionFail, actionOk, runAction, type ActionState } from "@/lib/shared/actionState";

// Which payment market a client's Pay Now belongs to. Deliberate and Super Admin only: it decides
// whether the client is shown Direct Bank Transfer (Qatar) or the existing Ghana flow. Changing it
// moves no money and edits no payment; refused while a payment attempt is still open.
export async function setPaymentMarketAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await getCurrentUser();
  if (!user || !isSuperAdmin(user) || !hasCapability(user, PAYMENT_CAPABILITIES, "manage_project_amount")) return actionFail("Only a Super Admin can change a client's payment market.");
  const enquiryId = String(formData.get("enquiryId") ?? "");
  const raw = String(formData.get("paymentCountry") ?? "");
  const next = raw === "" ? null : raw;
  if (next !== null && !isPaymentCountry(next)) return actionFail("Choose a valid payment market.");

  return runAction(async () => {
    const admin = createAdminClient();
    const { data: enquiry } = await admin.from("enquiries").select("id, reference_number, payment_country").eq("id", enquiryId).maybeSingle();
    if (!enquiry) return actionFail("Enquiry not found.");
    if ((enquiry.payment_country ?? null) === next) return actionOk("No change.");
    // An open BANK-TRANSFER attempt is tied to a receiving account and currency, so the market can't change under it.
    const { count: openBank } = await admin.from("payments").select("id", { count: "exact", head: true }).eq("entity_type", "enquiry").eq("entity_id", enquiryId).eq("payment_method", "bank_transfer").in("status", ["pending", "awaiting_verification", "additional_info_required"]);
    if ((openBank ?? 0) > 0) return actionFail("A bank-transfer attempt is still open for this client. Resolve it before changing the payment market.");
    // An unfinished GATEWAY (Paystack) attempt is a different matter: it can't be moved or cancelled from here, and it could
    // still complete on Paystack's side. Switching the market is allowed only with an explicit acknowledgement, and the open
    // attempts are recorded in the audit entry. Nothing about them is changed.
    const { data: openGateway } = await admin.from("payments").select("id, record_id, status, payment_currency, converted_amount").eq("entity_type", "enquiry").eq("entity_id", enquiryId).eq("payment_method", "gateway").eq("status", "pending");
    if ((openGateway ?? []).length > 0 && formData.get("acknowledgeOpenGatewayAttempt") !== "on") {
      const list = (openGateway ?? []).map((p) => `${p.record_id} (${p.payment_currency} ${Number(p.converted_amount).toFixed(2)})`).join(", ");
      return actionFail(`An unfinished card/Paystack attempt exists for this client: ${list}. It is not changed by this switch and could still complete on Paystack. Tick the acknowledgement to proceed, or resolve it first in Payments.`);
    }
    const { error } = await admin.from("enquiries").update({ payment_country: next }).eq("id", enquiryId);
    if (error) return actionFail("Could not save the payment market. Please try again.");
    await logActivity({ actorUserId: user.id, action: "enquiry.payment_market_set", entityType: "enquiry", entityId: enquiryId, metadata: { reference: enquiry.reference_number, from: enquiry.payment_country ?? null, to: next, openGatewayAttemptsLeftUntouched: (openGateway ?? []).map((p) => p.record_id), note: "No payment, amount or status was changed." } });
    revalidatePath(`/admin/enquiries/${enquiryId}`);
    return actionOk(next === "QA" ? "Payment market set to Qatar. The client is offered Direct Bank Transfer once an active Qatar account, the market and a QAR rate are all in place." : next === "GH" ? "Payment market set to Ghana." : "Payment market cleared (default behaviour).");
  }, "set payment market");
}
