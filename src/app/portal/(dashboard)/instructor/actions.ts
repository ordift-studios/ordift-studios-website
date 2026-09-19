"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/portal/roles";
import { updateWorkshopAttendanceAsInstructor } from "@/lib/workshops/instructorEngagements";
import { createAnnouncement } from "@/lib/workshops/announcements";
import { createBrief, giveFeedback } from "@/lib/workshops/briefsAndSubmissions";

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

// createAnnouncement()/createBrief()/giveFeedback() each independently
// re-verify engagement on the target workshop/submission — the same
// self-service authorization discipline as attendance above.
export async function createInstructorAnnouncementAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Not authorized." };
  const workshopId = String(formData.get("workshopId") ?? "");
  const title = String(formData.get("title") ?? "").trim();
  const message = String(formData.get("message") ?? "").trim();
  if (!workshopId) return { ok: false, error: "Invalid request." };

  const result = await createAnnouncement({ workshopId, title, message, actorUserId: user.id });
  if (!result.ok) return result;
  revalidatePath("/portal/instructor");
  return { ok: true };
}

export async function createInstructorBriefAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Not authorized." };
  const workshopId = String(formData.get("workshopId") ?? "");
  const title = String(formData.get("title") ?? "").trim();
  const instructions = String(formData.get("instructions") ?? "").trim();
  const dueAt = String(formData.get("dueAt") ?? "").trim() || null;
  if (!workshopId) return { ok: false, error: "Invalid request." };

  const result = await createBrief({ workshopId, title, instructions, dueAt, actorUserId: user.id });
  if (!result.ok) return result;
  revalidatePath("/portal/instructor");
  return { ok: true };
}

export async function giveFeedbackAsInstructorAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Not authorized." };
  const submissionId = String(formData.get("submissionId") ?? "");
  const feedbackText = String(formData.get("feedbackText") ?? "").trim();
  const status = String(formData.get("status") ?? "reviewed") as "reviewed" | "revision_requested";
  if (!submissionId || !feedbackText) return { ok: false, error: "Feedback text is required." };

  const result = await giveFeedback({ submissionId, feedbackText, status, actorUserId: user.id });
  if (!result.ok) return result;
  revalidatePath("/portal/instructor");
  return { ok: true };
}
