"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser, isStaffOrAdmin } from "@/lib/portal/roles";
import { hasCapability } from "@/lib/workflow/engine";
import { PAYMENT_CAPABILITIES } from "@/lib/payments/paymentPermissions";
import { logActivity } from "@/lib/admin/activityLog";
import { REGISTRATION_STATUSES, PAYMENT_STATUSES } from "@/lib/admin/bookings";
import { actionOk, actionFail, type ActionState } from "@/lib/shared/actionState";

async function requireStaffOrAdmin() {
  const user = await getCurrentUser();
  if (!user || !isStaffOrAdmin(user)) {
    throw new Error("Not authorized.");
  }
  return user;
}

// Same narrower gate as enquiries/actions.ts's setAmountDueAction — see
// that file's comment for the reasoning.
async function requireManageProjectAmount() {
  const user = await getCurrentUser();
  if (!user || !hasCapability(user, PAYMENT_CAPABILITIES, "manage_project_amount")) {
    throw new Error("Not authorized.");
  }
  return user;
}

export async function updateBookingStatusAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireStaffOrAdmin();

  const registrationId = String(formData.get("registrationId") ?? "");
  const registrationStatus = String(formData.get("registrationStatus") ?? "");
  const paymentStatus = String(formData.get("paymentStatus") ?? "");
  if (
    !registrationId ||
    !(REGISTRATION_STATUSES as readonly string[]).includes(registrationStatus) ||
    !(PAYMENT_STATUSES as readonly string[]).includes(paymentStatus)
  ) {
    return actionFail("Nothing was saved — check the details and try again.");
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("workshop_registrations")
    .update({ registration_status: registrationStatus, payment_status: paymentStatus })
    .eq("id", registrationId);
  if (error) {
    console.error("[admin] booking status update failed", error.message);
    return actionFail("Could not save your change. Please try again.");
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
  return actionOk("Updated.");
}

// Workshop Management V1, Phase B, Part 8 (2026-08-25) — check-in.
// Deliberately kept at the same staff/admin tier as
// updateBookingStatusAction just above (not narrowed to a Workshop-
// specific capability) — consistent authorization granularity for two
// adjacent fields on the same detail page. attendance_status is a
// SEPARATE column from registration_status (see migration 0047's
// comment for why) — this never touches registration_status/
// payment_status.
const ATTENDANCE_STATUSES = ["checked_in", "no_show", "cancelled"] as const;

export async function updateAttendanceStatusAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireStaffOrAdmin();

  const registrationId = String(formData.get("registrationId") ?? "");
  const attendanceStatusRaw = String(formData.get("attendanceStatus") ?? "");
  const attendanceStatus = attendanceStatusRaw === "" ? null : attendanceStatusRaw;
  if (!registrationId) return actionFail("Nothing was saved — check the details and try again.");
  if (attendanceStatus !== null && !(ATTENDANCE_STATUSES as readonly string[]).includes(attendanceStatus)) return actionFail("Nothing was saved — check the details and try again.");

  const supabase = await createClient();
  const { error } = await supabase
    .from("workshop_registrations")
    .update({ attendance_status: attendanceStatus })
    .eq("id", registrationId);
  if (error) {
    console.error("[admin] attendance status update failed", error.message);
    return actionFail("Could not save your change. Please try again.");
  }

  await logActivity({
    actorUserId: user.id,
    action: "workshop.attendance_status.changed",
    entityType: "workshop_registration",
    entityId: registrationId,
    metadata: { attendanceStatus },
  });

  revalidatePath(`/admin/bookings/${registrationId}`);
  revalidatePath("/admin/bookings");
  return actionOk("Updated.");
}

// Workshop registrations have no crm_stage-style pipeline (see
// src/lib/portal/workspace.ts), so unlike the enquiry equivalent this
// never touches any other field — just amount_due. Amount is always
// USD, matching the module's reference-currency architecture.
export async function setAmountDueAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireManageProjectAmount();

  const registrationId = String(formData.get("registrationId") ?? "");
  const amountRaw = String(formData.get("amountDue") ?? "");
  const amountDue = Number(amountRaw);
  if (!registrationId || !Number.isFinite(amountDue) || amountDue <= 0 || amountDue > 1_000_000) return actionFail("Nothing was saved — check the details and try again.");

  const roundedAmount = Math.round(amountDue * 100) / 100;
  const supabase = await createClient();
  const { error } = await supabase
    .from("workshop_registrations")
    .update({ amount_due: roundedAmount })
    .eq("id", registrationId);
  if (error) {
    console.error("[admin] booking amount_due update failed", error.message);
    return actionFail("Could not save your change. Please try again.");
  }

  await logActivity({
    actorUserId: user.id,
    action: "booking.amount_due_set",
    entityType: "workshop_registration",
    entityId: registrationId,
    metadata: { amountDue: roundedAmount },
  });

  revalidatePath(`/admin/bookings/${registrationId}`);
  revalidatePath("/admin/bookings");
  revalidatePath(`/portal/client/projects/workshop/${registrationId}/payments`);
  return actionOk("Saved.");
}
