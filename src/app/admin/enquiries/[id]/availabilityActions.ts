"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/portal/roles";
import { runAvailabilityCheck, type AvailabilityResult } from "@/lib/bookings/availabilityService";
import { parseBookingForm } from "@/lib/bookings/form";
import { forCheck } from "@/lib/bookings/availability";

// Staff and admins. Read-only apart from the audit entry that records the check; creates no booking, hold, quotation or email.
export async function checkAvailabilityAction(formData: FormData): Promise<AvailabilityResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "You must be signed in." };
  const form = parseBookingForm(formData);
  if (!form.enquiryId) return { ok: false, error: "The enquiry is missing." };
  if (form.segmentError) return { ok: false, error: form.segmentError };
  const str = (k: string) => String(formData.get(k) ?? "").trim();
  const verification = { method: str("avMethod"), reference: str("avReference"), verifiedOn: str("avOn"), confirmedWithPerson: formData.get("avConfirm") === "on" };
  const r = await runAvailabilityCheck({ actorUserId: user.id, enquiryId: form.enquiryId, assigneeId: form.assignedProfileId, segments: forCheck(form.segments), verification });
  if (r.ok) revalidatePath(`/admin/enquiries/${form.enquiryId}`);
  return r;
}
