"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser, isStaffOrAdmin } from "@/lib/portal/roles";
import { logActivity } from "@/lib/admin/activityLog";
import { PROJECT_REQUEST_STATUSES, type ProjectRequestStatus } from "@/lib/admin/projectRequests";

async function requireStaffOrAdmin() {
  const user = await getCurrentUser();
  if (!user || !isStaffOrAdmin(user)) {
    throw new Error("Not authorized.");
  }
  return user;
}

function entityBasePath(entityType: string): string {
  return entityType === "workshop_registration" ? "/admin/bookings" : "/admin/enquiries";
}

function isProjectRequestStatus(value: string): value is ProjectRequestStatus {
  return (PROJECT_REQUEST_STATUSES as readonly string[]).includes(value);
}

export async function decideProjectRequestAction(formData: FormData): Promise<void> {
  const user = await requireStaffOrAdmin();

  const id = String(formData.get("id") ?? "");
  const entityType = String(formData.get("entityType") ?? "");
  const entityId = String(formData.get("entityId") ?? "");
  const status = String(formData.get("status") ?? "");
  const staffResponse = String(formData.get("staffResponse") ?? "").trim();
  if (!id || !isProjectRequestStatus(status)) return;

  const supabase = await createClient();

  // staff_decision/decided_by/decided_at form a locked decision record
  // set once on the first real approve/reject transition — a later
  // move to "completed" shouldn't overwrite when/who actually decided.
  const { data: existing } = await supabase
    .from("project_requests")
    .select("staff_decision")
    .eq("id", id)
    .maybeSingle();

  const update: Record<string, unknown> = {
    status,
    staff_response: staffResponse || null,
  };
  const isFirstDecision =
    !existing?.staff_decision && (status === "approved" || status === "rejected");
  if (isFirstDecision) {
    update.staff_decision = status;
    update.decided_by = user.id;
    update.decided_at = new Date().toISOString();
  }

  const { error } = await supabase.from("project_requests").update(update).eq("id", id);
  if (error) {
    console.error("[admin] project request decide failed", error.message);
    return;
  }

  await logActivity({
    actorUserId: user.id,
    action: "project_request.decided",
    entityType,
    entityId,
    metadata: { status },
  });

  revalidatePath(`${entityBasePath(entityType)}/${entityId}`);
}
