"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/portal/roles";
import { createStaffEnquiry, setStaffEnquiryEmailNotifications } from "@/lib/enquiry/staffIntakeService";
import { actionFail, actionOk, type ActionState } from "@/lib/shared/actionState";

// Thin wrapper for the "Record an enquiry" form: resolve the signed-in user, call the governed service (which re-checks authorisation), then open the new
// enquiry. Nothing here sends an email or creates a quotation, amount, payment or booking.
export async function createStaffEnquiryAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await getCurrentUser();
  if (!user) return actionFail("You must be signed in.");
  const str = (k: string) => String(formData.get(k) ?? "");
  const result = await createStaffEnquiry({
    actorUserId: user.id,
    input: {
      service: str("service"),
      channel: str("channel"),
      receivedAt: str("receivedAt"),
      fullName: str("fullName"),
      email: str("email"),
      phone: str("phone"),
      details: str("details"),
      allowStatusEmails: formData.get("allowStatusEmails") === "on",
    },
    contactId: str("contactId") || null,
    organisationId: str("organisationId") || null,
  });
  if (!result.ok) return actionFail(result.error);
  revalidatePath("/admin/enquiries");
  redirect(`/admin/enquiries/${result.id}`);
}

// Switch automatic client emails on or off for a staff-recorded enquiry (admin only, with a reason). Sends nothing itself.
export async function setEnquiryEmailNotificationsAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await getCurrentUser();
  if (!user) return actionFail("You must be signed in.");
  const enquiryId = String(formData.get("enquiryId") ?? "");
  if (!enquiryId) return actionFail("Missing enquiry.");
  const allow = String(formData.get("allow") ?? "") === "true";
  const result = await setStaffEnquiryEmailNotifications({ enquiryId, allow, reason: String(formData.get("reason") ?? "") });
  if (!result.ok) return actionFail(result.error);
  revalidatePath(`/admin/enquiries/${enquiryId}`);
  return actionOk(allow ? "Automatic client emails are now on for this enquiry." : "Automatic client emails are now off for this enquiry.");
}
