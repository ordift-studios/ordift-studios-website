"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser, isStaffOrAdmin } from "@/lib/portal/roles";
import { getOrCreateAttendanceRecord, recordCheckIn, recordCheckOut, recordAttendanceExplanation, type AttendanceDayType } from "@/lib/organization/attendance";

// Employee Self-Service — My Attendance (Phase B5 Step 14, 2026-09-14).
// Every action operates on the caller's OWN profileId only — never
// taken from the form — so none of these can be used to record
// attendance for someone else regardless of a tampered request body.

export type ActionState = { ok: boolean; error?: string } | null;

async function requireSelf(): Promise<{ id: string } | { error: string }> {
  const currentUser = await getCurrentUser();
  if (!currentUser || !isStaffOrAdmin(currentUser)) return { error: "Not authorized." };
  return { id: currentUser.id };
}

const DAY_TYPES: readonly AttendanceDayType[] = ["working_day", "rest_day", "public_holiday"];

export async function checkInNowAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireSelf();
  if ("error" in actor) return { ok: false, error: actor.error };

  const attendanceDate = String(formData.get("attendanceDate") ?? "");
  const dayTypeRaw = String(formData.get("dayType") ?? "working_day");
  const dayType = (DAY_TYPES as readonly string[]).includes(dayTypeRaw) ? (dayTypeRaw as AttendanceDayType) : "working_day";
  if (!attendanceDate) return { ok: false, error: "Invalid request." };

  const created = await getOrCreateAttendanceRecord({ profileId: actor.id, attendanceDate, dayType });
  if (!created.ok) return { ok: false, error: created.error };

  const result = await recordCheckIn({ profileId: actor.id, attendanceDate, timestamp: new Date().toISOString(), actorUserId: actor.id });
  if (!result.ok) return { ok: false, error: result.error };
  revalidatePath("/admin/me/attendance");
  return { ok: true };
}

export async function checkOutNowAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireSelf();
  if ("error" in actor) return { ok: false, error: actor.error };

  const attendanceDate = String(formData.get("attendanceDate") ?? "");
  if (!attendanceDate) return { ok: false, error: "Invalid request." };

  const result = await recordCheckOut({ profileId: actor.id, attendanceDate, timestamp: new Date().toISOString(), actorUserId: actor.id });
  if (!result.ok) return { ok: false, error: result.error };
  revalidatePath("/admin/me/attendance");
  return { ok: true };
}

export async function addOwnAttendanceExplanationAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireSelf();
  if ("error" in actor) return { ok: false, error: actor.error };

  const recordId = String(formData.get("recordId") ?? "");
  const explanationNotes = String(formData.get("explanationNotes") ?? "").trim();
  if (!recordId || !explanationNotes) return { ok: false, error: "Invalid request." };

  const result = await recordAttendanceExplanation({ recordId, explanationNotes, actorUserId: actor.id });
  if (!result.ok) return { ok: false, error: result.error };
  revalidatePath("/admin/me/attendance");
  return { ok: true };
}
