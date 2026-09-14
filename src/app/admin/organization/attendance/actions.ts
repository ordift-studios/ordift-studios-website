"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/portal/roles";
import {
  canManageAttendance,
  getOrCreateAttendanceRecord,
  recordCheckIn,
  recordCheckOut,
  reviewAttendanceException,
  type AttendanceDayType,
} from "@/lib/organization/attendance";

// Attendance workspace actions (Phase B5 Step 3, 2026-09-14). Same
// coarse authorization boundary as every other HR action in this
// engagement (Super Admin, or a holder of operations.administer) via
// canManageAttendance() — no new authorization concept.

export type ActionState = { ok: boolean; error?: string } | null;

async function requireActor(): Promise<{ id: string } | { error: string }> {
  const currentUser = await getCurrentUser();
  if (!currentUser) return { error: "Not authenticated." };
  if (!(await canManageAttendance(currentUser.id))) return { error: "Not authorized to manage attendance." };
  return { id: currentUser.id };
}

const DAY_TYPES: readonly AttendanceDayType[] = ["working_day", "rest_day", "public_holiday"];

export async function createAttendanceRecordAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireActor();
  if ("error" in actor) return { ok: false, error: actor.error };

  const profileId = String(formData.get("profileId") ?? "");
  const attendanceDate = String(formData.get("attendanceDate") ?? "");
  const dayType = String(formData.get("dayType") ?? "") as AttendanceDayType;
  const scheduledStartTime = String(formData.get("scheduledStartTime") ?? "").trim() || undefined;
  const scheduledEndTime = String(formData.get("scheduledEndTime") ?? "").trim() || undefined;

  if (!profileId || !attendanceDate || !DAY_TYPES.includes(dayType)) return { ok: false, error: "Invalid request." };

  const result = await getOrCreateAttendanceRecord({ profileId, attendanceDate, dayType, scheduledStartTime, scheduledEndTime });
  if (!result.ok) return { ok: false, error: result.error };
  revalidatePath("/admin/organization/attendance");
  return { ok: true };
}

export async function recordCheckInAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireActor();
  if ("error" in actor) return { ok: false, error: actor.error };

  const profileId = String(formData.get("profileId") ?? "");
  const attendanceDate = String(formData.get("attendanceDate") ?? "");
  const timestamp = String(formData.get("timestamp") ?? "");
  if (!profileId || !attendanceDate || !timestamp) return { ok: false, error: "Invalid request." };

  const result = await recordCheckIn({ profileId, attendanceDate, timestamp: new Date(timestamp).toISOString(), actorUserId: actor.id });
  if (!result.ok) return { ok: false, error: result.error };
  revalidatePath("/admin/organization/attendance");
  return { ok: true };
}

export async function recordCheckOutAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireActor();
  if ("error" in actor) return { ok: false, error: actor.error };

  const profileId = String(formData.get("profileId") ?? "");
  const attendanceDate = String(formData.get("attendanceDate") ?? "");
  const timestamp = String(formData.get("timestamp") ?? "");
  if (!profileId || !attendanceDate || !timestamp) return { ok: false, error: "Invalid request." };

  const result = await recordCheckOut({ profileId, attendanceDate, timestamp: new Date(timestamp).toISOString(), actorUserId: actor.id, isPastScheduledEnd: true });
  if (!result.ok) return { ok: false, error: result.error };
  revalidatePath("/admin/organization/attendance");
  return { ok: true };
}

export async function reviewAttendanceExceptionAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireActor();
  if ("error" in actor) return { ok: false, error: actor.error };

  const recordId = String(formData.get("recordId") ?? "");
  const decision = String(formData.get("decision") ?? "") as "authorized" | "unauthorized_confirmed";
  const decisionNotes = String(formData.get("decisionNotes") ?? "").trim() || undefined;
  if (!recordId || !["authorized", "unauthorized_confirmed"].includes(decision)) return { ok: false, error: "Invalid request." };

  const result = await reviewAttendanceException({ recordId, decision, decisionNotes, actorUserId: actor.id });
  if (!result.ok) return { ok: false, error: result.error };
  revalidatePath("/admin/organization/attendance");
  return { ok: true };
}
