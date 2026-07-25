"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser, isStaffOrAdmin } from "@/lib/portal/roles";
import { logActivity } from "@/lib/admin/activityLog";
import { REGISTRATION_STATUSES, PAYMENT_STATUSES } from "@/lib/admin/bookings";

async function requireStaffOrAdmin() {
  const user = await getCurrentUser();
  if (!user || !isStaffOrAdmin(user)) {
    throw new Error("Not authorized.");
  }
  return user;
}

export async function updateBookingStatusAction(formData: FormData): Promise<void> {
  const user = await requireStaffOrAdmin();

  const registrationId = String(formData.get("registrationId") ?? "");
  const registrationStatus = String(formData.get("registrationStatus") ?? "");
  const paymentStatus = String(formData.get("paymentStatus") ?? "");
  if (
    !registrationId ||
    !(REGISTRATION_STATUSES as readonly string[]).includes(registrationStatus) ||
    !(PAYMENT_STATUSES as readonly string[]).includes(paymentStatus)
  ) {
    return;
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("workshop_registrations")
    .update({ registration_status: registrationStatus, payment_status: paymentStatus })
    .eq("id", registrationId);
  if (error) {
    console.error("[admin] booking status update failed", error.message);
    return;
  }

  await logActivity({
    actorUserId: user.id,
    action: "booking.status_change",
    entityType: "workshop_registration",
    entityId: registrationId,
    metadata: { registrationStatus, paymentStatus },
  });

  revalidatePath(`/admin/bookings/${registrationId}`);
  revalidatePath("/admin/bookings");
}
