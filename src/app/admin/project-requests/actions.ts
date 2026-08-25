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

  // Workshop Management V1, Phase C (2026-08-25) — a real, staff-
  // triggered decision on a genuine request row is the one reliable
  // trigger for reschedule/cancellation communication (see
  // supabase/migrations/0008_project_requests.sql — the seeded
  // 'reschedule'/'cancellation' request types). Only fires on the
  // FIRST approve/reject decision (isFirstDecision), matching the
  // decided_at/decided_by "locked once" semantics above. Never touches
  // enquiries — same scope as this action's existing entity handling.
  // Best-effort — a notification failure must never block the decision
  // itself, which has already been persisted above.
  if (isFirstDecision && entityType === "workshop_registration" && (status === "approved" || status === "rejected")) {
    try {
      const { data: requestType } = await supabase
        .from("project_requests")
        .select("request_types(label)")
        .eq("id", id)
        .maybeSingle();
      const requestTypeLabel = (requestType?.request_types as unknown as { label: string } | null)?.label ?? "Request";
      const { sendProjectRequestDecidedEmail } = await import("@/lib/workshops/registrationEmail");
      const result = await sendProjectRequestDecidedEmail({
        registrationId: entityId,
        requestTypeLabel,
        decision: status,
        staffResponse: staffResponse || null,
      });
      if (result && !result.ok) {
        console.error("[admin] project request decided email failed", id, result.error);
      }
    } catch (err) {
      console.error("[admin] project request decided email threw", id, err);
    }
  }

  revalidatePath(`${entityBasePath(entityType)}/${entityId}`);
}
