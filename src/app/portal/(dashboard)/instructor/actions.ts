"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/portal/roles";
import { updateWorkshopAttendanceAsInstructor } from "@/lib/workshops/instructorEngagements";

export type ActionState = { ok: boolean; error?: string } | null;

// Self-service only — the form never carries a profileId, and
// updateWorkshopAttendanceAsInstructor() independently re-verifies the
// caller is genuinely engaged on this specific workshop before writing
// anything (see that function's own header comment).
export async function recordWorkshopAttendanceAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Not authorized." };

  const registrationId = String(formData.get("registrationId") ?? "");
  const workshopId = String(formData.get("workshopId") ?? "");
  const attendanceStatus = String(formData.get("attendanceStatus") ?? "");
  if (!registrationId || !workshopId || (attendanceStatus !== "checked_in" && attendanceStatus !== "no_show")) {
    return { ok: false, error: "Invalid request." };
  }

  const result = await updateWorkshopAttendanceAsInstructor({
    registrationId,
    workshopId,
    attendanceStatus,
    actorUserId: user.id,
  });
  if (!result.ok) return result;

  revalidatePath("/portal/instructor");
  return { ok: true };
}
